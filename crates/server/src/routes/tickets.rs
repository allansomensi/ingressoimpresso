//! Digital tickets (ADR 0030): a private link that shows a ticket on the holder's phone.
//!
//! A link is a delivery channel, not a new ticket: its QR is the same signed QR v1 the printed
//! ticket of that number carries (CLAUDE.md invariant 1), so the door needs nothing new and the
//! first scan wins whether it comes from paper or a screen. The QR is signed once, when the link
//! is created (`jobs::sign_numbers`), and stored sealed with the link token under the master key:
//! a database dump alone reveals neither. Revoking a link stops the page; only a void blocks the
//! number at the door.

use std::collections::HashSet;

use axum::Json;
use axum::extract::{Path, State};
use axum::http::header::{CACHE_CONTROL, CONTENT_TYPE};
use axum::http::{HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use sha2::{Digest as _, Sha256};
use sqlx::{Postgres, Transaction};
use ticket_core::SignedTicket;
use ticket_render::{RenderJob, TicketQr, TicketToRender};
use time::OffsetDateTime;
use uuid::Uuid;

use super::{EventRow, MAX_TICKET_NUMBER, authorize_event, one_line, optional_text};
use crate::api::{
    CreateTicketLinkBody, CreateTicketLinksBody, EventDayDto, GoogleWalletDto, IssueTicketsBody,
    IssuedOrderDto, IssuedTicketsDto, MarkTicketsSentBody, OpenTicketBody, PassTableDto,
    PassTableMapDto, PassWalletsDto, ReplaceTicketBody, TableShape, TicketLinkDto, TicketLinksDto,
    TicketPassDto, TicketPassEvent, TicketReplacementDto, TicketSettingsDto, TicketState,
    TicketStockDto, TransferTicketBody, TransferTicketDto, UpdateTicketLinkBody,
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
    seller: Option<String>,
    category_id: Option<Uuid>,
    holder_phone: Option<String>,
    note: Option<String>,
    sent_at: Option<OffsetDateTime>,
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
            seller: self.seller,
            category_id: self.category_id,
            holder_phone: self.holder_phone,
            note: self.note,
            sent_at: self.sent_at,
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
                   where en.event_id = l.event_id and en.ticket_number = l.ticket_number) as "entered_at?",
                  (select se.name from sellers se where se.id = l.seller_id) as "seller?",
                  (select r.category_id from category_ranges r where r.event_id = l.event_id
                   and r.numbers @> l.ticket_number) as "category_id?",
                  l.holder_phone, l.note, l.sent_at
           from ticket_links l
           where l.event_id = $1 and ($2::uuid[] is null or l.id = any($2))
           order by l.revoked_at is not null, l.created_at desc"#,
        event_id,
        only as Option<&[Uuid]>,
    )
    .fetch_all(&state.pool)
    .await?)
}

// A number is free for a digital ticket when it is paid and has no seller, no void, no link
// (not even a revoked one: whoever saw its QR may still hold it, ADR 0030) and no entry. The
// queries below spell this out each (sqlx needs literal queries); change them together.

/// The smallest free number: the natural pick for a ticket that will only exist on a phone.
async fn next_free_number(state: &AppState, event_id: Uuid) -> ApiResult<Option<i32>> {
    Ok(sqlx::query_scalar!(
        r#"select min(n) as "n" from ticket_batches b
           cross join lateral generate_series(lower(b.numbers), upper(b.numbers) - 1) as n
           where b.event_id = $1 and b.status = 'paid'
             and not exists (select 1 from seller_assignments a where a.event_id = b.event_id and a.numbers @> n)
             and not exists (select 1 from ticket_voids v where v.event_id = b.event_id and v.undone_at is null
                             and v.numbers @> n)
             and not exists (select 1 from ticket_links l where l.event_id = b.event_id and l.ticket_number = n)
             and not exists (select 1 from entries e where e.event_id = b.event_id and e.ticket_number = n)"#,
        event_id
    )
    .fetch_one(&state.pool)
    .await?)
}

/// Free numbers of each category, in the categories' order, then those outside every category
/// (listed when there are any, or when the event has no categories).
async fn stock(state: &AppState, event_id: Uuid) -> ApiResult<Vec<TicketStockDto>> {
    let (categories, counts) = tokio::try_join!(
        sqlx::query_scalar!(
            "select id from ticket_categories where event_id = $1 order by position, name",
            event_id
        )
        .fetch_all(&state.pool),
        sqlx::query!(
            r#"with free as (
                 select n, (select r.category_id from category_ranges r
                            where r.event_id = b.event_id and r.numbers @> n) as category_id
                 from ticket_batches b
                 cross join lateral generate_series(lower(b.numbers), upper(b.numbers) - 1) as n
                 where b.event_id = $1 and b.status = 'paid'
                   and not exists (select 1 from seller_assignments a where a.event_id = b.event_id and a.numbers @> n)
                   and not exists (select 1 from ticket_voids v where v.event_id = b.event_id and v.undone_at is null
                                   and v.numbers @> n)
                   and not exists (select 1 from ticket_links l where l.event_id = b.event_id and l.ticket_number = n)
                   and not exists (select 1 from entries e where e.event_id = b.event_id and e.ticket_number = n))
               select category_id, count(*)::int4 as "free!", min(n) as "next!" from free group by category_id"#,
            event_id
        )
        .fetch_all(&state.pool),
    )?;
    let count_of = |category: Option<Uuid>| {
        counts
            .iter()
            .find(|row| row.category_id == category)
            .map_or((0, None), |row| (row.free, Some(row.next)))
    };
    let mut list: Vec<TicketStockDto> = categories
        .iter()
        .map(|&id| {
            let (free, next_number) = count_of(Some(id));
            TicketStockDto {
                category_id: Some(id),
                free,
                next_number,
            }
        })
        .collect();
    let (free, next_number) = count_of(None);
    if free > 0 || categories.is_empty() {
        list.push(TicketStockDto {
            category_id: None,
            free,
            next_number,
        });
    }
    Ok(list)
}

