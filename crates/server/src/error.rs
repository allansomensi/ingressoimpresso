//! API errors. Every error answers JSON `{"error": {"code": "...", "message": "..."}}`; the web
//! app maps `code` to Portuguese text, `message` is a developer-facing English hint.

use axum::Json;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde::Serialize;

/// An error returned by a handler.
#[derive(Debug)]
pub enum ApiError {
    /// 400 with a stable code.
    BadRequest(&'static str, String),
    /// 401: missing, invalid or expired session.
    Unauthorized,
    /// 403: authenticated but not allowed.
    Forbidden,
    /// 404 (also used for resources of other organizations, to avoid leaking their existence).
    NotFound,
    /// 409 with a stable code.
    Conflict(&'static str, String),
    /// 410: the resource existed but is gone (e.g. an export file after a restart).
    Gone(&'static str),
    /// 413.
    PayloadTooLarge,
    /// 429.
    TooManyRequests,
    /// 503: a dependency (e-mail provider) failed.
    Unavailable(&'static str),
    /// 500. The cause is logged, never returned.
    Internal(anyhow::Error),
}

#[derive(Serialize)]
struct Body<'a> {
    error: Detail<'a>,
}

#[derive(Serialize)]
struct Detail<'a> {
    code: &'a str,
    message: String,
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, code, message) = match self {
            Self::BadRequest(code, message) => (StatusCode::BAD_REQUEST, code, message),
            Self::Unauthorized => (
                StatusCode::UNAUTHORIZED,
                "unauthorized",
                "sign in again".to_owned(),
            ),
            Self::Forbidden => (StatusCode::FORBIDDEN, "forbidden", "not allowed".to_owned()),
            Self::NotFound => (StatusCode::NOT_FOUND, "not_found", "not found".to_owned()),
            Self::Conflict(code, message) => (StatusCode::CONFLICT, code, message),
            Self::Gone(code) => (StatusCode::GONE, code, "no longer available".to_owned()),
            Self::PayloadTooLarge => (
                StatusCode::PAYLOAD_TOO_LARGE,
                "payload_too_large",
                "too large".to_owned(),
            ),
            Self::TooManyRequests => (
                StatusCode::TOO_MANY_REQUESTS,
                "too_many_requests",
                "slow down".to_owned(),
            ),
            Self::Unavailable(code) => (
                StatusCode::SERVICE_UNAVAILABLE,
                code,
                "try again later".to_owned(),
            ),
            Self::Internal(error) => {
                tracing::error!(error = ?error, "internal error");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "internal",
                    "unexpected error".to_owned(),
                )
            }
        };
        (
            status,
            Json(Body {
                error: Detail { code, message },
            }),
        )
            .into_response()
    }
}

impl From<sqlx::Error> for ApiError {
    fn from(error: sqlx::Error) -> Self {
        if let sqlx::Error::Database(db) = &error {
            match db.code().as_deref() {
                // unique_violation
                Some("23505") => return Self::Conflict("duplicate", db.message().to_owned()),
                // exclusion_violation: overlapping ranges (ADR 0011)
                Some("23P01") => return Self::Conflict("range_overlap", db.message().to_owned()),
                // check_violation: input outside a column constraint
                Some("23514") => return Self::BadRequest("invalid_input", db.message().to_owned()),
                _ => {}
            }
        }
        Self::Internal(error.into())
    }
}

impl From<anyhow::Error> for ApiError {
    fn from(error: anyhow::Error) -> Self {
        Self::Internal(error)
    }
}

/// Handler result.
pub type ApiResult<T> = Result<T, ApiError>;

/// Shorthand for a 400 error.
pub fn bad_request(code: &'static str, message: impl Into<String>) -> ApiError {
    ApiError::BadRequest(code, message.into())
}
