//! Prices, promotions, promo codes and credit (ADRs 0039, 0040). Admins version the price table
//! (with an announcement to everyone), run time-limited promotions and hand out codes; an
//! organization redeems codes and spends its credit on batches automatically.

use std::time::Duration;

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use serde::Deserialize;
use sqlx::{PgExecutor, Postgres, Transaction};
use time::OffsetDateTime;
use uuid::Uuid;

use super::admin::{audit, require_admin};
use super::announcements::{self, Announcement, notify_organization};
use super::{event_access, optional_text};
use crate::api::{
    AdminPricesDto, AnnouncementLevel, BatchQuoteDto, CreateBatchBody, CreditAdjustBody,
    CreditEntryDto, CreditReason, CreditsDto, NotificationKind, PendingDiscountDto, PriceTableBody,
    PromoCodeBody, PromoCodeDto, PromoCodeKind, PromoCodeUpdateBody, PromoRedemptionDto,
    PromotionBody, PromotionDto, RedeemBody, RedeemResultDto,
};
use crate::auth::AuthUser;
use crate::emails::money;
use crate::error::{ApiError, ApiResult, bad_request};
use crate::pricing::{self, Breakdown, PendingCode, PriceTable, Tier};
use crate::state::AppState;

const MAX_NOTE: usize = 200;
const MAX_CREDIT_ADJUST: i32 = 10_000_000;
/// Codes an account may try per hour (wrong ones included).
const REDEEM_ATTEMPTS: usize = 10;
const REDEEM_WINDOW: Duration = Duration::from_hours(1);

// Credit and discounts of an organization ------------------------------------------------

/// Credit balance of an organization, in centavos.
///
/// # Errors
///
/// Database errors.
pub(crate) async fn credit_balance<'e, E: PgExecutor<'e>>(
    executor: E,
    organization_id: Uuid,
) -> ApiResult<i32> {
    let sum = sqlx::query_scalar!(
        r#"select coalesce(sum(amount_cents), 0)::bigint as "sum!" from credit_ledger where organization_id = $1"#,
        organization_id
    )
    .fetch_one(executor)
    .await?;
    Ok(i32::try_from(sum).unwrap_or(i32::MAX))
}

/// The largest discount code the organization redeemed and has not used.
///
/// # Errors
///
/// Database errors.
pub(crate) async fn pending_code<'e, E: PgExecutor<'e>>(
    executor: E,
    organization_id: Uuid,
) -> ApiResult<Option<PendingCode>> {
    Ok(sqlx::query!(
        r#"select r.id, c.code, c.discount_percent as "percent!"
           from promo_redemptions r join promo_codes c on c.id = r.promo_code_id
           where r.organization_id = $1 and r.applied_at is null and c.kind = 'discount'
             and c.disabled_at is null
           order by c.discount_percent desc, r.redeemed_at limit 1"#,
        organization_id
    )
    .fetch_optional(executor)
    .await?
    .map(|row| PendingCode {
        redemption_id: row.id,
        code: row.code,
        percent: row.percent,
    }))
}

/// Free tickets the organization has left under `table`.
async fn free_left(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: Uuid,
    table: &PriceTable,
) -> ApiResult<i32> {
    let row = sqlx::query!(
        r#"select o.bonus_free_tickets,
                  (select coalesce(sum(b.free_tickets), 0)::int from ticket_batches b
                   join events e on e.id = b.event_id
                   where e.organization_id = o.id and b.status <> 'canceled') as "used!"
           from organizations o where o.id = $1"#,
        organization_id
    )
    .fetch_one(&mut **tx)
    .await?;
    Ok((table.free_tickets + row.bonus_free_tickets - row.used).max(0))
}

/// The price of a new batch of `quantity` for an organization, with what it is made of. Locks
/// the organization row, so two batches never spend the same free tickets, code or credit.
///
/// # Errors
///
/// Database errors.
pub(crate) async fn price_new_batch(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: Uuid,
    quantity: i32,
) -> ApiResult<(
    PriceTable,
    Breakdown,
    Option<PendingCode>,
    Option<pricing::Promotion>,
    i32,
)> {
    sqlx::query!(
        "select id from organizations where id = $1 for update",
        organization_id
    )
    .fetch_one(&mut **tx)
    .await?;
    let table = pricing::current(&mut **tx).await?;
    let free = free_left(tx, organization_id, &table).await?;
    let promotion = pricing::active_promotion(&mut **tx).await?;
    let code = pending_code(&mut **tx, organization_id).await?;
    let balance = credit_balance(&mut **tx, organization_id).await?;
    let breakdown = pricing::price(
        &table,
        quantity,
        free,
        promotion
            .as_ref()
            .map(|promotion| (promotion.id, promotion.dto.discount_percent)),
        code.as_ref(),
        balance,
    );
    Ok((table, breakdown, code, promotion, balance))
}

