//! Digital tickets (ADR 0030): a private link that shows a ticket on the holder's phone.
//!
//! A link is a delivery channel, not a new ticket: its QR is the same signed QR v1 the printed
//! ticket of that number carries (CLAUDE.md invariant 1), so the door needs nothing new and the
//! first scan wins whether it comes from paper or a screen. The QR is signed once, when the link
//! is created (`jobs::sign_numbers`), and stored sealed with the link token under the master key:
//! a database dump alone reveals neither. Revoking a link stops the page; only a void blocks the
//! number at the door.

use axum::Json;
use axum::extract::{Path, State};
use axum::http::header::{CACHE_CONTROL, CONTENT_TYPE};
use axum::http::{HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use ticket_core::SignedTicket;
use ticket_render::{RenderJob, TicketQr, TicketToRender};
use time::OffsetDateTime;
use uuid::Uuid;

use super::{EventRow, MAX_TICKET_NUMBER, authorize_event, one_line, optional_text};
use crate::api::{
    CreateTicketLinkBody, CreateTicketLinksBody, OpenTicketBody, TicketLinkDto, TicketLinksDto,
    TicketPassDto, TicketPassEvent, TicketState, UpdateTicketLinkBody,
};
use crate::auth::{AuthUser, new_token, token_hash};
use crate::error::{ApiError, ApiResult, bad_request};
use crate::state::AppState;
use crate::{jobs, keys};

/// Purpose bound into the sealed data of a link.
const SEAL_PURPOSE: &str = "ticket-link";
/// Links created in one bulk request.
const MAX_BULK: i32 = 500;
const MAX_HOLDER_NAME: usize = 80;
/// Width of the ticket image shown on the holder's phone.
const IMAGE_WIDTH_PX: u32 = 1080;
/// Longest wait for a render slot before answering `busy`.
const RENDER_WAIT: std::time::Duration = std::time::Duration::from_secs(15);

/// A link row with what the organizer sees.
struct LinkRow {
    id: Uuid,
    ticket_number: i32,
    holder_name: Option<String>,
    sealed: Vec<u8>,
    created_at: OffsetDateTime,
    revoked_at: Option<OffsetDateTime>,
    first_opened_at: Option<OffsetDateTime>,
    last_opened_at: Option<OffsetDateTime>,
    open_count: i32,
    voided: bool,
    entered_at: Option<OffsetDateTime>,
}

/// Token and QR text sealed in a link row.
struct Secret {
    token: String,
    qr_text: String,
}

fn seal(state: &AppState, link_id: Uuid, token: &str, qr_text: &str) -> ApiResult<Vec<u8>> {
    keys::seal_data(
        &state.config.master_key,
        SEAL_PURPOSE,
        link_id,
        format!("{token}\n{qr_text}").as_bytes(),
    )
    .map_err(|error| ApiError::Internal(error.into()))
}

fn unseal(state: &AppState, link_id: Uuid, sealed: &[u8]) -> ApiResult<Secret> {
    let plain = keys::unseal_data(&state.config.master_key, SEAL_PURPOSE, link_id, sealed)
        .map_err(|error| ApiError::Internal(error.into()))?;
    let text = std::str::from_utf8(&plain).map_err(|error| ApiError::Internal(error.into()))?;
    let (token, qr_text) = text
        .split_once('\n')
        .ok_or_else(|| ApiError::Internal(anyhow::anyhow!("sealed link without separator")))?;
    Ok(Secret {
        token: token.to_owned(),
        qr_text: qr_text.to_owned(),
    })
}

/// The address the holder opens: the token travels in the fragment, so it never reaches a
/// server log, the site's analytics or a `Referer` (like the door links, ADR 0007).
fn link_url(state: &AppState, token: &str) -> String {
    format!("{}/ingresso#{token}", state.config.public_web_url)
}

/// Prefix and zero padding of the printed number (latest design, or the default one).
pub(crate) async fn number_style(state: &AppState, event_id: Uuid) -> ApiResult<(String, u8)> {
    let row = sqlx::query!(
        r#"select spec -> 'number' ->> 'prefix' as prefix, (spec -> 'number' ->> 'digits')::int as digits
           from ticket_designs where event_id = $1 order by version desc limit 1"#,
        event_id
    )
    .fetch_optional(&state.pool)
    .await?;
    let default = ticket_render::TicketDesign::default_v1().number;
    Ok(match row {
        Some(row) => (
            row.prefix.unwrap_or(default.prefix),
            row.digits
                .and_then(|digits| u8::try_from(digits).ok())
                .unwrap_or(default.digits),
        ),
        None => (default.prefix, default.digits),
    })
}

fn label(number: i32, digits: u8) -> String {
    format!("{number:0width$}", width = usize::from(digits))
}

fn state_of(voided: bool, entered_at: Option<OffsetDateTime>) -> TicketState {
    if voided {
        TicketState::Voided
    } else if entered_at.is_some() {
        TicketState::Entered
    } else {
        TicketState::Valid
    }
}

impl LinkRow {
    fn into_dto(self, state: &AppState, digits: u8) -> ApiResult<TicketLinkDto> {
        let secret = unseal(state, self.id, &self.sealed)?;
        Ok(TicketLinkDto {
            id: self.id,
            number: self.ticket_number,
            number_label: label(self.ticket_number, digits),
            holder_name: self.holder_name,
            url: link_url(state, &secret.token),
            created_at: self.created_at,
            revoked_at: self.revoked_at,
            first_opened_at: self.first_opened_at,
            last_opened_at: self.last_opened_at,
            open_count: self.open_count,
            state: state_of(self.voided, self.entered_at),
            entered_at: self.entered_at,
        })
    }
}

async fn load_links(
    state: &AppState,
    event_id: Uuid,
    only: Option<&[Uuid]>,
) -> ApiResult<Vec<LinkRow>> {
    Ok(sqlx::query_as!(
        LinkRow,
        r#"select l.id, l.ticket_number, l.holder_name, l.sealed, l.created_at, l.revoked_at,
                  l.first_opened_at, l.last_opened_at, l.open_count,
                  exists(select 1 from ticket_voids v where v.event_id = l.event_id and v.undone_at is null
                         and v.numbers @> l.ticket_number) as "voided!",
                  (select s.scanned_at from entries en join scans s on s.id = en.first_scan_id
                   where en.event_id = l.event_id and en.ticket_number = l.ticket_number) as "entered_at?"
           from ticket_links l
           where l.event_id = $1 and ($2::uuid[] is null or l.id = any($2))
           order by l.revoked_at is not null, l.created_at desc"#,
        event_id,
        only as Option<&[Uuid]>,
    )
    .fetch_all(&state.pool)
    .await?)
}

/// The smallest paid number with no seller, no void, no active link and no entry: the natural
/// pick for a ticket that will only exist on a phone.
async fn next_free_number(state: &AppState, event_id: Uuid) -> ApiResult<Option<i32>> {
    Ok(sqlx::query_scalar!(
        r#"select min(n) as "n" from ticket_batches b
           cross join lateral generate_series(lower(b.numbers), upper(b.numbers) - 1) as n
           where b.event_id = $1 and b.status = 'paid'
             and not exists (select 1 from seller_assignments a where a.event_id = b.event_id and a.numbers @> n)
             and not exists (select 1 from ticket_voids v where v.event_id = b.event_id and v.undone_at is null
                             and v.numbers @> n)
             and not exists (select 1 from ticket_links l where l.event_id = b.event_id and l.revoked_at is null
                             and l.ticket_number = n)
             and not exists (select 1 from entries e where e.event_id = b.event_id and e.ticket_number = n)"#,
        event_id
    )
    .fetch_one(&state.pool)
    .await?)
}

/// `GET /api/events/{id}/tickets`: every link of the event, active first.
pub async fn list(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
) -> ApiResult<Json<TicketLinksDto>> {
    authorize_event(&state.pool, &user, event_id).await?;
    let (_, digits) = number_style(&state, event_id).await?;
    let links = load_links(&state, event_id, None)
        .await?
        .into_iter()
        .map(|row| row.into_dto(&state, digits))
        .collect::<ApiResult<Vec<_>>>()?;
    let paid_tickets = sqlx::query_scalar!(
        r#"select coalesce(sum(upper(numbers) - lower(numbers)), 0)::bigint as "count!"
           from ticket_batches where event_id = $1 and status = 'paid'"#,
        event_id
    )
    .fetch_one(&state.pool)
    .await?;
    Ok(Json(TicketLinksDto {
        links,
        next_number: next_free_number(&state, event_id).await?,
        paid_tickets,
        number_digits: digits,
    }))
}

fn holder_name(value: Option<String>) -> ApiResult<Option<String>> {
    let name = optional_text(value);
    if name
        .as_ref()
        .is_some_and(|name| name.chars().count() > MAX_HOLDER_NAME)
    {
        return Err(bad_request(
            "invalid_holder_name",
            "holder name must have up to 80 characters",
        ));
    }
    if let Some(name) = &name {
        one_line(name, "invalid_holder_name")?;
    }
    Ok(name)
}

/// Numbers of `first..=last` that are paid and not voided, each with its batch's key id.
async fn issuable(
    state: &AppState,
    event_id: Uuid,
    first: i32,
    last: i32,
) -> ApiResult<Vec<(i32, i16)>> {
    let rows = sqlx::query!(
        r#"select n as "number!", b.key_id
           from ticket_batches b
           cross join lateral generate_series(greatest(lower(b.numbers), $2), least(upper(b.numbers) - 1, $3)) as n
           where b.event_id = $1 and b.status = 'paid' and b.numbers && int4range($2, $3, '[]')
             and not exists (select 1 from ticket_voids v where v.event_id = b.event_id and v.undone_at is null
                             and v.numbers @> n)
           order by n"#,
        event_id,
        first,
        last,
    )
    .fetch_all(&state.pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|row| (row.number, row.key_id))
        .collect())
}

