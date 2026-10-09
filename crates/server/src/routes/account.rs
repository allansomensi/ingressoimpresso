//! The signed-in user's organization: name, free tickets and totals (ADR 0024).

use axum::Json;
use axum::extract::State;

use crate::api::AccountDto;
use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult};
use crate::state::AppState;

/// `GET /api/account`.
pub async fn account(State(state): State<AppState>, user: AuthUser) -> ApiResult<Json<AccountDto>> {
    let row = sqlx::query!(
        r#"select o.name,
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
    Ok(Json(AccountDto {
        organization_name: row.name,
        free_tickets_left: (state.config.free_tickets - row.free_used).max(0),
        free_tickets_total: state.config.free_tickets,
        event_count: row.event_count,
        paid_tickets: row.paid_tickets,
    }))
}
