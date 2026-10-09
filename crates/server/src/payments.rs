//! Online payment of batches with Stripe Checkout (ADR 0020).
//!
//! The server talks to Stripe's HTTP API directly (form-encoded requests, no SDK): it creates a
//! Checkout Session per payment attempt, reads it back, expires it when a batch is canceled, and
//! verifies the signature of webhook events. Only a verified event or a session read back from
//! Stripe can mark a batch as paid (CLAUDE.md invariant 2).

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use hmac::{Hmac, KeyInit as _, Mac as _};
use serde::Deserialize;
use sha2::Sha256;
use thiserror::Error;
use uuid::Uuid;

const STRIPE_API: &str = "https://api.stripe.com";
/// Events older than this are refused (replayed webhook), as Stripe's own libraries do.
pub const WEBHOOK_TOLERANCE_SECS: i64 = 300;
/// Longest part of a provider error kept in the log.
const MAX_ERROR_CHARS: usize = 500;

/// A payment provider call failed.
#[derive(Debug, Error)]
pub enum PaymentError {
    /// Online payment is not configured on this server.
    #[error("online payment is not configured")]
    Disabled,
    /// Stripe refused the request or could not be reached.
    #[error("payment provider error: {0}")]
    Provider(String),
}

/// A webhook request that must be refused.
#[derive(Debug, Error, PartialEq, Eq)]
pub enum WebhookError {
    /// No usable `Stripe-Signature` header.
    #[error("missing or malformed signature header")]
    MalformedHeader,
    /// No signature matches the payload.
    #[error("signature mismatch")]
    BadSignature,
    /// The event is older than the tolerance.
    #[error("timestamp outside the tolerance")]
    Expired,
    /// The payload is not a Stripe event.
    #[error("invalid event payload")]
    InvalidPayload,
}

/// What a Checkout Session costs and where the customer comes back to.
#[derive(Debug, Clone)]
pub struct CheckoutRequest {
    /// Our payment id, sent as Stripe's idempotency key. Concurrent checkouts of one batch are
    /// serialized by [`crate::state::AppState::batch_lock`]; the key keeps a retry of this same
    /// request from opening a second session.
    pub payment_id: Uuid,
    /// The batch being paid.
    pub batch_id: Uuid,
    /// Its event.
    pub event_id: Uuid,
    /// Line item shown on the payment page.
    pub description: String,
    /// Amount in centavos.
    pub amount_cents: i32,
    /// Pre-filled e-mail of the payer (receipt).
    pub customer_email: String,
    /// Where Stripe sends the customer after paying.
    pub success_url: String,
    /// Where Stripe sends the customer if they give up.
    pub cancel_url: String,
}

/// The fields of a Checkout Session we use.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct CheckoutSession {
    /// `cs_...`.
    pub id: String,
    /// Payment page; `null` once the session is complete or expired.
    pub url: Option<String>,
    /// `open`, `complete` or `expired`.
    pub status: Option<String>,
    /// `paid`, `unpaid` (Pix waiting for the transfer) or `no_payment_required`.
    pub payment_status: String,
    /// Charged amount in centavos.
    pub amount_total: Option<i64>,
    /// Lowercase ISO currency.
    pub currency: Option<String>,
    /// `pi_...`, once there is a payment.
    pub payment_intent: Option<String>,
    /// Unix time when the session stops accepting payment.
    pub expires_at: i64,
}

impl CheckoutSession {
    /// Whether the money is in: complete and paid.
    pub fn is_paid(&self) -> bool {
        self.status.as_deref() == Some("complete") && self.payment_status == "paid"
    }
}

/// A verified webhook event.
#[derive(Debug, Clone, Deserialize)]
pub struct StripeEvent {
    /// `evt_...`.
    pub id: String,
    /// e.g. `checkout.session.completed`.
    #[serde(rename = "type")]
    pub kind: String,
    /// The object the event is about.
    pub data: StripeEventData,
}

