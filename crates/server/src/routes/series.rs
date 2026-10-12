//! An event with several dates (ADR 0077). Each date is a whole event: its own numbers, batches,
//! signing key and QR tag (a ticket of one date never opens the door of another), door links,
//! settlement, postponement or cancellation. The series only groups the dates and carries the
//! name they share; a series always has at least two dates (deleting or detaching the second to
//! last one dissolves it).
//!
//! Adding a date copies the setup of the date it is added from, like duplicating (ADR 0027).
//! Only the organization's own people add, detach and rename (as they duplicate and delete);
//! the team sees the series page with the dates it is on.

use std::collections::HashMap;

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use sqlx::{PgPool, Postgres, Transaction};
use time::OffsetDateTime;
use uuid::Uuid;

use super::events::{CopyOf, copy_event, validate_dates};
use super::{EventRow, admin, event_access, one_line, report};
use crate::api::{
    DoorSessionDto, EventDto, EventSeriesRefDto, EventTeamAccessDto, NewDateBody, SeriesBody,
    SeriesDateDto, SeriesDto, SeriesNumbersDto, SeriesSellerDto, TeamArea,
};
use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult, bad_request};
use crate::state::AppState;

/// Most dates in one series (a weekly event for a year, with room to spare).
pub const MAX_DATES: i64 = 60;

/// The series of an event, for its DTO; `None` when it has a single date.
pub(crate) async fn of_event(
    pool: &PgPool,
    event_id: Uuid,
) -> ApiResult<Option<EventSeriesRefDto>> {
    Ok(sqlx::query!(
        r#"select s.id, s.name,
                  (select count(*) from events x where x.series_id = s.id)::int4 as "dates!",
                  (select count(*) from events x where x.series_id = s.id
                   and (x.starts_at, x.id) <= (e.starts_at, e.id))::int4 as "position!"
           from events e join event_series s on s.id = e.series_id
           where e.id = $1"#,
        event_id
    )
    .fetch_optional(pool)
    .await?
    .map(|row| EventSeriesRefDto {
        id: row.id,
        name: row.name,
        dates: row.dates,
        position: row.position,
    }))
}

/// Whether the event is one of several dates: the ticket, the seller's page, the public check
/// and the door then say which session it is.
pub(crate) async fn in_series(pool: &PgPool, event_id: Uuid) -> ApiResult<bool> {
    Ok(sqlx::query_scalar!(
        r#"select series_id is not null as "in_series!" from events where id = $1"#,
        event_id
    )
    .fetch_optional(pool)
    .await?
    .unwrap_or(false))
}

/// The other dates of the event's series, for the door: a ticket of another session is told
/// apart from one of another event (it never enters here either).
pub(crate) async fn sessions(pool: &PgPool, event_id: Uuid) -> ApiResult<Vec<DoorSessionDto>> {
    let rows = sqlx::query!(
        r#"select x.qr_tag, x.starts_at, x.utc_offset_minutes
           from events e join events x on x.series_id = e.series_id and x.id <> e.id
           where e.id = $1
           order by x.starts_at"#,
        event_id
    )
    .fetch_all(pool)
    .await?;
    rows.into_iter()
        .map(|row| {
            let offset =
                time::UtcOffset::from_whole_seconds(i32::from(row.utc_offset_minutes) * 60)
                    .unwrap_or(time::UtcOffset::UTC);
            Ok(DoorSessionDto {
                event_tag: u32::try_from(row.qr_tag).map_err(|_| {
                    ApiError::Internal(anyhow::anyhow!("invalid tag {}", row.qr_tag))
                })?,
                starts_at: row.starts_at.to_offset(offset),
            })
        })
        .collect()
}

