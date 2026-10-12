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

use super::{EventRow, authorize_event};
use crate::api::{EventReportDto, ReportCategoryDto, ReportDeviceDto, ReportRowDto};
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
    received_cents: i64,
    marked_sold: i64,
    /// Reserved and not sold (ADR 0072).
    reserved: i64,
    /// Declared sold numbers × their price (the category's, else the event's), ADR 0056.
    due_cents: i64,
    /// Declared sold numbers without any price: the amount due cannot be known.
    unpriced: i64,
    /// Sold: tickets − unsold − lost, or the entries of a box office (ADR 0069).
    declared_sold: i64,
    /// Entered numbers × their price, and how many entered without one (box office).
    entered_due_cents: i64,
    entered_unpriced: i64,
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
        self.received_cents += other.received_cents;
        self.marked_sold += other.marked_sold;
        self.reserved += other.reserved;
        self.due_cents += other.due_cents;
        self.unpriced += other.unpriced;
        self.declared_sold += other.declared_sold;
        self.entered_due_cents += other.entered_due_cents;
        self.entered_unpriced += other.entered_unpriced;
    }

    /// A box office sells at the door (ADR 0069): what entered is what was sold, and what it owes
    /// is the price of what entered, whatever it gave back.
    fn as_box_office(mut self) -> Self {
        self.declared_sold = self.entries;
        self.due_cents = self.entered_due_cents;
        self.unpriced = self.entered_unpriced;
        self
    }

    /// A report line. `owed`: a seller answers for these tickets; unassigned ones have no
    /// balance.
    fn row(
        self,
        seller: Option<(Uuid, String)>,
        priced: bool,
        owed: bool,
        box_office: bool,
    ) -> ReportRowDto {
        let declared_sold = self.declared_sold;
        let amount_due_cents = (priced && self.unpriced == 0).then_some(self.due_cents);
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
            amount_due_cents,
            received_cents: self.received_cents,
            balance_cents: amount_due_cents
                .filter(|_| owed)
                .map(|due| due - self.received_cents),
            marked_sold: self.marked_sold,
            reserved: self.reserved,
            box_office,
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
    Ok(Json(build(&state, &event).await?))
}

/// The report of an event the caller may see (also the base of the accountability, ADR 0058).
pub(crate) async fn build(state: &AppState, event: &EventRow) -> ApiResult<EventReportDto> {
    let event_id = event.id;
    let price = event.ticket_price_cents;
    // Amounts exist when the event or one of its categories has a price.
    let priced = price.is_some()
        || sqlx::query_scalar!(
            r#"select exists(select 1 from ticket_categories where event_id = $1 and price_cents is not null) as "priced!""#,
            event_id
        )
        .fetch_one(&state.pool)
        .await?;

    let mut by_seller = counts_by_seller(state, event_id, price).await?;

    let sellers = sqlx::query!(
        "select id, name, box_office from sellers where event_id = $1 order by name",
        event_id
    )
    .fetch_all(&state.pool)
    .await?;
    let received: HashMap<Uuid, i64> = sqlx::query!(
        r#"select seller_id, sum(amount_cents)::bigint as "received!"
           from seller_payments where event_id = $1 group by seller_id"#,
        event_id
    )
    .fetch_all(&state.pool)
    .await?
    .into_iter()
    .map(|row| (row.seller_id, row.received))
    .collect();
    let mut totals = Counts::default();
    let mut owed = Counts::default();
    let mut rows = Vec::with_capacity(sellers.len());
    for seller in sellers {
        let mut counts = by_seller.remove(&Some(seller.id)).unwrap_or_default();
        if seller.box_office {
            counts = counts.as_box_office();
        }
        counts.received_cents = received.get(&seller.id).copied().unwrap_or_default();
        totals.add(counts);
        owed.add(counts);
        rows.push(counts.row(
            Some((seller.id, seller.name)),
            priced,
            true,
            seller.box_office,
        ));
    }
    let unassigned = by_seller.remove(&None).unwrap_or_default();
    totals.add(unassigned);
    // The total balance is what sellers still owe (net): unassigned tickets are nobody's debt.
    let mut totals_row = totals.row(None, priced, false, false);
    totals_row.balance_cents = owed.row(None, priced, true, false).balance_cents;

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

    Ok(EventReportDto {
        ticket_price_cents: price,
        sellers: rows,
        unassigned: unassigned.row(None, priced, false, false),
        categories: by_category(state, event_id, price).await?,
        totals: totals_row,
        devices,
        invalid_scans: rejected.invalid,
        other_event_scans: rejected.other_event,
        generated_at: OffsetDateTime::now_utc(),
    })
}

