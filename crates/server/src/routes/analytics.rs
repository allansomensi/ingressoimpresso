//! Results (ADR 0034): what the organizer sold and spent, per event and across events, and the
//! service's own revenue for the admins.
//!
//! Tickets are sold by hand, off the platform: "sold" is what the report calls declared sold
//! (paid tickets minus the ones voided as unsold or lost) and the gross amount is that times the
//! event's price. The cost is what the organizer paid for the batches.

use std::collections::BTreeMap;

use axum::Json;
use axum::extract::{Path, Query, State};
use serde::Deserialize;
use time::{Duration, Month, OffsetDateTime, UtcOffset};
use uuid::Uuid;

use super::admin::require_admin;
use super::authorize_event;
use crate::api::{
    AdminFinanceDto, AdminMethodDto, AdminSeriesPointDto, AdminTopOrganizationDto, EntryBucketDto,
    EventAnalyticsDto, EventResultDto, MonthResultDto, OrgAnalyticsDto, PaymentMethod,
    ResultTotalsDto,
};
use crate::auth::AuthUser;
use crate::error::{ApiResult, bad_request};
use crate::state::AppState;

/// Width of a bar of the entries chart.
const BUCKET_MINUTES: i64 = 15;
/// Months in the organization's chart.
const MONTHS: usize = 12;

struct EventLine {
    id: Uuid,
    name: String,
    starts_at: OffsetDateTime,
    status: String,
    utc_offset_minutes: i16,
    ticket_price_cents: Option<i32>,
    paid_tickets: i64,
    not_sold: i64,
    entries: i64,
    cost_cents: i64,
}

impl EventLine {
    fn sold(&self) -> i64 {
        self.paid_tickets - self.not_sold
    }

    fn gross(&self) -> i64 {
        self.ticket_price_cents
            .map_or(0, |price| self.sold() * i64::from(price))
    }
}

/// `GET /api/analytics`: every event of the signed-in user's organizations.
pub async fn organization(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<OrgAnalyticsDto>> {
    let lines = sqlx::query_as!(
        EventLine,
        r#"with org_events as (
               select e.id from events e join memberships m on m.organization_id = e.organization_id
               where m.user_id = $1
           ),
           issued as (
               select b.event_id, n as number
               from ticket_batches b join org_events o on o.id = b.event_id
               cross join lateral generate_series(lower(b.numbers), upper(b.numbers) - 1) as n
               where b.status = 'paid'
           ),
           voided as (
               select distinct on (i.event_id, i.number) i.event_id, i.number, v.reason
               from issued i join ticket_voids v
                 on v.event_id = i.event_id and v.undone_at is null and v.numbers @> i.number
               order by i.event_id, i.number, v.created_at
           )
           select e.id, e.name, e.starts_at, e.status, e.utc_offset_minutes, e.ticket_price_cents,
                  (select count(*) from issued i where i.event_id = e.id) as "paid_tickets!",
                  (select count(*) from voided v where v.event_id = e.id
                   and v.reason in ('unsold', 'lost')) as "not_sold!",
                  (select count(*) from entries en where en.event_id = e.id) as "entries!",
                  (select coalesce(sum(b.price_cents), 0) from ticket_batches b
                   where b.event_id = e.id and b.status = 'paid')::bigint as "cost_cents!"
           from events e join org_events o on o.id = e.id
           order by e.starts_at desc"#,
        user.id
    )
    .fetch_all(&state.pool)
    .await?;

    let mut totals = ResultTotalsDto::default();
    for line in &lines {
        totals.events += 1;
        totals.paid_tickets += line.paid_tickets;
        totals.sold += line.sold();
        totals.entries += line.entries;
        totals.gross_cents += line.gross();
        totals.cost_cents += line.cost_cents;
    }
    totals.net_cents = totals.gross_cents - totals.cost_cents;
    let months = months(&lines, OffsetDateTime::now_utc());
    let events = lines
        .into_iter()
        .map(|line| EventResultDto {
            sold: line.sold(),
            gross_cents: line.gross(),
            id: line.id,
            name: line.name,
            starts_at: line.starts_at.to_offset(local(line.utc_offset_minutes)),
            status: line.status,
            ticket_price_cents: line.ticket_price_cents,
            paid_tickets: line.paid_tickets,
            entries: line.entries,
            cost_cents: line.cost_cents,
        })
        .collect();
    Ok(Json(OrgAnalyticsDto {
        totals,
        events,
        months,
    }))
}

