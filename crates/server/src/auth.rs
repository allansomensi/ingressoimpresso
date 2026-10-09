//! Login by e-mail code (ADR 0012) and Bearer sessions (ADR 0016).

use axum::Json;
use axum::extract::{FromRequestParts, State};
use axum::http::StatusCode;
use axum::http::header::AUTHORIZATION;
use axum::http::request::Parts;
use base64::Engine as _;
use sha2::{Digest, Sha256};
use time::{Duration, OffsetDateTime};
use uuid::Uuid;

use crate::api::{MeUser, RequestCodeBody, SessionResponse, VerifyCodeBody};
use crate::error::{ApiError, ApiResult, bad_request};
use crate::state::AppState;
use crate::texts;

const CODE_TTL: Duration = Duration::minutes(10);
const MAX_ATTEMPTS_PER_CODE: i16 = 5;
const MAX_CODES_PER_WINDOW: i64 = 5;
const CODE_WINDOW: Duration = Duration::minutes(15);
/// Wrong codes allowed per e-mail (across all its codes) before verification pauses: asking for
/// new codes must not reset the guessing budget.
const MAX_FAILURES_PER_WINDOW: i64 = 10;
const FAILURE_WINDOW: Duration = Duration::hours(1);
/// `organizations.name` holds at most this many characters.
const MAX_ORGANIZATION_NAME: usize = 100;
const SESSION_TTL: Duration = Duration::days(30);
/// Sliding expiry is refreshed at most this often, to avoid a write on every request.
const SESSION_REFRESH_EVERY: Duration = Duration::hours(1);

/// The authenticated user of a request.
#[derive(Debug, Clone)]
pub struct AuthUser {
    /// User id.
    pub id: Uuid,
    /// E-mail.
    pub email: String,
    token_hash: Vec<u8>,
}

impl AuthUser {
    /// Whether this user may perform admin actions.
    pub fn is_admin(&self, state: &AppState) -> bool {
        state.config.is_admin(&self.email)
    }
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

/// `POST /api/auth/code`: always answers 204, whether or not the e-mail has an account.
pub async fn request_code(
    State(state): State<AppState>,
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
    let code = random_code()?;
    let id = Uuid::new_v4();
    sqlx::query!(
        "insert into login_codes (id, email, code_hash, expires_at) values ($1, $2, $3, $4)",
        id,
        email,
        sha256(&[id.as_bytes(), code.as_bytes()]),
        OffsetDateTime::now_utc() + CODE_TTL,
    )
    .execute(&state.pool)
    .await?;
    state
        .mailer
        .send(
            &email,
            &texts::login_subject(&code),
            &texts::login_body(&code),
        )
        .await
        .map_err(|error| {
            tracing::error!(%error, "login e-mail failed");
            ApiError::Unavailable("mail_unavailable")
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
    let user_id = if let Some(id) = existing {
        id
    } else {
        // First login: create the user and a personal organization.
        let user_id = Uuid::new_v4();
        let organization_id = Uuid::new_v4();
        sqlx::query!(
            "insert into users (id, email) values ($1, $2)",
            user_id,
            email
        )
        .execute(&mut *tx)
        .await?;
        let name: String = email.chars().take(MAX_ORGANIZATION_NAME).collect();
        sqlx::query!(
            "insert into organizations (id, name) values ($1, $2)",
            organization_id,
            name
        )
        .execute(&mut *tx)
        .await?;
        sqlx::query!(
            "insert into memberships (organization_id, user_id, role) values ($1, $2, 'owner')",
            organization_id,
            user_id
        )
        .execute(&mut *tx)
        .await?;
        user_id
    };
    let (token, hash) = new_token()?;
    sqlx::query!(
        "insert into sessions (token_hash, user_id, expires_at) values ($1, $2, $3)",
        hash,
        user_id,
        OffsetDateTime::now_utc() + SESSION_TTL,
    )
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(Json(SessionResponse {
        token,
        user: MeUser {
            id: user_id,
            is_admin: state.config.is_admin(&email),
            email,
        },
    }))
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
pub async fn me(State(state): State<AppState>, user: AuthUser) -> Json<MeUser> {
    Json(MeUser {
        id: user.id,
        is_admin: user.is_admin(&state),
        email: user.email,
    })
}

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let hash = token_hash(bearer_token(parts)?);
        let row = sqlx::query!(
            r#"select s.user_id, s.last_seen_at, u.email as "email: String"
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
        Ok(Self {
            id: row.user_id,
            email: row.email,
            token_hash: hash,
        })
    }
}

#[cfg(test)]
mod tests {
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
}