/// Deletes a series left with fewer than two dates (the last one goes on alone).
pub(crate) async fn dissolve_if_alone(
    tx: &mut Transaction<'_, Postgres>,
    series_id: Option<Uuid>,
) -> ApiResult<()> {
    if let Some(series_id) = series_id {
        sqlx::query!(
            r#"delete from event_series s where s.id = $1
               and (select count(*) from events e where e.series_id = s.id) < 2"#,
            series_id
        )
        .execute(&mut **tx)
        .await?;
    }
    Ok(())
}

/// `POST /api/events/{id}/dates`: another date of the event, with the setup of this one (ADR
/// 0077). The first time, the series is created with the event's name. The new date takes the
/// series' name and keeps the venue, price, design, categories, tables, sellers (without numbers), team and switches,
/// and gets its own QR tag and signing key.
pub async fn add_date(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
    Json(body): Json<NewDateBody>,
) -> ApiResult<(StatusCode, Json<EventDto>)> {
    // Unmapped in `team::need`: only the organization's people (and admins) get here.
    let access = event_access(&state.pool, &user, event_id).await?;
    let offset = validate_dates(body.starts_at, body.ends_at)?;
    if body.ends_at <= OffsetDateTime::now_utc() {
        return Err(bad_request("invalid_dates", "the date has already passed"));
    }
    let source = access.event;
    let mut tx = state.pool.begin().await?;
    // The source row is locked so two first dates cannot create two series.
    let current = sqlx::query_scalar!(
        "select series_id from events where id = $1 for update",
        event_id
    )
    .fetch_one(&mut *tx)
    .await?;
    let (series_id, name) = if let Some(series_id) = current {
        // Serializes concurrent additions to the same series (the count below).
        let name = sqlx::query_scalar!(
            "select name from event_series where id = $1 for update",
            series_id
        )
        .fetch_one(&mut *tx)
        .await?;
        (series_id, name)
    } else {
        let series_id = Uuid::new_v4();
        sqlx::query!(
            "insert into event_series (id, organization_id, name) values ($1, $2, $3)",
            series_id,
            access.organization_id,
            source.name,
        )
        .execute(&mut *tx)
        .await?;
        sqlx::query!(
            "update events set series_id = $2 where id = $1",
            event_id,
            series_id
        )
        .execute(&mut *tx)
        .await?;
        (series_id, source.name.clone())
    };
    let taken = sqlx::query!(
        r#"select count(*) as "dates!", bool_or(starts_at = $2) as "taken!"
           from events where series_id = $1"#,
        series_id,
        body.starts_at,
    )
    .fetch_one(&mut *tx)
    .await?;
    if taken.dates >= MAX_DATES {
        return Err(ApiError::Conflict(
            "series_full",
            format!("a series has at most {MAX_DATES} dates"),
        ));
    }
    if taken.taken {
        return Err(ApiError::Conflict(
            "date_taken",
            "the series already has a date starting then".to_owned(),
        ));
    }
    let copied = copy_event(
        &state,
        &mut tx,
        &source,
        CopyOf {
            organization_id: access.organization_id,
            // The new date carries the series' name, even when added from a date renamed on
            // its own.
            name: &name,
            starts_at: body.starts_at,
            ends_at: body.ends_at,
            utc_offset_minutes: offset,
            series_id: Some(series_id),
            user_id: user.id,
        },
    )
    .await?;
    tx.commit().await?;
    copied.check_art(&state);
    let mut event = copied.event.into_dto(access.organization_name)?;
    event.series = of_event(&state.pool, event.id).await?;
    Ok((StatusCode::CREATED, Json(event)))
}

/// `POST /api/events/{id}/series/leave`: the date goes on alone, with everything it has. The
/// other dates stay together (a series of one is dissolved).
pub async fn leave(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
) -> ApiResult<Json<EventDto>> {
    let access = event_access(&state.pool, &user, event_id).await?;
    let mut tx = state.pool.begin().await?;
    let series_id = sqlx::query_scalar!(
        "select series_id from events where id = $1 for update",
        event_id
    )
    .fetch_one(&mut *tx)
    .await?
    .ok_or_else(|| ApiError::Conflict("not_in_series", "the event has one date".to_owned()))?;
    sqlx::query!("update events set series_id = null where id = $1", event_id)
        .execute(&mut *tx)
        .await?;
    dissolve_if_alone(&mut tx, Some(series_id)).await?;
    tx.commit().await?;
    let event = access.dto(&state.pool, access.event.clone()).await?;
    Ok(Json(event))
}

