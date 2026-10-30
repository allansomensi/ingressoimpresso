//! The door right now (ADR 0071): one read for the panel's live view, polled every few seconds
//! by anyone on the event's team. Everything comes from the scan log, the entries, the phones'
//! last syncs, the guest arrivals and the box office ranges; nothing here writes.

use axum::Json;
use axum::extract::{Path, State};
use sqlx::PgPool;
use time::OffsetDateTime;
use uuid::Uuid;

use super::authorize_event;
use crate::api::{
    DoorLiveBoxOfficeDto, DoorLiveBucketDto, DoorLiveCategoryDto, DoorLiveCheckpointDto,
    DoorLiveDayDto, DoorLiveDeviceDto, DoorLiveDoorDto, DoorLiveDto, DoorLiveGuestsDto,
    DoorLiveReentryDto, DoorLiveRefusalsDto,
};
use crate::auth::AuthUser;
use crate::error::ApiResult;
use crate::state::AppState;

/// The curve covers the last hour in 5-minute windows.
const BUCKETS: i64 = 12;

/// `GET /api/events/{id}/door/live`.
#[expect(
    clippy::too_many_lines,
    reason = "one snapshot of the door: every count reads best side by side"
)]
pub async fn live(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
) -> ApiResult<Json<DoorLiveDto>> {
    let event = authorize_event(&state.pool, &user, event_id).await?;
    let price = event.ticket_price_cents;
    let pool = &state.pool;
    let now = OffsetDateTime::now_utc();

    let tickets = sqlx::query!(
        r#"with issued as (
               select n as number
               from ticket_batches b, generate_series(lower(b.numbers), upper(b.numbers) - 1) as n
               where b.event_id = $1 and b.status = 'paid'
           )
           select count(*) as "issued!",
                  count(*) filter (where not exists (
                      select 1 from ticket_voids v
                      where v.event_id = $1 and v.undone_at is null and v.numbers @> i.number
                        and v.reason in ('unsold', 'lost'))) as "sold!"
           from issued i"#,
        event_id
    )
    .fetch_one(pool);
    let entries = sqlx::query!(
        r#"select (select count(*) from entries where event_id = $1) as "count!",
                  min(s.scanned_at) as first, max(s.scanned_at) as last
           from door_ledger_entries e join scans s on s.id = e.first_scan_id
           where e.event_id = $1 and e.checkpoint = '00000000-0000-0000-0000-000000000000'"#,
        event_id
    )
    .fetch_one(pool);
    let devices = sqlx::query_as!(
        DoorLiveDeviceDto,
        r#"select d.id, d.name, a.label as door,
                  (select count(*) from door_ledger_entries e join scans s on s.id = e.first_scan_id
                   where e.event_id = d.event_id and s.device_id = d.id) as "entries!",
                  (select count(*) from scans s where s.device_id = d.id) as "scans!",
                  d.last_seen_at, d.last_sync_at, d.pending_scans, d.rehearsed_at,
                  (d.revoked_at is not null or a.revoked_at is not null) as "revoked!"
           from door_devices d join door_accesses a on a.id = d.door_access_id
           where d.event_id = $1 order by d.name, d.created_at"#,
        event_id
    )
    .fetch_all(pool);
    let refusals = sqlx::query_as!(
        DoorLiveRefusalsDto,
        r#"select count(*) filter (where local_outcome = 'rejected_used'
                                     or (server_class = 'duplicate_entry' and confirmed_online)) as "blocked_copies!",
                  count(*) filter (where server_class = 'duplicate_entry' and not confirmed_online) as "offline_duplicates!",
                  count(*) filter (where local_outcome = 'rejected_invalid') as "invalid!",
                  count(*) filter (where local_outcome = 'rejected_other_event') as "other_event!",
                  count(*) filter (where local_outcome = 'rejected_void') as "voided!",
                  count(*) filter (where server_class = 'void_entry') as "void_entries!",
                  count(*) filter (where local_outcome = 'rejected_wrong_door') as "wrong_door!",
                  count(*) filter (where door_exception
                                     and coalesce(exception_kind, 'wrong_door') = 'wrong_door') as "wrong_door_admitted!",
                  count(*) filter (where local_outcome = 'rejected_wrong_day') as "wrong_day!",
                  count(*) filter (where door_exception and exception_kind = 'wrong_day') as "wrong_day_admitted!"
           -- The entrance only: a checkpoint's refusals are its own (ADR 0092).
           from scans where event_id = $1 and checkpoint_id is null"#,
        event_id
    )
    .fetch_one(pool);
    let days = crate::event_days::of_event(pool, event_id, event.offset()).await?;
    let day_bounds: Vec<crate::event_days::Day> = days
        .iter()
        .map(|day| crate::event_days::Day {
            starts_at: day.starts_at,
            ends_at: day.ends_at,
        })
        .collect();
    let today = crate::event_days::current(&day_bounds, now);
    // The live view counts entries per category; the sales side (ADR 0124) is the report's.
    let no_digital = std::collections::HashMap::new();
    // Polled every few seconds: the independent reads go out together.
    let (tickets, entries, doors, devices, categories, refusals, guests, box_office, reentry) = tokio::try_join!(
        async { Ok(tickets.await?) },
        async { Ok(entries.await?) },
        doors(pool, event_id),
        async { Ok(devices.await?) },
        super::report::by_category(&state, event_id, price, &no_digital, false),
        async { Ok(refusals.await?) },
        guests(pool, event_id),
        box_office(pool, event_id, price),
        reentry(pool, event_id, today),
    )?;
    let (day_entries, checkpoints, capacity, credentials) = tokio::try_join!(
        day_entries(pool, event_id, &days),
        checkpoints(pool, event_id, today),
        crate::capacity::live(pool, event_id, &day_bounds),
        super::credentials::live(pool, event_id),
    )?;
    let categories = categories
        .into_iter()
        .map(|row| DoorLiveCategoryDto {
            name: row.name,
            color: row.color,
            sold: row.sold,
            entries: row.entries,
        })
        .collect();

    // The last hour; once the event is over, the last hour with entries.
    let anchor = if now > event.ends_at {
        entries.last.unwrap_or(now).min(now)
    } else {
        now
    };
    let timeline = timeline(pool, event_id, anchor).await?;

    Ok(Json(DoorLiveDto {
        issued: tickets.issued,
        sold: tickets.sold,
        entries: entries.count,
        first_entry_at: entries.first,
        last_entry_at: entries.last,
        timeline,
        doors,
        devices,
        categories,
        refusals,
        guests,
        box_office,
        reentry,
        days: day_entries,
        today,
        checkpoints,
        capacity,
        credentials,
        generated_at: now,
    }))
}

