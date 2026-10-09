//! Login by e-mail code (ADR 0012) or Google (ADR 0029), and Bearer sessions (ADR 0016).
//!
//! E-mail codes cost a message of a small daily quota (ADR 0028): one IP asks for a few codes an
//! hour, and when the day's quota runs out the API answers `mail_quota`, so the site offers
//! Google instead.

use axum::Json;
use axum::extract::{FromRequestParts, OriginalUri, State};
use axum::http::header::AUTHORIZATION;
use axum::http::request::Parts;
use axum::http::{HeaderMap, Method, StatusCode};
use base64::Engine as _;
use sha2::{Digest, Sha256};
use sqlx::{Postgres, Transaction};
use time::{Duration, OffsetDateTime};
use uuid::Uuid;

use crate::api::{
    AuthOptionsDto, GoogleSignInBody, MeUser, RequestCodeBody, SessionResponse, VerifyCodeBody,
};
use crate::error::{ApiError, ApiResult, bad_request};
use crate::google::GoogleError;
use crate::mail::MailKind;
use crate::state::AppState;
use crate::{emails, keys};

const CODE_TTL: Duration = Duration::minutes(10);
const MAX_ATTEMPTS_PER_CODE: i16 = 5;
const MAX_CODES_PER_WINDOW: i64 = 5;
const CODE_WINDOW: Duration = Duration::minutes(15);
/// Codes one IP address may ask for per hour, whatever the e-mails (ADR 0028).
const MAX_CODES_PER_IP: i64 = 10;
const IP_WINDOW: Duration = Duration::hours(1);
/// Wrong codes allowed per e-mail (across all its codes) before verification pauses: asking for
/// new codes must not reset the guessing budget.
const MAX_FAILURES_PER_WINDOW: i64 = 10;
const FAILURE_WINDOW: Duration = Duration::hours(1);
/// `organizations.name` holds at most this many characters.
const MAX_ORGANIZATION_NAME: usize = 100;
const SESSION_TTL: Duration = Duration::days(30);
/// Sliding expiry is refreshed at most this often, to avoid a write on every request.
const SESSION_REFRESH_EVERY: Duration = Duration::hours(1);
/// Version of the Terms of Use and Privacy Policy accepted by signing in (ADR 0033). Same value
/// as `TERMS_VERSION` in apps/web/src/content/legal.ts.
pub const TERMS_VERSION: &str = "2026-10-09";

/// The authenticated user of a request.
#[derive(Debug, Clone)]
pub struct AuthUser {
    /// User id.
    pub id: Uuid,
    /// E-mail.
    pub email: String,
    /// In `ADMIN_EMAILS`: may act on any organization (ADR 0032).
    pub is_admin: bool,
    /// The user's organization is suspended (ADR 0032): reads only.
    pub suspended: bool,
    /// Method of the request (support-mode audit).
    pub method: Method,
    /// Path of the request (support-mode audit).
    pub path: String,
    token_hash: Vec<u8>,
}

fn sha256(parts: &[&[u8]]) -> Vec<u8> {
    let mut hasher = Sha256::new();
    for part in parts {
        hasher.update(part);
    }
    hasher.finalize().to_vec()
}

/// Normalizes and minimally validates an e-mail address.
fn normalize_email(raw: &str) -> ApiResult<String> {
    let email = raw.trim().to_lowercase();
    let valid = email.len() <= 254
        && email.split_once('@').is_some_and(|(local, domain)| {
            !local.is_empty()
                && domain.contains('.')
                && !domain.starts_with('.')
                && !domain.ends_with('.')
        })
        && !email.chars().any(char::is_whitespace);
    if valid {
        Ok(email)
    } else {
        Err(bad_request("invalid_email", "not an e-mail address"))
    }
}

/// A uniformly random 6-digit code (rejection sampling avoids modulo bias).
fn random_code() -> ApiResult<String> {
    const LIMIT: u32 = u32::MAX - (u32::MAX % 1_000_000);
    loop {
        let value = getrandom::u32()
            .map_err(|error| ApiError::Internal(anyhow::anyhow!("OS RNG: {error}")))?;
        if value < LIMIT {
            return Ok(format!("{:06}", value % 1_000_000));
        }
    }
}

