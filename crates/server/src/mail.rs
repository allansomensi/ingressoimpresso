//! Outgoing e-mail (ADRs 0012, 0028): Resend in production, log or memory otherwise. The
//! messages themselves live in `emails.rs`.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Serialize;
use thiserror::Error;

use crate::emails::Email;

const RESEND_URL: &str = "https://api.resend.com/emails";
/// Longest part of a provider error kept in the log.
const MAX_ERROR_CHARS: usize = 500;

/// Sending failed.
#[derive(Debug, Error)]
pub enum MailError {
    /// The provider refused: daily quota or rate limit reached (Resend answers 429).
    #[error("e-mail quota reached: {0}")]
    Quota(String),
    /// Any other failure.
    #[error("e-mail delivery failed: {0}")]
    Failed(String),
}

impl MailError {
    /// The API error shown to the user: `mail_quota` invites another way in (ADR 0028).
    pub fn api_error(&self) -> crate::error::ApiError {
        match self {
            Self::Quota(_) => crate::error::ApiError::Unavailable("mail_quota"),
            Self::Failed(_) => crate::error::ApiError::Unavailable("mail_unavailable"),
        }
    }
}

/// What an e-mail is for, counted against the daily quota (`mail_sends.kind`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MailKind {
    /// Login code.
    LoginCode,
    /// A batch paid online.
    BatchPaid,
}

impl MailKind {
    /// Database value.
    pub const fn db(self) -> &'static str {
        match self {
            Self::LoginCode => "login_code",
            Self::BatchPaid => "batch_paid",
        }
    }
}

/// A sent message (memory mailer, tests).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SentMail {
    /// Recipient.
    pub to: String,
    /// Subject.
    pub subject: String,
    /// Plain-text body.
    pub body: String,
    /// HTML body.
    pub html: String,
}

/// Mail transport.
#[derive(Clone)]
pub enum Mailer {
    /// Resend HTTP API.
    Resend {
        /// HTTP client.
        client: reqwest::Client,
        /// Emails endpoint (Resend's, or a local server in tests).
        endpoint: String,
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

impl std::fmt::Debug for Mailer {
    // The API key never reaches a log line.
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Resend { endpoint, from, .. } => formatter
                .debug_struct("Mailer::Resend")
                .field("endpoint", endpoint)
                .field("from", from)
                .finish_non_exhaustive(),
            Self::Log => formatter.write_str("Mailer::Log"),
            Self::Memory(_) => formatter.write_str("Mailer::Memory"),
        }
    }
}

#[derive(Serialize)]
struct ResendEmail<'a> {
    from: &'a str,
    to: [&'a str; 1],
    subject: &'a str,
    text: &'a str,
    html: &'a str,
}

impl Mailer {
    /// The Resend mailer. A rustls crypto provider must be installed first.
    ///
    /// # Errors
    ///
    /// [`MailError`] if the HTTP client cannot be built.
    pub fn resend(api_key: String, from: String) -> Result<Self, MailError> {
        Self::resend_at(RESEND_URL.to_owned(), api_key, from)
    }

    fn resend_at(endpoint: String, api_key: String, from: String) -> Result<Self, MailError> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            // Resend rejects requests without a User-Agent (403, error 1010).
            .user_agent(concat!(
                env!("CARGO_PKG_NAME"),
                "/",
                env!("CARGO_PKG_VERSION")
            ))
            .build()
            .map_err(|error| MailError::Failed(error.to_string()))?;
        Ok(Self::Resend {
            client,
            endpoint,
            api_key,
            from,
        })
    }

    /// Sends a message (HTML with its plain-text alternative).
    ///
    /// # Errors
    ///
    /// [`MailError`] if the provider rejects or cannot be reached.
    pub async fn send(&self, to: &str, email: &Email) -> Result<(), MailError> {
        let (subject, body) = (email.subject.as_str(), email.text.as_str());
        match self {
            Self::Resend {
                client,
                endpoint,
                api_key,
                from,
            } => {
                let response = client
                    .post(endpoint)
                    .bearer_auth(api_key)
                    .json(&ResendEmail {
                        from,
                        to: [to],
                        subject,
                        text: body,
                        html: &email.html,
                    })
                    .send()
                    .await
                    .map_err(|error| MailError::Failed(error.to_string()))?;
                let status = response.status();
                if status.is_success() {
                    return Ok(());
                }
                // Resend explains the refusal in the body (unverified domain, wrong sender,
                // daily quota); it never echoes the API key.
                let detail = response.text().await.unwrap_or_default();
                let detail: String = detail.chars().take(MAX_ERROR_CHARS).collect();
                let message = format!("resend answered {status}: {detail}");
                if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
                    Err(MailError::Quota(message))
                } else {
                    Err(MailError::Failed(message))
                }
            }
            Self::Log => {
                tracing::warn!(%to, %subject, %body, "development mailer: e-mail not sent");
                Ok(())
            }
            Self::Memory(sent) => {
                sent.lock()
                    .map_err(|_| MailError::Failed("memory mailer poisoned".to_owned()))?
                    .push(SentMail {
                        to: to.to_owned(),
                        subject: subject.to_owned(),
                        body: body.to_owned(),
                        html: email.html.clone(),
                    });
                Ok(())
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::io::{BufRead as _, BufReader, Read as _, Write as _};
    use std::net::TcpListener;

    use super::*;

    /// One HTTP exchange with a fake Resend: returns the request head, answers `response`.
    fn fake_resend(response: String) -> (String, std::thread::JoinHandle<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let endpoint = format!("http://{}/emails", listener.local_addr().unwrap());
        let handle = std::thread::spawn(move || {
            let (stream, _) = listener.accept().unwrap();
            let mut reader = BufReader::new(stream.try_clone().unwrap());
            let mut head = String::new();
            let mut length = 0;
            loop {
                let mut line = String::new();
                reader.read_line(&mut line).unwrap();
                if let Some(value) = line.to_ascii_lowercase().strip_prefix("content-length:") {
                    length = value.trim().parse().unwrap();
                }
                if line == "\r\n" {
                    break;
                }
                head.push_str(&line);
            }
            let mut body = vec![0; length];
            reader.read_exact(&mut body).unwrap();
            let mut stream = stream;
            stream.write_all(response.as_bytes()).unwrap();
            head
        });
        (endpoint, handle)
    }

    #[tokio::test]
    async fn resend_requests_carry_a_user_agent_and_errors_keep_the_reason() {
        let _ = rustls::crypto::ring::default_provider().install_default();
        let body = r#"{"name":"validation_error","message":"The domain is not verified"}"#;
        let (endpoint, server) = fake_resend(format!(
            "HTTP/1.1 403 Forbidden\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",
            body.len()
        ));
        let mailer =
            Mailer::resend_at(endpoint, "re_test".to_owned(), "A <a@b.c>".to_owned()).unwrap();
        let email = Email {
            subject: "Assunto".to_owned(),
            text: "Corpo".to_owned(),
            html: "<p>Corpo</p>".to_owned(),
        };
        let error = mailer.send("x@y.z", &email).await.unwrap_err();
        let head = server.join().unwrap().to_ascii_lowercase();
        assert!(
            head.contains("user-agent: ingressoimpresso-server/"),
            "{head}"
        );
        assert!(head.contains("authorization: bearer re_test"), "{head}");
        let message = error.to_string();
        assert!(
            message.contains("403") && message.contains("validation_error"),
            "{message}"
        );
    }
}
