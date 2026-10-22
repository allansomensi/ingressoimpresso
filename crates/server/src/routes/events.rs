//! Events, signing keys, designs, art and previews.

use std::collections::HashMap;
use std::io::Cursor;

use axum::Json;
use axum::body::Bytes;
use axum::extract::{Path, State};
use axum::http::header::{CACHE_CONTROL, CONTENT_TYPE, HeaderMap};
use axum::http::{HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use sha2::{Digest, Sha256};
use sqlx::{PgPool, Postgres, Transaction};
use ticket_core::EventSigningKey;
use ticket_render::{Art, RenderJob, TicketDesign, TicketQr, TicketToRender};
use time::OffsetDateTime;
use uuid::Uuid;

use super::{EventAccess, EventRow, authorize_event, door, event_access, one_line, optional_text};
use crate::api::{
    ArtDto, DesignBody, DesignResponse, EventBody, EventChangeDto, EventDto, EventKind,
    EventSeriesRefDto, EventStatus, EventStatusBody, EventTeamAccessDto, TeamArea,
};
use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult, bad_request};
use crate::event_days;
use crate::keys;
use crate::state::AppState;
use crate::texts;

/// Upload limit for art (also enforced by the router body limit).
pub const MAX_ART_BYTES: usize = 20 * 1024 * 1024;
/// The renderer's own ceiling (it refuses anything larger too).
pub(crate) const MAX_ART_SIDE_PX: u32 = ticket_render::MAX_ART_SIDE_PX;
/// 24 MP: a 300 × 200 mm ticket at 300 dpi is 8.4 MP, so this leaves room; a larger image would
/// decode to hundreds of megabytes on the single API instance.
pub(crate) const MAX_ART_PIXELS: u64 = ticket_render::MAX_ART_PIXELS;
/// Most memory one image decode may take (previews, moderation); beyond it the decoder stops.
pub(crate) const MAX_DECODE_BYTES: u64 = 256 * 1024 * 1024;
/// Design previews one user may ask for per minute: each one renders a sheet of samples.
const PREVIEWS_PER_MINUTE: usize = 30;
/// Art an organization may keep (every event, every saved version): ten large files.
const MAX_ART_BYTES_PER_ORGANIZATION: i64 = 200 * 1024 * 1024;
const PREVIEW_DPI: u32 = 110;
/// Width of the sample picture of one ticket: sharp on a phone, light enough to share.
const SAMPLE_WIDTH_PX: u32 = 1600;
/// Width of the art shown in the editor's live preview.
const ART_PREVIEW_WIDTH_PX: u32 = 1600;
/// Art previews one user may ask for per minute (the editor asks once per upload; browsers keep
/// the answer).
const ART_PREVIEWS_PER_MINUTE: usize = 60;
/// Images one account may upload per hour (art and sponsor logos together).
const ART_UPLOADS_PER_HOUR: usize = 30;
/// Longest street address of a venue (ADR 0066).
const MAX_ADDRESS: usize = 200;

impl EventRow {
    /// Postponement and cancellation, with the event's offset.
    pub(crate) fn change(&self) -> EventChangeDto {
        let offset = self.offset();
        EventChangeDto {
            postponed_from_starts_at: self.postponed_from_starts_at.map(|at| at.to_offset(offset)),
            postponed_at: self.postponed_at,
            postpone_reason: self.postpone_reason.clone(),
            canceled_at: self.canceled_at,
            cancel_reason: self.cancel_reason.clone(),
        }
    }

    pub(crate) fn into_dto(self, organization_name: String) -> ApiResult<EventDto> {
        let offset = self.offset();
        let change = self.change();
        let kind = self.kind();
        Ok(EventDto {
            id: self.id,
            name: self.name,
            venue: self.venue,
            // Local times with the event's offset, as the painel sent them.
            starts_at: self.starts_at.to_offset(offset),
            ends_at: self.ends_at.to_offset(offset),
            ticket_price_cents: self.ticket_price_cents,
            status: EventStatus::from_db(&self.status).ok_or_else(|| {
                ApiError::Internal(anyhow::anyhow!("unknown event status {}", self.status))
            })?,
            support_access: false,
            team: None,
            address: self.address,
            organization_name,
            change,
            series: None,
            checklist_missing: None,
            kind,
            days: Vec::new(),
        })
    }
}

impl EventAccess {
    /// The DTO of the event (as a handler just read or changed it) as this user sees it: their
    /// place on the team, support mode and the series of dates (ADR 0077).
    pub(crate) async fn dto(&self, pool: &PgPool, row: EventRow) -> ApiResult<EventDto> {
        let offset = row.offset();
        let mut event = row.into_dto(self.organization_name.clone())?;
        event.days = event_days::of_event(pool, event.id, offset).await?;
        event.support_access = self.support;
        event.team = self.team.clone().map(|areas| EventTeamAccessDto {
            areas,
            organization: self.organization_name.clone(),
        });
        event.series = super::series::of_event(pool, event.id).await?;
        Ok(event)
    }
}

/// A valid event body: name, venue, address, UTC offset (minutes) and days (ADR 0091).
struct ValidEvent {
    name: String,
    venue: Option<String>,
    address: Option<String>,
    offset: i16,
    starts_at: OffsetDateTime,
    ends_at: OffsetDateTime,
    /// `None`: as they are; empty: one day.
    days: Option<Vec<event_days::Day>>,
}

/// An optional one-line text of at most `max` characters (blank is `None`).
pub(crate) fn short_text(
    value: Option<String>,
    max: usize,
    code: &'static str,
) -> ApiResult<Option<String>> {
    let value = optional_text(value);
    if let Some(text) = &value {
        if text.chars().count() > max {
            return Err(bad_request(code, format!("up to {max} characters")));
        }
        one_line(text, code)?;
    }
    Ok(value)
}

/// Checks the dates of an event: the end after the start, an offset that exists.
pub(crate) fn validate_dates(starts_at: OffsetDateTime, ends_at: OffsetDateTime) -> ApiResult<i16> {
    if ends_at <= starts_at {
        return Err(bad_request("invalid_dates", "end must be after start"));
    }
    let offset = starts_at.offset().whole_minutes();
    if !(-720..=840).contains(&offset) {
        return Err(bad_request(
            "invalid_dates",
            "offset must be -12:00 to +14:00",
        ));
    }
    Ok(offset)
}