/// Records what a new batch spent: its credit (a ledger line) and its discount code.
///
/// # Errors
///
/// Database errors.
pub(crate) async fn spend_on_batch(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: Uuid,
    batch_id: Uuid,
    breakdown: &Breakdown,
    user: &AuthUser,
) -> ApiResult<()> {
    if breakdown.credit_cents > 0 {
        sqlx::query!(
            r#"insert into credit_ledger (id, organization_id, amount_cents, reason, reference_id, actor_id)
               values ($1, $2, $3, 'batch_payment', $4, $5)"#,
            Uuid::new_v4(),
            organization_id,
            -breakdown.credit_cents,
            batch_id,
            user.id,
        )
        .execute(&mut **tx)
        .await?;
    }
    if let Some(redemption) = breakdown.code_redemption_id {
        sqlx::query!(
            "update promo_redemptions set applied_batch_id = $2, applied_at = now() where id = $1",
            redemption,
            batch_id
        )
        .execute(&mut **tx)
        .await?;
    }
    Ok(())
}

/// Gives back what a batch spent (canceled before payment, or refunded): its credit returns to
/// the organization and its discount code waits for another batch.
///
/// # Errors
///
/// Database errors.
pub(crate) async fn give_back(
    tx: &mut Transaction<'_, Postgres>,
    batch_id: Uuid,
    reason: CreditReason,
    actor: Option<Uuid>,
) -> ApiResult<()> {
    let batch = sqlx::query!(
        r#"select b.credit_cents, e.organization_id from ticket_batches b
           join events e on e.id = b.event_id where b.id = $1"#,
        batch_id
    )
    .fetch_one(&mut **tx)
    .await?;
    if batch.credit_cents > 0 {
        sqlx::query!(
            r#"insert into credit_ledger (id, organization_id, amount_cents, reason, reference_id, actor_id)
               values ($1, $2, $3, $4, $5, $6)"#,
            Uuid::new_v4(),
            batch.organization_id,
            batch.credit_cents,
            reason.db(),
            batch_id,
            actor,
        )
        .execute(&mut **tx)
        .await?;
    }
    if reason == CreditReason::BatchCancel {
        sqlx::query!(
            "update promo_redemptions set applied_batch_id = null, applied_at = null where applied_batch_id = $1",
            batch_id
        )
        .execute(&mut **tx)
        .await?;
    }
    Ok(())
}

/// `POST /api/events/{id}/batches/quote`: what a batch would cost now, nothing reserved.
pub async fn quote(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
    Json(body): Json<CreateBatchBody>,
) -> ApiResult<Json<BatchQuoteDto>> {
    let access = event_access(&state.pool, &user, event_id).await?;
    if !(1..=pricing::LARGEST_BATCH).contains(&body.quantity) {
        return Err(bad_request("invalid_quantity", "quantity must be 1-5000"));
    }
    let mut tx = state.pool.begin().await?;
    let (_, breakdown, code, promotion, balance) =
        price_new_batch(&mut tx, access.organization_id, body.quantity).await?;
    // A quote never holds the lock past this request.
    tx.rollback().await?;
    Ok(Json(BatchQuoteDto {
        quantity: body.quantity,
        free_tickets: breakdown.free_tickets,
        list_price_cents: breakdown.list_price_cents,
        promotion: promotion
            .filter(|promotion| breakdown.promotion_id == Some(promotion.id))
            .map(|promotion| promotion.dto),
        discount_code: code
            .filter(|code| breakdown.code_redemption_id == Some(code.redemption_id))
            .map(|code| PendingDiscountDto {
                code: code.code,
                discount_percent: code.percent,
            }),
        discount_cents: breakdown.discount_cents,
        credit_cents: breakdown.credit_cents,
        total_cents: breakdown.total_cents,
        credit_balance_cents: balance,
    }))
}

/// Organization of the signed-in user.
async fn own_organization(state: &AppState, user: &AuthUser) -> ApiResult<Uuid> {
    sqlx::query_scalar!(
        "select organization_id from memberships where user_id = $1 order by created_at limit 1",
        user.id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound)
}

struct LedgerRow {
    id: Uuid,
    amount_cents: i32,
    reason: String,
    note: Option<String>,
    created_at: OffsetDateTime,
}

async fn ledger(state: &AppState, organization_id: Uuid) -> ApiResult<Vec<CreditEntryDto>> {
    let rows = sqlx::query_as!(
        LedgerRow,
        r#"select l.id, l.amount_cents, l.reason,
                  coalesce(l.note, (select c.code from promo_codes c where c.id = l.reference_id)) as note,
                  l.created_at
           from credit_ledger l where l.organization_id = $1
           order by l.created_at desc limit 100"#,
        organization_id
    )
    .fetch_all(&state.pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|row| CreditEntryDto {
            id: row.id,
            amount_cents: row.amount_cents,
            reason: CreditReason::from_db(&row.reason).unwrap_or(CreditReason::AdminAdjustment),
            note: row.note,
            created_at: row.created_at,
        })
        .collect())
}

