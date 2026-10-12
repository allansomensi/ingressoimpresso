//! What a seller does with their numbers, number by number: mark sales, undo them, reserve
//! numbers for a person (ADR 0072) and give a reservation up. The seller's page sends these as a
//! queue that may have waited offline (ADR 0074), so each change is checked against the numbers as
//! they are now and leaves out, with a reason, what can no longer be done; the panel uses the same
//! rules all or nothing.
//!
//! Sales and reservations are the seller's word: none of this reaches the door or the QR.

use std::collections::BTreeMap;

use sqlx::{Postgres, Transaction};
use time::{Duration, OffsetDateTime};
use uuid::Uuid;

use super::{one_line, optional_text, range};
use crate::api::{NumberRangeDto, RangeBody, SellerOpOutcome, SellerOpProblem, SellerOpProblemDto};
use crate::error::{ApiError, ApiResult, bad_request};

/// Most ranges and numbers in one change.
pub(crate) const MAX_RANGES: usize = 100;
pub(crate) const MAX_NUMBERS: i64 = 1_000;
/// Longest reservation: nobody holds a number for a person for months.
const MAX_RESERVATION: Duration = Duration::days(120);

/// Who acts and on which seller's numbers.
#[derive(Debug, Clone, Copy)]
pub(crate) struct Actor {
    pub event: Uuid,
    pub seller: Uuid,
    /// The organizer acting on the panel; `None` on the seller's link.
    pub user: Option<Uuid>,
}

/// What a change did: how many numbers it changed and what it left out.
#[derive(Debug, Default)]
pub(crate) struct Done {
    pub applied: usize,
    pub problems: Vec<Problem>,
}

/// One number left out.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Problem {
    pub reason: SellerOpProblem,
    pub number: Option<i32>,
    pub holder: Option<String>,
}

impl Problem {
    fn whole(reason: SellerOpProblem) -> Self {
        Self {
            reason,
            number: None,
            holder: None,
        }
    }
}

impl Done {
    fn rejected(reason: SellerOpProblem) -> Self {
        Self {
            applied: 0,
            problems: vec![Problem::whole(reason)],
        }
    }

    /// Applied, partly applied or rejected.
    pub fn outcome(&self) -> SellerOpOutcome {
        match (self.applied, self.problems.is_empty()) {
            (_, true) => SellerOpOutcome::Applied,
            (0, false) => SellerOpOutcome::Rejected,
            _ => SellerOpOutcome::Partial,
        }
    }

    /// The problems grouped by reason and person, numbers as ranges, in number order.
    pub fn problem_dtos(&self) -> Vec<SellerOpProblemDto> {
        let mut groups: BTreeMap<(String, Option<String>), (SellerOpProblem, Vec<i32>)> =
            BTreeMap::new();
        let mut order = Vec::new();
        for problem in &self.problems {
            let key = (format!("{:?}", problem.reason), problem.holder.clone());
            if !groups.contains_key(&key) {
                order.push(key.clone());
            }
            let entry = groups.entry(key).or_insert((problem.reason, Vec::new()));
            if let Some(number) = problem.number {
                entry.1.push(number);
            }
        }
        order
            .into_iter()
            .filter_map(|key| {
                let (reason, mut numbers) = groups.remove(&key)?;
                numbers.sort_unstable();
                numbers.dedup();
                Some(SellerOpProblemDto {
                    reason,
                    numbers: to_ranges(&numbers),
                    holder: key.1,
                })
            })
            .collect()
    }

    /// The panel's all-or-nothing answer: the first problem as an API error.
    pub fn into_result(self) -> ApiResult<usize> {
        let Some(problem) = self.problems.first() else {
            return Ok(self.applied);
        };
        Err(match problem.reason {
            SellerOpProblem::NotHeld => {
                bad_request("range_not_held", "every number must belong to the seller")
            }
            SellerOpProblem::Voided => ApiError::Conflict(
                "already_voided",
                "some of these numbers are voided".to_owned(),
            ),
            SellerOpProblem::AlreadySold => {
                ApiError::Conflict("already_sold", "some of these numbers are sold".to_owned())
            }
            SellerOpProblem::Reserved => ApiError::Conflict(
                "already_reserved",
                "some of these numbers are reserved".to_owned(),
            ),
            SellerOpProblem::EventCanceled => {
                ApiError::Conflict("event_canceled", "the event was canceled".to_owned())
            }
            SellerOpProblem::BoxOffice => ApiError::Conflict(
                "box_office_seller",
                "a box office sells at the door".to_owned(),
            ),
            SellerOpProblem::Expired | SellerOpProblem::Invalid => bad_request(
                "invalid_expiry",
                "the deadline must be in the future and before the event ends",
            ),
        })
    }
}

