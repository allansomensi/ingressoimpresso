//! The admin panel (ADR 0026): totals of the whole service, organizations with their usage and
//! courtesy free tickets, and batches of every organization. Admins are the `ADMIN_EMAILS`.

use axum::Json;
use axum::extract::{Path, Query, State};
use serde::Deserialize;
use sqlx::postgres::types::PgRange;
use time::OffsetDateTime;
use uuid::Uuid;

use super::batches::BatchRow;
use crate::api::{
    AdminBatchDto, AdminBonusBody, AdminDayDto, AdminOrganizationDto, AdminOverviewDto,
};
use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult, bad_request};
use crate::state::AppState;

/// Rows returned by the admin lists.
const LIST_LIMIT: i64 = 200;
const MAX_BONUS: i32 = 100_000;

fn require_admin(state: &AppState, user: &AuthUser) -> ApiResult<()> {
    if user.is_admin(state) {
        Ok(())
    } else {
        Err(ApiError::Forbidden)
    }
}

/// `GET /api/admin/overview`.
pub async fn overview(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<AdminOverviewDto>> {
    require_admin(&state, &user)?;
    let totals = sqlx::query!(
        r#"select
             (select count(*) from organizations) as "organizations!",
             (select count(*) from organizations where created_at > now() - interval '30 days') as "new_organizations!",
             (select count(*) from users) as "users!",
             (select count(*) from events) as "events!",
             (select count(*) from events where ends_at > now()) as "upcoming_events!",
             (select coalesce(sum(upper(numbers) - lower(numbers)), 0) from ticket_batches
              where status = 'paid')::bigint as "paid_tickets!",
             (select coalesce(sum(free_tickets), 0) from ticket_batches
              where status = 'paid')::bigint as "free_tickets!",
             (select coalesce(sum(price_cents), 0) from ticket_batches
              where status = 'paid')::bigint as "revenue_cents!",
             (select coalesce(sum(price_cents), 0) from ticket_batches
              where status = 'paid' and paid_at > now() - interval '30 days')::bigint as "revenue_30d_cents!",
             (select count(*) from ticket_batches where status = 'awaiting_payment') as "awaiting_batches!",
             (select count(*) from payments where status = 'processing') as "processing_payments!""#
    )
    .fetch_one(&state.pool)
    .await?;
    // Calendar days in Brasília, where the customers are.
    let days = sqlx::query!(
        r#"with days as (
             select generate_series(
               (now() at time zone 'America/Sao_Paulo')::date - 29,
               (now() at time zone 'America/Sao_Paulo')::date,
               interval '1 day')::date as day
           )
           select to_char(d.day, 'YYYY-MM-DD') as "date!",
                  coalesce(sum(upper(b.numbers) - lower(b.numbers)), 0)::bigint as "tickets!",
                  coalesce(sum(b.price_cents), 0)::bigint as "revenue_cents!",
                  (select count(*) from organizations o
                   where (o.created_at at time zone 'America/Sao_Paulo')::date = d.day) as "signups!"
           from days d
           left join ticket_batches b
             on b.status = 'paid' and (b.paid_at at time zone 'America/Sao_Paulo')::date = d.day
           group by d.day
           order by d.day"#
    )
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(AdminOverviewDto {
        organizations: totals.organizations,
        new_organizations: totals.new_organizations,
        users: totals.users,
        events: totals.events,
        upcoming_events: totals.upcoming_events,
        paid_tickets: totals.paid_tickets,
        free_tickets: totals.free_tickets,
        revenue_cents: totals.revenue_cents,
        revenue_30d_cents: totals.revenue_30d_cents,
        awaiting_batches: totals.awaiting_batches,
        processing_payments: totals.processing_payments,
        days: days
            .into_iter()
            .map(|day| AdminDayDto {
                date: day.date,
                tickets: day.tickets,
                revenue_cents: day.revenue_cents,
                signups: day.signups,
            })
            .collect(),
    }))
}

/// Search of the admin lists.
#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    /// Part of a name or e-mail.
    #[serde(default)]
    q: Option<String>,
}