/// Signs and stores links for `numbers` (skipping numbers that already have an active link).
async fn create_links(
    state: &AppState,
    user: &AuthUser,
    event: &EventRow,
    numbers: &[(i32, i16)],
    holder: Option<&str>,
) -> ApiResult<Vec<Uuid>> {
    let signed = jobs::sign_numbers(state, event.id, event.qr_tag, numbers).await?;
    let mut created = Vec::with_capacity(signed.len());
    let mut tx = state.pool.begin().await?;
    for (number, qr_text) in signed {
        let id = Uuid::new_v4();
        let (token, hash) = new_token()?;
        let sealed = seal(state, id, &token, &qr_text)?;
        let inserted = sqlx::query_scalar!(
            r#"insert into ticket_links (id, event_id, ticket_number, holder_name, token_hash, sealed, created_by)
               values ($1, $2, $3, $4, $5, $6, $7)
               on conflict (event_id, ticket_number) where revoked_at is null do nothing
               returning id"#,
            id,
            event.id,
            number,
            holder,
            hash,
            sealed,
            user.id,
        )
        .fetch_optional(&mut *tx)
        .await?;
        created.extend(inserted);
    }
    tx.commit().await?;
    Ok(created)
}

fn ensure_open(event: &EventRow) -> ApiResult<()> {
    if event.status == "closed" {
        return Err(ApiError::Conflict(
            "event_closed",
            "reopen the event to send tickets".to_owned(),
        ));
    }
    Ok(())
}