/// Up to `limit` free numbers of `category` (`None`: outside every category), skipping
/// `taken`, each with its batch's key id.
async fn free_numbers(
    state: &AppState,
    event_id: Uuid,
    category: Option<Uuid>,
    taken: &[i32],
    limit: i32,
) -> ApiResult<Vec<(i32, i16)>> {
    let rows = sqlx::query!(
        r#"select n as "number!", b.key_id from ticket_batches b
           cross join lateral generate_series(lower(b.numbers), upper(b.numbers) - 1) as n
           where b.event_id = $1 and b.status = 'paid'
             and not (n = any($3::int4[]))
             and case when $2::uuid is null
                      then not exists (select 1 from category_ranges r where r.event_id = b.event_id
                                       and r.numbers @> n)
                      else exists (select 1 from category_ranges r where r.event_id = b.event_id
                                   and r.category_id = $2 and r.numbers @> n) end
             and not exists (select 1 from seller_assignments a where a.event_id = b.event_id and a.numbers @> n)
             and not exists (select 1 from ticket_voids v where v.event_id = b.event_id and v.undone_at is null
                             and v.numbers @> n)
             and not exists (select 1 from ticket_links l where l.event_id = b.event_id and l.ticket_number = n)
             and not exists (select 1 from entries e where e.event_id = b.event_id and e.ticket_number = n)
           order by n limit $4"#,
        event_id,
        category,
        taken,
        i64::from(limit),
    )
    .fetch_all(&state.pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|row| (row.number, row.key_id))
        .collect())
}

