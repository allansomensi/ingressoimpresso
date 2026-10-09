//! Admin support tools (ADR 0032): an organization's members, events and history; suspending an
//! account; ending a user's sessions; refunding or repricing a batch; the audit log.
//!
//! Admins also open any event with the organizer's own screens ([`super::authorize_event`] lets
//! them in); every change they make outside their own organization is written to `audit_log`.

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use serde::Deserialize;
use time::OffsetDateTime;
use uuid::Uuid;

use super::admin::{audit, like_pattern, load_organization, require_admin};
use super::batches::{close_open_checkouts, load_batch};
use super::bounds;
use crate::api::{
    AdminBatchPriceBody, AdminEventDto, AdminMemberDto, AdminOrganizationDetailDto,
    AdminRefundBody, AdminRenameBody, AdminSuspensionBody, AuditEntryDto, BatchDto,
};
use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult, bad_request};
use crate::state::AppState;

/// Audit entries returned at once.
const AUDIT_LIMIT: i64 = 200;
const MAX_REASON: usize = 200;

struct AuditRow {
    id: Uuid,
    actor_email: String,
    action: String,
    organization_id: Option<Uuid>,
    organization_name: Option<String>,
    event_id: Option<Uuid>,
    event_name: Option<String>,
    target_id: Option<Uuid>,
    detail: serde_json::Value,
    created_at: OffsetDateTime,
}

impl From<AuditRow> for AuditEntryDto {
    fn from(row: AuditRow) -> Self {
        Self {
            id: row.id,
            actor_email: row.actor_email,
            action: row.action,
            organization_id: row.organization_id,
            organization_name: row.organization_name,
            event_id: row.event_id,
            event_name: row.event_name,
            target_id: row.target_id,
            detail: row.detail,
            created_at: row.created_at,
        }
    }
}

async fn load_audit(
    state: &AppState,
    organization_id: Option<Uuid>,
    pattern: Option<String>,
    limit: i64,
) -> ApiResult<Vec<AuditEntryDto>> {
    let rows = sqlx::query_as!(
        AuditRow,
        r#"select a.id, a.actor_email, a.action, a.organization_id, o.name as "organization_name?",
                  a.event_id, e.name as "event_name?", a.target_id, a.detail, a.created_at
           from audit_log a
           left join organizations o on o.id = a.organization_id
           left join events e on e.id = a.event_id
           where ($1::uuid is null or a.organization_id = $1)
             and ($2::text is null or a.actor_email ilike $2 or a.action ilike $2
                  or o.name ilike $2 or e.name ilike $2)
           order by a.created_at desc
           limit $3"#,
        organization_id,
        pattern,
        limit,
    )
    .fetch_all(&state.pool)
    .await?;
    Ok(rows.into_iter().map(Into::into).collect())
}

/// Search of the audit log.
#[derive(Debug, Deserialize)]
pub struct AuditQuery {
    /// Part of the admin's e-mail, the action, the organization or the event.
    #[serde(default)]
    q: Option<String>,
}

/// `GET /api/admin/audit?q=`: newest first, at most 200.
pub async fn audit_log(
    State(state): State<AppState>,
    user: AuthUser,
    Query(query): Query<AuditQuery>,
) -> ApiResult<Json<Vec<AuditEntryDto>>> {
    require_admin(&user)?;
    let pattern = like_pattern(query.q.as_deref());
    Ok(Json(load_audit(&state, None, pattern, AUDIT_LIMIT).await?))
}

/// `GET /api/admin/organizations/{id}`: everything support needs about one account.
pub async fn organization(
    State(state): State<AppState>,
    user: AuthUser,
    Path(organization_id): Path<Uuid>,
) -> ApiResult<Json<AdminOrganizationDetailDto>> {
    require_admin(&user)?;
    let summary = load_organization(&state, organization_id).await?;
    let status = sqlx::query!(
        "select suspended_at, suspended_reason from organizations where id = $1",
        organization_id
    )
    .fetch_one(&state.pool)
    .await?;
    let members = sqlx::query_as!(
        AdminMemberDto,
        r#"select u.id as user_id, u.email::text as "email!", u.name, m.role, u.created_at, u.last_login_at,
                  u.google_sub is not null as "google!",
                  (select count(*) from sessions s where s.user_id = u.id and s.expires_at > now()) as "sessions!"
           from memberships m join users u on u.id = m.user_id
           where m.organization_id = $1
           order by m.created_at"#,
        organization_id
    )
    .fetch_all(&state.pool)
    .await?;
    let events = sqlx::query_as!(
        AdminEventDto,
        r#"select e.id, e.name, e.starts_at, e.status,
                  coalesce((select sum(upper(b.numbers) - lower(b.numbers)) from ticket_batches b
                            where b.event_id = e.id and b.status = 'paid'), 0)::bigint as "paid_tickets!",
                  coalesce((select sum(b.price_cents) from ticket_batches b
                            where b.event_id = e.id and b.status = 'paid'), 0)::bigint as "revenue_cents!",
                  (select count(*) from entries en where en.event_id = e.id) as "entries!"
           from events e where e.organization_id = $1
           order by e.starts_at desc"#,
        organization_id
    )
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(AdminOrganizationDetailDto {
        organization: summary,
        suspended_at: status.suspended_at,
        suspended_reason: status.suspended_reason,
        members,
        events,
        audit: load_audit(&state, Some(organization_id), None, 50).await?,
    }))
}