/// Who opens a series and which of its dates.
struct SeriesAccess {
    id: Uuid,
    name: String,
    organization_id: Uuid,
    organization_name: String,
    /// One of the organization's people (or an admin): every date, and may change the series.
    manager: bool,
    /// An admin outside the organization (support mode).
    support: bool,
}

/// The series if the user may see at least one of its dates: the organization's people and
/// admins see all, a team member the dates they are on. 404 otherwise.
async fn series_access(pool: &PgPool, user: &AuthUser, series_id: Uuid) -> ApiResult<SeriesAccess> {
    let row = sqlx::query!(
        r#"select s.id, s.name, s.organization_id, o.name as organization_name,
                  exists(select 1 from memberships m
                         where m.organization_id = s.organization_id and m.user_id = $2) as "member!",
                  exists(select 1 from events e join event_team t on t.event_id = e.id
                         where e.series_id = s.id and t.user_id = $2) as "on_team!"
           from event_series s join organizations o on o.id = s.organization_id
           where s.id = $1"#,
        series_id,
        user.id,
    )
    .fetch_optional(pool)
    .await?
    .ok_or(ApiError::NotFound)?;
    let support = !row.member && !row.on_team && user.is_admin;
    if !row.member && !row.on_team && !support {
        return Err(ApiError::NotFound);
    }
    Ok(SeriesAccess {
        id: row.id,
        name: row.name,
        organization_id: row.organization_id,
        organization_name: row.organization_name,
        manager: row.member || support,
        support,
    })
}

/// `GET /api/series/{id}`: the dates side by side, with what each one issued, sold, let in and
/// took, the totals and the sellers added up by name.
pub async fn get(
    State(state): State<AppState>,
    user: AuthUser,
    Path(series_id): Path<Uuid>,
) -> ApiResult<Json<SeriesDto>> {
    let access = series_access(&state.pool, &user, series_id).await?;
    Ok(Json(build(&state, &user, access).await?))
}

/// `PUT /api/series/{id}`: renames the series. The dates that still carry the series' name follow
/// it; a date renamed on its own ("Sessão extra") keeps its name.
pub async fn rename(
    State(state): State<AppState>,
    user: AuthUser,
    Path(series_id): Path<Uuid>,
    Json(body): Json<SeriesBody>,
) -> ApiResult<Json<SeriesDto>> {
    let access = series_access(&state.pool, &user, series_id).await?;
    if !access.manager {
        return Err(ApiError::Refused(
            "not_your_area",
            "only the organization renames the series".to_owned(),
        ));
    }
    let name = body.name.trim().to_owned();
    if name.is_empty() || name.chars().count() > 100 {
        return Err(bad_request(
            "invalid_name",
            "name must have 1-100 characters",
        ));
    }
    one_line(&name, "invalid_name")?;
    if access.support {
        admin::audit_with(
            &state.pool,
            &user,
            "support_write",
            Some(access.organization_id),
            None,
            Some(series_id),
            serde_json::json!({ "method": user.method.as_str(), "path": user.path }),
        )
        .await?;
    }
    let mut tx = state.pool.begin().await?;
    let old = sqlx::query_scalar!(
        "select name from event_series where id = $1 for update",
        series_id
    )
    .fetch_one(&mut *tx)
    .await?;
    sqlx::query!(
        "update event_series set name = $2 where id = $1",
        series_id,
        name
    )
    .execute(&mut *tx)
    .await?;
    sqlx::query!(
        "update events set name = $3 where series_id = $1 and name = $2",
        series_id,
        old,
        name,
    )
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    let access = SeriesAccess { name, ..access };
    Ok(Json(build(&state, &user, access).await?))
}

