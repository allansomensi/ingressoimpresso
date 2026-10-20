//! What the admin watches beyond the totals (ADR 0099): the funnel from signup to the door, and
//! the events happening around now with whatever needs a look at their door, so the support acts
//! before anyone complains.

use std::collections::HashMap;

use axum::Json;
use axum::extract::{Query, State};
use serde::Deserialize;
use time::{Duration, OffsetDateTime};
use uuid::Uuid;

use super::admin::require_admin;
use crate::api::{
    AdminFunnelDto, AdminLiveDto, AdminLiveEventDto, EventKind, FunnelStep, FunnelStepDto,
    LiveEventState, LiveProblemDto, LiveProblemKind,
};
use crate::auth::AuthUser;
use crate::error::{ApiResult, bad_request};
use crate::state::AppState;

/// A phone silent this long during the event needs a look.
const STALE_MINUTES: i64 = 10;
/// Reads held on a phone from this many on.
const PENDING_ALERT: i32 = 25;
/// Invalid reads in the last 30 minutes from this many on.
const INVALID_ALERT: i64 = 10;
/// How long before the start a door without phones is a problem.
const NO_DEVICES_BEFORE: Duration = Duration::hours(2);

/// A door phone as the live view needs it.
struct Phone {
    name: String,
    /// Its last sync (or sign of life).
    last: OffsetDateTime,
    pending: Option<i32>,
    /// Invalid reads in the last 30 minutes.
    invalid: i64,
}

impl Phone {
    /// Adds the phone's problems; `true` when it synced lately.
    fn check(
        &self,
        now: OffsetDateTime,
        door_open: bool,
        problems: &mut Vec<LiveProblemDto>,
    ) -> bool {
        let silent = (now - self.last).whole_minutes();
        let online = silent < STALE_MINUTES;
        if !online && door_open {
            problems.push(LiveProblemDto {
                kind: LiveProblemKind::Stale,
                device: Some(self.name.clone()),
                value: Some(silent),
            });
        }
        if let Some(pending) = self.pending.filter(|pending| *pending >= PENDING_ALERT) {
            problems.push(LiveProblemDto {
                kind: LiveProblemKind::Pending,
                device: Some(self.name.clone()),
                value: Some(i64::from(pending)),
            });
        }
        if self.invalid >= INVALID_ALERT {
            problems.push(LiveProblemDto {
                kind: LiveProblemKind::Invalid,
                device: Some(self.name.clone()),
                value: Some(self.invalid),
            });
        }
        online
    }
}

/// `?days=`: the cohort's window.
#[derive(Debug, Deserialize)]
pub struct FunnelQuery {
    #[serde(default)]
    days: Option<i32>,
}

/// `GET /api/admin/funnel?days=`.
pub async fn funnel(
    State(state): State<AppState>,
    user: AuthUser,
    Query(query): Query<FunnelQuery>,
) -> ApiResult<Json<AdminFunnelDto>> {
    require_admin(&user)?;
    if query.days.is_some_and(|days| !(1..=3650).contains(&days)) {
        return Err(bad_request("invalid_days", "days must be 1–3650"));
    }
    let row = sqlx::query!(
        r#"with cohort as (
               select o.id, o.created_at from organizations o
               where $1::int is null or o.created_at > now() - make_interval(days => $1::int)
           ),
           reached as (
               select c.created_at,
                      (select min(e.created_at) from events e where e.organization_id = c.id) as event_at,
                      (select min(d.created_at) from ticket_designs d join events e on e.id = d.event_id
                       where e.organization_id = c.id) as design_at,
                      (select min(b.paid_at) from ticket_batches b join events e on e.id = b.event_id
                       where e.organization_id = c.id and b.status in ('paid', 'refunded')) as batch_at,
                      (select min(b.paid_at) from ticket_batches b join events e on e.id = b.event_id
                       where e.organization_id = c.id and b.status in ('paid', 'refunded')
                         and b.paid_via in ('stripe', 'admin') and b.price_cents > 0) as paid_at,
                      (select min(s.scanned_at) from scans s join events e on e.id = s.event_id
                       where e.organization_id = c.id) as door_at
               from cohort c
           )
           select count(*) as "signup!",
                  count(event_at) as "event!", count(design_at) as "design!", count(batch_at) as "batch!",
                  count(paid_at) as "paid!", count(door_at) as "door!",
                  percentile_cont(0.5) within group (order by extract(epoch from event_at - created_at) / 86400) as "event_days?",
                  percentile_cont(0.5) within group (order by extract(epoch from design_at - created_at) / 86400) as "design_days?",
                  percentile_cont(0.5) within group (order by extract(epoch from batch_at - created_at) / 86400) as "batch_days?",
                  percentile_cont(0.5) within group (order by extract(epoch from paid_at - created_at) / 86400) as "paid_days?",
                  percentile_cont(0.5) within group (order by extract(epoch from door_at - created_at) / 86400) as "door_days?"
           from reached"#,
        query.days,
    )
    .fetch_one(&state.pool)
    .await?;
    let step = |step, organizations, median_days: Option<f64>| FunnelStepDto {
        step,
        organizations,
        // One decimal is plenty for "how many days".
        median_days: median_days.map(|days| (days.max(0.0) * 10.0).round() / 10.0),
    };
    Ok(Json(AdminFunnelDto {
        days: query.days,
        steps: vec![
            step(FunnelStep::Signup, row.signup, Some(0.0)),
            step(FunnelStep::Event, row.event, row.event_days),
            step(FunnelStep::Design, row.design, row.design_days),
            step(FunnelStep::Batch, row.batch, row.batch_days),
            step(FunnelStep::Paid, row.paid, row.paid_days),
            step(FunnelStep::Door, row.door, row.door_days),
        ],
    }))
}