/// `POST /api/events/{id}/tickets`: one link, for `number` or the next free number.
pub async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
    Json(body): Json<CreateTicketLinkBody>,
) -> ApiResult<(StatusCode, Json<TicketLinkDto>)> {
    let event = authorize_event(&state.pool, &user, event_id).await?;
    ensure_open(&event)?;
    let holder = holder_name(body.holder_name)?;
    let number = match body.number {
        Some(number) => number,
        None => next_free_number(&state, event_id)
            .await?
            .ok_or(ApiError::Conflict(
                "no_free_tickets",
                "every paid ticket is taken".to_owned(),
            ))?,
    };
    if !(1..=MAX_TICKET_NUMBER).contains(&number) {
        return Err(bad_request(
            "invalid_number",
            format!("ticket numbers go from 1 to {MAX_TICKET_NUMBER}"),
        ));
    }
    let numbers = issuable(&state, event_id, number, number).await?;
    if numbers.is_empty() {
        let voided = sqlx::query_scalar!(
            r#"select exists(select 1 from ticket_voids where event_id = $1 and undone_at is null
                             and numbers @> $2::int4) as "voided!""#,
            event_id,
            number
        )
        .fetch_one(&state.pool)
        .await?;
        return Err(if voided {
            ApiError::Conflict("ticket_voided", "this ticket number is voided".to_owned())
        } else {
            bad_request("ticket_not_issued", "this number is not in a paid batch")
        });
    }
    let created = create_links(&state, &user, &event, &numbers, holder.as_deref()).await?;
    let Some(id) = created.first().copied() else {
        return Err(ApiError::Conflict(
            "ticket_link_exists",
            "this ticket already has an active link".to_owned(),
        ));
    };
    let (_, digits) = number_style(&state, event_id).await?;
    let row = load_links(&state, event_id, Some(&[id]))
        .await?
        .into_iter()
        .next()
        .ok_or(ApiError::NotFound)?;
    Ok((StatusCode::CREATED, Json(row.into_dto(&state, digits)?)))
}

