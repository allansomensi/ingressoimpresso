//! Checkpoints (ADR 0092): the same QR read again where something extra is handed over (dinner,
//! kit, open bar). Each one has its own door links and its own book of uses, apart from the
//! entrance's. A combo (ADR 0112) hands over several items per ticket: its allowance.

use std::collections::HashMap;

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

use super::{authorize_event, one_line};
use crate::api::{CheckpointAllowanceDto, CheckpointBody, CheckpointDto, DoorCheckpointDto};
use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult, bad_request};
use crate::state::AppState;

/// Most checkpoints per event.
pub const MAX_CHECKPOINTS: i64 = 10;
/// Most items one ticket takes at a checkpoint in a book (ADR 0112).
pub const MAX_ALLOWANCE: u8 = 20;
const MAX_NAME: usize = 30;

/// A checkpoint's fields, checked.
struct ValidCheckpoint {
    name: String,
    instruction: Option<String>,
    category_ids: Vec<Uuid>,
    allowance: i16,
    /// The allowance of each listed category, in `category_ids` order.
    category_allowances: Vec<i16>,
}

fn allowance(value: u8) -> ApiResult<i16> {
    if (1..=MAX_ALLOWANCE).contains(&value) {
        Ok(i16::from(value))
    } else {
        Err(bad_request(
            "invalid_checkpoint_allowance",
            format!("items per ticket must be 1-{MAX_ALLOWANCE}"),
        ))
    }
}

async fn validate(
    pool: &PgPool,
    event_id: Uuid,
    body: &CheckpointBody,
) -> ApiResult<ValidCheckpoint> {
    let name = body.name.trim().to_owned();
    if name.is_empty() || name.chars().count() > MAX_NAME {
        return Err(bad_request(
            "invalid_checkpoint_name",
            format!("name must have 1-{MAX_NAME} characters"),
        ));
    }
    one_line(&name, "invalid_checkpoint_name")?;
    let instruction =
        super::categories::door_instruction(body.instruction.clone(), "invalid_door_instruction")?;
    let mut category_ids = body.category_ids.clone();
    category_ids.sort_unstable();
    category_ids.dedup();
    if !category_ids.is_empty() {
        let known = sqlx::query_scalar!(
            r#"select count(*) as "count!" from ticket_categories where event_id = $1 and id = any($2)"#,
            event_id,
            &category_ids,
        )
        .fetch_one(pool)
        .await?;
        if usize::try_from(known).ok() != Some(category_ids.len()) {
            return Err(bad_request(
                "invalid_checkpoint_categories",
                "unknown category",
            ));
        }
    }
    let mut category_allowances = Vec::with_capacity(category_ids.len());
    for category in &category_ids {
        let value = body
            .category_allowances
            .iter()
            .find(|item| item.category_id == *category)
            .map_or(1, |item| item.allowance);
        category_allowances.push(allowance(value)?);
    }
    if body
        .category_allowances
        .iter()
        .any(|item| !category_ids.contains(&item.category_id))
    {
        return Err(bad_request(
            "invalid_checkpoint_categories",
            "items for a category without the right",
        ));
    }
    Ok(ValidCheckpoint {
        name,
        instruction,
        category_ids,
        allowance: allowance(body.allowance)?,
        category_allowances,
    })
}

fn renamed(error: sqlx::Error) -> ApiError {
    match ApiError::from(error) {
        ApiError::Conflict("duplicate", _) => ApiError::Conflict(
            "checkpoint_exists",
            "a checkpoint with this name exists".to_owned(),
        ),
        other => other,
    }
}

/// The checkpoints of an event, in the order they were created, with their uses and open links.
pub(crate) async fn load(pool: &PgPool, event_id: Uuid) -> ApiResult<Vec<CheckpointDto>> {
    Ok(sqlx::query!(
        r#"select c.id, c.name, c.instruction, c.per_day, c.allowance,
                  array(select cc.category_id from checkpoint_categories cc
                        where cc.checkpoint_id = c.id order by cc.category_id) as "category_ids!",
                  array(select cc.allowance from checkpoint_categories cc
                        where cc.checkpoint_id = c.id order by cc.category_id) as "category_allowances!",
                  (select count(*) from door_ledger_entries l
                   where l.event_id = c.event_id and l.checkpoint = c.id) as "uses!",
                  (select count(*) from door_accesses a
                   where a.checkpoint_id = c.id and a.revoked_at is null and a.expires_at > now()) as "links!"
           from event_checkpoints c where c.event_id = $1 order by c.position, c.created_at"#,
        event_id
    )
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(|row| CheckpointDto {
        id: row.id,
        name: row.name,
        instruction: row.instruction,
        per_day: row.per_day,
        allowance: small(row.allowance),
        category_allowances: allowances(&row.category_ids, &row.category_allowances),
        category_ids: row.category_ids,
        uses: row.uses,
        links: row.links,
    })
    .collect())
}

