//! The moderation center (ADR 0042): images flagged by the classifier or by an admin, recent
//! uploads for a manual look, and the decision (approve, or reject: the image is never printed,
//! the organization is told and may be suspended).

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::header::{CACHE_CONTROL, CONTENT_TYPE};
use axum::http::{HeaderValue, StatusCode};
use axum::response::{IntoResponse as _, Response};
use serde::Deserialize;
use time::OffsetDateTime;
use uuid::Uuid;

use super::admin::{audit, require_admin};
use super::announcements::notify_organization;
use super::optional_text;
use crate::api::{
    ModerationAction, ModerationFlagBody, ModerationFlagDto, ModerationResolveBody,
    ModerationStatus, ModerationSummaryDto, NotificationKind, RecentArtDto,
};
use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult, bad_request};
use crate::state::AppState;

const MAX_NOTE: usize = 500;
/// Images are shown to reviewers at most this wide.
const REVIEW_WIDTH_PX: u32 = 900;

/// Filter of the flag list.
#[derive(Debug, Deserialize)]
pub struct FlagQuery {
    /// `open` (default), `approved`, `rejected` or `all`.
    #[serde(default)]
    status: Option<String>,
}

struct FlagRow {
    id: Uuid,
    blob_id: Uuid,
    organization_id: Uuid,
    organization_name: String,
    event_id: Uuid,
    event_name: String,
    uploaded_by: Option<String>,
    reasons: Vec<String>,
    details: serde_json::Value,
    score: f32,
    source: String,
    status: String,
    resolution_note: Option<String>,
    resolved_by: Option<String>,
    resolved_at: Option<OffsetDateTime>,
    created_at: OffsetDateTime,
    width_px: i32,
    height_px: i32,
}

async fn load_flags(
    state: &AppState,
    status: Option<&str>,
    id: Option<Uuid>,
) -> ApiResult<Vec<ModerationFlagDto>> {
    let rows = sqlx::query_as!(
        FlagRow,
        r#"select f.id, f.blob_id, f.organization_id, o.name as organization_name, f.event_id,
                  e.name as event_name, up.email::text as "uploaded_by?", f.reasons, f.details,
                  f.score, f.source, f.status, f.resolution_note, rb.email::text as "resolved_by?",
                  f.resolved_at, f.created_at, b.width_px, b.height_px
           from moderation_flags f
           join blobs b on b.id = f.blob_id
           join organizations o on o.id = f.organization_id
           join events e on e.id = f.event_id
           left join users up on up.id = b.uploaded_by
           left join users rb on rb.id = f.resolved_by
           where ($1::text is null or f.status = $1) and ($2::uuid is null or f.id = $2)
           order by (f.status = 'open') desc, f.score desc, f.created_at desc limit 200"#,
        status,
        id,
    )
    .fetch_all(&state.pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|row| ModerationFlagDto {
            id: row.id,
            art_id: row.blob_id,
            organization_id: row.organization_id,
            organization_name: row.organization_name,
            event_id: row.event_id,
            event_name: row.event_name,
            uploaded_by: row.uploaded_by,
            reasons: row.reasons,
            details: row.details,
            score: row.score,
            source: row.source,
            status: ModerationStatus::from_db(&row.status).unwrap_or(ModerationStatus::Open),
            resolution_note: row.resolution_note,
            resolved_by: row.resolved_by,
            resolved_at: row.resolved_at,
            created_at: row.created_at,
            width_px: row.width_px,
            height_px: row.height_px,
        })
        .collect())
}

/// `GET /api/admin/moderation?status=`.
pub async fn flags(
    State(state): State<AppState>,
    user: AuthUser,
    Query(query): Query<FlagQuery>,
) -> ApiResult<Json<Vec<ModerationFlagDto>>> {
    require_admin(&user)?;
    let status = match query.status.as_deref() {
        None | Some("" | "open") => Some("open"),
        Some("all") => None,
        Some(other) if ModerationStatus::from_db(other).is_some() => Some(other),
        Some(_) => return Err(bad_request("invalid_input", "unknown status")),
    };
    Ok(Json(load_flags(&state, status, None).await?))
}

