//! Reservations (ADR 0072): a seller holds numbers for a person until a deadline ("separei o 42
//! para a Maria até sexta"). The seller makes them on their link (through the queue of
//! `seller_sync`); the organizer sees, makes, sells and cancels them on the panel. A reservation is
//! the seller's word: it never reaches the door nor changes the QR, and an expired one frees its
//! numbers by itself (`expires_at > now()`).

use std::collections::HashMap;

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use sqlx::PgPool;
use time::UtcOffset;
use uuid::Uuid;

use super::seller_ops::{self, Actor, Reservation, ReservationRules};
use super::{EventRow, authorize_event};
use crate::api::{ReservationBody, ReservationDto};
use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult};
use crate::state::AppState;

/// The reservations of an event (or of one seller), with only the numbers they still hold: those
/// sold, returned or taken from the seller leave them, and a reservation left with none is not
/// shown. Active ones first (soonest deadline first), then the expired ones the cleanup keeps for a
/// few days (most recent first).
pub(crate) async fn load(
    pool: &PgPool,
    event_id: Uuid,
    seller_id: Option<Uuid>,
    offset: UtcOffset,
) -> ApiResult<Vec<ReservationDto>> {
    let rows = sqlx::query!(
        r#"select r.reservation_id, r.seller_id, r.ticket_number, r.holder_name, r.holder_phone,
                  r.expires_at, r.created_at, r.created_by is not null as "by_organizer!",
                  r.expires_at > now() as "active!"
           from ticket_reservations r
           where r.event_id = $1 and ($2::uuid is null or r.seller_id = $2)
             and exists(select 1 from seller_assignments a
                        join ticket_batches b on b.event_id = a.event_id and b.status = 'paid'
                                             and b.numbers @> r.ticket_number
                        where a.event_id = $1 and a.seller_id = r.seller_id and a.numbers @> r.ticket_number)
             and not exists(select 1 from ticket_voids v
                            where v.event_id = $1 and v.undone_at is null and v.numbers @> r.ticket_number)
             and not exists(select 1 from ticket_sales s
                            where s.event_id = $1 and s.ticket_number = r.ticket_number)
           order by r.expires_at > now() desc,
                    case when r.expires_at > now() then r.expires_at end,
                    r.expires_at desc, r.reservation_id, r.ticket_number"#,
        event_id,
        seller_id,
    )
    .fetch_all(pool)
    .await?;
    let mut order: Vec<Uuid> = Vec::new();
    let mut numbers: HashMap<Uuid, Vec<i32>> = HashMap::new();
    let mut first_rows = HashMap::new();
    for row in rows {
        numbers
            .entry(row.reservation_id)
            .or_default()
            .push(row.ticket_number);
        if let std::collections::hash_map::Entry::Vacant(slot) =
            first_rows.entry(row.reservation_id)
        {
            order.push(row.reservation_id);
            slot.insert(row);
        }
    }
    Ok(order
        .into_iter()
        .filter_map(|id| {
            let row = first_rows.remove(&id)?;
            let mut list = numbers.remove(&id).unwrap_or_default();
            list.sort_unstable();
            Some(ReservationDto {
                id,
                seller_id: row.seller_id,
                numbers: seller_ops::to_ranges(&list),
                holder_name: row.holder_name,
                holder_phone: row.holder_phone,
                expires_at: row.expires_at.to_offset(offset),
                created_at: row.created_at.to_offset(offset),
                active: row.active,
                by_organizer: row.by_organizer,
            })
        })
        .collect())
}

/// `GET /api/events/{id}/reservations`.
pub async fn list(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
) -> ApiResult<Json<Vec<ReservationDto>>> {
    let event = authorize_event(&state.pool, &user, event_id).await?;
    Ok(Json(
        load(&state.pool, event_id, None, event.offset()).await?,
    ))
}

/// The seller and their event, if the user may access it (404 otherwise).
async fn seller_event(
    state: &AppState,
    user: &AuthUser,
    seller_id: Uuid,
) -> ApiResult<(EventRow, bool)> {
    let row = sqlx::query!(
        "select event_id, box_office from sellers where id = $1",
        seller_id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound)?;
    let event = authorize_event(&state.pool, user, row.event_id).await?;
    Ok((event, row.box_office))
}

