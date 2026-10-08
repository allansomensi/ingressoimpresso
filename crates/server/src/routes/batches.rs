//! Batches (payment unit). Only `paid` batches are ever signed (CLAUDE.md invariant 2).

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use sqlx::postgres::types::PgRange;
use time::OffsetDateTime;
use uuid::Uuid;

use super::{MAX_TICKET_NUMBER, authorize_event, bounds, range};
use crate::api::{BatchDto, BatchStatus, CreateBatchBody};
use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult, bad_request};
use crate::state::AppState;

const MAX_BATCH: i32 = 5_000;

struct BatchRow {
    id: Uuid,
    numbers: PgRange<i32>,
    status: String,
    created_at: OffsetDateTime,
    paid_at: Option<OffsetDateTime>,
}

impl BatchRow {
    fn into_dto(self) -> ApiResult<BatchDto> {
        let (first, last) = bounds(&self.numbers)?;
        Ok(BatchDto {
            id: self.id,
            first,
            last,
            status: BatchStatus::from_db(&self.status).ok_or_else(|| {
                ApiError::Internal(anyhow::anyhow!("unknown batch status {}", self.status))
            })?,
            created_at: self.created_at,
            paid_at: self.paid_at,
        })
    }
}

/// `GET /api/events/{id}/batches`.
pub async fn list(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
) -> ApiResult<Json<Vec<BatchDto>>> {
    authorize_event(&state.pool, &user, event_id).await?;
    let rows = sqlx::query_as!(
        BatchRow,
        "select id, numbers, status, created_at, paid_at from ticket_batches where event_id = $1 order by lower(numbers)",
        event_id
    )
    .fetch_all(&state.pool)
    .await?;
    rows.into_iter()
        .map(BatchRow::into_dto)
        .collect::<ApiResult<Vec<_>>>()
        .map(Json)
}

/// `POST /api/events/{id}/batches`: numbers continue after the last non-canceled batch.
pub async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
    Json(body): Json<CreateBatchBody>,
) -> ApiResult<(StatusCode, Json<BatchDto>)> {
    authorize_event(&state.pool, &user, event_id).await?;
    if !(1..=MAX_BATCH).contains(&body.quantity) {
        return Err(bad_request(
            "invalid_quantity",
            format!("quantity must be 1-{MAX_BATCH}"),
        ));
    }
    let mut tx = state.pool.begin().await?;
    let first = sqlx::query_scalar!(
        r#"select coalesce(max(upper(numbers)), 1) as "first!" from ticket_batches
           where event_id = $1 and status <> 'canceled'"#,
        event_id
    )
    .fetch_one(&mut *tx)
    .await?;
    let last = first
        .checked_add(body.quantity - 1)
        .filter(|last| *last <= MAX_TICKET_NUMBER)
        .ok_or_else(|| bad_request("invalid_quantity", "ticket numbers exhausted"))?;
    let key_id = sqlx::query_scalar!(
        "select key_id from event_signing_keys where event_id = $1 and status = 'active'",
        event_id
    )
    .fetch_one(&mut *tx)
    .await?;
    // A concurrent request computing the same `first` loses on the exclusion constraint (409).
    let row = sqlx::query_as!(
        BatchRow,
        r#"insert into ticket_batches (id, event_id, numbers, key_id, status)
           values ($1, $2, $3, $4, 'awaiting_payment')
           returning id, numbers, status, created_at, paid_at"#,
        Uuid::new_v4(),
        event_id,
        range(first, last)?,
        key_id,
    )
    .fetch_one(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok((StatusCode::CREATED, Json(row.into_dto()?)))
}

async fn batch_event(state: &AppState, batch_id: Uuid) -> ApiResult<Uuid> {
    sqlx::query_scalar!(
        "select event_id from ticket_batches where id = $1",
        batch_id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound)
}

/// `POST /api/batches/{id}/cancel`: only before payment.
pub async fn cancel(
    State(state): State<AppState>,
    user: AuthUser,
    Path(batch_id): Path<Uuid>,
) -> ApiResult<Json<BatchDto>> {
    let event_id = batch_event(&state, batch_id).await?;
    authorize_event(&state.pool, &user, event_id).await?;
    let row = sqlx::query_as!(
        BatchRow,
        r#"update ticket_batches set status = 'canceled' where id = $1 and status = 'awaiting_payment'
           returning id, numbers, status, created_at, paid_at"#,
        batch_id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| ApiError::Conflict("batch_not_cancelable", "only unpaid batches can be canceled".to_owned()))?;
    Ok(Json(row.into_dto()?))
}

/// `POST /api/admin/batches/{id}/mark-paid` (MVP payment, ADR 0014).
pub async fn mark_paid(
    State(state): State<AppState>,
    user: AuthUser,
    Path(batch_id): Path<Uuid>,
) -> ApiResult<Json<BatchDto>> {
    if !user.is_admin(&state) {
        return Err(ApiError::Forbidden);
    }
    let row = sqlx::query_as!(
        BatchRow,
        r#"update ticket_batches set status = 'paid', paid_at = now() where id = $1 and status = 'awaiting_payment'
           returning id, numbers, status, created_at, paid_at"#,
        batch_id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| ApiError::Conflict("batch_not_payable", "batch is not awaiting payment".to_owned()))?;
    tracing::info!(%batch_id, admin = %user.email, "batch marked as paid");
    Ok(Json(row.into_dto()?))
}
