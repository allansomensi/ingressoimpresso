//! Status page (ADR 0043): live checks of the service plus incidents and planned maintenance
//! written by admins. The public answer is cached for a few seconds, so a busy status page does
//! not become load on the database.

use std::time::{Duration, Instant};

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use time::OffsetDateTime;
use uuid::Uuid;

use super::admin::{audit, require_admin};
use crate::api::{
    IncidentBody, IncidentDto, IncidentImpact, IncidentKind, IncidentStatus, IncidentUpdateBody,
    IncidentUpdateDto, MaintenanceMode, ServiceStatus, StatusComponentDto, StatusDto,
};
use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult, bad_request};
use crate::mail::Mailer;
use crate::state::AppState;

/// Parts of the service shown on the page, in order.
pub const COMPONENTS: [&str; 6] = ["site", "panel", "door", "files", "email", "payments"];
const CACHE_TTL: Duration = Duration::from_secs(15);
/// A database slower than this is "degraded".
const SLOW_DATABASE: Duration = Duration::from_millis(800);
/// The worker loops at least hourly; past this it is late.
const WORKER_LATE_SECONDS: i64 = 75 * 60;
const RECENT_DAYS: i64 = 90;

struct IncidentRow {
    id: Uuid,
    kind: String,
    title: String,
    impact: String,
    status: String,
    components: Vec<String>,
    scheduled_for: Option<OffsetDateTime>,
    scheduled_until: Option<OffsetDateTime>,
    started_at: OffsetDateTime,
    resolved_at: Option<OffsetDateTime>,
}

async fn load_incidents(state: &AppState, filter: IncidentFilter) -> ApiResult<Vec<IncidentDto>> {
    let (active, recent, id) = match filter {
        IncidentFilter::Active => (Some(true), None, None),
        IncidentFilter::Recent => (Some(false), Some(RECENT_DAYS), None),
        IncidentFilter::All => (None, None, None),
        IncidentFilter::One(id) => (None, None, Some(id)),
    };
    let rows = sqlx::query_as!(
        IncidentRow,
        r#"select id, kind, title, impact, status, components, scheduled_for, scheduled_until,
                  started_at, resolved_at
           from status_incidents
           where ($1::bool is null or (resolved_at is null) = $1)
             and ($2::bigint is null or resolved_at > now() - make_interval(days => $2::int))
             and ($3::uuid is null or id = $3)
           order by coalesce(scheduled_for, started_at) desc limit 100"#,
        active,
        recent,
        id,
    )
    .fetch_all(&state.pool)
    .await?;
    let ids: Vec<Uuid> = rows.iter().map(|row| row.id).collect();
    let updates = sqlx::query!(
        r#"select id, incident_id, status, body, created_at from status_incident_updates
           where incident_id = any($1) order by created_at desc"#,
        &ids
    )
    .fetch_all(&state.pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|row| IncidentDto {
            updates: updates
                .iter()
                .filter(|update| update.incident_id == row.id)
                .map(|update| IncidentUpdateDto {
                    id: update.id,
                    status: IncidentStatus::from_db(&update.status)
                        .unwrap_or(IncidentStatus::Investigating),
                    body: update.body.clone(),
                    created_at: update.created_at,
                })
                .collect(),
            id: row.id,
            kind: IncidentKind::from_db(&row.kind).unwrap_or(IncidentKind::Incident),
            title: row.title,
            impact: IncidentImpact::from_db(&row.impact).unwrap_or(IncidentImpact::Minor),
            status: IncidentStatus::from_db(&row.status).unwrap_or(IncidentStatus::Investigating),
            components: row.components,
            scheduled_for: row.scheduled_for,
            scheduled_until: row.scheduled_until,
            started_at: row.started_at,
            resolved_at: row.resolved_at,
        })
        .collect())
}

enum IncidentFilter {
    Active,
    Recent,
    All,
    One(Uuid),
}

fn worse(a: ServiceStatus, b: ServiceStatus) -> ServiceStatus {
    let rank = |status| match status {
        ServiceStatus::Operational => 0,
        ServiceStatus::Maintenance => 1,
        ServiceStatus::Degraded => 2,
        ServiceStatus::Down => 3,
    };
    if rank(b) > rank(a) { b } else { a }
}

/// What an open incident does to the parts it names.
fn incident_effect(incident: &IncidentDto, now: OffsetDateTime) -> Option<ServiceStatus> {
    match incident.kind {
        IncidentKind::Maintenance => {
            let started = incident.scheduled_for.is_none_or(|start| start <= now)
                && incident.status != IncidentStatus::Scheduled;
            started.then_some(ServiceStatus::Maintenance)
        }
        IncidentKind::Incident => match incident.impact {
            IncidentImpact::None => None,
            IncidentImpact::Minor | IncidentImpact::Major => Some(ServiceStatus::Degraded),
            IncidentImpact::Critical => Some(ServiceStatus::Down),
        },
    }
}