struct OrganizationRow {
    id: Uuid,
    name: String,
    owner_email: Option<String>,
    created_at: OffsetDateTime,
    event_count: i64,
    paid_tickets: i64,
    revenue_cents: i64,
    free_used: i32,
    bonus_free_tickets: i32,
    last_batch_at: Option<OffsetDateTime>,
}

impl OrganizationRow {
    fn into_dto(self, state: &AppState) -> AdminOrganizationDto {
        AdminOrganizationDto {
            id: self.id,
            name: self.name,
            owner_email: self.owner_email,
            created_at: self.created_at,
            event_count: self.event_count,
            paid_tickets: self.paid_tickets,
            revenue_cents: self.revenue_cents,
            free_used: self.free_used,
            free_total: state.config.free_tickets + self.bonus_free_tickets,
            bonus_free_tickets: self.bonus_free_tickets,
            last_batch_at: self.last_batch_at,
        }
    }
}

/// `%text%` for `ilike`, with the wildcards of the search itself escaped.
fn like_pattern(query: Option<&str>) -> Option<String> {
    let text = query.map(str::trim).filter(|text| !text.is_empty())?;
    let escaped = text
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_");
    Some(format!("%{escaped}%"))
}

/// Organizations with their usage: one (`id`) or those matching `pattern`, newest first.
async fn load_organizations(
    state: &AppState,
    id: Option<Uuid>,
    pattern: Option<String>,
) -> ApiResult<Vec<OrganizationRow>> {
    Ok(sqlx::query_as!(
        OrganizationRow,
        r#"select o.id, o.name, o.created_at, o.bonus_free_tickets,
                  (select u.email::text from memberships m join users u on u.id = m.user_id
                   where m.organization_id = o.id and m.role = 'owner'
                   order by m.created_at limit 1) as owner_email,
                  (select count(*) from events e where e.organization_id = o.id) as "event_count!",
                  coalesce(stats.paid_tickets, 0) as "paid_tickets!",
                  coalesce(stats.revenue_cents, 0) as "revenue_cents!",
                  coalesce(stats.free_used, 0) as "free_used!",
                  stats.last_batch_at
           from organizations o
           left join lateral (
             select sum(upper(b.numbers) - lower(b.numbers)) filter (where b.status = 'paid')::bigint as paid_tickets,
                    sum(b.price_cents) filter (where b.status = 'paid')::bigint as revenue_cents,
                    sum(b.free_tickets) filter (where b.status <> 'canceled')::int as free_used,
                    max(b.created_at) as last_batch_at
             from ticket_batches b join events e on e.id = b.event_id
             where e.organization_id = o.id
           ) stats on true
           where ($1::uuid is null or o.id = $1)
             and ($2::text is null
                  or o.name ilike $2
                  or exists (select 1 from memberships m join users u on u.id = m.user_id
                             where m.organization_id = o.id and u.email::text ilike $2))
           order by o.created_at desc
           limit $3"#,
        id,
        pattern,
        LIST_LIMIT,
    )
    .fetch_all(&state.pool)
    .await?)
}

/// `GET /api/admin/organizations?q=`: newest first, at most 200.
pub async fn organizations(
    State(state): State<AppState>,
    user: AuthUser,
    Query(query): Query<SearchQuery>,
) -> ApiResult<Json<Vec<AdminOrganizationDto>>> {
    require_admin(&state, &user)?;
    let pattern = like_pattern(query.q.as_deref());
    let rows = load_organizations(&state, None, pattern).await?;
    Ok(Json(
        rows.into_iter().map(|row| row.into_dto(&state)).collect(),
    ))
}

/// `PUT /api/admin/organizations/{id}/bonus`: replaces the organization's extra free tickets.
pub async fn set_bonus(
    State(state): State<AppState>,
    user: AuthUser,
    Path(organization_id): Path<Uuid>,
    Json(body): Json<AdminBonusBody>,
) -> ApiResult<Json<AdminOrganizationDto>> {
    require_admin(&state, &user)?;
    if !(0..=MAX_BONUS).contains(&body.bonus_free_tickets) {
        return Err(bad_request("invalid_bonus", "bonus must be 0-100000"));
    }
    sqlx::query_scalar!(
        "update organizations set bonus_free_tickets = $2 where id = $1 returning id",
        organization_id,
        body.bonus_free_tickets,
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound)?;
    tracing::info!(%organization_id, bonus = body.bonus_free_tickets, admin = %user.email, "free ticket bonus set");
    let row = load_organizations(&state, Some(organization_id), None)
        .await?
        .into_iter()
        .next()
        .ok_or(ApiError::NotFound)?;
    Ok(Json(row.into_dto(&state)))
}