fn validate_event(body: &EventBody) -> ApiResult<ValidEvent> {
    let name = body.name.trim().to_owned();
    if name.is_empty() || name.chars().count() > 100 {
        return Err(bad_request(
            "invalid_name",
            "name must have 1-100 characters",
        ));
    }
    one_line(&name, "invalid_name")?;
    let venue = optional_text(body.venue.clone());
    if venue
        .as_ref()
        .is_some_and(|venue| venue.chars().count() > 120)
    {
        return Err(bad_request(
            "invalid_venue",
            "venue must have up to 120 characters",
        ));
    }
    if let Some(venue) = &venue {
        one_line(venue, "invalid_venue")?;
    }
    let address = short_text(body.address.clone(), MAX_ADDRESS, "invalid_address")?;
    let days = body.days.as_deref().map(event_days::validate).transpose()?;
    // With days, the event runs from the start of the first to the end of the last.
    let (starts_at, ends_at) = match days.as_deref() {
        Some([first, .., last]) => (first.starts_at, last.ends_at),
        _ => (body.starts_at, body.ends_at),
    };
    let offset = validate_dates(starts_at, ends_at)?;
    if body.ticket_price_cents.is_some_and(|price| price < 0) {
        return Err(bad_request("invalid_price", "price must not be negative"));
    }
    if days.as_ref().is_some_and(|days| !days.is_empty()) && body.kind == Some(EventKind::Tokens) {
        return Err(bad_request(
            "days_tokens",
            "consumption tokens have no days",
        ));
    }
    Ok(ValidEvent {
        name,
        venue,
        address,
        offset,
        starts_at,
        ends_at,
        days,
    })
}

/// `GET /api/events`: the organization's events and the ones whose team the user is on
/// (ADR 0055), each with its series (ADR 0077) and what its checklist still misses (ADR 0078,
/// one query for the whole list).
pub async fn list(State(state): State<AppState>, user: AuthUser) -> ApiResult<Json<Vec<EventDto>>> {
    let rows = sqlx::query!(
        r#"select e.id, e.name, e.venue, e.starts_at, e.ends_at, e.ticket_price_cents, e.status, e.qr_tag,
                  e.utc_offset_minutes, e.address, e.postponed_from_starts_at, e.postponed_at,
                  e.postpone_reason, e.canceled_at, e.cancel_reason, e.kind,
                  o.name as organization, t.areas as "areas?",
                  s.id as "series_id?", s.name as "series_name?",
                  (select count(*) from events x where x.series_id = s.id)::int4 as "series_dates?",
                  (select count(*) from events x where x.series_id = s.id
                   and (x.starts_at, x.id) <= (e.starts_at, e.id))::int4 as "series_position?"
           from events e join organizations o on o.id = e.organization_id
           left join event_team t on t.event_id = e.id and t.user_id = $1
           left join event_series s on s.id = e.series_id
           where exists (select 1 from memberships m where m.organization_id = e.organization_id and m.user_id = $1)
              or t.id is not null
           order by e.starts_at desc"#,
        user.id,
    )
    .fetch_all(&state.pool)
    .await?;
    let events: Vec<_> = rows
        .into_iter()
        .map(|row| {
            let series = match (row.series_id, row.series_name) {
                (Some(id), Some(name)) => Some(EventSeriesRefDto {
                    id,
                    name,
                    dates: row.series_dates.unwrap_or(0),
                    position: row.series_position.unwrap_or(0),
                }),
                _ => None,
            };
            let event = EventRow {
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
            };
            (event, row.organization, row.areas, series)
        })
        .collect();
    let missing = super::checklist::missing_counts(
        &state.pool,
        &events.iter().map(|(event, ..)| event).collect::<Vec<_>>(),
    )
    .await?;
    let offsets: HashMap<Uuid, time::UtcOffset> = events
        .iter()
        .map(|(event, ..)| (event.id, event.offset()))
        .collect();
    let ids: Vec<Uuid> = offsets.keys().copied().collect();
    let mut days = event_days::of_events(&state.pool, &ids, &offsets).await?;
    events
        .into_iter()
        .map(|(event, organization, areas, series)| {
            let id = event.id;
            let mut event = event.into_dto(organization.clone())?;
            event.team = areas.map(|areas| team_access(&areas, organization));
            event.series = series;
            event.checklist_missing = missing.get(&id).copied();
            event.days = days.remove(&id).unwrap_or_default();
            Ok(event)
        })
        .collect::<ApiResult<Vec<_>>>()
        .map(Json)
}

fn team_access(areas: &[String], organization: String) -> EventTeamAccessDto {
    EventTeamAccessDto {
        areas: areas
            .iter()
            .filter_map(|area| TeamArea::from_db(area))
            .collect(),
        organization,
    }
}

/// A new event: its row and its first signing key.
struct NewEvent<'a> {
    organization_id: Uuid,
    name: &'a str,
    venue: Option<&'a str>,
    address: Option<&'a str>,
    starts_at: OffsetDateTime,
    ends_at: OffsetDateTime,
    ticket_price_cents: Option<i32>,
    utc_offset_minutes: i16,
    /// Tickets or consumption tokens (ADR 0084).
    kind: EventKind,
}

/// Inserts an event with a random QR tag and its first signing key (ADR 0004, 0005).
async fn insert_event(
    state: &AppState,
    tx: &mut Transaction<'_, Postgres>,
    event: NewEvent<'_>,
) -> ApiResult<EventRow> {
    let event_id = Uuid::new_v4();
    let mut created = None;
    // The tag is random; a collision on the unique index just means "draw again".
    for _ in 0..8 {
        let tag = i64::from(getrandom::u32().map_err(|error| anyhow::anyhow!("OS RNG: {error}"))?);
        created = sqlx::query_as!(
            EventRow,
            r#"insert into events (id, organization_id, name, venue, starts_at, ends_at, qr_tag,
                                   ticket_price_cents, utc_offset_minutes, address, kind)
               values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
               on conflict (qr_tag) do nothing
               returning id, name, venue, starts_at, ends_at, ticket_price_cents, status, qr_tag,
                         utc_offset_minutes, address, postponed_from_starts_at, postponed_at,
                         postpone_reason, canceled_at, cancel_reason, kind"#,
            event_id,
            event.organization_id,
            event.name,
            event.venue,
            event.starts_at,
            event.ends_at,
            tag,
            event.ticket_price_cents,
            event.utc_offset_minutes,
            event.address,
            event.kind.db(),
        )
        .fetch_optional(&mut **tx)
        .await?;
        if created.is_some() {
            break;
        }
    }
    let row = created.ok_or_else(|| anyhow::anyhow!("could not draw a free event tag"))?;

    let seed = keys::generate_seed().map_err(anyhow::Error::from)?;
    let sealed =
        keys::seal(&state.config.master_key, event_id, 1, &seed).map_err(anyhow::Error::from)?;
    let public_key = EventSigningKey::from_seed(&seed).public_key().to_bytes();
    sqlx::query!(
        r#"insert into event_signing_keys (event_id, key_id, public_key, sealed_private_key, status)
           values ($1, 1, $2, $3, 'active')"#,
        event_id,
        public_key.as_slice(),
        sealed,
    )
    .execute(&mut **tx)
    .await?;
    Ok(row)
}

