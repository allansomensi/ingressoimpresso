//! Shared application state.

use std::sync::Arc;

use sqlx::PgPool;
use tokio::sync::{Notify, Semaphore};

use crate::config::Config;
use crate::mail::Mailer;

/// State shared by handlers and the export worker.
#[derive(Debug, Clone)]
pub struct AppState {
    /// Database pool.
    pub pool: PgPool,
    /// Configuration.
    pub config: Arc<Config>,
    /// Mail transport.
    pub mailer: Mailer,
    /// Wakes the export worker when a job is queued.
    pub jobs: Arc<Notify>,
    /// Bounds concurrent synchronous renders (design previews) to protect memory.
    pub render_permits: Arc<Semaphore>,
}

impl AppState {
    /// Builds the state.
    pub fn new(pool: PgPool, config: Config, mailer: Mailer) -> Self {
        Self {
            pool,
            config: Arc::new(config),
            mailer,
            jobs: Arc::new(Notify::new()),
            render_permits: Arc::new(Semaphore::new(2)),
        }
    }
}
