//! The e-mail panel (ADR 0041): every message the service sends, its delivery status (from the
//! Resend webhook when configured), daily counts against the quota, and a test send.

use axum::Json;
use axum::body::Bytes;
use axum::extract::{Query, State};
use axum::http::{HeaderMap, StatusCode};
use base64::Engine as _;
use hmac::{Hmac, KeyInit as _, Mac as _};
use serde::Deserialize;
use sha2::Sha256;
use time::OffsetDateTime;

use super::admin::{audit, like_pattern, require_admin};
use crate::api::{CountDto, MailDayDto, MailLogDto, MailLogPageDto, MailStatus, MailSummaryDto};
use crate::auth::AuthUser;
use crate::emails;
use crate::error::{ApiError, ApiResult, bad_request};
use crate::mail::{MailKind, Mailer};
use crate::state::AppState;

const DEFAULT_PER_PAGE: i64 = 25;
const MAX_PER_PAGE: i64 = 100;
/// Webhook deliveries older than this are refused (replays).
const WEBHOOK_TOLERANCE_SECONDS: i64 = 5 * 60;

/// Filters of the log.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MailQuery {
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    kind: Option<String>,
    #[serde(default)]
    q: Option<String>,
    #[serde(default)]
    page: Option<i64>,
    #[serde(default)]
    per_page: Option<i64>,
}

/// `GET /api/admin/emails?status=&kind=&q=&page=&perPage=`: newest first.
pub async fn list(
    State(state): State<AppState>,
    user: AuthUser,
    Query(query): Query<MailQuery>,
) -> ApiResult<Json<MailLogPageDto>> {
    require_admin(&user)?;
    let status = query.status.filter(|status| !status.is_empty());
    if status
        .as_deref()
        .is_some_and(|status| MailStatus::from_db(status).is_none())
    {
        return Err(bad_request("invalid_input", "unknown status"));
    }
    let kind = query.kind.filter(|kind| !kind.is_empty());
    let pattern = like_pattern(query.q.as_deref());
    let per_page = query
        .per_page
        .unwrap_or(DEFAULT_PER_PAGE)
        .clamp(1, MAX_PER_PAGE);
    let page = query.page.unwrap_or(1).clamp(1, 10_000);
    let rows = sqlx::query!(
        r#"select id, kind, to_email::text as "to_email?", subject, status, provider_id, error,
                  created_at, updated_at, count(*) over () as "total!"
           from mail_sends
           where ($1::text is null or status = $1)
             and ($2::text is null or kind = $2)
             and ($3::text is null or to_email::text ilike $3 or subject ilike $3)
           order by created_at desc, id desc
           limit $4 offset $5"#,
        status,
        kind,
        pattern,
        per_page,
        (page - 1) * per_page,
    )
    .fetch_all(&state.pool)
    .await?;
    let total = rows.first().map_or(0, |row| row.total);
    let items = rows
        .into_iter()
        .map(|row| MailLogDto {
            id: row.id,
            kind: row.kind,
            to: row.to_email,
            subject: row.subject,
            status: MailStatus::from_db(&row.status).unwrap_or(MailStatus::Sent),
            provider_id: row.provider_id,
            error: row.error,
            created_at: row.created_at,
            updated_at: row.updated_at,
        })
        .collect();
    Ok(Json(MailLogPageDto {
        items,
        total,
        page: i32::try_from(page).unwrap_or(1),
        per_page: i32::try_from(per_page).unwrap_or(25),
    }))
}