/// `PUT /api/admin/organizations/{id}/suspension`: a suspended account can sign in and look,
/// but changes nothing (no batch, payment, file or link) until an admin lifts it. Its door
/// keeps working: the people at the gate are not the ones being suspended.
pub async fn set_suspension(
    State(state): State<AppState>,
    user: AuthUser,
    Path(organization_id): Path<Uuid>,
    Json(body): Json<AdminSuspensionBody>,
) -> ApiResult<Json<AdminOrganizationDetailDto>> {
    require_admin(&user)?;
    let reason = super::optional_text(body.reason);
    if reason
        .as_ref()
        .is_some_and(|reason| reason.chars().count() > MAX_REASON)
    {
        return Err(bad_request(
            "invalid_reason",
            "reason must have up to 200 characters",
        ));
    }
    sqlx::query_scalar!(
        r#"update organizations
           set suspended_at = case when $2 then coalesce(suspended_at, now()) end,
               suspended_reason = case when $2 then $3 end
           where id = $1 returning id"#,
        organization_id,
        body.suspended,
        reason,
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound)?;
    audit(
        &state,
        &user,
        if body.suspended {
            "organization_suspend"
        } else {
            "organization_unsuspend"
        },
        Some(organization_id),
        None,
        None,
        serde_json::json!({ "reason": reason }),
    )
    .await?;
    organization(State(state), user, Path(organization_id)).await
}

/// `PUT /api/admin/organizations/{id}`: renames an organization.
pub async fn rename(
    State(state): State<AppState>,
    user: AuthUser,
    Path(organization_id): Path<Uuid>,
    Json(body): Json<AdminRenameBody>,
) -> ApiResult<Json<AdminOrganizationDetailDto>> {
    require_admin(&user)?;
    let name = body.name.trim();
    if name.is_empty() || name.chars().count() > 100 {
        return Err(bad_request(
            "invalid_name",
            "name must have 1-100 characters",
        ));
    }
    let previous = sqlx::query_scalar!(
        "update organizations o set name = $2 from organizations old where o.id = $1 and old.id = o.id returning old.name",
        organization_id,
        name
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound)?;
    audit(
        &state,
        &user,
        "organization_rename",
        Some(organization_id),
        None,
        None,
        serde_json::json!({ "from": previous, "to": name }),
    )
    .await?;
    organization(State(state), user, Path(organization_id)).await
}

