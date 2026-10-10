//! "Novidades" (ADR 0031): notes the admins publish about what changed, each one a new
//! feature, an improvement, a fix or a security change. Anyone reads the published ones; drafts
//! stay with the admins. Each note can name the release that brought it (ADR 0049), so the public
//! page reads as release notes.

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
    version: Option<String>,
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
            version: self.version,
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
        r#"select id, kind, title, body, version, published_at, created_at, updated_at from changelog_entries
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
        r#"select id, kind, title, body, version, published_at, created_at, updated_at from changelog_entries
           order by published_at is not null, coalesce(published_at, created_at) desc"#
    )
    .fetch_all(&state.pool)
    .await?;
    collect(rows)
}

/// A release number as tagged (`1.4.0`: no `v`, no leading zeros, up to six digits a part), the
/// rule of the database check and of `scripts/release.mjs`.
fn is_version(text: &str) -> bool {
    let parts: Vec<&str> = text.split('.').collect();
    parts.len() == 3
        && parts.iter().all(|part| {
            !part.is_empty()
                && part.len() <= 6
                && part.bytes().all(|byte| byte.is_ascii_digit())
                && (part.len() == 1 || !part.starts_with('0'))
        })
}

struct Note {
    title: String,
    text: String,
    version: Option<String>,
}

fn validate(body: &ChangelogBody) -> ApiResult<Note> {
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
    let version = body
        .version
        .as_deref()
        .map(str::trim)
        .filter(|version| !version.is_empty());
    if version.is_some_and(|version| !is_version(version)) {
        return Err(bad_request(
            "invalid_version",
            "version must look like 1.4.0",
        ));
    }
    Ok(Note {
        title,
        text,
        version: version.map(str::to_owned),
    })
}

/// `POST /api/admin/changelog`.
pub async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<ChangelogBody>,
) -> ApiResult<(StatusCode, Json<ChangelogEntryDto>)> {
    require_admin(&user)?;
    let note = validate(&body)?;
    let row = sqlx::query_as!(
        EntryRow,
        r#"insert into changelog_entries (id, kind, title, body, version, published_at, created_by)
           values ($1, $2, $3, $4, $5, case when $6 then now() end, $7)
           returning id, kind, title, body, version, published_at, created_at, updated_at"#,
        Uuid::new_v4(),
        body.kind.db(),
        note.title,
        note.text,
        note.version,
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
        serde_json::json!({ "title": row.title, "version": row.version }),
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
    let note = validate(&body)?;
    let row = sqlx::query_as!(
        EntryRow,
        r#"update changelog_entries
           set kind = $2, title = $3, body = $4, version = $5, updated_at = now(),
               published_at = case when $6 then coalesce(published_at, now()) end
           where id = $1
           returning id, kind, title, body, version, published_at, created_at, updated_at"#,
        id,
        body.kind.db(),
        note.title,
        note.text,
        note.version,
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
        serde_json::json!({ "published": body.published, "version": row.version }),
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