async fn credits_of(state: &AppState, organization_id: Uuid) -> ApiResult<CreditsDto> {
    Ok(CreditsDto {
        balance_cents: credit_balance(&state.pool, organization_id).await?,
        entries: ledger(state, organization_id).await?,
        pending_discount: pending_code(&state.pool, organization_id)
            .await?
            .map(|code| PendingDiscountDto {
                code: code.code,
                discount_percent: code.percent,
            }),
    })
}

/// `GET /api/account/credits`.
pub async fn credits(State(state): State<AppState>, user: AuthUser) -> ApiResult<Json<CreditsDto>> {
    let organization_id = own_organization(&state, &user).await?;
    Ok(Json(credits_of(&state, organization_id).await?))
}

/// `GET /api/admin/organizations/{id}/credits`.
pub async fn admin_credits(
    State(state): State<AppState>,
    user: AuthUser,
    Path(organization_id): Path<Uuid>,
) -> ApiResult<Json<CreditsDto>> {
    require_admin(&user)?;
    Ok(Json(credits_of(&state, organization_id).await?))
}

/// `POST /api/admin/organizations/{id}/credits`: adds or removes credit (never below zero).
pub async fn adjust_credits(
    State(state): State<AppState>,
    user: AuthUser,
    Path(organization_id): Path<Uuid>,
    Json(body): Json<CreditAdjustBody>,
) -> ApiResult<Json<CreditsDto>> {
    require_admin(&user)?;
    if body.amount_cents == 0 || body.amount_cents.abs() > MAX_CREDIT_ADJUST {
        return Err(bad_request(
            "invalid_amount",
            "amount from -10000000 to 10000000 centavos, not zero",
        ));
    }
    let note = optional_text(body.note);
    if note
        .as_ref()
        .is_some_and(|note| note.chars().count() > MAX_NOTE)
    {
        return Err(bad_request("invalid_note", "note up to 200 characters"));
    }
    let mut tx = state.pool.begin().await?;
    sqlx::query!(
        "select id from organizations where id = $1 for update",
        organization_id
    )
    .fetch_optional(&mut *tx)
    .await?
    .ok_or(ApiError::NotFound)?;
    let balance = credit_balance(&mut *tx, organization_id).await?;
    if balance + body.amount_cents < 0 {
        return Err(ApiError::Conflict(
            "insufficient_credit",
            format!("the balance is {balance} centavos"),
        ));
    }
    sqlx::query!(
        r#"insert into credit_ledger (id, organization_id, amount_cents, reason, note, actor_id)
           values ($1, $2, $3, 'admin_adjustment', $4, $5)"#,
        Uuid::new_v4(),
        organization_id,
        body.amount_cents,
        note,
        user.id,
    )
    .execute(&mut *tx)
    .await?;
    if body.amount_cents > 0 {
        notify_organization(
            &mut *tx,
            organization_id,
            NotificationKind::CreditsGranted,
            serde_json::json!({ "amountCents": body.amount_cents, "note": note }),
        )
        .await?;
    }
    tx.commit().await?;
    audit(
        &state,
        &user,
        "credits_adjust",
        Some(organization_id),
        None,
        None,
        serde_json::json!({ "amountCents": body.amount_cents, "note": note }),
    )
    .await?;
    Ok(Json(credits_of(&state, organization_id).await?))
}

// Redeeming codes ---------------------------------------------------------------------------

fn normalize_code(raw: &str) -> String {
    raw.trim().to_ascii_uppercase()
}

fn code_error(code: &'static str, message: &str) -> ApiError {
    bad_request(code, message.to_owned())
}

/// What a redeemed code gives: credit on the ledger, free tickets on the organization; a
/// discount only waits for the next batch.
async fn apply_code(
    tx: &mut Transaction<'_, Postgres>,
    kind: PromoCodeKind,
    value: i32,
    promo_id: Uuid,
    organization_id: Uuid,
    user_id: Uuid,
) -> ApiResult<()> {
    match kind {
        PromoCodeKind::Credit => {
            sqlx::query!(
                r#"insert into credit_ledger (id, organization_id, amount_cents, reason, reference_id, actor_id)
                   values ($1, $2, $3, 'promo_code', $4, $5)"#,
                Uuid::new_v4(),
                organization_id,
                value,
                promo_id,
                user_id,
            )
            .execute(&mut **tx)
            .await?;
        }
        PromoCodeKind::FreeTickets => {
            sqlx::query!(
                "update organizations set bonus_free_tickets = least(bonus_free_tickets + $2, 100000) where id = $1",
                organization_id,
                value,
            )
            .execute(&mut **tx)
            .await?;
        }
        PromoCodeKind::Discount => {}
    }
    Ok(())
}

