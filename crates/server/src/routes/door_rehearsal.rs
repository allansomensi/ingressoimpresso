//! Door rehearsal (ADR 0067): the phone tells when it rehearsed, and the organizer prints a sheet
//! of sample tickets to rehearse with. Rehearsal reads never reach the server: they are not
//! scans.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::http::header::{CACHE_CONTROL, CONTENT_DISPOSITION, CONTENT_TYPE};
use axum::response::{IntoResponse, Response};
use ticket_render::{RenderJob, TicketQr, TicketToRender};
use uuid::Uuid;

use super::authorize_event;
use super::door::DoorDevice;
use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult};
use crate::state::AppState;

/// Sample tickets on the sheet.
const SHEET_TICKETS: u32 = 3;
/// Sheets one user may render per minute.
const SHEETS_PER_MINUTE: usize = 6;

/// `POST /api/door/rehearsal` (door phone): the rehearsal on this phone is done.
pub async fn done(State(state): State<AppState>, device: DoorDevice) -> ApiResult<StatusCode> {
    sqlx::query!(
        "update door_devices set rehearsed_at = now() where id = $1",
        device.id
    )
    .execute(&state.pool)
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// `GET /api/events/{id}/door/rehearsal-sheet`: an A4 PDF with sample tickets of the event's
/// design (watermark and an invalid QR, the same as the previews). Art that may not be printed
/// (ADR 0042) is left out instead of refusing the sheet: it is for testing cameras.
pub async fn sheet(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
) -> ApiResult<Response> {
    let event = authorize_event(&state.pool, &user, event_id).await?;
    if !state
        .attempt(
            &format!("rehearsal-sheet:{}", user.id),
            SHEETS_PER_MINUTE,
            std::time::Duration::from_mins(1),
        )
        .await
    {
        return Err(ApiError::TooManyRequests);
    }
    let crate::jobs::SavedDesign {
        design,
        mut art,
        mut sponsors,
        mut photos,
        mut stub_image,
    } = crate::jobs::current_design(&state, event_id).await?;
    if crate::moderation::ensure_event_printable(&state.pool, event_id)
        .await
        .is_err()
    {
        art = None;
        sponsors.clear();
        photos.clear();
        stub_image = None;
    }
    let tags = super::categories::NumberTags::load(&state.pool, event_id).await?;
    let job = RenderJob {
        tokens: event.tokens(),
        details: super::event_details(&state.pool, &event).await?,
        design,
        art,
        sponsors,
        photos,
        stub_image,
        event_name: event.name.clone(),
        tickets: (1..=SHEET_TICKETS)
            .map(|number| TicketToRender {
                qr: TicketQr::Sample { number },
                seller: None,
                category: tags.category(i32::try_from(number).unwrap_or(i32::MAX)),
                seat: tags.seat(i32::try_from(number).unwrap_or(i32::MAX)),
            })
            .collect(),
    };
    let pdf = state
        .blocking_render(move || ticket_render::home_pdf(&job))
        .await?
        .map_err(|error| ApiError::Internal(error.into()))?;
    Ok((
        [
            (CONTENT_TYPE, "application/pdf".to_owned()),
            (
                CONTENT_DISPOSITION,
                "attachment; filename=\"folha-de-ensaio.pdf\"".to_owned(),
            ),
            (CACHE_CONTROL, "no-store".to_owned()),
        ],
        pdf,
    )
        .into_response())
}