fn random_token() -> ApiResult<String> {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes)
        .map_err(|error| ApiError::Internal(anyhow::anyhow!("OS RNG: {error}")))?;
    Ok(base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes))
}

/// Hash of a bearer or download token as stored in the database.
pub fn token_hash(token: &str) -> Vec<u8> {
    sha256(&[token.as_bytes()])
}

/// The token of an `Authorization: Bearer <token>` header.
///
/// # Errors
///
/// [`ApiError::Unauthorized`] when the header is missing or malformed.
pub fn bearer_token(parts: &Parts) -> ApiResult<&str> {
    parts
        .headers
        .get(AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .map(str::trim)
        .filter(|token| !token.is_empty() && token.len() <= 128)
        .ok_or(ApiError::Unauthorized)
}

/// A new random URL-safe token and its stored hash.
///
/// # Errors
///
/// Fails only if the OS RNG fails.
pub fn new_token() -> ApiResult<(String, Vec<u8>)> {
    let token = random_token()?;
    let hash = token_hash(&token);
    Ok((token, hash))
}

/// The client address. Render's edge is Cloudflare, which sets `CF-Connecting-IP` itself (a
/// client cannot forge it); without it, the first `X-Forwarded-For` entry, which a client can
/// forge to dodge only its own per-IP limit (the daily quota and its sub-quota still hold).
fn client_ip(headers: &HeaderMap) -> Option<String> {
    let header = |name: &str| {
        headers
            .get(name)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.split(',').next())
            .map(str::trim)
            .filter(|ip| !ip.is_empty() && ip.len() <= 64)
            .map(str::to_owned)
    };
    header("cf-connecting-ip").or_else(|| header("x-forwarded-for"))
}

/// `GET /api/auth/options` (no login): the sign-in methods this server offers.
pub async fn options(State(state): State<AppState>) -> Json<AuthOptionsDto> {
    Json(AuthOptionsDto {
        google_client_id: state
            .google
            .as_ref()
            .map(|google| google.client_id().to_owned()),
    })
}

/// `POST /api/auth/code`: always answers 204, whether or not the e-mail has an account.
pub async fn request_code(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<RequestCodeBody>,
) -> ApiResult<StatusCode> {
    let email = normalize_email(&body.email)?;
    let recent = sqlx::query_scalar!(
        "select count(*) from login_codes where email = $1 and created_at > $2",
        email,
        OffsetDateTime::now_utc() - CODE_WINDOW,
    )
    .fetch_one(&state.pool)
    .await?
    .unwrap_or(0);
    if recent >= MAX_CODES_PER_WINDOW {
        return Err(ApiError::TooManyRequests);
    }
    // In production every request comes through the proxy; one without an address shares a
    // single bucket rather than escaping the limit.
    let ip = client_ip(&headers).or_else(|| state.config.production.then(|| "unknown".to_owned()));
    let ip_hash =
        ip.map(|ip| keys::keyed_hash(&state.config.master_key, "login-ip", ip.as_bytes()).to_vec());
    if let Some(ip_hash) = &ip_hash {
        let from_ip = sqlx::query_scalar!(
            r#"select count(*) as "count!" from login_codes where ip_hash = $1 and created_at > $2"#,
            ip_hash,
            OffsetDateTime::now_utc() - IP_WINDOW,
        )
        .fetch_one(&state.pool)
        .await?;
        if from_ip >= MAX_CODES_PER_IP {
            return Err(ApiError::TooManyRequests);
        }
    }
    let code = random_code()?;
    let id = Uuid::new_v4();
    sqlx::query!(
        "insert into login_codes (id, email, code_hash, expires_at, ip_hash) values ($1, $2, $3, $4, $5)",
        id,
        email,
        sha256(&[id.as_bytes(), code.as_bytes()]),
        OffsetDateTime::now_utc() + CODE_TTL,
        ip_hash,
    )
    .execute(&state.pool)
    .await?;
    let message = emails::login_code(
        &code,
        CODE_TTL.whole_minutes(),
        &state.config.public_web_url,
    );
    let known = sqlx::query_scalar!(
        r#"select exists(select 1 from users where email = $1) as "known!""#,
        email
    )
    .fetch_one(&state.pool)
    .await?;
    let kind = if known {
        MailKind::LoginCode
    } else {
        MailKind::SignupCode
    };
    state
        .send_mail(kind, &email, &message)
        .await
        .map_err(|error| {
            tracing::error!(%error, "login e-mail failed");
            error.api_error()
        })?;
    Ok(StatusCode::NO_CONTENT)
}