/// `POST /api/account/redeem`: checks, in order, that the code exists and is on, has started,
/// has not expired, was not used by this organization, fits the organization and has a use
/// left; then applies it.
#[expect(
    clippy::too_many_lines,
    reason = "the checks read best in their order, in one place"
)]
pub async fn redeem(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<RedeemBody>,
) -> ApiResult<Json<RedeemResultDto>> {
    if !state
        .attempt(
            &format!("redeem:{}", user.id),
            REDEEM_ATTEMPTS,
            REDEEM_WINDOW,
        )
        .await
    {
        return Err(ApiError::TooManyRequests);
    }
    let organization_id = own_organization(&state, &user).await?;
    let code = normalize_code(&body.code);
    let mut tx = state.pool.begin().await?;
    let Some(promo) = sqlx::query!(
        r#"select id, kind, credit_cents, free_tickets, discount_percent, new_organizations_only,
                  starts_at, expires_at, disabled_at, created_at
           from promo_codes where code = $1"#,
        code
    )
    .fetch_optional(&mut *tx)
    .await?
    else {
        return Err(code_error("promo_code_invalid", "unknown code"));
    };
    let now = OffsetDateTime::now_utc();
    if promo.disabled_at.is_some() || promo.starts_at.is_some_and(|starts| starts > now) {
        return Err(code_error("promo_code_invalid", "the code is not valid"));
    }
    if promo.expires_at.is_some_and(|expires| expires <= now) {
        return Err(code_error("promo_code_expired", "the code expired"));
    }
    let organization = sqlx::query!(
        "select created_at from organizations where id = $1 for update",
        organization_id
    )
    .fetch_one(&mut *tx)
    .await?;
    let redeemed = sqlx::query_scalar!(
        r#"select exists(select 1 from promo_redemptions where promo_code_id = $1 and organization_id = $2) as "redeemed!""#,
        promo.id,
        organization_id
    )
    .fetch_one(&mut *tx)
    .await?;
    if redeemed {
        return Err(code_error(
            "promo_code_already_redeemed",
            "this organization already used the code",
        ));
    }
    if promo.new_organizations_only
        && organization.created_at < promo.starts_at.unwrap_or(promo.created_at)
    {
        return Err(code_error(
            "promo_code_not_eligible",
            "the code is for new accounts",
        ));
    }
    // Takes a use, atomically.
    sqlx::query_scalar!(
        r#"update promo_codes set redemptions_count = redemptions_count + 1
           where id = $1 and (max_redemptions is null or redemptions_count < max_redemptions)
           returning id"#,
        promo.id
    )
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| code_error("promo_code_exhausted", "the code ran out"))?;
    sqlx::query!(
        r#"insert into promo_redemptions (id, promo_code_id, organization_id, redeemed_by)
           values ($1, $2, $3, $4)"#,
        Uuid::new_v4(),
        promo.id,
        organization_id,
        user.id,
    )
    .execute(&mut *tx)
    .await?;
    let kind = PromoCodeKind::from_db(&promo.kind).ok_or_else(|| anyhow::anyhow!("promo kind"))?;
    let value = match kind {
        PromoCodeKind::Credit => promo.credit_cents,
        PromoCodeKind::FreeTickets => promo.free_tickets,
        PromoCodeKind::Discount => promo.discount_percent,
    };
    apply_code(
        &mut tx,
        kind,
        value.unwrap_or(0),
        promo.id,
        organization_id,
        user.id,
    )
    .await?;
    tx.commit().await?;
    tracing::info!(%organization_id, promo_id = %promo.id, "promo code redeemed");
    Ok(Json(RedeemResultDto {
        kind,
        credit_cents: promo.credit_cents,
        free_tickets: promo.free_tickets,
        discount_percent: promo.discount_percent,
    }))
}

// Admin: prices ----------------------------------------------------------------------------

struct TableHistoryRow {
    id: Uuid,
    tiers: serde_json::Value,
    minimum_cents: i32,
    free_tickets: i32,
    effective_at: OffsetDateTime,
    note: Option<String>,
    created_by: Option<String>,
    created_at: OffsetDateTime,
}

async fn prices_dto(state: &AppState) -> ApiResult<AdminPricesDto> {
    let rows = sqlx::query_as!(
        TableHistoryRow,
        r#"select p.id, p.tiers, p.minimum_cents, p.free_tickets, p.effective_at, p.note,
                  u.email::text as "created_by?", p.created_at
           from price_tables p left join users u on u.id = p.created_by
           order by p.effective_at desc, p.created_at desc limit 50"#
    )
    .fetch_all(&state.pool)
    .await?;
    let history = rows
        .into_iter()
        .map(|row| {
            let table = PriceTable {
                id: row.id,
                tiers: serde_json::from_value(row.tiers)
                    .map_err(|error| ApiError::Internal(error.into()))?,
                minimum_cents: row.minimum_cents,
                free_tickets: row.free_tickets,
                effective_at: row.effective_at,
            };
            Ok(pricing::admin_dto(
                &table,
                row.note,
                row.created_by,
                row.created_at,
            ))
        })
        .collect::<ApiResult<Vec<_>>>()?;
    let current = pricing::current(&state.pool).await?;
    let upcoming = pricing::upcoming(&state.pool).await?;
    let find = |id: Uuid| history.iter().find(|item| item.id == id).cloned();
    Ok(AdminPricesDto {
        current: find(current.id).ok_or_else(|| anyhow::anyhow!("current table"))?,
        upcoming: upcoming.and_then(|table| find(table.id)),
        history,
    })
}