/// `POST /api/events`: creates the event and its first signing key (ADR 0004, 0005).
pub async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<EventBody>,
) -> ApiResult<(StatusCode, Json<EventDto>)> {
    let valid = validate_event(&body)?;
    if !state
        .attempt(
            &format!("event-create:{}", user.id),
            EVENTS_CREATED_PER_HOUR,
            std::time::Duration::from_hours(1),
        )
        .await
    {
        return Err(ApiError::TooManyRequests);
    }
    let mut tx = state.pool.begin().await?;
    let organization = sqlx::query!(
        r#"select m.organization_id, o.name from memberships m join organizations o on o.id = m.organization_id
           where m.user_id = $1 and m.role = 'owner' order by m.created_at limit 1"#,
        user.id
    )
    .fetch_optional(&mut *tx)
    .await?
    .ok_or(ApiError::Forbidden)?;
    ensure_room_for_event(&mut tx, organization.organization_id).await?;
    let event = insert_event(
        &state,
        &mut tx,
        NewEvent {
            organization_id: organization.organization_id,
            name: &valid.name,
            venue: valid.venue.as_deref(),
            address: valid.address.as_deref(),
            starts_at: valid.starts_at,
            ends_at: valid.ends_at,
            ticket_price_cents: body.ticket_price_cents,
            utc_offset_minutes: valid.offset,
            kind: body.kind.unwrap_or_default(),
        },
    )
    .await?;
    if let Some(days) = valid.days.as_deref().filter(|days| !days.is_empty()) {
        event_days::replace(&mut tx, event.id, days).await?;
    }
    tx.commit().await?;
    let offset = event.offset();
    let mut dto = event.into_dto(organization.name)?;
    dto.days = event_days::of_event(&state.pool, dto.id, offset).await?;
    Ok((StatusCode::CREATED, Json(dto)))
}

/// Events one organization may have (ADR 0119): the list, its checklist facts and its days are
/// read whole on every visit to the panel, and no organizer runs more than this.
pub(crate) const MAX_EVENTS_PER_ORGANIZATION: i64 = 500;
/// Events one account may create (or copy) per hour.
pub(crate) const EVENTS_CREATED_PER_HOUR: usize = 60;

/// Refuses a new event (created, copied or added to a series) past
/// [`MAX_EVENTS_PER_ORGANIZATION`].
///
/// # Errors
///
/// `too_many_events` as a 409.
pub(crate) async fn ensure_room_for_event(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: Uuid,
) -> ApiResult<()> {
    let count = sqlx::query_scalar!(
        r#"select count(*) as "count!" from events where organization_id = $1"#,
        organization_id
    )
    .fetch_one(&mut **tx)
    .await?;
    if count >= MAX_EVENTS_PER_ORGANIZATION {
        return Err(ApiError::Conflict(
            "too_many_events",
            format!("an organization has at most {MAX_EVENTS_PER_ORGANIZATION} events"),
        ));
    }
    Ok(())
}

/// The name of a copy: "Show (cópia)", cut to fit 100 characters.
fn copy_name(name: &str) -> String {
    let suffix = texts::COPY_SUFFIX;
    let room = 100 - suffix.chars().count();
    let base: String = name.trim().chars().take(room).collect();
    format!("{}{suffix}", base.trim_end())
}

/// `POST /api/events/{id}/duplicate`: a new event with the same details, the latest ticket
/// design (art included), the same sellers, team, categories and tables, without batches, ranges or door links. It gets
/// its own QR tag and signing key: tickets of one event never open the other's door.
pub async fn duplicate(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
) -> ApiResult<(StatusCode, Json<EventDto>)> {
    let access = event_access(&state.pool, &user, event_id).await?;
    if !state
        .attempt(
            &format!("event-create:{}", user.id),
            EVENTS_CREATED_PER_HOUR,
            std::time::Duration::from_hours(1),
        )
        .await
    {
        return Err(ApiError::TooManyRequests);
    }
    let source = access.event;
    let mut tx = state.pool.begin().await?;
    let name = copy_name(&source.name);
    let copied = copy_event(
        &state,
        &mut tx,
        &source,
        CopyOf {
            organization_id: access.organization_id,
            name: &name,
            starts_at: source.starts_at,
            ends_at: source.ends_at,
            utc_offset_minutes: source.utc_offset_minutes,
            series_id: None,
            user_id: user.id,
        },
    )
    .await?;
    tx.commit().await?;
    copied.check_art(&state);
    Ok((
        StatusCode::CREATED,
        Json({
            let offset = copied.event.offset();
            let mut dto = copied.event.into_dto(access.organization_name)?;
            dto.days = event_days::of_event(&state.pool, dto.id, offset).await?;
            dto
        }),
    ))
}

/// Where a copy goes and what changes in it.
pub(crate) struct CopyOf<'a> {
    pub organization_id: Uuid,
    pub name: &'a str,
    pub starts_at: OffsetDateTime,
    pub ends_at: OffsetDateTime,
    pub utc_offset_minutes: i16,
    /// The series the copy joins (another date of the event, ADR 0077).
    pub series_id: Option<Uuid>,
    /// Who copies (recorded as who added the copied team).
    pub user_id: Uuid,
}

/// A copy, and the images in it nobody has looked at yet.
pub(crate) struct Copied {
    pub event: EventRow,
    unchecked: Vec<Uuid>,
}

impl Copied {
    /// After the commit: a copy of art nobody has looked at yet is classified like a new upload
    /// (ADR 0042).
    pub fn check_art(&self, state: &AppState) {
        for art_id in &self.unchecked {
            crate::moderation::spawn_check(state, *art_id);
        }
    }
}