/// `GET /api/admin/moderation/summary`: open flags (the admin menu shows the count).
pub async fn summary(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<ModerationSummaryDto>> {
    require_admin(&user)?;
    let open = sqlx::query_scalar!(
        r#"select count(*) as "count!" from moderation_flags where status = 'open'"#
    )
    .fetch_one(&state.pool)
    .await?;
    let used_today =
        sqlx::query_scalar!("select requests from moderation_usage where day = current_date")
            .fetch_optional(&state.pool)
            .await?
            .unwrap_or(0);
    Ok(Json(ModerationSummaryDto {
        open,
        classifier: state.classifier.is_some(),
        used_today,
        daily_limit: state.config.moderation_daily_limit,
    }))
}

/// `GET /api/admin/moderation/recent`: the latest uploads, for a manual look.
pub async fn recent(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<Vec<RecentArtDto>>> {
    require_admin(&user)?;
    let rows = sqlx::query!(
        r#"select b.id, e.organization_id, o.name as organization_name, b.event_id,
                  e.name as event_name, b.moderation_status, b.created_at
           from blobs b join events e on e.id = b.event_id join organizations o on o.id = e.organization_id
           order by b.created_at desc limit 60"#
    )
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(
        rows.into_iter()
            .map(|row| RecentArtDto {
                art_id: row.id,
                organization_id: row.organization_id,
                organization_name: row.organization_name,
                event_id: row.event_id,
                event_name: row.event_name,
                moderation: row.moderation_status,
                created_at: row.created_at,
            })
            .collect(),
    ))
}

/// `GET /api/admin/moderation/arts/{id}`: the image, scaled down, never cached by the browser.
pub async fn art(
    State(state): State<AppState>,
    user: AuthUser,
    Path(blob_id): Path<Uuid>,
) -> ApiResult<Response> {
    require_admin(&user)?;
    let data = sqlx::query_scalar!("select data from blobs where id = $1", blob_id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or(ApiError::NotFound)?;
    let _permit = state
        .render_permits
        .clone()
        .acquire_owned()
        .await
        .map_err(anyhow::Error::from)?;
    let jpeg =
        tokio::task::spawn_blocking(move || super::events::shrink_to_jpeg(&data, REVIEW_WIDTH_PX))
            .await
            .map_err(anyhow::Error::from)?
            .map_err(anyhow::Error::from)?;
    Ok((
        [
            (CONTENT_TYPE, HeaderValue::from_static("image/jpeg")),
            (CACHE_CONTROL, HeaderValue::from_static("no-store")),
        ],
        jpeg,
    )
        .into_response())
}

fn checked_note(note: Option<String>) -> ApiResult<Option<String>> {
    let note = optional_text(note);
    if note
        .as_ref()
        .is_some_and(|note| note.chars().count() > MAX_NOTE)
    {
        return Err(bad_request("invalid_note", "note up to 500 characters"));
    }
    Ok(note)
}

/// `POST /api/admin/moderation/arts/{id}/flag`: an admin flags an image by hand.
pub async fn flag(
    State(state): State<AppState>,
    user: AuthUser,
    Path(blob_id): Path<Uuid>,
    Json(body): Json<ModerationFlagBody>,
) -> ApiResult<(StatusCode, Json<ModerationFlagDto>)> {
    require_admin(&user)?;
    let note = checked_note(body.note)?;
    let mut tx = state.pool.begin().await?;
    let blob = sqlx::query!(
        "select b.event_id, e.organization_id from blobs b join events e on e.id = b.event_id where b.id = $1",
        blob_id
    )
    .fetch_optional(&mut *tx)
    .await?
    .ok_or(ApiError::NotFound)?;
    let id = sqlx::query_scalar!(
        r#"insert into moderation_flags (id, blob_id, organization_id, event_id, reasons, details, score, source)
           values ($1, $2, $3, $4, array['manual'], jsonb_build_object('note', $5::text), 1, 'manual')
           on conflict (blob_id) where status = 'open' do update set details = moderation_flags.details
           returning id"#,
        Uuid::new_v4(),
        blob_id,
        blob.organization_id,
        blob.event_id,
        note,
    )
    .fetch_one(&mut *tx)
    .await?;
    sqlx::query!(
        "update blobs set moderation_status = 'flagged' where id = $1 and moderation_status <> 'rejected'",
        blob_id
    )
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    audit(
        &state,
        &user,
        "moderation_flag",
        Some(blob.organization_id),
        Some(blob.event_id),
        Some(blob_id),
        serde_json::json!({ "note": note }),
    )
    .await?;
    let flag = load_flags(&state, None, Some(id))
        .await?
        .into_iter()
        .next()
        .ok_or(ApiError::NotFound)?;
    Ok((StatusCode::CREATED, Json(flag)))
}

/// `POST /api/admin/moderation/{id}/resolve`: approve (the image prints again) or reject (it
/// never prints; the organization is told and may be suspended).
pub async fn resolve(
    State(state): State<AppState>,
    user: AuthUser,
    Path(flag_id): Path<Uuid>,
    Json(body): Json<ModerationResolveBody>,
) -> ApiResult<Json<ModerationFlagDto>> {
    require_admin(&user)?;
    let note = checked_note(body.note)?;
    let mut tx = state.pool.begin().await?;
    let flag = sqlx::query!(
        r#"select f.blob_id, f.organization_id, f.event_id, f.status, e.name as event_name
           from moderation_flags f join events e on e.id = f.event_id
           where f.id = $1 for update of f"#,
        flag_id
    )
    .fetch_optional(&mut *tx)
    .await?
    .ok_or(ApiError::NotFound)?;
    if flag.status != "open" {
        return Err(ApiError::Conflict(
            "flag_already_resolved",
            "this flag was already decided".to_owned(),
        ));
    }
    let (status, art_status, kind) = match body.action {
        ModerationAction::Approve => ("approved", "approved", NotificationKind::ArtApproved),
        ModerationAction::Reject => ("rejected", "rejected", NotificationKind::ArtRejected),
    };
    sqlx::query!(
        r#"update moderation_flags set status = $2, resolution_note = $3, resolved_by = $4, resolved_at = now()
           where id = $1"#,
        flag_id,
        status,
        note,
        user.id,
    )
    .execute(&mut *tx)
    .await?;
    sqlx::query!(
        "update blobs set moderation_status = $2 where id = $1",
        flag.blob_id,
        art_status
    )
    .execute(&mut *tx)
    .await?;
    if body.action == ModerationAction::Reject {
        // Remembered by hash, so the decision outlives the upload, the event and the account.
        sqlx::query!(
            r#"insert into rejected_art (sha256, rejected_by)
               select sha256, $2 from blobs where id = $1 on conflict do nothing"#,
            flag.blob_id,
            user.id,
        )
        .execute(&mut *tx)
        .await?;
    }
    if body.notify {
        notify_organization(
            &mut *tx,
            flag.organization_id,
            kind,
            serde_json::json!({ "eventId": flag.event_id, "eventName": flag.event_name, "note": note }),
        )
        .await?;
    }
    let suspend = body.suspend && body.action == ModerationAction::Reject;
    if suspend {
        sqlx::query!(
            r#"update organizations set suspended_at = coalesce(suspended_at, now()),
                      suspended_reason = coalesce(suspended_reason, 'Imagem enviada fora dos Termos de Uso')
               where id = $1"#,
            flag.organization_id
        )
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    audit(
        &state,
        &user,
        if body.action == ModerationAction::Approve {
            "moderation_approve"
        } else {
            "moderation_reject"
        },
        Some(flag.organization_id),
        Some(flag.event_id),
        Some(flag.blob_id),
        serde_json::json!({ "note": note, "notified": body.notify, "suspended": suspend }),
    )
    .await?;
    load_flags(&state, None, Some(flag_id))
        .await?
        .into_iter()
        .next()
        .map(Json)
        .ok_or(ApiError::NotFound)
}

/// `POST /api/admin/moderation/arts/{id}/rescan`: classifies an image again (it must not have
/// a decision yet).
pub async fn rescan(
    State(state): State<AppState>,
    user: AuthUser,
    Path(blob_id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    require_admin(&user)?;
    if state.classifier.is_none() {
        return Err(ApiError::Unavailable("classifier_unavailable"));
    }
    let reset = sqlx::query!(
        "update blobs set moderation_status = 'unchecked' where id = $1 and moderation_status in ('unchecked', 'clean')",
        blob_id
    )
    .execute(&state.pool)
    .await?
    .rows_affected();
    if reset == 0 {
        return Err(ApiError::Conflict(
            "art_already_reviewed",
            "the image is under review or already decided".to_owned(),
        ));
    }
    crate::moderation::check_art(&state, blob_id).await;
    audit(
        &state,
        &user,
        "moderation_rescan",
        None,
        None,
        Some(blob_id),
        serde_json::json!({}),
    )
    .await?;
    Ok(StatusCode::NO_CONTENT)
}