/// `data` of a webhook event.
#[derive(Debug, Clone, Deserialize)]
pub struct StripeEventData {
    /// The object, kept raw: only Checkout Session events are parsed further.
    pub object: serde_json::Value,
}

/// A refund created on Stripe (ADR 0032).
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, serde::Serialize)]
pub struct Refund {
    /// `re_...`.
    pub id: String,
    /// `pending`, `succeeded`, `failed`...
    pub status: Option<String>,
    /// Refunded amount in centavos.
    pub amount: Option<i64>,
}

/// In-memory Stripe for tests: sessions by id.
#[derive(Debug, Default)]
pub struct FakeStripe {
    /// Every session created, by id.
    pub sessions: HashMap<String, CheckoutSession>,
    /// The requests received, in order.
    pub requests: Vec<CheckoutRequest>,
    /// Payment intents refunded, in order.
    pub refunds: Vec<String>,
}

impl FakeStripe {
    /// Completes a session unpaid, as Stripe does when the customer gets a Pix code.
    pub fn show_pix(&mut self, session_id: &str) -> Option<CheckoutSession> {
        let session = self.sessions.get_mut(session_id)?;
        session.status = Some("complete".to_owned());
        session.url = None;
        Some(session.clone())
    }

    /// Marks a session as paid, as Stripe does when the customer pays.
    pub fn pay(&mut self, session_id: &str) -> Option<CheckoutSession> {
        let session = self.sessions.get_mut(session_id)?;
        session.status = Some("complete".to_owned());
        "paid".clone_into(&mut session.payment_status);
        session.url = None;
        session.payment_intent = Some(format!("pi_{session_id}"));
        Some(session.clone())
    }
}

/// Payment transport.
#[derive(Clone)]
pub enum Payments {
    /// Stripe's HTTP API.
    Stripe {
        /// HTTP client.
        client: reqwest::Client,
        /// API base URL (Stripe's, or a local server in tests).
        api_base: String,
        /// `sk_live_...` or `sk_test_...` (a restricted key with Checkout write access works).
        secret_key: String,
        /// `whsec_...` of the webhook endpoint.
        webhook_secret: String,
    },
    /// No online payment: batches are marked as paid by an admin (ADR 0014's fallback).
    Disabled,
    /// Tests: sessions live in memory; webhooks are signed with `webhook_secret`.
    Fake {
        /// The fake provider.
        stripe: Arc<Mutex<FakeStripe>>,
        /// Webhook secret.
        webhook_secret: String,
    },
}

impl std::fmt::Debug for Payments {
    // The keys never reach a log line.
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(match self {
            Self::Stripe { .. } => "Payments::Stripe",
            Self::Disabled => "Payments::Disabled",
            Self::Fake { .. } => "Payments::Fake",
        })
    }
}

