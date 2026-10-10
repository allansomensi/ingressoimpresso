//! Platform settings (ADR 0037): maintenance mode, new accounts and blocked e-mail domains. One
//! database row, read through a short in-memory cache (the API runs as one instance, so a save
//! refreshes it at once).

use std::sync::Arc;
use std::time::{Duration, Instant};

use axum::http::Method;
use time::OffsetDateTime;
use tokio::sync::RwLock;
use uuid::Uuid;

use crate::api::{MaintenanceDto, MaintenanceMode};
use crate::error::{ApiError, ApiResult, bad_request};

/// How long a read of the settings is reused.
const CACHE_TTL: Duration = Duration::from_secs(5);
/// Longest maintenance message.
pub const MAX_MESSAGE: usize = 500;
/// Most blocked domains.
pub const MAX_BLOCKED_DOMAINS: usize = 1000;

/// The settings row.
#[derive(Debug, Clone)]
pub struct PlatformSettings {
    /// Maintenance mode.
    pub maintenance_mode: MaintenanceMode,
    /// Message from the team.
    pub maintenance_message: Option<String>,
    /// Expected end.
    pub maintenance_ends_at: Option<OffsetDateTime>,
    /// When the current mode started.
    pub maintenance_started_at: Option<OffsetDateTime>,
    /// New accounts allowed.
    pub registrations_open: bool,
    /// Blocked domains, normalized.
    pub blocked_email_domains: Vec<String>,
    /// Last change.
    pub updated_at: OffsetDateTime,
    /// Admin who made it.
    pub updated_by: Option<Uuid>,
}

impl PlatformSettings {
    /// The maintenance part, as the API shows it.
    pub fn maintenance(&self) -> MaintenanceDto {
        MaintenanceDto {
            mode: self.maintenance_mode,
            message: self.maintenance_message.clone(),
            ends_at: self.maintenance_ends_at,
            started_at: self.maintenance_started_at,
        }
    }

    /// Whether `email` belongs to a blocked domain (or one of its subdomains).
    pub fn email_blocked(&self, email: &str) -> bool {
        email
            .rsplit_once('@')
            .is_some_and(|(_, domain)| domain_blocked(domain, &self.blocked_email_domains))
    }

    /// 503 `maintenance` when a non-admin request is paused by the current mode.
    ///
    /// # Errors
    ///
    /// [`ApiError::Maintenance`].
    pub fn check_request(&self, method: &Method, path: &str) -> ApiResult<()> {
        if maintenance_blocks(self.maintenance_mode, method, path) {
            Err(ApiError::Maintenance)
        } else {
            Ok(())
        }
    }
}

/// Settings cache shared by the handlers.
#[derive(Debug, Clone, Default)]
pub struct SettingsCache(Arc<RwLock<Option<(Instant, PlatformSettings)>>>);

impl SettingsCache {
    /// The settings, from the cache when fresh.
    ///
    /// # Errors
    ///
    /// Database errors.
    pub async fn get(&self, pool: &sqlx::PgPool) -> ApiResult<PlatformSettings> {
        if let Some((read_at, settings)) = self.0.read().await.as_ref()
            && read_at.elapsed() < CACHE_TTL
        {
            return Ok(settings.clone());
        }
        let settings = load(pool).await?;
        *self.0.write().await = Some((Instant::now(), settings.clone()));
        Ok(settings)
    }

    /// Replaces the cached value after a save.
    pub async fn set(&self, settings: PlatformSettings) {
        *self.0.write().await = Some((Instant::now(), settings));
    }
}

/// Reads the row.
///
/// # Errors
///
/// Database errors.
pub async fn load<'e, E: sqlx::PgExecutor<'e>>(executor: E) -> ApiResult<PlatformSettings> {
    let row = sqlx::query!(
        r#"select maintenance_mode, maintenance_message, maintenance_ends_at, maintenance_started_at,
                  registrations_open, blocked_email_domains, updated_at, updated_by
           from platform_settings where id"#
    )
    .fetch_one(executor)
    .await?;
    Ok(PlatformSettings {
        maintenance_mode: MaintenanceMode::from_db(&row.maintenance_mode)
            .unwrap_or(MaintenanceMode::Off),
        maintenance_message: row.maintenance_message,
        maintenance_ends_at: row.maintenance_ends_at,
        maintenance_started_at: row.maintenance_started_at,
        registrations_open: row.registrations_open,
        blocked_email_domains: row.blocked_email_domains,
        updated_at: row.updated_at,
        updated_by: row.updated_by,
    })
}