/// The series page of a user who may open it.
#[expect(
    clippy::too_many_lines,
    reason = "dates, totals and sellers come from the same loop"
)]
async fn build(state: &AppState, user: &AuthUser, access: SeriesAccess) -> ApiResult<SeriesDto> {
    let rows = sqlx::query!(
        r#"select e.id, e.name, e.venue, e.starts_at, e.ends_at, e.ticket_price_cents, e.status, e.qr_tag,
                  e.utc_offset_minutes, e.address, e.postponed_from_starts_at, e.postponed_at,
                  e.postpone_reason, e.canceled_at, e.cancel_reason,
                  (select t.areas from event_team t where t.event_id = e.id and t.user_id = $2) as "areas?: Vec<String>",
                  (select coalesce(sum(b.price_cents), 0) from ticket_batches b
                   where b.event_id = e.id and b.status = 'paid')::bigint as "cost_cents!"
           from events e where e.series_id = $1
           order by e.starts_at, e.id"#,
        access.id,
        user.id,
    )
    .fetch_all(&state.pool)
    .await?;
    let all = i32::try_from(rows.len()).unwrap_or(i32::MAX);
    let mut dates = Vec::with_capacity(rows.len());
    let mut shown = Vec::with_capacity(rows.len());
    let mut totals = SeriesNumbersDto::default();
    let mut priced_totals = true;
    let mut sellers: Vec<(String, SellerSum)> = Vec::new();
    let mut seller_index: HashMap<String, usize> = HashMap::new();
    for (position, row) in rows.into_iter().enumerate() {
        let team = row.areas.map(|areas| {
            areas
                .iter()
                .filter_map(|area| TeamArea::from_db(area))
                .collect::<Vec<_>>()
        });
        // A team member sees the dates they are on.
        if !access.manager && team.is_none() {
            continue;
        }
        let event = EventRow {
            id: row.id,
            name: row.name,
            venue: row.venue,
            starts_at: row.starts_at,
            ends_at: row.ends_at,
            ticket_price_cents: row.ticket_price_cents,
            status: row.status,
            qr_tag: row.qr_tag,
            utc_offset_minutes: row.utc_offset_minutes,
            address: row.address,
            postponed_from_starts_at: row.postponed_from_starts_at,
            postponed_at: row.postponed_at,
            postpone_reason: row.postpone_reason,
            canceled_at: row.canceled_at,
            cancel_reason: row.cancel_reason,
        };
        // The same numbers as each date's report (ADR 0056 prices, ADR 0069 box office).
        let report = report::build(state, &event).await?;
        let numbers = SeriesNumbersDto {
            tickets: report.totals.tickets,
            sold: report.totals.declared_sold,
            entries: report.totals.entries,
            amount_due_cents: report.totals.amount_due_cents,
            received_cents: report.totals.received_cents,
            cost_cents: row.cost_cents,
            net_cents: report
                .totals
                .amount_due_cents
                .map(|due| due - row.cost_cents),
        };
        totals.tickets += numbers.tickets;
        totals.sold += numbers.sold;
        totals.entries += numbers.entries;
        totals.received_cents += numbers.received_cents;
        totals.cost_cents += numbers.cost_cents;
        // A date without any sold ticket adds nothing, priced or not.
        match numbers.amount_due_cents {
            Some(due) => {
                totals.amount_due_cents = Some(totals.amount_due_cents.unwrap_or(0) + due);
            }
            None if numbers.sold > 0 => priced_totals = false,
            None => {}
        }
        for line in report.sellers {
            let Some(name) = &line.seller else { continue };
            let index = *seller_index.entry(seller_key(name)).or_insert_with(|| {
                sellers.push((name.clone(), SellerSum::default()));
                sellers.len() - 1
            });
            if let Some((_, sum)) = sellers.get_mut(index) {
                sum.add(&line, position);
            }
        }
        shown.push(event.clone());
        let mut dto = event.into_dto(access.organization_name.clone())?;
        dto.support_access = access.support;
        dto.team = team.map(|areas| EventTeamAccessDto {
            areas,
            organization: access.organization_name.clone(),
        });
        dto.series = Some(EventSeriesRefDto {
            id: access.id,
            name: access.name.clone(),
            dates: all,
            position: i32::try_from(position + 1).unwrap_or(i32::MAX),
        });
        dates.push(SeriesDateDto {
            event: dto,
            numbers,
        });
    }
    if dates.is_empty() {
        return Err(ApiError::NotFound);
    }
    // What each date still misses (ADR 0078), in one query.
    let missing =
        super::checklist::missing_counts(&state.pool, &shown.iter().collect::<Vec<_>>()).await?;
    for date in &mut dates {
        date.event.checklist_missing = missing.get(&date.event.id).copied();
    }
    if !priced_totals {
        totals.amount_due_cents = None;
    }
    totals.net_cents = totals.amount_due_cents.map(|due| due - totals.cost_cents);
    let mut sellers: Vec<SeriesSellerDto> = sellers
        .into_iter()
        .map(|(name, sum)| sum.into_dto(name))
        .collect();
    sellers.sort_by(|a, b| b.sold.cmp(&a.sold).then_with(|| a.name.cmp(&b.name)));
    let shown = i32::try_from(shown.len()).unwrap_or(i32::MAX);
    Ok(SeriesDto {
        id: access.id,
        name: access.name,
        organization_name: access.organization_name,
        can_manage: access.manager,
        support_access: access.support,
        dates,
        hidden_dates: all - shown,
        totals,
        sellers,
    })
}

