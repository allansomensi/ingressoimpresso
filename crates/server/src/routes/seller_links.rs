//! Sellers' private links (ADR 0053): the organizer creates one per seller and sends it by
//! WhatsApp; the seller opens it on the phone, without an account, sees the numbers they hold and
//! marks the ones they sold. The token is the credential: it travels in the URL fragment and in
//! request bodies, and the database keeps only its hash (plus a sealed copy, so the organizer can
//! send the same link again).

use std::collections::HashMap;

use axum::Json;
use axum::extract::{Path, State};
use axum::http::header::CACHE_CONTROL;
use axum::http::{HeaderMap, HeaderValue, Method, StatusCode};
use axum::response::{IntoResponse, Response};
use sqlx::postgres::types::PgRange;
use uuid::Uuid;

use super::seller_ops::contact;
use super::{EventRow, authorize_event, bounds, range};
use crate::api::{
    NumberRangeDto, SellerCategoryDto, SellerDueLineDto, SellerLinkDto, SellerMarkBody,
    SellerPaymentMethod, SellerSaleDto, SellerSettingsBody, SellerSettingsDto, SellerSummaryDto,
    SellerTicketBody, SellerTokenBody, SellerUnmarkBody, SellerViewDto, SellerViewEvent,
    SellerViewPaymentDto, SellerVoidDto, TicketSaleDto, VoidReason,
};
use crate::auth::{AuthUser, new_token, token_hash};
use crate::error::{ApiError, ApiResult, bad_request};
use crate::keys;
use crate::ratelimit;
use crate::state::AppState;

const SEAL_PURPOSE: &str = "seller-link";
/// Most ranges and numbers marked in one request.
const MAX_MARK_RANGES: usize = 100;
const MAX_MARK_NUMBERS: i64 = 1_000;

/// The address the seller opens: the token is in the fragment, so it never reaches a server log,
/// the site's analytics or a `Referer` (like the door and digital ticket links).
fn link_url(state: &AppState, token: &str) -> String {
    format!("{}/vendedor#{token}", state.config.public_web_url)
}

fn seal(state: &AppState, link_id: Uuid, token: &str) -> ApiResult<Vec<u8>> {
    keys::seal_data(
        &state.config.master_key,
        SEAL_PURPOSE,
        link_id,
        token.as_bytes(),
    )
    .map_err(|error| ApiError::Internal(error.into()))
}

fn unseal(state: &AppState, link_id: Uuid, sealed: &[u8]) -> ApiResult<String> {
    let plain = keys::unseal_data(&state.config.master_key, SEAL_PURPOSE, link_id, sealed)
        .map_err(|error| ApiError::Internal(error.into()))?;
    String::from_utf8(plain.to_vec()).map_err(|error| ApiError::Internal(error.into()))
}

/// The active links of an event's sellers, by seller (for the sellers list).
pub(crate) async fn active_links(
    state: &AppState,
    event_id: Uuid,
) -> ApiResult<HashMap<Uuid, SellerLinkDto>> {
    let rows = sqlx::query!(
        r#"select id, seller_id, sealed, created_at, last_opened_at from seller_links
           where event_id = $1 and revoked_at is null"#,
        event_id
    )
    .fetch_all(&state.pool)
    .await?;
    rows.into_iter()
        .map(|row| {
            let token = unseal(state, row.id, &row.sealed)?;
            Ok((
                row.seller_id,
                SellerLinkDto {
                    url: link_url(state, &token),
                    created_at: row.created_at,
                    last_opened_at: row.last_opened_at,
                },
            ))
        })
        .collect()
}

