//! Per-address limits on the endpoints that need no session (ADR 0047): sign-in, the door's
//! registration and the digital ticket. They sit in front of the finer limits each flow already
//! keeps (per e-mail, per account, per link) and stop a flood before it reaches the database.
//!
//! The counters live in memory ([`crate::state::AppState::attempt`]): the API runs as one
//! instance (ADR 0013). Many phones share one address behind a carrier's NAT, so the limits are
//! generous for the ticket and the door, and tighter only where guessing would pay.

use std::time::Duration;

use axum::http::HeaderMap;

use crate::auth::client_ip;
use crate::error::{ApiError, ApiResult};
use crate::state::AppState;

/// A limit: `max` requests per `window` from one address.
#[derive(Debug, Clone, Copy)]
pub struct Limit {
    /// Name of the bucket.
    pub name: &'static str,
    /// Requests allowed in the window.
    pub max: usize,
    /// Length of the window.
    pub window: Duration,
}

/// `POST /api/auth/code`: the per-e-mail and per-address limits in the database still apply.
pub const LOGIN_CODES: Limit = Limit {
    name: "login-code",
    max: 30,
    window: Duration::from_mins(15),
};
/// `POST /api/auth/verify` and `POST /api/auth/google`.
pub const LOGIN_VERIFY: Limit = Limit {
    name: "login-verify",
    max: 60,
    window: Duration::from_mins(15),
};
/// `POST /api/door/register`.
pub const DOOR_REGISTER: Limit = Limit {
    name: "door-register",
    max: 60,
    window: Duration::from_mins(15),
};
/// `POST /api/ticket`: a crowd at the gate shares one address.
pub const TICKET_OPEN: Limit = Limit {
    name: "ticket-open",
    max: 600,
    window: Duration::from_mins(5),
};
/// `POST /api/ticket/image`: each miss renders a ticket.
pub const TICKET_IMAGE: Limit = Limit {
    name: "ticket-image",
    max: 120,
    window: Duration::from_mins(5),
};

/// Counts this request against `limit` for its address. Without an address (a direct request in
/// development or a test) nothing is counted; in production every request comes through the
/// proxy, and one without an address shares a single bucket instead of escaping the limit.
///
/// # Errors
///
/// [`ApiError::TooManyRequests`] once the window is full.
pub async fn by_ip(state: &AppState, headers: &HeaderMap, limit: Limit) -> ApiResult<()> {
    let Some(ip) =
        client_ip(headers).or_else(|| state.config.production.then(|| "unknown".to_owned()))
    else {
        return Ok(());
    };
    if state
        .attempt(&format!("ip:{}:{ip}", limit.name), limit.max, limit.window)
        .await
    {
        Ok(())
    } else {
        tracing::warn!(bucket = limit.name, "address over the request limit");
        Err(ApiError::TooManyRequests)
    }
}
