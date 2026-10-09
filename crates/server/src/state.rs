//! Shared application state.

use std::sync::Arc;

use sqlx::PgPool;
use tokio::sync::{Notify, Semaphore};

use crate::config::Config;
use crate::mail::Mailer;
use crate::payments::Payments;

/// State shared by handlers and the export worker.
#[derive(Debug, Clone)]
pub struct AppState {
    /// Database pool.
    pub pool: PgPool,
    /// Configuration.
    pub config: Arc<Config>,
    /// Mail transport.
    pub mailer: Mailer,
    /// Online payment of batches (ADR 0020); disabled unless set with [`Self::with_payments`].
    pub payments: Payments,
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
            payments: Payments::Disabled,
            jobs: Arc::new(Notify::new()),
            render_permits: Arc::new(Semaphore::new(2)),
        }
    }

    /// Sets the payment transport.
    #[must_use]
    pub fn with_payments(mut self, payments: Payments) -> Self {
        self.payments = payments;
        self
    }
}