fn local(minutes: i16) -> UtcOffset {
    UtcOffset::from_whole_seconds(i32::from(minutes) * 60).unwrap_or(UtcOffset::UTC)
}

/// Months ahead of today the chart may reach, for events already scheduled.
const MONTHS_AHEAD: i32 = 6;

/// Twelve months by the events' local start, oldest first, empty months included: up to this
/// month, or up to the month of the latest scheduled event (at most six months ahead).
fn months(lines: &[EventLine], now: OffsetDateTime) -> Vec<MonthResultDto> {
    let brasilia = UtcOffset::from_hms(-3, 0, 0).unwrap_or(UtcOffset::UTC);
    let today = now.to_offset(brasilia).date();
    let index = |year: i32, month: Month| year * 12 + i32::from(u8::from(month)) - 1;
    let latest = lines
        .iter()
        .map(|line| {
            let date = line
                .starts_at
                .to_offset(local(line.utc_offset_minutes))
                .date();
            index(date.year(), date.month())
        })
        .max()
        .unwrap_or(i32::MIN);
    let now_index = index(today.year(), today.month());
    let end = latest.clamp(now_index, now_index + MONTHS_AHEAD);
    let mut keys = Vec::with_capacity(MONTHS);
    let (mut year, mut month) = (
        end.div_euclid(12),
        Month::January.nth_next(u8::try_from(end.rem_euclid(12)).unwrap_or(0)),
    );
    for _ in 0..MONTHS {
        keys.push((year, month));
        if month == Month::January {
            year -= 1;
        }
        month = month.previous();
    }
    keys.reverse();
    let mut buckets: BTreeMap<(i32, u8), MonthResultDto> = keys
        .iter()
        .map(|(year, month)| {
            (
                (*year, u8::from(*month)),
                MonthResultDto {
                    month: format!("{year:04}-{:02}", u8::from(*month)),
                    ..MonthResultDto::default()
                },
            )
        })
        .collect();
    for line in lines {
        let date = line
            .starts_at
            .to_offset(local(line.utc_offset_minutes))
            .date();
        if let Some(bucket) = buckets.get_mut(&(date.year(), u8::from(date.month()))) {
            bucket.events += 1;
            bucket.sold += line.sold();
            bucket.entries += line.entries;
            bucket.gross_cents += line.gross();
            bucket.cost_cents += line.cost_cents;
        }
    }
    buckets.into_values().collect()
}

/// `GET /api/events/{id}/analytics`: one event's results and its entries over time.
pub async fn event(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
) -> ApiResult<Json<EventAnalyticsDto>> {
    let event = authorize_event(&state.pool, &user, event_id).await?;
    let counts = sqlx::query!(
        r#"with issued as (
               select n as number from ticket_batches b
               cross join lateral generate_series(lower(b.numbers), upper(b.numbers) - 1) as n
               where b.event_id = $1 and b.status = 'paid'
           ),
           voided as (
               select distinct on (i.number) i.number, v.reason
               from issued i join ticket_voids v
                 on v.event_id = $1 and v.undone_at is null and v.numbers @> i.number
               order by i.number, v.created_at
           )
           select (select count(*) from issued) as "paid_tickets!",
                  (select count(*) from voided where reason = 'unsold') as "unsold!",
                  (select count(*) from voided where reason = 'lost') as "lost!",
                  (select count(*) from voided where reason = 'revoked') as "revoked!",
                  (select count(*) from entries where event_id = $1) as "entries!",
                  (select coalesce(sum(price_cents), 0) from ticket_batches
                   where event_id = $1 and status = 'paid')::bigint as "cost_cents!",
                  (select coalesce(sum(free_tickets), 0) from ticket_batches
                   where event_id = $1 and status = 'paid')::bigint as "free_tickets!",
                  (select count(*) from ticket_links where event_id = $1 and revoked_at is null) as "digital!",
                  (select count(*) from ticket_links where event_id = $1 and revoked_at is null
                   and first_opened_at is not null) as "digital_opened!",
                  (select count(*) from scans where event_id = $1
                   and (local_outcome = 'rejected_used'
                        or (server_class = 'duplicate_entry' and confirmed_online))) as "blocked!""#,
        event_id
    )
    .fetch_one(&state.pool)
    .await?;
    let times = sqlx::query_scalar!(
        r#"select s.scanned_at from entries e join scans s on s.id = e.first_scan_id
           where e.event_id = $1 order by s.scanned_at"#,
        event_id
    )
    .fetch_all(&state.pool)
    .await?;
    let offset = event.offset();
    let timeline = buckets(&times, offset);
    let sold = counts.paid_tickets - counts.unsold - counts.lost;
    let gross = event
        .ticket_price_cents
        .map(|price| sold * i64::from(price));
    Ok(Json(EventAnalyticsDto {
        ticket_price_cents: event.ticket_price_cents,
        paid_tickets: counts.paid_tickets,
        sold,
        unsold: counts.unsold,
        lost: counts.lost,
        revoked: counts.revoked,
        entries: counts.entries,
        blocked_copies: counts.blocked,
        gross_cents: gross,
        cost_cents: counts.cost_cents,
        net_cents: gross.map(|gross| gross - counts.cost_cents),
        free_tickets: counts.free_tickets,
        digital_tickets: counts.digital,
        digital_opened: counts.digital_opened,
        first_entry_at: times.first().map(|at| at.to_offset(offset)),
        last_entry_at: times.last().map(|at| at.to_offset(offset)),
        timeline,
    }))
}