/// Copies the setup of an event (ADRs 0027, 0077): details, the latest design with its images,
/// sellers without ranges, the team, categories with their numbers, tables without guests and
/// the event's switches. Never batches, ranges, door links, files or keys: the copy has its own
/// QR tag and signing key.
#[expect(
    clippy::too_many_lines,
    reason = "every part of an event the copy takes, in one place"
)]
pub(crate) async fn copy_event(
    state: &AppState,
    tx: &mut Transaction<'_, Postgres>,
    source: &EventRow,
    to: CopyOf<'_>,
) -> ApiResult<Copied> {
    ensure_room_for_event(tx, to.organization_id).await?;
    let event_id = source.id;
    let organization_id = to.organization_id;
    let copy = insert_event(
        state,
        tx,
        NewEvent {
            organization_id,
            name: to.name,
            venue: source.venue.as_deref(),
            address: source.address.as_deref(),
            starts_at: to.starts_at,
            ends_at: to.ends_at,
            ticket_price_cents: source.ticket_price_cents,
            utc_offset_minutes: to.utc_offset_minutes,
            kind: source.kind(),
        },
    )
    .await?;

    let design = sqlx::query!(
        "select spec, art_blob_id, sponsor_blob_ids from ticket_designs where event_id = $1 order by version desc limit 1",
        event_id
    )
    .fetch_optional(&mut **tx)
    .await?;
    let mut unchecked = Vec::new();
    if let Some(design) = design {
        let art = match design.art_blob_id {
            Some(blob_id) => {
                let (id, fresh) = copy_art(tx, organization_id, blob_id, copy.id).await?;
                if fresh {
                    unchecked.push(id);
                }
                Some(id)
            }
            None => None,
        };
        // Refused logos stay behind (CLAUDE.md invariant 17); the others are copied in order.
        let mut sponsors = Vec::with_capacity(design.sponsor_blob_ids.len());
        for blob_id in design.sponsor_blob_ids {
            match copy_art(tx, organization_id, blob_id, copy.id).await {
                Ok((id, fresh)) => {
                    if fresh {
                        unchecked.push(id);
                    }
                    sponsors.push(id);
                }
                Err(ApiError::Conflict("art_rejected", _)) => {}
                Err(other) => return Err(other),
            }
        }
        sqlx::query!(
            r#"insert into ticket_designs (id, event_id, version, spec, art_blob_id, sponsor_blob_ids)
               values ($1, $2, 1, $3, $4, $5)"#,
            Uuid::new_v4(),
            copy.id,
            design.spec,
            art,
            &sponsors,
        )
        .execute(&mut **tx)
        .await?;
    }
    sqlx::query!(
        r#"insert into sellers (id, event_id, name, phone, box_office, cashier, goal,
                                  pix_key_type, pix_key, pix_name, pix_city)
           select gen_random_uuid(), $2, name, phone, box_office, cashier, goal,
                  pix_key_type, pix_key, pix_name, pix_city
           from sellers where event_id = $1"#,
        event_id,
        copy.id,
    )
    .execute(&mut **tx)
    .await?;
    super::team::copy(tx, event_id, copy.id, to.user_id).await?;
    let categories = copy_categories_and_tables(tx, event_id, copy.id).await?;
    super::checkpoints::copy(tx, event_id, copy.id, &categories).await?;
    // The days move with the start (ADR 0091): the copy runs from its first to its last day.
    event_days::shift(tx, event_id, copy.id, to.starts_at - source.starts_at).await?;
    sqlx::query!(
        r#"update events set starts_at = d.first, ends_at = d.last
           from (select min(starts_at) as first, max(ends_at) as last from event_days where event_id = $1) d
           where id = $1 and d.first is not null"#,
        copy.id,
    )
    .execute(&mut **tx)
    .await?;
    // The event's switches are setup too: sellers sending tickets (ADR 0061), the sellers'
    // ranking (ADR 0073), the public check (ADR 0075) and exit and return (ADR 0083).
    sqlx::query!(
        r#"update events c set sellers_send_tickets = s.sellers_send_tickets,
                              sellers_ranking = s.sellers_ranking, public_verify = s.public_verify,
                              reentry = s.reentry, pix_receiver = s.pix_receiver, series_id = $3
           from events s where s.id = $1 and c.id = $2"#,
        event_id,
        copy.id,
        to.series_id,
    )
    .execute(&mut **tx)
    .await?;
    Ok(Copied {
        event: copy,
        unchecked,
    })
}

/// Categories (with their numbers) and tables (without guests) go to the copy (ADR 0056, 0057).
/// Returns the copy of each category, for what refers to them (checkpoints, ADR 0092).
async fn copy_categories_and_tables(
    tx: &mut Transaction<'_, Postgres>,
    from: Uuid,
    to: Uuid,
) -> ApiResult<HashMap<Uuid, Uuid>> {
    let categories = sqlx::query!("select id from ticket_categories where event_id = $1", from)
        .fetch_all(&mut **tx)
        .await?;
    let mut copies = HashMap::with_capacity(categories.len());
    for category in categories {
        let new_id = Uuid::new_v4();
        copies.insert(category.id, new_id);
        sqlx::query!(
            r#"insert into ticket_categories (id, event_id, name, color, price_cents, position,
                                             check_document, document_note, door_instruction,
                                             day_rule, valid_days)
               select $3, $2, name, color, price_cents, position, check_document, document_note,
                      door_instruction, day_rule, valid_days
               from ticket_categories where id = $1"#,
            category.id,
            to,
            new_id,
        )
        .execute(&mut **tx)
        .await?;
        sqlx::query!(
            r#"insert into category_ranges (id, event_id, category_id, numbers)
               select gen_random_uuid(), $2, $3, numbers from category_ranges where category_id = $1"#,
            category.id,
            to,
            new_id,
        )
        .execute(&mut **tx)
        .await?;
    }
    sqlx::query!(
        r#"insert into event_tables (id, event_id, name, seats, shape, x, y)
           select gen_random_uuid(), $2, name, seats, shape, x, y from event_tables where event_id = $1"#,
        from,
        to,
    )
    .execute(&mut **tx)
    .await?;
    Ok(copies)
}

/// Copies an art blob to another event of the same organization, within its art quota. The
/// moderation decision travels with it (invariant 12): refused art is not copied at all, art
/// under review stays under review, and the copy says whether it still needs a first look.
async fn copy_art(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: Uuid,
    blob_id: Uuid,
    to_event: Uuid,
) -> ApiResult<(Uuid, bool)> {
    let source = sqlx::query!(
        "select byte_size, moderation_status, sha256 from blobs where id = $1",
        blob_id
    )
    .fetch_one(&mut **tx)
    .await?;
    let refused = source.moderation_status == "rejected"
        || sqlx::query_scalar!(
            r#"select exists(select 1 from rejected_art where sha256 = $1) as "refused!""#,
            source.sha256
        )
        .fetch_one(&mut **tx)
        .await?;
    if refused {
        return Err(ApiError::Conflict(
            "art_rejected",
            "the art was refused by the team".to_owned(),
        ));
    }
    // Uploads are one blob per image and event, so the same image used twice (the art also as a
    // sponsor, or one logo in two slots) is copied once and shared, like in the source.
    if let Some(existing) = sqlx::query_scalar!(
        "select id from blobs where event_id = $1 and sha256 = $2",
        to_event,
        source.sha256
    )
    .fetch_optional(&mut **tx)
    .await?
    {
        return Ok((existing, false));
    }
    let stored = sqlx::query_scalar!(
        r#"select coalesce(sum(b.byte_size), 0)::bigint as "stored!" from blobs b
           join events e on e.id = b.event_id where e.organization_id = $1"#,
        organization_id
    )
    .fetch_one(&mut **tx)
    .await?;
    if stored + i64::from(source.byte_size) > MAX_ART_BYTES_PER_ORGANIZATION {
        return Err(ApiError::Conflict(
            "art_quota",
            "the organization stores too much art".to_owned(),
        ));
    }
    let id = Uuid::new_v4();
    sqlx::query!(
        r#"insert into blobs (id, event_id, sha256, content_type, width_px, height_px, byte_size, data,
                              moderation_status, uploaded_by)
           select $1, $2, sha256, content_type, width_px, height_px, byte_size, data,
                  moderation_status, uploaded_by
           from blobs where id = $3"#,
        id,
        to_event,
        blob_id,
    )
    .execute(&mut **tx)
    .await?;
    if source.moderation_status == "flagged" {
        // The open flag follows the copy, so the review covers both.
        sqlx::query!(
            r#"insert into moderation_flags (id, blob_id, organization_id, event_id, reasons, details, score, source)
               select gen_random_uuid(), $1, f.organization_id, $2, f.reasons, f.details, f.score, f.source
               from moderation_flags f where f.blob_id = $3 and f.status = 'open'
               on conflict (blob_id) where status = 'open' do nothing"#,
            id,
            to_event,
            blob_id,
        )
        .execute(&mut **tx)
        .await?;
    }
    Ok((id, source.moderation_status == "unchecked"))
}

