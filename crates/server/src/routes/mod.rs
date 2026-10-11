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
pub mod seller_links;
pub mod sellers;
pub mod settlement;
pub mod status;
pub mod support;
pub mod team;
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

use crate::api::TeamArea;
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
    /// On the event's team, not in its organization (ADR 0055): what the user takes care of.
    pub team: Option<Vec<TeamArea>>,
    /// The organization's name (shown to team members).
    pub organization_name: String,
}

impl EventAccess {
    /// Whether the user may do everything an organization member does on this event.
    pub fn is_owner(&self) -> bool {
        self.team.is_none()
    }

    /// Whether the user may change `area` (owners and `manage` may change everything).
    pub fn can(&self, area: TeamArea) -> bool {
        self.team
            .as_ref()
            .is_none_or(|areas| areas.contains(&TeamArea::Manage) || areas.contains(&area))
    }
}

/// Loads an event if the user is a member of its organization, on its team (ADR 0055) or an
/// admin (support mode); 404 otherwise (never reveals that another organization's event exists).
/// A team member reads everything and changes only their areas ([`team::need`] maps the request
/// to an area). Every change an admin makes in support mode is written to the audit log.
pub async fn event_access(
    pool: &PgPool,
    user: &AuthUser,
    event_id: Uuid,
) -> ApiResult<EventAccess> {
    let row = sqlx::query!(
        r#"select e.id, e.name, e.venue, e.starts_at, e.ends_at, e.ticket_price_cents, e.status, e.qr_tag,
                  e.utc_offset_minutes, e.organization_id, o.name as organization_name,
                  o.suspended_at is not null as "organization_suspended!",
                  exists(select 1 from memberships m
                         where m.organization_id = e.organization_id and m.user_id = $2) as "member!",
                  (select t.areas from event_team t where t.event_id = e.id and t.user_id = $2) as "areas?: Vec<String>"
           from events e join organizations o on o.id = e.organization_id where e.id = $1"#,
        event_id,
        user.id,
    )
    .fetch_optional(pool)
    .await?
    .ok_or(ApiError::NotFound)?;
    let team = match (row.member, row.areas) {
        (true, _) => None,
        (false, Some(areas)) => Some(
            areas
                .iter()
                .filter_map(|area| TeamArea::from_db(area))
                .collect::<Vec<_>>(),
        ),
        (false, None) if user.is_admin => None,
        (false, None) => return Err(ApiError::NotFound),
    };
    let support = !row.member && team.is_none();
    let writing = !matches!(user.method, Method::GET | Method::HEAD);
    if let Some(areas) = &team {
        let allowed = match team::need(&user.method, &user.path) {
            team::Need::Read => true,
            team::Need::Area(area) => areas.contains(&TeamArea::Manage) || areas.contains(&area),
            team::Need::Either(one, other) => {
                areas.contains(&TeamArea::Manage) || areas.contains(&one) || areas.contains(&other)
            }
            team::Need::Owner => false,
        };
        if !allowed {
            return Err(ApiError::Refused(
                "not_your_area",
                "another person of the team takes care of this".to_owned(),
            ));
        }
        // A suspended organization's events only read, whoever opens them (ADR 0032).
        if row.organization_suspended && writing && !team::leaving(&user.path) {
            return Err(ApiError::Suspended);
        }
    }
    if support && writing {
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
        team,
        organization_name: row.organization_name,
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

/// Refuses names and labels with control characters (line breaks included): they are printed,
/// e-mailed and shown on one line, and a stray CR or LF has no place in any of them.
///
/// # Errors
///
/// `code` as a 400.
pub fn one_line(text: &str, code: &'static str) -> ApiResult<()> {
    if text.chars().any(char::is_control) {
        return Err(bad_request(code, "control characters are not allowed"));
    }
    Ok(())
}

/// Trims an optional text and turns blanks into `None`.
pub fn optional_text(value: Option<String>) -> Option<String> {
    value
        .map(|text| text.trim().to_owned())
        .filter(|text| !text.is_empty())
}
