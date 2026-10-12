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
    DoorLiveBoxOfficeDto, DoorLiveBucketDto, DoorLiveCategoryDto, DoorLiveDeviceDto,
    DoorLiveDoorDto, DoorLiveDto, DoorLiveGuestsDto, DoorLiveRefusalsDto,
};
use crate::auth::AuthUser;
use crate::error::ApiResult;
use crate::state::AppState;

/// The curve covers the last hour in 5-minute windows.
const BUCKETS: i64 = 12;

/// `GET /api/events/{id}/door/live`.
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
    .fetch_one(pool)
    .await?;
    let entries = sqlx::query!(
        r#"select count(*) as "count!", min(s.scanned_at) as first, max(s.scanned_at) as last
           from entries e join scans s on s.id = e.first_scan_id where e.event_id = $1"#,
        event_id
    )
    .fetch_one(pool)
    .await?;

    // The last hour; once the event is over, the last hour with entries.
    let anchor = if now > event.ends_at {
        entries.last.unwrap_or(now).min(now)
    } else {
        now
    };
    let timeline = timeline(pool, event_id, anchor).await?;

    let doors = doors(pool, event_id).await?;

    let devices = sqlx::query_as!(
        DoorLiveDeviceDto,
        r#"select d.id, d.name, a.label as door,
                  (select count(*) from entries e join scans s on s.id = e.first_scan_id
                   where e.event_id = d.event_id and s.device_id = d.id) as "entries!",
                  (select count(*) from scans s where s.device_id = d.id) as "scans!",
                  d.last_seen_at, d.last_sync_at, d.pending_scans, d.rehearsed_at,
                  (d.revoked_at is not null or a.revoked_at is not null) as "revoked!"
           from door_devices d join door_accesses a on a.id = d.door_access_id
           where d.event_id = $1 order by d.name, d.created_at"#,
        event_id
    )
    .fetch_all(pool)
    .await?;

    let categories = super::report::by_category(&state, event_id, price)
        .await?
        .into_iter()
        .map(|row| DoorLiveCategoryDto {
            name: row.name,
            color: row.color,
            sold: row.sold,
            entries: row.entries,
        })
        .collect();

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
                  count(*) filter (where door_exception) as "wrong_door_admitted!"
           from scans where event_id = $1"#,
        event_id
    )
    .fetch_one(pool)
    .await?;

    let guests = guests(pool, event_id).await?;

    let box_office = box_office(pool, event_id, price).await?;

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
        generated_at: now,
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
           left join (entries e join scans s on s.id = e.first_scan_id)
             on e.event_id = $1 and s.scanned_at >= b.start and s.scanned_at < b.start + interval '5 minutes'
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
                  (select count(*) from entries e join scans s on s.id = e.first_scan_id
                   join door_devices d on d.id = s.device_id
                   where e.event_id = a.event_id and d.door_access_id = a.id) as "entries!"
           from door_accesses a where a.event_id = $1 order by a.created_at"#,
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