/// Whether the mode pauses a request of an organizer. Admins are never paused; neither are the
/// door, the digital tickets and Stripe, which do not go through a session.
pub fn maintenance_blocks(mode: MaintenanceMode, method: &Method, path: &str) -> bool {
    match mode {
        MaintenanceMode::Off => false,
        MaintenanceMode::ReadOnly => {
            !(method == Method::GET
                || method == Method::HEAD
                || path == "/api/auth/logout"
                || (method == Method::DELETE && path == "/api/account"))
        }
        MaintenanceMode::Full => path != "/api/auth/logout",
    }
}

/// A domain as typed by an admin, normalized: lowercase, no leading `@` or `.`, no trailing dot,
/// ASCII labels (an internationalized domain goes in its `xn--` form).
///
/// # Errors
///
/// `invalid_domain` with the offending entry.
pub fn normalize_domain(raw: &str) -> ApiResult<String> {
    let domain = raw
        .trim()
        .trim_start_matches(['@', '.'])
        .trim_end_matches('.')
        .to_ascii_lowercase();
    let label_ok = |label: &str| {
        !label.is_empty()
            && label.len() <= 63
            && !label.starts_with('-')
            && !label.ends_with('-')
            && label.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
    };
    if domain.len() <= 253 && domain.contains('.') && domain.split('.').all(label_ok) {
        Ok(domain)
    } else {
        Err(bad_request(
            "invalid_domain",
            format!("not a domain: {}", raw.chars().take(80).collect::<String>()),
        ))
    }
}

/// Normalizes, deduplicates and sorts a list of domains.
///
/// # Errors
///
/// `invalid_domain`, or `too_many_domains` past [`MAX_BLOCKED_DOMAINS`].
pub fn normalize_domains(raw: &[String]) -> ApiResult<Vec<String>> {
    let mut domains = raw
        .iter()
        .filter(|entry| !entry.trim().is_empty())
        .map(|entry| normalize_domain(entry))
        .collect::<ApiResult<Vec<_>>>()?;
    domains.sort();
    domains.dedup();
    if domains.len() > MAX_BLOCKED_DOMAINS {
        return Err(bad_request(
            "too_many_domains",
            format!("at most {MAX_BLOCKED_DOMAINS} domains"),
        ));
    }
    Ok(domains)
}

/// `domain` is a blocked one or a subdomain of one.
pub fn domain_blocked(domain: &str, blocked: &[String]) -> bool {
    let domain = domain.trim_end_matches('.').to_ascii_lowercase();
    blocked.iter().any(|entry| {
        domain == *entry
            || domain
                .strip_suffix(entry.as_str())
                .is_some_and(|rest| rest.ends_with('.'))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn domains_are_normalized() {
        assert_eq!(
            normalize_domain(" @Mailinator.COM. ").unwrap(),
            "mailinator.com"
        );
        assert_eq!(normalize_domain(".tempmail.io").unwrap(), "tempmail.io");
        for bad in ["", "com", "exa mple.com", "-a.com", "a..com", "ação.com"] {
            assert!(normalize_domain(bad).is_err(), "{bad}");
        }
        let list = normalize_domains(&[
            "b.com".to_owned(),
            " ".to_owned(),
            "A.com".to_owned(),
            "a.com".to_owned(),
        ])
        .unwrap();
        assert_eq!(list, ["a.com", "b.com"]);
    }

    #[test]
    fn subdomains_are_blocked_too() {
        let blocked = vec!["mailinator.com".to_owned()];
        assert!(domain_blocked("mailinator.com", &blocked));
        assert!(domain_blocked("x.Mailinator.com", &blocked));
        assert!(!domain_blocked("notmailinator.com", &blocked));
        assert!(!domain_blocked("mailinator.com.br", &blocked));
    }

    #[test]
    fn maintenance_pauses_by_mode() {
        let (get, post) = (Method::GET, Method::POST);
        assert!(!maintenance_blocks(
            MaintenanceMode::Off,
            &post,
            "/api/events"
        ));
        assert!(!maintenance_blocks(
            MaintenanceMode::ReadOnly,
            &get,
            "/api/events"
        ));
        assert!(maintenance_blocks(
            MaintenanceMode::ReadOnly,
            &post,
            "/api/events"
        ));
        assert!(!maintenance_blocks(
            MaintenanceMode::ReadOnly,
            &post,
            "/api/auth/logout"
        ));
        assert!(!maintenance_blocks(
            MaintenanceMode::ReadOnly,
            &Method::DELETE,
            "/api/account"
        ));
        assert!(maintenance_blocks(
            MaintenanceMode::ReadOnly,
            &Method::DELETE,
            "/api/events/x"
        ));
        assert!(maintenance_blocks(
            MaintenanceMode::Full,
            &get,
            "/api/events"
        ));
        assert!(!maintenance_blocks(
            MaintenanceMode::Full,
            &post,
            "/api/auth/logout"
        ));
    }
}
