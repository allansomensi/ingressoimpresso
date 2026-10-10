//! The anti-bot check before a login code is e-mailed (ADR 0044): Cloudflare Turnstile. The
//! sign-in page gets a token from Turnstile's widget and sends it with the e-mail; the API
//! confirms it with Cloudflare before spending the e-mail quota. Off unless both
//! `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` are set.

use std::time::Duration;

use serde::Deserialize;

const SITEVERIFY_URL: &str = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
/// Turnstile tokens are at most 2048 characters.
const MAX_TOKEN_LEN: usize = 2048;

/// The verdict on a token.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Verdict {
    /// Cloudflare confirmed a person solved it.
    Pass,
    /// Missing, expired, reused or forged.
    Fail,
    /// Cloudflare did not answer: the request goes on, held by the per-IP and daily limits.
    Unavailable,
}

/// The checker.
pub enum Captcha {
    /// Cloudflare Turnstile.
    Turnstile {
        /// HTTP client.
        client: reqwest::Client,
        /// Public key the widget is rendered with.
        site_key: String,
        /// Secret key of the siteverify call.
        secret_key: String,
    },
    /// A fixed verdict for the token `"pass"`, anything else fails (tests).
    Fixed {
        /// Public key handed to the page.
        site_key: String,
    },
}

impl std::fmt::Debug for Captcha {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let kind = match self {
            Self::Turnstile { .. } => "Turnstile",
            Self::Fixed { .. } => "Fixed",
        };
        formatter
            .debug_struct("Captcha")
            .field("kind", &kind)
            .field("site_key", &self.site_key())
            .finish_non_exhaustive()
    }
}

#[derive(Deserialize)]
struct SiteVerify {
    success: bool,
    #[serde(default, rename = "error-codes")]
    error_codes: Vec<String>,
}

impl Captcha {
    /// Cloudflare Turnstile with these keys.
    ///
    /// # Errors
    ///
    /// The HTTP client could not be built.
    pub fn turnstile(site_key: String, secret_key: String) -> Result<Self, String> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(8))
            .build()
            .map_err(|error| error.to_string())?;
        Ok(Self::Turnstile {
            client,
            site_key,
            secret_key,
        })
    }

    /// The public key the sign-in page renders the widget with.
    pub fn site_key(&self) -> &str {
        match self {
            Self::Turnstile { site_key, .. } | Self::Fixed { site_key } => site_key,
        }
    }

    /// Checks a token from the widget, once: Cloudflare refuses a token seen before.
    pub async fn verify(&self, token: Option<&str>, ip: Option<&str>) -> Verdict {
        let Some(token) = token
            .map(str::trim)
            .filter(|token| !token.is_empty() && token.len() <= MAX_TOKEN_LEN)
        else {
            return Verdict::Fail;
        };
        match self {
            Self::Fixed { .. } => {
                if token == "pass" {
                    Verdict::Pass
                } else {
                    Verdict::Fail
                }
            }
            Self::Turnstile {
                client, secret_key, ..
            } => {
                let mut body = serde_json::json!({ "secret": secret_key, "response": token });
                if let (Some(ip), Some(fields)) = (ip, body.as_object_mut()) {
                    fields.insert("remoteip".to_owned(), ip.into());
                }
                let answer = match client.post(SITEVERIFY_URL).json(&body).send().await {
                    Ok(response) if response.status().is_success() => {
                        response.json::<SiteVerify>().await
                    }
                    Ok(response) => {
                        tracing::warn!(status = %response.status(), "turnstile siteverify refused");
                        return Verdict::Unavailable;
                    }
                    Err(error) => {
                        tracing::warn!(%error, "turnstile siteverify unreachable");
                        return Verdict::Unavailable;
                    }
                };
                match answer {
                    Ok(answer) if answer.success => Verdict::Pass,
                    Ok(answer) => {
                        // A wrong secret is ours to fix, not the visitor's: let them through.
                        if answer.error_codes.iter().any(|code| {
                            code == "invalid-input-secret" || code == "missing-input-secret"
                        }) {
                            tracing::error!("TURNSTILE_SECRET_KEY is wrong: the check is off");
                            return Verdict::Unavailable;
                        }
                        tracing::info!(codes = ?answer.error_codes, "turnstile token refused");
                        Verdict::Fail
                    }
                    Err(error) => {
                        tracing::warn!(%error, "turnstile siteverify answered garbage");
                        Verdict::Unavailable
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn fixed_checker_passes_only_its_token() {
        let captcha = Captcha::Fixed {
            site_key: "site".to_owned(),
        };
        assert_eq!(captcha.verify(Some("pass"), None).await, Verdict::Pass);
        assert_eq!(captcha.verify(Some("other"), None).await, Verdict::Fail);
        assert_eq!(captcha.verify(Some("  "), None).await, Verdict::Fail);
        assert_eq!(captcha.verify(None, None).await, Verdict::Fail);
        let long = "x".repeat(MAX_TOKEN_LEN + 1);
        assert_eq!(captcha.verify(Some(&long), None).await, Verdict::Fail);
        assert_eq!(captcha.site_key(), "site");
    }
}
