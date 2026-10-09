//! Shared application state.

use std::sync::Arc;

use sqlx::PgPool;
use tokio::sync::{Mutex, MutexGuard, Notify, Semaphore};
use uuid::Uuid;

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
    /// Serializes payment operations per batch (striped by id; see [`Self::batch_lock`]).
    batch_locks: Arc<[Mutex<()>; BATCH_LOCK_STRIPES]>,
}

/// Number of batch locks: unrelated batches rarely share one, and the set never grows.
const BATCH_LOCK_STRIPES: usize = 64;

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
            batch_locks: Arc::new(std::array::from_fn(|_| Mutex::new(()))),
        }
    }

    /// Holds checkout, cancel and mark-paid of one batch to one at a time (ADR 0020). In-process:
    /// the API runs as a single instance (ADR 0013); a second instance would need a database lock.
    pub async fn batch_lock(&self, batch_id: Uuid) -> MutexGuard<'_, ()> {
        let stripe = usize::try_from(batch_id.as_u128() % BATCH_LOCK_STRIPES as u128).unwrap_or(0);
        match self.batch_locks.get(stripe) {
            Some(lock) => lock.lock().await,
            None => self.batch_locks[0].lock().await,
        }
    }

    /// Sets the payment transport.
    #[must_use]
    pub fn with_payments(mut self, payments: Payments) -> Self {
        self.payments = payments;
        self
    }
}
