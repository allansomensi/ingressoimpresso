//! HTTP handlers grouped by resource.

pub mod account;
pub mod admin;
pub mod admin_insights;
pub mod alerts;
pub mod analytics;
pub mod announcements;
pub mod batches;
pub mod billing;
pub mod cashier;
pub mod categories;
pub mod certificates;
pub mod changelog;
pub mod checklist;
pub mod checkpoints;
pub mod courtesies;
pub mod credentials;
pub mod crm;
pub mod disputes;
pub mod door;
pub mod door_live;
pub mod door_rehearsal;
pub mod event_changes;
pub mod events;
pub mod exports;
pub mod final_summary;
pub mod guests;
pub mod history;
pub mod ledger;
pub mod mail_admin;
pub mod mailings;
pub mod moderation;
pub mod organization;
pub mod pix;
pub mod platform;
pub mod privacy;
pub mod public_page;
pub mod referrals;
pub mod refunds;
pub mod report;
pub mod reservations;
pub mod revenue_reports;
pub mod seller_goals;
pub mod seller_links;
pub mod seller_ops;
pub mod seller_sync;
pub mod sellers;
pub mod series;
pub mod settlement;
pub mod status;
pub mod support;
pub mod tables;
pub mod team;
pub mod tickets;
pub mod two_factor;
pub mod verify;
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
    /// Street address of the venue (ADR 0066).
    pub address: Option<String>,
    /// Start before the first postponement (ADR 0065).
    pub postponed_from_starts_at: Option<OffsetDateTime>,
    /// When it was last postponed.
    pub postponed_at: Option<OffsetDateTime>,
    /// Why, as the organizer wrote it.
    pub postpone_reason: Option<String>,
    /// When it was canceled (ADR 0065); `None` when it happens.
    pub canceled_at: Option<OffsetDateTime>,
    /// Why.
    pub cancel_reason: Option<String>,
    /// `tickets` or `tokens` (ADR 0084).
    pub kind: String,
    /// The tickets only go to phones (ADR 0123): the panel leads with the digital tickets.
    pub digital_only: bool,
}

impl EventRow {
    /// Tickets or consumption tokens (ADR 0084).
    pub fn kind(&self) -> crate::api::EventKind {
        crate::api::EventKind::from_db(&self.kind).unwrap_or_default()
    }

    /// Consumption tokens: the files, e-mails and labels speak of fichas (ADR 0086).
    pub fn tokens(&self) -> bool {
        self.kind() == crate::api::EventKind::Tokens
    }

    /// The event's UTC offset (Brasília time if the stored value were ever out of range).
    pub fn offset(&self) -> UtcOffset {
        UtcOffset::from_whole_seconds(i32::from(self.utc_offset_minutes) * 60).unwrap_or(BRASILIA)
    }

    /// Venue, local start, price and organization for the design's text blocks.
    pub fn details(&self, organization: String) -> EventDetails {
        let start = self.starts_at.to_offset(self.offset());
        EventDetails {
            venue: self.venue.clone(),
            starts_at: Some(PrimitiveDateTime::new(start.date(), start.time())),
            price_cents: self.ticket_price_cents.map(i64::from),
            organization: Some(organization),
            category: None,
            days: Vec::new(),
        }
    }

    /// Refuses what a canceled event no longer takes (ADR 0065): new batches, payments and the
    /// sellers' sales.
    ///
    /// # Errors
    ///
    /// `event_canceled` as a 409.
    pub fn ensure_not_canceled(&self) -> ApiResult<()> {
        if self.canceled_at.is_some() {
            return Err(ApiError::Conflict(
                "event_canceled",
                "the event was canceled".to_owned(),
            ));
        }
        Ok(())
    }
}

