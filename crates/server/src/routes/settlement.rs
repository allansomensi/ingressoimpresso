//! Settling with sellers (ADR 0050): the money each one handed over and the tickets they gave
//! back. Tickets are sold outside the platform, so these are the organizer's records; the report
//! compares them with what each seller owes.

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use time::macros::format_description;
use time::{Date, Duration, OffsetDateTime};
use uuid::Uuid;

use super::{authorize_event, bounds, one_line, optional_text, range};
use crate::api::{
    SellerPaymentBody, SellerPaymentDto, SellerPaymentMethod, SellerReturnBody, VoidDto, VoidReason,
};
use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult, bad_request};
use crate::state::AppState;

/// Largest amount of one payment: R$ 1.000.000,00.
const MAX_AMOUNT_CENTS: i32 = 100_000_000;

/// Most ranges in one return (a seller giving back scattered numbers).
const MAX_RETURN_RANGES: usize = 100;

const DATE_FORMAT: &[time::format_description::BorrowedFormatItem<'static>] =
    format_description!("[year]-[month]-[day]");

fn format_date(date: Date) -> ApiResult<String> {
    date.format(DATE_FORMAT)
        .map_err(|error| ApiError::Internal(error.into()))
}

/// A day from `2020-01-01` up to tomorrow (time zones aside, nobody receives money later).
fn parse_date(text: &str) -> ApiResult<Date> {
    let invalid = || bad_request("invalid_date", "date must be YYYY-MM-DD, not in the future");
    let date = Date::parse(text.trim(), DATE_FORMAT).map_err(|_| invalid())?;
    let tomorrow = (OffsetDateTime::now_utc() + Duration::days(1)).date();
    if date.year() < 2020 || date > tomorrow {
        return Err(invalid());
    }
    Ok(date)
}

fn note(value: Option<String>) -> ApiResult<Option<String>> {
    let note = optional_text(value);
    if let Some(note) = &note {
        if note.chars().count() > 200 {
            return Err(bad_request(
                "invalid_note",
                "note must have up to 200 characters",
            ));
        }
        one_line(note, "invalid_note")?;
    }
    Ok(note)
}

struct PaymentRow {
    id: Uuid,
    seller_id: Uuid,
    amount_cents: i32,
    method: String,
    received_on: Date,
    note: Option<String>,
    created_at: OffsetDateTime,
}

impl PaymentRow {
    fn into_dto(self) -> ApiResult<SellerPaymentDto> {
        Ok(SellerPaymentDto {
            id: self.id,
            seller_id: self.seller_id,
            amount_cents: self.amount_cents,
            method: SellerPaymentMethod::from_db(&self.method).ok_or_else(|| {
                ApiError::Internal(anyhow::anyhow!("unknown payment method {}", self.method))
            })?,
            received_on: format_date(self.received_on)?,
            note: self.note,
            created_at: self.created_at,
        })
    }
}

/// The event of a seller, if the user may access it (404 otherwise).
async fn seller_event(state: &AppState, user: &AuthUser, seller_id: Uuid) -> ApiResult<Uuid> {
    let event_id = sqlx::query_scalar!("select event_id from sellers where id = $1", seller_id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or(ApiError::NotFound)?;
    authorize_event(&state.pool, user, event_id).await?;
    Ok(event_id)
}

/// `GET /api/events/{id}/seller-payments`: newest first.
pub async fn list(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
) -> ApiResult<Json<Vec<SellerPaymentDto>>> {
    authorize_event(&state.pool, &user, event_id).await?;
    let rows = sqlx::query_as!(
        PaymentRow,
        r#"select id, seller_id, amount_cents, method, received_on, note, created_at
           from seller_payments where event_id = $1
           order by received_on desc, created_at desc"#,
        event_id
    )
    .fetch_all(&state.pool)
    .await?;
    rows.into_iter()
        .map(PaymentRow::into_dto)
        .collect::<ApiResult<Vec<_>>>()
        .map(Json)
}

/// `POST /api/sellers/{id}/payments`.
pub async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Path(seller_id): Path<Uuid>,
    Json(body): Json<SellerPaymentBody>,
) -> ApiResult<(StatusCode, Json<SellerPaymentDto>)> {
    let event_id = seller_event(&state, &user, seller_id).await?;
    if !(1..=MAX_AMOUNT_CENTS).contains(&body.amount_cents) {
        return Err(bad_request(
            "invalid_amount",
            "amount must be between R$ 0,01 and R$ 1.000.000,00",
        ));
    }
    let received_on = parse_date(&body.received_on)?;
    let note = note(body.note)?;
    let row = sqlx::query_as!(
        PaymentRow,
        r#"insert into seller_payments
               (id, event_id, seller_id, amount_cents, method, received_on, note, created_by)
           values ($1, $2, $3, $4, $5, $6, $7, $8)
           returning id, seller_id, amount_cents, method, received_on, note, created_at"#,
        Uuid::new_v4(),
        event_id,
        seller_id,
        body.amount_cents,
        body.method.db(),
        received_on,
        note,
        user.id,
    )
    .fetch_one(&state.pool)
    .await?;
    Ok((StatusCode::CREATED, Json(row.into_dto()?)))
}

/// `DELETE /api/seller-payments/{id}`: a payment recorded by mistake.
pub async fn delete(
    State(state): State<AppState>,
    user: AuthUser,
    Path(payment_id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    let event_id = sqlx::query_scalar!(
        "select event_id from seller_payments where id = $1",
        payment_id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound)?;
    authorize_event(&state.pool, &user, event_id).await?;
    sqlx::query!("delete from seller_payments where id = $1", payment_id)
        .execute(&state.pool)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// `POST /api/sellers/{id}/returns`: voids the numbers a seller gave back, all or none.
pub async fn record_return(
    State(state): State<AppState>,
    user: AuthUser,
    Path(seller_id): Path<Uuid>,
    Json(body): Json<SellerReturnBody>,
) -> ApiResult<(StatusCode, Json<Vec<VoidDto>>)> {
    let event_id = seller_event(&state, &user, seller_id).await?;
    if !matches!(body.reason, VoidReason::Unsold | VoidReason::Lost) {
        return Err(bad_request(
            "invalid_return_reason",
            "a return is unsold or lost",
        ));
    }
    if body.ranges.is_empty() || body.ranges.len() > MAX_RETURN_RANGES {
        return Err(bad_request(
            "invalid_range",
            format!("give 1 to {MAX_RETURN_RANGES} ranges"),
        ));
    }
    let mut ranges = body
        .ranges
        .iter()
        .map(|item| range(item.first, item.last).map(|numbers| (item.first, item.last, numbers)))
        .collect::<ApiResult<Vec<_>>>()?;
    ranges.sort_by_key(|(first, ..)| *first);
    if ranges
        .windows(2)
        .any(|pair| matches!(pair, [(_, last, _), (next, ..)] if next <= last))
    {
        return Err(bad_request("invalid_range", "ranges must not overlap"));
    }
    let note = note(body.note)?;

    let mut tx = state.pool.begin().await?;
    for (first, last, numbers) in &ranges {
        // The seller's assignments never overlap each other (exclusion constraint), so the sum
        // of the intersections is the part of the range they hold.
        let held = sqlx::query_scalar!(
            r#"select coalesce(sum(upper(numbers * $3) - lower(numbers * $3)), 0)::bigint as "held!"
               from seller_assignments
               where event_id = $1 and seller_id = $2 and numbers && $3"#,
            event_id,
            seller_id,
            numbers.clone(),
        )
        .fetch_one(&mut *tx)
        .await?;
        if held != i64::from(*last) - i64::from(*first) + 1 {
            return Err(bad_request(
                "range_not_held",
                "every number must belong to the seller",
            ));
        }
        let voided = sqlx::query_scalar!(
            r#"select exists(select 1 from ticket_voids
                             where event_id = $1 and undone_at is null and numbers && $2) as "voided!""#,
            event_id,
            numbers.clone(),
        )
        .fetch_one(&mut *tx)
        .await?;
        if voided {
            return Err(ApiError::Conflict(
                "already_voided",
                "some of these numbers are voided already".to_owned(),
            ));
        }
        super::pix::ensure_unpaid(&mut *tx, event_id, numbers).await?;
    }
    let mut voids = Vec::with_capacity(ranges.len());
    for (_, _, numbers) in ranges {
        // A returned or lost number is not sold: its mark (ADR 0053) goes.
        super::seller_links::clear_marks(&mut tx, event_id, &numbers).await?;
        let row = sqlx::query!(
            r#"insert into ticket_voids (id, event_id, numbers, reason, note, created_by)
               values ($1, $2, $3, $4, $5, $6)
               returning id, numbers, created_at"#,
            Uuid::new_v4(),
            event_id,
            numbers,
            body.reason.db(),
            note,
            user.id,
        )
        .fetch_one(&mut *tx)
        .await?;
        let (first, last) = bounds(&row.numbers)?;
        voids.push(VoidDto {
            id: row.id,
            first,
            last,
            reason: body.reason,
            note: note.clone(),
            created_at: row.created_at,
            undone_at: None,
            locked: false,
            replaced_by: None,
        });
    }
    tx.commit().await?;
    Ok((StatusCode::CREATED, Json(voids)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dates_are_iso_days_up_to_tomorrow() {
        assert_eq!(parse_date("2026-10-11").unwrap().to_string(), "2026-10-11");
        assert!(parse_date("11/10/2026").is_err());
        assert!(parse_date("2019-12-31").is_err());
        let later = (OffsetDateTime::now_utc() + Duration::days(3)).date();
        assert!(parse_date(&format_date(later).unwrap()).is_err());
    }

    #[test]
    fn notes_are_one_short_line() {
        assert_eq!(
            note(Some("  Pix do sábado ".into())).unwrap().as_deref(),
            Some("Pix do sábado")
        );
        assert_eq!(note(Some("   ".into())).unwrap(), None);
        assert!(note(Some("a\nb".into())).is_err());
        assert!(note(Some("x".repeat(201))).is_err());
    }
}
