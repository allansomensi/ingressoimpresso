//! Days of an event of several days (ADR 0091): checking them, storing them, the day the door is
//! on and moving them with the event.
//!
//! The panel's rules mirror these (`apps/web/src/lib/event-days.ts`): the day the door is on is
//! the same on the server, on the phone and in the panel.

use std::collections::HashMap;

use sqlx::{PgPool, Postgres, Transaction};
use time::{Duration, OffsetDateTime, UtcOffset};
use uuid::Uuid;

use crate::api::{DayRule, EventDayBody, EventDayDto};
use crate::error::{ApiResult, bad_request};

/// Most days of one event.
pub const MAX_DAYS: usize = 31;
/// Longest day (a festival night that goes on to the next morning fits).
pub const MAX_DAY: Duration = Duration::hours(48);

/// One day: start and end.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Day {
    /// Start.
    pub starts_at: OffsetDateTime,
    /// End.
    pub ends_at: OffsetDateTime,
}

/// Checks the days sent by the panel: none (an event of one day) or 2 to [`MAX_DAYS`], each with
/// its end after its start and at most [`MAX_DAY`] long, in order and without overlapping.
///
/// # Errors
///
/// `invalid_days` with what is wrong.
pub fn validate(days: &[EventDayBody]) -> ApiResult<Vec<Day>> {
    if days.is_empty() {
        return Ok(Vec::new());
    }
    if days.len() < 2 {
        return Err(bad_request(
            "invalid_days",
            "an event of several days has two days or more",
        ));
    }
    if days.len() > MAX_DAYS {
        return Err(bad_request(
            "invalid_days",
            format!("an event has at most {MAX_DAYS} days"),
        ));
    }
    let mut sorted: Vec<Day> = days
        .iter()
        .map(|day| Day {
            starts_at: day.starts_at,
            ends_at: day.ends_at,
        })
        .collect();
    sorted.sort_by_key(|day| day.starts_at);
    for day in &sorted {
        if day.ends_at <= day.starts_at || day.ends_at - day.starts_at > MAX_DAY {
            return Err(bad_request(
                "invalid_days",
                "each day ends after it starts, within 48 hours",
            ));
        }
    }
    for pair in sorted.windows(2) {
        if let [before, after] = pair
            && after.starts_at < before.ends_at
        {
            return Err(bad_request("invalid_days", "days must not overlap"));
        }
    }
    Ok(sorted)
}

/// The days of an event, in order, with the event's offset.
pub async fn of_event(
    pool: &PgPool,
    event_id: Uuid,
    offset: UtcOffset,
) -> ApiResult<Vec<EventDayDto>> {
    Ok(
        of_events(pool, &[event_id], &HashMap::from([(event_id, offset)]))
            .await?
            .remove(&event_id)
            .unwrap_or_default(),
    )
}

/// The days of several events (one query), each with its own offset.
pub async fn of_events<S: std::hash::BuildHasher>(
    pool: &PgPool,
    event_ids: &[Uuid],
    offsets: &HashMap<Uuid, UtcOffset, S>,
) -> ApiResult<HashMap<Uuid, Vec<EventDayDto>>> {
    let mut days: HashMap<Uuid, Vec<EventDayDto>> = HashMap::new();
    if event_ids.is_empty() {
        return Ok(days);
    }
    for row in sqlx::query!(
        "select event_id, position, starts_at, ends_at from event_days where event_id = any($1) order by event_id, position",
        event_ids
    )
    .fetch_all(pool)
    .await?
    {
        let offset = offsets.get(&row.event_id).copied().unwrap_or(UtcOffset::UTC);
        days.entry(row.event_id).or_default().push(EventDayDto {
            position: u8::try_from(row.position).unwrap_or(u8::MAX),
            starts_at: row.starts_at.to_offset(offset),
            ends_at: row.ends_at.to_offset(offset),
        });
    }
    Ok(days)
}

/// The stored days of an event, in order.
pub async fn load(tx: &mut Transaction<'_, Postgres>, event_id: Uuid) -> ApiResult<Vec<Day>> {
    Ok(sqlx::query_as!(
        Day,
        "select starts_at, ends_at from event_days where event_id = $1 order by position",
        event_id
    )
    .fetch_all(&mut **tx)
    .await?)
}