impl Payments {
    /// The Stripe transport. A rustls crypto provider must be installed first.
    ///
    /// # Errors
    ///
    /// [`PaymentError::Provider`] if the HTTP client cannot be built.
    pub fn stripe(secret_key: String, webhook_secret: String) -> Result<Self, PaymentError> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(20))
            .user_agent(concat!(
                env!("CARGO_PKG_NAME"),
                "/",
                env!("CARGO_PKG_VERSION")
            ))
            .build()
            .map_err(|error| PaymentError::Provider(error.to_string()))?;
        Ok(Self::Stripe {
            client,
            api_base: STRIPE_API.to_owned(),
            secret_key,
            webhook_secret,
        })
    }

    /// Whether batches can be paid online.
    pub fn enabled(&self) -> bool {
        !matches!(self, Self::Disabled)
    }

    /// Opens a Checkout Session.
    ///
    /// # Errors
    ///
    /// See [`PaymentError`].
    pub async fn create_checkout(
        &self,
        request: &CheckoutRequest,
    ) -> Result<CheckoutSession, PaymentError> {
        match self {
            Self::Stripe {
                client,
                api_base,
                secret_key,
                ..
            } => {
                let batch_id = request.batch_id.to_string();
                let event_id = request.event_id.to_string();
                let amount = request.amount_cents.to_string();
                let form = form_urlencoded::Serializer::new(String::new())
                    .append_pair("mode", "payment")
                    .append_pair("locale", "pt-BR")
                    .append_pair("customer_email", &request.customer_email)
                    .append_pair("client_reference_id", &batch_id)
                    .append_pair("success_url", &request.success_url)
                    .append_pair("cancel_url", &request.cancel_url)
                    .append_pair("line_items[0][quantity]", "1")
                    .append_pair(
                        "line_items[0][price_data][currency]",
                        crate::pricing::CURRENCY,
                    )
                    .append_pair("line_items[0][price_data][unit_amount]", &amount)
                    .append_pair(
                        "line_items[0][price_data][product_data][name]",
                        &request.description,
                    )
                    .append_pair("metadata[batch_id]", &batch_id)
                    .append_pair("metadata[event_id]", &event_id)
                    .append_pair("payment_intent_data[metadata][batch_id]", &batch_id)
                    .finish();
                let response = client
                    .post(format!("{api_base}/v1/checkout/sessions"))
                    .bearer_auth(secret_key)
                    .header("Idempotency-Key", request.payment_id.to_string())
                    .header("Content-Type", "application/x-www-form-urlencoded")
                    .body(form)
                    .send()
                    .await;
                stripe_reply(response).await
            }
            Self::Disabled => Err(PaymentError::Disabled),
            Self::Fake { stripe, .. } => {
                let mut stripe = lock(stripe)?;
                let id = format!("cs_test_{}", Uuid::new_v4().simple());
                let session = CheckoutSession {
                    url: Some(format!("https://checkout.stripe.test/c/pay/{id}")),
                    id: id.clone(),
                    status: Some("open".to_owned()),
                    payment_status: "unpaid".to_owned(),
                    amount_total: Some(i64::from(request.amount_cents)),
                    currency: Some(crate::pricing::CURRENCY.to_owned()),
                    payment_intent: None,
                    expires_at: time::OffsetDateTime::now_utc().unix_timestamp() + 86_400,
                };
                stripe.sessions.insert(id, session.clone());
                stripe.requests.push(request.clone());
                Ok(session)
            }
        }
    }

    /// Reads a Checkout Session back from Stripe.
    ///
    /// # Errors
    ///
    /// See [`PaymentError`].
    pub async fn retrieve_checkout(
        &self,
        session_id: &str,
    ) -> Result<CheckoutSession, PaymentError> {
        match self {
            Self::Stripe {
                client,
                api_base,
                secret_key,
                ..
            } => {
                let response = client
                    .get(format!("{api_base}/v1/checkout/sessions/{session_id}"))
                    .bearer_auth(secret_key)
                    .send()
                    .await;
                stripe_reply(response).await
            }
            Self::Disabled => Err(PaymentError::Disabled),
            Self::Fake { stripe, .. } => lock(stripe)?
                .sessions
                .get(session_id)
                .cloned()
                .ok_or_else(|| PaymentError::Provider("no such session".to_owned())),
        }
    }

    /// Expires an open Checkout Session, so nobody can pay for a canceled batch.
    ///
    /// # Errors
    ///
    /// [`PaymentError::Provider`] if the session is no longer open (it may have been paid).
    pub async fn expire_checkout(&self, session_id: &str) -> Result<CheckoutSession, PaymentError> {
        match self {
            Self::Stripe {
                client,
                api_base,
                secret_key,
                ..
            } => {
                let response = client
                    .post(format!(
                        "{api_base}/v1/checkout/sessions/{session_id}/expire"
                    ))
                    .bearer_auth(secret_key)
                    .send()
                    .await;
                stripe_reply(response).await
            }
            Self::Disabled => Err(PaymentError::Disabled),
            Self::Fake { stripe, .. } => {
                let mut stripe = lock(stripe)?;
                let session = stripe
                    .sessions
                    .get_mut(session_id)
                    .filter(|session| session.status.as_deref() == Some("open"))
                    .ok_or_else(|| PaymentError::Provider("session is not open".to_owned()))?;
                session.status = Some("expired".to_owned());
                session.url = None;
                Ok(session.clone())
            }
        }
    }

    /// Refunds a whole payment (ADR 0032). The batch id is the idempotency key, so a retried
    /// request never refunds twice.
    ///
    /// # Errors
    ///
    /// See [`PaymentError`].
    pub async fn refund(
        &self,
        payment_intent: &str,
        batch_id: Uuid,
    ) -> Result<Refund, PaymentError> {
        match self {
            Self::Stripe {
                client,
                api_base,
                secret_key,
                ..
            } => {
                let batch = batch_id.to_string();
                let form = form_urlencoded::Serializer::new(String::new())
                    .append_pair("payment_intent", payment_intent)
                    .append_pair("reason", "requested_by_customer")
                    .append_pair("metadata[batch_id]", &batch)
                    .finish();
                let response = client
                    .post(format!("{api_base}/v1/refunds"))
                    .bearer_auth(secret_key)
                    .header("Idempotency-Key", format!("refund-{batch}"))
                    .header("Content-Type", "application/x-www-form-urlencoded")
                    .body(form)
                    .send()
                    .await;
                stripe_reply(response).await
            }
            Self::Disabled => Err(PaymentError::Disabled),
            Self::Fake { stripe, .. } => {
                let mut stripe = lock(stripe)?;
                stripe.refunds.push(payment_intent.to_owned());
                Ok(Refund {
                    id: format!("re_{}", Uuid::new_v4().simple()),
                    status: Some("succeeded".to_owned()),
                    amount: None,
                })
            }
        }
    }

    /// Verifies a webhook request and parses its event.
    ///
    /// # Errors
    ///
    /// See [`WebhookError`]; [`WebhookError::BadSignature`] when payments are disabled.
    pub fn verify_webhook(
        &self,
        signature_header: &str,
        payload: &[u8],
        now_unix: i64,
    ) -> Result<StripeEvent, WebhookError> {
        let secret = match self {
            Self::Stripe { webhook_secret, .. } | Self::Fake { webhook_secret, .. } => {
                webhook_secret
            }
            Self::Disabled => return Err(WebhookError::BadSignature),
        };
        verify_signature(secret, signature_header, payload, now_unix)?;
        serde_json::from_slice(payload).map_err(|_| WebhookError::InvalidPayload)
    }
}