/// The checkpoint a door link reads, as its phones need it; `None` for the entrance.
pub(crate) async fn of_access(
    pool: &PgPool,
    access_id: Uuid,
) -> ApiResult<Option<DoorCheckpointDto>> {
    Ok(sqlx::query!(
        r#"select c.id, c.name, c.instruction, c.per_day, c.allowance,
                  array(select cc.category_id from checkpoint_categories cc
                        where cc.checkpoint_id = c.id order by cc.category_id) as "category_ids!",
                  array(select cc.allowance from checkpoint_categories cc
                        where cc.checkpoint_id = c.id order by cc.category_id) as "category_allowances!"
           from door_accesses a join event_checkpoints c on c.id = a.checkpoint_id
           where a.id = $1"#,
        access_id
    )
    .fetch_optional(pool)
    .await?
    .map(|row| DoorCheckpointDto {
        id: row.id,
        name: row.name,
        instruction: row.instruction,
        per_day: row.per_day,
        allowance: small(row.allowance),
        category_allowances: allowances(&row.category_ids, &row.category_allowances),
        category_ids: row.category_ids,
    }))
}

fn small(value: i16) -> u8 {
    u8::try_from(value).unwrap_or(1)
}

/// The allowance of each listed category (ADR 0112).
fn allowances(categories: &[Uuid], values: &[i16]) -> Vec<CheckpointAllowanceDto> {
    categories
        .iter()
        .zip(values)
        .map(|(category_id, value)| CheckpointAllowanceDto {
            category_id: *category_id,
            allowance: small(*value),
        })
        .collect()
}

/// `GET /api/events/{id}/checkpoints`.
pub async fn list(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
) -> ApiResult<Json<Vec<CheckpointDto>>> {
    authorize_event(&state.pool, &user, event_id).await?;
    Ok(Json(load(&state.pool, event_id).await?))
}

async fn set_categories(
    tx: &mut Transaction<'_, Postgres>,
    checkpoint_id: Uuid,
    categories: &[Uuid],
    allowances: &[i16],
) -> ApiResult<()> {
    sqlx::query!(
        "delete from checkpoint_categories where checkpoint_id = $1",
        checkpoint_id
    )
    .execute(&mut **tx)
    .await?;
    sqlx::query!(
        r#"insert into checkpoint_categories (checkpoint_id, category_id, allowance)
           select $1, category, allowance from unnest($2::uuid[], $3::int2[]) as t(category, allowance)
           on conflict do nothing"#,
        checkpoint_id,
        categories,
        allowances,
    )
    .execute(&mut **tx)
    .await?;
    Ok(())
}

async fn one(pool: &PgPool, event_id: Uuid, checkpoint_id: Uuid) -> ApiResult<CheckpointDto> {
    load(pool, event_id)
        .await?
        .into_iter()
        .find(|checkpoint| checkpoint.id == checkpoint_id)
        .ok_or(ApiError::NotFound)
}

/// `POST /api/events/{id}/checkpoints`.
pub async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
    Json(body): Json<CheckpointBody>,
) -> ApiResult<(StatusCode, Json<CheckpointDto>)> {
    let event = authorize_event(&state.pool, &user, event_id).await?;
    // A ficha is the consumption itself (ADR 0084).
    if event.tokens() {
        return Err(bad_request(
            "checkpoints_tokens",
            "consumption tokens have no checkpoints",
        ));
    }
    let valid = validate(&state.pool, event_id, &body).await?;
    let count = sqlx::query_scalar!(
        r#"select count(*) as "count!" from event_checkpoints where event_id = $1"#,
        event_id
    )
    .fetch_one(&state.pool)
    .await?;
    if count >= MAX_CHECKPOINTS {
        return Err(ApiError::Conflict(
            "too_many_checkpoints",
            format!("an event has at most {MAX_CHECKPOINTS} checkpoints"),
        ));
    }
    let id = Uuid::new_v4();
    let mut tx = state.pool.begin().await?;
    sqlx::query!(
        r#"insert into event_checkpoints (id, event_id, name, instruction, per_day, position, allowance)
           values ($1, $2, $3, $4, $5, $6, $7)"#,
        id,
        event_id,
        valid.name,
        valid.instruction,
        body.per_day,
        i16::try_from(count).unwrap_or(i16::MAX),
        valid.allowance,
    )
    .execute(&mut *tx)
    .await
    .map_err(renamed)?;
    set_categories(&mut tx, id, &valid.category_ids, &valid.category_allowances).await?;
    tx.commit().await?;
    Ok((
        StatusCode::CREATED,
        Json(one(&state.pool, event_id, id).await?),
    ))
}