/// The event of a seller, if the user may access it (404 otherwise).
async fn seller_event(state: &AppState, user: &AuthUser, seller_id: Uuid) -> ApiResult<Uuid> {
    let event_id = sqlx::query_scalar!("select event_id from sellers where id = $1", seller_id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or(ApiError::NotFound)?;
    authorize_event(&state.pool, user, event_id).await?;
    Ok(event_id)
}

/// `POST /api/sellers/{id}/link`: a new link for the seller; the previous one stops working.
pub async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Path(seller_id): Path<Uuid>,
) -> ApiResult<(StatusCode, Json<SellerLinkDto>)> {
    let event_id = seller_event(&state, &user, seller_id).await?;
    let (token, hash) = new_token()?;
    let id = Uuid::new_v4();
    let sealed = seal(&state, id, &token)?;
    let mut tx = state.pool.begin().await?;
    sqlx::query!(
        "update seller_links set revoked_at = now() where seller_id = $1 and revoked_at is null",
        seller_id
    )
    .execute(&mut *tx)
    .await?;
    let created_at = sqlx::query_scalar!(
        r#"insert into seller_links (id, event_id, seller_id, token_hash, sealed, created_by)
           values ($1, $2, $3, $4, $5, $6) returning created_at"#,
        id,
        event_id,
        seller_id,
        hash,
        sealed,
        user.id,
    )
    .fetch_one(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok((
        StatusCode::CREATED,
        Json(SellerLinkDto {
            url: link_url(&state, &token),
            created_at,
            last_opened_at: None,
        }),
    ))
}

/// `DELETE /api/sellers/{id}/link`: the link stops working; the marked sales stay.
pub async fn revoke(
    State(state): State<AppState>,
    user: AuthUser,
    Path(seller_id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    seller_event(&state, &user, seller_id).await?;
    sqlx::query!(
        "update seller_links set revoked_at = now() where seller_id = $1 and revoked_at is null",
        seller_id
    )
    .execute(&state.pool)
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// `GET /api/events/{id}/ticket-sales`: every number marked as sold, by number.
pub async fn list_sales(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
) -> ApiResult<Json<Vec<TicketSaleDto>>> {
    authorize_event(&state.pool, &user, event_id).await?;
    let sales = sqlx::query_as!(
        TicketSaleDto,
        r#"select ticket_number as number, seller_id, buyer_name, buyer_phone, sold_at
           from ticket_sales where event_id = $1 order by ticket_number"#,
        event_id
    )
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(sales))
}

// The seller's page ------------------------------------------------------------------------

/// The link of a token: its seller and event.
pub(crate) struct LinkRow {
    pub id: Uuid,
    pub event_id: Uuid,
    pub seller_id: Uuid,
}

pub(crate) async fn find_link(state: &AppState, token: &str) -> ApiResult<LinkRow> {
    let token = token.trim();
    if token.is_empty() || token.len() > 128 {
        return Err(ApiError::NotFound);
    }
    sqlx::query_as!(
        LinkRow,
        "select id, event_id, seller_id from seller_links where token_hash = $1 and revoked_at is null",
        token_hash(token)
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound)
}

/// Writes respect the maintenance mode and a suspended organization, like the panel does.
pub(crate) async fn ensure_writable(state: &AppState, event_id: Uuid, path: &str) -> ApiResult<()> {
    state
        .settings
        .get(&state.pool)
        .await?
        .check_request(&Method::POST, path)?;
    let suspended = sqlx::query_scalar!(
        r#"select o.suspended_at is not null as "suspended!"
           from events e join organizations o on o.id = e.organization_id where e.id = $1"#,
        event_id
    )
    .fetch_one(&state.pool)
    .await?;
    if suspended {
        return Err(ApiError::Suspended);
    }
    Ok(())
}

pub(crate) async fn event_row(state: &AppState, event_id: Uuid) -> ApiResult<EventRow> {
    Ok(sqlx::query_as!(
        EventRow,
        r#"select id, name, venue, starts_at, ends_at, ticket_price_cents, status, qr_tag,
                  utc_offset_minutes, address, postponed_from_starts_at, postponed_at,
                  postpone_reason, canceled_at, cancel_reason
           from events where id = $1"#,
        event_id
    )
    .fetch_one(&state.pool)
    .await?)
}

/// A canceled event takes no more sales from its sellers (ADR 0065); undoing a mark still works.
async fn ensure_selling(state: &AppState, event_id: Uuid) -> ApiResult<()> {
    event_row(state, event_id).await?.ensure_not_canceled()
}

/// Parts of the seller's numbers that no longer count (returned, lost or voided).
async fn seller_voids(state: &AppState, link: &LinkRow) -> ApiResult<Vec<SellerVoidDto>> {
    sqlx::query!(
        r#"select v.numbers * a.numbers as "numbers!", v.reason
           from ticket_voids v
           join seller_assignments a on a.event_id = v.event_id and a.seller_id = $2 and a.numbers && v.numbers
           where v.event_id = $1 and v.undone_at is null
           order by lower(v.numbers * a.numbers)"#,
        link.event_id,
        link.seller_id,
    )
    .fetch_all(&state.pool)
    .await?
    .into_iter()
    .map(|row| {
        let (first, last) = bounds(&row.numbers)?;
        let reason = VoidReason::from_db(&row.reason).ok_or_else(|| {
            ApiError::Internal(anyhow::anyhow!("unknown void reason {}", row.reason))
        })?;
        Ok(SellerVoidDto {
            first,
            last,
            reason,
        })
    })
    .collect()
}

/// Money the organizer recorded from the seller, newest first.
async fn seller_payments(
    state: &AppState,
    seller_id: Uuid,
) -> ApiResult<Vec<SellerViewPaymentDto>> {
    sqlx::query!(
        r#"select amount_cents, method, received_on from seller_payments
           where seller_id = $1 order by received_on desc, created_at desc"#,
        seller_id
    )
    .fetch_all(&state.pool)
    .await?
    .into_iter()
    .map(|row| {
        Ok(SellerViewPaymentDto {
            amount_cents: row.amount_cents,
            method: SellerPaymentMethod::from_db(&row.method).ok_or_else(|| {
                ApiError::Internal(anyhow::anyhow!("unknown payment method {}", row.method))
            })?,
            received_on: row.received_on.to_string(),
        })
    })
    .collect()
}

/// The paid numbers a seller holds: their ranges cut to the paid batches (only those can be sold).
async fn held_ranges(state: &AppState, link: &LinkRow) -> ApiResult<Vec<NumberRangeDto>> {
    let held = sqlx::query_scalar!(
        r#"select a.numbers * b.numbers as "numbers!"
           from seller_assignments a
           join ticket_batches b on b.event_id = a.event_id and b.status = 'paid' and b.numbers && a.numbers
           where a.seller_id = $1
           order by lower(a.numbers * b.numbers)"#,
        link.seller_id
    )
    .fetch_all(&state.pool)
    .await?;
    held.iter()
        .map(|numbers| bounds(numbers).map(|(first, last)| NumberRangeDto { first, last }))
        .collect()
}

/// What the seller answers for (held, not returned unsold nor lost), by price. A box office
/// answers for what entered (ADR 0069).
async fn due_lines(
    state: &AppState,
    link: &LinkRow,
    price: Option<i32>,
    box_office: bool,
) -> ApiResult<Vec<SellerDueLineDto>> {
    Ok(sqlx::query!(
        r#"with held as (
               select n as number
               from seller_assignments a
               join ticket_batches b on b.event_id = a.event_id and b.status = 'paid' and b.numbers && a.numbers,
                    generate_series(lower(a.numbers * b.numbers), upper(a.numbers * b.numbers) - 1) as n
               where a.seller_id = $2
           )
           select tc.name as "category?", tc.color as "color?",
                  coalesce(tc.price_cents, $3::int4) as "price_cents?", count(*)::int as "tickets!"
           from held h
           left join category_ranges cr on cr.event_id = $1 and cr.numbers @> h.number
           left join ticket_categories tc on tc.id = cr.category_id
           where case when $4::bool
                      then exists (select 1 from entries e where e.event_id = $1 and e.ticket_number = h.number)
                      else not exists (select 1 from ticket_voids v
                                       where v.event_id = $1 and v.undone_at is null and v.numbers @> h.number
                                         and v.reason in ('unsold', 'lost'))
                 end
           group by tc.name, tc.color, tc.price_cents, tc.position
           order by tc.position nulls last, tc.name"#,
        link.event_id,
        link.seller_id,
        price,
        box_office,
    )
    .fetch_all(&state.pool)
    .await?
    .into_iter()
    .map(|row| SellerDueLineDto {
        category: row.category,
        color: row.color,
        tickets: row.tickets,
        price_cents: row.price_cents,
    })
    .collect())
}

/// The event's categories with their numbers (ADR 0056).
async fn categories(
    state: &AppState,
    event_id: Uuid,
    price: Option<i32>,
) -> ApiResult<Vec<SellerCategoryDto>> {
    Ok(super::categories::load(&state.pool, event_id)
        .await?
        .into_iter()
        .map(|category| SellerCategoryDto {
            name: category.name,
            color: category.color,
            price_cents: category.price_cents.or(price),
            ranges: category
                .ranges
                .into_iter()
                .map(|range| NumberRangeDto {
                    first: range.first,
                    last: range.last,
                })
                .collect(),
        })
        .collect())
}

/// The numbers the seller marked as sold, each with its digital ticket when one was sent.
async fn sales(state: &AppState, link: &LinkRow) -> ApiResult<Vec<SellerSaleDto>> {
    let sales = sqlx::query!(
        r#"select ticket_number, buyer_name, buyer_phone, sold_at
           from ticket_sales where event_id = $1 and seller_id = $2 order by ticket_number"#,
        link.event_id,
        link.seller_id,
    )
    .fetch_all(&state.pool)
    .await?;
    let sold: Vec<i32> = sales.iter().map(|sale| sale.ticket_number).collect();
    let mut urls = super::tickets::active_urls(state, link.event_id, &sold).await?;
    Ok(sales
        .into_iter()
        .map(|sale| SellerSaleDto {
            number: sale.ticket_number,
            buyer_name: sale.buyer_name,
            buyer_phone: sale.buyer_phone,
            sold_at: sale.sold_at,
            ticket_url: urls.remove(&sale.ticket_number),
        })
        .collect())
}

/// The seller's numbers by state, counted per number as the report does: a number in two voids
/// counts once. A number reserved (ADR 0072) is neither sold nor free to sell.
async fn counts(state: &AppState, link: &LinkRow) -> ApiResult<Counts> {
    Ok(sqlx::query_as!(
        Counts,
        r#"with held as (
               select n as number
               from seller_assignments a
               join ticket_batches b on b.event_id = a.event_id and b.status = 'paid' and b.numbers && a.numbers,
                    generate_series(lower(a.numbers * b.numbers), upper(a.numbers * b.numbers) - 1) as n
               where a.seller_id = $2
           ),
           voided as (
               select distinct on (h.number) h.number, v.reason
               from held h join ticket_voids v
                 on v.event_id = $1 and v.undone_at is null and v.numbers @> h.number
               order by h.number, v.created_at
           )
           select count(*)::int as "tickets!",
                  (count(s.ticket_number) filter (where v.number is null))::int as "sold!",
                  (count(*) filter (where v.number is null and s.ticket_number is null
                                      and r.ticket_number is null))::int as "available!",
                  (count(r.ticket_number) filter (where v.number is null and s.ticket_number is null))::int as "reserved!",
                  (count(*) filter (where v.reason = 'unsold'))::int as "unsold!",
                  (count(*) filter (where v.reason = 'lost'))::int as "lost!"
           from held h
           left join voided v on v.number = h.number
           left join ticket_sales s on s.event_id = $1 and s.ticket_number = h.number and s.seller_id = $2
           left join ticket_reservations r on r.event_id = $1 and r.ticket_number = h.number
                                          and r.seller_id = $2 and r.expires_at > now()"#,
        link.event_id,
        link.seller_id,
    )
    .fetch_one(&state.pool)
    .await?)
}

