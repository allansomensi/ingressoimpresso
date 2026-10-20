//! The queue of the seller's page (ADR 0074): every change made on the link (sales, undoing them,
//! reservations) goes through `POST /api/seller/sync`, whether it was made a second ago or hours
//! before without signal. Each change carries an id created on the phone; the answer to an id is
//! kept, so a change sent twice (an answer lost on a bad connection, a phone that reconnects twice)
//! is done once and answered the same. Each change is checked against the numbers as they are now
//! and leaves out, with a reason, what can no longer be done; the page explains it in plain words.

use axum::Json;
use axum::extract::State;
use axum::http::HeaderMap;
use axum::response::Response;
use uuid::Uuid;

use super::EventRow;
use super::seller_links::{LinkRow, ensure_writable, event_row, find_link, no_store, view};
use super::seller_ops::{self, Actor, Done, Reservation, ReservationRules, Sale};
use crate::api::{
    SellerOp, SellerOpItem, SellerOpProblem, SellerOpResultDto, SellerSyncBody, SellerSyncDto,
};
use crate::error::{ApiError, ApiResult, bad_request};
use crate::ratelimit;
use crate::state::AppState;

/// Most changes in one request (the page sends a longer queue in parts).
pub const MAX_OPS: usize = 50;

/// A change, validated before it touches the database.
enum Prepared {
    Mark {
        numbers: Vec<i32>,
        sale: Sale,
    },
    Unmark(i32),
    Reserve {
        numbers: Vec<i32>,
        reservation: Reservation,
    },
    Cancel(Uuid),
}

fn prepare(op: SellerOp) -> ApiResult<Prepared> {
    Ok(match op {
        SellerOp::Mark {
            ranges,
            buyer_name,
            buyer_phone,
            edit,
            reservation_id,
            method,
        } => Prepared::Mark {
            numbers: seller_ops::expand(&ranges)?,
            sale: Sale {
                buyer_name: seller_ops::contact(buyer_name, 80, "invalid_buyer_name")?,
                buyer_phone: seller_ops::contact(buyer_phone, 30, "invalid_buyer_phone")?,
                edit,
                reservation: reservation_id,
                method,
            },
        },
        SellerOp::Unmark { number } => {
            super::range(number, number)?;
            Prepared::Unmark(number)
        }
        SellerOp::Reserve {
            reservation_id,
            ranges,
            holder_name,
            holder_phone,
            expires_at,
        } => {
            let (holder_name, holder_phone) = seller_ops::holder(holder_name, holder_phone)?;
            Prepared::Reserve {
                numbers: seller_ops::expand(&ranges)?,
                reservation: Reservation {
                    id: reservation_id,
                    holder_name,
                    holder_phone,
                    expires_at,
                },
            }
        }
        SellerOp::CancelReservation { reservation_id } => Prepared::Cancel(reservation_id),
    })
}