/// Sorted, distinct numbers as inclusive ranges.
pub(crate) fn to_ranges(numbers: &[i32]) -> Vec<NumberRangeDto> {
    let mut ranges: Vec<NumberRangeDto> = Vec::new();
    for &number in numbers {
        match ranges.last_mut() {
            Some(last) if last.last.checked_add(1) == Some(number) => last.last = number,
            _ => ranges.push(NumberRangeDto {
                first: number,
                last: number,
            }),
        }
    }
    ranges
}

/// The numbers of `ranges`, validated (1 to 100 ranges, up to 1,000 numbers), sorted, distinct.
pub(crate) fn expand(ranges: &[RangeBody]) -> ApiResult<Vec<i32>> {
    if ranges.is_empty() || ranges.len() > MAX_RANGES {
        return Err(bad_request(
            "invalid_range",
            format!("give 1 to {MAX_RANGES} ranges"),
        ));
    }
    let mut total = 0_i64;
    for item in ranges {
        range(item.first, item.last)?;
        total += i64::from(item.last) - i64::from(item.first) + 1;
    }
    if total > MAX_NUMBERS {
        return Err(bad_request(
            "invalid_range",
            format!("up to {MAX_NUMBERS} numbers at once"),
        ));
    }
    let mut numbers: Vec<i32> = ranges
        .iter()
        .flat_map(|item| item.first..=item.last)
        .collect();
    numbers.sort_unstable();
    numbers.dedup();
    Ok(numbers)
}

/// A buyer's or holder's name or phone: trimmed, one line, up to `max` characters.
pub(crate) fn contact(
    value: Option<String>,
    max: usize,
    code: &'static str,
) -> ApiResult<Option<String>> {
    let value = optional_text(value);
    if let Some(text) = &value {
        if text.chars().count() > max {
            return Err(bad_request(code, format!("up to {max} characters")));
        }
        one_line(text, code)?;
    }
    Ok(value)
}

/// Where a number stands, for the seller acting on it.
struct NumberState {
    number: i32,
    /// With the seller, in a paid batch.
    held: bool,
    voided: bool,
    sold_by: Option<Uuid>,
    buyer: Option<String>,
    reservation: Option<Uuid>,
    holder: Option<String>,
    /// The reservation's deadline has not passed.
    reserved: bool,
}

/// Serializes the changes of one seller (their page on two phones, the organizer on the panel).
async fn lock_seller(tx: &mut Transaction<'_, Postgres>, seller_id: Uuid) -> ApiResult<()> {
    sqlx::query_scalar!("select id from sellers where id = $1 for update", seller_id)
        .fetch_optional(&mut **tx)
        .await?
        .ok_or(ApiError::NotFound)?;
    Ok(())
}

async fn states(
    tx: &mut Transaction<'_, Postgres>,
    actor: Actor,
    numbers: &[i32],
) -> ApiResult<Vec<NumberState>> {
    lock_seller(tx, actor.seller).await?;
    let rows = sqlx::query!(
        r#"select n as "number!",
                  exists(select 1 from seller_assignments a
                         join ticket_batches b on b.event_id = a.event_id and b.status = 'paid' and b.numbers @> n
                         where a.event_id = $1 and a.seller_id = $2 and a.numbers @> n) as "held!",
                  exists(select 1 from ticket_voids v
                         where v.event_id = $1 and v.undone_at is null and v.numbers @> n) as "voided!",
                  s.seller_id as "sold_by?", s.buyer_name as "buyer?",
                  r.reservation_id as "reservation?", r.holder_name as "holder?",
                  coalesce(r.expires_at > now(), false) as "reserved!"
           from unnest($3::int4[]) as n
           left join ticket_sales s on s.event_id = $1 and s.ticket_number = n
           left join ticket_reservations r on r.event_id = $1 and r.ticket_number = n
           order by n"#,
        actor.event,
        actor.seller,
        numbers,
    )
    .fetch_all(&mut **tx)
    .await?;
    Ok(rows
        .into_iter()
        .map(|row| NumberState {
            number: row.number,
            held: row.held,
            voided: row.voided,
            sold_by: row.sold_by,
            buyer: row.buyer,
            reservation: row.reservation,
            holder: row.holder,
            reserved: row.reserved,
        })
        .collect())
}

