//! Export requests, status and short-lived download links (ADR 0016).

use axum::Json;
use axum::body::Body;
use axum::extract::{Path, State};
use axum::http::header::{CACHE_CONTROL, CONTENT_DISPOSITION, CONTENT_LENGTH, CONTENT_TYPE};
use axum::http::{HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use time::{Duration, OffsetDateTime};
use tokio_util::io::ReaderStream;
use uuid::Uuid;

use super::authorize_event;
use crate::api::{
    CreateExportBody, DownloadLinkDto, ExportDto, ExportKind, ExportScope, ExportStatus,
};
use crate::auth::{AuthUser, new_token, token_hash};
use crate::error::{ApiError, ApiResult, bad_request};
use crate::jobs;
use crate::state::AppState;

const LINK_TTL: Duration = Duration::minutes(10);

pub(crate) struct ExportRow {
    pub id: Uuid,
    pub event_id: Uuid,
    pub kind: String,
    pub scope: serde_json::Value,
    pub crop_marks: bool,
    pub status: String,
    pub ticket_count: Option<i32>,
    pub file_name: Option<String>,
    pub byte_size: Option<i64>,
    pub error: Option<String>,
    pub created_at: OffsetDateTime,
}

impl ExportRow {
    pub(crate) fn kind(&self) -> ApiResult<ExportKind> {
        ExportKind::from_db(&self.kind)
            .ok_or_else(|| ApiError::Internal(anyhow::anyhow!("unknown kind {}", self.kind)))
    }

    pub(crate) fn scope(&self) -> ApiResult<ExportScope> {
        serde_json::from_value(self.scope.clone()).map_err(|error| ApiError::Internal(error.into()))
    }

    fn into_dto(self) -> ApiResult<ExportDto> {
        Ok(ExportDto {
            kind: self.kind()?,
            scope: self.scope()?,
            status: ExportStatus::from_db(&self.status).ok_or_else(|| {
                ApiError::Internal(anyhow::anyhow!("unknown status {}", self.status))
            })?,
            id: self.id,
            ticket_count: self.ticket_count,
            file_name: self.file_name,
            byte_size: self.byte_size,
            error: self.error,
            created_at: self.created_at,
        })
    }
}

/// `POST /api/events/{id}/exports`: queues a file; the worker generates it.
pub async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
    Json(body): Json<CreateExportBody>,
) -> ApiResult<(StatusCode, Json<ExportDto>)> {
    authorize_event(&state.pool, &user, event_id).await?;
    let belongs = match body.scope {
        ExportScope::All => true,
        ExportScope::Batch { batch_id } => sqlx::query_scalar!(
            r#"select exists(select 1 from ticket_batches where id = $1 and event_id = $2) as "exists!""#,
            batch_id,
            event_id
        )
        .fetch_one(&state.pool)
        .await?,
        ExportScope::Seller { seller_id } => sqlx::query_scalar!(
            r#"select exists(select 1 from sellers where id = $1 and event_id = $2) as "exists!""#,
            seller_id,
            event_id
        )
        .fetch_one(&state.pool)
        .await?,
    };
    if !belongs {
        return Err(bad_request(
            "invalid_scope",
            "batch or seller does not belong to this event",
        ));
    }
    // Art under review or refused is never printed (ADR 0042).
    crate::moderation::ensure_event_printable(&state.pool, event_id).await?;
    let scope = serde_json::to_value(body.scope).map_err(anyhow::Error::from)?;
    let row = sqlx::query_as!(
        ExportRow,
        r#"insert into exports (id, event_id, requested_by, kind, scope, crop_marks)
           values ($1, $2, $3, $4, $5, $6)
           returning id, event_id, kind, scope, crop_marks, status, ticket_count, file_name, byte_size, error, created_at"#,
        Uuid::new_v4(),
        event_id,
        user.id,
        body.kind.db(),
        scope,
        body.crop_marks.unwrap_or(true),
    )
    .fetch_one(&state.pool)
    .await?;
    state.jobs.notify_one();
    Ok((StatusCode::ACCEPTED, Json(row.into_dto()?)))
}

