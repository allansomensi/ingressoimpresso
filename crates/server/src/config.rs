//! Typed configuration, read once from the environment and validated at startup (fail fast).

use std::path::PathBuf;

use thiserror::Error;

use crate::keys::MasterKey;

/// Runtime configuration.
#[derive(Debug, Clone)]
pub struct Config {
    /// `DATABASE_URL`: direct (non-pooled) Postgres connection string.
    pub database_url: String,
    /// `PORT` (Render sets it), default 8080.
    pub port: u16,
    /// `ALLOWED_ORIGINS`: comma-separated web origins allowed by CORS.
    pub allowed_origins: Vec<String>,
    /// `TICKET_KEY_ENCRYPTION_KEY`: base64 of 32 bytes (ADR 0005).
    pub master_key: MasterKey,
    /// `RESEND_API_KEY`: without it, login codes are only logged (development).
    pub resend_api_key: Option<String>,
    /// `MAIL_FROM`: sender of login e-mails.
    pub mail_from: String,
    /// `ADMIN_EMAILS`: comma-separated e-mails allowed to mark batches as paid (MVP, ADR 0014).
    pub admin_emails: Vec<String>,
    /// `PUBLIC_API_URL`: absolute base URL of this API, used in download links.
    pub public_api_url: String,
    /// `EXPORT_DIR`: where generated files are cached (ephemeral disk is fine, ADR 0008).
    pub export_dir: PathBuf,
    /// `APP_ENV=production` enforces production-only requirements and JSON logs.
    pub production: bool,
}

/// A missing or invalid setting.
#[derive(Debug, Error)]
pub enum ConfigError {
    /// Required variable missing.
    #[error("missing environment variable {0}")]
    Missing(&'static str),
    /// Variable present but invalid.
    #[error("invalid environment variable {name}: {reason}")]
    Invalid {
        /// Variable name.
        name: &'static str,
        /// Why.
        reason: String,
    },
}

impl Config {
    /// Reads the process environment.
    ///
    /// # Errors
    ///
    /// See [`ConfigError`].
    pub fn from_env() -> Result<Self, ConfigError> {
        Self::from_lookup(|name| std::env::var(name).ok())
    }

    /// Reads settings through `lookup` (testable).
    ///
    /// # Errors
    ///
    /// See [`ConfigError`].
    pub fn from_lookup(lookup: impl Fn(&str) -> Option<String>) -> Result<Self, ConfigError> {
        let get = |name: &'static str| {
            lookup(name)
                .map(|value| value.trim().to_owned())
                .filter(|v| !v.is_empty())
        };
        let require = |name: &'static str| get(name).ok_or(ConfigError::Missing(name));
        let list = |name: &'static str| -> Vec<String> {
            get(name)
                .map(|value| {
                    value
                        .split(',')
                        .map(|item| item.trim().to_owned())
                        .filter(|item| !item.is_empty())
                        .collect()
                })
                .unwrap_or_default()
        };

        let production = get("APP_ENV").is_some_and(|env| env == "production");
        let port = match get("PORT") {
            Some(port) => port.parse().map_err(|_| ConfigError::Invalid {
                name: "PORT",
                reason: "not a port number".to_owned(),
            })?,
            None => 8080,
        };
        let master_key =
            MasterKey::from_base64(&require("TICKET_KEY_ENCRYPTION_KEY")?).map_err(|reason| {
                ConfigError::Invalid {
                    name: "TICKET_KEY_ENCRYPTION_KEY",
                    reason: reason.to_owned(),
                }
            })?;
        let resend_api_key = get("RESEND_API_KEY");
        if production && resend_api_key.is_none() {
            return Err(ConfigError::Missing("RESEND_API_KEY"));
        }
        let allowed_origins = list("ALLOWED_ORIGINS");
        if let Some(bad) = allowed_origins.iter().find(|origin| {
            !(origin.starts_with("https://") || origin.starts_with("http://localhost"))
        }) {
            return Err(ConfigError::Invalid {
                name: "ALLOWED_ORIGINS",
                reason: format!("{bad} must be https:// (or http://localhost for development)"),
            });
        }
        let public_api_url = get("PUBLIC_API_URL")
            .unwrap_or_else(|| format!("http://localhost:{port}"))
            .trim_end_matches('/')
            .to_owned();
        Ok(Self {
            database_url: require("DATABASE_URL")?,
            port,
            allowed_origins,
            master_key,
            resend_api_key,
            mail_from: get("MAIL_FROM")
                .unwrap_or_else(|| "Ingresso Impresso <onboarding@resend.dev>".to_owned()),
            admin_emails: list("ADMIN_EMAILS")
                .into_iter()
                .map(|email| email.to_lowercase())
                .collect(),
            public_api_url,
            export_dir: get("EXPORT_DIR").map_or_else(
                || std::env::temp_dir().join("ingressoimpresso-exports"),
                PathBuf::from,
            ),
            production,
        })
    }

    /// Whether `email` may perform admin actions.
    pub fn is_admin(&self, email: &str) -> bool {
        self.admin_emails
            .iter()
            .any(|admin| admin.eq_ignore_ascii_case(email))
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use super::*;

    fn lookup(pairs: &[(&str, &str)]) -> impl Fn(&str) -> Option<String> {
        let map: HashMap<String, String> = pairs
            .iter()
            .map(|(k, v)| ((*k).to_owned(), (*v).to_owned()))
            .collect();
        move |name| map.get(name).cloned()
    }

    const KEY: &str = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

    #[test]
    fn minimal_development_config() {
        let config = Config::from_lookup(lookup(&[
            ("DATABASE_URL", "postgres://localhost/db"),
            ("TICKET_KEY_ENCRYPTION_KEY", KEY),
            ("ADMIN_EMAILS", " Eu@Exemplo.com , "),
        ]))
        .unwrap();
        assert_eq!(config.port, 8080);
        assert!(config.is_admin("eu@exemplo.com"));
        assert!(!config.production);
    }

    #[test]
    fn production_requires_resend_and_https_origins() {
        let base = [
            ("DATABASE_URL", "postgres://localhost/db"),
            ("TICKET_KEY_ENCRYPTION_KEY", KEY),
            ("APP_ENV", "production"),
        ];
        assert!(matches!(
            Config::from_lookup(lookup(&base)),
            Err(ConfigError::Missing("RESEND_API_KEY"))
        ));
        let mut with_origin = base.to_vec();
        with_origin.push(("RESEND_API_KEY", "re_x"));
        with_origin.push(("ALLOWED_ORIGINS", "http://evil.example"));
        assert!(matches!(
            Config::from_lookup(lookup(&with_origin)),
            Err(ConfigError::Invalid {
                name: "ALLOWED_ORIGINS",
                ..
            })
        ));
    }

    #[test]
    fn rejects_short_master_key() {
        let result = Config::from_lookup(lookup(&[
            ("DATABASE_URL", "postgres://localhost/db"),
            ("TICKET_KEY_ENCRYPTION_KEY", "c2hvcnQ="),
        ]));
        assert!(matches!(
            result,
            Err(ConfigError::Invalid {
                name: "TICKET_KEY_ENCRYPTION_KEY",
                ..
            })
        ));
    }
}