/// `PUT /api/events/{id}/status`: archives (`closed`) or reopens (`active`) an event. A closed
/// event leaves the main list and takes no new batches; its files and door keep working.
pub async fn set_status(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
    Json(body): Json<EventStatusBody>,
) -> ApiResult<Json<EventDto>> {
    let access = event_access(&state.pool, &user, event_id).await?;
    let row = sqlx::query_as!(
        EventRow,
        r#"update events set status = $2 where id = $1
           returning id, name, venue, starts_at, ends_at, ticket_price_cents, status, qr_tag,
                     utc_offset_minutes, address, postponed_from_starts_at, postponed_at,
                     postpone_reason, canceled_at, cancel_reason, kind"#,
        event_id,
        body.status.db(),
    )
    .fetch_one(&state.pool)
    .await?;
    Ok(Json(access.dto(&state.pool, row).await?))
}

/// `DELETE /api/events/{id}`: only an event without batches (canceled ones aside): nothing was
/// paid or printed for it. Mistakes and tests go away; real events are archived instead.
pub async fn delete(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    event_access(&state.pool, &user, event_id).await?;
    let mut tx = state.pool.begin().await?;
    // An image waiting for the team's decision (ADR 0042) is not deleted from under it: the
    // decision is what keeps the same bytes out for good (invariant 17).
    let under_review = sqlx::query_scalar!(
        r#"select exists(select 1 from moderation_flags f join blobs b on b.id = f.blob_id
                         where b.event_id = $1 and f.status = 'open') as "open!""#,
        event_id
    )
    .fetch_one(&mut *tx)
    .await?;
    if under_review {
        return Err(ApiError::Conflict(
            "art_under_review",
            "the art is being reviewed by the team".to_owned(),
        ));
    }
    let deleted = sqlx::query!(
        r#"delete from events e where e.id = $1
           and not exists (select 1 from ticket_batches b
                           where b.event_id = e.id and b.status <> 'canceled')
           returning e.series_id"#,
        event_id
    )
    .fetch_optional(&mut *tx)
    .await?;
    match deleted {
        Some(row) => {
            // The last date of a series goes on alone (ADR 0077).
            super::series::dissolve_if_alone(&mut tx, row.series_id).await?;
            tx.commit().await?;
            Ok(StatusCode::NO_CONTENT)
        }
        None => Err(ApiError::Conflict(
            "event_has_batches",
            "cancel the event's unpaid batches first; events with paid batches are archived"
                .to_owned(),
        )),
    }
}

/// `GET /api/events/{id}`.
pub async fn get(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
) -> ApiResult<Json<EventDto>> {
    let access = event_access(&state.pool, &user, event_id).await?;
    Ok(Json(access.dto(&state.pool, access.event.clone()).await?))
}

/// `PUT /api/events/{id}`.
pub async fn update(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
    Json(body): Json<EventBody>,
) -> ApiResult<Json<EventDto>> {
    let access = event_access(&state.pool, &user, event_id).await?;
    let valid = validate_event(&body)?;
    let mut tx = state.pool.begin().await?;
    let (starts_at, ends_at) = match &valid.days {
        Some(days) => {
            event_days::replace(&mut tx, event_id, days).await?;
            (valid.starts_at, valid.ends_at)
        }
        // Days kept as they are: the event still runs from the first to the last.
        None => match event_days::load(&mut tx, event_id).await?.as_slice() {
            [first, .., last] => (first.starts_at, last.ends_at),
            _ => (valid.starts_at, valid.ends_at),
        },
    };
    let tokens = body
        .kind
        .map_or(access.event.tokens(), |kind| kind == EventKind::Tokens);
    if tokens && event_days::load(&mut tx, event_id).await?.len() > 1 {
        return Err(bad_request(
            "days_tokens",
            "consumption tokens have no days",
        ));
    }
    let row = sqlx::query_as!(
        EventRow,
        r#"update events set name = $2, venue = $3, starts_at = $4, ends_at = $5, ticket_price_cents = $6,
                             utc_offset_minutes = $7, address = $8, kind = coalesce($9, kind),
                             -- A consumption token is used once: no exit and return (ADR 0084).
                             reentry = reentry and coalesce($9, kind) = 'tickets'
           where id = $1
           returning id, name, venue, starts_at, ends_at, ticket_price_cents, status, qr_tag,
                     utc_offset_minutes, address, postponed_from_starts_at, postponed_at,
                     postpone_reason, canceled_at, cancel_reason, kind"#,
        event_id,
        valid.name,
        valid.venue,
        starts_at,
        ends_at,
        body.ticket_price_cents,
        valid.offset,
        valid.address,
        body.kind.map(EventKind::db),
    )
    .fetch_one(&mut *tx)
    .await?;
    // Door links live until the end of the event plus a grace period: a postponed event must
    // not lock its phones out at the gate.
    door::extend_accesses(&mut tx, event_id, row.ends_at).await?;
    if row.tokens() {
        // Nothing of the door is asked of a ficha (ADR 0084): no document, no box office.
        sqlx::query!(
            r#"update ticket_categories set check_document = false, document_note = null
               where event_id = $1 and check_document"#,
            event_id
        )
        .execute(&mut *tx)
        .await?;
        sqlx::query!(
            "update sellers set box_office = false where event_id = $1 and box_office",
            event_id
        )
        .execute(&mut *tx)
        .await?;
    } else {
        // The token cashier (ADR 0098) is for fichas; tickets have the box office.
        sqlx::query!(
            "update sellers set cashier = false where event_id = $1 and cashier",
            event_id
        )
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(Json(access.dto(&state.pool, row).await?))
}

#[derive(Clone)]
pub(crate) struct ArtRow {
    pub(crate) id: Uuid,
    content_type: String,
    width_px: i32,
    height_px: i32,
    pub(crate) moderation_status: String,
}

impl From<ArtRow> for ArtDto {
    fn from(row: ArtRow) -> Self {
        Self {
            id: row.id,
            content_type: row.content_type,
            width_px: row.width_px,
            height_px: row.height_px,
            moderation: row.moderation_status,
        }
    }
}

async fn art_of_event(state: &AppState, event_id: Uuid, art_id: Uuid) -> ApiResult<ArtRow> {
    sqlx::query_as!(
        ArtRow,
        "select id, content_type, width_px, height_px, moderation_status from blobs where id = $1 and event_id = $2",
        art_id,
        event_id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| bad_request("unknown_art", "art does not belong to this event"))
}

/// Several arts of the event in one read, in the order given; any unknown id is an error.
pub(crate) async fn arts_of_event(
    state: &AppState,
    event_id: Uuid,
    ids: &[Uuid],
) -> ApiResult<Vec<ArtRow>> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let rows = sqlx::query_as!(
        ArtRow,
        "select id, content_type, width_px, height_px, moderation_status from blobs where event_id = $1 and id = any($2)",
        event_id,
        ids
    )
    .fetch_all(&state.pool)
    .await?;
    let by_id: HashMap<Uuid, ArtRow> = rows.into_iter().map(|row| (row.id, row)).collect();
    ids.iter()
        .map(|id| {
            by_id
                .get(id)
                .cloned()
                .ok_or_else(|| bad_request("unknown_art", "art does not belong to this event"))
        })
        .collect()
}

