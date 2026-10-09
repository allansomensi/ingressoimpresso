//! Platform status and settings (ADR 0037): what every screen needs to know (maintenance, new
//! accounts, a running promotion, announced prices) and the admin switches.

use axum::Json;
use axum::extract::State;
use time::OffsetDateTime;

use super::admin::{audit, require_admin};
use crate::api::{MaintenanceMode, PlatformSettingsBody, PlatformSettingsDto, PlatformStatusDto};
use crate::auth::AuthUser;
use crate::error::{ApiResult, bad_request};
use crate::platform::{self, MAX_MESSAGE, PlatformSettings};
use crate::pricing;
use crate::state::AppState;

/// `GET /api/platform` (no login).
pub async fn status(State(state): State<AppState>) -> ApiResult<Json<PlatformStatusDto>> {
    let settings = state.settings.get(&state.pool).await?;
    let promotion = pricing::active_promotion(&state.pool).await?;
    let upcoming = pricing::upcoming(&state.pool).await?;
    Ok(Json(PlatformStatusDto {
        maintenance: settings.maintenance(),
        registrations_open: settings.registrations_open,
        promotion: promotion.map(|promotion| promotion.dto),
        new_prices_at: upcoming.map(|table| table.effective_at),
    }))
}

async fn settings_dto(
    state: &AppState,
    settings: PlatformSettings,
) -> ApiResult<PlatformSettingsDto> {
    let updated_by = match settings.updated_by {
        Some(id) => {
            sqlx::query_scalar!(
                r#"select email::text as "email!" from users where id = $1"#,
                id
            )
            .fetch_optional(&state.pool)
            .await?
        }
        None => None,
    };
    Ok(PlatformSettingsDto {
        maintenance: settings.maintenance(),
        registrations_open: settings.registrations_open,
        blocked_email_domains: settings.blocked_email_domains,
        updated_at: settings.updated_at,
        updated_by,
    })
}

/// `GET /api/admin/settings`.
pub async fn get(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<PlatformSettingsDto>> {
    require_admin(&user)?;
    let settings = platform::load(&state.pool).await?;
    Ok(Json(settings_dto(&state, settings).await?))
}

/// `PUT /api/admin/settings`: every switch at once. The server sets when maintenance started.
pub async fn update(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<PlatformSettingsBody>,
) -> ApiResult<Json<PlatformSettingsDto>> {
    require_admin(&user)?;
    let message = super::optional_text(body.maintenance_message);
    if message
        .as_ref()
        .is_some_and(|text| text.chars().count() > MAX_MESSAGE)
    {
        return Err(bad_request(
            "invalid_message",
            format!("message up to {MAX_MESSAGE} characters"),
        ));
    }
    if body
        .maintenance_ends_at
        .is_some_and(|ends_at| ends_at <= OffsetDateTime::now_utc())
    {
        return Err(bad_request(
            "invalid_dates",
            "the expected end is in the past",
        ));
    }
    let domains = platform::normalize_domains(&body.blocked_email_domains)?;
    let previous = platform::load(&state.pool).await?;
    let mode = body.maintenance_mode;
    let started_at = match mode {
        MaintenanceMode::Off => None,
        _ if mode == previous.maintenance_mode => previous.maintenance_started_at,
        _ => Some(OffsetDateTime::now_utc()),
    };
    let (message, ends_at) = if mode == MaintenanceMode::Off {
        (None, None)
    } else {
        (message, body.maintenance_ends_at)
    };
    sqlx::query!(
        r#"update platform_settings set maintenance_mode = $1, maintenance_message = $2,
                  maintenance_ends_at = $3, maintenance_started_at = $4, registrations_open = $5,
                  blocked_email_domains = $6, updated_at = now(), updated_by = $7
           where id"#,
        mode.db(),
        message,
        ends_at,
        started_at,
        body.registrations_open,
        &domains,
        user.id,
    )
    .execute(&state.pool)
    .await?;
    let settings = platform::load(&state.pool).await?;
    state.settings.set(settings.clone()).await;
    audit(
        &state,
        &user,
        "settings_update",
        None,
        None,
        None,
        serde_json::json!({
            "maintenance": { "from": previous.maintenance_mode.db(), "to": mode.db() },
            "registrationsOpen": { "from": previous.registrations_open, "to": body.registrations_open },
            "blockedDomains": domains.len(),
        }),
    )
    .await?;
    Ok(Json(settings_dto(&state, settings).await?))
}