/// `GET /api/events/{id}/tickets`: every link of the event, active first.
pub async fn list(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
) -> ApiResult<Json<TicketLinksDto>> {
    let access = super::event_access(&state.pool, &user, event_id).await?;
    // Each link is a valid ticket: only who delivers tickets sees them (ADR 0055); the others
    // see the list with the links blank.
    let delivers = access.can(crate::api::TeamArea::Delivery);
    let (_, digits) = number_style(&state, event_id).await?;
    let links = load_links(&state, event_id, None)
        .await?
        .into_iter()
        .map(|row| {
            row.into_dto(&state, digits).map(|mut dto| {
                if !delivers {
                    dto.url = String::new();
                    dto.holder_phone = None;
                }
                dto
            })
        })
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
        stock: stock(&state, event_id).await?,
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

/// Who sends a link: a person on the panel or a seller from their own page (ADR 0061).
#[derive(Clone, Copy)]
pub(crate) enum Sender {
    User(Uuid),
    Seller(Uuid),
}

/// A link ready to be stored: the number's signed QR, sealed with a fresh token.
struct NewLink {
    id: Uuid,
    number: i32,
    hash: Vec<u8>,
    sealed: Vec<u8>,
}

/// Signs `numbers` (`jobs::sign_numbers`, the only signer) and seals each QR with a new token.
async fn prepare_links(
    state: &AppState,
    event: &EventRow,
    numbers: &[(i32, i16)],
) -> ApiResult<Vec<NewLink>> {
    jobs::sign_numbers(state, event.id, event.qr_tag, numbers)
        .await?
        .into_iter()
        .map(|(number, qr_text)| {
            let id = Uuid::new_v4();
            let (token, hash) = new_token()?;
            let sealed = seal(state, id, &token, &qr_text)?;
            Ok(NewLink {
                id,
                number,
                hash,
                sealed,
            })
        })
        .collect()
}

/// Stores a prepared link, unless the number already has an active one (then `None`).
async fn insert_link(
    tx: &mut Transaction<'_, Postgres>,
    event_id: Uuid,
    link: &NewLink,
    holder: Option<&str>,
    sender: Sender,
) -> ApiResult<Option<Uuid>> {
    let (user, seller) = match sender {
        Sender::User(id) => (Some(id), None),
        Sender::Seller(id) => (None, Some(id)),
    };
    Ok(sqlx::query_scalar!(
        r#"insert into ticket_links (id, event_id, ticket_number, holder_name, token_hash, sealed, created_by, seller_id)
           values ($1, $2, $3, $4, $5, $6, $7, $8)
           on conflict (event_id, ticket_number) where revoked_at is null do nothing
           returning id"#,
        link.id,
        event_id,
        link.number,
        holder,
        link.hash,
        link.sealed,
        user,
        seller,
    )
    .fetch_optional(&mut **tx)
    .await?)
}

/// Signs and stores links for `numbers` (skipping numbers that already have an active link).
async fn create_links(
    state: &AppState,
    event: &EventRow,
    numbers: &[(i32, i16)],
    holder: Option<&str>,
    sender: Sender,
) -> ApiResult<Vec<Uuid>> {
    let prepared = prepare_links(state, event, numbers).await?;
    if prepared.is_empty() {
        return Ok(Vec::new());
    }
    let (user, seller) = match sender {
        Sender::User(id) => (Some(id), None),
        Sender::Seller(id) => (None, Some(id)),
    };
    let ids: Vec<Uuid> = prepared.iter().map(|link| link.id).collect();
    let numbers: Vec<i32> = prepared.iter().map(|link| link.number).collect();
    let hashes: Vec<Vec<u8>> = prepared.iter().map(|link| link.hash.clone()).collect();
    let sealed: Vec<Vec<u8>> = prepared.iter().map(|link| link.sealed.clone()).collect();
    // One statement for the whole bulk (up to MAX_BULK links), instead of one round trip each.
    let inserted: HashSet<Uuid> = sqlx::query_scalar!(
        r#"insert into ticket_links (id, event_id, ticket_number, holder_name, token_hash, sealed, created_by, seller_id)
           select t.id, $2, t.number, $3, t.hash, t.sealed, $4, $5
           from unnest($1::uuid[], $6::int4[], $7::bytea[], $8::bytea[]) as t(id, number, hash, sealed)
           on conflict (event_id, ticket_number) where revoked_at is null do nothing
           returning id"#,
        &ids,
        event.id,
        holder,
        user,
        seller,
        &numbers,
        &hashes,
        &sealed,
    )
    .fetch_all(&state.pool)
    .await?
    .into_iter()
    .collect();
    Ok(ids.into_iter().filter(|id| inserted.contains(id)).collect())
}

pub(crate) fn ensure_open(event: &EventRow) -> ApiResult<()> {
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
    let created = create_links(
        &state,
        &event,
        &numbers,
        holder.as_deref(),
        Sender::User(user.id),
    )
    .await?;
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
    let created = create_links(&state, &event, &numbers, None, Sender::User(user.id)).await?;
    let (_, digits) = number_style(&state, event_id).await?;
    let mut rows = load_links(&state, event_id, Some(&created)).await?;
    rows.sort_by_key(|row| row.ticket_number);
    let links = rows
        .into_iter()
        .map(|row| row.into_dto(&state, digits))
        .collect::<ApiResult<Vec<_>>>()?;
    Ok((StatusCode::CREATED, Json(links)))
}

// Issued by category, for people (ADR 0123) ----------------------------------------------------

/// Tickets one order may take: a family or a table, not a batch.
const MAX_ORDER_QUANTITY: i32 = 50;
/// Tries when another request takes the same free numbers first.
const ISSUE_ATTEMPTS: usize = 3;

/// A checked order.
struct Order {
    category: Option<Uuid>,
    quantity: i32,
    holder: Option<String>,
    phone: Option<String>,
    note: Option<String>,
}

fn holder_phone(value: Option<String>) -> ApiResult<Option<String>> {
    super::organization::normalize_whatsapp(value)
}

fn note(value: Option<String>) -> ApiResult<Option<String>> {
    super::events::short_text(value, MAX_NOTE, "invalid_note")
}

fn check_orders(body: IssueTicketsBody, categories: &[Uuid]) -> ApiResult<Vec<Order>> {
    if body.orders.is_empty() {
        return Err(bad_request(
            "invalid_ticket_quantity",
            "at least one ticket",
        ));
    }
    let mut total = 0;
    body.orders
        .into_iter()
        .map(|order| {
            if !(1..=MAX_ORDER_QUANTITY).contains(&order.quantity) {
                return Err(bad_request(
                    "invalid_ticket_quantity",
                    format!("1 to {MAX_ORDER_QUANTITY} tickets per person"),
                ));
            }
            total += order.quantity;
            if total > MAX_BULK {
                return Err(bad_request(
                    "invalid_ticket_quantity",
                    format!("up to {MAX_BULK} tickets at once"),
                ));
            }
            if order
                .category_id
                .is_some_and(|id| !categories.contains(&id))
            {
                return Err(ApiError::NotFound);
            }
            Ok(Order {
                category: order.category_id,
                quantity: order.quantity,
                holder: holder_name(order.holder_name)?,
                phone: holder_phone(order.holder_phone)?,
                note: note(order.note)?,
            })
        })
        .collect()
}

/// Free numbers of one category, with their key ids, taken from the front.
type FreePool = std::collections::VecDeque<(i32, i16)>;

/// The numbers of each order: the next free ones of its category, none given twice.
async fn pick_numbers(
    state: &AppState,
    event_id: Uuid,
    orders: &[Order],
) -> ApiResult<Vec<Vec<(i32, i16)>>> {
    let mut taken: Vec<i32> = Vec::new();
    let mut picks = Vec::with_capacity(orders.len());
    // Each category is read once, for every order of it.
    let mut pools: Vec<(Option<Uuid>, FreePool)> = Vec::new();
    for order in orders {
        if !pools
            .iter()
            .any(|(category, _)| *category == order.category)
        {
            let need: i32 = orders
                .iter()
                .filter(|other| other.category == order.category)
                .map(|other| other.quantity)
                .sum();
            let free = free_numbers(state, event_id, order.category, &taken, need).await?;
            if free.len() < usize::try_from(need).unwrap_or(usize::MAX) {
                return Err(ApiError::Conflict(
                    "not_enough_tickets",
                    format!("{need} tickets asked, {} free", free.len()),
                ));
            }
            taken.extend(free.iter().map(|(number, _)| *number));
            pools.push((order.category, free.into()));
        }
        let pool = pools
            .iter_mut()
            .find(|(category, _)| *category == order.category)
            .map(|(_, pool)| pool)
            .ok_or_else(|| ApiError::Internal(anyhow::anyhow!("pool of an order missing")))?;
        let count = usize::try_from(order.quantity).unwrap_or(0);
        picks.push(pool.drain(..count.min(pool.len())).collect());
    }
    Ok(picks)
}

/// `POST /api/events/{id}/tickets/issue`: digital tickets for one or more people, each from
/// the free numbers of the chosen category, with their WhatsApp and a note. All or nothing: a
/// spreadsheet imported twice by mistake fails whole instead of half.
pub async fn issue(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
    Json(body): Json<IssueTicketsBody>,
) -> ApiResult<(StatusCode, Json<IssuedTicketsDto>)> {
    let event = authorize_event(&state.pool, &user, event_id).await?;
    ensure_open(&event)?;
    let categories = sqlx::query_scalar!(
        "select id from ticket_categories where event_id = $1",
        event_id
    )
    .fetch_all(&state.pool)
    .await?;
    let orders = check_orders(body, &categories)?;
    for _ in 0..ISSUE_ATTEMPTS {
        let picks = pick_numbers(&state, event_id, &orders).await?;
        let numbers: Vec<(i32, i16)> = picks.iter().flatten().copied().collect();
        let prepared = prepare_links(&state, &event, &numbers).await?;
        let mut ids = Vec::with_capacity(prepared.len());
        let mut holders = Vec::with_capacity(prepared.len());
        let mut phones = Vec::with_capacity(prepared.len());
        let mut notes = Vec::with_capacity(prepared.len());
        let mut chosen = Vec::with_capacity(prepared.len());
        let mut hashes = Vec::with_capacity(prepared.len());
        let mut sealed = Vec::with_capacity(prepared.len());
        let mut order_ids: Vec<Vec<Uuid>> = vec![Vec::new(); orders.len()];
        for link in &prepared {
            let index = picks
                .iter()
                .position(|pick| pick.iter().any(|(number, _)| *number == link.number))
                .ok_or_else(|| ApiError::Internal(anyhow::anyhow!("signed number not picked")))?;
            let order = orders
                .get(index)
                .ok_or_else(|| ApiError::Internal(anyhow::anyhow!("order out of range")))?;
            ids.push(link.id);
            holders.push(order.holder.clone());
            phones.push(order.phone.clone());
            notes.push(order.note.clone());
            chosen.push(link.number);
            hashes.push(link.hash.clone());
            sealed.push(link.sealed.clone());
            if let Some(list) = order_ids.get_mut(index) {
                list.push(link.id);
            }
        }
        let mut tx = state.pool.begin().await?;
        let inserted = sqlx::query_scalar!(
            r#"insert into ticket_links (id, event_id, ticket_number, holder_name, holder_phone, note,
                                         token_hash, sealed, created_by)
               select t.id, $2, t.number, t.holder, t.phone, t.note, t.hash, t.sealed, $3
               from unnest($1::uuid[], $4::int4[], $5::text[], $6::text[], $7::text[], $8::bytea[], $9::bytea[])
                    as t(id, number, holder, phone, note, hash, sealed)
               on conflict (event_id, ticket_number) where revoked_at is null do nothing
               returning id"#,
            &ids,
            event_id,
            user.id,
            &chosen,
            &holders as &[Option<String>],
            &phones as &[Option<String>],
            &notes as &[Option<String>],
            &hashes,
            &sealed,
        )
        .fetch_all(&mut *tx)
        .await?;
        if inserted.len() < ids.len() {
            // Someone took one of these numbers meanwhile: pick again.
            tx.rollback().await?;
            continue;
        }
        tx.commit().await?;
        let (_, digits) = number_style(&state, event_id).await?;
        let mut rows = load_links(&state, event_id, Some(&ids)).await?;
        rows.sort_by_key(|row| row.ticket_number);
        let mut links: std::collections::HashMap<Uuid, TicketLinkDto> = rows
            .into_iter()
            .map(|row| row.into_dto(&state, digits).map(|dto| (dto.id, dto)))
            .collect::<ApiResult<_>>()?;
        let orders = order_ids
            .into_iter()
            .map(|list| {
                let mut links: Vec<TicketLinkDto> =
                    list.iter().filter_map(|id| links.remove(id)).collect();
                links.sort_by_key(|link| link.number);
                IssuedOrderDto { links }
            })
            .collect();
        return Ok((StatusCode::CREATED, Json(IssuedTicketsDto { orders })));
    }
    Err(ApiError::Conflict(
        "ticket_link_exists",
        "other tickets were sent at the same time, try again".to_owned(),
    ))
}