/// Sellers are matched by name across dates: spaces and letter case do not matter.
fn seller_key(name: &str) -> String {
    name.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

/// A seller's lines added up.
#[derive(Default)]
struct SellerSum {
    dates: Vec<usize>,
    tickets: i64,
    sold: i64,
    amount_due_cents: Option<i64>,
    unpriced: bool,
    received_cents: i64,
    balance_cents: Option<i64>,
}

impl SellerSum {
    fn add(&mut self, line: &crate::api::ReportRowDto, date: usize) {
        // A date counts when the seller had numbers or handed over money there (sellers are
        // copied to every new date, used or not).
        if (line.tickets > 0 || line.received_cents != 0) && !self.dates.contains(&date) {
            self.dates.push(date);
        }
        self.tickets += line.tickets;
        self.sold += line.declared_sold;
        self.received_cents += line.received_cents;
        match line.amount_due_cents {
            Some(due) => {
                self.amount_due_cents = Some(self.amount_due_cents.unwrap_or(0) + due);
                let balance = line.balance_cents.unwrap_or(due - line.received_cents);
                self.balance_cents = Some(self.balance_cents.unwrap_or(0) + balance);
            }
            None if line.declared_sold > 0 => self.unpriced = true,
            None => {
                // Nothing sold and no price: what was received is still a credit.
                self.balance_cents = Some(self.balance_cents.unwrap_or(0) - line.received_cents);
            }
        }
    }

    fn into_dto(self, name: String) -> SeriesSellerDto {
        let (amount_due_cents, balance_cents) = if self.unpriced {
            (None, None)
        } else {
            (self.amount_due_cents, self.balance_cents)
        };
        SeriesSellerDto {
            name,
            dates: i32::try_from(self.dates.len()).unwrap_or(i32::MAX),
            tickets: self.tickets,
            sold: self.sold,
            amount_due_cents,
            received_cents: self.received_cents,
            balance_cents,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sellers_match_by_name() {
        assert_eq!(seller_key("  Ana   Souza "), seller_key("ana souza"));
        assert_ne!(seller_key("Ana"), seller_key("Ana Souza"));
    }
}