/// `GET /api/events/{id}/exports`: the 30 most recent.
pub async fn list(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
) -> ApiResult<Json<Vec<ExportDto>>> {
    authorize_event(&state.pool, &user, event_id).await?;
    let rows = sqlx::query_as!(
        ExportRow,
        r#"select id, event_id, kind, scope, crop_marks, status, ticket_count, file_name, byte_size, error, created_at
           from exports where event_id = $1 order by created_at desc limit 30"#,
        event_id
    )
    .fetch_all(&state.pool)
    .await?;
    rows.into_iter()
        .map(ExportRow::into_dto)
        .collect::<ApiResult<Vec<_>>>()
        .map(Json)
}

async fn authorized_export(
    state: &AppState,
    user: &AuthUser,
    export_id: Uuid,
) -> ApiResult<ExportRow> {
    let row = sqlx::query_as!(
        ExportRow,
        r#"select id, event_id, kind, scope, crop_marks, status, ticket_count, file_name, byte_size, error, created_at
           from exports where id = $1"#,
        export_id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound)?;
    authorize_event(&state.pool, user, row.event_id).await?;
    Ok(row)
}

/// `GET /api/exports/{id}`.
pub async fn get(
    State(state): State<AppState>,
    user: AuthUser,
    Path(export_id): Path<Uuid>,
) -> ApiResult<Json<ExportDto>> {
    Ok(Json(
        authorized_export(&state, &user, export_id)
            .await?
            .into_dto()?,
    ))
}

/// `POST /api/exports/{id}/link`: a 10-minute link that downloads without authentication.
pub async fn link(
    State(state): State<AppState>,
    user: AuthUser,
    Path(export_id): Path<Uuid>,
) -> ApiResult<Json<DownloadLinkDto>> {
    let export = authorized_export(&state, &user, export_id).await?;
    if export.status != ExportStatus::Done.db() {
        return Err(ApiError::Conflict(
            "export_not_ready",
            "export is not done".to_owned(),
        ));
    }
    let (token, hash) = new_token()?;
    let expires_at = OffsetDateTime::now_utc() + LINK_TTL;
    sqlx::query!(
        "insert into download_links (token_hash, export_id, expires_at) values ($1, $2, $3)",
        hash,
        export_id,
        expires_at
    )
    .execute(&state.pool)
    .await?;
    Ok(Json(DownloadLinkDto {
        url: format!("{}/api/downloads/{token}", state.config.public_api_url),
        expires_at,
    }))
}

/// `GET /api/downloads/{token}`: streams the file. No authentication: the token is the capability.
pub async fn download(
    State(state): State<AppState>,
    Path(token): Path<String>,
) -> ApiResult<Response> {
    if token.len() > 128 {
        return Err(ApiError::NotFound);
    }
    let row = sqlx::query!(
        r#"select e.id, e.kind, e.file_name from download_links d join exports e on e.id = d.export_id
           where d.token_hash = $1 and d.expires_at > now() and e.status = 'done'"#,
        token_hash(&token)
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound)?;
    let kind = ExportKind::from_db(&row.kind)
        .ok_or_else(|| anyhow::anyhow!("unknown kind {}", row.kind))?;
    let path = jobs::export_path(&state.config.export_dir, row.id, kind);
    let file = match tokio::fs::File::open(&path).await {
        Ok(file) => file,
        // The disk is ephemeral (ADR 0013): after a restart the file must be generated again.
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Err(ApiError::Gone("export_expired"));
        }
        Err(error) => return Err(ApiError::Internal(error.into())),
    };
    let length = file.metadata().await.map_err(anyhow::Error::from)?.len();
    let name = row.file_name.unwrap_or_else(|| "ingressos".to_owned());
    let disposition = HeaderValue::from_str(&format!("attachment; filename=\"{name}\""))
        .map_err(|error| ApiError::Internal(error.into()))?;
    Ok((
        [
            (
                CONTENT_TYPE,
                HeaderValue::from_static(jobs::content_type(kind)),
            ),
            (CONTENT_DISPOSITION, disposition),
            (CONTENT_LENGTH, HeaderValue::from(length)),
            (CACHE_CONTROL, HeaderValue::from_static("private, no-store")),
        ],
        Body::from_stream(ReaderStream::new(file)),
    )
        .into_response())
}