/// `POST /api/events/{id}/tickets/sent`: the links someone just sent from the panel (WhatsApp,
/// copied), so the list knows who still waits for theirs.
pub async fn mark_sent(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
    Json(body): Json<MarkTicketsSentBody>,
) -> ApiResult<StatusCode> {
    authorize_event(&state.pool, &user, event_id).await?;
    if body.ids.is_empty() || body.ids.len() > usize::try_from(MAX_BULK).unwrap_or(500) {
        return Err(bad_request("invalid_ids", "1 to 500 links"));
    }
    sqlx::query!(
        "update ticket_links set sent_at = now() where event_id = $1 and id = any($2)",
        event_id,
        &body.ids,
    )
    .execute(&state.pool)
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

// Sent by a seller (ADR 0061) -----------------------------------------------------------------

/// Sends the digital ticket of `number` for a seller: a new link for the buyer, or nothing when
/// the number already has an active one. The caller checks that the seller sold the number.
pub(crate) async fn send_for_seller(
    state: &AppState,
    event: &EventRow,
    seller_id: Uuid,
    number: i32,
    holder: Option<&str>,
) -> ApiResult<()> {
    ensure_open(event)?;
    let numbers = issuable(state, event.id, number, number).await?;
    if numbers.is_empty() {
        return Err(ApiError::Conflict(
            "ticket_voided",
            "this ticket number is voided".to_owned(),
        ));
    }
    let active = sqlx::query_scalar!(
        r#"select exists(select 1 from ticket_links where event_id = $1 and ticket_number = $2
                         and revoked_at is null) as "active!""#,
        event.id,
        number,
    )
    .fetch_one(&state.pool)
    .await?;
    if !active {
        // A number that already went through the door is not sold again by a phone.
        let entered = sqlx::query_scalar!(
            r#"select exists(select 1 from entries where event_id = $1 and ticket_number = $2) as "entered!""#,
            event.id,
            number
        )
        .fetch_one(&state.pool)
        .await?;
        if entered {
            return Err(ApiError::Conflict(
                "ticket_entered",
                "this ticket already entered".to_owned(),
            ));
        }
        create_links(state, event, &numbers, holder, Sender::Seller(seller_id)).await?;
    }
    Ok(())
}

/// The active digital tickets a seller sent for an event's numbers, as links to send again
/// (for the seller's page). A link the organizer made, or the holder got by a transfer, is the
/// holder's own (ADR 0061, 0119).
pub(crate) async fn active_urls(
    state: &AppState,
    event_id: Uuid,
    seller_id: Uuid,
    numbers: &[i32],
) -> ApiResult<std::collections::HashMap<i32, String>> {
    let rows = sqlx::query!(
        r#"select id, ticket_number, sealed from ticket_links
           where event_id = $1 and seller_id = $3 and revoked_at is null and ticket_number = any($2)"#,
        event_id,
        numbers,
        seller_id,
    )
    .fetch_all(&state.pool)
    .await?;
    rows.into_iter()
        .map(|row| {
            let secret = unseal(state, row.id, &row.sealed)?;
            Ok((row.ticket_number, link_url(state, &secret.token)))
        })
        .collect()
}

/// Revokes the links a seller sent for a number (the sale was undone).
pub(crate) async fn revoke_seller_links(
    state: &AppState,
    event_id: Uuid,
    seller_id: Uuid,
    number: i32,
) -> ApiResult<()> {
    sqlx::query!(
        r#"update ticket_links set revoked_at = now()
           where event_id = $1 and seller_id = $2 and ticket_number = $3 and revoked_at is null"#,
        event_id,
        seller_id,
        number,
    )
    .execute(&state.pool)
    .await?;
    Ok(())
}

// Replacement of a lost ticket (ADR 0061) ---------------------------------------------------

const MAX_NOTE: usize = 200;

/// Whether `number` is free to be sent instead of a lost one: paid, not voided, with no active
/// link, no entry and no seller (a seller would be charged for it).
async fn is_free(state: &AppState, event_id: Uuid, number: i32) -> ApiResult<bool> {
    Ok(sqlx::query_scalar!(
        r#"select exists(
               select 1 from ticket_batches b
               where b.event_id = $1 and b.status = 'paid' and b.numbers @> $2::int4
                 and not exists (select 1 from seller_assignments a where a.event_id = $1 and a.numbers @> $2::int4)
                 and not exists (select 1 from ticket_voids v where v.event_id = $1 and v.undone_at is null
                                 and v.numbers @> $2::int4)
                 and not exists (select 1 from ticket_links l where l.event_id = $1 and l.revoked_at is null
                                 and l.ticket_number = $2)
                 and not exists (select 1 from entries e where e.event_id = $1 and e.ticket_number = $2)
           ) as "free!""#,
        event_id,
        number,
    )
    .fetch_one(&state.pool)
    .await?)
}

/// The smallest free number in the same category as `lost` (ADR 0056), or with no category when
/// `lost` has none: the door must show the replacement as it would have shown the lost ticket.
async fn free_number_like(state: &AppState, event_id: Uuid, lost: i32) -> ApiResult<Option<i32>> {
    Ok(sqlx::query_scalar!(
        r#"with lost as (
               select category_id from category_ranges where event_id = $1 and numbers @> $2::int4
           )
           select min(n) as "n" from ticket_batches b
           cross join lateral generate_series(lower(b.numbers), upper(b.numbers) - 1) as n
           where b.event_id = $1 and b.status = 'paid' and n <> $2
             and not exists (select 1 from seller_assignments a where a.event_id = $1 and a.numbers @> n)
             and not exists (select 1 from ticket_voids v where v.event_id = $1 and v.undone_at is null
                             and v.numbers @> n)
             and not exists (select 1 from ticket_links l where l.event_id = $1 and l.revoked_at is null
                             and l.ticket_number = n)
             and not exists (select 1 from entries e where e.event_id = $1 and e.ticket_number = n)
             and (select category_id from category_ranges cr where cr.event_id = $1 and cr.numbers @> n)
                 is not distinct from (select category_id from lost)"#,
        event_id,
        lost,
    )
    .fetch_one(&state.pool)
    .await?)
}