/// `POST /api/sellers/{id}/reservations`: all the numbers or none.
pub async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Path(seller_id): Path<Uuid>,
    Json(body): Json<ReservationBody>,
) -> ApiResult<(StatusCode, Json<ReservationDto>)> {
    let (event, box_office) = seller_event(&state, &user, seller_id).await?;
    let numbers = seller_ops::expand(&body.ranges)?;
    let (holder_name, holder_phone) = seller_ops::holder(body.holder_name, body.holder_phone)?;
    let reservation = Reservation {
        id: Uuid::new_v4(),
        holder_name,
        holder_phone,
        expires_at: body.expires_at,
    };
    let actor = Actor {
        event: event.id,
        seller: seller_id,
        user: Some(user.id),
    };
    let rules = ReservationRules {
        canceled: event.canceled_at.is_some(),
        box_office,
        ends_at: event.ends_at,
    };
    let mut tx = state.pool.begin().await?;
    seller_ops::reserve(&mut tx, actor, rules, &numbers, &reservation)
        .await?
        .into_result()?;
    tx.commit().await?;
    let created = load(&state.pool, event.id, Some(seller_id), event.offset())
        .await?
        .into_iter()
        .find(|item| item.id == reservation.id)
        .ok_or_else(|| ApiError::Internal(anyhow::anyhow!("reservation not found after insert")))?;
    Ok((StatusCode::CREATED, Json(created)))
}

/// The seller and event of a reservation (404 when it is gone or not the user's).
async fn reservation_event(
    state: &AppState,
    user: &AuthUser,
    reservation_id: Uuid,
) -> ApiResult<(EventRow, Uuid)> {
    let seller_id = sqlx::query_scalar!(
        "select seller_id from ticket_reservations where reservation_id = $1 limit 1",
        reservation_id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound)?;
    let (event, _) = seller_event(state, user, seller_id).await?;
    Ok((event, seller_id))
}

/// `POST /api/reservations/{id}/sell`: the person paid; the numbers still free become sales to
/// them (409 when none is).
pub async fn sell(
    State(state): State<AppState>,
    user: AuthUser,
    Path(reservation_id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    let (event, seller_id) = reservation_event(&state, &user, reservation_id).await?;
    let rows = sqlx::query!(
        r#"select ticket_number, holder_name, holder_phone from ticket_reservations
           where reservation_id = $1 and event_id = $2 and seller_id = $3 order by ticket_number"#,
        reservation_id,
        event.id,
        seller_id,
    )
    .fetch_all(&state.pool)
    .await?;
    let Some(first) = rows.first() else {
        return Err(ApiError::NotFound);
    };
    let (name, phone) = (first.holder_name.clone(), first.holder_phone.clone());
    let numbers: Vec<i32> = rows.iter().map(|row| row.ticket_number).collect();
    let actor = Actor {
        event: event.id,
        seller: seller_id,
        user: Some(user.id),
    };
    let mut tx = state.pool.begin().await?;
    let done = seller_ops::mark(
        &mut tx,
        actor,
        event.canceled_at.is_some(),
        &numbers,
        Some(name),
        phone,
        false,
        Some(reservation_id),
    )
    .await?;
    if done.applied == 0 {
        done.into_result()?;
        return Err(ApiError::NotFound);
    }
    // Numbers the sale could not take (sold or returned since) leave the reservation too.
    seller_ops::cancel_reservation(&mut tx, actor, reservation_id).await?;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

/// `DELETE /api/reservations/{id}`: the numbers are free again.
pub async fn cancel(
    State(state): State<AppState>,
    user: AuthUser,
    Path(reservation_id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    let (event, seller_id) = reservation_event(&state, &user, reservation_id).await?;
    let actor = Actor {
        event: event.id,
        seller: seller_id,
        user: Some(user.id),
    };
    let mut tx = state.pool.begin().await?;
    seller_ops::cancel_reservation(&mut tx, actor, reservation_id).await?;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}
