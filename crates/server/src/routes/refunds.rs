//! Refunds made on Stripe: the `charge.refunded` webhook (partial refunds included) and the
//! admin's check that reads every payment's refunds back from Stripe (data from before the
//! webhook existed). Each payment keeps how much went back and when; the amount only grows, so
//! a replayed, late or repeated event changes nothing.
//!
//! A payment refunded in full refunds its batch like an admin would (ADR 0032): the batch
//! becomes `refunded`, its numbers stay taken and are voided for good, so the door blocks them.

use axum::Json;
use axum::extract::State;
use sqlx::{Postgres, Transaction};
use time::{Duration, OffsetDateTime};
use uuid::Uuid;

use super::admin::{audit, require_admin};
use super::batches::provider_error;
use super::{billing, bounds};
use crate::api::{CreditReason, RefundSyncDto};
use crate::auth::AuthUser;
use crate::error::ApiResult;
use crate::payments::{PaymentError, RefundTotal};
use crate::state::AppState;

/// Payments read back from Stripe per click of the admin's check (each is one Stripe call).
const SYNC_LIMIT: i64 = 100;
/// A payment checked this recently is not read again by the next click.
const SYNC_FRESH_MINUTES: i64 = 60;
/// `audit_log.actor_email` of what Stripe did on its own (a refund in the dashboard).
const STRIPE_ACTOR: &str = "Stripe";

/// Marks a paid batch `refunded` and voids its numbers for good (ADR 0032): printed tickets
/// never open the door, nor come back in a later batch. Credit spent on it goes back to the
/// organization. The void's note is `"<label> (<first> a <last>)"`, in the event's
/// cancellations. Returns the batch's event, or `None` if the batch was not `paid`.
///
/// # Errors
///
/// Database errors.
pub(crate) async fn refund_batch(
    tx: &mut Transaction<'_, Postgres>,
    batch_id: Uuid,
    label: &str,
    void_by: Uuid,
    actor: Option<Uuid>,
    at: OffsetDateTime,
) -> ApiResult<Option<Uuid>> {
    let Some(batch) = sqlx::query!(
        r#"update ticket_batches set status = 'refunded', refunded_at = $2
           where id = $1 and status = 'paid' returning event_id, numbers"#,
        batch_id,
        at,
    )
    .fetch_optional(&mut **tx)
    .await?
    else {
        return Ok(None);
    };
    let (first, last) = bounds(&batch.numbers)?;
    sqlx::query!(
        r#"insert into ticket_voids (id, event_id, numbers, reason, note, created_by)
           values ($1, $2, $3, 'revoked', $4, $5)"#,
        Uuid::new_v4(),
        batch.event_id,
        batch.numbers,
        format!("{label} ({first} a {last})"),
        void_by,
    )
    .execute(&mut **tx)
    .await?;
    billing::give_back(tx, batch_id, CreditReason::BatchRefund, actor).await?;
    // A referral rewarded for this batch is taken back (ADR 0076).
    super::referrals::revoke_for_batch(tx, batch_id).await?;
    Ok(Some(batch.event_id))
}

/// What recording a refund changed.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub(crate) struct RefundOutcome {
    /// The payment's refunded amount grew.
    pub updated: bool,
    /// The payment was refunded in full and its batch with it.
    pub batch_refunded: bool,
}