/// Who holds `number`: the name on its active digital ticket, or the buyer the seller marked.
async fn holder_of(state: &AppState, event_id: Uuid, number: i32) -> ApiResult<Option<String>> {
    Ok(sqlx::query_scalar!(
        r#"select coalesce(
               (select holder_name from ticket_links where event_id = $1 and ticket_number = $2
                and revoked_at is null),
               (select buyer_name from ticket_sales where event_id = $1 and ticket_number = $2)
           ) as "holder?""#,
        event_id,
        number,
    )
    .fetch_one(&state.pool)
    .await?)
}

fn ticket_number_in_range(number: i32) -> ApiResult<i32> {
    if (1..=MAX_TICKET_NUMBER).contains(&number) {
        Ok(number)
    } else {
        Err(bad_request(
            "invalid_number",
            format!("ticket numbers go from 1 to {MAX_TICKET_NUMBER}"),
        ))
    }
}

/// The lost number must be paid, not voided and not used at the door yet.
async fn ensure_replaceable(state: &AppState, event_id: Uuid, old: i32) -> ApiResult<()> {
    if issuable(state, event_id, old, old).await?.is_empty() {
        let voided = sqlx::query_scalar!(
            r#"select exists(select 1 from ticket_voids where event_id = $1 and undone_at is null
                             and numbers @> $2::int4) as "voided!""#,
            event_id,
            old
        )
        .fetch_one(&state.pool)
        .await?;
        return Err(if voided {
            ApiError::Conflict("ticket_voided", "this ticket number is voided".to_owned())
        } else {
            bad_request("ticket_not_issued", "this number is not in a paid batch")
        });
    }
    let entered = sqlx::query_scalar!(
        r#"select exists(select 1 from entries where event_id = $1 and ticket_number = $2) as "entered!""#,
        event_id,
        old
    )
    .fetch_one(&state.pool)
    .await?;
    if entered {
        return Err(ApiError::Conflict(
            "ticket_entered",
            "this ticket already entered".to_owned(),
        ));
    }
    Ok(())
}

/// The number sent instead: the one asked for, if free, or the next free one like the lost one.
async fn replacement_number(
    state: &AppState,
    event_id: Uuid,
    old: i32,
    asked: Option<i32>,
) -> ApiResult<i32> {
    match asked {
        Some(number) => {
            let number = ticket_number_in_range(number)?;
            if number == old || !is_free(state, event_id, number).await? {
                return Err(ApiError::Conflict(
                    "number_not_free",
                    "the new number must be paid, free and with no seller".to_owned(),
                ));
            }
            Ok(number)
        }
        None => free_number_like(state, event_id, old)
            .await?
            .ok_or(ApiError::Conflict(
                "no_free_tickets",
                "no free paid number of this category".to_owned(),
            )),
    }
}

/// `POST /api/events/{id}/tickets/replace`: the replacement of a lost ticket, in one step. The
/// lost number is voided as `revoked` (whoever sold it still answers for it: the buyer paid) and
/// its digital ticket stops opening; a free number, of the same category, goes to the same person
/// as a digital ticket and takes over the lost number's seat.
pub async fn replace(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
    Json(body): Json<ReplaceTicketBody>,
) -> ApiResult<(StatusCode, Json<TicketReplacementDto>)> {
    let event = authorize_event(&state.pool, &user, event_id).await?;
    ensure_open(&event)?;
    let holder = holder_name(body.holder_name)?;
    let note = optional_text(body.note);
    if note
        .as_ref()
        .is_some_and(|note| note.chars().count() > MAX_NOTE)
    {
        return Err(bad_request(
            "invalid_note",
            "note must have up to 200 characters",
        ));
    }
    let old = ticket_number_in_range(body.number)?;
    ensure_replaceable(&state, event_id, old).await?;
    let holder = match holder {
        Some(holder) => Some(holder),
        None => holder_of(&state, event_id, old).await?,
    };
    let new_number = replacement_number(&state, event_id, old, body.new_number).await?;
    let numbers = issuable(&state, event_id, new_number, new_number).await?;
    let prepared = prepare_links(&state, &event, &numbers).await?;
    let link = prepared
        .first()
        .ok_or_else(|| ApiError::Internal(anyhow::anyhow!("nothing signed")))?;

    let mut tx = state.pool.begin().await?;
    let void_id = sqlx::query_scalar!(
        r#"insert into ticket_voids (id, event_id, numbers, reason, note, created_by)
           select $1, $2, int4range($3, $3, '[]'), 'revoked', $4, $5
           where not exists (select 1 from ticket_voids where event_id = $2 and undone_at is null
                             and numbers @> $3::int4)
           returning id"#,
        Uuid::new_v4(),
        event_id,
        old,
        note,
        user.id,
    )
    .fetch_optional(&mut *tx)
    .await?
    .ok_or(ApiError::Conflict(
        "ticket_voided",
        "this ticket number is voided".to_owned(),
    ))?;
    sqlx::query!(
        r#"update ticket_links set revoked_at = now()
           where event_id = $1 and ticket_number = $2 and revoked_at is null"#,
        event_id,
        old
    )
    .execute(&mut *tx)
    .await?;
    let link_id = insert_link(
        &mut tx,
        event_id,
        link,
        holder.as_deref(),
        Sender::User(user.id),
    )
    .await?
    .ok_or(ApiError::Conflict(
        "number_not_free",
        "the new number must be paid, free and with no seller".to_owned(),
    ))?;
    // The seat goes with the person (ADR 0057), unless the new number has one already.
    sqlx::query!(
        r#"update ticket_seats set ticket_number = $3
           where event_id = $1 and ticket_number = $2
             and not exists (select 1 from ticket_seats where event_id = $1 and ticket_number = $3)"#,
        event_id,
        old,
        new_number,
    )
    .execute(&mut *tx)
    .await?;
    sqlx::query!(
        r#"insert into ticket_replacements (id, event_id, old_number, new_number, void_id, link_id, created_by)
           values ($1, $2, $3, $4, $5, $6, $7)"#,
        Uuid::new_v4(),
        event_id,
        old,
        new_number,
        void_id,
        link_id,
        user.id,
    )
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    let (_, digits) = number_style(&state, event_id).await?;
    Ok((
        StatusCode::CREATED,
        Json(TicketReplacementDto {
            old_number: old,
            old_label: label(old, digits),
            link: reload(&state, event_id, link_id).await?,
        }),
    ))
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

/// `PUT /api/ticket-links/{id}`: the holder's name, WhatsApp and the organizer's note.
pub async fn update(
    State(state): State<AppState>,
    user: AuthUser,
    Path(link_id): Path<Uuid>,
    Json(body): Json<UpdateTicketLinkBody>,
) -> ApiResult<Json<TicketLinkDto>> {
    let event_id = link_event(&state, link_id).await?;
    authorize_event(&state.pool, &user, event_id).await?;
    let holder = holder_name(body.holder_name)?;
    // Missing keeps the phone and the note (older panels send the name only); blank clears.
    let phone = body
        .holder_phone
        .map(|phone| holder_phone(Some(phone)))
        .transpose()?;
    let note = body.note.map(|text| note(Some(text))).transpose()?;
    sqlx::query!(
        r#"update ticket_links set holder_name = $2,
                  holder_phone = case when $3 then $4 else holder_phone end,
                  note = case when $5 then $6 else note end
           where id = $1"#,
        link_id,
        holder,
        phone.is_some(),
        phone.flatten(),
        note.is_some(),
        note.flatten(),
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
    seller_id: Option<Uuid>,
    created_by: Option<Uuid>,
    transfer_count: i16,
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
               returning id, event_id, ticket_number, holder_name, sealed, seller_id, created_by, transfer_count"#,
            hash
        )
        .fetch_optional(&state.pool)
        .await?
    } else {
        sqlx::query_as!(
            OpenRow,
            r#"select id, event_id, ticket_number, holder_name, sealed, seller_id, created_by, transfer_count
               from ticket_links where token_hash = $1 and revoked_at is null"#,
            hash
        )
        .fetch_optional(&state.pool)
        .await?
    };
    match row {
        Some(row) => Ok(row),
        None => Err(gone_or_missing(state, &hash).await?),
    }
}