/// Counts per seller id (`None`: paid tickets without a seller).
async fn counts_by_seller(
    state: &AppState,
    event_id: Uuid,
    price: Option<i32>,
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
                  coalesce(sum(c.void_entries), 0)::bigint as "void_entries!",
                  count(ts.ticket_number) filter (where v.number is null) as "marked_sold!",
                  count(rr.ticket_number) filter (where v.number is null and ts.ticket_number is null) as "reserved!",
                  coalesce(sum(coalesce(tc.price_cents, $2::int4))
                           filter (where v.reason is distinct from 'unsold' and v.reason is distinct from 'lost'), 0)::bigint as "due_cents!",
                  count(*) filter (where v.reason is distinct from 'unsold' and v.reason is distinct from 'lost'
                                     and coalesce(tc.price_cents, $2::int4) is null) as "unpriced!",
                  coalesce(sum(coalesce(tc.price_cents, $2::int4))
                           filter (where e.ticket_number is not null), 0)::bigint as "entered_due_cents!",
                  count(*) filter (where e.ticket_number is not null
                                     and coalesce(tc.price_cents, $2::int4) is null) as "entered_unpriced!"
           from issued i
           left join seller_assignments a on a.event_id = $1 and a.numbers @> i.number
           left join voided v on v.number = i.number
           left join entries e on e.event_id = $1 and e.ticket_number = i.number
           left join scanned c on c.number = i.number
           left join ticket_sales ts on ts.event_id = $1 and ts.ticket_number = i.number
                                    and ts.seller_id = a.seller_id
           left join ticket_reservations rr on rr.event_id = $1 and rr.ticket_number = i.number
                                           and rr.seller_id = a.seller_id and rr.expires_at > now()
           left join category_ranges cr on cr.event_id = $1 and cr.numbers @> i.number
           left join ticket_categories tc on tc.id = cr.category_id
           group by a.seller_id"#,
        event_id,
        price,
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
                    received_cents: 0,
                    marked_sold: line.marked_sold,
                    reserved: line.reserved,
                    due_cents: line.due_cents,
                    unpriced: line.unpriced,
                    declared_sold: line.tickets - line.unsold - line.lost,
                    entered_due_cents: line.entered_due_cents,
                    entered_unpriced: line.entered_unpriced,
                },
            )
        })
        .collect())
}

/// Paid tickets by category (ADR 0056): how many, declared sold, entries and the amount at the
/// category's price. Empty when the event has no categories.
pub(crate) async fn by_category(
    state: &AppState,
    event_id: Uuid,
    price: Option<i32>,
) -> ApiResult<Vec<ReportCategoryDto>> {
    let rows = sqlx::query!(
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
           )
           select tc.id as "id?", tc.name as "name?", tc.color as "color?",
                  coalesce(tc.price_cents, $2::int4) as "price_cents?",
                  count(*) as "tickets!",
                  count(*) filter (where v.reason is distinct from 'unsold' and v.reason is distinct from 'lost') as "sold!",
                  count(e.ticket_number) as "entries!"
           from issued i
           left join voided v on v.number = i.number
           left join entries e on e.event_id = $1 and e.ticket_number = i.number
           left join category_ranges cr on cr.event_id = $1 and cr.numbers @> i.number
           left join ticket_categories tc on tc.id = cr.category_id
           group by tc.id, tc.name, tc.color, tc.price_cents, tc.position
           order by tc.position nulls last, tc.name"#,
        event_id,
        price,
    )
    .fetch_all(&state.pool)
    .await?;
    if rows.iter().all(|row| row.id.is_none()) {
        return Ok(Vec::new());
    }
    Ok(rows
        .into_iter()
        .map(|row| ReportCategoryDto {
            category_id: row.id,
            name: row.name,
            color: row.color,
            price_cents: row.price_cents,
            tickets: row.tickets,
            sold: row.sold,
            entries: row.entries,
            amount_cents: row.price_cents.map(|price| row.sold * i64::from(price)),
        })
        .collect())
}