async fn compute(state: &AppState) -> ApiResult<StatusDto> {
    let now = OffsetDateTime::now_utc();
    let started = Instant::now();
    let database = sqlx::query_scalar!("select 1 as one")
        .fetch_one(&state.pool)
        .await;
    let database = match database {
        Ok(_) if started.elapsed() > SLOW_DATABASE => ServiceStatus::Degraded,
        Ok(_) => ServiceStatus::Operational,
        Err(error) => {
            tracing::error!(%error, "status: database check failed");
            ServiceStatus::Down
        }
    };
    let heartbeat = state
        .worker_heartbeat
        .load(std::sync::atomic::Ordering::Relaxed);
    let worker = if heartbeat > 0 && now.unix_timestamp() - heartbeat <= WORKER_LATE_SECONDS {
        ServiceStatus::Operational
    } else {
        ServiceStatus::Degraded
    };
    let mut email = ServiceStatus::Operational;
    if database != ServiceStatus::Down && matches!(state.mailer, Mailer::Resend { .. }) {
        let recent = sqlx::query!(
            r#"select count(*) filter (where status <> 'quota') as "counted!",
                      count(*) filter (where status = 'failed' and created_at > now() - interval '1 hour') as "failed!",
                      count(*) filter (where status in ('sent', 'delivered') and created_at > now() - interval '1 hour') as "ok!"
               from mail_sends where created_at > now() - interval '24 hours'"#
        )
        .fetch_one(&state.pool)
        .await?;
        let quota_spent = state
            .config
            .mail_daily_limit
            .is_some_and(|limit| recent.counted >= limit);
        if quota_spent || (recent.failed >= 3 && recent.ok == 0) {
            email = ServiceStatus::Degraded;
        }
    }
    let settings = state.settings.get(&state.pool).await?;
    let (active, recent) = if database == ServiceStatus::Down {
        (Vec::new(), Vec::new())
    } else {
        (
            load_incidents(state, IncidentFilter::Active).await?,
            load_incidents(state, IncidentFilter::Recent).await?,
        )
    };
    let mut components: Vec<StatusComponentDto> = COMPONENTS
        .iter()
        .filter(|key| **key != "payments" || state.payments.enabled())
        .map(|key| {
            let live = match *key {
                "panel" => database,
                "files" => worse(
                    worker,
                    if database == ServiceStatus::Down {
                        ServiceStatus::Degraded
                    } else {
                        ServiceStatus::Operational
                    },
                ),
                "email" => email,
                _ => ServiceStatus::Operational,
            };
            let from_incidents = active
                .iter()
                .filter(|incident| incident.components.iter().any(|component| component == key))
                .filter_map(|incident| incident_effect(incident, now))
                .fold(ServiceStatus::Operational, worse);
            StatusComponentDto {
                key: (*key).to_owned(),
                status: worse(live, from_incidents),
            }
        })
        .collect();
    if settings.maintenance_mode != MaintenanceMode::Off {
        for component in &mut components {
            if component.key == "panel" {
                component.status = worse(component.status, ServiceStatus::Maintenance);
            }
        }
    }
    let status = components
        .iter()
        .map(|component| component.status)
        .fold(ServiceStatus::Operational, worse);
    Ok(StatusDto {
        status,
        version: crate::VERSION.to_owned(),
        checked_at: now,
        components,
        maintenance: settings.maintenance(),
        active,
        recent,
    })
}

/// `GET /api/status` (no login).
pub async fn public(State(state): State<AppState>) -> ApiResult<Json<StatusDto>> {
    if let Some((at, cached)) = state.status_cache.read().await.as_ref()
        && at.elapsed() < CACHE_TTL
    {
        return Ok(Json(cached.clone()));
    }
    let status = compute(&state).await?;
    *state.status_cache.write().await = Some((Instant::now(), status.clone()));
    Ok(Json(status))
}

/// Drops the cached status after an admin change.
async fn invalidate(state: &AppState) {
    *state.status_cache.write().await = None;
}