fn lock(stripe: &Mutex<FakeStripe>) -> Result<std::sync::MutexGuard<'_, FakeStripe>, PaymentError> {
    stripe
        .lock()
        .map_err(|_| PaymentError::Provider("fake stripe poisoned".to_owned()))
}

async fn stripe_reply<T: serde::de::DeserializeOwned>(
    response: Result<reqwest::Response, reqwest::Error>,
) -> Result<T, PaymentError> {
    let response = response.map_err(|error| PaymentError::Provider(error.to_string()))?;
    let status = response.status();
    if status.is_success() {
        return response
            .json()
            .await
            .map_err(|error| PaymentError::Provider(format!("unexpected reply: {error}")));
    }
    // Stripe explains refusals in the body (`error.message`); it never echoes the key.
    let detail = response.text().await.unwrap_or_default();
    let detail: String = detail.chars().take(MAX_ERROR_CHARS).collect();
    Err(PaymentError::Provider(format!(
        "stripe answered {status}: {detail}"
    )))
}

/// `Stripe-Signature: t=<unix>,v1=<hex hmac>[,v1=...][,v0=...]`, where the HMAC-SHA256 key is the
/// whole `whsec_...` secret and the message is `"<t>.<payload>"`.
pub fn verify_signature(
    secret: &str,
    header: &str,
    payload: &[u8],
    now_unix: i64,
) -> Result<(), WebhookError> {
    let mut timestamp = None;
    let mut signatures = Vec::new();
    for part in header.split(',') {
        match part.trim().split_once('=') {
            Some(("t", value)) => timestamp = value.parse::<i64>().ok(),
            Some(("v1", value)) => {
                if let Ok(bytes) = hex::decode(value) {
                    signatures.push(bytes);
                }
            }
            _ => {}
        }
    }
    let timestamp = timestamp.ok_or(WebhookError::MalformedHeader)?;
    if signatures.is_empty() {
        return Err(WebhookError::MalformedHeader);
    }
    let matches = signatures.iter().any(|signature| {
        let Ok(mut mac) = Hmac::<Sha256>::new_from_slice(secret.as_bytes()) else {
            return false;
        };
        mac.update(timestamp.to_string().as_bytes());
        mac.update(b".");
        mac.update(payload);
        // Constant-time comparison.
        mac.verify_slice(signature).is_ok()
    });
    if !matches {
        return Err(WebhookError::BadSignature);
    }
    if (now_unix - timestamp).abs() > WEBHOOK_TOLERANCE_SECS {
        return Err(WebhookError::Expired);
    }
    Ok(())
}