/// Tickets that entered on each day of an event of several days (ADR 0091): the first entry of
/// each book, by the day it was read on.
async fn day_entries(
    pool: &PgPool,
    event_id: Uuid,
    days: &[crate::api::EventDayDto],
) -> ApiResult<Vec<DoorLiveDayDto>> {
    if days.is_empty() {
        return Ok(Vec::new());
    }
    let counts: std::collections::HashMap<i16, i64> = sqlx::query!(
        r#"select s.day as "day!", count(*) as "entries!"
           from door_ledger_entries e join scans s on s.id = e.first_scan_id
           where e.event_id = $1 and e.checkpoint = '00000000-0000-0000-0000-000000000000'
             and s.day is not null
           group by s.day"#,
        event_id
    )
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(|row| (row.day, row.entries))
    .collect();
    Ok(days
        .iter()
        .map(|day| DoorLiveDayDto {
            position: day.position,
            starts_at: day.starts_at,
            entries: counts.get(&i16::from(day.position)).copied().unwrap_or(0),
        })
        .collect())
}

/// Each checkpoint (ADR 0092): who has the right, who used it (in all and today) and what it
/// turned away.
async fn checkpoints(
    pool: &PgPool,
    event_id: Uuid,
    today: Option<u8>,
) -> ApiResult<Vec<DoorLiveCheckpointDto>> {
    Ok(sqlx::query!(
        r#"with sold as (
               select n as number
               from ticket_batches b, generate_series(lower(b.numbers), upper(b.numbers) - 1) as n
               where b.event_id = $1 and b.status = 'paid'
                 and not exists (select 1 from ticket_voids v
                                 where v.event_id = $1 and v.undone_at is null and v.numbers @> n
                                   and v.reason in ('unsold', 'lost'))
           )
           select c.id, c.name, c.per_day,
                  (select count(*) from sold
                   where not exists (select 1 from checkpoint_categories cc where cc.checkpoint_id = c.id)
                      or exists (select 1 from checkpoint_categories cc
                                 join category_ranges r on r.category_id = cc.category_id
                                 where cc.checkpoint_id = c.id and r.numbers @> sold.number)) as "entitled!",
                  (select coalesce(sum(case
                       when not exists (select 1 from checkpoint_categories cc where cc.checkpoint_id = c.id)
                       then c.allowance
                       else (select max(cc.allowance) from checkpoint_categories cc
                             join category_ranges r on r.category_id = cc.category_id
                             where cc.checkpoint_id = c.id and r.numbers @> sold.number) end), 0)
                   from sold)::bigint as "allowance_total!",
                  (select count(*) from door_ledger_entries l
                   where l.event_id = $1 and l.checkpoint = c.id) as "used!",
                  (select count(*) from scans s
                   where s.checkpoint_id = c.id and s.server_class = 'first_entry' and s.day = $2) as "used_today!",
                  (select count(*) from scans s
                   where s.checkpoint_id = c.id
                     and (s.local_outcome = 'rejected_benefit_used' or s.server_class = 'duplicate_entry')) as "repeats!",
                  (select count(*) from scans s
                   where s.checkpoint_id = c.id and s.local_outcome = 'rejected_not_entitled') as "not_entitled!",
                  (select count(*) from scans s where s.checkpoint_id = c.id and s.door_exception) as "exceptions!",
                  (select count(*) from door_accesses a
                   where a.checkpoint_id = c.id and a.revoked_at is null and a.expires_at > now()) as "links!"
           from event_checkpoints c where c.event_id = $1 order by c.position, c.created_at"#,
        event_id,
        today.map(i16::from),
    )
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(|row| DoorLiveCheckpointDto {
        id: row.id,
        name: row.name,
        per_day: row.per_day,
        entitled: row.entitled,
        allowance_total: row.allowance_total,
        used: row.used,
        used_today: today.map(|_| row.used_today),
        repeats: row.repeats,
        not_entitled: row.not_entitled,
        exceptions: row.exceptions,
        links: row.links,
    })
    .collect())
}

