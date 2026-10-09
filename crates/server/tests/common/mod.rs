//! Test harness: the real router over a per-test database (`sqlx::test`), memory mailer.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    dead_code,
    reason = "test helpers fail loudly by design; not every test uses every helper"
)]

pub mod door;

use std::sync::{Arc, Mutex};

use axum::Router;
use axum::body::Body;
use axum::http::{Method, Request, StatusCode, header};
use http_body_util::BodyExt as _;
use ingressoimpresso_server::config::Config;
use ingressoimpresso_server::mail::{Mailer, SentMail};
use ingressoimpresso_server::payments::{FakeStripe, Payments};
use ingressoimpresso_server::state::AppState;
use serde_json::Value;
use sqlx::PgPool;
use tower::ServiceExt as _;

pub const ADMIN: &str = "admin@exemplo.com";
/// Webhook secret of the fake Stripe.
pub const WEBHOOK_SECRET: &str = "whsec_test_fake";

pub struct TestApp {
    pub router: Router,
    pub state: AppState,
    pub sent: Arc<Mutex<Vec<SentMail>>>,
    _export_dir: TempDir,
}

/// A temporary directory removed on drop.
pub struct TempDir(pub std::path::PathBuf);

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

pub struct Reply {
    pub status: StatusCode,
    pub headers: axum::http::HeaderMap,
    pub bytes: Vec<u8>,
}

impl Reply {
    pub fn json(&self) -> Value {
        serde_json::from_slice(&self.bytes)
            .unwrap_or_else(|_| panic!("not JSON: {}", String::from_utf8_lossy(&self.bytes)))
    }

    pub fn error_code(&self) -> String {
        self.json()["error"]["code"].as_str().unwrap().to_owned()
    }
}

impl TestApp {
    pub fn new(pool: PgPool) -> Self {
        Self::build(pool, Payments::Disabled, 0)
    }

    /// An app that gives every organization `free` tickets (ADR 0024).
    pub fn with_free_tickets(pool: PgPool, free: i32) -> Self {
        Self::build(pool, Payments::Disabled, free)
    }

    /// An app with extra settings (environment variable name, value).
    pub fn with_settings(pool: PgPool, settings: &[(&str, &str)]) -> Self {
        Self::build_with(pool, Payments::Disabled, 0, settings)
    }

    /// An app whose online payments go to an in-memory Stripe.
    pub fn with_stripe(pool: PgPool) -> (Self, Arc<Mutex<FakeStripe>>) {
        let stripe = Arc::new(Mutex::new(FakeStripe::default()));
        let app = Self::build(
            pool,
            Payments::Fake {
                stripe: stripe.clone(),
                webhook_secret: WEBHOOK_SECRET.to_owned(),
            },
            0,
        );
        (app, stripe)
    }

    fn build(pool: PgPool, payments: Payments, free_tickets: i32) -> Self {
        Self::build_with(pool, payments, free_tickets, &[])
    }