/// `GET /api/events/{id}/design`: the latest version, or the default design (version 0).
pub async fn get_design(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
) -> ApiResult<Json<DesignResponse>> {
    let event = authorize_event(&state.pool, &user, event_id).await?;
    let organization = super::organization::event_organization(&state.pool, event_id).await?;
    let latest = sqlx::query!(
        "select version, spec, art_blob_id, sponsor_blob_ids from ticket_designs where event_id = $1 order by version desc limit 1",
        event_id
    )
    .fetch_optional(&state.pool)
    .await?;
    let Some(latest) = latest else {
        return Ok(Json(DesignResponse {
            version: 0,
            // A token event starts from a ficha, not a ticket (ADR 0086).
            design: TicketDesign::default_for(event.tokens()),
            art: None,
            sponsors: Vec::new(),
            organization,
        }));
    };
    let design: TicketDesign = serde_json::from_value(latest.spec).map_err(anyhow::Error::from)?;
    let art = match latest.art_blob_id {
        Some(art_id) => Some(art_of_event(&state, event_id, art_id).await?.into()),
        None => None,
    };
    let sponsors = arts_of_event(&state, event_id, &latest.sponsor_blob_ids)
        .await?
        .into_iter()
        .map(Into::into)
        .collect();
    Ok(Json(DesignResponse {
        version: latest.version,
        design,
        art,
        sponsors,
        organization,
    }))
}

fn validate_design(design: &TicketDesign) -> ApiResult<()> {
    design.validate().map_err(|issues| {
        bad_request(
            "invalid_design",
            issues
                .iter()
                .map(ToString::to_string)
                .collect::<Vec<_>>()
                .join("; "),
        )
    })
}

/// `PUT /api/events/{id}/design`: saves a new immutable version.
pub async fn save_design(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
    Json(body): Json<DesignBody>,
) -> ApiResult<Json<DesignResponse>> {
    authorize_event(&state.pool, &user, event_id).await?;
    validate_design(&body.design)?;
    let art = match body.art_id {
        Some(art_id) => Some(art_of_event(&state, event_id, art_id).await?),
        None => None,
    };
    if art
        .as_ref()
        .is_some_and(|art| art.moderation_status == "rejected")
    {
        return Err(ApiError::Conflict(
            "art_rejected",
            "the art was refused by the team".to_owned(),
        ));
    }
    let sponsors = sponsors_of(&state, event_id, &body.sponsor_ids).await?;
    let spec = serde_json::to_value(&body.design).map_err(anyhow::Error::from)?;
    let version = sqlx::query_scalar!(
        r#"insert into ticket_designs (id, event_id, version, spec, art_blob_id, sponsor_blob_ids)
           values ($1, $2, (select coalesce(max(version), 0) + 1 from ticket_designs where event_id = $2), $3, $4, $5)
           returning version"#,
        Uuid::new_v4(),
        event_id,
        spec,
        body.art_id,
        &body.sponsor_ids,
    )
    .fetch_one(&state.pool)
    .await?;
    Ok(Json(DesignResponse {
        version,
        design: body.design,
        art: art.map(Into::into),
        sponsors: sponsors.into_iter().map(Into::into).collect(),
        organization: super::organization::event_organization(&state.pool, event_id).await?,
    }))
}

/// The sponsors' logos of a design: at most six, uploaded to this event, none refused.
async fn sponsors_of(state: &AppState, event_id: Uuid, ids: &[Uuid]) -> ApiResult<Vec<ArtRow>> {
    if ids.len() > ticket_render::MAX_SPONSORS {
        return Err(bad_request(
            "too_many_sponsors",
            format!("up to {} logos", ticket_render::MAX_SPONSORS),
        ));
    }
    let logos = arts_of_event(state, event_id, ids).await?;
    for logo in &logos {
        crate::moderation::check_printable(Some(&logo.moderation_status))?;
    }
    Ok(logos)
}