/// `GET /api/admin/incidents`.
pub async fn list(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<Vec<IncidentDto>>> {
    require_admin(&user)?;
    Ok(Json(load_incidents(&state, IncidentFilter::All).await?))
}

struct ValidIncident {
    title: String,
    components: Vec<String>,
}

fn validate(body: &IncidentBody) -> ApiResult<ValidIncident> {
    let title = body.title.trim().to_owned();
    if !(3..=120).contains(&title.chars().count()) {
        return Err(bad_request("invalid_title", "title of 3 to 120 characters"));
    }
    let mut components: Vec<String> = body
        .components
        .iter()
        .map(|component| component.trim().to_owned())
        .collect();
    components.sort();
    components.dedup();
    if components
        .iter()
        .any(|component| !COMPONENTS.contains(&component.as_str()))
    {
        return Err(bad_request(
            "invalid_components",
            "unknown part of the service",
        ));
    }
    if body.kind == IncidentKind::Maintenance && body.scheduled_for.is_none() {
        return Err(bad_request(
            "invalid_dates",
            "planned maintenance needs a start",
        ));
    }
    if let (Some(start), Some(end)) = (body.scheduled_for, body.scheduled_until)
        && end <= start
    {
        return Err(bad_request(
            "invalid_dates",
            "the end must be after the start",
        ));
    }
    Ok(ValidIncident { title, components })
}

fn validate_update(body: &str) -> ApiResult<String> {
    let body = body.trim().to_owned();
    if body.is_empty() || body.chars().count() > 2000 {
        return Err(bad_request("invalid_body", "text of 1 to 2000 characters"));
    }
    Ok(body)
}

async fn one(state: &AppState, id: Uuid) -> ApiResult<IncidentDto> {
    load_incidents(state, IncidentFilter::One(id))
        .await?
        .into_iter()
        .next()
        .ok_or(ApiError::NotFound)
}

/// `POST /api/admin/incidents`: with its first update.
pub async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<IncidentBody>,
) -> ApiResult<(StatusCode, Json<IncidentDto>)> {
    require_admin(&user)?;
    let valid = validate(&body)?;
    let message = validate_update(body.message.as_deref().unwrap_or_default())?;
    let status = body.status.unwrap_or(match body.kind {
        IncidentKind::Maintenance => IncidentStatus::Scheduled,
        IncidentKind::Incident => IncidentStatus::Investigating,
    });
    let mut tx = state.pool.begin().await?;
    let id = sqlx::query_scalar!(
        r#"insert into status_incidents
             (id, kind, title, impact, status, components, scheduled_for, scheduled_until, started_at,
              resolved_at, created_by)
           values ($1, $2, $3, $4, $5, $6, $7, $8, coalesce($7, now()),
                   case when $5 = 'resolved' then now() end, $9)
           returning id"#,
        Uuid::new_v4(),
        body.kind.db(),
        valid.title,
        body.impact.db(),
        status.db(),
        &valid.components,
        body.scheduled_for,
        body.scheduled_until,
        user.id,
    )
    .fetch_one(&mut *tx)
    .await?;
    sqlx::query!(
        "insert into status_incident_updates (id, incident_id, status, body, author_id) values ($1, $2, $3, $4, $5)",
        Uuid::new_v4(),
        id,
        status.db(),
        message,
        user.id,
    )
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    invalidate(&state).await;
    audit(
        &state,
        &user,
        "incident_create",
        None,
        None,
        Some(id),
        serde_json::json!({ "title": valid.title, "kind": body.kind.db(), "impact": body.impact.db() }),
    )
    .await?;
    Ok((StatusCode::CREATED, Json(one(&state, id).await?)))
}

/// `PUT /api/admin/incidents/{id}`: title, impact, parts, schedule.
pub async fn update(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<IncidentBody>,
) -> ApiResult<Json<IncidentDto>> {
    require_admin(&user)?;
    let valid = validate(&body)?;
    let updated = sqlx::query!(
        r#"update status_incidents set kind = $2, title = $3, impact = $4, components = $5,
                  scheduled_for = $6, scheduled_until = $7
           where id = $1"#,
        id,
        body.kind.db(),
        valid.title,
        body.impact.db(),
        &valid.components,
        body.scheduled_for,
        body.scheduled_until,
    )
    .execute(&state.pool)
    .await?
    .rows_affected();
    if updated == 0 {
        return Err(ApiError::NotFound);
    }
    invalidate(&state).await;
    audit(
        &state,
        &user,
        "incident_update",
        None,
        None,
        Some(id),
        serde_json::json!({ "title": valid.title }),
    )
    .await?;
    Ok(Json(one(&state, id).await?))
}

/// `POST /api/admin/incidents/{id}/updates`: a new message, which moves the status.
pub async fn post_update(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<IncidentUpdateBody>,
) -> ApiResult<Json<IncidentDto>> {
    require_admin(&user)?;
    let text = validate_update(&body.body)?;
    let mut tx = state.pool.begin().await?;
    let updated = sqlx::query!(
        r#"update status_incidents set status = $2,
                  resolved_at = case when $2 = 'resolved' then coalesce(resolved_at, now()) end
           where id = $1"#,
        id,
        body.status.db(),
    )
    .execute(&mut *tx)
    .await?
    .rows_affected();
    if updated == 0 {
        return Err(ApiError::NotFound);
    }
    sqlx::query!(
        "insert into status_incident_updates (id, incident_id, status, body, author_id) values ($1, $2, $3, $4, $5)",
        Uuid::new_v4(),
        id,
        body.status.db(),
        text,
        user.id,
    )
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    invalidate(&state).await;
    audit(
        &state,
        &user,
        "incident_post",
        None,
        None,
        Some(id),
        serde_json::json!({ "status": body.status.db() }),
    )
    .await?;
    Ok(Json(one(&state, id).await?))
}

/// `DELETE /api/admin/incidents/{id}`.
pub async fn delete(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    require_admin(&user)?;
    let deleted = sqlx::query!("delete from status_incidents where id = $1", id)
        .execute(&state.pool)
        .await?
        .rows_affected();
    if deleted == 0 {
        return Err(ApiError::NotFound);
    }
    invalidate(&state).await;
    audit(
        &state,
        &user,
        "incident_delete",
        None,
        None,
        Some(id),
        serde_json::json!({}),
    )
    .await?;
    Ok(StatusCode::NO_CONTENT)
}