/// Signs a payload like Stripe does (tests and local tooling).
pub fn sign_payload(secret: &str, payload: &[u8], timestamp: i64) -> String {
    let signature = Hmac::<Sha256>::new_from_slice(secret.as_bytes()).map(|mut mac| {
        mac.update(timestamp.to_string().as_bytes());
        mac.update(b".");
        mac.update(payload);
        hex::encode(mac.finalize().into_bytes())
    });
    format!("t={timestamp},v1={}", signature.unwrap_or_default())
}

#[cfg(test)]
mod tests {
    use super::*;

    const SECRET: &str = "whsec_test_secret";

    #[test]
    fn accepts_a_valid_signature_among_several() {
        let payload = br#"{"id":"evt_1"}"#;
        let header = sign_payload(SECRET, payload, 1_000);
        let with_old = format!("{header},v1=00ff,v0=abcd");
        assert_eq!(verify_signature(SECRET, &with_old, payload, 1_100), Ok(()));
        let rotated = format!("t=1000,v1=deadbeef,{}", &header[7..]);
        assert_eq!(verify_signature(SECRET, &rotated, payload, 1_000), Ok(()));
    }

    #[test]
    fn rejects_tampering_replays_and_garbage() {
        let payload = br#"{"id":"evt_1"}"#;
        let header = sign_payload(SECRET, payload, 1_000);
        assert_eq!(
            verify_signature(SECRET, &header, br#"{"id":"evt_2"}"#, 1_000),
            Err(WebhookError::BadSignature)
        );
        assert_eq!(
            verify_signature("whsec_other", &header, payload, 1_000),
            Err(WebhookError::BadSignature)
        );
        assert_eq!(
            verify_signature(SECRET, &header, payload, 1_000 + WEBHOOK_TOLERANCE_SECS + 1),
            Err(WebhookError::Expired)
        );
        for bad in ["", "t=1000", "v1=abcd", "t=x,v1=abcd", "garbage"] {
            assert_eq!(
                verify_signature(SECRET, bad, payload, 1_000),
                Err(WebhookError::MalformedHeader),
                "{bad}"
            );
        }
    }

    #[test]
    fn parses_a_checkout_session_as_stripe_sends_it() {
        let session: CheckoutSession = serde_json::from_str(
            r#"{"id":"cs_test_1","object":"checkout.session","url":null,"status":"complete",
                "payment_status":"paid","amount_total":4000,"currency":"brl",
                "payment_intent":"pi_1","expires_at":1760000000,"metadata":{"batch_id":"x"}}"#,
        )
        .unwrap();
        assert!(session.is_paid());
        assert_eq!(session.amount_total, Some(4_000));
    }
}