/// `POST /api/events/{id}/art`: raw PNG or JPEG body (max 20 MB).
#[expect(
    clippy::too_many_lines,
    reason = "every check of an upload, in the order it runs"
)]
pub async fn upload_art(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
    headers: HeaderMap,
    body: Bytes,
) -> ApiResult<(StatusCode, Json<ArtDto>)> {
    authorize_event(&state.pool, &user, event_id).await?;
    if body.len() > MAX_ART_BYTES {
        return Err(ApiError::PayloadTooLarge);
    }
    // Each new image is a decode and, with the classifier on, one of the day's analyses
    // (ADR 0042): a loop of uploads must not spend either for everyone (ADR 0119).
    if !state
        .attempt(
            &format!("art-upload:{}", user.id),
            ART_UPLOADS_PER_HOUR,
            std::time::Duration::from_hours(1),
        )
        .await
    {
        return Err(ApiError::TooManyRequests);
    }
    let content_type = match body.get(..8) {
        Some(b"\x89PNG\r\n\x1a\n") => "image/png",
        Some([0xFF, 0xD8, 0xFF, ..]) => "image/jpeg",
        _ => return Err(bad_request("unsupported_art", "art must be PNG or JPEG")),
    };
    if headers
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|declared| declared != content_type && declared != "application/octet-stream")
    {
        return Err(bad_request(
            "unsupported_art",
            "content type does not match the file",
        ));
    }
    // A phone photo says where and when it was taken: EXIF, XMP, IPTC and comments go before
    // the bytes are hashed, stored or printed (`art::strip_metadata`, lossless).
    let body = Bytes::from(crate::art::strip_metadata(&body));
    // Reads only the header: refuses decompression bombs before Typst ever decodes the image.
    let (width, height) = image::ImageReader::new(Cursor::new(&body))
        .with_guessed_format()
        .map_err(|_| bad_request("unsupported_art", "unreadable image"))?
        .into_dimensions()
        .map_err(|_| bad_request("unsupported_art", "unreadable image"))?;
    if width == 0
        || height == 0
        || width > MAX_ART_SIDE_PX
        || height > MAX_ART_SIDE_PX
        || u64::from(width) * u64::from(height) > MAX_ART_PIXELS
    {
        return Err(bad_request(
            "art_too_large",
            "art must be at most 10000 px per side and 24 MP",
        ));
    }
    let digest = Sha256::digest(&body).to_vec();
    let size = i32::try_from(body.len()).map_err(|_| ApiError::PayloadTooLarge)?;
    let inherited = known_moderation(&state, &digest).await?;
    // Art lives in Postgres (ADR 0011): drop this event's older uploads no saved design uses (an
    // abandoned try; recent ones stay for the editor's undo) and cap what an organization keeps,
    // so one account cannot fill the database.
    sqlx::query!(
        r#"delete from blobs b where b.event_id = $1 and b.sha256 <> $2
           and b.created_at < now() - interval '2 hours'
           and b.moderation_status not in ('flagged', 'rejected')
           and not exists (select 1 from ticket_designs d
                           where d.art_blob_id = b.id or b.id = any(d.sponsor_blob_ids))
           and not exists (select 1 from certificate_settings c where b.id = any(c.image_blob_ids))"#,
        event_id,
        digest,
    )
    .execute(&state.pool)
    .await?;
    let stored = sqlx::query_scalar!(
        r#"select coalesce(sum(b.byte_size), 0)::bigint as "stored!" from blobs b
           join events e on e.id = b.event_id
           where e.organization_id = (select organization_id from events where id = $1)"#,
        event_id
    )
    .fetch_one(&state.pool)
    .await?;
    if stored + i64::from(size) > MAX_ART_BYTES_PER_ORGANIZATION
        && !blob_exists(&state, event_id, &digest).await?
    {
        return Err(ApiError::Conflict(
            "art_quota",
            "the organization stores too much art".to_owned(),
        ));
    }
    let (width, height) = (
        i32::try_from(width).map_err(anyhow::Error::from)?,
        i32::try_from(height).map_err(anyhow::Error::from)?,
    );
    let row = sqlx::query!(
        r#"insert into blobs (id, event_id, sha256, content_type, width_px, height_px, byte_size, data,
                              moderation_status, uploaded_by)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           on conflict (event_id, sha256) do update set event_id = excluded.event_id
           returning id, content_type, width_px, height_px, moderation_status, (xmax = 0) as "inserted!""#,
        Uuid::new_v4(),
        event_id,
        digest,
        content_type,
        width,
        height,
        size,
        body.as_ref(),
        inherited,
        user.id,
    )
    .fetch_one(&state.pool)
    .await?;
    // The same bytes again return the row already there; only a new image is analysed.
    if row.inserted && row.moderation_status == "unchecked" {
        crate::moderation::spawn_check(&state, row.id);
    }
    let row = ArtRow {
        id: row.id,
        content_type: row.content_type,
        width_px: row.width_px,
        height_px: row.height_px,
        moderation_status: row.moderation_status,
    };
    Ok((StatusCode::CREATED, Json(row.into())))
}

/// Moderation of an image already seen (ADR 0042): one the team refused anywhere is refused
/// again; one already found fine is not classified twice.
pub(crate) async fn known_moderation(state: &AppState, digest: &[u8]) -> ApiResult<&'static str> {
    let refused = sqlx::query_scalar!(
        r#"select exists(select 1 from rejected_art where sha256 = $1) as "refused!""#,
        digest
    )
    .fetch_one(&state.pool)
    .await?;
    let known = sqlx::query_scalar!(
        r#"select moderation_status from blobs where sha256 = $1
           order by (moderation_status = 'rejected') desc, (moderation_status = 'flagged') desc,
                    created_at desc limit 1"#,
        digest
    )
    .fetch_optional(&state.pool)
    .await?;
    match known.as_deref() {
        _ if refused => Err(ApiError::Conflict(
            "art_rejected",
            "this image was refused by the team".to_owned(),
        )),
        Some("rejected") => Err(ApiError::Conflict(
            "art_rejected",
            "this image was refused by the team".to_owned(),
        )),
        // The same bytes are being looked at elsewhere: no second copy skips the queue.
        Some("flagged") => Err(ApiError::Conflict(
            "art_under_review",
            "this image is being reviewed by the team".to_owned(),
        )),
        Some("clean") => Ok("clean"),
        Some("approved") => Ok("approved"),
        _ => Ok("unchecked"),
    }
}

async fn blob_exists(state: &AppState, event_id: Uuid, digest: &[u8]) -> ApiResult<bool> {
    Ok(sqlx::query_scalar!(
        r#"select exists(select 1 from blobs where event_id = $1 and sha256 = $2) as "exists!""#,
        event_id,
        digest
    )
    .fetch_one(&state.pool)
    .await?)
}

/// Loads art bytes for rendering (from the instance's disk after the first read, `art::bytes`).
pub async fn load_art(state: &AppState, event_id: Uuid, art_id: Uuid) -> ApiResult<Art> {
    let data = crate::art::bytes(state, event_id, art_id)
        .await?
        .ok_or_else(|| bad_request("unknown_art", "art does not belong to this event"))?;
    Art::from_bytes(data).map_err(|error| ApiError::Internal(error.into()))
}

/// Loads the bytes of several arts of the event, in the order given: the ones read before come
/// from the instance's disk, the rest from the database in one read (and go to the disk).
pub async fn load_arts(state: &AppState, event_id: Uuid, ids: &[Uuid]) -> ApiResult<Vec<Art>> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let mut bytes_by_id: HashMap<Uuid, Vec<u8>> = HashMap::new();
    let mut missing = Vec::new();
    for id in ids {
        if bytes_by_id.contains_key(id) || missing.contains(id) {
            continue;
        }
        match crate::art::cached(state, event_id, *id).await {
            Some(bytes) => {
                bytes_by_id.insert(*id, bytes);
            }
            None => missing.push(*id),
        }
    }
    if !missing.is_empty() {
        let rows = sqlx::query!(
            "select id, data from blobs where event_id = $1 and id = any($2)",
            event_id,
            &missing
        )
        .fetch_all(&state.pool)
        .await?;
        for row in rows {
            crate::art::keep(state, event_id, row.id, &row.data).await;
            bytes_by_id.insert(row.id, row.data);
        }
    }
    // The same image may be used more than once (a sponsor twice): decoded once, cloned after.
    let by_id: HashMap<Uuid, Art> = bytes_by_id
        .into_iter()
        .map(|(id, data)| {
            Art::from_bytes(data)
                .map(|art| (id, art))
                .map_err(|error| ApiError::Internal(error.into()))
        })
        .collect::<ApiResult<_>>()?;
    ids.iter()
        .map(|id| {
            by_id
                .get(id)
                .cloned()
                .ok_or_else(|| bad_request("unknown_art", "art does not belong to this event"))
        })
        .collect()
}