/// The door phones of `ids` (not revoked), by event.
async fn phones_of(state: &AppState, ids: &[Uuid]) -> ApiResult<HashMap<Uuid, Vec<Phone>>> {
    let devices = sqlx::query!(
        r#"select d.event_id, d.name, d.created_at, d.last_seen_at, d.last_sync_at, d.pending_scans,
                  (select count(*) from scans s
                   where s.device_id = d.id and s.received_at > now() - interval '30 minutes'
                     and s.local_outcome in ('rejected_invalid', 'rejected_other_event')) as "invalid!"
           from door_devices d
           where d.event_id = any($1) and d.revoked_at is null
           order by d.name"#,
        ids,
    )
    .fetch_all(&state.pool)
    .await?;
    let mut by_event: HashMap<Uuid, Vec<Phone>> = HashMap::new();
    for device in devices {
        by_event.entry(device.event_id).or_default().push(Phone {
            name: device.name,
            last: device
                .last_sync_at
                .or(device.last_seen_at)
                .unwrap_or(device.created_at),
            pending: device.pending_scans,
            invalid: device.invalid,
        });
    }
    Ok(by_event)
}

/// `GET /api/admin/live`: events from 2 hours ago to 6 hours ahead, with their door's problems.
pub async fn live(State(state): State<AppState>, user: AuthUser) -> ApiResult<Json<AdminLiveDto>> {
    require_admin(&user)?;
    let now = OffsetDateTime::now_utc();
    let events = sqlx::query!(
        r#"select e.id, e.name, e.starts_at, e.ends_at, e.kind, o.id as organization_id, o.name as organization,
                  (select coalesce(sum(upper(b.numbers) - lower(b.numbers)), 0) from ticket_batches b
                   where b.event_id = e.id and b.status = 'paid')::bigint as "paid!",
                  (select count(*) from entries en where en.event_id = e.id) as "entries!"
           from events e join organizations o on o.id = e.organization_id
           where e.status = 'active' and e.canceled_at is null
             and e.starts_at < now() + interval '6 hours' and e.ends_at > now() - interval '2 hours'
           order by e.starts_at
           limit 200"#
    )
    .fetch_all(&state.pool)
    .await?;
    let ids: Vec<Uuid> = events.iter().map(|event| event.id).collect();
    let mut by_event = phones_of(&state, &ids).await?;
    let mut out: Vec<AdminLiveEventDto> = events
        .into_iter()
        .map(|event| {
            let state = if now < event.starts_at {
                LiveEventState::Upcoming
            } else if now <= event.ends_at {
                LiveEventState::Live
            } else {
                LiveEventState::Ended
            };
            let phones = by_event.remove(&event.id).unwrap_or_default();
            // The door works from an hour before the start to an hour after the end.
            let door_open = now > event.starts_at - Duration::hours(1)
                && now < event.ends_at + Duration::hours(1);
            let mut problems = Vec::new();
            let mut online = 0;
            for phone in &phones {
                online += i64::from(phone.check(now, door_open, &mut problems));
            }
            if phones.is_empty()
                && event.paid > 0
                && now > event.starts_at - NO_DEVICES_BEFORE
                && now < event.ends_at
            {
                problems.insert(
                    0,
                    LiveProblemDto {
                        kind: LiveProblemKind::NoDevices,
                        device: None,
                        value: None,
                    },
                );
            }
            AdminLiveEventDto {
                id: event.id,
                name: event.name,
                organization_id: event.organization_id,
                organization: event.organization,
                starts_at: event.starts_at,
                ends_at: event.ends_at,
                state,
                kind: EventKind::from_db(&event.kind).unwrap_or_default(),
                paid_tickets: event.paid,
                entries: event.entries,
                devices: i64::try_from(phones.len()).unwrap_or(i64::MAX),
                devices_online: online,
                problems,
            }
        })
        .collect();
    // Problems first; then what is happening, then what comes, then what ended.
    out.sort_by_key(|event| {
        (
            event.problems.is_empty(),
            match event.state {
                LiveEventState::Live => 0,
                LiveEventState::Upcoming => 1,
                LiveEventState::Ended => 2,
            },
            event.starts_at,
        )
    });
    Ok(Json(AdminLiveDto {
        events: out,
        generated_at: now,
    }))
}