/// First entries per 15 minutes, from the first to the last bucket with an entry.
fn buckets(times: &[OffsetDateTime], offset: UtcOffset) -> Vec<EntryBucketDto> {
    let (Some(first), Some(last)) = (times.first(), times.last()) else {
        return Vec::new();
    };
    let width = BUCKET_MINUTES * 60;
    let start = first.unix_timestamp().div_euclid(width) * width;
    let end = last.unix_timestamp().div_euclid(width) * width;
    // A stray scan days apart would draw thousands of empty bars: keep at most two days.
    let count = usize::try_from((end - start) / width + 1)
        .unwrap_or(0)
        .min(192);
    let mut entries = vec![0_i64; count];
    for at in times {
        let index = usize::try_from((at.unix_timestamp() - start) / width).unwrap_or(usize::MAX);
        if let Some(slot) = entries.get_mut(index) {
            *slot += 1;
        }
    }
    entries
        .into_iter()
        .enumerate()
        .filter_map(|(index, count)| {
            let offset_secs = i64::try_from(index).ok()? * width;
            let at = OffsetDateTime::from_unix_timestamp(start + offset_secs)
                .ok()?
                .to_offset(offset);
            Some(EntryBucketDto { at, entries: count })
        })
        .collect()
}

/// Period of the finance view.
#[derive(Debug, Deserialize)]
pub struct FinanceQuery {
    /// 7, 30, 90 or 365 days (default 30).
    #[serde(default)]
    days: Option<i64>,
}

