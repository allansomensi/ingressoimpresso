//! Typed configuration, read once from the environment and validated at startup (fail fast).

use std::path::PathBuf;

use thiserror::Error;

use crate::keys::MasterKey;

/// Runtime configuration. `Debug` leaves secrets out (CLAUDE.md invariant 4).
#[derive(Clone)]
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
    /// `PUBLIC_WEB_URL`: the site, where Stripe sends the payer back. Defaults to the first
    /// allowed origin.
    pub public_web_url: String,
    /// `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` (ADR 0020): both or neither. Without them
    /// batches are paid only by an admin.
    pub stripe: Option<StripeKeys>,
    /// `EXPORT_DIR`: where generated files are cached (ephemeral disk is fine, ADR 0008).
    pub export_dir: PathBuf,
    /// `APP_ENV=production` enforces production-only requirements and JSON logs.
    pub production: bool,
    /// `FREE_TICKETS`: tickets every organization gets for free (ADR 0024), default
    /// [`crate::pricing::DEFAULT_FREE_TICKETS`]; 0 turns the offer off.
    pub free_tickets: i32,
}

impl std::fmt::Debug for Config {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("Config")
            .field("port", &self.port)
            .field("allowed_origins", &self.allowed_origins)
            .field("resend", &self.resend_api_key.is_some())
            .field("mail_from", &self.mail_from)
            .field("admin_emails", &self.admin_emails)
            .field("public_api_url", &self.public_api_url)
            .field("public_web_url", &self.public_web_url)
            .field("stripe", &self.stripe)
            .field("export_dir", &self.export_dir)
            .field("production", &self.production)
            .field("free_tickets", &self.free_tickets)
            .finish_non_exhaustive()
    }
}

/// Stripe credentials.
#[derive(Clone)]
pub struct StripeKeys {
    /// `sk_live_...`/`sk_test_...` (or a restricted `rk_...` key).
    pub secret_key: String,
    /// `whsec_...` of the webhook endpoint.
    pub webhook_secret: String,
}

impl std::fmt::Debug for StripeKeys {
    // Never print the keys (CLAUDE.md: secrets stay out of the logs).
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("StripeKeys")
            .field("test_mode", &self.test_mode())
            .finish_non_exhaustive()
    }
}

impl StripeKeys {
    /// Whether these are test-mode keys (no real money moves).
    pub fn test_mode(&self) -> bool {
        self.secret_key.starts_with("sk_test_") || self.secret_key.starts_with("rk_test_")
    }
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
        let allowed_origins = list("ALLOWED_ORIGINS")
            .iter()
            .map(|origin| normalize_origin(origin, production))
            .collect::<Result<Vec<_>, _>>()?;
        let public_api_url = get("PUBLIC_API_URL")
            .unwrap_or_else(|| format!("http://localhost:{port}"))
            .trim_end_matches('/')
            .to_owned();
        let admin_emails: Vec<String> = list("ADMIN_EMAILS")
            .into_iter()
            .map(|email| email.to_lowercase())
            .collect();
        let public_web_url = get("PUBLIC_WEB_URL")
            .map(|url| url.trim_end_matches('/').to_owned())
            .or_else(|| allowed_origins.first().cloned())
            .unwrap_or_else(|| "http://localhost:3000".to_owned());
        let stripe = stripe_keys(get("STRIPE_SECRET_KEY"), get("STRIPE_WEBHOOK_SECRET"))?;
        let free_tickets = match get("FREE_TICKETS") {
            Some(value) => value
                .parse::<i32>()
                .ok()
                .filter(|count| (0..=10_000).contains(count))
                .ok_or(ConfigError::Invalid {
                    name: "FREE_TICKETS",
                    reason: "must be a whole number from 0 to 10000".to_owned(),
                })?,
            None => crate::pricing::DEFAULT_FREE_TICKETS,
        };
        if production {
            if stripe.is_some() && !public_web_url.starts_with("https://") {
                return Err(ConfigError::Invalid {
                    name: "PUBLIC_WEB_URL",
                    reason: "must be the https:// address of the site".to_owned(),
                });
            }
            // Without these the server starts but the site cannot work: fail with the reason in
            // the deploy log instead.
            if allowed_origins.is_empty() {
                return Err(ConfigError::Missing("ALLOWED_ORIGINS"));
            }
            if !public_api_url.starts_with("https://") {
                return Err(ConfigError::Invalid {
                    name: "PUBLIC_API_URL",
                    reason: "must be the https:// address of this API".to_owned(),
                });
            }
            if admin_emails.is_empty() {
                return Err(ConfigError::Missing("ADMIN_EMAILS"));
            }
        }
        Ok(Self {
            database_url: require("DATABASE_URL")?,
            port,
            allowed_origins,
            master_key,
            resend_api_key,
            mail_from: get("MAIL_FROM")
                .unwrap_or_else(|| "Ingresso Impresso <onboarding@resend.dev>".to_owned()),
            admin_emails,
            public_api_url,
            public_web_url,
            stripe,
            export_dir: get("EXPORT_DIR").map_or_else(
                || std::env::temp_dir().join("ingressoimpresso-exports"),
                PathBuf::from,
            ),
            production,
            free_tickets,
        })
    }

    /// Whether `MAIL_FROM` still uses Resend's test sender, which only reaches the Resend
    /// account owner.
    pub fn uses_test_sender(&self) -> bool {
        self.mail_from.contains("@resend.dev")
    }

    /// Whether `email` may perform admin actions.
    pub fn is_admin(&self, email: &str) -> bool {
        self.admin_emails
            .iter()
            .any(|admin| admin.eq_ignore_ascii_case(email))
    }
}

