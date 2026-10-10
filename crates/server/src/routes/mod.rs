//! HTTP handlers grouped by resource.

pub mod account;
pub mod admin;
pub mod analytics;
pub mod announcements;
pub mod batches;
pub mod billing;
pub mod changelog;
pub mod door;
pub mod events;
pub mod exports;
pub mod mail_admin;
pub mod moderation;
pub mod platform;
pub mod privacy;
pub mod report;
pub mod sellers;
pub mod status;
pub mod support;
pub mod tickets;
pub mod two_factor;
pub mod voids;

use std::ops::Bound;

use axum::http::Method;
use sqlx::PgPool;
use sqlx::postgres::types::PgRange;
use ticket_render::EventDetails;
use time::macros::offset;
use time::{OffsetDateTime, PrimitiveDateTime, UtcOffset};
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult, bad_request};

/// Offset of events created before offsets were stored (ADR 0025).
const BRASILIA: UtcOffset = offset!(-3);

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
    pub utc_offset_minutes: i16,
}

impl EventRow {
    /// The event's UTC offset (Brasília time if the stored value were ever out of range).
    pub fn offset(&self) -> UtcOffset {
        UtcOffset::from_whole_seconds(i32::from(self.utc_offset_minutes) * 60).unwrap_or(BRASILIA)
    }

    /// Venue, local start and price for the design's text blocks.
    pub fn details(&self) -> EventDetails {
        let start = self.starts_at.to_offset(self.offset());
        EventDetails {
            venue: self.venue.clone(),
            starts_at: Some(PrimitiveDateTime::new(start.date(), start.time())),
            price_cents: self.ticket_price_cents.map(i64::from),
        }
    }
}

/// An event the user may access, and how.
#[derive(Debug, Clone)]
pub struct EventAccess {
    /// The event.
    pub event: EventRow,
    /// Its organization.
    pub organization_id: Uuid,
    /// Opened by an admin who is not a member (support mode, ADR 0032).
    pub support: bool,
}

/// Loads an event if the user is a member of its organization, or an admin (support mode); 404
/// otherwise (never reveals that another organization's event exists). Every change an admin
/// makes in support mode is written to the audit log.
pub async fn event_access(
    pool: &PgPool,
    user: &AuthUser,
    event_id: Uuid,
) -> ApiResult<EventAccess> {
    let row = sqlx::query!(
        r#"select e.id, e.name, e.venue, e.starts_at, e.ends_at, e.ticket_price_cents, e.status, e.qr_tag,
                  e.utc_offset_minutes, e.organization_id,
                  exists(select 1 from memberships m
                         where m.organization_id = e.organization_id and m.user_id = $2) as "member!"
           from events e where e.id = $1"#,
        event_id,
        user.id,
    )
    .fetch_optional(pool)
    .await?
    .ok_or(ApiError::NotFound)?;
    if !row.member && !user.is_admin {
        return Err(ApiError::NotFound);
    }
    let support = !row.member;
    if support && !matches!(user.method, Method::GET | Method::HEAD) {
        admin::audit_with(
            pool,
            user,
            "support_write",
            Some(row.organization_id),
            Some(row.id),
            None,
            serde_json::json!({ "method": user.method.as_str(), "path": user.path }),
        )
        .await?;
    }
    Ok(EventAccess {
        event: EventRow {
            id: row.id,
            name: row.name,
            venue: row.venue,
            starts_at: row.starts_at,
            ends_at: row.ends_at,
            ticket_price_cents: row.ticket_price_cents,
            status: row.status,
            qr_tag: row.qr_tag,
            utc_offset_minutes: row.utc_offset_minutes,
        },
        organization_id: row.organization_id,
        support,
    })
}

/// [`event_access`], keeping only the event.
pub async fn authorize_event(
    pool: &PgPool,
    user: &AuthUser,
    event_id: Uuid,
) -> ApiResult<EventRow> {
    Ok(event_access(pool, user, event_id).await?.event)
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