/// Why a token opens nothing: passed on to someone else (ADR 0097, `410 ticket_transferred`, so
/// the old phone says so and forgets it) or simply not there.
async fn gone_or_missing(state: &AppState, hash: &[u8]) -> ApiResult<ApiError> {
    let transferred = sqlx::query_scalar!(
        r#"select exists(select 1 from ticket_links where token_hash = $1 and transferred_at is not null) as "transferred!""#,
        hash
    )
    .fetch_one(&state.pool)
    .await?;
    Ok(if transferred {
        ApiError::Gone("ticket_transferred")
    } else {
        ApiError::NotFound
    })
}

/// The days of an event of several days (ADR 0091) and the one it is on now (0: one day).
async fn days_and_today(state: &AppState, event_id: Uuid) -> ApiResult<(Vec<EventDayDto>, i16)> {
    let offset = sqlx::query_scalar!(
        "select utc_offset_minutes from events where id = $1",
        event_id
    )
    .fetch_one(&state.pool)
    .await?;
    let days = crate::event_days::of_event(
        &state.pool,
        event_id,
        time::UtcOffset::from_whole_seconds(i32::from(offset) * 60).unwrap_or(time::UtcOffset::UTC),
    )
    .await?;
    let spans: Vec<crate::event_days::Day> = days
        .iter()
        .map(|day| crate::event_days::Day {
            starts_at: day.starts_at,
            ends_at: day.ends_at,
        })
        .collect();
    let today = crate::event_days::current(&spans, OffsetDateTime::now_utc()).unwrap_or(0);
    Ok((days, i16::from(today)))
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
    let pass = build_pass(&state, &link).await?;
    Ok((
        [(CACHE_CONTROL, HeaderValue::from_static("no-store"))],
        Json(pass),
    )
        .into_response())
}

/// Transfers a holder may make in a row (ADR 0097): enough to give a ticket to a friend, few
/// enough to keep resale chains short.
const MAX_TRANSFERS: i16 = 3;

/// What the holder's phone shows for `link`.
async fn build_pass(state: &AppState, link: &OpenRow) -> ApiResult<TicketPassDto> {
    let (days, today) = days_and_today(state, link.event_id).await?;
    let event = sqlx::query!(
        r#"select e.name, e.venue, e.starts_at, e.ends_at, e.utc_offset_minutes, o.name as organizer,
                  coalesce((select spec ->> 'backgroundColor' from ticket_designs d
                            where d.event_id = e.id order by version desc limit 1), '#ffffff') as "background!",
                  exists(select 1 from ticket_voids v where v.event_id = e.id and v.undone_at is null
                         and v.numbers @> $2::int4) as "voided!",
                  -- Used today: in an event of several days a pass enters again the next day
                  -- (ADR 0091), so only today's book or the whole event's counts.
                  (select s.scanned_at from door_ledger_entries en join scans s on s.id = en.first_scan_id
                   where en.event_id = e.id and en.ticket_number = $2
                     and en.checkpoint = '00000000-0000-0000-0000-000000000000'
                     and (en.ledger_day = 0 or en.ledger_day = $3)
                   order by s.scanned_at limit 1) as "entered_at?"
           from events e join organizations o on o.id = e.organization_id
           where e.id = $1"#,
        link.event_id,
        link.ticket_number,
        today,
    )
    .fetch_one(&state.pool)
    .await?;
    let secret = unseal(state, link.id, &link.sealed)?;
    let (prefix, digits) = number_style(state, link.event_id).await?;
    let offset = time::UtcOffset::from_whole_seconds(i32::from(event.utc_offset_minutes) * 60)
        .unwrap_or(time::UtcOffset::UTC);
    let ticket_state = state_of(event.voided, event.entered_at);
    let tags = super::categories::NumberTags::load(&state.pool, link.event_id).await?;
    let row = sqlx::query_as!(
        EventRow,
        r#"select id, name, venue, starts_at, ends_at, ticket_price_cents, status, qr_tag,
                  utc_offset_minutes, address, postponed_from_starts_at, postponed_at,
                  postpone_reason, canceled_at, cancel_reason, kind, digital_only
           from events where id = $1"#,
        link.event_id
    )
    .fetch_one(&state.pool)
    .await?;
    let pass = TicketPassDto {
        category: tags.tag(link.ticket_number),
        seat: tags.seat(link.ticket_number),
        event: TicketPassEvent {
            name: event.name,
            venue: event.venue,
            starts_at: event.starts_at.to_offset(offset),
            ends_at: event.ends_at.to_offset(offset),
            organizer: event.organizer,
            id: link.event_id,
            address: row.address.clone(),
            change: row.change(),
            in_series: super::series::in_series(&state.pool, link.event_id).await?,
            kind: row.kind(),
            days,
        },
        organization: super::organization::event_organization(&state.pool, link.event_id).await?,
        table_map: table_map(state, link.event_id, link.ticket_number).await?,
        // No Pix for a ticket that is voided or of a canceled event (ADR 0085).
        pix: if ticket_state == TicketState::Voided || row.canceled_at.is_some() {
            None
        } else {
            super::pix::ticket_pix(&state.pool, link.event_id, link.ticket_number).await?
        },
        number: link.ticket_number,
        number_label: label(link.ticket_number, digits),
        number_prefix: prefix,
        holder_name: link.holder_name.clone(),
        // A voided ticket shows why, not a QR the door would refuse anyway.
        qr_text: (ticket_state != TicketState::Voided).then_some(secret.qr_text),
        state: ticket_state,
        entered_at: event.entered_at,
        background_color: event.background,
        transfers_left: if ticket_state == TicketState::Valid
            && row.canceled_at.is_none()
            && row.ends_at > OffsetDateTime::now_utc()
            && transfers_on(state, link.event_id).await?
        {
            (MAX_TRANSFERS - link.transfer_count).max(0)
        } else {
            0
        },
        wallets: PassWalletsDto {
            apple: state.config.wallets.apple.is_some() && ticket_state != TicketState::Voided,
            google: state.config.wallets.google.is_some() && ticket_state != TicketState::Voided,
        },
    };
    Ok(pass)
}