/// Who is inside and who is out (ADR 0083): the latest movement of each ticket that entered, in
/// the order every phone uses (time, phone name, exit after entry). In an event of several days
/// (ADR 0091), today's movements only.
async fn reentry(
    pool: &PgPool,
    event_id: Uuid,
    today: Option<u8>,
) -> ApiResult<Option<DoorLiveReentryDto>> {
    let row = sqlx::query!(
        r#"with latest as (
               select distinct on (s.ticket_number, s.ledger_day) s.ticket_number, s.local_outcome
               from scans s join door_devices d on d.id = s.device_id
               where s.event_id = $1 and s.checkpoint_id is null
                 and s.local_outcome in ('admitted', 'readmitted', 'exited')
                 and ($2::int2 is null or s.day = $2)
               order by s.ticket_number, s.ledger_day, s.scanned_at desc, d.name desc,
                        (s.local_outcome = 'exited') desc
           ), entered as (
               select l.local_outcome from latest l
               where exists (select 1 from door_ledger_entries n
                             where n.event_id = $1 and n.ticket_number = l.ticket_number
                               and n.checkpoint = '00000000-0000-0000-0000-000000000000')
           )
           select e.reentry,
                  (select count(*) from entered where local_outcome <> 'exited') as "inside!",
                  (select count(*) from entered where local_outcome = 'exited') as "out!",
                  (select count(*) from scans where event_id = $1 and local_outcome = 'exited'
                     and ($2::int2 is null or day = $2)) as "exits!",
                  (select count(*) from scans where event_id = $1 and server_class = 'reentry'
                     and checkpoint_id is null and ($2::int2 is null or day = $2)) as "returns!"
           from events e where e.id = $1"#,
        event_id,
        today.map(i16::from),
    )
    .fetch_one(pool)
    .await?;
    if !row.reentry && row.exits == 0 {
        return Ok(None);
    }
    Ok(Some(DoorLiveReentryDto {
        allowed: row.reentry,
        // Turned off after some went out: everyone who entered counts as inside again.
        inside: if row.reentry {
            row.inside
        } else {
            row.inside + row.out
        },
        out: if row.reentry { row.out } else { 0 },
        exits: row.exits,
        returns: row.returns,
    }))
}

