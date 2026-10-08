//! Voided ranges: blocked at the door and never printed. Undo keeps history.

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use sqlx::postgres::types::PgRange;
use time::OffsetDateTime;
use uuid::Uuid;

use super::{authorize_event, bounds, is_issued, optional_text, range};
use crate::api::{CreateVoidBody, VoidDto, VoidReason};
use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult, bad_request};
use crate::state::AppState;

struct VoidRow {
    id: Uuid,
    numbers: PgRange<i32>,
    reason: String,
    note: Option<String>,
    created_at: OffsetDateTime,
    undone_at: Option<OffsetDateTime>,
}

impl VoidRow {
    fn into_dto(self) -> ApiResult<VoidDto> {
        let (first, last) = bounds(&self.numbers)?;
        Ok(VoidDto {
            id: self.id,
            first,
            last,
            reason: VoidReason::from_db(&self.reason).ok_or_else(|| {
                ApiError::Internal(anyhow::anyhow!("unknown void reason {}", self.reason))
            })?,
            note: self.note,
            created_at: self.created_at,
            undone_at: self.undone_at,
        })
    }
}

/// `GET /api/events/{id}/voids`.
pub async fn list(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
) -> ApiResult<Json<Vec<VoidDto>>> {
    authorize_event(&state.pool, &user, event_id).await?;
    let rows = sqlx::query_as!(
        VoidRow,
        "select id, numbers, reason, note, created_at, undone_at from ticket_voids where event_id = $1 order by created_at desc",
        event_id
    )
    .fetch_all(&state.pool)
    .await?;
    rows.into_iter()
        .map(VoidRow::into_dto)
        .collect::<ApiResult<Vec<_>>>()
        .map(Json)
}

/// `POST /api/events/{id}/voids`.
pub async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
    Json(body): Json<CreateVoidBody>,
) -> ApiResult<(StatusCode, Json<VoidDto>)> {
    authorize_event(&state.pool, &user, event_id).await?;
    let numbers = range(body.first, body.last)?;
    if !is_issued(&state.pool, event_id, &numbers).await? {
        return Err(bad_request(
            "range_not_issued",
            "every number must belong to a batch",
        ));
    }
    let note = optional_text(body.note);
    if note.as_ref().is_some_and(|note| note.chars().count() > 200) {
        return Err(bad_request(
            "invalid_note",
            "note must have up to 200 characters",
        ));
    }
    let row = sqlx::query_as!(
        VoidRow,
        r#"insert into ticket_voids (id, event_id, numbers, reason, note, created_by)
           values ($1, $2, $3, $4, $5, $6)
           returning id, numbers, reason, note, created_at, undone_at"#,
        Uuid::new_v4(),
        event_id,
        numbers,
        body.reason.db(),
        note,
        user.id,
    )
    .fetch_one(&state.pool)
    .await?;
    Ok((StatusCode::CREATED, Json(row.into_dto()?)))
}

/// `POST /api/voids/{id}/undo`.
pub async fn undo(
    State(state): State<AppState>,
    user: AuthUser,
    Path(void_id): Path<Uuid>,
) -> ApiResult<Json<VoidDto>> {
    let event_id = sqlx::query_scalar!("select event_id from ticket_voids where id = $1", void_id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or(ApiError::NotFound)?;
    authorize_event(&state.pool, &user, event_id).await?;
    let row = sqlx::query_as!(
        VoidRow,
        r#"update ticket_voids set undone_at = now(), undone_by = $2 where id = $1 and undone_at is null
           returning id, numbers, reason, note, created_at, undone_at"#,
        void_id,
        user.id,
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| ApiError::Conflict("already_undone", "void was already undone".to_owned()))?;
    Ok(Json(row.into_dto()?))
}