/// `POST /api/events/{id}/tickets/bulk`: links for every free number of a range (up to 500).
/// Numbers that are voided, unpaid or already linked are skipped.
pub async fn create_bulk(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
    Json(body): Json<CreateTicketLinksBody>,
) -> ApiResult<(StatusCode, Json<Vec<TicketLinkDto>>)> {
    let event = authorize_event(&state.pool, &user, event_id).await?;
    ensure_open(&event)?;
    if body.first < 1
        || body.last < body.first
        || body.last > MAX_TICKET_NUMBER
        || body.last - body.first >= MAX_BULK
    {
        return Err(bad_request(
            "invalid_range",
            format!("range must have 1-{MAX_BULK} numbers"),
        ));
    }
    let numbers = issuable(&state, event_id, body.first, body.last).await?;
    let created = create_links(&state, &user, &event, &numbers, None).await?;
    let (_, digits) = number_style(&state, event_id).await?;
    let mut rows = load_links(&state, event_id, Some(&created)).await?;
    rows.sort_by_key(|row| row.ticket_number);
    let links = rows
        .into_iter()
        .map(|row| row.into_dto(&state, digits))
        .collect::<ApiResult<Vec<_>>>()?;
    Ok((StatusCode::CREATED, Json(links)))
}

async fn link_event(state: &AppState, link_id: Uuid) -> ApiResult<Uuid> {
    sqlx::query_scalar!("select event_id from ticket_links where id = $1", link_id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or(ApiError::NotFound)
}

async fn reload(state: &AppState, event_id: Uuid, link_id: Uuid) -> ApiResult<TicketLinkDto> {
    let (_, digits) = number_style(state, event_id).await?;
    load_links(state, event_id, Some(&[link_id]))
        .await?
        .into_iter()
        .next()
        .ok_or(ApiError::NotFound)?
        .into_dto(state, digits)
}

/// `PUT /api/ticket-links/{id}`: renames the holder.
pub async fn update(
    State(state): State<AppState>,
    user: AuthUser,
    Path(link_id): Path<Uuid>,
    Json(body): Json<UpdateTicketLinkBody>,
) -> ApiResult<Json<TicketLinkDto>> {
    let event_id = link_event(&state, link_id).await?;
    authorize_event(&state.pool, &user, event_id).await?;
    let holder = holder_name(body.holder_name)?;
    sqlx::query!(
        "update ticket_links set holder_name = $2 where id = $1",
        link_id,
        holder
    )
    .execute(&state.pool)
    .await?;
    Ok(Json(reload(&state, event_id, link_id).await?))
}

/// `POST /api/ticket-links/{id}/revoke`: the link stops opening. The QR it showed stays valid
/// at the door until the number is voided.
pub async fn revoke(
    State(state): State<AppState>,
    user: AuthUser,
    Path(link_id): Path<Uuid>,
) -> ApiResult<Json<TicketLinkDto>> {
    let event_id = link_event(&state, link_id).await?;
    authorize_event(&state.pool, &user, event_id).await?;
    sqlx::query!(
        "update ticket_links set revoked_at = coalesce(revoked_at, now()) where id = $1",
        link_id
    )
    .execute(&state.pool)
    .await?;
    Ok(Json(reload(&state, event_id, link_id).await?))
}

struct OpenRow {
    id: Uuid,
    event_id: Uuid,
    ticket_number: i32,
    holder_name: Option<String>,
    sealed: Vec<u8>,
}

/// The active link of a token, counting the opening.
async fn open_link(state: &AppState, token: &str, count: bool) -> ApiResult<OpenRow> {
    let token = token.trim();
    if token.is_empty() || token.len() > 128 {
        return Err(ApiError::NotFound);
    }
    let hash = token_hash(token);
    let row = if count {
        sqlx::query_as!(
            OpenRow,
            r#"update ticket_links
               set first_opened_at = coalesce(first_opened_at, now()), last_opened_at = now(),
                   open_count = least(open_count + 1, 1000000)
               where token_hash = $1 and revoked_at is null
               returning id, event_id, ticket_number, holder_name, sealed"#,
            hash
        )
        .fetch_optional(&state.pool)
        .await?
    } else {
        sqlx::query_as!(
            OpenRow,
            r#"select id, event_id, ticket_number, holder_name, sealed from ticket_links
               where token_hash = $1 and revoked_at is null"#,
            hash
        )
        .fetch_optional(&state.pool)
        .await?
    };
    row.ok_or(ApiError::NotFound)
}

/// `POST /api/ticket` (no login; the token is the credential, sent in the body so it stays out
/// of access logs): what the holder's phone shows.
pub async fn open(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(body): Json<OpenTicketBody>,
) -> ApiResult<Response> {
    crate::ratelimit::by_ip(&state, &headers, crate::ratelimit::TICKET_OPEN).await?;
    let link = open_link(&state, &body.token, true).await?;
    let event = sqlx::query!(
        r#"select e.name, e.venue, e.starts_at, e.ends_at, e.utc_offset_minutes, o.name as organizer,
                  coalesce((select spec ->> 'backgroundColor' from ticket_designs d
                            where d.event_id = e.id order by version desc limit 1), '#ffffff') as "background!",
                  exists(select 1 from ticket_voids v where v.event_id = e.id and v.undone_at is null
                         and v.numbers @> $2::int4) as "voided!",
                  (select s.scanned_at from entries en join scans s on s.id = en.first_scan_id
                   where en.event_id = e.id and en.ticket_number = $2) as "entered_at?"
           from events e join organizations o on o.id = e.organization_id
           where e.id = $1"#,
        link.event_id,
        link.ticket_number,
    )
    .fetch_one(&state.pool)
    .await?;
    let secret = unseal(&state, link.id, &link.sealed)?;
    let (prefix, digits) = number_style(&state, link.event_id).await?;
    let offset = time::UtcOffset::from_whole_seconds(i32::from(event.utc_offset_minutes) * 60)
        .unwrap_or(time::UtcOffset::UTC);
    let ticket_state = state_of(event.voided, event.entered_at);
    let pass = TicketPassDto {
        event: TicketPassEvent {
            name: event.name,
            venue: event.venue,
            starts_at: event.starts_at.to_offset(offset),
            ends_at: event.ends_at.to_offset(offset),
            organizer: event.organizer,
        },
        number: link.ticket_number,
        number_label: label(link.ticket_number, digits),
        number_prefix: prefix,
        holder_name: link.holder_name,
        // A voided ticket shows why, not a QR the door would refuse anyway.
        qr_text: (ticket_state != TicketState::Voided).then_some(secret.qr_text),
        state: ticket_state,
        entered_at: event.entered_at,
        background_color: event.background,
    };
    Ok((
        [(CACHE_CONTROL, HeaderValue::from_static("no-store"))],
        Json(pass),
    )
        .into_response())
}

/// `POST /api/ticket/image`: the ticket as printed (design, art and the real QR), as a JPEG.
pub async fn image(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(body): Json<OpenTicketBody>,
) -> ApiResult<Response> {
    crate::ratelimit::by_ip(&state, &headers, crate::ratelimit::TICKET_IMAGE).await?;
    let link = open_link(&state, &body.token, false).await?;
    let voided = sqlx::query_scalar!(
        r#"select exists(select 1 from ticket_voids where event_id = $1 and undone_at is null
                         and numbers @> $2::int4) as "voided!""#,
        link.event_id,
        link.ticket_number
    )
    .fetch_one(&state.pool)
    .await?;
    if voided {
        return Err(ApiError::Gone("ticket_voided"));
    }
    // Art under review or refused is not drawn (ADR 0042); the page still shows the QR.
    crate::moderation::ensure_event_printable(&state.pool, link.event_id).await?;
    // Rendering is the expensive part: one image per link and design version, kept with the
    // other generated files (cleaned after a day), so repeated requests cost a file read.
    let version = sqlx::query_scalar!(
        r#"select coalesce(max(version), 0) as "version!" from ticket_designs where event_id = $1"#,
        link.event_id
    )
    .fetch_one(&state.pool)
    .await?;
    let cached = state
        .config
        .export_dir
        .join(format!("ticket-{}-v{version}.jpg", link.id));
    let jpeg = if let Ok(bytes) = tokio::fs::read(&cached).await {
        bytes
    } else {
        // Wait for a render slot (shared with the design previews) before loading anything big,
        // and give up after a while instead of queueing without bound.
        let _permit =
            tokio::time::timeout(RENDER_WAIT, state.render_permits.clone().acquire_owned())
                .await
                .map_err(|_| ApiError::Unavailable("busy"))?
                .map_err(anyhow::Error::from)?;
        // Another request for the same link may have drawn it while this one waited.
        if let Ok(bytes) = tokio::fs::read(&cached).await {
            bytes
        } else {
            let jpeg = render_image(&state, &link).await?;
            let partial = cached.with_extension("partial");
            if tokio::fs::write(&partial, &jpeg).await.is_ok() {
                let _ = tokio::fs::rename(&partial, &cached).await;
            }
            jpeg
        }
    };
    Ok((
        [
            (CONTENT_TYPE, HeaderValue::from_static("image/jpeg")),
            (
                CACHE_CONTROL,
                HeaderValue::from_static("private, max-age=86400"),
            ),
        ],
        jpeg,
    )
        .into_response())
}