async fn checkpoint_event(
    state: &AppState,
    user: &AuthUser,
    checkpoint_id: Uuid,
) -> ApiResult<Uuid> {
    let event_id = sqlx::query_scalar!(
        "select event_id from event_checkpoints where id = $1",
        checkpoint_id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound)?;
    authorize_event(&state.pool, user, event_id).await?;
    Ok(event_id)
}

/// `PUT /api/checkpoints/{id}`: phones of its links pick the change up on their next sync.
pub async fn update(
    State(state): State<AppState>,
    user: AuthUser,
    Path(checkpoint_id): Path<Uuid>,
    Json(body): Json<CheckpointBody>,
) -> ApiResult<Json<CheckpointDto>> {
    let event_id = checkpoint_event(&state, &user, checkpoint_id).await?;
    let valid = validate(&state.pool, event_id, &body).await?;
    let mut tx = state.pool.begin().await?;
    sqlx::query!(
        "update event_checkpoints set name = $2, instruction = $3, per_day = $4, allowance = $5 where id = $1",
        checkpoint_id,
        valid.name,
        valid.instruction,
        body.per_day,
        valid.allowance,
    )
    .execute(&mut *tx)
    .await
    .map_err(renamed)?;
    set_categories(&mut tx, checkpoint_id, &valid.category_ids, &valid.category_allowances).await?;
    tx.commit().await?;
    Ok(Json(one(&state.pool, event_id, checkpoint_id).await?))
}

/// `DELETE /api/checkpoints/{id}`: its links, phones and uses go with it.
pub async fn delete(
    State(state): State<AppState>,
    user: AuthUser,
    Path(checkpoint_id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    checkpoint_event(&state, &user, checkpoint_id).await?;
    sqlx::query!("delete from event_checkpoints where id = $1", checkpoint_id)
        .execute(&state.pool)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// The checkpoints of an event go to its copy (ADR 0077 dates, duplicates), with the copies of
/// their categories; never links nor uses.
pub(crate) async fn copy(
    tx: &mut Transaction<'_, Postgres>,
    from: Uuid,
    to: Uuid,
    categories: &HashMap<Uuid, Uuid>,
) -> ApiResult<()> {
    let rows = sqlx::query!(
        r#"select c.id, c.name, c.instruction, c.per_day, c.position, c.allowance,
                  array(select cc.category_id from checkpoint_categories cc
                        where cc.checkpoint_id = c.id order by cc.category_id) as "category_ids!",
                  array(select cc.allowance from checkpoint_categories cc
                        where cc.checkpoint_id = c.id order by cc.category_id) as "category_allowances!"
           from event_checkpoints c where c.event_id = $1"#,
        from
    )
    .fetch_all(&mut **tx)
    .await?;
    for row in rows {
        let id = Uuid::new_v4();
        sqlx::query!(
            r#"insert into event_checkpoints (id, event_id, name, instruction, per_day, position, allowance)
               values ($1, $2, $3, $4, $5, $6, $7)"#,
            id,
            to,
            row.name,
            row.instruction,
            row.per_day,
            row.position,
            row.allowance,
        )
        .execute(&mut **tx)
        .await?;
        let (copied, allowances): (Vec<Uuid>, Vec<i16>) = row
            .category_ids
            .iter()
            .zip(&row.category_allowances)
            .filter_map(|(category, allowance)| {
                categories.get(category).map(|copy| (*copy, *allowance))
            })
            .unzip();
        set_categories(tx, id, &copied, &allowances).await?;
    }
    Ok(())
}
