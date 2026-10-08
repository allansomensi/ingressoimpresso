//! HTTP handlers grouped by resource.

pub mod batches;
pub mod events;
pub mod exports;
pub mod sellers;
pub mod voids;

use std::ops::Bound;

use sqlx::PgPool;
use sqlx::postgres::types::PgRange;
use time::OffsetDateTime;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult, bad_request};

/// Largest ticket number accepted (keeps `last + 1` inside i32 and batches reasonable).
pub const MAX_TICKET_NUMBER: i32 = 9_999_999;

/// An event the current user may access.
#[derive(Debug, Clone)]
pub struct EventRow {
    pub id: Uuid,
    pub name: String,
    pub venue: Option<String>,
    pub starts_at: OffsetDateTime,
    pub ends_at: OffsetDateTime,
    pub ticket_price_cents: Option<i32>,
    pub status: String,
    pub qr_tag: i64,
}

/// Loads an event if the user is a member of its organization; 404 otherwise (never reveals
/// that another organization's event exists).
pub async fn authorize_event(
    pool: &PgPool,
    user: &AuthUser,
    event_id: Uuid,
) -> ApiResult<EventRow> {
    sqlx::query_as!(
        EventRow,
        r#"select e.id, e.name, e.venue, e.starts_at, e.ends_at, e.ticket_price_cents, e.status, e.qr_tag
           from events e join memberships m on m.organization_id = e.organization_id
           where e.id = $1 and m.user_id = $2"#,
        event_id,
        user.id,
    )
    .fetch_optional(pool)
    .await?
    .ok_or(ApiError::NotFound)
}

/// Validates an inclusive range and converts it to Postgres' canonical `[first, last + 1)`.
pub fn range(first: i32, last: i32) -> ApiResult<PgRange<i32>> {
    if first < 1 || last < first || last > MAX_TICKET_NUMBER {
        return Err(bad_request(
            "invalid_range",
            format!("range must satisfy 1 <= first <= last <= {MAX_TICKET_NUMBER}"),
        ));
    }
    Ok(PgRange {
        start: Bound::Included(first),
        end: Bound::Excluded(last + 1),
    })
}

/// Inclusive bounds of a canonical `int4range` read from Postgres.
pub fn bounds(range: &PgRange<i32>) -> ApiResult<(i32, i32)> {
    let first = match range.start {
        Bound::Included(value) => value,
        Bound::Excluded(value) => value + 1,
        Bound::Unbounded => return Err(ApiError::Internal(anyhow::anyhow!("unbounded range"))),
    };
    let last = match range.end {
        Bound::Excluded(value) => value - 1,
        Bound::Included(value) => value,
        Bound::Unbounded => return Err(ApiError::Internal(anyhow::anyhow!("unbounded range"))),
    };
    Ok((first, last))
}

/// Whether every number of `numbers` belongs to a non-canceled batch of the event.
pub async fn is_issued(pool: &PgPool, event_id: Uuid, numbers: &PgRange<i32>) -> ApiResult<bool> {
    let (first, last) = bounds(numbers)?;
    let covered = sqlx::query_scalar!(
        r#"select coalesce(sum(upper(numbers * $2) - lower(numbers * $2)), 0)::bigint as "covered!"
           from ticket_batches
           where event_id = $1 and status <> 'canceled' and numbers && $2"#,
        event_id,
        numbers.clone(),
    )
    .fetch_one(pool)
    .await?;
    Ok(covered == i64::from(last) - i64::from(first) + 1)
}

/// Trims an optional text and turns blanks into `None`.
pub fn optional_text(value: Option<String>) -> Option<String> {
    value
        .map(|text| text.trim().to_owned())
        .filter(|text| !text.is_empty())
}
