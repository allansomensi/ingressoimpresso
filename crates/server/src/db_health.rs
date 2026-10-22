//! The database dropping its connections (ADR 0117): Neon closes them all when its compute restarts or
//! suspends ("terminating connection due to administrator command"). A request that meets such
//! a connection answers 503 `database_reconnecting`, which the panel retries, instead of a 500
//! that counts toward the admins' alert; and every pooled connection that sat idle across the
//! drop is pinged before its next use (`before_acquire` in `main.rs`), so only the requests
//! already in flight fail.

use std::io::ErrorKind;
use std::sync::Mutex;
use std::time::Instant;

/// When the last dropped connection was seen.
static DROPPED_AT: Mutex<Option<Instant>> = Mutex::new(None);

/// Whether the error means the server closed this connection: `admin_shutdown`,
/// `crash_shutdown` or `cannot_connect_now`, or the socket ended under the query.
pub fn is_dropped_connection(error: &sqlx::Error) -> bool {
    match error {
        sqlx::Error::Database(db) => {
            matches!(db.code().as_deref(), Some("57P01" | "57P02" | "57P03"))
        }
        sqlx::Error::Io(io) => matches!(
            io.kind(),
            ErrorKind::UnexpectedEof
                | ErrorKind::BrokenPipe
                | ErrorKind::ConnectionReset
                | ErrorKind::ConnectionAborted
        ),
        _ => false,
    }
}

/// Remembers that the database dropped a connection now.
pub fn note_dropped() {
    if let Ok(mut dropped) = DROPPED_AT.lock() {
        *dropped = Some(Instant::now());
    }
}

/// Whether a drop was seen after `released` (when a pooled connection was last returned): that
/// connection may be dead too.
pub fn dropped_since(released: Instant) -> bool {
    DROPPED_AT
        .lock()
        .ok()
        .and_then(|dropped| *dropped)
        .is_some_and(|dropped| dropped >= released)
}