/// [`EventRow::details`] with the name of the event's organization (`{organizacao}`).
pub async fn event_details(pool: &PgPool, event: &EventRow) -> ApiResult<EventDetails> {
    let organization = sqlx::query_scalar!(
        "select o.name from events e join organizations o on o.id = e.organization_id where e.id = $1",
        event.id
    )
    .fetch_one(pool)
    .await?;
    let mut details = event.details(organization);
    // `{dias}` (ADR 0091): the local start of each day.
    details.days = crate::event_days::of_event(pool, event.id, event.offset())
        .await?
        .into_iter()
        .map(|day| PrimitiveDateTime::new(day.starts_at.date(), day.starts_at.time()))
        .collect();
    Ok(details)
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
#[expect(
    clippy::too_many_lines,
    reason = "the whole access rule of an event in one place"
)]
pub async fn event_access(
    pool: &PgPool,
    user: &AuthUser,
    event_id: Uuid,
) -> ApiResult<EventAccess> {
    let row = sqlx::query!(
        r#"select e.id, e.name, e.venue, e.starts_at, e.ends_at, e.ticket_price_cents, e.status, e.qr_tag,
                  e.utc_offset_minutes, e.address, e.postponed_from_starts_at, e.postponed_at,
                  e.postpone_reason, e.canceled_at, e.cancel_reason, e.kind, e.digital_only,
                  e.organization_id, o.name as organization_name,
                  o.suspended_at is not null as "organization_suspended!",
                  exists(select 1 from memberships m
                         where m.organization_id = e.organization_id and m.user_id = $2) as "member!",
                  (select t.areas from event_team t where t.event_id = e.id and t.user_id = $2) as "areas?: Vec<String>",
                  (select t.joined_at is null from event_team t where t.event_id = e.id and t.user_id = $2) as "first_visit?"
           from events e join organizations o on o.id = e.organization_id where e.id = $1"#,
        event_id,
        user.id,
    )
    .fetch_optional(pool)
    .await?
    .ok_or(ApiError::NotFound)?;
    // An admin is in support mode wherever they are not a member (ADR 0032), a team row for
    // their e-mail notwithstanding: support stays audited and unrestricted (ADR 0119).
    let team = match (row.member || user.is_admin, row.areas) {
        (true, _) => None,
        (false, Some(areas)) => Some(
            areas
                .iter()
                .filter_map(|area| TeamArea::from_db(area))
                .collect::<Vec<_>>(),
        ),
        (false, None) => return Err(ApiError::NotFound),
    };
    let support = !row.member && team.is_none();
    // The first time a team member opens the event is when they joined it (ADR 0119).
    if team.is_some() && row.first_visit == Some(true) {
        sqlx::query!(
            "update event_team set joined_at = now() where event_id = $1 and user_id = $2 and joined_at is null",
            row.id,
            user.id
        )
        .execute(pool)
        .await?;
    }
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
    // The event's history (ADR 0099): written by the API layer once the change succeeds.
    if writing {
        crate::activity::note(
            row.id,
            user.id,
            &user.email,
            &user.method,
            &user.path,
            support,
        );
    }
    // Previews and quotes are POSTs that only read: looking around in support mode leaves no
    // trace, a change does.
    if support && writing && team::need(&user.method, &user.path) != team::Need::Read {
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
            address: row.address,
            postponed_from_starts_at: row.postponed_from_starts_at,
            postponed_at: row.postponed_at,
            postpone_reason: row.postpone_reason,
            canceled_at: row.canceled_at,
            cancel_reason: row.cancel_reason,
            kind: row.kind,
            digital_only: row.digital_only,
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

/// Ranges one seller or category may hold (ADR 0119): the door's manifest, the files and the
/// number tags walk every range of the event, and "12, 15, 40-50" never needs this many.
pub const MAX_RANGES_PER_OWNER: i64 = 300;

/// Whose ranges [`ensure_ranges_room`] counts.
#[derive(Debug, Clone, Copy)]
pub enum RangeOwner {
    /// A category's ranges (`category_ranges`).
    Category(Uuid),
    /// A seller's ranges (`seller_assignments`).
    Seller(Uuid),
}

/// Refuses one more range for `owner` past [`MAX_RANGES_PER_OWNER`].
///
/// # Errors
///
/// `too_many_ranges` as a 409.
pub async fn ensure_ranges_room(pool: &PgPool, owner: RangeOwner) -> ApiResult<()> {
    let count = match owner {
        RangeOwner::Category(id) => {
            sqlx::query_scalar!(
                r#"select count(*) as "count!" from category_ranges where category_id = $1"#,
                id
            )
            .fetch_one(pool)
            .await?
        }
        RangeOwner::Seller(id) => {
            sqlx::query_scalar!(
                r#"select count(*) as "count!" from seller_assignments where seller_id = $1"#,
                id
            )
            .fetch_one(pool)
            .await?
        }
    };
    if count >= MAX_RANGES_PER_OWNER {
        return Err(ApiError::Conflict(
            "too_many_ranges",
            format!("at most {MAX_RANGES_PER_OWNER} ranges each"),
        ));
    }
    Ok(())
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

/// Heavy renders (certificate ZIPs, badges, report PDFs, final summaries) one account may ask for
/// per minute: each holds one of the two render permits for seconds (ADR 0118).
pub const HEAVY_RENDERS_PER_MINUTE: usize = 6;

/// Refuses a heavy render beyond [`HEAVY_RENDERS_PER_MINUTE`] for this account.
///
/// # Errors
///
/// [`ApiError::TooManyRequests`] past the limit.
pub async fn heavy_render(state: &crate::state::AppState, user: &AuthUser) -> ApiResult<()> {
    if state
        .attempt(
            &format!("heavy-render:{}", user.id),
            HEAVY_RENDERS_PER_MINUTE,
            std::time::Duration::from_mins(1),
        )
        .await
    {
        Ok(())
    } else {
        Err(ApiError::TooManyRequests)
    }
}
