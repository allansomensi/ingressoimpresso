//! The admins' alerts on the panel (ADR 0103): the open ones and the recently solved, the
//! channels and settings, a test message and the summary on demand.

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use serde::Deserialize;
use uuid::Uuid;

use super::admin::{audit, require_admin};
use crate::api::{
    AdminAlertDto, AdminAlertsDto, AlertChannelsDto, AlertDeliveryDto, AlertKind, AlertSettingsDto,
    AlertSeverity,
};
use crate::auth::AuthUser;
use crate::emails;
use crate::error::{ApiError, ApiResult, bad_request};
use crate::state::AppState;

/// Alerts shown at once.
const LIST_LIMIT: i64 = 100;

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    /// Also the alerts solved in the last 30 days.
    #[serde(default)]
    resolved: bool,
}

/// `GET /api/admin/alerts?resolved=`.
pub async fn list(
    State(state): State<AppState>,
    user: AuthUser,
    Query(query): Query<ListQuery>,
) -> ApiResult<Json<AdminAlertsDto>> {
    require_admin(&user)?;
    let rows = sqlx::query!(
        r#"select a.id, a.kind, a.severity, a.title, a.detail, a.link, a.count, a.first_at,
                  a.last_at, a.notified_at, a.resolved_at, u.email as "resolved_by?"
           from admin_alerts a left join users u on u.id = a.resolved_by
           where a.resolved_at is null
              or ($1 and a.resolved_at > now() - interval '30 days')
           order by (a.resolved_at is null) desc, (a.severity = 'critical') desc, a.last_at desc
           limit $2"#,
        query.resolved,
        LIST_LIMIT,
    )
    .fetch_all(&state.pool)
    .await?;
    let open = sqlx::query_scalar!(
        r#"select count(*)::int as "count!" from admin_alerts where resolved_at is null"#
    )
    .fetch_one(&state.pool)
    .await?;
    let alerts = rows
        .into_iter()
        .filter_map(|row| {
            Some(AdminAlertDto {
                id: row.id,
                kind: AlertKind::from_db(&row.kind)?,
                severity: AlertSeverity::from_db(&row.severity)?,
                title: row.title,
                detail: row.detail,
                link: row.link,
                count: row.count,
                first_at: row.first_at,
                last_at: row.last_at,
                notified_at: row.notified_at,
                resolved_at: row.resolved_at,
                resolved_by: row.resolved_by,
            })
        })
        .collect();
    Ok(Json(AdminAlertsDto {
        alerts,
        open,
        settings: crate::alerts::settings(&state.pool).await?,
        channels: AlertChannelsDto {
            emails: state.config.admin_emails.clone(),
            telegram: state.telegram.configured(),
        },
    }))
}

/// `POST /api/admin/alerts/{id}/resolve`: solved; the same problem again opens a new alert.
pub async fn resolve(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    require_admin(&user)?;
    let resolved = sqlx::query_scalar!(
        "update admin_alerts set resolved_at = now(), resolved_by = $2 where id = $1 and resolved_at is null returning id",
        id,
        user.id,
    )
    .fetch_optional(&state.pool)
    .await?;
    if resolved.is_none() {
        return Err(ApiError::NotFound);
    }
    audit(
        &state,
        &user,
        "alert_resolve",
        None,
        None,
        Some(id),
        serde_json::json!({}),
    )
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// `PUT /api/admin/alerts/settings`.
pub async fn update_settings(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<AlertSettingsDto>,
) -> ApiResult<Json<AlertSettingsDto>> {
    require_admin(&user)?;
    if !(0..=23).contains(&body.summary_hour) {
        return Err(bad_request("invalid_hour", "the hour must be 0–23"));
    }
    if !(1..=100_000).contains(&body.door_min_tickets) {
        return Err(bad_request(
            "invalid_threshold",
            "the threshold must be 1–100000 tickets",
        ));
    }
    sqlx::query!(
        r#"update alert_settings set email = $1, telegram = $2, summary = $3, summary_hour = $4,
                  door_min_tickets = $5, updated_at = now(), updated_by = $6 where id"#,
        body.email,
        body.telegram,
        body.summary,
        body.summary_hour,
        body.door_min_tickets,
        user.id,
    )
    .execute(&state.pool)
    .await?;
    audit(
        &state,
        &user,
        "alert_settings",
        None,
        None,
        None,
        serde_json::to_value(&body).map_err(|error| ApiError::Internal(error.into()))?,
    )
    .await?;
    Ok(Json(crate::alerts::settings(&state.pool).await?))
}

/// `POST /api/admin/alerts/test`: a test message to every channel on.
pub async fn test(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<AlertDeliveryDto>> {
    require_admin(&user)?;
    let url = format!("{}/painel/admin?aba=alertas", state.config.public_web_url);
    let detail = format!(
        "Pedido por {} no painel. Se chegou, os alertas também chegam.",
        user.email
    );
    let email = emails::admin_alert(
        &emails::AdminAlert {
            critical: false,
            title: "Teste de alerta",
            detail: Some(&detail),
            url: &url,
        },
        &state.config.public_web_url,
    );
    let delivery = crate::alerts::deliver(
        &state,
        &email,
        &format!("🧪 Teste de alerta\n\n{detail}\n\n{url}"),
    )
    .await;
    Ok(Json(delivery))
}

/// `POST /api/admin/alerts/summary`: the daily summary now (it still goes out in the morning).
pub async fn summary_now(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<AlertDeliveryDto>> {
    require_admin(&user)?;
    Ok(Json(crate::alerts::send_summary(&state).await?))
}