async fn transfers_on(state: &AppState, event_id: Uuid) -> ApiResult<bool> {
    Ok(sqlx::query_scalar!(
        "select ticket_transfers from events where id = $1",
        event_id
    )
    .fetch_one(&state.pool)
    .await?)
}

/// `POST /api/ticket/transfer` (no login; the token is the credential): the holder passes the
/// ticket on (ADR 0097). The old link stops opening (it answers "transferred"), a new one opens
/// the same number with the same QR, re-sealed under a new token: nothing is signed again. A
/// copy someone kept of the old QR is still that number: the first to reach the door enters, as
/// with paper. Only a valid ticket of an event still ahead moves, a few times at most.
pub async fn transfer(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(body): Json<TransferTicketBody>,
) -> ApiResult<Json<TransferTicketDto>> {
    crate::ratelimit::by_ip(&state, &headers, crate::ratelimit::TICKET_IMAGE).await?;
    let holder = holder_name(Some(body.holder_name))?
        .ok_or_else(|| bad_request("invalid_holder_name", "who receives the ticket?"))?;
    let link = open_link(&state, &body.token, false).await?;
    let pass = build_pass(&state, &link).await?;
    if pass.transfers_left <= 0 {
        return Err(ApiError::Conflict(
            "transfer_not_allowed",
            "this ticket cannot be transferred".to_owned(),
        ));
    }
    let secret = unseal(&state, link.id, &link.sealed)?;
    let id = Uuid::new_v4();
    let (token, hash) = new_token()?;
    let sealed = seal(&state, id, &token, &secret.qr_text)?;
    let mut tx = state.pool.begin().await?;
    // The old link goes first (one active link per number), and only if still active: two
    // transfers at once cannot both win.
    let revoked = sqlx::query!(
        r#"update ticket_links set revoked_at = now(), transferred_at = now()
           where id = $1 and revoked_at is null"#,
        link.id
    )
    .execute(&mut *tx)
    .await?
    .rows_affected();
    if revoked == 0 {
        return Err(ApiError::Gone("ticket_transferred"));
    }
    sqlx::query!(
        r#"insert into ticket_links (id, event_id, ticket_number, holder_name, token_hash, sealed,
                                     created_by, seller_id, transfer_count, transferred_from)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)"#,
        id,
        link.event_id,
        link.ticket_number,
        holder,
        hash,
        sealed,
        link.created_by,
        link.seller_id,
        link.transfer_count + 1,
        link.id,
    )
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(Json(TransferTicketDto {
        url: link_url(&state, &token),
        holder_name: holder,
    }))
}

/// What a wallet pass shows, from the ticket as the holder sees it.
fn pass_content(
    state: &AppState,
    link: &OpenRow,
    pass: &TicketPassDto,
    token: &str,
) -> Option<crate::wallet::PassContent> {
    let prefix = pass.number_prefix.trim();
    // A light design gets the brand's colour (white text reads on it).
    let color = if is_dark(&pass.background_color) {
        pass.background_color.clone()
    } else {
        pass.organization
            .brand_color
            .clone()
            .filter(|color| is_dark(color))
            .unwrap_or_else(|| "#5b3df5".to_owned())
    };
    Some(crate::wallet::PassContent {
        serial: link.id.to_string(),
        event_id: link.event_id.to_string(),
        event_name: pass.event.name.clone(),
        organization: pass.organization.name.clone(),
        starts_at: pass.event.starts_at,
        ends_at: pass.event.ends_at,
        venue: pass.event.venue.clone(),
        address: pass.event.address.clone(),
        number: format!(
            "{} {}",
            if prefix.is_empty() { "Nº" } else { prefix },
            pass.number_label
        ),
        holder: pass.holder_name.clone(),
        category: pass.category.as_ref().map(|category| category.name.clone()),
        seat: pass.seat.clone(),
        qr_text: pass.qr_text.clone()?,
        color,
        url: link_url(state, token),
        tokens: pass.event.kind == crate::api::EventKind::Tokens,
    })
}

/// Whether white text reads on `#rrggbb` (relative luminance below 0.4).
fn is_dark(hex: &str) -> bool {
    let channel = |at: usize| {
        hex.get(at..at + 2)
            .and_then(|pair| u8::from_str_radix(pair, 16).ok())
            .map(|value| {
                let c = f64::from(value) / 255.0;
                if c <= 0.039_28 {
                    c / 12.92
                } else {
                    ((c + 0.055) / 1.055).powf(2.4)
                }
            })
    };
    match (hex.len(), channel(1), channel(3), channel(5)) {
        (7, Some(r), Some(g), Some(b)) => 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.4,
        _ => false,
    }
}

/// The ticket of a token for a wallet: valid or used (a voided one has no QR to carry).
async fn wallet_pass(state: &AppState, token: &str) -> ApiResult<crate::wallet::PassContent> {
    let link = open_link(state, token, false).await?;
    let pass = build_pass(state, &link).await?;
    pass_content(state, &link, &pass, token.trim()).ok_or(ApiError::Conflict(
        "ticket_voided",
        "a voided ticket has no QR".to_owned(),
    ))
}

/// `POST /api/ticket/wallet/apple` (no login): the ticket as an Apple Wallet pass (ADR 0097).
pub async fn wallet_apple(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(body): Json<OpenTicketBody>,
) -> ApiResult<Response> {
    crate::ratelimit::by_ip(&state, &headers, crate::ratelimit::TICKET_IMAGE).await?;
    let Some(apple) = state.config.wallets.apple.as_ref() else {
        return Err(ApiError::NotFound);
    };
    let pass = wallet_pass(&state, &body.token).await?;
    let bytes = apple
        .pkpass(&pass, OffsetDateTime::now_utc())
        .map_err(|error| ApiError::Internal(error.into()))?;
    Ok((
        [
            (
                CONTENT_TYPE,
                HeaderValue::from_static("application/vnd.apple.pkpass"),
            ),
            (CACHE_CONTROL, HeaderValue::from_static("no-store")),
        ],
        bytes,
    )
        .into_response())
}