/// Applies one change once: a repeated id gets the answer kept the first time.
async fn apply(
    state: &AppState,
    link: &LinkRow,
    event: &EventRow,
    box_office: bool,
    item: SellerOpItem,
) -> ApiResult<SellerOpResultDto> {
    let mut tx = state.pool.begin().await?;
    // The first to insert the id applies the change; a concurrent retry waits here for it.
    let fresh = sqlx::query_scalar!(
        r#"insert into seller_sync_ops (seller_id, op_id, result) values ($1, $2, '{}')
           on conflict (seller_id, op_id) do nothing returning op_id"#,
        link.seller_id,
        item.id,
    )
    .fetch_optional(&mut *tx)
    .await?;
    if fresh.is_none() {
        let kept = sqlx::query_scalar!(
            "select result from seller_sync_ops where seller_id = $1 and op_id = $2",
            link.seller_id,
            item.id,
        )
        .fetch_one(&mut *tx)
        .await?;
        tx.commit().await?;
        return serde_json::from_value(kept).map_err(|error| ApiError::Internal(error.into()));
    }
    let actor = Actor {
        event: link.event_id,
        seller: link.seller_id,
        user: None,
    };
    let canceled = event.canceled_at.is_some();
    let done = match prepare(item.op) {
        // Only something the page should not have sent fails validation.
        Err(ApiError::BadRequest(..)) => Done {
            applied: 0,
            problems: vec![seller_ops::Problem {
                reason: SellerOpProblem::Invalid,
                number: None,
                holder: None,
            }],
        },
        Err(other) => return Err(other),
        Ok(Prepared::Mark { numbers, sale }) => {
            seller_ops::mark(&mut tx, actor, canceled, &numbers, sale).await?
        }
        Ok(Prepared::Unmark(number)) => seller_ops::unmark(&mut tx, actor, number).await?,
        Ok(Prepared::Reserve {
            numbers,
            reservation,
        }) => {
            let rules = ReservationRules {
                canceled,
                box_office,
                ends_at: event.ends_at,
            };
            seller_ops::reserve(&mut tx, actor, rules, &numbers, &reservation).await?
        }
        Ok(Prepared::Cancel(reservation_id)) => {
            seller_ops::cancel_reservation(&mut tx, actor, reservation_id).await?;
            Done {
                applied: 1,
                problems: Vec::new(),
            }
        }
    };
    let result = SellerOpResultDto {
        id: item.id,
        outcome: done.outcome(),
        problems: done.problem_dtos(),
    };
    let stored = serde_json::to_value(&result).map_err(|error| ApiError::Internal(error.into()))?;
    sqlx::query!(
        "update seller_sync_ops set result = $3 where seller_id = $1 and op_id = $2",
        link.seller_id,
        item.id,
        stored,
    )
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(result)
}

/// `POST /api/seller/sync` (no login; the token is the credential): applies the page's queued
/// changes in order and answers the fresh page with what became of each.
pub async fn sync(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<SellerSyncBody>,
) -> ApiResult<Response> {
    ratelimit::by_ip(&state, &headers, ratelimit::SELLER_WRITE).await?;
    let link = find_link(&state, &body.token).await?;
    if body.ops.len() > MAX_OPS {
        return Err(bad_request(
            "invalid_input",
            format!("up to {MAX_OPS} changes at once"),
        ));
    }
    if !body.ops.is_empty() {
        ensure_writable(&state, link.event_id, "/api/seller/sync").await?;
    }
    let event = event_row(&state, link.event_id).await?;
    let box_office = sqlx::query_scalar!(
        "select box_office from sellers where id = $1",
        link.seller_id
    )
    .fetch_one(&state.pool)
    .await?;
    let mut results = Vec::with_capacity(body.ops.len());
    for item in body.ops {
        results.push(apply(&state, &link, &event, box_office, item).await?);
    }
    Ok(no_store(SellerSyncDto {
        view: view(&state, &link).await?,
        results,
    }))
}

#[cfg(test)]
mod tests {
    use time::OffsetDateTime;

    use super::*;
    use crate::api::RangeBody;

    #[test]
    fn changes_are_validated_before_touching_anything() {
        let mark = |name: &str| SellerOp::Mark {
            ranges: vec![RangeBody { first: 1, last: 2 }],
            buyer_name: Some(name.to_owned()),
            buyer_phone: None,
            edit: false,
            reservation_id: None,
            method: None,
        };
        assert!(prepare(mark(" Ana ")).is_ok());
        assert!(prepare(mark("a\nb")).is_err());
        assert!(prepare(SellerOp::Unmark { number: 0 }).is_err());
        let reserve = SellerOp::Reserve {
            reservation_id: Uuid::nil(),
            ranges: vec![RangeBody { first: 3, last: 3 }],
            holder_name: "  ".to_owned(),
            holder_phone: None,
            expires_at: OffsetDateTime::now_utc(),
        };
        assert!(prepare(reserve).is_err(), "a reservation says for whom");
    }
}
