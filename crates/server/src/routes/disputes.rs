//! Disputed card payments (chargebacks, ADR 0104). Stripe tells us of every step of a dispute;
//! each one is kept with Stripe's own status and the admins are alerted when one opens and when it
//! closes. The admins decide what happens to the batch's numbers: blocked at the door while the
//! dispute lasts (a void that can be undone), and, once a dispute is lost, refunded for good like
//! any refund (ADR 0032).

use axum::Json;
use axum::extract::{Path, State};
use time::OffsetDateTime;
use uuid::Uuid;

use super::admin::{audit, require_admin};
use super::bounds;
use crate::alerts::{self, NewAlert};
use crate::api::{AdminDisputeDto, AlertKind, AlertSeverity, BatchStatus};
use crate::auth::AuthUser;
use crate::emails;
use crate::error::{ApiError, ApiResult};
use crate::payments::Dispute;
use crate::state::AppState;

/// Stripe's statuses of a dispute that is over.
const CLOSED: [&str; 5] = [
    "won",
    "lost",
    "warning_closed",
    "charge_refunded",
    "prevented",
];

fn closed(status: &str) -> bool {
    CLOSED.contains(&status)
}

fn timestamp(seconds: i64) -> Option<OffsetDateTime> {
    (seconds > 0)
        .then(|| OffsetDateTime::from_unix_timestamp(seconds).ok())
        .flatten()
}

/// Records a step of a dispute (idempotent: the latest status wins) and tells the admins when it
/// opens and when it closes.
///
/// # Errors
///
/// Database errors.
pub(crate) async fn record(state: &AppState, dispute: &Dispute) -> ApiResult<()> {
    let payment = match &dispute.payment_intent {
        Some(intent) => sqlx::query!(
            r#"select id, batch_id from payments where payment_intent_id = $1
               order by paid_at desc nulls last limit 1"#,
            intent
        )
        .fetch_optional(&state.pool)
        .await?
        .map(|row| (row.id, row.batch_id)),
        None => None,
    };
    let is_closed = closed(&dispute.status);
    let row = sqlx::query!(
        r#"insert into payment_disputes (id, payment_id, batch_id, charge_id, payment_intent_id,
                                         amount_cents, reason, status, evidence_due_by, opened_at,
                                         closed_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, coalesce($10, now()),
                   case when $11 then now() end)
           on conflict (id) do update
           set status = excluded.status, amount_cents = excluded.amount_cents,
               evidence_due_by = coalesce(excluded.evidence_due_by, payment_disputes.evidence_due_by),
               updated_at = now(),
               closed_at = case when $11 then coalesce(payment_disputes.closed_at, now()) end,
               payment_id = coalesce(payment_disputes.payment_id, excluded.payment_id),
               batch_id = coalesce(payment_disputes.batch_id, excluded.batch_id)
           returning (xmax = 0) as "inserted!",
                     (select closed_at from payment_disputes where id = $1) as "was_closed?""#,
        dispute.id,
        payment.map(|(id, _)| id),
        payment.map(|(_, batch)| batch),
        dispute.charge,
        dispute.payment_intent,
        dispute.amount.max(0),
        dispute.reason.chars().take(60).collect::<String>(),
        dispute.status.chars().take(40).collect::<String>(),
        dispute
            .evidence_details
            .as_ref()
            .and_then(|details| details.due_by)
            .and_then(timestamp),
        timestamp(dispute.created),
        is_closed,
    )
    .fetch_one(&state.pool)
    .await?;
    let context = context(state, payment.map(|(_, batch)| batch)).await?;
    if row.inserted {
        alerts::raise(
            state.clone(),
            NewAlert {
                kind: AlertKind::Dispute,
                key: format!("dispute:{}", dispute.id),
                severity: AlertSeverity::Critical,
                title: format!(
                    "Contestação de pagamento de {}",
                    emails::money_long(dispute.amount)
                ),
                detail: Some(format!(
                    "{context}Motivo na Stripe: {}. Responda no painel da Stripe até o prazo e decida se os números ficam bloqueados na portaria.",
                    dispute.reason
                )),
                section: "contestacoes",
            },
        )
        .await;
    }
    // Closed now (the earlier row was open): the outcome, once.
    if is_closed && row.was_closed.is_none() {
        let outcome = match dispute.status.as_str() {
            "won" => "ganha: o dinheiro volta; desbloqueie os números se estiverem bloqueados",
            "lost" => "perdida: o dinheiro não volta; estorne o lote no painel",
            _ => "encerrada",
        };
        alerts::raise(
            state.clone(),
            NewAlert {
                kind: AlertKind::Dispute,
                key: format!("dispute_closed:{}", dispute.id),
                severity: AlertSeverity::Warning,
                title: format!(
                    "Contestação {}",
                    outcome.split(':').next().unwrap_or(outcome)
                ),
                detail: Some(format!("{context}Contestação {outcome}.")),
                section: "contestacoes",
            },
        )
        .await;
    }
    Ok(())
}

