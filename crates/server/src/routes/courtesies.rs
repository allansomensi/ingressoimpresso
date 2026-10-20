//! Courtesies under control (ADR 0096): who may give them (with a limit each), and the paid
//! numbers given, to whom and why. A courtesy enters like any other number and is worth nothing:
//! the seller holding it does not owe it, and the report counts it apart.

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use uuid::Uuid;

use super::{authorize_event, bounds, one_line, optional_text, range};
use crate::api::{CourtesiesDto, CourtesyBody, CourtesyDto, CourtesyGiverBody, CourtesyGiverDto};
use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult, bad_request};
use crate::state::AppState;

const MAX_GIVER_NAME: usize = 60;
const MAX_RECIPIENT: usize = 80;
const MAX_REASON: usize = 120;
/// Most numbers given at once.
const MAX_AT_ONCE: i32 = 500;
/// Most people who may give courtesies on one event.
const MAX_GIVERS: i64 = 50;

/// Everything the panel shows: the givers with their counts and the courtesies, newest first.
pub(crate) async fn load(state: &AppState, event_id: Uuid) -> ApiResult<CourtesiesDto> {
    let givers = sqlx::query!(
        r#"select g.id, g.name, g.quota,
                  count(c.id)::int as "given!",
                  count(e.ticket_number)::int as "entered!"
           from courtesy_givers g
           left join courtesies c on c.giver_id = g.id
           left join entries e on e.event_id = g.event_id and e.ticket_number = c.ticket_number
           where g.event_id = $1
           group by g.id
           order by lower(g.name)"#,
        event_id
    )
    .fetch_all(&state.pool)
    .await?
    .into_iter()
    .map(|row| CourtesyGiverDto {
        id: row.id,
        name: row.name,
        quota: row.quota,
        given: row.given,
        entered: row.entered,
    })
    .collect();
    let courtesies = sqlx::query!(
        r#"select c.id, c.ticket_number, c.giver_id, c.recipient, c.reason, c.created_at,
                  s.name as "seller?",
                  exists(select 1 from entries e
                         where e.event_id = c.event_id and e.ticket_number = c.ticket_number) as "entered!"
           from courtesies c
           left join seller_assignments a on a.event_id = c.event_id and a.numbers @> c.ticket_number
           left join sellers s on s.id = a.seller_id
           where c.event_id = $1
           order by c.created_at desc, c.ticket_number"#,
        event_id
    )
    .fetch_all(&state.pool)
    .await?
    .into_iter()
    .map(|row| CourtesyDto {
        id: row.id,
        number: row.ticket_number,
        giver_id: row.giver_id,
        recipient: row.recipient,
        reason: row.reason,
        seller: row.seller,
        entered: row.entered,
        created_at: row.created_at,
    })
    .collect();
    Ok(CourtesiesDto { givers, courtesies })
}

/// `GET /api/events/{id}/courtesies`.
pub async fn list(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
) -> ApiResult<Json<CourtesiesDto>> {
    authorize_event(&state.pool, &user, event_id).await?;
    Ok(Json(load(&state, event_id).await?))
}

fn clean_giver(body: &CourtesyGiverBody) -> ApiResult<(String, Option<i32>)> {
    let name = body.name.trim().to_owned();
    if name.is_empty() || name.chars().count() > MAX_GIVER_NAME {
        return Err(bad_request(
            "invalid_name",
            format!("name must have 1–{MAX_GIVER_NAME} characters"),
        ));
    }
    one_line(&name, "invalid_name")?;
    if body
        .quota
        .is_some_and(|quota| !(1..=100_000).contains(&quota))
    {
        return Err(bad_request("invalid_quota", "the limit must be 1–100,000"));
    }
    Ok((name, body.quota))
}

fn giver_exists(error: sqlx::Error) -> ApiError {
    match ApiError::from(error) {
        ApiError::Conflict(..) => ApiError::Conflict(
            "courtesy_giver_exists",
            "someone with this name already gives courtesies".to_owned(),
        ),
        other => other,
    }
}