/// First entries per 5-minute window over the hour ending at `anchor`.
async fn timeline(
    pool: &PgPool,
    event_id: Uuid,
    anchor: OffsetDateTime,
) -> ApiResult<Vec<DoorLiveBucketDto>> {
    Ok(sqlx::query!(
        r#"with bins as (
               select generate_series(
                   date_bin('5 minutes', $2::timestamptz, timestamptz '2000-01-01') - make_interval(mins => 5 * ($3::int - 1)),
                   date_bin('5 minutes', $2::timestamptz, timestamptz '2000-01-01'),
                   interval '5 minutes') as start
           )
           select b.start as "start!", count(s.id) as "entries!"
           from bins b
           left join (door_ledger_entries e join scans s on s.id = e.first_scan_id)
             on e.event_id = $1 and e.checkpoint = '00000000-0000-0000-0000-000000000000'
                and s.scanned_at >= b.start and s.scanned_at < b.start + interval '5 minutes'
           group by b.start order by b.start"#,
        event_id,
        anchor,
        i32::try_from(BUCKETS).unwrap_or(12),
    )
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(|row| DoorLiveBucketDto {
        start: row.start,
        entries: row.entries,
    })
    .collect())
}

/// Entries per door link, with the categories it admits.
async fn doors(pool: &PgPool, event_id: Uuid) -> ApiResult<Vec<DoorLiveDoorDto>> {
    Ok(sqlx::query!(
        r#"select a.id, a.label, (a.revoked_at is not null or a.expires_at <= now()) as "closed!",
                  array(select c.name from door_access_categories dc
                        join ticket_categories c on c.id = dc.category_id
                        where dc.door_access_id = a.id order by c.position, c.name) as "categories!",
                  (select count(*) from door_ledger_entries e join scans s on s.id = e.first_scan_id
                   join door_devices d on d.id = s.device_id
                   where e.event_id = a.event_id and d.door_access_id = a.id) as "entries!"
           -- Doors are the entrance's links; a checkpoint has its own block (ADR 0092).
           from door_accesses a where a.event_id = $1 and a.checkpoint_id is null order by a.created_at"#,
        event_id
    )
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(|row| DoorLiveDoorDto {
        id: row.id,
        label: row.label,
        categories: row.categories,
        closed: row.closed,
        entries: row.entries,
    })
    .collect())
}

/// Box office numbers that entered, and their price (ADR 0069).
async fn box_office(
    pool: &PgPool,
    event_id: Uuid,
    price: Option<i32>,
) -> ApiResult<DoorLiveBoxOfficeDto> {
    let row = sqlx::query!(
        r#"select exists(select 1 from sellers where event_id = $1 and box_office) as "enabled!",
                  count(e.ticket_number) as "sold!",
                  sum(coalesce(tc.price_cents, $2::int4))::bigint as amount,
                  count(e.ticket_number) filter (where coalesce(tc.price_cents, $2::int4) is null) as "unpriced!",
                  count(e.ticket_number) filter (where coalesce(tc.price_cents, $2::int4) = 0) as "courtesies!"
           from entries e
           join seller_assignments sa on sa.event_id = e.event_id and sa.numbers @> e.ticket_number
           join sellers s on s.id = sa.seller_id and s.box_office
           left join category_ranges cr on cr.event_id = e.event_id and cr.numbers @> e.ticket_number
           left join ticket_categories tc on tc.id = cr.category_id
           where e.event_id = $1"#,
        event_id,
        price,
    )
    .fetch_one(pool)
    .await?;
    Ok(DoorLiveBoxOfficeDto {
        enabled: row.enabled,
        sold: row.sold,
        amount_cents: if row.unpriced > 0 {
            None
        } else {
            Some(row.amount.unwrap_or(0))
        },
        courtesies: row.courtesies,
    })
}

/// Names and people on the guest list, and who came in (ADR 0070).
async fn guests(pool: &PgPool, event_id: Uuid) -> ApiResult<DoorLiveGuestsDto> {
    Ok(sqlx::query_as!(
        DoorLiveGuestsDto,
        r#"with arrived as (
               select g.id, g.companions + 1 as size,
                      (select sum(a.people) from guest_arrivals a
                       where a.guest_id = g.id and a.undone_at is null) as people
               from guest_list g where g.event_id = $1
           )
           select count(*) as "guests!",
                  coalesce(sum(size), 0)::bigint as "people!",
                  count(*) filter (where people is not null) as "arrived_guests!",
                  coalesce(sum(least(coalesce(people, 0), size)), 0)::bigint as "arrived_people!"
           from arrived"#,
        event_id
    )
    .fetch_one(pool)
    .await?)
}
