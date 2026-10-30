//! Postponing or canceling an event (ADR 0065). Different from archiving (`status = closed`, ADR
//! 0027): archiving tidies the organizer's list after the event; postponing and canceling tell
//! the public, the sellers and the door that the event itself changed.
//!
//! A postponed event keeps its numbers, files and door links (the links follow the new end); the
//! first original start is kept, so the notice says "was on …" even after a second postponement.
//! A canceled event keeps everything too, but takes no new batches, payments or sellers' sales;
//! the door shows it and keeps reading (the organizer decides). Canceling can be undone.

use axum::Json;
use axum::extract::{Path, State};
use time::OffsetDateTime;
use uuid::Uuid;

use super::events::{short_text, validate_dates};
use super::{EventAccess, EventRow, door, event_access};
use crate::api::{CancelEventBody, EventDto, NotificationKind, PostponeEventBody};
use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult, bad_request};
use crate::state::AppState;

/// Longest reason of a postponement or a cancellation (one line on the ticket's notice).
const MAX_REASON: usize = 200;

/// Tells everyone who works on the event (its organization and its team), except who did it.
async fn notify_team(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    access: &EventAccess,
    user: &AuthUser,
    kind: NotificationKind,
    mut data: serde_json::Value,
) -> ApiResult<()> {
    // An admin helping in support mode is not named: the organization sees "the team".
    let by = if access.support {
        None
    } else {
        Some(
            sqlx::query_scalar!(
                r#"select coalesce(name, email::text) as "name!" from users where id = $1"#,
                user.id
            )
            .fetch_one(&mut **tx)
            .await?,
        )
    };
    if let Some(object) = data.as_object_mut() {
        object.insert("eventId".to_owned(), access.event.id.to_string().into());
        object.insert("eventName".to_owned(), access.event.name.clone().into());
        object.insert("by".to_owned(), by.into());
    }
    sqlx::query!(
        r#"insert into notifications (id, user_id, kind, data)
           select gen_random_uuid(), people.user_id, $3, $4
           from (select m.user_id from memberships m where m.organization_id = $1
                 union
                 select t.user_id from event_team t where t.event_id = $2 and t.user_id is not null) people
           where people.user_id <> $5"#,
        access.organization_id,
        access.event.id,
        kind.db(),
        data,
        user.id,
    )
    .execute(&mut **tx)
    .await?;
    Ok(())
}

/// `POST /api/events/{id}/postpone`: a new date (and an optional reason). The links of the door
/// follow the new end; a date back to the original one clears the postponement.
pub async fn postpone(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
    Json(body): Json<PostponeEventBody>,
) -> ApiResult<Json<EventDto>> {
    let access = event_access(&state.pool, &user, event_id).await?;
    let event = &access.event;
    event.ensure_not_canceled()?;
    validate_dates(body.starts_at, body.ends_at)?;
    let reason = short_text(body.reason, MAX_REASON, "invalid_reason")?;
    if body.starts_at == event.starts_at && body.ends_at == event.ends_at {
        return Err(bad_request(
            "same_dates",
            "the event is already on this date",
        ));
    }
    if body.ends_at <= OffsetDateTime::now_utc() {
        return Err(bad_request(
            "invalid_dates",
            "the new date has already passed",
        ));
    }
    let original = event.postponed_from_starts_at.unwrap_or(event.starts_at);
    let back_to_original = body.starts_at == original;
    let mut tx = state.pool.begin().await?;
    // An event of several days moves whole (ADR 0091): every day by the same time as the start.
    let delta = body.starts_at - event.starts_at;
    let has_days = !crate::event_days::load(&mut tx, event_id).await?.is_empty();
    let ends_at = if has_days {
        crate::event_days::shift(&mut tx, event_id, event_id, delta).await?;
        event.ends_at + delta
    } else {
        body.ends_at
    };
    let row = sqlx::query_as!(
        EventRow,
        r#"update events
           set starts_at = $2, ends_at = $3,
               postponed_from_starts_at = case when $4 then null else $5::timestamptz end,
               postponed_at = case when $4 then null else now() end,
               postpone_reason = case when $4 then null else $6 end
           where id = $1
           returning id, name, venue, starts_at, ends_at, ticket_price_cents, status, qr_tag,
                     utc_offset_minutes, address, postponed_from_starts_at, postponed_at,
                     postpone_reason, canceled_at, cancel_reason, kind, digital_only"#,
        event_id,
        body.starts_at,
        ends_at,
        back_to_original,
        original,
        reason,
    )
    .fetch_one(&mut *tx)
    .await?;
    door::extend_accesses(&mut tx, event_id, row.ends_at).await?;
    let starts_at = row
        .starts_at
        .to_offset(row.offset())
        .format(&time::format_description::well_known::Rfc3339)
        .map_err(anyhow::Error::from)?;
    notify_team(
        &mut tx,
        &access,
        &user,
        NotificationKind::EventPostponed,
        serde_json::json!({ "startsAt": starts_at, "reason": reason }),
    )
    .await?;
    tx.commit().await?;
    Ok(Json(access.dto(&state.pool, row).await?))
}