/// "Show X (Banda Y), números 1 a 100. " for an alert.
async fn context(state: &AppState, batch_id: Option<Uuid>) -> ApiResult<String> {
    let Some(batch_id) = batch_id else {
        return Ok("Pagamento não encontrado aqui. ".to_owned());
    };
    let row = sqlx::query!(
        r#"select e.name as event, o.name as organization, b.numbers
           from ticket_batches b join events e on e.id = b.event_id
           join organizations o on o.id = e.organization_id where b.id = $1"#,
        batch_id
    )
    .fetch_optional(&state.pool)
    .await?;
    Ok(match row {
        Some(row) => {
            let (first, last) = bounds(&row.numbers)?;
            format!(
                "{} ({}), números {first} a {last}. ",
                row.event, row.organization
            )
        }
        None => String::new(),
    })
}

async fn load(state: &AppState, id: Option<&str>) -> ApiResult<Vec<AdminDisputeDto>> {
    let rows = sqlx::query!(
        r#"select d.id, d.status, d.reason, d.amount_cents, d.opened_at, d.evidence_due_by,
                  d.closed_at, d.batch_id, d.settled_at,
                  b.numbers as "numbers?", b.status as "batch_status?",
                  e.id as "event_id?", e.name as "event_name?",
                  o.id as "organization_id?", o.name as "organization_name?",
                  (v.id is not null and v.undone_at is null) as "blocked!"
           from payment_disputes d
           left join ticket_batches b on b.id = d.batch_id
           left join events e on e.id = b.event_id
           left join organizations o on o.id = e.organization_id
           left join ticket_voids v on v.id = d.block_void_id
           where $1::text is null or d.id = $1
           order by (d.closed_at is null) desc, d.opened_at desc
           limit 200"#,
        id,
    )
    .fetch_all(&state.pool)
    .await?;
    rows.into_iter()
        .map(|row| {
            let range = row.numbers.as_ref().map(bounds).transpose()?;
            Ok(AdminDisputeDto {
                open: row.closed_at.is_none(),
                id: row.id,
                status: row.status,
                reason: row.reason,
                amount_cents: row.amount_cents,
                opened_at: row.opened_at,
                evidence_due_by: row.evidence_due_by,
                closed_at: row.closed_at,
                batch_id: row.batch_id,
                first: range.map(|(first, _)| first),
                last: range.map(|(_, last)| last),
                batch_status: row.batch_status.as_deref().and_then(BatchStatus::from_db),
                event_id: row.event_id,
                event_name: row.event_name,
                organization_id: row.organization_id,
                organization_name: row.organization_name,
                blocked: row.blocked,
                settled: row.settled_at.is_some(),
            })
        })
        .collect()
}

async fn one(state: &AppState, id: &str) -> ApiResult<AdminDisputeDto> {
    load(state, Some(id))
        .await?
        .into_iter()
        .next()
        .ok_or(ApiError::NotFound)
}

