//! Batches (payment unit). Only `paid` batches are ever signed (CLAUDE.md invariant 2).
//!
//! A batch is paid online through Stripe Checkout (ADR 0020) or, as a fallback, by an admin
//! (ADR 0014). Stripe's word reaches us in two ways, both handled by [`apply_session`]: the
//! signed webhook and, when the payer comes back to the site, a session read back from Stripe.
//!
//! Checkout, cancel and mark-paid of one batch run one at a time ([`AppState::batch_lock`]), so
//! a batch never has two payable sessions, nor a payable session once canceled or paid by hand.
//! Stripe is called with no database transaction open: a slow Stripe holds no row lock, no pool
//! connection and no transaction id (which would freeze the door's sync cursor, ADR 0006).

use axum::Json;
use axum::body::Bytes;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use sqlx::postgres::types::PgRange;
use time::OffsetDateTime;
use uuid::Uuid;

use super::{MAX_TICKET_NUMBER, authorize_event, bounds, range};
use crate::api::{
    BatchDto, BatchStatus, CheckoutDto, CreateBatchBody, PaymentMethod, PaymentState, PricingDto,
};
use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult, bad_request};
use crate::payments::{CheckoutRequest, CheckoutSession, PaymentError};
use crate::state::AppState;
use crate::{pricing, texts};

const MAX_BATCH: i32 = 5_000;
/// An open checkout is reused only if it still has this long to live; otherwise it is expired
/// and a new one is opened (the payer needs time to scan a Pix code or type a card).
const REUSE_MARGIN_MINUTES: i32 = 15;

struct BatchRow {
    id: Uuid,
    numbers: PgRange<i32>,
    status: String,
    created_at: OffsetDateTime,
    paid_at: Option<OffsetDateTime>,
    price_cents: i32,
    free_tickets: i32,
    paid_via: Option<String>,
    pending_payment: Option<String>,
}

impl BatchRow {
    fn into_dto(self) -> ApiResult<BatchDto> {
        let (first, last) = bounds(&self.numbers)?;
        Ok(BatchDto {
            id: self.id,
            first,
            last,
            status: BatchStatus::from_db(&self.status).ok_or_else(|| {
                ApiError::Internal(anyhow::anyhow!("unknown batch status {}", self.status))
            })?,
            created_at: self.created_at,
            paid_at: self.paid_at,
            price_cents: self.price_cents,
            free_tickets: self.free_tickets,
            paid_via: self.paid_via.as_deref().and_then(PaymentMethod::from_db),
            pending_payment: self
                .pending_payment
                .as_deref()
                .and_then(PaymentState::from_db),
        })
    }
}

async fn load(state: &AppState, batch_id: Uuid) -> ApiResult<BatchDto> {
    sqlx::query_as!(
        BatchRow,
        r#"select b.id, b.numbers, b.status, b.created_at, b.paid_at, b.price_cents, b.free_tickets, b.paid_via,
                  (select case when bool_or(p.status = 'processing') then 'processing'
                               when bool_or(p.status = 'open' and p.expires_at > now()) then 'open' end
                   from payments p where p.batch_id = b.id) as pending_payment
           from ticket_batches b where b.id = $1"#,
        batch_id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound)?
    .into_dto()
}

/// `GET /api/pricing` (no login): the price table, shown on the site and before paying.
pub async fn pricing_table(State(state): State<AppState>) -> Json<PricingDto> {
    Json(pricing::table(
        state.payments.enabled(),
        state.config.free_tickets,
    ))
}

/// `GET /api/events/{id}/batches`.
pub async fn list(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
) -> ApiResult<Json<Vec<BatchDto>>> {
    authorize_event(&state.pool, &user, event_id).await?;
    let rows = sqlx::query_as!(
        BatchRow,
        r#"select b.id, b.numbers, b.status, b.created_at, b.paid_at, b.price_cents, b.free_tickets, b.paid_via,
                  (select case when bool_or(p.status = 'processing') then 'processing'
                               when bool_or(p.status = 'open' and p.expires_at > now()) then 'open' end
                   from payments p where p.batch_id = b.id) as pending_payment
           from ticket_batches b where b.event_id = $1 order by lower(b.numbers)"#,
        event_id
    )
    .fetch_all(&state.pool)
    .await?;
    rows.into_iter()
        .map(BatchRow::into_dto)
        .collect::<ApiResult<Vec<_>>>()
        .map(Json)
}

