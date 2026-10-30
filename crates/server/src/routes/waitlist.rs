//! The waiting list of a sold-out event (ADR 0124): people leave their name and WhatsApp on the
//! public page, and the organization sees them in Digitais, to send a ticket when a place opens
//! or to know whether another batch is worth it. Only a sold-out category (or a sold-out event)
//! takes names; the same WhatsApp in the same category updates its line.

use axum::Json;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use time::OffsetDateTime;
use uuid::Uuid;

use super::{authorize_event, event_access};
use crate::api::{
    JoinWaitlistBody, JoinedWaitlistDto, UpdateWaitlistEntryBody, WaitlistDto, WaitlistEntryDto,
};
use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult, bad_request};
use crate::ratelimit;
use crate::state::AppState;

/// People one event's list may hold: far more than any sold-out show, few enough to stop a flood.
const MAX_ENTRIES: i64 = 2000;
const MAX_NAME: usize = 80;
const MAX_QUANTITY: i16 = 10;

/// `POST /api/public/events/{slug}/waitlist` (no login, limited per address).
pub async fn join(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(slug): Path<String>,
    Json(body): Json<JoinWaitlistBody>,
) -> ApiResult<(StatusCode, Json<JoinedWaitlistDto>)> {
    ratelimit::by_ip(&state, &headers, ratelimit::WAITLIST).await?;
    let slug = super::public_page::clean_slug(&slug).map_err(|_| ApiError::NotFound)?;
    let event = sqlx::query!(
        r#"select e.id, e.public_sold_out, e.public_waitlist, e.canceled_at, e.ends_at,
                  o.suspended_at is not null as "suspended!"
           from events e join organizations o on o.id = e.organization_id
           where e.public_slug = $1 and e.public_page"#,
        slug
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound)?;
    if event.suspended {
        return Err(ApiError::NotFound);
    }
    // A robot fills every field; people never see this one. It is told nothing.
    if body
        .website
        .as_deref()
        .is_some_and(|value| !value.trim().is_empty())
    {
        return Ok((StatusCode::CREATED, Json(JoinedWaitlistDto { position: 1 })));
    }
    if !event.public_waitlist
        || event.canceled_at.is_some()
        || event.ends_at <= OffsetDateTime::now_utc()
    {
        return Err(ApiError::Conflict(
            "waitlist_closed",
            "this event takes no names".to_owned(),
        ));
    }
    let name = super::events::short_text(Some(body.name), MAX_NAME, "invalid_holder_name")?
        .ok_or_else(|| bad_request("invalid_holder_name", "who is waiting?"))?;
    let phone = super::organization::normalize_whatsapp(Some(body.phone))?
        .ok_or_else(|| bad_request("invalid_whatsapp", "a phone number with area code"))?;
    if !(1..=MAX_QUANTITY).contains(&body.quantity) {
        return Err(bad_request(
            "invalid_ticket_quantity",
            format!("1 to {MAX_QUANTITY} tickets"),
        ));
    }
    // Only what is sold out takes names: while tickets remain, the page says where to buy.
    ensure_sold_out(&state, event.id, event.public_sold_out, body.category_id).await?;
    let count = sqlx::query_scalar!(
        r#"select count(*) as "count!" from waitlist_entries where event_id = $1"#,
        event.id
    )
    .fetch_one(&state.pool)
    .await?;
    if count >= MAX_ENTRIES {
        return Err(ApiError::Conflict(
            "waitlist_full",
            "the waiting list is full".to_owned(),
        ));
    }
    let entry = sqlx::query!(
        r#"insert into waitlist_entries (id, event_id, category_id, name, phone, quantity)
           values ($1, $2, $3, $4, $5, $6)
           on conflict (event_id, phone, coalesce(category_id, '00000000-0000-0000-0000-000000000000'::uuid))
           do update set name = excluded.name, quantity = excluded.quantity, done_at = null
           returning id, created_at"#,
        Uuid::new_v4(),
        event.id,
        body.category_id,
        name,
        phone,
        body.quantity,
    )
    .fetch_one(&state.pool)
    .await?;
    let position = sqlx::query_scalar!(
        r#"select count(*)::int4 as "position!" from waitlist_entries
           where event_id = $1 and done_at is null and category_id is not distinct from $2
             and (created_at, id) <= ($3, $4)"#,
        event.id,
        body.category_id,
        entry.created_at,
        entry.id,
    )
    .fetch_one(&state.pool)
    .await?;
    Ok((StatusCode::CREATED, Json(JoinedWaitlistDto { position })))
}

