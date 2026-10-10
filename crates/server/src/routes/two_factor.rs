//! Two-step verification of the signed-in user (ADR 0045): set up an authenticator app, turn it
//! on with a first code (which hands out recovery codes), new recovery codes, turning it off;
//! and the admin reset for someone who lost the phone. Signing in with it is in `auth.rs`.

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use serde_json::json;
use uuid::Uuid;

use super::admin::{audit, require_admin};
use crate::api::{RecoveryCodesDto, TwoFactorCodeBody, TwoFactorSetupDto, TwoFactorStatusDto};
use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult};
use crate::state::AppState;
use crate::two_factor;

/// `GET /api/account/two-factor`.
pub async fn status(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<TwoFactorStatusDto>> {
    let row = sqlx::query!(
        r#"select u.totp_enabled_at,
                  (select count(*) from recovery_codes r where r.user_id = u.id and r.used_at is null) as "left!"
           from users u where u.id = $1"#,
        user.id
    )
    .fetch_one(&state.pool)
    .await?;
    Ok(Json(TwoFactorStatusDto {
        enabled: row.totp_enabled_at.is_some(),
        enabled_at: row.totp_enabled_at,
        recovery_codes_left: if row.totp_enabled_at.is_some() {
            row.left
        } else {
            0
        },
    }))
}

/// `POST /api/account/two-factor/setup`: a new secret (not in force until confirmed).
pub async fn setup(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<TwoFactorSetupDto>> {
    let secret = two_factor::generate_secret()?;
    let sealed = two_factor::seal(&state, user.id, secret.as_slice())?;
    let updated = sqlx::query!(
        "update users set totp_secret = $2, totp_last_step = null
         where id = $1 and totp_enabled_at is null",
        user.id,
        sealed,
    )
    .execute(&state.pool)
    .await?;
    if updated.rows_affected() == 0 {
        return Err(already_on());
    }
    let encoded = two_factor::base32(secret.as_slice());
    Ok(Json(TwoFactorSetupDto {
        // Groups of four are easier to type.
        secret: encoded
            .as_bytes()
            .chunks(4)
            .map(|chunk| String::from_utf8_lossy(chunk).into_owned())
            .collect::<Vec<_>>()
            .join(" "),
        uri: two_factor::otpauth_uri(secret.as_slice(), &user.email),
    }))
}

/// `POST /api/account/two-factor/enable`: confirms the app with its first code.
pub async fn enable(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<TwoFactorCodeBody>,
) -> ApiResult<Json<RecoveryCodesDto>> {
    let mut tx = state.pool.begin().await?;
    let row = sqlx::query!(
        "select totp_secret, totp_enabled_at from users where id = $1 for no key update",
        user.id
    )
    .fetch_one(&mut *tx)
    .await?;
    if row.totp_enabled_at.is_some() {
        return Err(already_on());
    }
    let sealed = row.totp_secret.ok_or_else(|| {
        ApiError::Conflict("two_factor_not_set_up", "start the setup again".to_owned())
    })?;
    if two_factor::locked(&state, user.id).await? {
        return Err(ApiError::TooManyRequests);
    }
    let secret = two_factor::unseal(&state, user.id, &sealed)?;
    let code: String = body.code.chars().filter(|c| !c.is_whitespace()).collect();
    let now = time::OffsetDateTime::now_utc().unix_timestamp();
    let Some(step) = two_factor::verify(&secret, &code, now, None) else {
        return Err(two_factor::failed(&state, user.id).await);
    };
    sqlx::query!(
        "update users set totp_enabled_at = now(), totp_last_step = $2 where id = $1",
        user.id,
        step
    )
    .execute(&mut *tx)
    .await?;
    let codes = two_factor::replace_recovery_codes(&state, &mut tx, user.id).await?;
    tx.commit().await?;
    Ok(Json(RecoveryCodesDto { codes }))
}

/// `POST /api/account/two-factor/recovery-codes`: new recovery codes (the old ones stop working).
pub async fn regenerate(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<TwoFactorCodeBody>,
) -> ApiResult<Json<RecoveryCodesDto>> {
    let mut tx = state.pool.begin().await?;
    require_on(&mut tx, user.id).await?;
    two_factor::check(&state, &mut tx, user.id, Some(&body.code)).await?;
    let codes = two_factor::replace_recovery_codes(&state, &mut tx, user.id).await?;
    tx.commit().await?;
    Ok(Json(RecoveryCodesDto { codes }))
}

/// `POST /api/account/two-factor/disable`: turns it off with a code of the app or a recovery code.
pub async fn disable(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<TwoFactorCodeBody>,
) -> ApiResult<StatusCode> {
    let mut tx = state.pool.begin().await?;
    require_on(&mut tx, user.id).await?;
    two_factor::check(&state, &mut tx, user.id, Some(&body.code)).await?;
    turn_off(&mut tx, user.id).await?;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

/// `POST /api/admin/users/{id}/two-factor/reset` (admins): turns it off for someone who lost the
/// phone and the recovery codes, after confirming who they are by other means.
pub async fn admin_reset(
    State(state): State<AppState>,
    user: AuthUser,
    Path(user_id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    require_admin(&user)?;
    let mut tx = state.pool.begin().await?;
    let target = sqlx::query!(
        r#"select u.email::text as "email!",
                  (select m.organization_id from memberships m where m.user_id = u.id
                   order by m.created_at limit 1) as organization_id
           from users u where u.id = $1 and u.totp_enabled_at is not null"#,
        user_id
    )
    .fetch_optional(&mut *tx)
    .await?
    .ok_or(ApiError::NotFound)?;
    turn_off(&mut tx, user_id).await?;
    tx.commit().await?;
    audit(
        &state,
        &user,
        "user_two_factor_reset",
        target.organization_id,
        None,
        Some(user_id),
        json!({ "email": target.email }),
    )
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

fn already_on() -> ApiError {
    ApiError::Conflict(
        "two_factor_enabled",
        "two-step verification is already on".to_owned(),
    )
}

async fn require_on(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    user_id: Uuid,
) -> ApiResult<()> {
    let on = sqlx::query_scalar!(
        r#"select totp_enabled_at is not null as "on!" from users where id = $1"#,
        user_id
    )
    .fetch_one(&mut **tx)
    .await?;
    if on {
        Ok(())
    } else {
        Err(ApiError::Conflict(
            "two_factor_disabled",
            "two-step verification is off".to_owned(),
        ))
    }
}

async fn turn_off(tx: &mut sqlx::Transaction<'_, sqlx::Postgres>, user_id: Uuid) -> ApiResult<()> {
    sqlx::query!(
        "update users set totp_secret = null, totp_enabled_at = null, totp_last_step = null where id = $1",
        user_id
    )
    .execute(&mut **tx)
    .await?;
    sqlx::query!("delete from recovery_codes where user_id = $1", user_id)
        .execute(&mut **tx)
        .await?;
    Ok(())
}