/// Replaces the days of an event. A day the door already read tickets on cannot go away (the
/// number of days never drops below the latest day with scans), so the entries keep their day.
/// Category rules lose the days that no longer exist; a rule left without days counts every day.
///
/// # Errors
///
/// `day_has_entries` (409) when a day with scans would go away.
pub async fn replace(
    tx: &mut Transaction<'_, Postgres>,
    event_id: Uuid,
    days: &[Day],
) -> ApiResult<()> {
    let count = i16::try_from(days.len()).unwrap_or(i16::MAX);
    let scanned = sqlx::query_scalar!("select max(day) from scans where event_id = $1", event_id)
        .fetch_one(&mut **tx)
        .await?;
    if scanned.is_some_and(|day| day > count) {
        return Err(crate::error::ApiError::Conflict(
            "day_has_entries",
            "the door already read tickets on a day that would go away".to_owned(),
        ));
    }
    sqlx::query!("delete from event_days where event_id = $1", event_id)
        .execute(&mut **tx)
        .await?;
    let starts: Vec<OffsetDateTime> = days.iter().map(|day| day.starts_at).collect();
    let ends: Vec<OffsetDateTime> = days.iter().map(|day| day.ends_at).collect();
    sqlx::query!(
        r#"insert into event_days (event_id, position, starts_at, ends_at)
           select $1, ordinality::int2, s, e
           from unnest($2::timestamptz[], $3::timestamptz[]) with ordinality as d(s, e, ordinality)"#,
        event_id,
        &starts,
        &ends,
    )
    .execute(&mut **tx)
    .await?;
    // Rules naming a day that no longer exists drop it; with none left, every day.
    sqlx::query!(
        r#"update ticket_categories
           set valid_days = array(select d from unnest(valid_days) as d where d <= $2 order by d),
               day_rule = case when day_rule = 'days'
                                and not exists (select 1 from unnest(valid_days) as d where d <= $2)
                               then 'every' else day_rule end
           where event_id = $1 and day_rule = 'days'"#,
        event_id,
        count,
    )
    .execute(&mut **tx)
    .await?;
    sqlx::query!(
        "update ticket_categories set valid_days = '{}' where event_id = $1 and day_rule = 'every' and cardinality(valid_days) > 0",
        event_id
    )
    .execute(&mut **tx)
    .await?;
    Ok(())
}

/// Moves every day of an event by `delta` (a copy at another date, a postponement).
pub async fn shift(
    tx: &mut Transaction<'_, Postgres>,
    from_event: Uuid,
    to_event: Uuid,
    delta: Duration,
) -> ApiResult<()> {
    let seconds = delta.as_seconds_f64();
    sqlx::query!(
        r#"insert into event_days (event_id, position, starts_at, ends_at)
           select $2, position, starts_at + make_interval(secs => $3), ends_at + make_interval(secs => $3)
           from event_days where event_id = $1
           on conflict (event_id, position) do update
               set starts_at = excluded.starts_at, ends_at = excluded.ends_at"#,
        from_event,
        to_event,
        seconds,
    )
    .execute(&mut **tx)
    .await?;
    Ok(())
}

/// The day the door is on at `now` (1 for the first), or `None` for an event of one day. The
/// border between two days is halfway between the end of one and the start of the next (a night
/// that goes past midnight stays on its day); before the first day it is the first, after the
/// last the last.
pub fn current(days: &[Day], now: OffsetDateTime) -> Option<u8> {
    if days.len() < 2 {
        return None;
    }
    for (index, pair) in days.windows(2).enumerate() {
        if let [day, next] = pair {
            let border = day.ends_at + (next.starts_at - day.ends_at) / 2;
            if now < border {
                return u8::try_from(index + 1).ok();
            }
        }
    }
    u8::try_from(days.len()).ok()
}

/// Whether a category's tickets are valid on `day` (1 for the first).
pub fn valid_on(rule: DayRule, valid_days: &[i16], day: u8) -> bool {
    match rule {
        DayRule::Every | DayRule::AnyOne => true,
        DayRule::Days => valid_days.iter().any(|valid| *valid == i16::from(day)),
    }
}

/// Checks a category's rule against the event's days: the chosen days exist, without repeats.
///
/// # Errors
///
/// `invalid_day_rule` when the days do not fit the rule.
pub fn validate_rule(rule: DayRule, valid_days: &[u8], days: usize) -> ApiResult<Vec<i16>> {
    let invalid = |message: &str| bad_request("invalid_day_rule", message.to_owned());
    match rule {
        DayRule::Every | DayRule::AnyOne => Ok(Vec::new()),
        DayRule::Days => {
            if days < 2 {
                return Err(invalid("the event has no days to choose from"));
            }
            let mut chosen: Vec<i16> = valid_days.iter().map(|day| i16::from(*day)).collect();
            chosen.sort_unstable();
            chosen.dedup();
            let last = i16::try_from(days).unwrap_or(i16::MAX);
            if chosen.is_empty() || chosen.iter().any(|day| *day < 1 || *day > last) {
                return Err(invalid("choose one or more days of the event"));
            }
            Ok(chosen)
        }
    }
}