/// What [`counts`] returns.
struct Counts {
    tickets: i32,
    sold: i32,
    available: i32,
    reserved: i32,
    unsold: i32,
    lost: i32,
}

/// Builds the page of a link.
pub(crate) async fn view(state: &AppState, link: &LinkRow) -> ApiResult<SellerViewDto> {
    let event = sqlx::query!(
        r#"select e.name, e.venue, e.starts_at, e.ends_at, e.utc_offset_minutes, e.ticket_price_cents,
                  e.sellers_send_tickets, e.sellers_ranking, o.name as organizer, s.name as seller,
                  s.box_office, s.goal
           from events e join organizations o on o.id = e.organization_id
                         join sellers s on s.id = $2
           where e.id = $1"#,
        link.event_id,
        link.seller_id,
    )
    .fetch_one(&state.pool)
    .await?;
    let ranges = held_ranges(state, link).await?;
    let voids = seller_voids(state, link).await?;
    let sales = sales(state, link).await?;
    let payments = seller_payments(state, link.seller_id).await?;
    let counts = counts(state, link).await?;
    let received_cents: i64 = payments.iter().map(|p| i64::from(p.amount_cents)).sum();
    let due_lines = due_lines(state, link, event.ticket_price_cents, event.box_office).await?;
    let due_tickets = if event.box_office {
        due_lines.iter().map(|line| line.tickets).sum()
    } else {
        counts.tickets - counts.unsold - counts.lost
    };
    let amount_due_cents = amount_due(&due_lines, event.ticket_price_cents);
    let offset = time::UtcOffset::from_whole_seconds(i32::from(event.utc_offset_minutes) * 60)
        .unwrap_or(time::UtcOffset::UTC);
    let (number_prefix, number_digits) = super::tickets::number_style(state, link.event_id).await?;
    let row = event_row(state, link.event_id).await?;
    let reservations =
        super::reservations::load(&state.pool, link.event_id, Some(link.seller_id), offset).await?;
    // A box office sells at the door: no goal, no ranking (ADR 0073).
    let ranking = if event.sellers_ranking && !event.box_office {
        let standings = super::seller_goals::standings(&state.pool, link.event_id).await?;
        Some(super::seller_goals::ranking(standings, link.seller_id))
    } else {
        None
    };
    Ok(SellerViewDto {
        event: SellerViewEvent {
            name: event.name,
            venue: event.venue,
            starts_at: event.starts_at.to_offset(offset),
            organizer: event.organizer,
            ticket_price_cents: event.ticket_price_cents,
            address: row.address.clone(),
            change: row.change(),
            ends_at: event.ends_at.to_offset(offset),
            utc_offset_minutes: event.utc_offset_minutes,
            in_series: super::series::in_series(&state.pool, link.event_id).await?,
        },
        organization: super::organization::event_organization(&state.pool, link.event_id).await?,
        seller: event.seller,
        number_prefix,
        number_digits,
        ranges,
        voids,
        sales,
        payments,
        summary: SellerSummaryDto {
            tickets: counts.tickets,
            sold: counts.sold,
            available: counts.available,
            reserved: counts.reserved,
            unsold: counts.unsold,
            lost: counts.lost,
            due_tickets,
            amount_due_cents,
            received_cents,
            balance_cents: amount_due_cents.map(|due| due - received_cents),
            due_lines,
        },
        categories: categories(state, link.event_id, event.ticket_price_cents).await?,
        receivers: super::team::receivers(state, link.event_id).await?,
        can_send_tickets: event.sellers_send_tickets,
        box_office: event.box_office,
        reservations,
        goal: event.goal.filter(|_| !event.box_office),
        ranking,
    })
}

