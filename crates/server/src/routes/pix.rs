//! Pix "copia e cola" (ADR 0085): the buyer pays the organization or the seller straight from
//! their bank; the platform only keeps the keys, which key each number pays and, per number, that
//! someone saw the money arrive. The BR Code itself is built on the phone
//! (`apps/web/src/lib/pix.ts`), so the seller's page and the digital ticket work offline.

use std::collections::{HashMap, HashSet};

use axum::Json;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::Response;
use sqlx::PgPool;
use uuid::Uuid;

use super::authorize_event;
use super::organization::own_organization;
use super::seller_links::{ensure_writable, find_link, no_store, view};
use crate::api::{
    EventPixDto, PixAccountBody, PixAccountDto, PixKeyType, PixNumberDto, PixPayee, PixReceiptDto,
    PixReceiptsBody, PixReceiver, PixSettingsBody, SellerPixBody, SellerPixDto, TicketPixDto,
};
use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult, bad_request};
use crate::ratelimit;
use crate::state::AppState;

/// Most numbers confirmed in one request.
const MAX_RECEIPTS: usize = 500;

/// A key as stored: the four columns, all set or all null.
pub(crate) fn account(
    key_type: Option<&str>,
    key: Option<String>,
    name: Option<String>,
    city: Option<String>,
) -> Option<PixAccountDto> {
    Some(PixAccountDto {
        key_type: PixKeyType::from_db(key_type?)?,
        key: key?,
        name: name?,
        city: city?,
    })
}

/// Checks a key, its receiver and city; the panel shows the error code under the field.
fn valid(body: &PixAccountBody) -> ApiResult<PixAccountDto> {
    let checked = crate::pix::account(body.key_type, &body.key, &body.name, &body.city)
        .map_err(|error| bad_request(error.code(), error.to_string()))?;
    Ok(PixAccountDto {
        key_type: checked.key_type,
        key: checked.key,
        name: checked.name,
        city: checked.city,
    })
}

/// Who an event's Pix pays and the organization's key.
pub(crate) struct EventPix {
    pub receiver: PixReceiver,
    pub organization: Option<PixAccountDto>,
}

pub(crate) async fn event_pix(pool: &PgPool, event_id: Uuid) -> ApiResult<EventPix> {
    let row = sqlx::query!(
        r#"select e.pix_receiver, p.pix_key_type as "key_type?", p.pix_key as "key?",
                  p.pix_name as "name?", p.pix_city as "city?"
           from events e left join organization_profiles p on p.organization_id = e.organization_id
           where e.id = $1"#,
        event_id
    )
    .fetch_one(pool)
    .await?;
    Ok(EventPix {
        receiver: PixReceiver::from_db(&row.pix_receiver).unwrap_or(PixReceiver::Off),
        organization: account(row.key_type.as_deref(), row.key, row.name, row.city),
    })
}

impl EventPix {
    /// Whose key a number's Pix pays: the organization's, or the seller's own when the event
    /// pays sellers and they have one. `None` when the event does not charge by Pix or there is
    /// no key to pay.
    pub(crate) fn payee(
        &self,
        seller: Option<&PixAccountDto>,
    ) -> Option<(PixPayee, PixAccountDto)> {
        let organization = || {
            self.organization
                .clone()
                .map(|account| (PixPayee::Organization, account))
        };
        match self.receiver {
            PixReceiver::Off => None,
            PixReceiver::Organization => organization(),
            PixReceiver::Seller => seller
                .map(|account| (PixPayee::Seller, account.clone()))
                .or_else(organization),
        }
    }
}

// The organization's key -----------------------------------------------------------------

