//! Sellers and the ranges they hold.

use std::collections::HashMap;

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use uuid::Uuid;

use super::{authorize_event, bounds, is_issued, one_line, optional_text, range};
use crate::api::{RangeBody, RangeDto, SellerBody, SellerDto};
use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult, bad_request};
use crate::state::AppState;

fn validate(body: &SellerBody) -> ApiResult<(String, Option<String>)> {
    let name = body.name.trim().to_owned();
    if name.is_empty() || name.chars().count() > 60 {
        return Err(bad_request(
            "invalid_name",
            "name must have 1-60 characters",
        ));
    }
    one_line(&name, "invalid_name")?;
    let phone = optional_text(body.phone.clone());
    if phone
        .as_ref()
        .is_some_and(|phone| phone.chars().count() > 30)
    {
        return Err(bad_request(
            "invalid_phone",
            "phone must have up to 30 characters",
        ));
    }
    if let Some(phone) = &phone {
        one_line(phone, "invalid_phone")?;
    }
    Ok((name, phone))
}

/// `GET /api/events/{id}/sellers`.
pub async fn list(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
) -> ApiResult<Json<Vec<SellerDto>>> {
    authorize_event(&state.pool, &user, event_id).await?;
    let sellers = sqlx::query!(
        "select id, name, phone from sellers where event_id = $1 order by name",
        event_id
    )
    .fetch_all(&state.pool)
    .await?;
    let assignments = sqlx::query!(
        "select id, seller_id, numbers from seller_assignments where event_id = $1 order by lower(numbers)",
        event_id
    )
    .fetch_all(&state.pool)
    .await?;
    let mut ranges: HashMap<Uuid, Vec<RangeDto>> = HashMap::new();
    for assignment in assignments {
        let (first, last) = bounds(&assignment.numbers)?;
        ranges
            .entry(assignment.seller_id)
            .or_default()
            .push(RangeDto {
                id: assignment.id,
                first,
                last,
            });
    }
    Ok(Json(
        sellers
            .into_iter()
            .map(|seller| SellerDto {
                ranges: ranges.remove(&seller.id).unwrap_or_default(),
                id: seller.id,
                name: seller.name,
                phone: seller.phone,
            })
            .collect(),
    ))
}

/// `POST /api/events/{id}/sellers`.
pub async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
    Json(body): Json<SellerBody>,
) -> ApiResult<(StatusCode, Json<SellerDto>)> {
    authorize_event(&state.pool, &user, event_id).await?;
    let (name, phone) = validate(&body)?;
    let id = Uuid::new_v4();
    sqlx::query!(
        "insert into sellers (id, event_id, name, phone) values ($1, $2, $3, $4)",
        id,
        event_id,
        name,
        phone
    )
    .execute(&state.pool)
    .await
    .map_err(|error| match ApiError::from(error) {
        ApiError::Conflict(..) => {
            ApiError::Conflict("seller_exists", "a seller with this name exists".to_owned())
        }
        other => other,
    })?;
    Ok((
        StatusCode::CREATED,
        Json(SellerDto {
            id,
            name,
            phone,
            ranges: Vec::new(),
        }),
    ))
}

async fn seller_event(state: &AppState, user: &AuthUser, seller_id: Uuid) -> ApiResult<Uuid> {
    let event_id = sqlx::query_scalar!("select event_id from sellers where id = $1", seller_id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or(ApiError::NotFound)?;
    authorize_event(&state.pool, user, event_id).await?;
    Ok(event_id)
}

/// `PUT /api/sellers/{id}`.
pub async fn update(
    State(state): State<AppState>,
    user: AuthUser,
    Path(seller_id): Path<Uuid>,
    Json(body): Json<SellerBody>,
) -> ApiResult<StatusCode> {
    seller_event(&state, &user, seller_id).await?;
    let (name, phone) = validate(&body)?;
    sqlx::query!(
        "update sellers set name = $2, phone = $3 where id = $1",
        seller_id,
        name,
        phone
    )
    .execute(&state.pool)
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// `DELETE /api/sellers/{id}` (also removes their ranges).
pub async fn delete(
    State(state): State<AppState>,
    user: AuthUser,
    Path(seller_id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    seller_event(&state, &user, seller_id).await?;
    sqlx::query!("delete from sellers where id = $1", seller_id)
        .execute(&state.pool)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// `POST /api/sellers/{id}/ranges`: the range must be issued and free (exclusion constraint).
pub async fn assign(
    State(state): State<AppState>,
    user: AuthUser,
    Path(seller_id): Path<Uuid>,
    Json(body): Json<RangeBody>,
) -> ApiResult<(StatusCode, Json<RangeDto>)> {
    let event_id = seller_event(&state, &user, seller_id).await?;
    let numbers = range(body.first, body.last)?;
    if !is_issued(&state.pool, event_id, &numbers).await? {
        return Err(bad_request(
            "range_not_issued",
            "every number must belong to a batch",
        ));
    }
    let id = Uuid::new_v4();
    sqlx::query!(
        "insert into seller_assignments (id, event_id, seller_id, numbers) values ($1, $2, $3, $4)",
        id,
        event_id,
        seller_id,
        numbers
    )
    .execute(&state.pool)
    .await?;
    Ok((
        StatusCode::CREATED,
        Json(RangeDto {
            id,
            first: body.first,
            last: body.last,
        }),
    ))
}

/// `DELETE /api/ranges/{id}`.
pub async fn unassign(
    State(state): State<AppState>,
    user: AuthUser,
    Path(range_id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    let event_id = sqlx::query_scalar!(
        "select event_id from seller_assignments where id = $1",
        range_id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound)?;
    authorize_event(&state.pool, &user, event_id).await?;
    sqlx::query!("delete from seller_assignments where id = $1", range_id)
        .execute(&state.pool)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}
