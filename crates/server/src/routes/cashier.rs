//! The token cashier (ADR 0098): a seller of a token event who sells fichas on the spot, writes
//! down how each sale was paid (cash, Pix, card) and closes the drawer with the cash counted. A
//! closing keeps the sums of its shift as they were and marks its sales, which the cashier can
//! no longer undo.

use axum::Json;
use axum::extract::{Path, State};
use axum::http::HeaderMap;
use axum::response::Response;
use sqlx::{PgExecutor, Postgres, Transaction};
use uuid::Uuid;

use super::seller_links::{ensure_writable, find_link, no_store, view};
use super::{event_access, one_line, optional_text};
use crate::api::{
    CashierCloseBody, CashierClosingDto, CashierReportDto, CashierShiftDto, SellerCashierCloseBody,
    SellerCashierDto,
};
use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult, bad_request};
use crate::ratelimit;
use crate::state::AppState;

/// Closings shown on the cashier's own page.
const PAGE_CLOSINGS: i64 = 10;
/// Most a drawer may hold: R$ 1 billion.
const MAX_COUNTED: i64 = 100_000_000_000;
const MAX_NOTE: usize = 200;

/// The sales of the open shift, by how they were paid. Each ficha is worth its product's price
/// (the category's, else the event's); voided numbers do not count.
async fn shift_totals(
    executor: impl PgExecutor<'_>,
    event_id: Uuid,
    seller_id: Uuid,
) -> ApiResult<CashierShiftDto> {
    let row = sqlx::query!(
        r#"with open as (
               select s.payment_method,
                      coalesce(tc.price_cents, e.ticket_price_cents, 0)::bigint as price
               from ticket_sales s
               join events e on e.id = s.event_id
               left join category_ranges cr on cr.event_id = s.event_id and cr.numbers @> s.ticket_number
               left join ticket_categories tc on tc.id = cr.category_id
               where s.event_id = $1 and s.seller_id = $2 and s.closing_id is null
                 and not exists (select 1 from ticket_voids v
                                 where v.event_id = $1 and v.undone_at is null
                                   and v.numbers @> s.ticket_number)
           )
           select count(*)::int as "tokens!",
                  coalesce(sum(price) filter (where payment_method = 'cash'), 0)::bigint as "cash!",
                  coalesce(sum(price) filter (where payment_method = 'pix'), 0)::bigint as "pix!",
                  coalesce(sum(price) filter (where payment_method = 'card'), 0)::bigint as "card!",
                  coalesce(sum(price) filter (where payment_method is null), 0)::bigint as "other!",
                  (select max(closed_at) from cashier_closings where seller_id = $2) as since
           from open"#,
        event_id,
        seller_id,
    )
    .fetch_one(executor)
    .await?;
    Ok(CashierShiftDto {
        tokens: row.tokens,
        cash_cents: row.cash,
        pix_cents: row.pix,
        card_cents: row.card,
        other_cents: row.other,
        since: row.since,
    })
}

/// The seller's closings, newest first.
async fn closings(
    executor: impl PgExecutor<'_>,
    seller_id: Uuid,
    limit: Option<i64>,
) -> ApiResult<Vec<CashierClosingDto>> {
    Ok(sqlx::query!(
        r#"select id, tokens, cash_cents, pix_cents, card_cents, other_cents, counted_cents, note,
                  closed_at, closed_by is not null as "by_organizer!"
           from cashier_closings where seller_id = $1
           order by closed_at desc limit $2"#,
        seller_id,
        limit,
    )
    .fetch_all(executor)
    .await?
    .into_iter()
    .map(|row| CashierClosingDto {
        id: row.id,
        tokens: row.tokens,
        cash_cents: row.cash_cents,
        pix_cents: row.pix_cents,
        card_cents: row.card_cents,
        other_cents: row.other_cents,
        counted_cents: row.counted_cents,
        difference_cents: row.counted_cents.map(|counted| counted - row.cash_cents),
        note: row.note,
        closed_at: row.closed_at,
        by_organizer: row.by_organizer,
    })
    .collect())
}

/// The cashier part of a seller's page; `None` for a seller who is not a cashier.
pub(crate) async fn page(
    state: &AppState,
    event_id: Uuid,
    seller_id: Uuid,
    cashier: bool,
) -> ApiResult<Option<SellerCashierDto>> {
    if !cashier {
        return Ok(None);
    }
    let (open, closings) = tokio::try_join!(
        shift_totals(&state.pool, event_id, seller_id),
        closings(&state.pool, seller_id, Some(PAGE_CLOSINGS)),
    )?;
    Ok(Some(SellerCashierDto { open, closings }))
}

fn clean_close(
    counted: Option<i64>,
    note: Option<String>,
) -> ApiResult<(Option<i64>, Option<String>)> {
    if counted.is_some_and(|cents| !(0..=MAX_COUNTED).contains(&cents)) {
        return Err(bad_request(
            "invalid_amount",
            "the amount counted is out of range",
        ));
    }
    let note = optional_text(note);
    if let Some(note) = &note {
        one_line(note, "invalid_note")?;
        if note.chars().count() > MAX_NOTE {
            return Err(bad_request(
                "invalid_note",
                format!("up to {MAX_NOTE} characters"),
            ));
        }
    }
    Ok((counted, note))
}

