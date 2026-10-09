//! "Novidades" (ADR 0031): notes the admins publish about what changed, each one a new
//! feature, an improvement, a fix or a security change. Anyone reads the published ones; drafts
//! stay with the admins.

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use time::OffsetDateTime;
use uuid::Uuid;

use super::admin::{audit, require_admin};
use crate::api::{ChangelogBody, ChangelogEntryDto, ChangelogKind};
use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult, bad_request};
use crate::state::AppState;

/// Published notes returned to everyone.
const PUBLIC_LIMIT: i64 = 100;
const MAX_TITLE: usize = 120;
const MAX_BODY: usize = 4000;

struct EntryRow {
    id: Uuid,
    kind: String,
    title: String,
    body: String,
    published_at: Option<OffsetDateTime>,
    created_at: OffsetDateTime,
    updated_at: OffsetDateTime,
}

impl EntryRow {
    fn into_dto(self) -> ApiResult<ChangelogEntryDto> {
        Ok(ChangelogEntryDto {
            id: self.id,
            kind: ChangelogKind::from_db(&self.kind).ok_or_else(|| {
                ApiError::Internal(anyhow::anyhow!("unknown changelog kind {}", self.kind))
            })?,
            title: self.title,
            body: self.body,
            published_at: self.published_at,
            created_at: self.created_at,
            updated_at: self.updated_at,
        })
    }
}

fn collect(rows: Vec<EntryRow>) -> ApiResult<Json<Vec<ChangelogEntryDto>>> {
    rows.into_iter()
        .map(EntryRow::into_dto)
        .collect::<ApiResult<Vec<_>>>()
        .map(Json)
}

/// `GET /api/changelog` (no login): published notes, newest first.
pub async fn public(State(state): State<AppState>) -> ApiResult<Json<Vec<ChangelogEntryDto>>> {
    let rows = sqlx::query_as!(
        EntryRow,
        r#"select id, kind, title, body, published_at, created_at, updated_at from changelog_entries
           where published_at is not null and published_at <= now()
           order by published_at desc limit $1"#,
        PUBLIC_LIMIT
    )
    .fetch_all(&state.pool)
    .await?;
    collect(rows)
}

/// `GET /api/admin/changelog`: drafts first, then published notes, newest first.
pub async fn list(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<Vec<ChangelogEntryDto>>> {
    require_admin(&user)?;
    let rows = sqlx::query_as!(
        EntryRow,
        r#"select id, kind, title, body, published_at, created_at, updated_at from changelog_entries
           order by published_at is not null, coalesce(published_at, created_at) desc"#
    )
    .fetch_all(&state.pool)
    .await?;
    collect(rows)
}

fn validate(body: &ChangelogBody) -> ApiResult<(String, String)> {
    let title = body.title.trim().to_owned();
    if title.is_empty() || title.chars().count() > MAX_TITLE {
        return Err(bad_request(
            "invalid_title",
            "title must have 1-120 characters",
        ));
    }
    let text = body.body.trim().to_owned();
    if text.chars().count() > MAX_BODY {
        return Err(bad_request(
            "invalid_body",
            "text must have up to 4000 characters",
        ));
    }
    Ok((title, text))
}

/// `POST /api/admin/changelog`.
pub async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<ChangelogBody>,
) -> ApiResult<(StatusCode, Json<ChangelogEntryDto>)> {
    require_admin(&user)?;
    let (title, text) = validate(&body)?;
    let row = sqlx::query_as!(
        EntryRow,
        r#"insert into changelog_entries (id, kind, title, body, published_at, created_by)
           values ($1, $2, $3, $4, case when $5 then now() end, $6)
           returning id, kind, title, body, published_at, created_at, updated_at"#,
        Uuid::new_v4(),
        body.kind.db(),
        title,
        text,
        body.published,
        user.id,
    )
    .fetch_one(&state.pool)
    .await?;
    audit(
        &state,
        &user,
        "changelog_create",
        None,
        None,
        Some(row.id),
        serde_json::json!({ "title": row.title }),
    )
    .await?;
    Ok((StatusCode::CREATED, Json(row.into_dto()?)))
}

/// `PUT /api/admin/changelog/{id}`: publishing keeps the first publication date; unpublishing
/// turns the note back into a draft.
pub async fn update(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<ChangelogBody>,
) -> ApiResult<Json<ChangelogEntryDto>> {
    require_admin(&user)?;
    let (title, text) = validate(&body)?;
    let row = sqlx::query_as!(
        EntryRow,
        r#"update changelog_entries
           set kind = $2, title = $3, body = $4, updated_at = now(),
               published_at = case when $5 then coalesce(published_at, now()) end
           where id = $1
           returning id, kind, title, body, published_at, created_at, updated_at"#,
        id,
        body.kind.db(),
        title,
        text,
        body.published,
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound)?;
    audit(
        &state,
        &user,
        "changelog_update",
        None,
        None,
        Some(id),
        serde_json::json!({ "published": body.published }),
    )
    .await?;
    Ok(Json(row.into_dto()?))
}

/// `DELETE /api/admin/changelog/{id}`.
pub async fn delete(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    require_admin(&user)?;
    sqlx::query_scalar!(
        "delete from changelog_entries where id = $1 returning id",
        id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound)?;
    audit(
        &state,
        &user,
        "changelog_delete",
        None,
        None,
        Some(id),
        serde_json::json!({}),
    )
    .await?;
    Ok(StatusCode::NO_CONTENT)
}