/// What one change of a sale finds on a number: `None` when it goes ahead.
fn sale_problem(
    state: &NumberState,
    actor: Actor,
    edit: bool,
    reservation: Option<Uuid>,
) -> Option<Problem> {
    let problem = |reason, holder: Option<&String>| {
        Some(Problem {
            reason,
            number: Some(state.number),
            holder: holder.cloned(),
        })
    };
    if !state.held {
        return problem(SellerOpProblem::NotHeld, None);
    }
    if state.voided {
        return problem(SellerOpProblem::Voided, None);
    }
    if state.sold_by == Some(actor.seller) && !edit {
        return problem(SellerOpProblem::AlreadySold, state.buyer.as_ref());
    }
    if state.reserved && state.reservation != reservation && state.sold_by.is_none() {
        return problem(SellerOpProblem::Reserved, state.holder.as_ref());
    }
    None
}

/// Marks numbers as sold. `edit` replaces the buyer of numbers sold already; `reservation` is the
/// one the page showed on them, which the sale takes over.
#[expect(clippy::too_many_arguments, reason = "the parts of one sale")]
pub(crate) async fn mark(
    tx: &mut Transaction<'_, Postgres>,
    actor: Actor,
    canceled: bool,
    numbers: &[i32],
    buyer_name: Option<String>,
    buyer_phone: Option<String>,
    edit: bool,
    reservation: Option<Uuid>,
) -> ApiResult<Done> {
    if canceled {
        return Ok(Done::rejected(SellerOpProblem::EventCanceled));
    }
    let mut done = Done::default();
    let mut sell = Vec::new();
    for state in states(tx, actor, numbers).await? {
        match sale_problem(&state, actor, edit, reservation) {
            Some(problem) => done.problems.push(problem),
            None => sell.push(state.number),
        }
    }
    if sell.is_empty() {
        return Ok(done);
    }
    done.applied = sell.len();
    // The sale takes the number's reservation over (the seller's own, or the one being sold).
    sqlx::query!(
        "delete from ticket_reservations where event_id = $1 and ticket_number = any($2)",
        actor.event,
        &sell,
    )
    .execute(&mut **tx)
    .await?;
    sqlx::query!(
        r#"insert into ticket_sales (event_id, ticket_number, seller_id, buyer_name, buyer_phone)
           select $1, n, $2, $3, $4 from unnest($5::int4[]) as n
           on conflict (event_id, ticket_number) do update
           set buyer_name = excluded.buyer_name,
               buyer_phone = excluded.buyer_phone,
               sold_at = case when ticket_sales.seller_id = excluded.seller_id
                              then ticket_sales.sold_at else now() end,
               seller_id = excluded.seller_id"#,
        actor.event,
        actor.seller,
        buyer_name,
        buyer_phone,
        &sell,
    )
    .execute(&mut **tx)
    .await?;
    Ok(done)
}

/// Undoes a sale of the seller (nothing to do when it is not marked any more). A digital ticket
/// the seller sent for it stops opening (ADR 0061).
pub(crate) async fn unmark(
    tx: &mut Transaction<'_, Postgres>,
    actor: Actor,
    number: i32,
) -> ApiResult<Done> {
    lock_seller(tx, actor.seller).await?;
    sqlx::query!(
        "delete from ticket_sales where event_id = $1 and ticket_number = $2 and seller_id = $3",
        actor.event,
        number,
        actor.seller,
    )
    .execute(&mut **tx)
    .await?;
    sqlx::query!(
        r#"update ticket_links set revoked_at = now()
           where event_id = $1 and seller_id = $2 and ticket_number = $3 and revoked_at is null"#,
        actor.event,
        actor.seller,
        number,
    )
    .execute(&mut **tx)
    .await?;
    Ok(Done {
        applied: 1,
        problems: Vec::new(),
    })
}

/// A reservation to make (or to change, with the same id).
pub(crate) struct Reservation {
    pub id: Uuid,
    pub holder_name: String,
    pub holder_phone: Option<String>,
    pub expires_at: OffsetDateTime,
}