/// `GET /api/admin/disputes`: open disputes first.
pub async fn list(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<Vec<AdminDisputeDto>>> {
    require_admin(&user)?;
    Ok(Json(load(&state, None).await?))
}

/// `POST /api/admin/disputes/{id}/block`: the batch's numbers stop opening the door while the
/// dispute lasts (a void that [`unblock`] undoes).
pub async fn block(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
) -> ApiResult<Json<AdminDisputeDto>> {
    require_admin(&user)?;
    let dispute = one(&state, &id).await?;
    let Some(batch_id) = dispute.batch_id else {
        return Err(ApiError::Conflict(
            "dispute_without_batch",
            "the disputed payment is not linked to a batch".to_owned(),
        ));
    };
    if dispute.blocked || dispute.settled {
        return Err(ApiError::Conflict(
            "dispute_already_blocked",
            "the numbers are already blocked".to_owned(),
        ));
    }
    let _guard = state.batch_lock(batch_id).await;
    let mut tx = state.pool.begin().await?;
    let batch = sqlx::query!(
        "select event_id, numbers, status from ticket_batches where id = $1 for update",
        batch_id
    )
    .fetch_one(&mut *tx)
    .await?;
    if batch.status != "paid" {
        return Err(ApiError::Conflict(
            "batch_not_paid",
            "only a paid batch can be blocked".to_owned(),
        ));
    }
    let (first, last) = bounds(&batch.numbers)?;
    let void_id = Uuid::new_v4();
    sqlx::query!(
        r#"insert into ticket_voids (id, event_id, numbers, reason, note, created_by)
           values ($1, $2, $3, 'revoked', $4, $5)"#,
        void_id,
        batch.event_id,
        batch.numbers,
        format!("Contestação de pagamento ({first} a {last})"),
        user.id,
    )
    .execute(&mut *tx)
    .await?;
    sqlx::query!(
        "update payment_disputes set block_void_id = $2 where id = $1",
        id,
        void_id
    )
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    audit(
        &state,
        &user,
        "dispute_block",
        dispute.organization_id,
        dispute.event_id,
        Some(batch_id),
        serde_json::json!({ "dispute": id }),
    )
    .await?;
    Ok(Json(one(&state, &id).await?))
}

/// `POST /api/admin/disputes/{id}/unblock`: the numbers open the door again (a won dispute, or
/// a block by mistake).
pub async fn unblock(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
) -> ApiResult<Json<AdminDisputeDto>> {
    require_admin(&user)?;
    let dispute = one(&state, &id).await?;
    if !dispute.blocked {
        return Err(ApiError::Conflict(
            "dispute_not_blocked",
            "the numbers are not blocked".to_owned(),
        ));
    }
    let mut tx = state.pool.begin().await?;
    sqlx::query!(
        r#"update ticket_voids set undone_at = now(), undone_by = $2
           where id = (select block_void_id from payment_disputes where id = $1) and undone_at is null"#,
        id,
        user.id,
    )
    .execute(&mut *tx)
    .await?;
    sqlx::query!(
        "update payment_disputes set block_void_id = null where id = $1",
        id
    )
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    audit(
        &state,
        &user,
        "dispute_unblock",
        dispute.organization_id,
        dispute.event_id,
        dispute.batch_id,
        serde_json::json!({ "dispute": id }),
    )
    .await?;
    Ok(Json(one(&state, &id).await?))
}

/// `POST /api/admin/disputes/{id}/settle`: a lost dispute is a refund that already happened:
/// the batch is refunded for good (its numbers never open the door again, ADR 0032) and the
/// payment counts as given back in the revenue.
pub async fn settle(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
) -> ApiResult<Json<AdminDisputeDto>> {
    require_admin(&user)?;
    let dispute = one(&state, &id).await?;
    if dispute.status != "lost" {
        return Err(ApiError::Conflict(
            "dispute_not_lost",
            "only a lost dispute is settled here".to_owned(),
        ));
    }
    if dispute.settled {
        return Err(ApiError::Conflict(
            "dispute_settled",
            "this dispute was already settled".to_owned(),
        ));
    }
    let Some(batch_id) = dispute.batch_id else {
        return Err(ApiError::Conflict(
            "dispute_without_batch",
            "the disputed payment is not linked to a batch".to_owned(),
        ));
    };
    let _guard = state.batch_lock(batch_id).await;
    let now = OffsetDateTime::now_utc();
    let mut tx = state.pool.begin().await?;
    // The block gives way to the refund's own permanent void.
    sqlx::query!(
        r#"update ticket_voids set undone_at = now(), undone_by = $2
           where id = (select block_void_id from payment_disputes where id = $1) and undone_at is null"#,
        id,
        user.id,
    )
    .execute(&mut *tx)
    .await?;
    let refunded = super::refunds::refund_batch(
        &mut tx,
        batch_id,
        "Contestação perdida",
        user.id,
        Some(user.id),
        now,
    )
    .await?;
    if refunded.is_none() {
        return Err(ApiError::Conflict(
            "batch_not_paid",
            "only a paid batch can be refunded".to_owned(),
        ));
    }
    sqlx::query!(
        r#"update payments set refunded_cents = amount_cents, refunded_at = $2, status = 'refunded'
           where id = (select payment_id from payment_disputes where id = $1)
             and refunded_cents < amount_cents"#,
        id,
        now,
    )
    .execute(&mut *tx)
    .await?;
    sqlx::query!(
        "update payment_disputes set block_void_id = null, settled_at = $2, settled_by = $3 where id = $1",
        id,
        now,
        user.id,
    )
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    audit(
        &state,
        &user,
        "dispute_settle",
        dispute.organization_id,
        dispute.event_id,
        Some(batch_id),
        serde_json::json!({ "dispute": id, "amountCents": dispute.amount_cents }),
    )
    .await?;
    Ok(Json(one(&state, &id).await?))
}