/// What the seller owes for `lines`; `null` when a line has no price (nor the event one).
fn amount_due(lines: &[SellerDueLineDto], event_price_cents: Option<i32>) -> Option<i64> {
    lines
        .iter()
        .map(|line| {
            line.price_cents
                .map(|price| i64::from(line.tickets) * i64::from(price))
        })
        .sum::<Option<i64>>()
        .filter(|_| {
            event_price_cents.is_some() || lines.iter().any(|line| line.price_cents.is_some())
        })
}

pub(crate) fn no_store<T: serde::Serialize>(body: T) -> Response {
    (
        [(CACHE_CONTROL, HeaderValue::from_static("no-store"))],
        Json(body),
    )
        .into_response()
}

/// `POST /api/seller` (no login; the token is the credential): the seller's page.
pub async fn open(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<SellerTokenBody>,
) -> ApiResult<Response> {
    ratelimit::by_ip(&state, &headers, ratelimit::SELLER_VIEW).await?;
    let link = find_link(&state, &body.token).await?;
    sqlx::query!(
        "update seller_links set last_opened_at = now() where id = $1",
        link.id
    )
    .execute(&state.pool)
    .await?;
    Ok(no_store(view(&state, &link).await?))
}

/// `POST /api/seller/sales`: marks numbers as sold. They must be the seller's, paid and not
/// voided; marking a number again updates its buyer.
pub async fn mark(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<SellerMarkBody>,
) -> ApiResult<Response> {
    ratelimit::by_ip(&state, &headers, ratelimit::SELLER_WRITE).await?;
    let link = find_link(&state, &body.token).await?;
    ensure_writable(&state, link.event_id, "/api/seller/sales").await?;
    ensure_selling(&state, link.event_id).await?;
    if body.ranges.is_empty() || body.ranges.len() > MAX_MARK_RANGES {
        return Err(bad_request(
            "invalid_range",
            format!("give 1 to {MAX_MARK_RANGES} ranges"),
        ));
    }
    let ranges = body
        .ranges
        .iter()
        .map(|item| range(item.first, item.last).map(|numbers| (item.first, item.last, numbers)))
        .collect::<ApiResult<Vec<(i32, i32, PgRange<i32>)>>>()?;
    let total: i64 = ranges
        .iter()
        .map(|(first, last, _)| i64::from(*last) - i64::from(*first) + 1)
        .sum();
    if total > MAX_MARK_NUMBERS {
        return Err(bad_request(
            "invalid_range",
            format!("up to {MAX_MARK_NUMBERS} numbers at once"),
        ));
    }
    let buyer_name = contact(body.buyer_name, 80, "invalid_buyer_name")?;
    let buyer_phone = contact(body.buyer_phone, 30, "invalid_buyer_phone")?;

    let mut tx = state.pool.begin().await?;
    for (first, last, numbers) in &ranges {
        // Assignments never overlap each other, nor do batches: the sum of the intersections is
        // the part of the range the seller holds in paid batches.
        let held = sqlx::query_scalar!(
            r#"select coalesce(sum(upper(a.numbers * b.numbers * $3) - lower(a.numbers * b.numbers * $3)), 0)::bigint as "held!"
               from seller_assignments a
               join ticket_batches b on b.event_id = a.event_id and b.status = 'paid' and b.numbers && a.numbers
               where a.event_id = $1 and a.seller_id = $2 and a.numbers && $3 and b.numbers && $3"#,
            link.event_id,
            link.seller_id,
            numbers.clone(),
        )
        .fetch_one(&mut *tx)
        .await?;
        if held != i64::from(*last) - i64::from(*first) + 1 {
            return Err(bad_request(
                "range_not_held",
                "every number must belong to the seller",
            ));
        }
        let voided = sqlx::query_scalar!(
            r#"select exists(select 1 from ticket_voids
                             where event_id = $1 and undone_at is null and numbers && $2) as "voided!""#,
            link.event_id,
            numbers.clone(),
        )
        .fetch_one(&mut *tx)
        .await?;
        if voided {
            return Err(ApiError::Conflict(
                "already_voided",
                "some of these numbers are voided".to_owned(),
            ));
        }
        // A sale takes over the numbers' reservations (ADR 0072).
        super::seller_ops::clear_reservations(&mut tx, link.event_id, numbers).await?;
        sqlx::query!(
            r#"insert into ticket_sales (event_id, ticket_number, seller_id, buyer_name, buyer_phone)
               select $1, n, $2, $3, $4 from generate_series($5::int, $6::int) as n
               on conflict (event_id, ticket_number) do update
               set buyer_name = coalesce(excluded.buyer_name,
                                         case when ticket_sales.seller_id = excluded.seller_id
                                              then ticket_sales.buyer_name end),
                   buyer_phone = coalesce(excluded.buyer_phone,
                                          case when ticket_sales.seller_id = excluded.seller_id
                                               then ticket_sales.buyer_phone end),
                   sold_at = case when ticket_sales.seller_id = excluded.seller_id
                                  then ticket_sales.sold_at else now() end,
                   seller_id = excluded.seller_id"#,
            link.event_id,
            link.seller_id,
            buyer_name,
            buyer_phone,
            first,
            last,
        )
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(no_store(view(&state, &link).await?))
}