/// `POST /api/auth/verify`: exchanges a valid code for a session token.
pub async fn verify_code(
    State(state): State<AppState>,
    Json(body): Json<VerifyCodeBody>,
) -> ApiResult<Json<SessionResponse>> {
    let email = normalize_email(&body.email)?;
    let code = body.code.trim();
    let invalid = || bad_request("invalid_code", "wrong or expired code");
    if code.len() != 6 || !code.chars().all(|c| c.is_ascii_digit()) {
        return Err(invalid());
    }
    let failures = sqlx::query_scalar!(
        r#"select coalesce(sum(attempts), 0)::bigint as "failures!" from login_codes
           where email = $1 and created_at > $2"#,
        email,
        OffsetDateTime::now_utc() - FAILURE_WINDOW,
    )
    .fetch_one(&state.pool)
    .await?;
    if failures >= MAX_FAILURES_PER_WINDOW {
        return Err(ApiError::TooManyRequests);
    }
    let mut tx = state.pool.begin().await?;
    let Some(row) = sqlx::query!(
        r#"select id, code_hash, attempts from login_codes
           where email = $1 and consumed_at is null and expires_at > now()
           order by created_at desc limit 1 for update"#,
        email,
    )
    .fetch_optional(&mut *tx)
    .await?
    else {
        return Err(invalid());
    };
    if row.attempts >= MAX_ATTEMPTS_PER_CODE {
        return Err(invalid());
    }
    if sha256(&[row.id.as_bytes(), code.as_bytes()]) != row.code_hash {
        sqlx::query!(
            "update login_codes set attempts = attempts + 1 where id = $1",
            row.id
        )
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        return Err(invalid());
    }
    sqlx::query!(
        "update login_codes set consumed_at = now() where id = $1",
        row.id
    )
    .execute(&mut *tx)
    .await?;
    let existing = sqlx::query_scalar!("select id from users where email = $1", email)
        .fetch_optional(&mut *tx)
        .await?;
    let user_id = match existing {
        Some(id) => id,
        None => create_user(&mut tx, &email, None, None).await?,
    };
    let session = start_session(&state, &mut tx, user_id).await?;
    tx.commit().await?;
    Ok(Json(session))
}

/// `POST /api/auth/google`: exchanges a Google ID token for a session (ADR 0029). The Google
/// account is matched by its id, then by its verified e-mail (an account created with e-mail
/// codes gets linked); a new e-mail creates an account, as a first code would.
pub async fn google(
    State(state): State<AppState>,
    Json(body): Json<GoogleSignInBody>,
) -> ApiResult<Json<SessionResponse>> {
    let google = state
        .google
        .clone()
        .ok_or(ApiError::Unavailable("google_unavailable"))?;
    let identity = google
        .verify(&body.credential, OffsetDateTime::now_utc().unix_timestamp())
        .await
        .map_err(|error| match error {
            GoogleError::Keys(detail) => {
                tracing::error!(%detail, "google keys unavailable");
                ApiError::Unavailable("google_unavailable")
            }
            GoogleError::EmailNotVerified => bad_request(
                "google_email_unverified",
                "the Google e-mail is not verified",
            ),
            other => {
                tracing::warn!(error = %other, "google token refused");
                bad_request("invalid_google_token", "invalid Google sign-in")
            }
        })?;
    let email = normalize_email(&identity.email)?;
    let mut tx = state.pool.begin().await?;
    let by_subject = sqlx::query!(
        r#"select id, email::text as "email!" from users where google_sub = $1"#,
        identity.subject
    )
    .fetch_optional(&mut *tx)
    .await?;
    let user_id = if let Some(user) = by_subject {
        // The Google account's e-mail changed: follow it unless another account owns it.
        if user.email != email {
            sqlx::query!(
                r#"update users set email = $2 where id = $1
                   and not exists (select 1 from users other where other.email = $2)"#,
                user.id,
                email
            )
            .execute(&mut *tx)
            .await?;
        }
        user.id
    } else if let Some(user) = sqlx::query!(
        "select id, google_sub from users where email = $1 for update",
        email
    )
    .fetch_optional(&mut *tx)
    .await?
    {
        if user.google_sub.is_some() {
            // The e-mail belongs to an account linked to another Google account.
            return Err(ApiError::Conflict(
                "google_account_mismatch",
                "this e-mail is linked to another Google account".to_owned(),
            ));
        }
        sqlx::query!(
            "update users set google_sub = $2, name = coalesce(name, $3) where id = $1",
            user.id,
            identity.subject,
            identity.name,
        )
        .execute(&mut *tx)
        .await?;
        user.id
    } else {
        create_user(
            &mut tx,
            &email,
            Some(&identity.subject),
            identity.name.as_deref(),
        )
        .await?
    };
    let session = start_session(&state, &mut tx, user_id).await?;
    tx.commit().await?;
    Ok(Json(session))
}

