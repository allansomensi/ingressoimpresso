//! Shared application state.

use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};
use std::time::Instant;

use sqlx::PgPool;
use tokio::sync::{Mutex, MutexGuard, Notify, Semaphore};
use uuid::Uuid;

use crate::captcha::Captcha;
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
    /// Anti-bot check before a login code is e-mailed (ADR 0044); off unless set with
    /// [`Self::with_captcha`].
    pub captcha: Option<Arc<Captcha>>,
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
    /// The process is stopping (see [`Self::begin_shutdown`]).
    shutdown: Arc<AtomicBool>,
    /// When the process started.
    pub started_at: Instant,
    /// Image classifier of uploaded art (ADR 0042); off without a key.
    pub classifier: Option<Arc<Classifier>>,
    /// Last answer of the status page (ADR 0043), reused for a few seconds.
    pub status_cache: Arc<tokio::sync::RwLock<Option<(Instant, crate::api::StatusDto)>>>,
    /// Recent attempts per key (promo codes): a small in-memory rate limit, see [`Self::attempt`].
    attempts: Arc<Mutex<HashMap<String, Vec<Instant>>>>,
    /// The admins' alerts on Telegram (ADR 0103); off without the bot.
    pub telegram: crate::alerts::Telegram,
    /// When the latest unexpected errors (500) happened, for the error alert (ADR 0103).
    server_errors: Arc<Mutex<std::collections::VecDeque<Instant>>>,
    /// An announcement sender is running (ADR 0107; see `mailings::wake`).
    pub mailing: Arc<AtomicBool>,
}

/// Number of batch locks: unrelated batches rarely share one, and the set never grows.
const BATCH_LOCK_STRIPES: usize = 64;

impl AppState {
    /// Runs a synchronous render (Typst, images) on the blocking pool under one of the render
    /// permits. The permit goes with the work: a request that times out and is dropped no longer
    /// frees it while its render keeps the CPU (ADR 0118).
    ///
    /// # Errors
    ///
    /// Internal errors when the permit or the blocking task fails; the render's own result is
    /// returned as is.
    pub async fn blocking_render<T: Send + 'static, E: Send + 'static>(
        &self,
        job: impl FnOnce() -> Result<T, E> + Send + 'static,
    ) -> crate::error::ApiResult<Result<T, E>> {
        let permit = self
            .render_permits
            .clone()
            .acquire_owned()
            .await
            .map_err(anyhow::Error::from)?;
        Ok(tokio::task::spawn_blocking(move || {
            let _permit = permit;
            job()
        })
        .await
        .map_err(anyhow::Error::from)?)
    }

    /// Builds the state.
    pub fn new(pool: PgPool, config: Config, mailer: Mailer) -> Self {
        let config_telegram = config.telegram.clone();
        Self {
            pool,
            config: Arc::new(config),
            mailer,
            payments: Payments::Disabled,
            google: None,
            captcha: None,
            jobs: Arc::new(Notify::new()),
            render_permits: Arc::new(Semaphore::new(2)),
            batch_locks: Arc::new(std::array::from_fn(|_| Mutex::new(()))),
            settings: SettingsCache::default(),
            worker_heartbeat: Arc::new(AtomicI64::new(0)),
            shutdown: Arc::new(AtomicBool::new(false)),
            started_at: Instant::now(),
            classifier: None,
            attempts: Arc::new(Mutex::new(HashMap::new())),
            status_cache: Arc::new(tokio::sync::RwLock::new(None)),
            telegram: crate::alerts::Telegram::from_config(config_telegram.as_ref()),
            server_errors: Arc::new(Mutex::new(std::collections::VecDeque::new())),
            mailing: Arc::new(AtomicBool::new(false)),
        }
    }

    /// Telegram messages kept in memory instead of sent (tests).
    #[must_use]
    pub fn with_telegram_memory(mut self) -> (Self, Arc<std::sync::Mutex<Vec<String>>>) {
        let sent = Arc::new(std::sync::Mutex::new(Vec::new()));
        self.telegram = crate::alerts::Telegram::Memory(sent.clone());
        (self, sent)
    }

    /// Records an unexpected error (500); `true` exactly when the latest
    /// [`crate::alerts::ERROR_WINDOW`] reaches [`crate::alerts::ERROR_THRESHOLD`] of them.
    pub async fn note_server_error(&self) -> bool {
        let mut errors = self.server_errors.lock().await;
        let now = Instant::now();
        while errors
            .front()
            .is_some_and(|at| now.duration_since(*at) > crate::alerts::ERROR_WINDOW)
        {
            errors.pop_front();
        }
        errors.push_back(now);
        errors.len() == crate::alerts::ERROR_THRESHOLD
    }

    /// Tells the export worker to finish the job in hand and stop claiming others: the process
    /// is stopping (a deploy), and a job claimed now would die with it and wait for a retry.
    pub fn begin_shutdown(&self) {
        self.shutdown.store(true, Ordering::Relaxed);
        self.jobs.notify_one();
    }

    /// Whether [`Self::begin_shutdown`] was called.
    pub fn shutting_down(&self) -> bool {
        self.shutdown.load(Ordering::Relaxed)
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

    /// Whether `key` already used up `limit` attempts in `window`, without counting one.
    pub async fn exhausted(&self, key: &str, limit: usize, window: std::time::Duration) -> bool {
        let mut attempts = self.attempts.lock().await;
        attempts.get_mut(key).is_some_and(|times| {
            times.retain(|at| at.elapsed() < window);
            times.len() >= limit
        })
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

    /// Turns on the anti-bot check of login codes.
    #[must_use]
    pub fn with_captcha(mut self, captcha: Captcha) -> Self {
        self.captcha = Some(Arc::new(captcha));
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
        // A login code never reaches the log: whoever reads it could sign in as the recipient.
        let secret = matches!(kind, MailKind::LoginCode | MailKind::SignupCode);
        let subject: String = email
            .subject
            .chars()
            .map(|c| {
                if secret && c.is_ascii_digit() {
                    '•'
                } else {
                    c
                }
            })
            .take(200)
            .collect();
        if let Some(limit) = self.config.mail_daily_limit {
            let sent = sqlx::query!(
                r#"select count(*) as "all!", count(*) filter (where kind = 'signup_code') as "signups!",
                          count(*) filter (where kind in ('login_code', 'signup_code')) as "logins!",
                          count(*) filter (where kind = 'team_invite') as "invites!"
                   from mail_sends where created_at > now() - interval '24 hours' and status <> 'quota'"#
            )
            .fetch_one(&self.pool)
            .await
            .map_err(db)?;
            // The admins hear of a quota running out (ADR 0103); never about their own alerts.
            if kind != MailKind::Alert
                && let Some(alert) =
                    crate::alerts::quota_alert(sent.all + 1, limit, sent.all >= limit)
            {
                tokio::spawn(crate::alerts::raise(self.clone(), alert));
            }
            let signup_limit = (limit * 2 / 3).max(1);
            // Codes anyone may ask for without a session never take the whole day (ADR 0119):
            // the reserve stays for what an account already did (a paid batch, an invite, an
            // alert). Invites, which one account sends to any address, get a quarter at most.
            let login_limit = (limit - limit / 4).max(1);
            let invite_limit = (limit / 4).max(1);
            let over_share = match kind {
                MailKind::SignupCode => sent.signups >= signup_limit || sent.logins >= login_limit,
                MailKind::LoginCode => sent.logins >= login_limit,
                MailKind::TeamInvite => sent.invites >= invite_limit,
                _ => false,
            };
            if sent.all >= limit || over_share {
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
