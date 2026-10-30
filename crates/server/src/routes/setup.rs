//! The setup assistant (ADR 0126): the panel asks how the event works (one ticket or several,
//! days, a document at the door, something extra like a dinner, the wristbands) and sends the
//! answers here as categories with how many numbers each takes and the checkpoints. Everything is
//! created in one transaction, with the same rules as one category or checkpoint at a time, so a
//! mistake halfway leaves the event as it was.

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use sqlx::{Postgres, Transaction};
use uuid::Uuid;

use super::categories::{self, MAX_CATEGORIES};
use super::checkpoints::{self, MAX_CHECKPOINTS};
use super::{authorize_event, range};
use crate::api::{CheckpointBody, DayRule, EventSetupBody, EventSetupDto, SetupCheckpointBody};
use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult, bad_request};
use crate::state::AppState;

/// Most numbers of one category: more than a stadium, few enough for one request.
const MAX_QUANTITY: i32 = 10_000;
/// Most numbers the assistant gives out in all.
const MAX_TOTAL: i32 = 50_000;

/// `POST /api/events/{id}/setup`: categories with consecutive numbers from 1 and the
/// checkpoints, for an event without categories nor checkpoints yet.
pub async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
    Json(body): Json<EventSetupBody>,
) -> ApiResult<(StatusCode, Json<EventSetupDto>)> {
    let event = authorize_event(&state.pool, &user, event_id).await?;
    if body.categories.is_empty()
        || i64::try_from(body.categories.len()).unwrap_or(i64::MAX) > MAX_CATEGORIES
    {
        return Err(bad_request(
            "invalid_setup",
            format!("1 to {MAX_CATEGORIES} categories"),
        ));
    }
    if event.tokens() && !body.checkpoints.is_empty() {
        return Err(bad_request(
            "checkpoints_tokens",
            "consumption tokens have no checkpoints",
        ));
    }
    if i64::try_from(body.checkpoints.len()).unwrap_or(i64::MAX) > MAX_CHECKPOINTS {
        return Err(bad_request(
            "too_many_checkpoints",
            format!("an event has at most {MAX_CHECKPOINTS} checkpoints"),
        ));
    }
    let shape = categories::event_shape(&state.pool, event_id).await?;
    let valid = checked(&body, &shape)?;

    let mut tx = state.pool.begin().await?;
    // Locks the event, so two clicks on "Criar tudo" cannot both find it empty.
    sqlx::query!("select id from events where id = $1 for update", event_id)
        .fetch_one(&mut *tx)
        .await?;
    let taken = sqlx::query_scalar!(
        r#"select exists(select 1 from ticket_categories where event_id = $1)
                  or exists(select 1 from event_checkpoints where event_id = $1) as "taken!""#,
        event_id
    )
    .fetch_one(&mut *tx)
    .await?;
    if taken {
        return Err(ApiError::Conflict(
            "setup_not_empty",
            "the event already has categories or checkpoints".to_owned(),
        ));
    }

    let mut ids = Vec::with_capacity(valid.len());
    let mut first = 1_i32;
    for ((position, item), category) in body.categories.iter().enumerate().zip(valid) {
        let id = Uuid::new_v4();
        let (day_rule, valid_days) = category.day_rule.unwrap_or((DayRule::Every, Vec::new()));
        sqlx::query!(
            r#"insert into ticket_categories (id, event_id, name, color, price_cents, position,
                                             check_document, document_note, door_instruction,
                                             day_rule, valid_days)
               values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)"#,
            id,
            event_id,
            category.name,
            category.color,
            item.category.price_cents,
            i16::try_from(position).unwrap_or(i16::MAX),
            category.check_document,
            category.document_note,
            category.door_instruction,
            day_rule.db(),
            &valid_days,
        )
        .execute(&mut *tx)
        .await
        .map_err(categories::renamed)?;
        let last = first + item.quantity - 1;
        sqlx::query!(
            "insert into category_ranges (id, event_id, category_id, numbers) values ($1, $2, $3, $4)",
            Uuid::new_v4(),
            event_id,
            id,
            range(first, last)?,
        )
        .execute(&mut *tx)
        .await?;
        first = last + 1;
        ids.push(id);
    }

    insert_checkpoints(&mut tx, event_id, &body.checkpoints, &ids).await?;
    tx.commit().await?;

    let (categories, checkpoints) = tokio::try_join!(
        categories::load(&state.pool, event_id),
        checkpoints::load(&state.pool, event_id),
    )?;
    Ok((
        StatusCode::CREATED,
        Json(EventSetupDto {
            categories,
            checkpoints,
        }),
    ))
}

/// Every category checked, and the numbers they take within the limits.
fn checked(
    body: &EventSetupBody,
    shape: &categories::EventShape,
) -> ApiResult<Vec<categories::ValidCategory>> {
    let mut valid = Vec::with_capacity(body.categories.len());
    let mut total = 0_i32;
    for item in &body.categories {
        if !(1..=MAX_QUANTITY).contains(&item.quantity) {
            return Err(bad_request(
                "invalid_setup_quantity",
                format!("1 to {MAX_QUANTITY} numbers per category"),
            ));
        }
        total = total.saturating_add(item.quantity);
        valid.push(categories::validate(&item.category, shape)?);
    }
    if total > MAX_TOTAL {
        return Err(bad_request(
            "invalid_setup_quantity",
            format!("at most {MAX_TOTAL} numbers in all"),
        ));
    }
    Ok(valid)
}

/// The checkpoints, their categories given by place in `ids` (the categories just created).
async fn insert_checkpoints(
    tx: &mut Transaction<'_, Postgres>,
    event_id: Uuid,
    checkpoints: &[SetupCheckpointBody],
    ids: &[Uuid],
) -> ApiResult<()> {
    for (position, item) in checkpoints.iter().enumerate() {
        let mut category_ids = Vec::with_capacity(item.categories.len());
        for index in &item.categories {
            let id = ids
                .get(usize::from(*index))
                .ok_or_else(|| bad_request("invalid_checkpoint_categories", "unknown category"))?;
            category_ids.push(*id);
        }
        // An empty list would mean "every ticket": the assistant always says who has the right.
        if category_ids.is_empty() {
            return Err(bad_request(
                "invalid_checkpoint_categories",
                "choose who has the right",
            ));
        }
        let checkpoint = CheckpointBody {
            name: item.name.clone(),
            instruction: item.instruction.clone(),
            per_day: item.per_day,
            category_ids,
            allowance: item.allowance,
            category_allowances: Vec::new(),
        };
        let valid = checkpoints::validate(&mut **tx, event_id, &checkpoint).await?;
        // Every entitled category hands over the same number of items.
        let allowances = vec![valid.allowance; valid.category_ids.len()];
        let id = Uuid::new_v4();
        sqlx::query!(
            r#"insert into event_checkpoints (id, event_id, name, instruction, per_day, position, allowance)
               values ($1, $2, $3, $4, $5, $6, $7)"#,
            id,
            event_id,
            valid.name,
            valid.instruction,
            item.per_day,
            i16::try_from(position).unwrap_or(i16::MAX),
            valid.allowance,
        )
        .execute(&mut **tx)
        .await
        .map_err(checkpoints::renamed)?;
        checkpoints::set_categories(tx, id, &valid.category_ids, &allowances).await?;
    }
    Ok(())
}