/// First login: the user and a personal organization named after the e-mail.
async fn create_user(
    tx: &mut Transaction<'_, Postgres>,
    email: &str,
    google_sub: Option<&str>,
    name: Option<&str>,
) -> ApiResult<Uuid> {
    let user_id = Uuid::new_v4();
    let organization_id = Uuid::new_v4();
    sqlx::query!(
        "insert into users (id, email, google_sub, name) values ($1, $2, $3, $4)",
        user_id,
        email,
        google_sub,
        name,
    )
    .execute(&mut **tx)
    .await?;
    let organization: String = name
        .unwrap_or(email)
        .chars()
        .take(MAX_ORGANIZATION_NAME)
        .collect();
    sqlx::query!(
        "insert into organizations (id, name) values ($1, $2)",
        organization_id,
        organization
    )
    .execute(&mut **tx)
    .await?;
    sqlx::query!(
        "insert into memberships (organization_id, user_id, role) values ($1, $2, 'owner')",
        organization_id,
        user_id
    )
    .execute(&mut **tx)
    .await?;
    Ok(user_id)
}

/// A new session for `user_id`; signing in accepts the current terms (the sign-in page says so).
async fn start_session(
    state: &AppState,
    tx: &mut Transaction<'_, Postgres>,
    user_id: Uuid,
) -> ApiResult<SessionResponse> {
    sqlx::query!(
        r#"update users set last_login_at = now(),
                  terms_accepted_at = case when terms_version is distinct from $2 then now() else terms_accepted_at end,
                  terms_version = $2
           where id = $1"#,
        user_id,
        TERMS_VERSION,
    )
    .execute(&mut **tx)
    .await?;
    let (token, hash) = new_token()?;
    sqlx::query!(
        "insert into sessions (token_hash, user_id, expires_at) values ($1, $2, $3)",
        hash,
        user_id,
        OffsetDateTime::now_utc() + SESSION_TTL,
    )
    .execute(&mut **tx)
    .await?;
    let user = me_user(state, &mut **tx, user_id).await?;
    Ok(SessionResponse { token, user })
}

async fn me_user<'e, E>(state: &AppState, executor: E, user_id: Uuid) -> ApiResult<MeUser>
where
    E: sqlx::PgExecutor<'e>,
{
    let row = sqlx::query!(
        r#"select u.email::text as "email!", u.name, u.google_sub is not null as "google!",
                  exists(select 1 from memberships m join organizations o on o.id = m.organization_id
                         where m.user_id = u.id and o.suspended_at is not null) as "suspended!"
           from users u where u.id = $1"#,
        user_id
    )
    .fetch_one(executor)
    .await?;
    Ok(MeUser {
        id: user_id,
        is_admin: state.config.is_admin(&row.email),
        email: row.email,
        name: row.name,
        google: row.google,
        suspended: row.suspended,
    })
}