    fn build_with(
        pool: PgPool,
        payments: Payments,
        free_tickets: i32,
        settings: &[(&str, &str)],
    ) -> Self {
        let free_tickets = free_tickets.to_string();
        let settings: Vec<(String, String)> = settings
            .iter()
            .map(|(name, value)| ((*name).to_owned(), (*value).to_owned()))
            .collect();
        let export_dir = std::env::temp_dir().join(format!("ii-exports-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&export_dir).unwrap();
        let dir = export_dir.display().to_string();
        let config = Config::from_lookup(|name| {
            if let Some((_, value)) = settings.iter().find(|(key, _)| key == name) {
                return Some(value.clone());
            }
            match name {
                "DATABASE_URL" => Some("postgres://unused".to_owned()),
                "TICKET_KEY_ENCRYPTION_KEY" => {
                    Some("MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=".to_owned())
                }
                "ADMIN_EMAILS" => Some(ADMIN.to_owned()),
                "PUBLIC_API_URL" => Some("http://api.test".to_owned()),
                "ALLOWED_ORIGINS" => Some("http://localhost:3000".to_owned()),
                "EXPORT_DIR" => Some(dir.clone()),
                "FREE_TICKETS" => Some(free_tickets.clone()),
                _ => None,
            }
        })
        .unwrap();
        let sent = Arc::new(Mutex::new(Vec::new()));
        let state =
            AppState::new(pool, config, Mailer::Memory(sent.clone())).with_payments(payments);
        Self {
            router: ingressoimpresso_server::app::router(state.clone()),
            state,
            sent,
            _export_dir: TempDir(export_dir),
        }
    }

    pub async fn request(
        &self,
        method: Method,
        uri: &str,
        token: Option<&str>,
        body: Option<Value>,
    ) -> Reply {
        let mut builder = Request::builder().method(method).uri(uri);
        if let Some(token) = token {
            builder = builder.header(header::AUTHORIZATION, format!("Bearer {token}"));
        }
        let request = match body {
            Some(body) => builder
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(serde_json::to_vec(&body).unwrap()))
                .unwrap(),
            None => builder.body(Body::empty()).unwrap(),
        };
        self.send(request).await
    }

    pub async fn send(&self, request: Request<Body>) -> Reply {
        let response = self.router.clone().oneshot(request).await.unwrap();
        let status = response.status();
        let headers = response.headers().clone();
        let bytes = response
            .into_body()
            .collect()
            .await
            .unwrap()
            .to_bytes()
            .to_vec();
        Reply {
            status,
            headers,
            bytes,
        }
    }

    pub async fn get(&self, uri: &str, token: &str) -> Reply {
        self.request(Method::GET, uri, Some(token), None).await
    }

    pub async fn post(&self, uri: &str, token: &str, body: Value) -> Reply {
        self.request(Method::POST, uri, Some(token), Some(body))
            .await
    }

    pub async fn put(&self, uri: &str, token: &str, body: Value) -> Reply {
        self.request(Method::PUT, uri, Some(token), Some(body))
            .await
    }

    /// Sets the app's Google sign-in to the test signer's keys (ADR 0029).
    #[cfg(feature = "test-util")]
    pub fn with_google(mut self, client_id: &str) -> Self {
        let signer = ingressoimpresso_server::google::testing::TestSigner::new();
        self.state =
            self.state
                .clone()
                .with_google(ingressoimpresso_server::google::GoogleAuth::with_keys(
                    client_id.to_owned(),
                    signer.keys(),
                ));
        self.router = ingressoimpresso_server::app::router(self.state.clone());
        self
    }

    pub async fn delete(&self, uri: &str, token: &str, body: Option<Value>) -> Reply {
        self.request(Method::DELETE, uri, Some(token), body).await
    }

    /// Creates a batch and returns it.
    pub async fn create_batch(&self, token: &str, event: &str, quantity: i32) -> Value {
        let reply = self
            .post(
                &format!("/api/events/{event}/batches"),
                token,
                serde_json::json!({ "quantity": quantity }),
            )
            .await;
        assert_eq!(
            reply.status,
            StatusCode::CREATED,
            "{}",
            String::from_utf8_lossy(&reply.bytes)
        );
        reply.json()
    }

    /// The last login code e-mailed to `email`.
    pub fn last_code(&self, email: &str) -> String {
        let sent = self.sent.lock().unwrap();
        let mail = sent
            .iter()
            .rev()
            .find(|mail| mail.to.eq_ignore_ascii_case(email.trim()))
            .expect("an e-mail was sent");
        mail.subject.chars().filter(char::is_ascii_digit).collect()
    }

    /// Signs in and returns the bearer token.
    pub async fn login(&self, email: &str) -> String {
        let reply = self
            .request(
                Method::POST,
                "/api/auth/code",
                None,
                Some(serde_json::json!({ "email": email })),
            )
            .await;
        assert_eq!(reply.status, StatusCode::NO_CONTENT);
        let code = self.last_code(email);
        let reply = self
            .request(
                Method::POST,
                "/api/auth/verify",
                None,
                Some(serde_json::json!({ "email": email, "code": code })),
            )
            .await;
        assert_eq!(
            reply.status,
            StatusCode::OK,
            "{}",
            String::from_utf8_lossy(&reply.bytes)
        );
        reply.json()["token"].as_str().unwrap().to_owned()
    }

    /// Creates an event and returns its id.
    pub async fn create_event(&self, token: &str, name: &str) -> String {
        let reply = self
            .post(
                "/api/events",
                token,
                serde_json::json!({
                    "name": name,
                    "venue": "Bar do Zé",
                    "startsAt": "2026-11-20T22:00:00-03:00",
                    "endsAt": "2026-11-21T03:00:00-03:00",
                    "ticketPriceCents": 3000
                }),
            )
            .await;
        assert_eq!(
            reply.status,
            StatusCode::CREATED,
            "{}",
            String::from_utf8_lossy(&reply.bytes)
        );
        reply.json()["id"].as_str().unwrap().to_owned()
    }
}
