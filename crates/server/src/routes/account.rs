//! The signed-in user's organization: name, free tickets and totals (ADR 0024). Exporting and
//! deleting the account are in `privacy.rs`.

use axum::Json;
use axum::extract::State;

use crate::api::{AccountBody, AccountDto};
use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult, bad_request};
use crate::state::AppState;

/// `GET /api/account`.
pub async fn account(State(state): State<AppState>, user: AuthUser) -> ApiResult<Json<AccountDto>> {
    load(&state, &user).await.map(Json)
}

/// `PUT /api/account`: renames the organization (owners only).
pub async fn update(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<AccountBody>,
) -> ApiResult<Json<AccountDto>> {
    let name = body.organization_name.trim();
    if name.is_empty() || name.chars().count() > 100 {
        return Err(bad_request(
            "invalid_name",
            "name must have 1-100 characters",
        ));
    }
    super::one_line(name, "invalid_name")?;
    sqlx::query_scalar!(
        r#"update organizations set name = $2
           where id = (select organization_id from memberships
                       where user_id = $1 and role = 'owner' order by created_at limit 1)
           returning id"#,
        user.id,
        name,
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::Forbidden)?;
    load(&state, &user).await.map(Json)
}

async fn load(state: &AppState, user: &AuthUser) -> ApiResult<AccountDto> {
    let row = sqlx::query!(
        r#"select o.id as organization_id, o.name, o.bonus_free_tickets, o.suspended_reason, o.suspended_at,
                  (select terms_accepted_at from users where id = $1) as terms_accepted_at,
                  (select coalesce(sum(b.free_tickets), 0) from ticket_batches b
                   join events e on e.id = b.event_id
                   where e.organization_id = o.id and b.status <> 'canceled')::int as "free_used!",
                  (select count(*) from events e where e.organization_id = o.id) as "event_count!",
                  (select coalesce(sum(upper(b.numbers) - lower(b.numbers)), 0) from ticket_batches b
                   join events e on e.id = b.event_id
                   where e.organization_id = o.id and b.status = 'paid')::bigint as "paid_tickets!"
           from memberships m join organizations o on o.id = m.organization_id
           where m.user_id = $1
           order by m.created_at limit 1"#,
        user.id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound)?;
    let free_total =
        crate::pricing::current(&state.pool).await?.free_tickets + row.bonus_free_tickets;
    let credit_cents = super::billing::credit_balance(&state.pool, row.organization_id).await?;
    Ok(AccountDto {
        organization_name: row.name,
        free_tickets_left: (free_total - row.free_used).max(0),
        free_tickets_total: free_total,
        credit_cents,
        event_count: row.event_count,
        paid_tickets: row.paid_tickets,
        suspended_reason: row
            .suspended_at
            .map(|_| row.suspended_reason.unwrap_or_default()),
        terms_accepted_at: row.terms_accepted_at,
    })
}