/// The event and seller facts a reservation depends on.
#[derive(Debug, Clone, Copy)]
pub(crate) struct ReservationRules {
    pub canceled: bool,
    pub box_office: bool,
    pub ends_at: OffsetDateTime,
}

/// Validates a reservation's person; the deadline is checked by [`reserve`].
pub(crate) fn holder(name: String, phone: Option<String>) -> ApiResult<(String, Option<String>)> {
    let name = contact(Some(name), 80, "invalid_holder_name")?
        .ok_or_else(|| bad_request("invalid_holder_name", "say for whom"))?;
    let phone = contact(phone, 30, "invalid_holder_phone")?;
    Ok((name, phone))
}

/// Reserves numbers for a person until a deadline. Sold, returned, other people's and other
/// sellers' numbers are left out; the reservation's own numbers get the new person and deadline.
pub(crate) async fn reserve(
    tx: &mut Transaction<'_, Postgres>,
    actor: Actor,
    rules: ReservationRules,
    numbers: &[i32],
    reservation: &Reservation,
) -> ApiResult<Done> {
    if rules.canceled {
        return Ok(Done::rejected(SellerOpProblem::EventCanceled));
    }
    if rules.box_office {
        return Ok(Done::rejected(SellerOpProblem::BoxOffice));
    }
    let now = OffsetDateTime::now_utc();
    if reservation.expires_at <= now {
        return Ok(Done::rejected(SellerOpProblem::Expired));
    }
    if reservation.expires_at > rules.ends_at || reservation.expires_at > now + MAX_RESERVATION {
        return Ok(Done::rejected(SellerOpProblem::Invalid));
    }
    let mut done = Done::default();
    let mut keep = Vec::new();
    for state in states(tx, actor, numbers).await? {
        let problem = |reason, holder: Option<&String>| Problem {
            reason,
            number: Some(state.number),
            holder: holder.cloned(),
        };
        if !state.held {
            done.problems.push(problem(SellerOpProblem::NotHeld, None));
        } else if state.voided {
            done.problems.push(problem(SellerOpProblem::Voided, None));
        } else if state.sold_by.is_some() {
            done.problems
                .push(problem(SellerOpProblem::AlreadySold, state.buyer.as_ref()));
        } else if state.reserved && state.reservation != Some(reservation.id) {
            done.problems
                .push(problem(SellerOpProblem::Reserved, state.holder.as_ref()));
        } else {
            keep.push(state.number);
        }
    }
    if keep.is_empty() {
        return Ok(done);
    }
    done.applied = keep.len();
    // An expired reservation of another person leaves the number; the same reservation changes.
    sqlx::query!(
        r#"insert into ticket_reservations
               (event_id, ticket_number, reservation_id, seller_id, holder_name, holder_phone,
                expires_at, created_by)
           select $1, n, $2, $3, $4, $5, $6, $7 from unnest($8::int4[]) as n
           on conflict (event_id, ticket_number) do update
           set holder_name = excluded.holder_name,
               holder_phone = excluded.holder_phone,
               expires_at = excluded.expires_at,
               created_at = case when ticket_reservations.reservation_id = excluded.reservation_id
                                 then ticket_reservations.created_at else now() end,
               created_by = case when ticket_reservations.reservation_id = excluded.reservation_id
                                 then ticket_reservations.created_by else excluded.created_by end,
               reservation_id = excluded.reservation_id,
               seller_id = excluded.seller_id"#,
        actor.event,
        reservation.id,
        actor.seller,
        reservation.holder_name,
        reservation.holder_phone,
        reservation.expires_at,
        actor.user,
        &keep,
    )
    .execute(&mut **tx)
    .await?;
    Ok(done)
}

/// Gives a reservation up (nothing to do when it is gone already). Returns how many numbers it
/// still held.
pub(crate) async fn cancel_reservation(
    tx: &mut Transaction<'_, Postgres>,
    actor: Actor,
    reservation_id: Uuid,
) -> ApiResult<u64> {
    lock_seller(tx, actor.seller).await?;
    Ok(sqlx::query!(
        "delete from ticket_reservations where reservation_id = $1 and seller_id = $2",
        reservation_id,
        actor.seller,
    )
    .execute(&mut **tx)
    .await?
    .rows_affected())
}