/// `POST /api/events/{id}/cancel`: the event will not happen. Canceling again only changes the
/// reason.
pub async fn cancel(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
    Json(body): Json<CancelEventBody>,
) -> ApiResult<Json<EventDto>> {
    let access = event_access(&state.pool, &user, event_id).await?;
    let reason = short_text(body.reason, MAX_REASON, "invalid_reason")?;
    let mut tx = state.pool.begin().await?;
    let row = sqlx::query_as!(
        EventRow,
        r#"update events set canceled_at = coalesce(canceled_at, now()), cancel_reason = $2
           where id = $1
           returning id, name, venue, starts_at, ends_at, ticket_price_cents, status, qr_tag,
                     utc_offset_minutes, address, postponed_from_starts_at, postponed_at,
                     postpone_reason, canceled_at, cancel_reason, kind, digital_only"#,
        event_id,
        reason,
    )
    .fetch_one(&mut *tx)
    .await?;
    if access.event.canceled_at.is_none() {
        notify_team(
            &mut tx,
            &access,
            &user,
            NotificationKind::EventCanceled,
            serde_json::json!({ "reason": reason }),
        )
        .await?;
    }
    tx.commit().await?;
    if access.event.canceled_at.is_none() {
        close_checkouts(&state, event_id).await;
    }
    Ok(Json(access.dto(&state.pool, row).await?))
}

/// Nobody pays for a canceled event through a payment page opened before it was canceled
/// (ADR 0020): its batches' open checkouts are closed at Stripe. Best effort, after the commit:
/// the event is canceled either way, and a Pix already shown may still land (the admin refunds
/// it, as `apply_session` logs).
async fn close_checkouts(state: &AppState, event_id: Uuid) {
    let batches = match sqlx::query_scalar!(
        r#"select distinct p.batch_id from payments p
           join ticket_batches b on b.id = p.batch_id
           where b.event_id = $1 and p.status = 'open'"#,
        event_id
    )
    .fetch_all(&state.pool)
    .await
    {
        Ok(batches) => batches,
        Err(error) => {
            tracing::warn!(%event_id, %error, "could not list the checkouts of a canceled event");
            return;
        }
    };
    for batch_id in batches {
        let _guard = state.batch_lock(batch_id).await;
        match super::batches::close_open_checkouts(state, batch_id).await {
            Ok(_) | Err(ApiError::Conflict("payment_pending", _)) => {}
            Err(error) => {
                tracing::warn!(%batch_id, ?error, "could not close a checkout of a canceled event");
            }
        }
    }
}

/// `POST /api/events/{id}/cancel/undo`: the event happens after all.
pub async fn undo_cancel(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
) -> ApiResult<Json<EventDto>> {
    let access = event_access(&state.pool, &user, event_id).await?;
    let row = sqlx::query_as!(
        EventRow,
        r#"update events set canceled_at = null, cancel_reason = null
           where id = $1 and canceled_at is not null
           returning id, name, venue, starts_at, ends_at, ticket_price_cents, status, qr_tag,
                     utc_offset_minutes, address, postponed_from_starts_at, postponed_at,
                     postpone_reason, canceled_at, cancel_reason, kind, digital_only"#,
        event_id,
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| {
        ApiError::Conflict("event_not_canceled", "the event is not canceled".to_owned())
    })?;
    Ok(Json(access.dto(&state.pool, row).await?))
}