/// `GET /api/admin/emails/summary`.
pub async fn summary(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<MailSummaryDto>> {
    require_admin(&user)?;
    let quota = sqlx::query!(
        r#"select count(*) as "all!", count(*) filter (where kind = 'signup_code') as "signups!"
           from mail_sends where created_at > now() - interval '24 hours' and status <> 'quota'"#
    )
    .fetch_one(&state.pool)
    .await?;
    let by_status = sqlx::query!(
        r#"select status as "key!",
                  count(*) filter (where created_at > now() - interval '24 hours') as "day!",
                  count(*) as "week!"
           from mail_sends where created_at > now() - interval '7 days'
           group by status order by 3 desc"#
    )
    .fetch_all(&state.pool)
    .await?
    .into_iter()
    .map(|row| CountDto {
        key: row.key,
        day: row.day,
        week: row.week,
    })
    .collect();
    let by_kind = sqlx::query!(
        r#"select kind as "key!",
                  count(*) filter (where created_at > now() - interval '24 hours') as "day!",
                  count(*) as "week!"
           from mail_sends where created_at > now() - interval '7 days' and status <> 'quota'
           group by kind order by 3 desc"#
    )
    .fetch_all(&state.pool)
    .await?
    .into_iter()
    .map(|row| CountDto {
        key: row.key,
        day: row.day,
        week: row.week,
    })
    .collect();
    let days = sqlx::query!(
        r#"select to_char(d.day, 'YYYY-MM-DD') as "date!",
                  count(m.id) filter (where m.status not in ('failed', 'quota', 'bounced', 'complained')) as "sent!",
                  count(m.id) filter (where m.status in ('failed', 'quota', 'bounced', 'complained')) as "failed!"
           from generate_series((now() at time zone 'utc')::date - 13, (now() at time zone 'utc')::date, interval '1 day') d(day)
           left join mail_sends m on (m.created_at at time zone 'utc')::date = d.day::date
           group by d.day order by d.day"#
    )
    .fetch_all(&state.pool)
    .await?
    .into_iter()
    .map(|row| MailDayDto {
        date: row.date,
        sent: row.sent,
        failed: row.failed,
    })
    .collect();
    let from = match &state.mailer {
        Mailer::Resend { from, .. } => Some(from.clone()),
        _ => None,
    };
    Ok(Json(MailSummaryDto {
        provider: state.mailer.provider().to_owned(),
        from,
        webhook: state.config.resend_webhook_secret.is_some(),
        daily_limit: state.config.mail_daily_limit,
        used_today: quota.all,
        signups_today: quota.signups,
        by_status,
        by_kind,
        days,
    }))
}

/// `POST /api/admin/emails/test`: sends a test to the admin's own address (counts against the
/// quota like any other message).
pub async fn test(State(state): State<AppState>, user: AuthUser) -> ApiResult<StatusCode> {
    require_admin(&user)?;
    let message = emails::test_message(&user.email, &state.config.public_web_url);
    state
        .send_mail(MailKind::Test, &user.email, &message)
        .await
        .map_err(|error| {
            tracing::error!(%error, "test e-mail failed");
            error.api_error()
        })?;
    audit(
        &state,
        &user,
        "email_test",
        None,
        None,
        None,
        serde_json::json!({}),
    )
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Checks a Svix signature (Resend's webhooks): `svix-signature: v1,<base64> [v1,<base64>...]`
/// over `{id}.{timestamp}.{body}`, keyed by the base64 part of `whsec_...`.
fn verify_svix(secret: &str, headers: &HeaderMap, body: &[u8], now: i64) -> bool {
    let header = |name: &str| headers.get(name).and_then(|value| value.to_str().ok());
    let (Some(id), Some(timestamp), Some(signatures)) = (
        header("svix-id"),
        header("svix-timestamp"),
        header("svix-signature"),
    ) else {
        return false;
    };
    let Ok(sent_at) = timestamp.parse::<i64>() else {
        return false;
    };
    if now.abs_diff(sent_at) > WEBHOOK_TOLERANCE_SECONDS.unsigned_abs() {
        return false;
    }
    let Some(key) = secret
        .strip_prefix("whsec_")
        .and_then(|key| base64::engine::general_purpose::STANDARD.decode(key).ok())
    else {
        return false;
    };
    signatures.split(' ').any(|candidate| {
        let Some(signature) = candidate
            .strip_prefix("v1,")
            .and_then(|sig| base64::engine::general_purpose::STANDARD.decode(sig).ok())
        else {
            return false;
        };
        let Ok(mut mac) = Hmac::<Sha256>::new_from_slice(&key) else {
            return false;
        };
        mac.update(id.as_bytes());
        mac.update(b".");
        mac.update(timestamp.as_bytes());
        mac.update(b".");
        mac.update(body);
        mac.verify_slice(&signature).is_ok()
    })
}

/// Rank of a status: a later webhook never moves a message back (a bounce stays a bounce).
fn rank(status: MailStatus) -> u8 {
    match status {
        MailStatus::Sending => 0,
        MailStatus::Sent | MailStatus::Failed | MailStatus::Quota => 1,
        MailStatus::DeliveryDelayed => 2,
        MailStatus::Delivered => 3,
        MailStatus::Bounced | MailStatus::Complained => 4,
    }
}

/// `POST /api/resend/webhook` (no login; Svix signs every request): delivery statuses.
pub async fn webhook(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> ApiResult<StatusCode> {
    let Some(secret) = state.config.resend_webhook_secret.as_deref() else {
        return Err(ApiError::NotFound);
    };
    if !verify_svix(
        secret,
        &headers,
        &body,
        OffsetDateTime::now_utc().unix_timestamp(),
    ) {
        return Err(bad_request("invalid_signature", "bad webhook signature"));
    }
    let event: serde_json::Value =
        serde_json::from_slice(&body).map_err(|_| bad_request("invalid_input", "not JSON"))?;
    let status = match event["type"].as_str() {
        Some("email.delivered") => MailStatus::Delivered,
        Some("email.delivery_delayed") => MailStatus::DeliveryDelayed,
        Some("email.bounced") => MailStatus::Bounced,
        Some("email.complained") => MailStatus::Complained,
        // Sent, opened, clicked...: nothing to record.
        _ => return Ok(StatusCode::NO_CONTENT),
    };
    let Some(provider_id) = event["data"]["email_id"].as_str() else {
        return Ok(StatusCode::NO_CONTENT);
    };
    let error = event["data"]["bounce"]["message"]
        .as_str()
        .map(|text| text.chars().take(500).collect::<String>());
    let current = sqlx::query_scalar!(
        "select status from mail_sends where provider_id = $1",
        provider_id
    )
    .fetch_optional(&state.pool)
    .await?;
    if let Some(current) = current
        && MailStatus::from_db(&current).is_none_or(|current| rank(status) >= rank(current))
    {
        sqlx::query!(
            "update mail_sends set status = $2, error = coalesce($3, error), updated_at = now() where provider_id = $1",
            provider_id,
            status.db(),
            error,
        )
        .execute(&state.pool)
        .await?;
    }
    Ok(StatusCode::NO_CONTENT)
}

#[cfg(test)]
mod tests {
    use axum::http::HeaderValue;

    use super::*;

    fn sign(secret_key: &[u8], id: &str, timestamp: &str, body: &[u8]) -> String {
        let mut mac = Hmac::<Sha256>::new_from_slice(secret_key).unwrap();
        mac.update(format!("{id}.{timestamp}.").as_bytes());
        mac.update(body);
        format!(
            "v1,{}",
            base64::engine::general_purpose::STANDARD.encode(mac.finalize().into_bytes())
        )
    }

    #[test]
    fn svix_signatures() {
        let key = b"0123456789abcdef0123456789abcdef";
        let secret = format!(
            "whsec_{}",
            base64::engine::general_purpose::STANDARD.encode(key)
        );
        let body = br#"{"type":"email.delivered"}"#;
        let mut headers = HeaderMap::new();
        headers.insert("svix-id", HeaderValue::from_static("msg_1"));
        headers.insert("svix-timestamp", HeaderValue::from_static("1700000000"));
        let good = sign(key, "msg_1", "1700000000", body);
        headers.insert(
            "svix-signature",
            HeaderValue::from_str(&format!("v1,bm9wZQ== {good}")).unwrap(),
        );
        assert!(verify_svix(&secret, &headers, body, 1_700_000_010));
        assert!(!verify_svix(&secret, &headers, b"{}", 1_700_000_010));
        assert!(!verify_svix(&secret, &headers, body, 1_700_001_000));
        assert!(!verify_svix(
            "whsec_bm9wZQ==",
            &headers,
            body,
            1_700_000_010
        ));
    }

    #[test]
    fn statuses_never_go_back() {
        assert!(rank(MailStatus::Delivered) > rank(MailStatus::Sent));
        assert!(rank(MailStatus::Bounced) > rank(MailStatus::Delivered));
        assert!(rank(MailStatus::DeliveryDelayed) < rank(MailStatus::Delivered));
    }
}