/// `POST /api/events/{id}/courtesy-givers`.
pub async fn create_giver(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
    Json(body): Json<CourtesyGiverBody>,
) -> ApiResult<(StatusCode, Json<CourtesiesDto>)> {
    authorize_event(&state.pool, &user, event_id).await?;
    let (name, quota) = clean_giver(&body)?;
    let count = sqlx::query_scalar!(
        r#"select count(*) as "count!" from courtesy_givers where event_id = $1"#,
        event_id
    )
    .fetch_one(&state.pool)
    .await?;
    if count >= MAX_GIVERS {
        return Err(bad_request(
            "too_many_courtesy_givers",
            format!("at most {MAX_GIVERS} people per event"),
        ));
    }
    sqlx::query!(
        "insert into courtesy_givers (id, event_id, name, quota) values ($1, $2, $3, $4)",
        Uuid::new_v4(),
        event_id,
        name,
        quota,
    )
    .execute(&state.pool)
    .await
    .map_err(giver_exists)?;
    Ok((StatusCode::CREATED, Json(load(&state, event_id).await?)))
}

async fn giver_event(state: &AppState, user: &AuthUser, giver_id: Uuid) -> ApiResult<Uuid> {
    let event_id = sqlx::query_scalar!(
        "select event_id from courtesy_givers where id = $1",
        giver_id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound)?;
    authorize_event(&state.pool, user, event_id).await?;
    Ok(event_id)
}

/// `PUT /api/courtesy-givers/{id}`: the limit never goes below what was already given.
pub async fn update_giver(
    State(state): State<AppState>,
    user: AuthUser,
    Path(giver_id): Path<Uuid>,
    Json(body): Json<CourtesyGiverBody>,
) -> ApiResult<Json<CourtesiesDto>> {
    let event_id = giver_event(&state, &user, giver_id).await?;
    let (name, quota) = clean_giver(&body)?;
    let mut tx = state.pool.begin().await?;
    sqlx::query!(
        "select id from courtesy_givers where id = $1 for update",
        giver_id
    )
    .fetch_one(&mut *tx)
    .await?;
    let given = sqlx::query_scalar!(
        r#"select count(*) as "count!" from courtesies where giver_id = $1"#,
        giver_id
    )
    .fetch_one(&mut *tx)
    .await?;
    if quota.is_some_and(|quota| i64::from(quota) < given) {
        return Err(ApiError::Conflict(
            "quota_below_given",
            "the limit is below the courtesies already given".to_owned(),
        ));
    }
    sqlx::query!(
        "update courtesy_givers set name = $2, quota = $3 where id = $1",
        giver_id,
        name,
        quota,
    )
    .execute(&mut *tx)
    .await
    .map_err(giver_exists)?;
    tx.commit().await?;
    Ok(Json(load(&state, event_id).await?))
}

/// `DELETE /api/courtesy-givers/{id}`: only someone who gave none (their courtesies say who).
pub async fn delete_giver(
    State(state): State<AppState>,
    user: AuthUser,
    Path(giver_id): Path<Uuid>,
) -> ApiResult<Json<CourtesiesDto>> {
    let event_id = giver_event(&state, &user, giver_id).await?;
    let removed = sqlx::query!(
        "delete from courtesy_givers g where id = $1 and not exists (select 1 from courtesies c where c.giver_id = g.id)",
        giver_id
    )
    .execute(&state.pool)
    .await?
    .rows_affected();
    if removed == 0 {
        return Err(ApiError::Conflict(
            "courtesy_giver_in_use",
            "remove their courtesies first".to_owned(),
        ));
    }
    Ok(Json(load(&state, event_id).await?))
}

/// The recipient and the reason of a courtesy, checked.
fn clean_recipient(body: &CourtesyBody) -> ApiResult<(String, Option<String>)> {
    let recipient = body.recipient.trim().to_owned();
    if recipient.is_empty() || recipient.chars().count() > MAX_RECIPIENT {
        return Err(bad_request(
            "invalid_recipient",
            format!("recipient must have 1–{MAX_RECIPIENT} characters"),
        ));
    }
    one_line(&recipient, "invalid_recipient")?;
    let reason = optional_text(body.reason.clone());
    if let Some(reason) = &reason {
        if reason.chars().count() > MAX_REASON {
            return Err(bad_request(
                "invalid_reason",
                format!("reason must have up to {MAX_REASON} characters"),
            ));
        }
        one_line(reason, "invalid_reason")?;
    }
    Ok((recipient, reason))
}