/// Removes the reservations of numbers that left the seller (a return, a range taken back).
pub(crate) async fn clear_reservations(
    tx: &mut Transaction<'_, Postgres>,
    event_id: Uuid,
    numbers: &sqlx::postgres::types::PgRange<i32>,
) -> ApiResult<()> {
    sqlx::query!(
        "delete from ticket_reservations where event_id = $1 and $2::int4range @> ticket_number",
        event_id,
        numbers.clone(),
    )
    .execute(&mut **tx)
    .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn problem(reason: SellerOpProblem, number: i32, holder: Option<&str>) -> Problem {
        Problem {
            reason,
            number: Some(number),
            holder: holder.map(str::to_owned),
        }
    }

    #[test]
    fn numbers_become_ranges() {
        let ranges = to_ranges(&[1, 2, 3, 7, 9, 10]);
        let pairs: Vec<(i32, i32)> = ranges.iter().map(|r| (r.first, r.last)).collect();
        assert_eq!(pairs, [(1, 3), (7, 7), (9, 10)]);
        assert_eq!(to_ranges(&[]).len(), 0);
    }

    #[test]
    fn ranges_expand_once_and_within_limits() {
        let body = |first, last| RangeBody { first, last };
        assert_eq!(
            expand(&[body(5, 7), body(6, 8), body(1, 1)]).unwrap(),
            [1, 5, 6, 7, 8]
        );
        assert!(expand(&[]).is_err());
        assert!(expand(&[body(3, 2)]).is_err());
        assert!(expand(&[body(1, 1_001)]).is_err());
    }

    #[test]
    fn outcomes_and_grouped_problems() {
        let mut done = Done::default();
        assert_eq!(done.outcome(), SellerOpOutcome::Applied);
        done.problems = vec![
            problem(SellerOpProblem::AlreadySold, 4, Some("Bia")),
            problem(SellerOpProblem::NotHeld, 9, None),
            problem(SellerOpProblem::AlreadySold, 3, Some("Bia")),
            problem(SellerOpProblem::AlreadySold, 7, Some("Caio")),
        ];
        assert_eq!(done.outcome(), SellerOpOutcome::Rejected);
        done.applied = 2;
        assert_eq!(done.outcome(), SellerOpOutcome::Partial);
        let dtos = done.problem_dtos();
        assert_eq!(dtos.len(), 3);
        assert_eq!(dtos[0].reason, SellerOpProblem::AlreadySold);
        assert_eq!(dtos[0].holder.as_deref(), Some("Bia"));
        assert_eq!((dtos[0].numbers[0].first, dtos[0].numbers[0].last), (3, 4));
        assert_eq!(dtos[1].reason, SellerOpProblem::NotHeld);
        assert_eq!(dtos[2].holder.as_deref(), Some("Caio"));
        assert!(matches!(
            done.into_result(),
            Err(ApiError::Conflict("already_sold", _))
        ));
    }

    #[test]
    fn a_number_reserved_by_another_reservation_is_not_sold() {
        let actor = Actor {
            event: Uuid::nil(),
            seller: Uuid::from_u128(1),
            user: None,
        };
        let mine = Uuid::from_u128(7);
        let state = |reserved, reservation, sold_by| NumberState {
            number: 42,
            held: true,
            voided: false,
            sold_by,
            buyer: Some("Bia".to_owned()),
            reservation,
            holder: Some("Caio".to_owned()),
            reserved,
        };
        // Reserved for Caio by another reservation: a conflict naming him.
        let found = sale_problem(
            &state(true, Some(Uuid::from_u128(8)), None),
            actor,
            false,
            Some(mine),
        );
        assert_eq!(
            found,
            Some(problem(SellerOpProblem::Reserved, 42, Some("Caio")))
        );
        // The reservation the page showed, or one that expired: the sale goes ahead.
        assert_eq!(
            sale_problem(&state(true, Some(mine), None), actor, false, Some(mine)),
            None
        );
        assert_eq!(
            sale_problem(
                &state(false, Some(Uuid::from_u128(8)), None),
                actor,
                false,
                None
            ),
            None
        );
        // Sold already by this seller (another phone): a conflict, unless it is an edit.
        let sold = state(false, None, Some(actor.seller));
        assert_eq!(
            sale_problem(&sold, actor, false, None),
            Some(problem(SellerOpProblem::AlreadySold, 42, Some("Bia")))
        );
        assert_eq!(sale_problem(&sold, actor, true, None), None);
    }
}