/// The job of a design preview: the event's details and art with `count` SAMPLE tickets (invalid
/// QR, watermark), numbered from 1. Checks access, the design, the art and the rate limit shared
/// by every kind of preview. Never signs anything.
async fn sample_job(
    state: &AppState,
    user: &AuthUser,
    event_id: Uuid,
    body: DesignBody,
    count: u32,
) -> ApiResult<RenderJob> {
    let event = authorize_event(&state.pool, user, event_id).await?;
    validate_design(&body.design)?;
    if !state
        .attempt(
            &format!("preview:{}", user.id),
            PREVIEWS_PER_MINUTE,
            std::time::Duration::from_mins(1),
        )
        .await
    {
        return Err(ApiError::TooManyRequests);
    }
    // A sample is made to be shared: art under review or refused is not printed on it either
    // (ADR 0042; the editor's own preview still shows the art being reviewed).
    if let Some(art_id) = body.art_id {
        let status = art_of_event(state, event_id, art_id)
            .await?
            .moderation_status;
        crate::moderation::check_printable(Some(&status))?;
    }
    let art = match body.art_id {
        Some(art_id) => Some(load_art(state, event_id, art_id).await?),
        None => None,
    };
    sponsors_of(state, event_id, &body.sponsor_ids).await?;
    let sponsors = load_arts(state, event_id, &body.sponsor_ids).await?;
    // Samples show the band of the event's categories and seats, as printed (ADR 0056).
    let tags = super::categories::NumberTags::load(&state.pool, event_id).await?;
    Ok(RenderJob {
        tokens: event.tokens(),
        details: super::event_details(&state.pool, &event).await?,
        design: body.design,
        art,
        sponsors,
        event_name: event.name,
        tickets: (1..=count)
            .map(|number| TicketToRender {
                qr: TicketQr::Sample { number },
                seller: None,
                category: tags.category(i32::try_from(number).unwrap_or(i32::MAX)),
                seat: tags.seat(i32::try_from(number).unwrap_or(i32::MAX)),
            })
            .collect(),
    })
}

/// Runs a render of samples on the blocking pool, one at a time with the other renders.
async fn render_samples<T: Send + 'static>(
    state: &AppState,
    job: RenderJob,
    render: impl FnOnce(&RenderJob) -> Result<T, ticket_render::RenderError> + Send + 'static,
) -> ApiResult<T> {
    state
        .blocking_render(move || render(&job))
        .await?
        .map_err(|error| match error {
            ticket_render::RenderError::TooLargeForA4 => {
                bad_request("too_large_for_a4", "ticket does not fit on A4")
            }
            other => ApiError::Internal(other.into()),
        })
}

fn jpeg_response(jpeg: Vec<u8>) -> Response {
    (
        [(CONTENT_TYPE, HeaderValue::from_static("image/jpeg"))],
        jpeg,
    )
        .into_response()
}

/// `POST /api/events/{id}/design/preview`: first home A4 sheet with SAMPLE tickets (watermark,
/// invalid QR), as JPEG. Never signs anything.
pub async fn preview(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
    Json(body): Json<DesignBody>,
) -> ApiResult<Response> {
    let job = sample_job(&state, &user, event_id, body, 200).await?;
    let sheets = render_samples(&state, job, |job| {
        ticket_render::home_sheet_jpegs(job, PREVIEW_DPI, 1)
    })
    .await?;
    let jpeg = sheets
        .into_iter()
        .next()
        .ok_or_else(|| anyhow::anyhow!("no preview sheet"))?;
    Ok(jpeg_response(jpeg))
}

/// `POST /api/events/{id}/design/sample`: one SAMPLE ticket (watermark, invalid QR) as a JPEG
/// image of its body, the way the WhatsApp images come out, for the editor's sample picture.
pub async fn sample(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
    Json(body): Json<DesignBody>,
) -> ApiResult<Response> {
    let job = sample_job(&state, &user, event_id, body, 1).await?;
    let images = render_samples(&state, job, |job| {
        ticket_render::ticket_images(job, SAMPLE_WIDTH_PX)
    })
    .await?;
    let image = images
        .into_iter()
        .next()
        .ok_or_else(|| anyhow::anyhow!("no sample image"))?;
    Ok(jpeg_response(image.jpeg))
}

/// `GET /api/events/{id}/art/{art_id}`: the art as a JPEG at most 1600 px wide, for the editor's
/// live preview. Art never changes once uploaded, so the browser may keep it.
pub async fn art_preview(
    State(state): State<AppState>,
    user: AuthUser,
    Path((event_id, art_id)): Path<(Uuid, Uuid)>,
) -> ApiResult<Response> {
    authorize_event(&state.pool, &user, event_id).await?;
    // Browsers keep the answer for good; a script asking again and again would cost a decode
    // each time.
    if !state
        .attempt(
            &format!("art-preview:{}", user.id),
            ART_PREVIEWS_PER_MINUTE,
            std::time::Duration::from_mins(1),
        )
        .await
    {
        return Err(ApiError::TooManyRequests);
    }
    let blob = sqlx::query!(
        "select content_type, width_px, moderation_status from blobs where id = $1 and event_id = $2",
        art_id,
        event_id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound)?;
    // Refused art is not shown again, not even to its uploader (ADR 0042).
    if blob.moderation_status == "rejected" {
        return Err(ApiError::Conflict(
            "art_rejected",
            "the art was refused by the team".to_owned(),
        ));
    }
    let data = crate::art::bytes(&state, event_id, art_id)
        .await?
        .ok_or(ApiError::NotFound)?;
    let small_jpeg = blob.content_type == "image/jpeg"
        && u32::try_from(blob.width_px).is_ok_and(|width| width <= ART_PREVIEW_WIDTH_PX);
    let jpeg = if small_jpeg {
        data
    } else {
        let _permit = state
            .render_permits
            .clone()
            .acquire_owned()
            .await
            .map_err(anyhow::Error::from)?;
        tokio::task::spawn_blocking(move || shrink_to_jpeg(&data, ART_PREVIEW_WIDTH_PX))
            .await
            .map_err(anyhow::Error::from)?
            .map_err(anyhow::Error::from)?
    };
    Ok((
        [
            (CONTENT_TYPE, HeaderValue::from_static("image/jpeg")),
            (
                CACHE_CONTROL,
                HeaderValue::from_static("private, max-age=31536000, immutable"),
            ),
        ],
        jpeg,
    )
        .into_response())
}

/// Decodes an image and encodes it as JPEG, scaled down to `max_width` if wider.
pub(crate) fn shrink_to_jpeg(bytes: &[u8], max_width: u32) -> Result<Vec<u8>, image::ImageError> {
    let mut reader = image::ImageReader::new(Cursor::new(bytes)).with_guessed_format()?;
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(MAX_ART_SIDE_PX);
    limits.max_image_height = Some(MAX_ART_SIDE_PX);
    limits.max_alloc = Some(MAX_DECODE_BYTES);
    reader.limits(limits);
    let image = reader.decode()?;
    let image = if image.width() > max_width {
        image.resize(max_width, u32::MAX, image::imageops::FilterType::Triangle)
    } else {
        image
    };
    let mut out = Cursor::new(Vec::new());
    image::DynamicImage::ImageRgb8(image.to_rgb8()).write_to(&mut out, image::ImageFormat::Jpeg)?;
    Ok(out.into_inner())
}