/// Closes the open shift: its sums are kept and its sales marked. Nothing sold, nothing to close.
async fn close(
    tx: &mut Transaction<'_, Postgres>,
    event_id: Uuid,
    seller_id: Uuid,
    counted: Option<i64>,
    note: Option<String>,
    by: Option<Uuid>,
) -> ApiResult<Uuid> {
    // The seller's lock (the one every sale takes) keeps a sale from slipping between the sums
    // and the marks.
    super::seller_ops::lock_seller(tx, seller_id).await?;
    let cashier = sqlx::query_scalar!("select cashier from sellers where id = $1", seller_id)
        .fetch_one(&mut **tx)
        .await?;
    if !cashier {
        return Err(ApiError::Conflict(
            "not_cashier",
            "this seller is not a cashier".to_owned(),
        ));
    }
    let shift = shift_totals(&mut **tx, event_id, seller_id).await?;
    if shift.tokens == 0 {
        return Err(ApiError::Conflict(
            "empty_shift",
            "nothing was sold since the last closing".to_owned(),
        ));
    }
    let id = Uuid::new_v4();
    sqlx::query!(
        r#"insert into cashier_closings (id, event_id, seller_id, tokens, cash_cents, pix_cents,
                                         card_cents, other_cents, counted_cents, note, closed_by)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)"#,
        id,
        event_id,
        seller_id,
        shift.tokens,
        shift.cash_cents,
        shift.pix_cents,
        shift.card_cents,
        shift.other_cents,
        counted,
        note,
        by,
    )
    .execute(&mut **tx)
    .await?;
    sqlx::query!(
        r#"update ticket_sales s set closing_id = $3
           where s.event_id = $1 and s.seller_id = $2 and s.closing_id is null
             and not exists (select 1 from ticket_voids v
                             where v.event_id = $1 and v.undone_at is null
                               and v.numbers @> s.ticket_number)"#,
        event_id,
        seller_id,
        id,
    )
    .execute(&mut **tx)
    .await?;
    Ok(id)
}

/// `POST /api/seller/cashier/close`: the cashier closes their drawer on the link.
pub async fn seller_close(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<SellerCashierCloseBody>,
) -> ApiResult<Response> {
    ratelimit::by_ip(&state, &headers, ratelimit::SELLER_WRITE).await?;
    let link = find_link(&state, &body.token).await?;
    ensure_writable(&state, link.event_id, "/api/seller/cashier/close").await?;
    let (counted, note) = clean_close(body.counted_cents, body.note)?;
    let mut tx = state.pool.begin().await?;
    close(&mut tx, link.event_id, link.seller_id, counted, note, None).await?;
    tx.commit().await?;
    Ok(no_store(view(&state, &link).await?))
}

/// `POST /api/sellers/{id}/cashier/close`: the organizer closes a cashier's shift (the cashier
/// left without closing, the phone died).
pub async fn panel_close(
    State(state): State<AppState>,
    user: AuthUser,
    Path(seller_id): Path<Uuid>,
    Json(body): Json<CashierCloseBody>,
) -> ApiResult<Json<CashierReportDto>> {
    let event_id = sqlx::query_scalar!("select event_id from sellers where id = $1", seller_id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or(ApiError::NotFound)?;
    event_access(&state.pool, &user, event_id).await?;
    let (counted, note) = clean_close(body.counted_cents, body.note)?;
    let mut tx = state.pool.begin().await?;
    close(&mut tx, event_id, seller_id, counted, note, Some(user.id)).await?;
    tx.commit().await?;
    let name = sqlx::query_scalar!("select name from sellers where id = $1", seller_id)
        .fetch_one(&state.pool)
        .await?;
    report_of(&state, event_id, seller_id, name).await.map(Json)
}

async fn report_of(
    state: &AppState,
    event_id: Uuid,
    seller_id: Uuid,
    name: String,
) -> ApiResult<CashierReportDto> {
    let (open, closings) = tokio::try_join!(
        shift_totals(&state.pool, event_id, seller_id),
        closings(&state.pool, seller_id, None),
    )?;
    Ok(CashierReportDto {
        seller_id,
        name,
        open,
        closings,
    })
}

/// `GET /api/events/{id}/cashiers`: every cashier with the open shift and the closings.
pub async fn report(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
) -> ApiResult<Json<Vec<CashierReportDto>>> {
    event_access(&state.pool, &user, event_id).await?;
    let sellers = sqlx::query!(
        "select id, name from sellers where event_id = $1 and cashier order by lower(name)",
        event_id
    )
    .fetch_all(&state.pool)
    .await?;
    let mut reports = Vec::with_capacity(sellers.len());
    for seller in sellers {
        reports.push(report_of(&state, event_id, seller.id, seller.name).await?);
    }
    Ok(Json(reports))
}