/// `POST /api/seller/sales/undo`: a number marked by mistake goes back to the seller.
pub async fn unmark(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<SellerUnmarkBody>,
) -> ApiResult<Response> {
    ratelimit::by_ip(&state, &headers, ratelimit::SELLER_WRITE).await?;
    let link = find_link(&state, &body.token).await?;
    ensure_writable(&state, link.event_id, "/api/seller/sales/undo").await?;
    sqlx::query!(
        "delete from ticket_sales where event_id = $1 and ticket_number = $2 and seller_id = $3",
        link.event_id,
        body.number,
        link.seller_id,
    )
    .execute(&state.pool)
    .await?;
    // A digital ticket the seller sent for a sale undone stops opening (ADR 0061).
    super::tickets::revoke_seller_links(&state, link.event_id, link.seller_id, body.number).await?;
    Ok(no_store(view(&state, &link).await?))
}

/// `POST /api/seller/tickets`: the seller sends the digital ticket of a number they sold (ADR
/// 0061): the same signed QR as the paper, for the buyer far away. When the organizer allows it.
pub async fn send_ticket(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<SellerTicketBody>,
) -> ApiResult<Response> {
    ratelimit::by_ip(&state, &headers, ratelimit::SELLER_WRITE).await?;
    let link = find_link(&state, &body.token).await?;
    ensure_writable(&state, link.event_id, "/api/seller/tickets").await?;
    let event = event_row(&state, link.event_id).await?;
    event.ensure_not_canceled()?;
    let allowed = sqlx::query_scalar!(
        "select sellers_send_tickets from events where id = $1",
        link.event_id
    )
    .fetch_one(&state.pool)
    .await?;
    if !allowed {
        return Err(ApiError::Refused(
            "seller_tickets_off",
            "the organizer turned off digital tickets from sellers".to_owned(),
        ));
    }
    let buyer = sqlx::query_scalar!(
        r#"select buyer_name from ticket_sales
           where event_id = $1 and ticket_number = $2 and seller_id = $3"#,
        link.event_id,
        body.number,
        link.seller_id,
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| bad_request("ticket_not_sold", "mark the number as sold first"))?;
    super::tickets::send_for_seller(
        &state,
        &event,
        link.seller_id,
        body.number,
        buyer.as_deref(),
    )
    .await?;
    Ok(no_store(view(&state, &link).await?))
}