/// Records that `refunded_cents` of a payment intent went back by `at` (Stripe's running total,
/// every partial refund added up). Idempotent: only a larger total changes the payment. Once
/// the whole payment is back, its batch is refunded too, unless another paid session still
/// covers it or it was not paid on Stripe (a payment that arrived for a canceled batch).
///
/// # Errors
///
/// Database errors.
pub(crate) async fn record_refund(
    state: &AppState,
    payment_intent: &str,
    refunded_cents: i64,
    at: OffsetDateTime,
) -> ApiResult<RefundOutcome> {
    let Some(payment) = sqlx::query!(
        r#"select id, batch_id, created_by from payments where payment_intent_id = $1
           order by paid_at desc nulls last limit 1"#,
        payment_intent
    )
    .fetch_optional(&state.pool)
    .await?
    else {
        tracing::warn!(%payment_intent, "refund of a payment unknown here; ignored");
        return Ok(RefundOutcome::default());
    };
    let cents = i32::try_from(refunded_cents.max(0)).unwrap_or(i32::MAX);
    // The admin's refund holds this lock while it calls Stripe: its own webhook waits for it.
    let _guard = state.batch_lock(payment.batch_id).await;
    let mut tx = state.pool.begin().await?;
    let Some(updated) = sqlx::query!(
        r#"update payments
              set refunded_cents = least($2, amount_cents), refunded_at = $3,
                  status = case when $2 >= amount_cents then 'refunded' else status end
            where id = $1 and status in ('paid', 'refunded')
              and refunded_cents < least($2, amount_cents)
        returning refunded_cents, amount_cents"#,
        payment.id,
        cents,
        at,
    )
    .fetch_optional(&mut *tx)
    .await?
    else {
        // A replay, an older event, or nothing new.
        return Ok(RefundOutcome::default());
    };
    let mut outcome = RefundOutcome {
        updated: true,
        batch_refunded: false,
    };
    if updated.refunded_cents >= updated.amount_cents {
        let covered_elsewhere = sqlx::query_scalar!(
            r#"select coalesce(b.paid_via, '') <> 'stripe'
                      or exists(select 1 from payments p where p.batch_id = b.id and p.status = 'paid')
                      as "covered!"
               from ticket_batches b where b.id = $1"#,
            payment.batch_id
        )
        .fetch_one(&mut *tx)
        .await?;
        let event_id = if covered_elsewhere {
            None
        } else {
            refund_batch(
                &mut tx,
                payment.batch_id,
                "Lote reembolsado no Stripe",
                payment.created_by,
                None,
                at,
            )
            .await?
        };
        if let Some(event_id) = event_id {
            sqlx::query!(
                r#"insert into audit_log (id, actor_email, action, organization_id, event_id, target_id, detail)
                   select $1, $2, 'batch_refund_stripe', e.organization_id, e.id, $4, $5
                   from events e where e.id = $3"#,
                Uuid::new_v4(),
                STRIPE_ACTOR,
                event_id,
                payment.batch_id,
                serde_json::json!({
                    "amountCents": updated.amount_cents,
                    "refundedCents": updated.refunded_cents,
                    "paymentIntent": payment_intent,
                }),
            )
            .execute(&mut *tx)
            .await?;
            outcome.batch_refunded = true;
        }
    }
    tx.commit().await?;
    if outcome.batch_refunded {
        tracing::info!(batch_id = %payment.batch_id, %payment_intent, "batch refunded on Stripe");
    } else {
        tracing::info!(%payment_intent, refunded_cents = updated.refunded_cents, "payment partly refunded");
    }
    Ok(outcome)
}

/// `POST /api/admin/payments/sync-refunds`: reads the refunds of every payment not fully refunded
/// back from Stripe and records them, a page at a time (`remaining` says if another click is
/// needed). Fixes refunds made before the webhook listened to them, or that it missed.
pub async fn sync(State(state): State<AppState>, user: AuthUser) -> ApiResult<Json<RefundSyncDto>> {
    require_admin(&user)?;
    if !state.payments.enabled() {
        return Err(provider_error(&PaymentError::Disabled));
    }
    let checked_before = OffsetDateTime::now_utc() - Duration::minutes(SYNC_FRESH_MINUTES);
    let payments = sqlx::query!(
        r#"select id, payment_intent_id as "payment_intent_id!" from payments
           where status in ('paid', 'refunded') and payment_intent_id is not null
             and refunded_cents < amount_cents
             and (refunds_checked_at is null or refunds_checked_at < $1)
           order by refunds_checked_at nulls first, paid_at
           limit $2"#,
        checked_before,
        SYNC_LIMIT,
    )
    .fetch_all(&state.pool)
    .await?;
    let mut result = RefundSyncDto {
        checked: 0,
        updated: 0,
        refunded_batches: 0,
        remaining: 0,
    };
    for payment in payments {
        let refunds = state
            .payments
            .list_refunds(&payment.payment_intent_id)
            .await
            .map_err(|error| provider_error(&error))?;
        let total = RefundTotal::of(&refunds);
        if total.cents > 0 {
            let at = total
                .last_at
                .and_then(|unix| OffsetDateTime::from_unix_timestamp(unix).ok())
                .unwrap_or_else(OffsetDateTime::now_utc);
            let outcome =
                record_refund(&state, &payment.payment_intent_id, total.cents, at).await?;
            result.updated += i64::from(outcome.updated);
            result.refunded_batches += i64::from(outcome.batch_refunded);
        }
        sqlx::query!(
            "update payments set refunds_checked_at = now() where id = $1",
            payment.id
        )
        .execute(&state.pool)
        .await?;
        result.checked += 1;
    }
    result.remaining = sqlx::query_scalar!(
        r#"select count(*) as "count!" from payments
           where status in ('paid', 'refunded') and payment_intent_id is not null
             and refunded_cents < amount_cents
             and (refunds_checked_at is null or refunds_checked_at < $1)"#,
        checked_before
    )
    .fetch_one(&state.pool)
    .await?;
    audit(
        &state,
        &user,
        "batch_refunds_sync",
        None,
        None,
        None,
        serde_json::json!({
            "checked": result.checked,
            "updated": result.updated,
            "refundedBatches": result.refunded_batches,
        }),
    )
    .await?;
    Ok(Json(result))
}