/// `POST /api/auth/logout`: revokes the current session.
pub async fn logout(State(state): State<AppState>, user: AuthUser) -> ApiResult<StatusCode> {
    sqlx::query!(
        "delete from sessions where token_hash = $1",
        user.token_hash
    )
    .execute(&state.pool)
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// `GET /api/me`.
pub async fn me(State(state): State<AppState>, user: AuthUser) -> ApiResult<Json<MeUser>> {
    Ok(Json(me_user(&state, &state.pool, user.id).await?))
}

/// Requests a suspended account may still make: reading, signing out, its own data and
/// deleting itself (ADR 0033 keeps those rights).
fn allowed_while_suspended(method: &Method, path: &str) -> bool {
    method == Method::GET
        || method == Method::HEAD
        || path == "/api/auth/logout"
        || (method == Method::DELETE && path == "/api/account")
}

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let hash = token_hash(bearer_token(parts)?);
        let row = sqlx::query!(
            r#"select s.user_id, s.last_seen_at, u.email as "email: String",
                      exists(select 1 from memberships m join organizations o on o.id = m.organization_id
                             where m.user_id = u.id and o.suspended_at is not null) as "suspended!"
               from sessions s join users u on u.id = s.user_id
               where s.token_hash = $1 and s.expires_at > now()"#,
            hash,
        )
        .fetch_optional(&state.pool)
        .await?
        .ok_or(ApiError::Unauthorized)?;
        let now = OffsetDateTime::now_utc();
        if now - row.last_seen_at > SESSION_REFRESH_EVERY {
            sqlx::query!(
                "update sessions set last_seen_at = $2, expires_at = $3 where token_hash = $1",
                hash,
                now,
                now + SESSION_TTL,
            )
            .execute(&state.pool)
            .await?;
        }
        let is_admin = state.config.is_admin(&row.email);
        // The API is nested under `/api`, and nesting strips the prefix from `parts.uri`.
        let path = parts
            .extensions
            .get::<OriginalUri>()
            .map_or_else(|| parts.uri.path().to_owned(), |uri| uri.path().to_owned());
        if row.suspended && !is_admin && !allowed_while_suspended(&parts.method, &path) {
            return Err(ApiError::Suspended);
        }
        Ok(Self {
            id: row.user_id,
            email: row.email,
            is_admin,
            suspended: row.suspended,
            method: parts.method.clone(),
            path: path.chars().take(200).collect(),
            token_hash: hash,
        })
    }
}

#[cfg(test)]
mod tests {
    use axum::http::HeaderValue;

    use super::*;

    #[test]
    fn normalizes_emails() {
        assert_eq!(
            normalize_email("  Eu@Exemplo.COM ").unwrap(),
            "eu@exemplo.com"
        );
        for bad in [
            "",
            "eu",
            "@exemplo.com",
            "eu@exemplo",
            "eu@.com",
            "e u@exemplo.com",
            "eu@exemplo.com.",
        ] {
            assert!(normalize_email(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn codes_are_six_digits() {
        for _ in 0..100 {
            let code = random_code().unwrap();
            assert_eq!(code.len(), 6);
            assert!(code.chars().all(|c| c.is_ascii_digit()));
        }
    }

    #[test]
    fn tokens_are_long_and_url_safe() {
        let (token, hash) = new_token().unwrap();
        assert_eq!(token.len(), 43);
        assert!(
            token
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
        );
        assert_eq!(hash, token_hash(&token));
    }

    #[test]
    fn client_ip_prefers_the_cloudflare_address() {
        let mut headers = HeaderMap::new();
        assert_eq!(client_ip(&headers), None);
        headers.insert(
            "x-forwarded-for",
            HeaderValue::from_static("203.0.113.7, 10.0.0.1"),
        );
        assert_eq!(client_ip(&headers).as_deref(), Some("203.0.113.7"));
        headers.insert("cf-connecting-ip", HeaderValue::from_static("198.51.100.4"));
        assert_eq!(client_ip(&headers).as_deref(), Some("198.51.100.4"));
    }

    #[test]
    fn suspended_accounts_only_read() {
        assert!(allowed_while_suspended(&Method::GET, "/api/events"));
        assert!(allowed_while_suspended(&Method::POST, "/api/auth/logout"));
        assert!(allowed_while_suspended(&Method::DELETE, "/api/account"));
        assert!(!allowed_while_suspended(&Method::POST, "/api/events"));
        assert!(!allowed_while_suspended(&Method::PUT, "/api/account"));
    }
}