/// `GET /api/events/{id}/seller-settings`: what sellers may do and see on their links.
pub async fn settings(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
) -> ApiResult<Json<SellerSettingsDto>> {
    authorize_event(&state.pool, &user, event_id).await?;
    let row = sqlx::query!(
        "select sellers_send_tickets, sellers_ranking from events where id = $1",
        event_id
    )
    .fetch_one(&state.pool)
    .await?;
    Ok(Json(SellerSettingsDto {
        send_tickets: row.sellers_send_tickets,
        ranking: row.sellers_ranking,
    }))
}

/// `PUT /api/events/{id}/seller-settings`: a missing field keeps its value.
pub async fn update_settings(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
    Json(body): Json<SellerSettingsBody>,
) -> ApiResult<Json<SellerSettingsDto>> {
    authorize_event(&state.pool, &user, event_id).await?;
    let row = sqlx::query!(
        r#"update events set sellers_send_tickets = coalesce($2, sellers_send_tickets),
                             sellers_ranking = coalesce($3, sellers_ranking)
           where id = $1 returning sellers_send_tickets, sellers_ranking"#,
        event_id,
        body.send_tickets,
        body.ranking,
    )
    .fetch_one(&state.pool)
    .await?;
    Ok(Json(SellerSettingsDto {
        send_tickets: row.sellers_send_tickets,
        ranking: row.sellers_ranking,
    }))
}

/// Removes the sale marks and reservations (ADR 0072) of numbers that left the seller (a return,
/// a range taken back).
pub(crate) async fn clear_marks(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    event_id: Uuid,
    numbers: &PgRange<i32>,
) -> ApiResult<()> {
    sqlx::query!(
        "delete from ticket_sales where event_id = $1 and $2::int4range @> ticket_number",
        event_id,
        numbers.clone(),
    )
    .execute(&mut **tx)
    .await?;
    super::seller_ops::clear_reservations(tx, event_id, numbers).await
}