/// Stripe keys come in pairs (ADR 0020).
fn stripe_keys(
    secret_key: Option<String>,
    webhook_secret: Option<String>,
) -> Result<Option<StripeKeys>, ConfigError> {
    match (secret_key, webhook_secret) {
        (Some(secret_key), Some(webhook_secret)) => {
            if !webhook_secret.starts_with("whsec_") {
                return Err(ConfigError::Invalid {
                    name: "STRIPE_WEBHOOK_SECRET",
                    reason: "must be the whsec_... signing secret of the webhook endpoint"
                        .to_owned(),
                });
            }
            Ok(Some(StripeKeys {
                secret_key,
                webhook_secret,
            }))
        }
        (None, None) => Ok(None),
        (Some(_), None) => Err(ConfigError::Missing("STRIPE_WEBHOOK_SECRET")),
        (None, Some(_)) => Err(ConfigError::Missing("STRIPE_SECRET_KEY")),
    }
}

/// An origin exactly as browsers send it: `https://host[:port]`, lowercase, no path or
/// trailing slash. `http://localhost` is accepted outside production only.
fn normalize_origin(origin: &str, production: bool) -> Result<String, ConfigError> {
    let invalid = |reason: &str| ConfigError::Invalid {
        name: "ALLOWED_ORIGINS",
        reason: format!("{origin}: {reason}"),
    };
    let origin = origin.trim_end_matches('/').to_ascii_lowercase();
    let host = if let Some(host) = origin.strip_prefix("https://") {
        host
    } else if !production && origin.starts_with("http://localhost") {
        origin.trim_start_matches("http://")
    } else {
        return Err(invalid("must start with https://"));
    };
    if host.is_empty() || host.contains(['/', '?', '#', '*', ' ']) {
        return Err(invalid(
            "must be only scheme and host, like https://seudominio.com.br",
        ));
    }
    Ok(origin)
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
    fn origins_are_normalized_like_browsers_send_them() {
        assert_eq!(
            normalize_origin("https://Exemplo.com.br/", true).unwrap(),
            "https://exemplo.com.br"
        );
        assert_eq!(
            normalize_origin("http://localhost:3000", false).unwrap(),
            "http://localhost:3000"
        );
        for bad in [
            "https://exemplo.com.br/painel",
            "exemplo.com.br",
            "https://*.exemplo.com.br",
        ] {
            assert!(normalize_origin(bad, true).is_err(), "{bad}");
        }
        assert!(normalize_origin("http://localhost:3000", true).is_err());
    }

    #[test]
    fn production_requires_what_the_site_needs() {
        let full = [
            ("DATABASE_URL", "postgres://localhost/db"),
            ("TICKET_KEY_ENCRYPTION_KEY", KEY),
            ("APP_ENV", "production"),
            ("RESEND_API_KEY", "re_x"),
            (
                "ALLOWED_ORIGINS",
                "https://seudominio.com.br/, https://www.seudominio.com.br",
            ),
            ("PUBLIC_API_URL", "https://api.seudominio.com.br/"),
            ("ADMIN_EMAILS", "eu@exemplo.com"),
        ];
        let config = Config::from_lookup(lookup(&full)).unwrap();
        assert_eq!(
            config.allowed_origins,
            ["https://seudominio.com.br", "https://www.seudominio.com.br"]
        );
        assert_eq!(config.public_api_url, "https://api.seudominio.com.br");
        assert!(config.uses_test_sender());
        for (missing, name) in [
            ("ALLOWED_ORIGINS", "ALLOWED_ORIGINS"),
            ("PUBLIC_API_URL", "PUBLIC_API_URL"),
            ("ADMIN_EMAILS", "ADMIN_EMAILS"),
        ] {
            let partial: Vec<_> = full
                .iter()
                .copied()
                .filter(|(key, _)| *key != missing)
                .collect();
            let error = Config::from_lookup(lookup(&partial)).unwrap_err();
            assert!(error.to_string().contains(name), "{error}");
        }
    }

    #[test]
    fn stripe_keys_come_in_pairs() {
        let base = [
            ("DATABASE_URL", "postgres://localhost/db"),
            ("TICKET_KEY_ENCRYPTION_KEY", KEY),
            ("ALLOWED_ORIGINS", "http://localhost:3000"),
        ];
        let config = Config::from_lookup(lookup(&base)).unwrap();
        assert!(config.stripe.is_none());
        assert_eq!(config.public_web_url, "http://localhost:3000");

        let mut half = base.to_vec();
        half.push(("STRIPE_SECRET_KEY", "sk_test_x"));
        assert!(matches!(
            Config::from_lookup(lookup(&half)),
            Err(ConfigError::Missing("STRIPE_WEBHOOK_SECRET"))
        ));
        half.push(("STRIPE_WEBHOOK_SECRET", "sk_test_wrong_field"));
        assert!(matches!(
            Config::from_lookup(lookup(&half)),
            Err(ConfigError::Invalid {
                name: "STRIPE_WEBHOOK_SECRET",
                ..
            })
        ));
        let mut full = base.to_vec();
        full.push(("STRIPE_SECRET_KEY", "sk_test_x"));
        full.push(("STRIPE_WEBHOOK_SECRET", "whsec_y"));
        full.push(("PUBLIC_WEB_URL", "https://seudominio.com.br/"));
        let config = Config::from_lookup(lookup(&full)).unwrap();
        let printed = format!("{config:?}");
        assert!(
            !printed.contains("sk_test_x") && !printed.contains("whsec_y"),
            "{printed}"
        );
        assert!(!printed.contains("postgres://"), "{printed}");
        let stripe = config.stripe.unwrap();
        assert!(stripe.test_mode());
        assert_eq!(config.public_web_url, "https://seudominio.com.br");
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