/// `GET /api/account/pix`: the organization's key, if any.
pub async fn organization_account(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<Option<PixAccountDto>>> {
    let organization_id = own_organization(&state.pool, &user).await?;
    let row = sqlx::query!(
        r#"select pix_key_type, pix_key, pix_name, pix_city from organization_profiles
           where organization_id = $1"#,
        organization_id
    )
    .fetch_optional(&state.pool)
    .await?;
    Ok(Json(row.and_then(|row| {
        account(
            row.pix_key_type.as_deref(),
            row.pix_key,
            row.pix_name,
            row.pix_city,
        )
    })))
}

/// `PUT /api/account/pix`: sets the organization's key.
pub async fn set_organization_account(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<PixAccountBody>,
) -> ApiResult<Json<Option<PixAccountDto>>> {
    let organization_id = own_organization(&state.pool, &user).await?;
    let checked = valid(&body)?;
    sqlx::query!(
        r#"insert into organization_profiles (organization_id, pix_key_type, pix_key, pix_name, pix_city)
           values ($1, $2, $3, $4, $5)
           on conflict (organization_id) do update
           set pix_key_type = excluded.pix_key_type, pix_key = excluded.pix_key,
               pix_name = excluded.pix_name, pix_city = excluded.pix_city, updated_at = now()"#,
        organization_id,
        checked.key_type.db(),
        checked.key,
        checked.name,
        checked.city,
    )
    .execute(&state.pool)
    .await?;
    Ok(Json(Some(checked)))
}

/// `DELETE /api/account/pix`: removes it; events that paid the organization stop showing Pix
/// (or pay only the sellers with a key).
pub async fn delete_organization_account(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<StatusCode> {
    let organization_id = own_organization(&state.pool, &user).await?;
    sqlx::query!(
        r#"update organization_profiles
           set pix_key_type = null, pix_key = null, pix_name = null, pix_city = null, updated_at = now()
           where organization_id = $1"#,
        organization_id
    )
    .execute(&state.pool)
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

// A seller's own key ---------------------------------------------------------------------

async fn seller_event(state: &AppState, user: &AuthUser, seller_id: Uuid) -> ApiResult<Uuid> {
    let event_id = sqlx::query_scalar!("select event_id from sellers where id = $1", seller_id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or(ApiError::NotFound)?;
    authorize_event(&state.pool, user, event_id).await?;
    Ok(event_id)
}

/// `PUT /api/sellers/{id}/pix`: the seller's own key (the money part of the team).
pub async fn set_seller_account(
    State(state): State<AppState>,
    user: AuthUser,
    Path(seller_id): Path<Uuid>,
    Json(body): Json<PixAccountBody>,
) -> ApiResult<Json<PixAccountDto>> {
    seller_event(&state, &user, seller_id).await?;
    let checked = valid(&body)?;
    sqlx::query!(
        r#"update sellers set pix_key_type = $2, pix_key = $3, pix_name = $4, pix_city = $5
           where id = $1"#,
        seller_id,
        checked.key_type.db(),
        checked.key,
        checked.name,
        checked.city,
    )
    .execute(&state.pool)
    .await?;
    Ok(Json(checked))
}

/// `DELETE /api/sellers/{id}/pix`: their buyers pay the organization again.
pub async fn delete_seller_account(
    State(state): State<AppState>,
    user: AuthUser,
    Path(seller_id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    seller_event(&state, &user, seller_id).await?;
    sqlx::query!(
        r#"update sellers set pix_key_type = null, pix_key = null, pix_name = null, pix_city = null
           where id = $1"#,
        seller_id
    )
    .execute(&state.pool)
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

// The event -----------------------------------------------------------------------------

/// The event's sellers with their own keys.
async fn sellers(pool: &PgPool, event_id: Uuid) -> ApiResult<Vec<SellerPixDto>> {
    Ok(sqlx::query!(
        r#"select id, name, pix_key_type, pix_key, pix_name, pix_city from sellers
           where event_id = $1 order by name"#,
        event_id
    )
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(|row| SellerPixDto {
        seller_id: row.id,
        name: row.name,
        account: account(
            row.pix_key_type.as_deref(),
            row.pix_key,
            row.pix_name,
            row.pix_city,
        ),
    })
    .collect())
}

/// Numbers someone may pay: sold by a seller, sent as an active digital ticket, or already
/// paid; each with its price, seller, buyer and receipt.
async fn numbers(
    pool: &PgPool,
    event_id: Uuid,
    pix: &EventPix,
    sellers: &[SellerPixDto],
) -> ApiResult<Vec<PixNumberDto>> {
    let accounts: HashMap<Uuid, &PixAccountDto> = sellers
        .iter()
        .filter_map(|seller| {
            seller
                .account
                .as_ref()
                .map(|account| (seller.seller_id, account))
        })
        .collect();
    let rows = sqlx::query!(
        r#"with wanted as (
               select ticket_number from ticket_sales where event_id = $1
               union select ticket_number from ticket_links where event_id = $1 and revoked_at is null
               union select ticket_number from ticket_payments where event_id = $1
           )
           select w.ticket_number as "number!",
                  coalesce(tc.price_cents, e.ticket_price_cents) as "amount_cents?",
                  a.seller_id as "seller_id?", s.name as "seller?",
                  coalesce(ts.buyer_name, (select l.holder_name from ticket_links l
                                           where l.event_id = $1 and l.ticket_number = w.ticket_number
                                             and l.revoked_at is null limit 1)) as "buyer?",
                  p.received_by as "received_by?", p.amount_cents as "paid_cents?",
                  p.confirmed_at as "confirmed_at?"
           from wanted w
           join events e on e.id = $1
           left join category_ranges cr on cr.event_id = $1 and cr.numbers @> w.ticket_number
           left join ticket_categories tc on tc.id = cr.category_id
           left join seller_assignments a on a.event_id = $1 and a.numbers @> w.ticket_number
           left join sellers s on s.id = a.seller_id
           left join ticket_sales ts on ts.event_id = $1 and ts.ticket_number = w.ticket_number
           left join ticket_payments p on p.event_id = $1 and p.ticket_number = w.ticket_number
           order by w.ticket_number"#,
        event_id
    )
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        // A courtesy has nothing to pay, unless it was paid anyway.
        .filter(|row| row.amount_cents != Some(0) || row.received_by.is_some())
        .map(|row| {
            let seller_account = row.seller_id.and_then(|id| accounts.get(&id).copied());
            let payee = pix
                .payee(seller_account)
                .map_or(PixPayee::Organization, |(payee, _)| payee);
            PixNumberDto {
                number: row.number,
                amount_cents: row.amount_cents,
                seller_id: row.seller_id,
                seller: row.seller,
                buyer: row.buyer,
                payee,
                receipt: receipt(row.received_by.as_deref(), row.paid_cents, row.confirmed_at),
            }
        })
        .collect())
}

pub(crate) fn receipt(
    received_by: Option<&str>,
    amount_cents: Option<i32>,
    confirmed_at: Option<time::OffsetDateTime>,
) -> Option<PixReceiptDto> {
    Some(PixReceiptDto {
        received_by: PixPayee::from_db(received_by?)?,
        amount_cents: amount_cents?,
        confirmed_at: confirmed_at?,
    })
}

async fn overview(pool: &PgPool, event_id: Uuid) -> ApiResult<EventPixDto> {
    let pix = event_pix(pool, event_id).await?;
    let sellers = sellers(pool, event_id).await?;
    let numbers = numbers(pool, event_id, &pix, &sellers).await?;
    Ok(EventPixDto {
        receiver: pix.receiver,
        organization: pix.organization,
        sellers,
        numbers,
    })
}

/// `GET /api/events/{id}/pix`.
pub async fn event(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
) -> ApiResult<Json<EventPixDto>> {
    authorize_event(&state.pool, &user, event_id).await?;
    Ok(Json(overview(&state.pool, event_id).await?))
}

/// `PUT /api/events/{id}/pix-settings`: who the buyers' Pix pays (the money part of the team).
pub async fn update_settings(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
    Json(body): Json<PixSettingsBody>,
) -> ApiResult<Json<EventPixDto>> {
    authorize_event(&state.pool, &user, event_id).await?;
    sqlx::query!(
        "update events set pix_receiver = $2 where id = $1",
        event_id,
        body.receiver.db(),
    )
    .execute(&state.pool)
    .await?;
    Ok(Json(overview(&state.pool, event_id).await?))
}

/// `POST /api/events/{id}/pix/receipts`: the organization saw these numbers' Pix arrive (its
/// bank statement shows the identifier), or undoes it. Each receipt records whose key the number
/// paid and its price; money the organization received for a seller's number counts as handed
/// over by that seller (ADR 0050).
pub async fn set_receipts(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
    Json(body): Json<PixReceiptsBody>,
) -> ApiResult<Json<EventPixDto>> {
    authorize_event(&state.pool, &user, event_id).await?;
    let wanted: HashSet<i32> = body.numbers.iter().copied().collect();
    if wanted.is_empty() || wanted.len() > MAX_RECEIPTS || wanted.iter().any(|n| *n < 1) {
        return Err(bad_request(
            "invalid_numbers",
            format!("give 1 to {MAX_RECEIPTS} ticket numbers"),
        ));
    }
    let mut wanted: Vec<i32> = wanted.into_iter().collect();
    wanted.sort_unstable();
    if !body.paid {
        sqlx::query!(
            "delete from ticket_payments where event_id = $1 and ticket_number = any($2)",
            event_id,
            &wanted,
        )
        .execute(&state.pool)
        .await?;
        return Ok(Json(overview(&state.pool, event_id).await?));
    }
    let pix = event_pix(&state.pool, event_id).await?;
    let sellers = sellers(&state.pool, event_id).await?;
    let payable: HashMap<i32, PixNumberDto> = numbers(&state.pool, event_id, &pix, &sellers)
        .await?
        .into_iter()
        .map(|row| (row.number, row))
        .collect();
    let mut tx = state.pool.begin().await?;
    for number in &wanted {
        let row = payable.get(number).ok_or_else(|| {
            bad_request(
                "pix_number_unknown",
                "only sold numbers and digital tickets are paid by Pix",
            )
        })?;
        sqlx::query!(
            r#"insert into ticket_payments (event_id, ticket_number, amount_cents, received_by, confirmed_by)
               values ($1, $2, $3, $4, $5)
               on conflict (event_id, ticket_number) do nothing"#,
            event_id,
            number,
            row.amount_cents.unwrap_or(0),
            row.payee.db(),
            user.id,
        )
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(Json(overview(&state.pool, event_id).await?))
}

// Public pages -----------------------------------------------------------------------------

/// The Pix of one number for its digital ticket; `None` when the event does not charge by Pix,
/// there is no key to pay or the number is a courtesy.
pub(crate) async fn ticket_pix(
    pool: &PgPool,
    event_id: Uuid,
    number: i32,
) -> ApiResult<Option<TicketPixDto>> {
    let pix = event_pix(pool, event_id).await?;
    if pix.receiver == PixReceiver::Off {
        return Ok(None);
    }
    let row = sqlx::query!(
        r#"select (select coalesce(tc.price_cents, e.ticket_price_cents)
                   from events e
                   left join category_ranges cr on cr.event_id = e.id and cr.numbers @> $2::int4
                   left join ticket_categories tc on tc.id = cr.category_id
                   where e.id = $1) as "amount_cents?",
                  s.pix_key_type as "key_type?", s.pix_key as "key?", s.pix_name as "name?",
                  s.pix_city as "city?",
                  exists(select 1 from ticket_payments p
                         where p.event_id = $1 and p.ticket_number = $2) as "paid!"
           from (select 1) one
           left join seller_assignments a on a.event_id = $1 and a.numbers @> $2::int4
           left join sellers s on s.id = a.seller_id"#,
        event_id,
        number,
    )
    .fetch_one(pool)
    .await?;
    if row.amount_cents == Some(0) {
        return Ok(None);
    }
    let seller = account(row.key_type.as_deref(), row.key, row.name, row.city);
    Ok(pix.payee(seller.as_ref()).map(|(_, account)| TicketPixDto {
        account,
        amount_cents: row.amount_cents,
        paid: row.paid,
    }))
}

/// `POST /api/seller/pix` (no login; the token is the credential): the seller saw the Pix of a
/// number they sold arrive on their own key, or undoes it. Money paid to the organization is
/// confirmed by the organization, never by the seller.
pub async fn seller_receipt(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<SellerPixBody>,
) -> ApiResult<Response> {
    ratelimit::by_ip(&state, &headers, ratelimit::SELLER_WRITE).await?;
    let link = find_link(&state, &body.token).await?;
    ensure_writable(&state, link.event_id, "/api/seller/pix").await?;
    let sale = sqlx::query!(
        r#"select coalesce(tc.price_cents, e.ticket_price_cents) as "amount_cents?",
                  s.pix_key_type, s.pix_key, s.pix_name, s.pix_city
           from ticket_sales ts
           join events e on e.id = ts.event_id
           join sellers s on s.id = ts.seller_id
           left join category_ranges cr on cr.event_id = ts.event_id and cr.numbers @> ts.ticket_number
           left join ticket_categories tc on tc.id = cr.category_id
           where ts.event_id = $1 and ts.ticket_number = $2 and ts.seller_id = $3"#,
        link.event_id,
        body.number,
        link.seller_id,
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| bad_request("ticket_not_sold", "mark the number as sold first"))?;
    let pix = event_pix(&state.pool, link.event_id).await?;
    let own = account(
        sale.pix_key_type.as_deref(),
        sale.pix_key,
        sale.pix_name,
        sale.pix_city,
    );
    if !matches!(pix.payee(own.as_ref()), Some((PixPayee::Seller, _))) {
        return Err(ApiError::Refused(
            "pix_not_yours",
            "this Pix goes to the organization, which confirms it".to_owned(),
        ));
    }
    if body.paid {
        sqlx::query!(
            r#"insert into ticket_payments (event_id, ticket_number, amount_cents, received_by)
               values ($1, $2, $3, 'seller')
               on conflict (event_id, ticket_number) do nothing"#,
            link.event_id,
            body.number,
            sale.amount_cents.unwrap_or(0),
        )
        .execute(&state.pool)
        .await?;
    } else {
        sqlx::query!(
            r#"delete from ticket_payments
               where event_id = $1 and ticket_number = $2 and received_by = 'seller'"#,
            link.event_id,
            body.number,
        )
        .execute(&state.pool)
        .await?;
    }
    Ok(no_store(view(&state, &link).await?))
}