/// `GET /api/admin/prices`.
pub async fn admin_prices(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<AdminPricesDto>> {
    require_admin(&user)?;
    Ok(Json(prices_dto(&state).await?))
}

fn describe_table(tiers: &[Tier], minimum_cents: i32, free_tickets: i32) -> String {
    let mut lines = Vec::new();
    let mut previous = 0;
    for tier in tiers {
        lines.push(format!(
            "• Do {}º ao {}º ingresso do lote: {} cada",
            previous + 1,
            tier.up_to,
            money(tier.unit_cents)
        ));
        previous = tier.up_to;
    }
    lines.push(format!("• Valor mínimo por lote: {}", money(minimum_cents)));
    lines.push(format!("• Ingressos grátis por conta: {free_tickets}"));
    lines.join("\n")
}

/// `POST /api/admin/prices`: a new version of the table, now or later, optionally announced.
/// Batches already created keep their price.
pub async fn create_prices(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<PriceTableBody>,
) -> ApiResult<(StatusCode, Json<AdminPricesDto>)> {
    require_admin(&user)?;
    let tiers: Vec<Tier> = body
        .tiers
        .iter()
        .map(|tier| Tier {
            up_to: tier.up_to,
            unit_cents: tier.unit_cents,
        })
        .collect();
    pricing::validate(&tiers, body.minimum_cents, body.free_tickets)?;
    let note = optional_text(body.note);
    if note
        .as_ref()
        .is_some_and(|note| note.chars().count() > MAX_NOTE)
    {
        return Err(bad_request("invalid_note", "note up to 200 characters"));
    }
    let now = OffsetDateTime::now_utc();
    let effective_at = body.effective_at.unwrap_or(now).max(now);
    let mut tx = state.pool.begin().await?;
    // One announced table at a time: a new one replaces what was waiting.
    sqlx::query!("delete from price_tables where effective_at > now()")
        .execute(&mut *tx)
        .await?;
    let id = sqlx::query_scalar!(
        r#"insert into price_tables (id, tiers, minimum_cents, free_tickets, effective_at, note, created_by)
           values ($1, $2, $3, $4, $5, $6, $7) returning id"#,
        Uuid::new_v4(),
        serde_json::to_value(&tiers).map_err(anyhow::Error::from)?,
        body.minimum_cents,
        body.free_tickets,
        effective_at,
        note,
        user.id,
    )
    .fetch_one(&mut *tx)
    .await?;
    if body.announce {
        let later = effective_at > now + time::Duration::minutes(1);
        let when = if later {
            let local = effective_at
                .to_offset(time::UtcOffset::from_hms(-3, 0, 0).unwrap_or(time::UtcOffset::UTC));
            format!(
                "a partir de {:02}/{:02}/{} às {:02}:{:02} (horário de Brasília)",
                local.day(),
                u8::from(local.month()),
                local.year(),
                local.hour(),
                local.minute()
            )
        } else {
            "a partir de agora".to_owned()
        };
        let announcement = Announcement {
            title: "Novos preços dos ingressos".to_owned(),
            body: format!(
                "Os preços dos lotes mudam {when}. Lotes já criados mantêm o preço da criação.\n\n{}",
                describe_table(&tiers, body.minimum_cents, body.free_tickets)
            ),
            cta: Some(("Ver preços".to_owned(), "/#precos".to_owned())),
            starts_at: now,
            ends_at: Some(effective_at.max(now) + time::Duration::days(14)),
        };
        announcements::insert(
            &mut *tx,
            &user,
            &announcement,
            AnnouncementLevel::Warning,
            body.announcement_display,
            true,
        )
        .await?;
    }
    tx.commit().await?;
    audit(
        &state,
        &user,
        "price_table_create",
        None,
        None,
        Some(id),
        serde_json::json!({
            "tiers": tiers,
            "minimumCents": body.minimum_cents,
            "freeTickets": body.free_tickets,
            "effectiveAt": effective_at.unix_timestamp(),
            "announced": body.announce,
        }),
    )
    .await?;
    Ok((StatusCode::CREATED, Json(prices_dto(&state).await?)))
}

/// `DELETE /api/admin/prices/{id}`: withdraws a table announced for later.
pub async fn delete_prices(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<AdminPricesDto>> {
    require_admin(&user)?;
    let deleted = sqlx::query!(
        "delete from price_tables where id = $1 and effective_at > now()",
        id
    )
    .execute(&state.pool)
    .await?
    .rows_affected();
    if deleted == 0 {
        return Err(ApiError::Conflict(
            "prices_in_force",
            "only a table that has not started can be withdrawn".to_owned(),
        ));
    }
    audit(
        &state,
        &user,
        "price_table_delete",
        None,
        None,
        Some(id),
        serde_json::json!({}),
    )
    .await?;
    Ok(Json(prices_dto(&state).await?))
}

// Admin: promotions ------------------------------------------------------------------------

struct PromotionRow {
    id: Uuid,
    name: String,
    headline: Option<String>,
    discount_percent: i32,
    starts_at: OffsetDateTime,
    ends_at: OffsetDateTime,
    active: bool,
    batches: i64,
    discount_cents: i64,
}

impl From<PromotionRow> for PromotionDto {
    fn from(row: PromotionRow) -> Self {
        Self {
            id: row.id,
            name: row.name,
            headline: row.headline,
            discount_percent: row.discount_percent,
            starts_at: row.starts_at,
            ends_at: row.ends_at,
            active: row.active,
            batches: row.batches,
            discount_cents: row.discount_cents,
        }
    }
}

async fn load_promotions(state: &AppState, id: Option<Uuid>) -> ApiResult<Vec<PromotionDto>> {
    let rows = sqlx::query_as!(
        PromotionRow,
        r#"select p.id, p.name, p.headline, p.discount_percent, p.starts_at, p.ends_at, p.active,
                  (select count(*) from ticket_batches b where b.promotion_id = p.id and b.status <> 'canceled') as "batches!",
                  (select coalesce(sum(b.discount_cents), 0) from ticket_batches b
                   where b.promotion_id = p.id and b.status <> 'canceled')::bigint as "discount_cents!"
           from promotions p where ($1::uuid is null or p.id = $1)
           order by p.starts_at desc limit 100"#,
        id
    )
    .fetch_all(&state.pool)
    .await?;
    Ok(rows.into_iter().map(Into::into).collect())
}

struct ValidPromotion {
    name: String,
    headline: Option<String>,
}

fn validate_promotion(body: &PromotionBody) -> ApiResult<ValidPromotion> {
    let name = body.name.trim().to_owned();
    if name.is_empty() || name.chars().count() > 80 {
        return Err(bad_request("invalid_name", "name of 1 to 80 characters"));
    }
    let headline = optional_text(body.headline.clone());
    if headline
        .as_ref()
        .is_some_and(|text| text.chars().count() > 120)
    {
        return Err(bad_request(
            "invalid_headline",
            "headline up to 120 characters",
        ));
    }
    if !(1..=100).contains(&body.discount_percent) {
        return Err(bad_request("invalid_percent", "discount from 1 to 100%"));
    }
    if body.ends_at <= body.starts_at {
        return Err(bad_request(
            "invalid_dates",
            "the end must be after the start",
        ));
    }
    Ok(ValidPromotion { name, headline })
}

/// `GET /api/admin/promotions`.
pub async fn promotions(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<Vec<PromotionDto>>> {
    require_admin(&user)?;
    Ok(Json(load_promotions(&state, None).await?))
}

/// `POST /api/admin/promotions`.
pub async fn create_promotion(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<PromotionBody>,
) -> ApiResult<(StatusCode, Json<PromotionDto>)> {
    require_admin(&user)?;
    let valid = validate_promotion(&body)?;
    let id = sqlx::query_scalar!(
        r#"insert into promotions (id, name, headline, discount_percent, starts_at, ends_at, active, created_by)
           values ($1, $2, $3, $4, $5, $6, $7, $8) returning id"#,
        Uuid::new_v4(),
        valid.name,
        valid.headline,
        body.discount_percent,
        body.starts_at,
        body.ends_at,
        body.active,
        user.id,
    )
    .fetch_one(&state.pool)
    .await?;
    audit(
        &state,
        &user,
        "promotion_create",
        None,
        None,
        Some(id),
        serde_json::json!({ "name": valid.name, "percent": body.discount_percent }),
    )
    .await?;
    let created = load_promotions(&state, Some(id))
        .await?
        .into_iter()
        .next()
        .ok_or(ApiError::NotFound)?;
    Ok((StatusCode::CREATED, Json(created)))
}

/// `PUT /api/admin/promotions/{id}`.
pub async fn update_promotion(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<PromotionBody>,
) -> ApiResult<Json<PromotionDto>> {
    require_admin(&user)?;
    let valid = validate_promotion(&body)?;
    let updated = sqlx::query!(
        r#"update promotions set name = $2, headline = $3, discount_percent = $4, starts_at = $5,
                  ends_at = $6, active = $7 where id = $1"#,
        id,
        valid.name,
        valid.headline,
        body.discount_percent,
        body.starts_at,
        body.ends_at,
        body.active,
    )
    .execute(&state.pool)
    .await?
    .rows_affected();
    if updated == 0 {
        return Err(ApiError::NotFound);
    }
    audit(
        &state,
        &user,
        "promotion_update",
        None,
        None,
        Some(id),
        serde_json::json!({ "name": valid.name, "percent": body.discount_percent, "active": body.active }),
    )
    .await?;
    load_promotions(&state, Some(id))
        .await?
        .into_iter()
        .next()
        .map(Json)
        .ok_or(ApiError::NotFound)
}

/// `DELETE /api/admin/promotions/{id}`: batches that used it keep their price.
pub async fn delete_promotion(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    require_admin(&user)?;
    let deleted = sqlx::query!("delete from promotions where id = $1", id)
        .execute(&state.pool)
        .await?
        .rows_affected();
    if deleted == 0 {
        return Err(ApiError::NotFound);
    }
    audit(
        &state,
        &user,
        "promotion_delete",
        None,
        None,
        Some(id),
        serde_json::json!({}),
    )
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

// Admin: promo codes -----------------------------------------------------------------------

struct CodeRow {
    id: Uuid,
    code: String,
    kind: String,
    credit_cents: Option<i32>,
    free_tickets: Option<i32>,
    discount_percent: Option<i32>,
    description: Option<String>,
    max_redemptions: Option<i32>,
    redemptions_count: i32,
    new_organizations_only: bool,
    starts_at: Option<OffsetDateTime>,
    expires_at: Option<OffsetDateTime>,
    disabled_at: Option<OffsetDateTime>,
    created_at: OffsetDateTime,
}

impl CodeRow {
    fn into_dto(self) -> ApiResult<PromoCodeDto> {
        Ok(PromoCodeDto {
            id: self.id,
            code: self.code,
            kind: PromoCodeKind::from_db(&self.kind)
                .ok_or_else(|| anyhow::anyhow!("promo kind"))?,
            credit_cents: self.credit_cents,
            free_tickets: self.free_tickets,
            discount_percent: self.discount_percent,
            description: self.description,
            max_redemptions: self.max_redemptions,
            redemptions_count: self.redemptions_count,
            new_organizations_only: self.new_organizations_only,
            starts_at: self.starts_at,
            expires_at: self.expires_at,
            disabled: self.disabled_at.is_some(),
            created_at: self.created_at,
        })
    }
}

async fn load_codes(state: &AppState, id: Option<Uuid>) -> ApiResult<Vec<PromoCodeDto>> {
    sqlx::query_as!(
        CodeRow,
        r#"select id, code, kind, credit_cents, free_tickets, discount_percent, description,
                  max_redemptions, redemptions_count, new_organizations_only, starts_at, expires_at,
                  disabled_at, created_at
           from promo_codes where ($1::uuid is null or id = $1)
           order by created_at desc limit 200"#,
        id
    )
    .fetch_all(&state.pool)
    .await?
    .into_iter()
    .map(CodeRow::into_dto)
    .collect()
}

/// A random code: 8 characters without look-alikes (0/O, 1/I).
fn random_code() -> ApiResult<String> {
    const ALPHABET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let mut bytes = [0u8; 8];
    getrandom::fill(&mut bytes)
        .map_err(|error| ApiError::Internal(anyhow::anyhow!("OS RNG: {error}")))?;
    Ok(bytes
        .iter()
        .map(|byte| {
            let index = usize::from(*byte) % ALPHABET.len();
            char::from(ALPHABET.get(index).copied().unwrap_or(b'X'))
        })
        .collect())
}

fn validate_max(max: Option<i32>) -> ApiResult<()> {
    if max.is_some_and(|max| !(1..=1_000_000).contains(&max)) {
        return Err(bad_request("invalid_max", "uses from 1 to 1000000"));
    }
    Ok(())
}

/// `GET /api/admin/promo-codes`.
pub async fn promo_codes(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<Vec<PromoCodeDto>>> {
    require_admin(&user)?;
    Ok(Json(load_codes(&state, None).await?))
}

/// `POST /api/admin/promo-codes`.
pub async fn create_promo_code(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<PromoCodeBody>,
) -> ApiResult<(StatusCode, Json<PromoCodeDto>)> {
    require_admin(&user)?;
    let code = match optional_text(body.code) {
        Some(code) => normalize_code(&code),
        None => random_code()?,
    };
    if !(4..=32).contains(&code.len())
        || !code
            .chars()
            .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '-' || c == '_')
    {
        return Err(bad_request(
            "invalid_code_format",
            "4 to 32 letters, digits, - or _",
        ));
    }
    let (credit, free, percent) = match body.kind {
        PromoCodeKind::Credit => (body.credit_cents, None, None),
        PromoCodeKind::FreeTickets => (None, body.free_tickets, None),
        PromoCodeKind::Discount => (None, None, body.discount_percent),
    };
    let value_ok = match body.kind {
        PromoCodeKind::Credit => credit.is_some_and(|cents| (1..=10_000_000).contains(&cents)),
        PromoCodeKind::FreeTickets => free.is_some_and(|tickets| (1..=100_000).contains(&tickets)),
        PromoCodeKind::Discount => percent.is_some_and(|percent| (1..=100).contains(&percent)),
    };
    if !value_ok {
        return Err(bad_request(
            "invalid_value",
            "the value of the code is out of range",
        ));
    }
    validate_max(body.max_redemptions)?;
    let description = optional_text(body.description);
    if description
        .as_ref()
        .is_some_and(|text| text.chars().count() > MAX_NOTE)
    {
        return Err(bad_request(
            "invalid_note",
            "description up to 200 characters",
        ));
    }
    if let (Some(starts), Some(expires)) = (body.starts_at, body.expires_at)
        && expires <= starts
    {
        return Err(bad_request(
            "invalid_dates",
            "the expiry must be after the start",
        ));
    }
    let id = sqlx::query_scalar!(
        r#"insert into promo_codes
             (id, code, kind, credit_cents, free_tickets, discount_percent, description, max_redemptions,
              new_organizations_only, starts_at, expires_at, created_by)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) returning id"#,
        Uuid::new_v4(),
        code,
        body.kind.db(),
        credit,
        free,
        percent,
        description,
        body.max_redemptions,
        body.new_organizations_only,
        body.starts_at,
        body.expires_at,
        user.id,
    )
    .fetch_one(&state.pool)
    .await
    .map_err(|error| match ApiError::from(error) {
        ApiError::Conflict("duplicate", _) => {
            ApiError::Conflict("promo_code_exists", "this code already exists".to_owned())
        }
        other => other,
    })?;
    audit(
        &state,
        &user,
        "promo_code_create",
        None,
        None,
        Some(id),
        serde_json::json!({ "code": code, "kind": body.kind.db() }),
    )
    .await?;
    let created = load_codes(&state, Some(id))
        .await?
        .into_iter()
        .next()
        .ok_or(ApiError::NotFound)?;
    Ok((StatusCode::CREATED, Json(created)))
}

/// `PUT /api/admin/promo-codes/{id}`.
pub async fn update_promo_code(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<PromoCodeUpdateBody>,
) -> ApiResult<Json<PromoCodeDto>> {
    require_admin(&user)?;
    validate_max(body.max_redemptions)?;
    let description = optional_text(body.description);
    if description
        .as_ref()
        .is_some_and(|text| text.chars().count() > MAX_NOTE)
    {
        return Err(bad_request(
            "invalid_note",
            "description up to 200 characters",
        ));
    }
    let updated = sqlx::query!(
        r#"update promo_codes set description = $2, max_redemptions = $3, expires_at = $4,
                  disabled_at = case when $5 then coalesce(disabled_at, now()) end
           where id = $1"#,
        id,
        description,
        body.max_redemptions,
        body.expires_at,
        body.disabled,
    )
    .execute(&state.pool)
    .await?
    .rows_affected();
    if updated == 0 {
        return Err(ApiError::NotFound);
    }
    audit(
        &state,
        &user,
        "promo_code_update",
        None,
        None,
        Some(id),
        serde_json::json!({ "disabled": body.disabled, "maxRedemptions": body.max_redemptions }),
    )
    .await?;
    load_codes(&state, Some(id))
        .await?
        .into_iter()
        .next()
        .map(Json)
        .ok_or(ApiError::NotFound)
}

/// Pagination of the redemptions list.
#[derive(Debug, Deserialize)]
pub struct RedemptionsQuery {
    #[serde(default)]
    limit: Option<i64>,
}

/// `GET /api/admin/promo-codes/{id}/redemptions`.
pub async fn redemptions(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Query(query): Query<RedemptionsQuery>,
) -> ApiResult<Json<Vec<PromoRedemptionDto>>> {
    require_admin(&user)?;
    let rows = sqlx::query!(
        r#"select r.organization_id, o.name as organization_name, u.email::text as "redeemed_by?",
                  r.redeemed_at, r.applied_at
           from promo_redemptions r
           join organizations o on o.id = r.organization_id
           left join users u on u.id = r.redeemed_by
           where r.promo_code_id = $1 order by r.redeemed_at desc limit $2"#,
        id,
        query.limit.unwrap_or(200).clamp(1, 1000),
    )
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(
        rows.into_iter()
            .map(|row| PromoRedemptionDto {
                organization_id: row.organization_id,
                organization_name: row.organization_name,
                redeemed_by: row.redeemed_by,
                redeemed_at: row.redeemed_at,
                applied_at: row.applied_at,
            })
            .collect(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn random_codes_are_readable() {
        let code = random_code().unwrap();
        assert_eq!(code.len(), 8);
        assert!(
            code.chars()
                .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit())
        );
        assert!(!code.contains(['0', 'O', '1', 'I']));
    }
}