/// `POST /api/admin/users/{id}/sessions/revoke`: signs a user out everywhere.
pub async fn revoke_sessions(
    State(state): State<AppState>,
    user: AuthUser,
    Path(user_id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    require_admin(&user)?;
    let organization_id = sqlx::query_scalar!(
        "select organization_id from memberships where user_id = $1 order by created_at limit 1",
        user_id
    )
    .fetch_optional(&state.pool)
    .await?;
    let ended = sqlx::query!("delete from sessions where user_id = $1", user_id)
        .execute(&state.pool)
        .await?
        .rows_affected();
    audit(
        &state,
        &user,
        "user_sessions_revoke",
        organization_id,
        None,
        Some(user_id),
        serde_json::json!({ "sessions": ended }),
    )
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn batch_context(state: &AppState, batch_id: Uuid) -> ApiResult<(Uuid, Uuid)> {
    let row = sqlx::query!(
        "select b.event_id, e.organization_id from ticket_batches b join events e on e.id = b.event_id where b.id = $1",
        batch_id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound)?;
    Ok((row.event_id, row.organization_id))
}

/// `POST /api/admin/batches/{id}/refund`: a paid batch is refunded (on Stripe when asked and it
/// was paid there) and becomes `refunded`. Its numbers stay taken and are voided at once:
/// tickets already printed must never open the door, nor be reissued by a later batch.
pub async fn refund(
    State(state): State<AppState>,
    user: AuthUser,
    Path(batch_id): Path<Uuid>,
    Json(body): Json<AdminRefundBody>,
) -> ApiResult<Json<BatchDto>> {
    require_admin(&user)?;
    let (event_id, organization_id) = batch_context(&state, batch_id).await?;
    let note = super::optional_text(body.note);
    if note
        .as_ref()
        .is_some_and(|note| note.chars().count() > MAX_REASON)
    {
        return Err(bad_request(
            "invalid_note",
            "note must have up to 200 characters",
        ));
    }
    let _guard = state.batch_lock(batch_id).await;
    let batch = sqlx::query!(
        "select numbers, status, paid_via, price_cents from ticket_batches where id = $1",
        batch_id
    )
    .fetch_one(&state.pool)
    .await?;
    if batch.status != "paid" {
        return Err(ApiError::Conflict(
            "batch_not_refundable",
            "only paid batches can be refunded".to_owned(),
        ));
    }
    let mut stripe_refund = None;
    if body.refund_on_stripe && batch.paid_via.as_deref() == Some("stripe") {
        let payment = sqlx::query!(
            r#"select payment_intent_id, amount_cents from payments
               where batch_id = $1 and status = 'paid' order by paid_at desc limit 1"#,
            batch_id
        )
        .fetch_optional(&state.pool)
        .await?;
        let Some(intent) = payment
            .as_ref()
            .and_then(|payment| payment.payment_intent_id.clone())
        else {
            return Err(ApiError::Conflict(
                "payment_not_found",
                "no Stripe payment to refund; refund it by hand and mark it here".to_owned(),
            ));
        };
        let refund = state
            .payments
            .refund(&intent, batch_id)
            .await
            .map_err(|error| super::batches::provider_error(&error))?;
        stripe_refund = Some(refund);
    }
    let (first, last) = bounds(&batch.numbers)?;
    let mut tx = state.pool.begin().await?;
    sqlx::query!(
        "update ticket_batches set status = 'refunded', refunded_at = now() where id = $1",
        batch_id
    )
    .execute(&mut *tx)
    .await?;
    sqlx::query!(
        "update payments set status = 'refunded' where batch_id = $1 and status = 'paid'",
        batch_id
    )
    .execute(&mut *tx)
    .await?;
    let void_note = format!("Lote estornado ({first} a {last})");
    sqlx::query!(
        r#"insert into ticket_voids (id, event_id, numbers, reason, note, created_by)
           values ($1, $2, $3, 'revoked', $4, $5)"#,
        Uuid::new_v4(),
        event_id,
        batch.numbers,
        void_note,
        user.id,
    )
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    audit(
        &state,
        &user,
        "batch_refund",
        Some(organization_id),
        Some(event_id),
        Some(batch_id),
        serde_json::json!({
            "amountCents": batch.price_cents,
            "stripeRefund": stripe_refund,
            "note": note,
        }),
    )
    .await?;
    tracing::info!(%batch_id, admin = %user.email, "batch refunded");
    Ok(Json(load_batch(&state, batch_id).await?))
}

/// `PUT /api/admin/batches/{id}/price`: a new price for an unpaid batch (a discount, a
/// negotiated amount). An open checkout is closed first, so the old price cannot be paid.
pub async fn set_price(
    State(state): State<AppState>,
    user: AuthUser,
    Path(batch_id): Path<Uuid>,
    Json(body): Json<AdminBatchPriceBody>,
) -> ApiResult<Json<BatchDto>> {
    require_admin(&user)?;
    let (event_id, organization_id) = batch_context(&state, batch_id).await?;
    if !(0..=10_000_000).contains(&body.price_cents) {
        return Err(bad_request(
            "invalid_price",
            "price must be 0-10000000 centavos",
        ));
    }
    let _guard = state.batch_lock(batch_id).await;
    if close_open_checkouts(&state, batch_id).await? {
        return Err(ApiError::Conflict(
            "batch_not_payable",
            "the batch was paid in the meantime".to_owned(),
        ));
    }
    // A zero price frees the batch at once, like the free tickets do.
    let previous = sqlx::query_scalar!(
        r#"update ticket_batches b
           set price_cents = $2,
               status = case when $2 = 0 then 'paid' else b.status end,
               paid_via = case when $2 = 0 then 'admin' else b.paid_via end,
               paid_at = case when $2 = 0 then now() else b.paid_at end
           from ticket_batches old
           where b.id = $1 and old.id = b.id and b.status = 'awaiting_payment'
           returning old.price_cents"#,
        batch_id,
        body.price_cents,
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::Conflict(
        "batch_not_payable",
        "batch is not awaiting payment".to_owned(),
    ))?;
    audit(
        &state,
        &user,
        "batch_price",
        Some(organization_id),
        Some(event_id),
        Some(batch_id),
        serde_json::json!({ "fromCents": previous, "toCents": body.price_cents }),
    )
    .await?;
    Ok(Json(load_batch(&state, batch_id).await?))
}