/// Refuses a waiting list for `category` (`None`: the event) while it still has tickets.
async fn ensure_sold_out(
    state: &AppState,
    event_id: Uuid,
    marked_sold_out: bool,
    category: Option<Uuid>,
) -> ApiResult<()> {
    let (event_sold_out, by_category) = super::public_page::availability(state, event_id).await?;
    let sold_out = marked_sold_out || event_sold_out;
    match category {
        Some(id) => match by_category.get(&id) {
            Some(category_sold_out) if *category_sold_out || sold_out => Ok(()),
            Some(_) => Err(ApiError::Conflict(
                "waitlist_not_sold_out",
                "this category still has tickets".to_owned(),
            )),
            None => Err(ApiError::NotFound),
        },
        None if !by_category.is_empty() && !sold_out => {
            Err(bad_request("invalid_category", "choose a category"))
        }
        None if !sold_out => Err(ApiError::Conflict(
            "waitlist_not_sold_out",
            "the event still has tickets".to_owned(),
        )),
        None => Ok(()),
    }
}

/// `GET /api/events/{id}/waitlist`: everyone on the list, waiting first. The phones are for who
/// delivers tickets (ADR 0055), like the digital tickets' own.
pub async fn list(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
) -> ApiResult<Json<WaitlistDto>> {
    let access = event_access(&state.pool, &user, event_id).await?;
    let delivers = access.can(crate::api::TeamArea::Delivery);
    let settings = sqlx::query!(
        "select public_page, public_waitlist from events where id = $1",
        event_id
    )
    .fetch_one(&state.pool)
    .await?;
    let entries = sqlx::query_as!(
        WaitlistEntryDto,
        r#"select id, category_id, name, phone, quantity, created_at, done_at
           from waitlist_entries where event_id = $1
           order by done_at is not null, created_at, id"#,
        event_id
    )
    .fetch_all(&state.pool)
    .await?
    .into_iter()
    .map(|mut entry| {
        if !delivers {
            entry.phone = String::new();
        }
        entry
    })
    .collect();
    Ok(Json(WaitlistDto {
        open: settings.public_page && settings.public_waitlist,
        enabled: settings.public_waitlist,
        entries,
    }))
}

async fn entry_event(state: &AppState, entry_id: Uuid) -> ApiResult<Uuid> {
    sqlx::query_scalar!(
        "select event_id from waitlist_entries where id = $1",
        entry_id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound)
}

/// `PUT /api/waitlist-entries/{id}`: taken care of, or back on the list.
pub async fn update(
    State(state): State<AppState>,
    user: AuthUser,
    Path(entry_id): Path<Uuid>,
    Json(body): Json<UpdateWaitlistEntryBody>,
) -> ApiResult<StatusCode> {
    let event_id = entry_event(&state, entry_id).await?;
    authorize_event(&state.pool, &user, event_id).await?;
    sqlx::query!(
        r#"update waitlist_entries set done_at = case when $2 then coalesce(done_at, now()) end
           where id = $1"#,
        entry_id,
        body.done,
    )
    .execute(&state.pool)
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// `DELETE /api/waitlist-entries/{id}`.
pub async fn remove(
    State(state): State<AppState>,
    user: AuthUser,
    Path(entry_id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    let event_id = entry_event(&state, entry_id).await?;
    authorize_event(&state.pool, &user, event_id).await?;
    sqlx::query!("delete from waitlist_entries where id = $1", entry_id)
        .execute(&state.pool)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}
