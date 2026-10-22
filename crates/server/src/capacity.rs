//! The venue's capacity (ADR 0110): who is in now against the limit the organizer set, for the
//! panel's live view, and the organization's warnings when it gets close and when it is full.
//!
//! "In" is what the door phones count too: tickets that entered (today, in an event of several
//! days) and, with exit and return, only those whose latest movement is an entry; plus the guests
//! of the list who arrived. A checkpoint's uses and the credentials (ADR 0111) never count.

use time::OffsetDateTime;
use uuid::Uuid;

use crate::api::{DoorLiveCapacityDto, NotificationKind};
use crate::error::ApiResult;
use crate::event_days::{self, Day};
use crate::routes::announcements::notify_organization;
use crate::state::AppState;

/// People in the venue now, by the door's rules.
///
/// # Errors
///
/// Database errors.
pub async fn occupancy(pool: &sqlx::PgPool, event_id: Uuid, days: &[Day]) -> ApiResult<i64> {
    let today = event_days::current(days, OffsetDateTime::now_utc());
    let tickets = sqlx::query_scalar!(
        r#"with latest as (
               select distinct on (s.ticket_number) s.ticket_number, s.local_outcome
               from scans s join door_devices d on d.id = s.device_id
               where s.event_id = $1 and s.checkpoint_id is null
                 and s.local_outcome in ('admitted', 'readmitted', 'exited')
                 and ($2::int2 is null or s.day = $2)
               order by s.ticket_number, s.scanned_at desc, d.name desc,
                        (s.local_outcome = 'exited') desc
           )
           select count(*) as "count!" from latest l, events e
           where e.id = $1 and (not e.reentry or l.local_outcome <> 'exited')
             and exists (select 1 from door_ledger_entries n
                         where n.event_id = $1 and n.ticket_number = l.ticket_number
                           and n.checkpoint = '00000000-0000-0000-0000-000000000000')"#,
        event_id,
        today.map(i16::from),
    )
    .fetch_one(pool)
    .await?;
    let arrivals = sqlx::query!(
        r#"select arrived_at, people from guest_arrivals
           where event_id = $1 and undone_at is null"#,
        event_id
    )
    .fetch_all(pool)
    .await?;
    let guests: i64 = arrivals
        .iter()
        .filter(|arrival| today.is_none() || event_days::current(days, arrival.arrived_at) == today)
        .map(|arrival| i64::from(arrival.people))
        .sum();
    Ok(tickets + guests)
}

/// The capacity of an event for the live view; `None` without a limit.
///
/// # Errors
///
/// Database errors.
pub async fn live(
    pool: &sqlx::PgPool,
    event_id: Uuid,
    days: &[Day],
) -> ApiResult<Option<DoorLiveCapacityDto>> {
    let row = sqlx::query!(
        "select capacity, capacity_warn_percent from events where id = $1",
        event_id
    )
    .fetch_one(pool)
    .await?;
    let Some(limit) = row.capacity else {
        return Ok(None);
    };
    let occupied = occupancy(pool, event_id, days).await?;
    Ok(Some(DoorLiveCapacityDto {
        limit,
        warn_percent: i32::from(row.capacity_warn_percent),
        occupied,
        left: (i64::from(limit) - occupied).max(0),
    }))
}

/// How full the venue is: 0 below the warning, 1 close to full, 2 full.
pub fn level(occupied: i64, limit: i32, warn_percent: i16) -> i16 {
    let limit = i64::from(limit);
    if occupied >= limit {
        return 2;
    }
    i16::from(occupied * 100 >= limit * i64::from(warn_percent))
}

/// After the door recorded entries: tells the organization once when the venue gets close to
/// full and once when it is full. Never fails its caller.
pub async fn check(state: &AppState, event_id: Uuid) {
    if let Err(error) = notify(state, event_id).await {
        tracing::error!(?error, %event_id, "capacity not checked");
    }
}

async fn notify(state: &AppState, event_id: Uuid) -> ApiResult<()> {
    let Some(row) = sqlx::query!(
        r#"select organization_id, name, capacity as "capacity!", capacity_warn_percent, capacity_alerted,
                  capacity_alerted_day
           from events where id = $1 and capacity is not null"#,
        event_id
    )
    .fetch_optional(&state.pool)
    .await?
    else {
        return Ok(());
    };
    let days: Vec<Day> = event_days::of_event(&state.pool, event_id, time::UtcOffset::UTC)
        .await?
        .iter()
        .map(|day| Day {
            starts_at: day.starts_at,
            ends_at: day.ends_at,
        })
        .collect();
    // Each day of a several-day event fills on its own: its warnings start over.
    let today = event_days::current(&days, OffsetDateTime::now_utc()).map(i16::from);
    let alerted = if row.capacity_alerted_day == today {
        row.capacity_alerted
    } else {
        0
    };
    let occupied = occupancy(&state.pool, event_id, &days).await?;
    let level = level(occupied, row.capacity, row.capacity_warn_percent);
    if level <= alerted {
        return Ok(());
    }
    let mut tx = state.pool.begin().await?;
    // One warning per level and day, whichever upload gets here first.
    let claimed = sqlx::query!(
        r#"update events set capacity_alerted = $2, capacity_alerted_day = $3
           where id = $1
             and (capacity_alerted < $2 or capacity_alerted_day is distinct from $3)"#,
        event_id,
        level,
        today,
    )
    .execute(&mut *tx)
    .await?
    .rows_affected();
    if claimed == 0 {
        return Ok(());
    }
    notify_organization(
        &mut *tx,
        row.organization_id,
        if level == 2 {
            NotificationKind::CapacityFull
        } else {
            NotificationKind::CapacityNear
        },
        serde_json::json!({
            "eventId": event_id,
            "eventName": row.name,
            "capacity": row.capacity,
            "occupied": occupied,
        }),
    )
    .await?;
    tx.commit().await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::level;

    #[test]
    fn levels_follow_the_warning_and_the_limit() {
        assert_eq!(level(0, 100, 90), 0);
        assert_eq!(level(89, 100, 90), 0);
        assert_eq!(level(90, 100, 90), 1);
        assert_eq!(level(99, 100, 90), 1);
        assert_eq!(level(100, 100, 90), 2);
        assert_eq!(level(130, 100, 90), 2);
    }
}
