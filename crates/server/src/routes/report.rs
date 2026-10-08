//! Seller report (phase 5): what each seller must settle and what happened at the door.
//!
//! A ticket has no row of its own (ADR 0011): its state comes from ranges. The report expands
//! the paid batches into numbers (at most a few thousand per event) and joins each number with
//! its seller, its void, its entry and its scans.

use std::collections::HashMap;

use axum::Json;
use axum::extract::{Path, State};
use time::OffsetDateTime;
use uuid::Uuid;

use super::authorize_event;
use crate::api::{EventReportDto, ReportDeviceDto, ReportRowDto};
use crate::auth::AuthUser;
use crate::error::ApiResult;
use crate::state::AppState;

/// Counts of one line before the derived columns.
#[derive(Debug, Default, Clone, Copy)]
struct Counts {
    tickets: i64,
    unsold: i64,
    lost: i64,
    revoked: i64,
    entries: i64,
    offline_duplicates: i64,
    blocked_copies: i64,
    void_entries: i64,
}

impl Counts {
    fn add(&mut self, other: Self) {
        self.tickets += other.tickets;
        self.unsold += other.unsold;
        self.lost += other.lost;
        self.revoked += other.revoked;
        self.entries += other.entries;
        self.offline_duplicates += other.offline_duplicates;
        self.blocked_copies += other.blocked_copies;
        self.void_entries += other.void_entries;
    }

    fn row(self, seller: Option<(Uuid, String)>, price_cents: Option<i32>) -> ReportRowDto {
        let declared_sold = self.tickets - self.unsold - self.lost;
        let (seller_id, seller) = seller.unzip();
        ReportRowDto {
            seller_id,
            seller,
            tickets: self.tickets,
            unsold: self.unsold,
            lost: self.lost,
            revoked: self.revoked,
            declared_sold,
            entries: self.entries,
            offline_duplicates: self.offline_duplicates,
            blocked_copies: self.blocked_copies,
            void_entries: self.void_entries,
            amount_due_cents: price_cents.map(|price| declared_sold * i64::from(price)),
        }
    }
}

/// `GET /api/events/{id}/report`.
pub async fn report(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
) -> ApiResult<Json<EventReportDto>> {
    let event = authorize_event(&state.pool, &user, event_id).await?;
    let price = event.ticket_price_cents;

    let mut by_seller = counts_by_seller(&state, event_id).await?;

    let sellers = sqlx::query!(
        "select id, name from sellers where event_id = $1 order by name",
        event_id
    )
    .fetch_all(&state.pool)
    .await?;
    let mut totals = Counts::default();
    let mut rows = Vec::with_capacity(sellers.len());
    for seller in sellers {
        let counts = by_seller.remove(&Some(seller.id)).unwrap_or_default();
        totals.add(counts);
        rows.push(counts.row(Some((seller.id, seller.name)), price));
    }
    let unassigned = by_seller.remove(&None).unwrap_or_default();
    totals.add(unassigned);

    let devices = sqlx::query_as!(
        ReportDeviceDto,
        r#"select d.name,
                  count(s.id) as "scans!",
                  count(*) filter (where s.server_class = 'first_entry') as "first_entries!",
                  count(*) filter (where s.server_class = 'duplicate_entry' and not s.confirmed_online) as "offline_duplicates!",
                  count(*) filter (where s.local_outcome = 'rejected_used'
                                     or (s.server_class = 'duplicate_entry' and s.confirmed_online)) as "blocked_copies!",
                  count(*) filter (where s.local_outcome in ('rejected_invalid', 'rejected_other_event')) as "invalid!"
           from door_devices d left join scans s on s.device_id = d.id
           where d.event_id = $1
           group by d.id, d.name
           order by d.name"#,
        event_id
    )
    .fetch_all(&state.pool)
    .await?;
    let rejected = sqlx::query!(
        r#"select count(*) filter (where local_outcome = 'rejected_invalid') as "invalid!",
                  count(*) filter (where local_outcome = 'rejected_other_event') as "other_event!"
           from scans where event_id = $1"#,
        event_id
    )
    .fetch_one(&state.pool)
    .await?;

    Ok(Json(EventReportDto {
        ticket_price_cents: price,
        sellers: rows,
        unassigned: unassigned.row(None, price),
        totals: totals.row(None, price),
        devices,
        invalid_scans: rejected.invalid,
        other_event_scans: rejected.other_event,
        generated_at: OffsetDateTime::now_utc(),
    }))
}

/// Counts per seller id (`None`: paid tickets without a seller).
async fn counts_by_seller(
    state: &AppState,
    event_id: Uuid,
) -> ApiResult<HashMap<Option<Uuid>, Counts>> {
    let lines = sqlx::query!(
        r#"with issued as (
               select n as number
               from ticket_batches b, generate_series(lower(b.numbers), upper(b.numbers) - 1) as n
               where b.event_id = $1 and b.status = 'paid'
           ),
           voided as (
               select distinct on (i.number) i.number, v.reason
               from issued i join ticket_voids v
                 on v.event_id = $1 and v.undone_at is null and v.numbers @> i.number
               order by i.number, v.created_at
           ),
           scanned as (
               select s.ticket_number as number,
                      count(*) filter (where s.server_class = 'duplicate_entry' and not s.confirmed_online) as offline_duplicates,
                      count(*) filter (where s.local_outcome = 'rejected_used'
                                         or (s.server_class = 'duplicate_entry' and s.confirmed_online)) as blocked_copies,
                      count(*) filter (where s.server_class = 'void_entry') as void_entries
               from scans s where s.event_id = $1 and s.ticket_number is not null
               group by s.ticket_number
           )
           select a.seller_id as "seller_id?",
                  count(*) as "tickets!",
                  count(*) filter (where v.reason = 'unsold') as "unsold!",
                  count(*) filter (where v.reason = 'lost') as "lost!",
                  count(*) filter (where v.reason = 'revoked') as "revoked!",
                  count(e.ticket_number) as "entries!",
                  coalesce(sum(c.offline_duplicates), 0)::bigint as "offline_duplicates!",
                  coalesce(sum(c.blocked_copies), 0)::bigint as "blocked_copies!",
                  coalesce(sum(c.void_entries), 0)::bigint as "void_entries!"
           from issued i
           left join seller_assignments a on a.event_id = $1 and a.numbers @> i.number
           left join voided v on v.number = i.number
           left join entries e on e.event_id = $1 and e.ticket_number = i.number
           left join scanned c on c.number = i.number
           group by a.seller_id"#,
        event_id,
    )
    .fetch_all(&state.pool)
    .await?;
    Ok(lines
        .into_iter()
        .map(|line| {
            (
                line.seller_id,
                Counts {
                    tickets: line.tickets,
                    unsold: line.unsold,
                    lost: line.lost,
                    revoked: line.revoked,
                    entries: line.entries,
                    offline_duplicates: line.offline_duplicates,
                    blocked_copies: line.blocked_copies,
                    void_entries: line.void_entries,
                },
            )
        })
        .collect())
}