/// `GET /api/admin/finance?days=`: revenue of the period against the one before, by payment
/// method, over time (days, or months for a year), the top organizations and the funnel.
#[expect(
    clippy::too_many_lines,
    reason = "one query per section of the finance view, assembled in one place"
)]
pub async fn finance(
    State(state): State<AppState>,
    user: AuthUser,
    Query(query): Query<FinanceQuery>,
) -> ApiResult<Json<AdminFinanceDto>> {
    require_admin(&user)?;
    let days = query.days.unwrap_or(30);
    if ![7, 30, 90, 365].contains(&days) {
        return Err(bad_request(
            "invalid_period",
            "days must be 7, 30, 90 or 365",
        ));
    }
    let now = OffsetDateTime::now_utc();
    let since = now - Duration::days(days);
    let before = since - Duration::days(days);

    let totals = sqlx::query!(
        r#"select
             coalesce(sum(price_cents) filter (where paid_at >= $1), 0)::bigint as "revenue!",
             coalesce(sum(price_cents) filter (where paid_at >= $2 and paid_at < $1), 0)::bigint as "previous!",
             count(*) filter (where paid_at >= $1 and price_cents > 0) as "charged_batches!",
             coalesce(sum(upper(numbers) - lower(numbers) - free_tickets)
                      filter (where paid_at >= $1 and price_cents > 0), 0)::bigint as "charged_tickets!",
             coalesce(sum(price_cents) filter (where refunded_at >= $1), 0)::bigint as "refunds!",
             count(*) filter (where refunded_at >= $1) as "refunded_batches!"
           from ticket_batches where status in ('paid', 'refunded') and paid_at >= $2"#,
        since,
        before,
    )
    .fetch_one(&state.pool)
    .await?;
    let pending = sqlx::query!(
        r#"select count(*) as "batches!", coalesce(sum(price_cents), 0)::bigint as "cents!"
           from ticket_batches where status = 'awaiting_payment'"#
    )
    .fetch_one(&state.pool)
    .await?;
    let methods = sqlx::query!(
        r#"select coalesce(paid_via, 'admin') as "method!", count(*) as "batches!",
                  coalesce(sum(upper(numbers) - lower(numbers)), 0)::bigint as "tickets!",
                  coalesce(sum(price_cents), 0)::bigint as "revenue!"
           from ticket_batches where status in ('paid', 'refunded') and paid_at >= $1
           group by 1 order by 4 desc, 2 desc"#,
        since
    )
    .fetch_all(&state.pool)
    .await?;
    let monthly = days > 90;
    let series = sqlx::query!(
        r#"with buckets as (
             select generate_series(
               date_trunc(case when $2 then 'month' else 'day' end, ($1 at time zone 'America/Sao_Paulo')),
               date_trunc(case when $2 then 'month' else 'day' end, (now() at time zone 'America/Sao_Paulo')),
               case when $2 then interval '1 month' else interval '1 day' end) as bucket
           )
           select to_char(k.bucket, case when $2 then 'YYYY-MM' else 'YYYY-MM-DD' end) as "label!",
                  coalesce(sum(b.price_cents), 0)::bigint as "revenue!",
                  coalesce(sum(upper(b.numbers) - lower(b.numbers)), 0)::bigint as "tickets!",
                  count(b.id) as "batches!"
           from buckets k
           left join ticket_batches b
             on b.status in ('paid', 'refunded') and b.paid_at >= $1
            and date_trunc(case when $2 then 'month' else 'day' end, (b.paid_at at time zone 'America/Sao_Paulo')) = k.bucket
           group by k.bucket order by k.bucket"#,
        since,
        monthly,
    )
    .fetch_all(&state.pool)
    .await?;
    let top = sqlx::query_as!(
        AdminTopOrganizationDto,
        r#"select o.id, o.name, coalesce(sum(b.price_cents), 0)::bigint as "revenue_cents!",
                  coalesce(sum(upper(b.numbers) - lower(b.numbers)), 0)::bigint as "tickets!"
           from ticket_batches b join events e on e.id = b.event_id join organizations o on o.id = e.organization_id
           where b.status in ('paid', 'refunded') and b.paid_at >= $1 and b.price_cents > 0
           group by o.id, o.name order by 3 desc limit 10"#,
        since
    )
    .fetch_all(&state.pool)
    .await?;
    let funnel = sqlx::query!(
        r#"select count(*) as "signups!",
                  count(*) filter (where exists (select 1 from events e where e.organization_id = o.id)) as "with_event!",
                  count(*) filter (where exists (select 1 from ticket_batches b join events e on e.id = b.event_id
                                                 where e.organization_id = o.id and b.status in ('paid', 'refunded'))) as "with_tickets!",
                  count(*) filter (where exists (select 1 from ticket_batches b join events e on e.id = b.event_id
                                                 where e.organization_id = o.id and b.status in ('paid', 'refunded')
                                                   and b.price_cents > 0)) as "paying!"
           from organizations o where o.created_at >= $1"#,
        since
    )
    .fetch_one(&state.pool)
    .await?;

    Ok(Json(AdminFinanceDto {
        days,
        revenue_cents: totals.revenue,
        previous_revenue_cents: totals.previous,
        refunds_cents: totals.refunds,
        refunded_batches: totals.refunded_batches,
        net_cents: totals.revenue - totals.refunds,
        charged_batches: totals.charged_batches,
        charged_tickets: totals.charged_tickets,
        average_batch_cents: if totals.charged_batches > 0 {
            totals.revenue / totals.charged_batches
        } else {
            0
        },
        pending_batches: pending.batches,
        pending_cents: pending.cents,
        methods: methods
            .into_iter()
            .map(|row| AdminMethodDto {
                method: PaymentMethod::from_db(&row.method).unwrap_or(PaymentMethod::Admin),
                batches: row.batches,
                tickets: row.tickets,
                revenue_cents: row.revenue,
            })
            .collect(),
        monthly,
        series: series
            .into_iter()
            .map(|row| AdminSeriesPointDto {
                label: row.label,
                revenue_cents: row.revenue,
                tickets: row.tickets,
                batches: row.batches,
            })
            .collect(),
        top_organizations: top,
        signups: funnel.signups,
        signups_with_event: funnel.with_event,
        signups_with_tickets: funnel.with_tickets,
        signups_paying: funnel.paying,
    }))
}

