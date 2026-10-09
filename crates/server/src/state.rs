//! Shared application state.

use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicI64, Ordering};
use std::time::Instant;

use sqlx::PgPool;
use tokio::sync::{Mutex, MutexGuard, Notify, Semaphore};
use uuid::Uuid;

use crate::config::Config;
use crate::emails::Email;
use crate::google::GoogleAuth;
use crate::mail::{MailError, MailKind, Mailer};
use crate::moderation::Classifier;
use crate::payments::Payments;
use crate::platform::SettingsCache;

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
    /// "Entrar com Google" (ADR 0029); off unless set with [`Self::with_google`].
    pub google: Option<Arc<GoogleAuth>>,
    /// Wakes the export worker when a job is queued.
    pub jobs: Arc<Notify>,
    /// Bounds concurrent synchronous renders (design previews) to protect memory.
    pub render_permits: Arc<Semaphore>,
    /// Serializes payment operations per batch (striped by id; see [`Self::batch_lock`]).
    batch_locks: Arc<[Mutex<()>; BATCH_LOCK_STRIPES]>,
    /// Platform settings (ADR 0037), read through a short cache.
    pub settings: SettingsCache,
    /// Unix time of the export worker's last loop (status page, ADR 0043).
    pub worker_heartbeat: Arc<AtomicI64>,
    /// When the process started.
    pub started_at: Instant,
    /// Image classifier of uploaded art (ADR 0042); off without a key.
    pub classifier: Option<Arc<Classifier>>,
    /// Last answer of the status page (ADR 0043), reused for a few seconds.
    pub status_cache: Arc<tokio::sync::RwLock<Option<(Instant, crate::api::StatusDto)>>>,
    /// Recent attempts per key (promo codes): a small in-memory rate limit, see [`Self::attempt`].
    attempts: Arc<Mutex<HashMap<String, Vec<Instant>>>>,
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
            google: None,
            jobs: Arc::new(Notify::new()),
            render_permits: Arc::new(Semaphore::new(2)),
            batch_locks: Arc::new(std::array::from_fn(|_| Mutex::new(()))),
            settings: SettingsCache::default(),
            worker_heartbeat: Arc::new(AtomicI64::new(0)),
            started_at: Instant::now(),
            classifier: None,
            attempts: Arc::new(Mutex::new(HashMap::new())),
            status_cache: Arc::new(tokio::sync::RwLock::new(None)),
        }
    }

    /// Records the worker's loop for the status page.
    pub fn worker_tick(&self) {
        self.worker_heartbeat.store(
            time::OffsetDateTime::now_utc().unix_timestamp(),
            Ordering::Relaxed,
        );
    }

    /// Counts an attempt under `key` and says whether it stays within `limit` per `window`
    /// (in-process, like [`Self::batch_lock`]: the API runs as one instance).
    pub async fn attempt(&self, key: &str, limit: usize, window: std::time::Duration) -> bool {
        let mut attempts = self.attempts.lock().await;
        // Forget idle keys now and then so the map never grows without bound.
        if attempts.len() > 10_000 {
            attempts.retain(|_, times| times.iter().any(|at| at.elapsed() < window));
        }
        let times = attempts.entry(key.to_owned()).or_default();
        times.retain(|at| at.elapsed() < window);
        if times.len() >= limit {
            return false;
        }
        times.push(Instant::now());
        true
    }

    /// Turns on the image classifier.
    #[must_use]
    pub fn with_classifier(mut self, classifier: Classifier) -> Self {
        self.classifier = Some(Arc::new(classifier));
        self
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

    /// Turns on "Entrar com Google".
    #[must_use]
    pub fn with_google(mut self, google: GoogleAuth) -> Self {
        self.google = Some(Arc::new(google));
        self
    }

    /// Sends an e-mail within the daily quota (ADR 0028) and logs it (ADR 0041): every message
    /// handed to the provider is a row of `mail_sends`, and past `MAIL_DAILY_LIMIT` in 24 hours
    /// nothing is sent (the refusal is logged as `quota`, which does not count). Codes for
    /// e-mails without an account may use at most two thirds of the quota.
    ///
    /// # Errors
    ///
    /// [`MailError::Quota`] when the quota is spent; [`MailError::Failed`] if the database or the
    /// provider fails.
    pub async fn send_mail(
        &self,
        kind: MailKind,
        to: &str,
        email: &Email,
    ) -> Result<(), MailError> {
        let db = |error: sqlx::Error| MailError::Failed(error.to_string());
        let subject: String = email.subject.chars().take(200).collect();
        if let Some(limit) = self.config.mail_daily_limit {
            let sent = sqlx::query!(
                r#"select count(*) as "all!", count(*) filter (where kind = 'signup_code') as "signups!"
                   from mail_sends where created_at > now() - interval '24 hours' and status <> 'quota'"#
            )
            .fetch_one(&self.pool)
            .await
            .map_err(db)?;
            let signup_limit = (limit * 2 / 3).max(1);
            if sent.all >= limit || (kind == MailKind::SignupCode && sent.signups >= signup_limit) {
                sqlx::query!(
                    "insert into mail_sends (kind, to_email, subject, status) values ($1, $2, $3, 'quota')",
                    kind.db(),
                    to,
                    subject,
                )
                .execute(&self.pool)
                .await
                .map_err(db)?;
                return Err(MailError::Quota(format!(
                    "{} e-mails in 24 hours ({} for new accounts)",
                    sent.all, sent.signups
                )));
            }
        }
        let id = sqlx::query_scalar!(
            "insert into mail_sends (kind, to_email, subject, status) values ($1, $2, $3, 'sending') returning id",
            kind.db(),
            to,
            subject,
        )
        .fetch_one(&self.pool)
        .await
        .map_err(db)?;
        let result = self.mailer.send(to, email).await;
        let (status, provider_id, error) = match &result {
            Ok(provider_id) => ("sent", provider_id.clone(), None),
            Err(MailError::Quota(detail)) => ("quota", None, Some(detail.clone())),
            Err(MailError::Failed(detail)) => ("failed", None, Some(detail.clone())),
        };
        let error = error.map(|detail| detail.chars().take(500).collect::<String>());
        sqlx::query!(
            "update mail_sends set status = $2, provider_id = $3, error = $4, updated_at = now() where id = $1",
            id,
            status,
            provider_id,
            error,
        )
        .execute(&self.pool)
        .await
        .map_err(db)?;
        result.map(|_| ())
    }
}
