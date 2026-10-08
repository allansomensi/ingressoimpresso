//! Outgoing e-mail (ADR 0012): Resend in production, log or memory otherwise.

use std::sync::{Arc, Mutex};

use serde::Serialize;
use thiserror::Error;

const RESEND_URL: &str = "https://api.resend.com/emails";

/// Sending failed.
#[derive(Debug, Error)]
#[error("e-mail delivery failed: {0}")]
pub struct MailError(String);

/// A sent message (memory mailer, tests).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SentMail {
    /// Recipient.
    pub to: String,
    /// Subject.
    pub subject: String,
    /// Plain-text body.
    pub body: String,
}

/// Mail transport.
#[derive(Debug, Clone)]
pub enum Mailer {
    /// Resend HTTP API.
    Resend {
        /// HTTP client.
        client: reqwest::Client,
        /// API key.
        api_key: String,
        /// Sender.
        from: String,
    },
    /// Development: writes the message to the log.
    Log,
    /// Tests: keeps messages in memory.
    Memory(Arc<Mutex<Vec<SentMail>>>),
}

#[derive(Serialize)]
struct ResendEmail<'a> {
    from: &'a str,
    to: [&'a str; 1],
    subject: &'a str,
    text: &'a str,
}

impl Mailer {
    /// Sends a plain-text message.
    ///
    /// # Errors
    ///
    /// [`MailError`] if the provider rejects or cannot be reached.
    pub async fn send(&self, to: &str, subject: &str, body: &str) -> Result<(), MailError> {
        match self {
            Self::Resend {
                client,
                api_key,
                from,
            } => {
                let response = client
                    .post(RESEND_URL)
                    .bearer_auth(api_key)
                    .json(&ResendEmail {
                        from,
                        to: [to],
                        subject,
                        text: body,
                    })
                    .send()
                    .await
                    .map_err(|error| MailError(error.to_string()))?;
                if response.status().is_success() {
                    Ok(())
                } else {
                    Err(MailError(format!("resend answered {}", response.status())))
                }
            }
            Self::Log => {
                tracing::warn!(%to, %subject, %body, "development mailer: e-mail not sent");
                Ok(())
            }
            Self::Memory(sent) => {
                sent.lock()
                    .map_err(|_| MailError("memory mailer poisoned".to_owned()))?
                    .push(SentMail {
                        to: to.to_owned(),
                        subject: subject.to_owned(),
                        body: body.to_owned(),
                    });
                Ok(())
            }
        }
    }
}