/// `POST /api/ticket/wallet/google` (no login): the "save to Google Wallet" address (ADR 0097).
pub async fn wallet_google(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(body): Json<OpenTicketBody>,
) -> ApiResult<Json<GoogleWalletDto>> {
    crate::ratelimit::by_ip(&state, &headers, crate::ratelimit::TICKET_IMAGE).await?;
    let Some(google) = state.config.wallets.google.as_ref() else {
        return Err(ApiError::NotFound);
    };
    let pass = wallet_pass(&state, &body.token).await?;
    let url = google
        .save_url(
            &pass,
            &state.config.public_web_url,
            OffsetDateTime::now_utc(),
        )
        .map_err(|error| ApiError::Internal(error.into()))?;
    Ok(Json(GoogleWalletDto { url }))
}

/// `GET /api/events/{id}/ticket-settings`.
pub async fn settings(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
) -> ApiResult<Json<TicketSettingsDto>> {
    authorize_event(&state.pool, &user, event_id).await?;
    Ok(Json(TicketSettingsDto {
        transfers: transfers_on(&state, event_id).await?,
    }))
}

/// `PUT /api/events/{id}/ticket-settings`: whether holders may pass their tickets on.
pub async fn update_settings(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
    Json(body): Json<TicketSettingsDto>,
) -> ApiResult<Json<TicketSettingsDto>> {
    authorize_event(&state.pool, &user, event_id).await?;
    sqlx::query!(
        "update events set ticket_transfers = $2 where id = $1",
        event_id,
        body.transfers
    )
    .execute(&state.pool)
    .await?;
    Ok(Json(body))
}

/// The room for the holder of `number` (ADR 0066): every table of the event by name, shape and
/// place (nobody's seat but theirs), when the number has a seat.
async fn table_map(
    state: &AppState,
    event_id: Uuid,
    number: i32,
) -> ApiResult<Option<PassTableMapDto>> {
    let Some(seat) = sqlx::query!(
        r#"select t.name, s.seat from ticket_seats s join event_tables t on t.id = s.table_id
           where s.event_id = $1 and s.ticket_number = $2
             and exists(select 1 from events e where e.id = $1 and e.kind = 'tickets')"#,
        event_id,
        number,
    )
    .fetch_optional(&state.pool)
    .await?
    else {
        return Ok(None);
    };
    let tables = sqlx::query!(
        "select name, seats, shape, x, y from event_tables where event_id = $1 order by name",
        event_id
    )
    .fetch_all(&state.pool)
    .await?;
    Ok(Some(PassTableMapDto {
        tables: tables
            .into_iter()
            .map(|table| PassTableDto {
                name: table.name,
                seats: table.seats,
                shape: TableShape::from_db(&table.shape).unwrap_or(TableShape::Round),
                x: table.x,
                y: table.y,
            })
            .collect(),
        table: seat.name,
        seat: seat.seat,
    }))
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
    // The key also follows what the text blocks print (date, venue, price, organization): a
    // postponed event (ADR 0065) must not keep showing the old date.
    let drawn = sqlx::query!(
        r#"select (select coalesce(max(version), 0) from ticket_designs where event_id = e.id) as "version!",
                  e.name, e.venue, e.starts_at, e.utc_offset_minutes, e.ticket_price_cents,
                  o.name as organization
           from events e join organizations o on o.id = e.organization_id where e.id = $1"#,
        link.event_id
    )
    .fetch_one(&state.pool)
    .await?;
    let details = Sha256::digest(
        format!(
            "{}\n{}\n{}\n{}\n{:?}\n{}",
            drawn.name,
            drawn.venue.unwrap_or_default(),
            drawn.starts_at.unix_timestamp(),
            drawn.utc_offset_minutes,
            drawn.ticket_price_cents,
            drawn.organization,
        )
        .as_bytes(),
    );
    let cached = state.config.export_dir.join(format!(
        "ticket-{}-v{}-{}.jpg",
        link.id,
        drawn.version,
        hex::encode(details.get(..6).unwrap_or_default()),
    ));
    let jpeg = if let Ok(bytes) = tokio::fs::read(&cached).await {
        bytes
    } else {
        // Wait for a render slot (shared with the design previews) before loading anything big,
        // and give up after a while instead of queueing without bound.
        let permit =
            tokio::time::timeout(RENDER_WAIT, state.render_permits.clone().acquire_owned())
                .await
                .map_err(|_| ApiError::Unavailable("busy"))?
                .map_err(anyhow::Error::from)?;
        // Another request for the same link may have drawn it while this one waited.
        if let Ok(bytes) = tokio::fs::read(&cached).await {
            bytes
        } else {
            let jpeg = render_image(&state, &link, permit).await?;
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
/// Draws the ticket under `permit`, which goes with the render into the blocking task: a request
/// dropped at its timeout no longer frees the slot while the drawing keeps the CPU (ADR 0118).
async fn render_image(
    state: &AppState,
    link: &OpenRow,
    permit: tokio::sync::OwnedSemaphorePermit,
) -> ApiResult<Vec<u8>> {
    let secret = unseal(state, link.id, &link.sealed)?;
    let ticket = SignedTicket::from_qr_text(&secret.qr_text)
        .map_err(|error| ApiError::Internal(error.into()))?;
    let event = sqlx::query_as!(
        EventRow,
        r#"select id, name, venue, starts_at, ends_at, ticket_price_cents, status, qr_tag,
                  utc_offset_minutes, address, postponed_from_starts_at, postponed_at,
                  postpone_reason, canceled_at, cancel_reason, kind, digital_only
           from events where id = $1"#,
        link.event_id
    )
    .fetch_one(&state.pool)
    .await?;
    let jobs::SavedDesign {
        design,
        art,
        sponsors,
        photos,
        stub_image,
    } = jobs::current_design(state, link.event_id).await?;
    let tags = super::categories::NumberTags::load(&state.pool, link.event_id).await?;
    let number = i32::try_from(ticket.header().number.get()).unwrap_or(i32::MAX);
    let job = RenderJob {
        tokens: event.tokens(),
        details: super::event_details(&state.pool, &event).await?,
        design,
        art,
        sponsors,
        photos,
        stub_image,
        event_name: event.name,
        tickets: vec![TicketToRender {
            qr: TicketQr::Signed(ticket),
            seller: None,
            category: tags.category(number),
            seat: tags.seat(number),
        }],
    };
    let images = tokio::task::spawn_blocking(move || {
        let _permit = permit;
        ticket_render::ticket_images(&job, IMAGE_WIDTH_PX)
    })
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