/// `POST /api/events/{id}/batches`: numbers continue after the last non-canceled batch; the
/// price is fixed now, from the table in force.
pub async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
    Json(body): Json<CreateBatchBody>,
) -> ApiResult<(StatusCode, Json<BatchDto>)> {
    authorize_event(&state.pool, &user, event_id).await?;
    if !(1..=MAX_BATCH).contains(&body.quantity) {
        return Err(bad_request(
            "invalid_quantity",
            format!("quantity must be 1-{MAX_BATCH}"),
        ));
    }
    let mut tx = state.pool.begin().await?;
    let first = sqlx::query_scalar!(
        r#"select coalesce(max(upper(numbers)), 1) as "first!" from ticket_batches
           where event_id = $1 and status <> 'canceled'"#,
        event_id
    )
    .fetch_one(&mut *tx)
    .await?;
    let last = first
        .checked_add(body.quantity - 1)
        .filter(|last| *last <= MAX_TICKET_NUMBER)
        .ok_or_else(|| bad_request("invalid_quantity", "ticket numbers exhausted"))?;
    let key_id = sqlx::query_scalar!(
        "select key_id from event_signing_keys where event_id = $1 and status = 'active'",
        event_id
    )
    .fetch_one(&mut *tx)
    .await?;
    // The organization's free tickets (ADR 0024). Its row lock keeps two batches created at the
    // same time from spending the same allowance.
    sqlx::query!(
        "select id from organizations where id = (select organization_id from events where id = $1) for update",
        event_id
    )
    .fetch_one(&mut *tx)
    .await?;
    let free_used = sqlx::query_scalar!(
        r#"select coalesce(sum(b.free_tickets), 0)::int as "used!"
           from organizations o
           join events e on e.organization_id = o.id
           join ticket_batches b on b.event_id = e.id and b.status <> 'canceled'
           where o.id = (select organization_id from events where id = $1)"#,
        event_id
    )
    .fetch_one(&mut *tx)
    .await?;
    let free = (state.config.free_tickets - free_used).clamp(0, body.quantity);
    let price = pricing::quote_with_free(body.quantity, free);
    // A batch entirely covered by free tickets is born paid.
    let (status, paid_via) = if price == 0 {
        (BatchStatus::Paid, Some(PaymentMethod::Free.db()))
    } else {
        (BatchStatus::AwaitingPayment, None)
    };
    // A concurrent request computing the same `first` loses on the exclusion constraint (409).
    let id = sqlx::query_scalar!(
        r#"insert into ticket_batches
             (id, event_id, numbers, key_id, status, price_cents, free_tickets, paid_via, paid_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8, case when $8::text is null then null else now() end)
           returning id"#,
        Uuid::new_v4(),
        event_id,
        range(first, last)?,
        key_id,
        status.db(),
        price,
        free,
        paid_via,
    )
    .fetch_one(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok((StatusCode::CREATED, Json(load(&state, id).await?)))
}

async fn batch_event(state: &AppState, batch_id: Uuid) -> ApiResult<Uuid> {
    sqlx::query_scalar!(
        "select event_id from ticket_batches where id = $1",
        batch_id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound)
}

fn provider_error(error: &PaymentError) -> ApiError {
    match error {
        PaymentError::Disabled => ApiError::Unavailable("payments_unavailable"),
        PaymentError::Provider(detail) => {
            tracing::error!(%detail, "stripe request failed");
            ApiError::Unavailable("payment_provider_error")
        }
    }
}

fn payment_pending() -> ApiError {
    ApiError::Conflict(
        "payment_pending",
        "a payment of this batch is still being confirmed (Pix)".to_owned(),
    )
}

fn not_payable() -> ApiError {
    ApiError::Conflict(
        "batch_not_payable",
        "batch is not awaiting payment".to_owned(),
    )
}

/// `POST /api/batches/{id}/checkout`: the Stripe payment page of an unpaid batch (an open one is
/// reused, so double clicks and back buttons never create two charges).
pub async fn checkout(
    State(state): State<AppState>,
    user: AuthUser,
    Path(batch_id): Path<Uuid>,
) -> ApiResult<Json<CheckoutDto>> {
    if !state.payments.enabled() {
        return Err(ApiError::Unavailable("payments_unavailable"));
    }
    let event_id = batch_event(&state, batch_id).await?;
    let event = authorize_event(&state.pool, &user, event_id).await?;
    let _guard = state.batch_lock(batch_id).await;

    let batch = sqlx::query!(
        "select numbers, status, price_cents from ticket_batches where id = $1",
        batch_id
    )
    .fetch_one(&state.pool)
    .await?;
    if batch.status != BatchStatus::AwaitingPayment.db() {
        return Err(not_payable());
    }
    let open = sqlx::query!(
        r#"select status, checkout_url, expires_at > now() + make_interval(mins => $2) as "fresh!"
           from payments where batch_id = $1 and status in ('open', 'processing')
           order by created_at desc"#,
        batch_id,
        REUSE_MARGIN_MINUTES,
    )
    .fetch_all(&state.pool)
    .await?;
    if open.iter().any(|payment| payment.status == "processing") {
        return Err(payment_pending());
    }
    if let Some(reusable) = open.iter().find(|payment| payment.fresh) {
        return Ok(Json(CheckoutDto {
            url: reusable.checkout_url.clone(),
        }));
    }
    // Sessions about to expire are closed first: a batch never has two payable sessions.
    if close_open_checkouts(&state, batch_id).await? {
        return Err(not_payable());
    }

    let (first, last) = bounds(&batch.numbers)?;
    // Batches created before ADR 0020 have no price yet.
    let amount_cents = if batch.price_cents > 0 {
        batch.price_cents
    } else {
        let price = pricing::quote(last - first + 1);
        sqlx::query!(
            "update ticket_batches set price_cents = $2 where id = $1",
            batch_id,
            price
        )
        .execute(&state.pool)
        .await?;
        price
    };
    let payment_id = Uuid::new_v4();
    let back = format!(
        "{}/painel/eventos/{event_id}?aba=lotes&lote={batch_id}",
        state.config.public_web_url
    );
    let session = state
        .payments
        .create_checkout(&CheckoutRequest {
            payment_id,
            batch_id,
            event_id,
            description: texts::checkout_description(&event.name, first, last),
            amount_cents,
            customer_email: user.email.clone(),
            success_url: format!("{back}&pagamento=sucesso"),
            cancel_url: format!("{back}&pagamento=cancelado"),
        })
        .await
        .map_err(|error| provider_error(&error))?;
    let url = session.url.clone().ok_or_else(|| {
        ApiError::Internal(anyhow::anyhow!(
            "checkout session {} has no url",
            session.id
        ))
    })?;
    let expires_at = OffsetDateTime::from_unix_timestamp(session.expires_at)
        .map_err(|error| ApiError::Internal(error.into()))?;
    sqlx::query!(
        r#"insert into payments
             (id, batch_id, checkout_session_id, checkout_url, amount_cents, currency, created_by, expires_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8)"#,
        payment_id,
        batch_id,
        session.id,
        url,
        amount_cents,
        pricing::CURRENCY,
        user.id,
        expires_at,
    )
    .execute(&state.pool)
    .await?;
    tracing::info!(%batch_id, session = %session.id, amount_cents, "checkout opened");
    Ok(Json(CheckoutDto { url }))
}

/// `POST /api/batches/{id}/checkout/sync`: asks Stripe about the unsettled checkouts of the
/// batch (the payer just came back; the webhook may still be on its way).
pub async fn sync_checkout(
    State(state): State<AppState>,
    user: AuthUser,
    Path(batch_id): Path<Uuid>,
) -> ApiResult<Json<BatchDto>> {
    let event_id = batch_event(&state, batch_id).await?;
    authorize_event(&state.pool, &user, event_id).await?;
    if state.payments.enabled() {
        let sessions = sqlx::query_scalar!(
            "select checkout_session_id from payments where batch_id = $1 and status in ('open', 'processing')",
            batch_id
        )
        .fetch_all(&state.pool)
        .await?;
        for session_id in sessions {
            let session = state
                .payments
                .retrieve_checkout(&session_id)
                .await
                .map_err(|error| provider_error(&error))?;
            apply_session(&state, &session).await?;
        }
    }
    Ok(Json(load(&state, batch_id).await?))
}

/// Records what Stripe says about a session: paid (the batch becomes paid, once), complete but
/// unpaid (Pix shown, transfer pending: "processing"), expired. Sessions we did not open are
/// ignored; so are amounts that do not match the payment.
pub async fn apply_session(state: &AppState, session: &CheckoutSession) -> ApiResult<()> {
    let Some(payment) = sqlx::query!(
        "select id, batch_id, amount_cents, currency from payments where checkout_session_id = $1",
        session.id
    )
    .fetch_optional(&state.pool)
    .await?
    else {
        tracing::warn!(session = %session.id, "stripe session unknown here; ignored");
        return Ok(());
    };

    if !session.is_paid() {
        let status = match session.status.as_deref() {
            Some("expired") => "expired",
            Some("complete") => "processing",
            _ => return Ok(()),
        };
        sqlx::query!(
            "update payments set status = $2 where id = $1 and status in ('open', 'processing')",
            payment.id,
            status
        )
        .execute(&state.pool)
        .await?;
        return Ok(());
    }
    if session.amount_total != Some(i64::from(payment.amount_cents))
        || session.currency.as_deref() != Some(payment.currency.as_str())
    {
        tracing::error!(
            session = %session.id,
            expected = payment.amount_cents,
            got = ?session.amount_total,
            "paid amount does not match the payment; batch left unpaid"
        );
        return Ok(());
    }

    let mut tx = state.pool.begin().await?;
    sqlx::query!(
        r#"update payments set status = 'paid', paid_at = coalesce(paid_at, now()),
                  payment_intent_id = coalesce($2, payment_intent_id)
           where id = $1"#,
        payment.id,
        session.payment_intent,
    )
    .execute(&mut *tx)
    .await?;
    let paid = sqlx::query_scalar!(
        r#"update ticket_batches set status = 'paid', paid_at = now(), paid_via = 'stripe'
           where id = $1 and status = 'awaiting_payment' returning id"#,
        payment.batch_id
    )
    .fetch_optional(&mut *tx)
    .await?;
    tx.commit().await?;
    if paid.is_some() {
        tracing::info!(batch_id = %payment.batch_id, session = %session.id, "batch paid online");
    } else if needs_refund(state, payment.batch_id).await? {
        // Money without tickets: someone has to refund it in the Stripe dashboard.
        tracing::error!(
            batch_id = %payment.batch_id,
            session = %session.id,
            "payment received for a batch that is canceled or already paid: refund it in Stripe"
        );
    }
    Ok(())
}

/// After a paid session that did not pay the batch: whether it was money the batch did not need
/// (canceled, paid by hand, or paid by another session). A replayed webhook needs nothing.
async fn needs_refund(state: &AppState, batch_id: Uuid) -> ApiResult<bool> {
    let row = sqlx::query!(
        r#"select b.status, b.paid_via,
                  (select count(*) from payments p where p.batch_id = b.id and p.status = 'paid') as "paid_sessions!"
           from ticket_batches b where b.id = $1"#,
        batch_id
    )
    .fetch_one(&state.pool)
    .await?;
    Ok(row.status == BatchStatus::Canceled.db()
        || row.paid_via.as_deref() == Some("admin")
        || row.paid_sessions > 1)
}

/// Closes the open checkouts of a batch (before cancel, mark-paid or a replacement checkout), so
/// nobody pays for it afterwards. Returns `true` if one turned out to be paid already; fails with
/// `payment_pending` while a Pix transfer may still arrive. Call with the batch lock held.
async fn close_open_checkouts(state: &AppState, batch_id: Uuid) -> ApiResult<bool> {
    let unsettled = sqlx::query!(
        "select id, status, checkout_session_id from payments where batch_id = $1 and status in ('open', 'processing')",
        batch_id
    )
    .fetch_all(&state.pool)
    .await?;
    for payment in unsettled {
        if state.payments.enabled() {
            let expired = if payment.status == "open" {
                state
                    .payments
                    .expire_checkout(&payment.checkout_session_id)
                    .await
            } else {
                Err(PaymentError::Provider("session is processing".to_owned()))
            };
            if let Err(error) = expired {
                // Not open anymore: paid, waiting for a Pix transfer, or expired on its own.
                tracing::info!(%error, session = %payment.checkout_session_id, "could not expire checkout");
                let session = state
                    .payments
                    .retrieve_checkout(&payment.checkout_session_id)
                    .await
                    .map_err(|error| provider_error(&error))?;
                apply_session(state, &session).await?;
                if session.is_paid() {
                    return Ok(true);
                }
                match session.status.as_deref() {
                    Some("complete") => return Err(payment_pending()),
                    Some("open") => return Err(provider_error(&error)),
                    _ => {}
                }
            }
        }
        sqlx::query!(
            "update payments set status = 'expired' where id = $1 and status in ('open', 'processing')",
            payment.id
        )
        .execute(&state.pool)
        .await?;
    }
    Ok(false)
}

/// `POST /api/batches/{id}/cancel`: only before payment, and only once no seller range or void
/// refers to its numbers (they would carry over to the next batch that reuses them).
pub async fn cancel(
    State(state): State<AppState>,
    user: AuthUser,
    Path(batch_id): Path<Uuid>,
) -> ApiResult<Json<BatchDto>> {
    let event_id = batch_event(&state, batch_id).await?;
    authorize_event(&state.pool, &user, event_id).await?;
    let _guard = state.batch_lock(batch_id).await;
    let not_cancelable = || {
        ApiError::Conflict(
            "batch_not_cancelable",
            "only unpaid batches can be canceled".to_owned(),
        )
    };
    let status = sqlx::query_scalar!("select status from ticket_batches where id = $1", batch_id)
        .fetch_one(&state.pool)
        .await?;
    if status != BatchStatus::AwaitingPayment.db() {
        return Err(not_cancelable());
    }
    let in_use = sqlx::query_scalar!(
        r#"select exists(select 1 from seller_assignments a where a.event_id = b.event_id and a.numbers && b.numbers)
               or exists(select 1 from ticket_voids v where v.event_id = b.event_id and v.numbers && b.numbers
                         and v.undone_at is null) as "in_use!"
           from ticket_batches b where b.id = $1"#,
        batch_id
    )
    .fetch_one(&state.pool)
    .await?;
    if in_use {
        return Err(ApiError::Conflict(
            "batch_has_ranges",
            "remove the seller ranges and voids of this batch first".to_owned(),
        ));
    }
    if close_open_checkouts(&state, batch_id).await? {
        return Err(not_cancelable());
    }
    sqlx::query_scalar!(
        r#"update ticket_batches set status = 'canceled' where id = $1 and status = 'awaiting_payment'
           returning id"#,
        batch_id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(not_cancelable)?;
    Ok(Json(load(&state, batch_id).await?))
}

/// `POST /api/admin/batches/{id}/mark-paid` (payment outside Stripe, ADR 0014).
pub async fn mark_paid(
    State(state): State<AppState>,
    user: AuthUser,
    Path(batch_id): Path<Uuid>,
) -> ApiResult<Json<BatchDto>> {
    if !user.is_admin(&state) {
        return Err(ApiError::Forbidden);
    }
    batch_event(&state, batch_id).await?;
    let _guard = state.batch_lock(batch_id).await;
    if close_open_checkouts(&state, batch_id).await? {
        // Paid online in the meantime: nothing left to mark.
        return Ok(Json(load(&state, batch_id).await?));
    }
    sqlx::query_scalar!(
        r#"update ticket_batches set status = 'paid', paid_at = now(), paid_via = 'admin'
           where id = $1 and status = 'awaiting_payment' returning id"#,
        batch_id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(not_payable)?;
    tracing::info!(%batch_id, admin = %user.email, "batch marked as paid");
    Ok(Json(load(&state, batch_id).await?))
}

/// `POST /api/stripe/webhook` (no login; Stripe signs every request). Answers 2xx once the
/// event is recorded, so Stripe retries anything that failed on our side.
pub async fn stripe_webhook(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> ApiResult<StatusCode> {
    let signature = headers
        .get("stripe-signature")
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();
    let now = OffsetDateTime::now_utc().unix_timestamp();
    let event = state
        .payments
        .verify_webhook(signature, &body, now)
        .map_err(|error| {
            tracing::warn!(%error, "stripe webhook refused");
            bad_request("invalid_signature", error.to_string())
        })?;
    match event.kind.as_str() {
        "checkout.session.completed"
        | "checkout.session.async_payment_succeeded"
        | "checkout.session.expired" => {
            let session: CheckoutSession = serde_json::from_value(event.data.object)
                .map_err(|error| bad_request("invalid_event", error.to_string()))?;
            apply_session(&state, &session).await?;
        }
        "checkout.session.async_payment_failed" => {
            let session: CheckoutSession = serde_json::from_value(event.data.object)
                .map_err(|error| bad_request("invalid_event", error.to_string()))?;
            sqlx::query!(
                "update payments set status = 'failed' where checkout_session_id = $1 and status in ('open', 'processing')",
                session.id
            )
            .execute(&state.pool)
            .await?;
        }
        other => tracing::debug!(event = %event.id, kind = %other, "stripe event ignored"),
    }
    Ok(StatusCode::OK)
}