/// The ticket of a link drawn with the event's current design, art and its signed QR. The
/// caller holds a render permit.
async fn render_image(state: &AppState, link: &OpenRow) -> ApiResult<Vec<u8>> {
    let secret = unseal(state, link.id, &link.sealed)?;
    let ticket = SignedTicket::from_qr_text(&secret.qr_text)
        .map_err(|error| ApiError::Internal(error.into()))?;
    let event = sqlx::query_as!(
        EventRow,
        r#"select id, name, venue, starts_at, ends_at, ticket_price_cents, status, qr_tag, utc_offset_minutes
           from events where id = $1"#,
        link.event_id
    )
    .fetch_one(&state.pool)
    .await?;
    let (design, art) = jobs::current_design(state, link.event_id).await?;
    let job = RenderJob {
        details: event.details(),
        design,
        art,
        event_name: event.name,
        tickets: vec![TicketToRender {
            qr: TicketQr::Signed(ticket),
            seller: None,
        }],
    };
    let images =
        tokio::task::spawn_blocking(move || ticket_render::ticket_images(&job, IMAGE_WIDTH_PX))
            .await
            .map_err(anyhow::Error::from)?
            .map_err(|error| ApiError::Internal(error.into()))?;
    Ok(images
        .into_iter()
        .next()
        .ok_or_else(|| anyhow::anyhow!("no ticket image"))?
        .jpeg)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn labels_pad_numbers() {
        assert_eq!(label(42, 4), "0042");
        assert_eq!(label(12_345, 4), "12345");
        assert_eq!(label(7, 1), "7");
    }

    #[test]
    fn voided_wins_over_entered() {
        let now = OffsetDateTime::UNIX_EPOCH;
        assert_eq!(state_of(true, Some(now)), TicketState::Voided);
        assert_eq!(state_of(false, Some(now)), TicketState::Entered);
        assert_eq!(state_of(false, None), TicketState::Valid);
    }
}