/// `POST /api/events/{id}/courtesies`: paid numbers (not voided, not courtesies yet) given by
/// someone within their limit.
pub async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
    Json(body): Json<CourtesyBody>,
) -> ApiResult<(StatusCode, Json<CourtesiesDto>)> {
    authorize_event(&state.pool, &user, event_id).await?;
    let numbers = range(body.first, body.last)?;
    let (first, last) = bounds(&numbers)?;
    let count = last - first + 1;
    if count > MAX_AT_ONCE {
        return Err(bad_request(
            "invalid_range",
            format!("at most {MAX_AT_ONCE} numbers at once"),
        ));
    }
    let (recipient, reason) = clean_recipient(&body)?;
    let mut tx = state.pool.begin().await?;
    let quota = sqlx::query_scalar!(
        "select quota from courtesy_givers where id = $1 and event_id = $2 for update",
        body.giver_id,
        event_id,
    )
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| bad_request("invalid_courtesy_giver", "unknown giver"))?;
    let given = sqlx::query_scalar!(
        r#"select count(*) as "count!" from courtesies where giver_id = $1"#,
        body.giver_id
    )
    .fetch_one(&mut *tx)
    .await?;
    if let Some(quota) = quota
        && given + i64::from(count) > i64::from(quota)
    {
        return Err(ApiError::Conflict(
            "courtesy_quota",
            format!(
                "only {} left for this person",
                (i64::from(quota) - given).max(0)
            ),
        ));
    }
    let check = sqlx::query!(
        r#"select
               (select coalesce(sum(upper(numbers * $2) - lower(numbers * $2)), 0)
                from ticket_batches where event_id = $1 and status = 'paid' and numbers && $2)::bigint as "paid!",
               exists(select 1 from ticket_voids
                      where event_id = $1 and undone_at is null and numbers && $2) as "voided!",
               exists(select 1 from courtesies
                      where event_id = $1 and $2::int4range @> ticket_number) as "taken!""#,
        event_id,
        numbers.clone(),
    )
    .fetch_one(&mut *tx)
    .await?;
    if check.paid != i64::from(count) {
        return Err(bad_request(
            "courtesy_not_paid",
            "a courtesy is a number of a paid batch",
        ));
    }
    if check.voided {
        return Err(bad_request(
            "courtesy_voided",
            "a voided number cannot be a courtesy",
        ));
    }
    if check.taken {
        return Err(ApiError::Conflict(
            "already_courtesy",
            "a number of the range is already a courtesy".to_owned(),
        ));
    }
    sqlx::query!(
        r#"insert into courtesies (id, event_id, ticket_number, giver_id, recipient, reason, created_by)
           select gen_random_uuid(), $1, n, $2, $3, $4, $5 from generate_series($6::int, $7::int) as n"#,
        event_id,
        body.giver_id,
        recipient,
        reason,
        user.id,
        first,
        last,
    )
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok((StatusCode::CREATED, Json(load(&state, event_id).await?)))
}

/// `DELETE /api/courtesies/{id}`: the number is an ordinary one again.
pub async fn delete(
    State(state): State<AppState>,
    user: AuthUser,
    Path(courtesy_id): Path<Uuid>,
) -> ApiResult<Json<CourtesiesDto>> {
    let event_id =
        sqlx::query_scalar!("select event_id from courtesies where id = $1", courtesy_id)
            .fetch_optional(&state.pool)
            .await?
            .ok_or(ApiError::NotFound)?;
    authorize_event(&state.pool, &user, event_id).await?;
    sqlx::query!("delete from courtesies where id = $1", courtesy_id)
        .execute(&state.pool)
        .await?;
    Ok(Json(load(&state, event_id).await?))
}