/// Filter of `GET /api/admin/batches`.
#[derive(Debug, Deserialize)]
pub struct BatchQuery {
    /// `awaiting_payment`, `paid`, `canceled`; every status when absent.
    #[serde(default)]
    status: Option<String>,
    /// Part of the event or organization name, or of the owner's e-mail.
    #[serde(default)]
    q: Option<String>,
}

struct AdminBatchRow {
    id: Uuid,
    numbers: PgRange<i32>,
    status: String,
    created_at: OffsetDateTime,
    paid_at: Option<OffsetDateTime>,
    price_cents: i32,
    free_tickets: i32,
    paid_via: Option<String>,
    pending_payment: Option<String>,
    event_id: Uuid,
    event_name: String,
    organization_name: String,
    owner_email: Option<String>,
}

/// `GET /api/admin/batches?status=&q=`: newest first, at most 200.
pub async fn batches(
    State(state): State<AppState>,
    user: AuthUser,
    Query(query): Query<BatchQuery>,
) -> ApiResult<Json<Vec<AdminBatchDto>>> {
    require_admin(&state, &user)?;
    let status = query.status.filter(|status| !status.is_empty());
    if status
        .as_deref()
        .is_some_and(|status| !["awaiting_payment", "paid", "canceled"].contains(&status))
    {
        return Err(bad_request("invalid_input", "unknown batch status"));
    }
    let pattern = like_pattern(query.q.as_deref());
    let rows = sqlx::query_as!(
        AdminBatchRow,
        r#"select b.id, b.numbers, b.status, b.created_at, b.paid_at, b.price_cents, b.free_tickets, b.paid_via,
                  (select case when bool_or(p.status = 'processing') then 'processing'
                               when bool_or(p.status = 'open' and p.expires_at > now()) then 'open' end
                   from payments p where p.batch_id = b.id) as pending_payment,
                  e.id as event_id, e.name as event_name, o.name as organization_name,
                  (select u.email::text from memberships m join users u on u.id = m.user_id
                   where m.organization_id = o.id and m.role = 'owner'
                   order by m.created_at limit 1) as owner_email
           from ticket_batches b
           join events e on e.id = b.event_id
           join organizations o on o.id = e.organization_id
           where ($1::text is null or b.status = $1)
             and ($2::text is null or e.name ilike $2 or o.name ilike $2
                  or exists (select 1 from memberships m join users u on u.id = m.user_id
                             where m.organization_id = o.id and u.email::text ilike $2))
           order by b.created_at desc
           limit $3"#,
        status,
        pattern,
        LIST_LIMIT,
    )
    .fetch_all(&state.pool)
    .await?;
    rows.into_iter()
        .map(|row| {
            Ok(AdminBatchDto {
                batch: BatchRow {
                    id: row.id,
                    numbers: row.numbers,
                    status: row.status,
                    created_at: row.created_at,
                    paid_at: row.paid_at,
                    price_cents: row.price_cents,
                    free_tickets: row.free_tickets,
                    paid_via: row.paid_via,
                    pending_payment: row.pending_payment,
                }
                .into_dto()?,
                event_id: row.event_id,
                event_name: row.event_name,
                organization_name: row.organization_name,
                owner_email: row.owner_email,
            })
        })
        .collect::<ApiResult<Vec<_>>>()
        .map(Json)
}

#[cfg(test)]
mod tests {
    use super::like_pattern;

    #[test]
    fn search_patterns_escape_wildcards() {
        assert_eq!(like_pattern(None), None);
        assert_eq!(like_pattern(Some("  ")), None);
        assert_eq!(like_pattern(Some(" Banda ")).as_deref(), Some("%Banda%"));
        assert_eq!(
            like_pattern(Some("50%_off\\")).as_deref(),
            Some("%50\\%\\_off\\\\%")
        );
    }
}