/// The rule as the API shows it.
pub fn rule_of(rule: &str, valid_days: &[i16]) -> (DayRule, Vec<u8>) {
    let rule = DayRule::from_db(rule).unwrap_or_default();
    let days = if rule == DayRule::Days {
        valid_days
            .iter()
            .filter_map(|day| u8::try_from(*day).ok())
            .collect()
    } else {
        Vec::new()
    };
    (rule, days)
}

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used, reason = "tests")]

    use time::macros::datetime;

    use super::*;

    fn weekend() -> Vec<Day> {
        vec![
            Day {
                starts_at: datetime!(2026-11-21 18:00 -3),
                ends_at: datetime!(2026-11-22 01:00 -3),
            },
            Day {
                starts_at: datetime!(2026-11-22 12:00 -3),
                ends_at: datetime!(2026-11-22 20:00 -3),
            },
        ]
    }

    #[test]
    fn the_border_is_halfway_between_days() {
        let days = weekend();
        // Before the first day: the first.
        assert_eq!(current(&days, datetime!(2026-11-20 10:00 -3)), Some(1));
        // After midnight, the party of Saturday goes on.
        assert_eq!(current(&days, datetime!(2026-11-22 00:30 -3)), Some(1));
        // Halfway between 01:00 and 12:00 is 06:30.
        assert_eq!(current(&days, datetime!(2026-11-22 06:29 -3)), Some(1));
        assert_eq!(current(&days, datetime!(2026-11-22 06:30 -3)), Some(2));
        assert_eq!(current(&days, datetime!(2026-11-23 10:00 -3)), Some(2));
        assert_eq!(current(&days[..1], datetime!(2026-11-22 10:00 -3)), None);
    }

    #[test]
    fn days_are_sorted_and_must_not_overlap() {
        let body = |start, end| EventDayBody {
            starts_at: start,
            ends_at: end,
        };
        let sorted = validate(&[
            body(
                datetime!(2026-11-22 12:00 -3),
                datetime!(2026-11-22 20:00 -3),
            ),
            body(
                datetime!(2026-11-21 18:00 -3),
                datetime!(2026-11-21 23:00 -3),
            ),
        ])
        .unwrap();
        assert_eq!(
            sorted.first().map(|day| day.starts_at),
            Some(datetime!(2026-11-21 18:00 -3))
        );
        assert!(
            validate(&[
                body(
                    datetime!(2026-11-21 18:00 -3),
                    datetime!(2026-11-22 13:00 -3)
                ),
                body(
                    datetime!(2026-11-22 12:00 -3),
                    datetime!(2026-11-22 20:00 -3)
                ),
            ])
            .is_err()
        );
        assert!(
            validate(&[body(
                datetime!(2026-11-21 18:00 -3),
                datetime!(2026-11-21 23:00 -3)
            )])
            .is_err()
        );
        assert!(
            validate(&[
                body(
                    datetime!(2026-11-21 18:00 -3),
                    datetime!(2026-11-24 18:00 -3)
                ),
                body(
                    datetime!(2026-11-25 12:00 -3),
                    datetime!(2026-11-25 20:00 -3)
                ),
            ])
            .is_err()
        );
        assert_eq!(validate(&[]).unwrap().len(), 0);
    }

    #[test]
    fn rules_check_their_days() {
        assert_eq!(
            validate_rule(DayRule::Days, &[2, 1, 2], 2).unwrap(),
            vec![1, 2]
        );
        assert!(validate_rule(DayRule::Days, &[3], 2).is_err());
        assert!(validate_rule(DayRule::Days, &[], 2).is_err());
        assert!(validate_rule(DayRule::Days, &[1], 0).is_err());
        assert_eq!(validate_rule(DayRule::AnyOne, &[1], 2).unwrap().len(), 0);
        assert!(valid_on(DayRule::Days, &[2], 2));
        assert!(!valid_on(DayRule::Days, &[2], 1));
        assert!(valid_on(DayRule::Every, &[], 1));
    }
}