/// Calendar date in Brasília (tests).
#[cfg(test)]
fn brasilia_date(at: OffsetDateTime) -> time::Date {
    at.to_offset(UtcOffset::from_hms(-3, 0, 0).unwrap_or(UtcOffset::UTC))
        .date()
}

#[cfg(test)]
mod tests {
    use time::macros::datetime;

    use super::*;

    fn line(starts_at: OffsetDateTime, paid: i64, not_sold: i64, price: Option<i32>) -> EventLine {
        EventLine {
            id: Uuid::nil(),
            name: "Show".to_owned(),
            starts_at,
            status: "active".to_owned(),
            utc_offset_minutes: -180,
            ticket_price_cents: price,
            paid_tickets: paid,
            not_sold,
            entries: 0,
            cost_cents: 500,
        }
    }

    #[test]
    fn months_cover_a_year_and_place_events_by_local_date() {
        let now = datetime!(2026-10-09 12:00 UTC);
        assert_eq!(brasilia_date(now), time::macros::date!(2026 - 10 - 09));
        // 1 Oct 01:00 UTC is still 30 Sep in Brasília.
        let lines = [
            line(datetime!(2026-10-01 01:00 UTC), 100, 10, Some(2_000)),
            line(datetime!(2026-10-20 23:00 UTC), 50, 0, None),
            line(datetime!(2024-01-01 12:00 UTC), 10, 0, Some(100)),
        ];
        let months = months(&lines, now);
        assert_eq!(months.len(), 12);
        assert_eq!(months.first().unwrap().month, "2025-11");
        let september = months.iter().find(|m| m.month == "2026-09").unwrap();
        assert_eq!(
            (september.events, september.sold, september.gross_cents),
            (1, 90, 180_000)
        );
        let october = months.last().unwrap();
        assert_eq!(
            (october.month.as_str(), october.events, october.gross_cents),
            ("2026-10", 1, 0)
        );

        // A show scheduled for next month moves the window forward; one years ahead does not.
        let ahead = [
            line(datetime!(2026-11-21 01:00 UTC), 10, 0, Some(100)),
            line(datetime!(2030-01-01 12:00 UTC), 10, 0, Some(100)),
        ];
        let months = super::months(&ahead, now);
        assert_eq!(months.first().unwrap().month, "2026-05");
        assert_eq!(months.last().unwrap().month, "2027-04");
        assert_eq!(
            months.iter().find(|m| m.month == "2026-11").unwrap().events,
            1
        );
    }

    #[test]
    fn buckets_are_quarter_hours_in_local_time() {
        let offset = UtcOffset::from_hms(-3, 0, 0).unwrap();
        let times = [
            datetime!(2026-11-21 01:01 UTC),
            datetime!(2026-11-21 01:14 UTC),
            datetime!(2026-11-21 01:50 UTC),
        ];
        let bars = buckets(&times, offset);
        assert_eq!(bars.len(), 4);
        assert_eq!(bars[0].entries, 2);
        assert_eq!(bars[1].entries, 0);
        assert_eq!(bars[3].entries, 1);
        assert_eq!(bars[0].at.offset(), offset);
        assert_eq!(bars[0].at.hour(), 22);
        assert_eq!(buckets(&[], offset).len(), 0);
    }
}
