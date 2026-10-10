//! Platform controls (ADRs 0037, 0038, 0041, 0043): maintenance, sign-ups, blocked domains,
//! announcements and notifications, the mail log, the status page and the audit filters.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing,
    reason = "test helpers fail loudly by design"
)]

mod common;

use axum::body::Body;
use axum::http::{Method, Request, StatusCode, header};
use base64::Engine as _;
use common::{ADMIN, TestApp};
use hmac::{Hmac, KeyInit as _, Mac as _};
use serde_json::json;
use sha2::Sha256;
use sqlx::PgPool;

async fn code_request(app: &TestApp, email: &str) -> common::Reply {
    app.request(
        Method::POST,
        "/api/auth/code",
        None,
        Some(json!({ "email": email })),
    )
    .await
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn maintenance_pauses_organizers_but_not_admins(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let admin = app.login(ADMIN).await;
    let token = app.login("banda@exemplo.com").await;
    let event = app.create_event(&token, "Show").await;

    // Read-only: reading works, writing waits, admins keep working.
    let saved = app
        .settings(
            &admin,
            json!({ "maintenanceMode": "read_only", "maintenanceMessage": "Atualizando o banco." }),
        )
        .await;
    assert_eq!(
        saved.status,
        StatusCode::OK,
        "{}",
        String::from_utf8_lossy(&saved.bytes)
    );
    assert!(saved.json()["maintenance"]["startedAt"].is_string());
    let public = app
        .request(Method::GET, "/api/platform", None, None)
        .await
        .json();
    assert_eq!(public["maintenance"]["mode"], "read_only");
    assert_eq!(public["maintenance"]["message"], "Atualizando o banco.");
    assert_eq!(app.get("/api/events", &token).await.status, StatusCode::OK);
    let write = app
        .post(
            &format!("/api/events/{event}/batches"),
            &token,
            json!({ "quantity": 5 }),
        )
        .await;
    assert_eq!(write.status, StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(write.error_code(), "maintenance");
    app.create_batch(&admin, &event, 5).await;
    // Nobody new gets in during maintenance; people with an account still sign in.
    assert_eq!(
        code_request(&app, "nova@exemplo.com").await.error_code(),
        "maintenance"
    );
    assert_eq!(
        code_request(&app, "banda@exemplo.com").await.status,
        StatusCode::NO_CONTENT
    );

    // Full: organizers are out entirely (they can still sign out), admins are not.
    app.settings(&admin, json!({ "maintenanceMode": "full" }))
        .await;
    assert_eq!(
        app.get("/api/events", &token).await.error_code(),
        "maintenance"
    );
    assert_eq!(
        code_request(&app, "banda@exemplo.com").await.error_code(),
        "maintenance"
    );
    assert_eq!(
        code_request(&app, ADMIN).await.status,
        StatusCode::NO_CONTENT
    );
    assert_eq!(app.get("/api/events", &admin).await.status, StatusCode::OK);
    let logout = app
        .request(Method::POST, "/api/auth/logout", Some(&token), None)
        .await;
    assert_eq!(logout.status, StatusCode::NO_CONTENT);

    // Off again.
    let off = app
        .settings(&admin, json!({ "maintenanceMode": "off" }))
        .await
        .json();
    assert_eq!(off["maintenance"]["startedAt"], json!(null));
    // Only admins change the settings.
    let other = app.login("outra@exemplo.com").await;
    assert_eq!(
        app.settings(&other, json!({})).await.status,
        StatusCode::FORBIDDEN
    );
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn sign_ups_can_close_and_domains_be_blocked(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let admin = app.login(ADMIN).await;
    app.login("banda@exemplo.com").await;

    app.settings(&admin, json!({ "registrationsOpen": false }))
        .await;
    let closed = code_request(&app, "nova@exemplo.com").await;
    assert_eq!(closed.status, StatusCode::FORBIDDEN);
    assert_eq!(closed.error_code(), "registrations_closed");
    assert!(
        app.sent
            .lock()
            .unwrap()
            .iter()
            .all(|mail| mail.to != "nova@exemplo.com")
    );
    assert_eq!(
        code_request(&app, "banda@exemplo.com").await.status,
        StatusCode::NO_CONTENT
    );
    let public = app
        .request(Method::GET, "/api/platform", None, None)
        .await
        .json();
    assert_eq!(public["registrationsOpen"], false);

    let saved = app
        .settings(
            &admin,
            json!({ "blockedEmailDomains": ["@Mailinator.com", "tempmail.io", "mailinator.com", " "] }),
        )
        .await
        .json();
    assert_eq!(
        saved["blockedEmailDomains"],
        json!(["mailinator.com", "tempmail.io"])
    );
    assert_eq!(saved["registrationsOpen"], true);
    let blocked = code_request(&app, "x@sub.mailinator.com").await;
    assert_eq!(blocked.error_code(), "email_domain_blocked");
    assert_eq!(
        code_request(&app, "x@notmailinator.com").await.status,
        StatusCode::NO_CONTENT
    );
    let invalid = app
        .settings(&admin, json!({ "blockedEmailDomains": ["not a domain"] }))
        .await;
    assert_eq!(invalid.error_code(), "invalid_domain");

    // Two saves; the refused one wrote nothing.
    let audit = app
        .get("/api/admin/audit?category=settings", &admin)
        .await
        .json();
    assert_eq!(audit["total"], 2);
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn announcements_reach_the_bell_and_the_dialog(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let admin = app.login(ADMIN).await;
    let token = app.login("banda@exemplo.com").await;

    let draft = app
        .post(
            "/api/admin/announcements",
            &admin,
            json!({
                "title": "Manutenção no sábado",
                "body": "O painel fica fora do ar das 2h às 3h.",
                "level": "warning",
                "display": "modal",
                "ctaLabel": "Ver status",
                "ctaUrl": "/status",
                "publish": false,
            }),
        )
        .await;
    assert_eq!(
        draft.status,
        StatusCode::CREATED,
        "{}",
        String::from_utf8_lossy(&draft.bytes)
    );
    let draft = draft.json();
    assert_eq!(draft["status"], "draft");
    let inbox = app.get("/api/inbox", &token).await.json();
    assert_eq!(inbox["announcements"], json!([]));

    let id = draft["id"].as_str().unwrap();
    let mut body = json!({
        "title": "Manutenção no sábado",
        "body": "O painel fica fora do ar das 2h às 3h.",
        "level": "warning",
        "display": "modal",
        "ctaLabel": "Ver status",
        "ctaUrl": "/status",
        "publish": true,
    });
    let published = app
        .put(
            &format!("/api/admin/announcements/{id}"),
            &admin,
            body.clone(),
        )
        .await
        .json();
    assert_eq!(published["status"], "active");
    let inbox = app.get("/api/inbox", &token).await.json();
    assert_eq!(inbox["unread"], 1);
    assert_eq!(inbox["announcements"][0]["display"], "modal");
    assert_eq!(inbox["announcements"][0]["seen"], false);

    // Seen in the bell, closed in the dialog.
    let read = app
        .post(
            "/api/inbox/read",
            &token,
            json!({ "announcements": [], "notifications": [] }),
        )
        .await;
    assert_eq!(read.status, StatusCode::NO_CONTENT);
    let dismissed = app
        .request(
            Method::POST,
            &format!("/api/announcements/{id}/dismiss"),
            Some(&token),
            None,
        )
        .await;
    assert_eq!(dismissed.status, StatusCode::NO_CONTENT);
    let inbox = app.get("/api/inbox", &token).await.json();
    assert_eq!(
        (
            inbox["unread"].clone(),
            inbox["announcements"][0]["dismissed"].clone()
        ),
        (json!(0), json!(true))
    );
    let list = app.get("/api/admin/announcements", &admin).await.json();
    assert_eq!(list[0]["stats"]["seen"], 1);
    assert_eq!(list[0]["stats"]["dismissed"], 1);

    // A button must point to the site or https.
    body["ctaUrl"] = json!("javascript:alert(1)");
    let bad = app.post("/api/admin/announcements", &admin, body).await;
    assert_eq!(bad.error_code(), "invalid_cta");

    // Deleting a published one takes it down.
    app.delete(&format!("/api/admin/announcements/{id}"), &admin, None)
        .await;
    let inbox = app.get("/api/inbox", &token).await.json();
    assert_eq!(inbox["announcements"], json!([]));
    let list = app.get("/api/admin/announcements", &admin).await.json();
    assert_eq!(list[0]["status"], "archived");
}

fn svix_headers(secret_key: &[u8], body: &[u8]) -> Vec<(&'static str, String)> {
    let id = "msg_test";
    let timestamp = time::OffsetDateTime::now_utc().unix_timestamp().to_string();
    let mut mac = Hmac::<Sha256>::new_from_slice(secret_key).unwrap();
    mac.update(format!("{id}.{timestamp}.").as_bytes());
    mac.update(body);
    let signature = base64::engine::general_purpose::STANDARD.encode(mac.finalize().into_bytes());
    vec![
        ("svix-id", id.to_owned()),
        ("svix-timestamp", timestamp),
        ("svix-signature", format!("v1,{signature}")),
    ]
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn the_mail_log_follows_each_message(pool: PgPool) {
    let key = b"0123456789abcdef0123456789abcdef";
    let secret = format!(
        "whsec_{}",
        base64::engine::general_purpose::STANDARD.encode(key)
    );
    let app = TestApp::with_settings(
        pool,
        &[
            ("RESEND_WEBHOOK_SECRET", secret.as_str()),
            ("MAIL_DAILY_LIMIT", "3"),
        ],
    )
    .await;
    let admin = app.login(ADMIN).await;
    app.login("banda@exemplo.com").await;
    let page = app.get("/api/admin/emails", &admin).await.json();
    assert_eq!(page["total"], 2);
    let first = &page["items"][0];
    assert_eq!(first["status"], "sent");
    assert_eq!(first["to"], "banda@exemplo.com");
    assert_eq!(first["kind"], "signup_code");
    // The code itself is never logged.
    assert_eq!(first["subject"], "Seu código de acesso: ••••••");
    let provider_id = first["providerId"].as_str().unwrap().to_owned();

    // Resend reports the delivery, then a stale "delayed" arrives: the status never goes back.
    for (kind, expected) in [
        ("email.delivered", "delivered"),
        ("email.delivery_delayed", "delivered"),
    ] {
        let body =
            serde_json::to_vec(&json!({ "type": kind, "data": { "email_id": provider_id } }))
                .unwrap();
        let mut request = Request::builder()
            .method(Method::POST)
            .uri("/api/resend/webhook");
        for (name, value) in svix_headers(key, &body) {
            request = request.header(name, value);
        }
        let reply = app
            .send(
                request
                    .header(header::CONTENT_TYPE, "application/json")
                    .body(Body::from(body))
                    .unwrap(),
            )
            .await;
        assert_eq!(reply.status, StatusCode::NO_CONTENT);
        let page = app.get("/api/admin/emails?q=banda", &admin).await.json();
        assert_eq!(page["items"][0]["status"], expected);
    }
    // A forged call is refused.
    let forged = app
        .send(
            Request::builder()
                .method(Method::POST)
                .uri("/api/resend/webhook")
                .header("svix-id", "x")
                .header("svix-timestamp", "1")
                .header("svix-signature", "v1,AAAA")
                .body(Body::from("{}"))
                .unwrap(),
        )
        .await;
    assert_eq!(forged.status, StatusCode::BAD_REQUEST);

    // The quota refusal is logged, not counted.
    let test = app
        .request(Method::POST, "/api/admin/emails/test", Some(&admin), None)
        .await;
    assert_eq!(test.status, StatusCode::NO_CONTENT);
    let refused = app
        .request(Method::POST, "/api/admin/emails/test", Some(&admin), None)
        .await;
    assert_eq!(refused.error_code(), "mail_quota");
    let summary = app.get("/api/admin/emails/summary", &admin).await.json();
    assert_eq!(summary["usedToday"], 3);
    assert_eq!(summary["dailyLimit"], 3);
    assert_eq!(summary["webhook"], true);
    assert_eq!(summary["days"].as_array().unwrap().len(), 14);
    let quota = app
        .get("/api/admin/emails?status=quota", &admin)
        .await
        .json();
    assert_eq!(quota["total"], 1);
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn the_status_page_shows_checks_and_incidents(pool: PgPool) {
    let app = TestApp::new(pool).await;
    app.state.worker_tick();
    let admin = app.login(ADMIN).await;
    let status = app
        .request(Method::GET, "/api/status", None, None)
        .await
        .json();
    assert_eq!(status["status"], "operational");
    assert_eq!(status["version"], ingressoimpresso_server::VERSION);
    let keys: Vec<&str> = status["components"]
        .as_array()
        .unwrap()
        .iter()
        .map(|component| component["key"].as_str().unwrap())
        .collect();
    assert_eq!(keys, ["site", "panel", "door", "files", "email"]);

    let incident = app
        .post(
            "/api/admin/incidents",
            &admin,
            json!({
                "kind": "incident",
                "title": "Geração de arquivos lenta",
                "impact": "major",
                "components": ["files"],
                "message": "Estamos investigando.",
            }),
        )
        .await;
    assert_eq!(
        incident.status,
        StatusCode::CREATED,
        "{}",
        String::from_utf8_lossy(&incident.bytes)
    );
    let incident = incident.json();
    assert_eq!(incident["status"], "investigating");
    let status = app
        .request(Method::GET, "/api/status", None, None)
        .await
        .json();
    assert_eq!(status["status"], "degraded");
    assert_eq!(
        status["active"][0]["updates"][0]["body"],
        "Estamos investigando."
    );

    let id = incident["id"].as_str().unwrap();
    let resolved = app
        .post(
            &format!("/api/admin/incidents/{id}/updates"),
            &admin,
            json!({ "status": "resolved", "body": "Normalizado." }),
        )
        .await
        .json();
    assert!(resolved["resolvedAt"].is_string());
    assert_eq!(resolved["updates"].as_array().unwrap().len(), 2);
    let status = app
        .request(Method::GET, "/api/status", None, None)
        .await
        .json();
    assert_eq!(status["status"], "operational");
    assert_eq!(status["recent"][0]["title"], "Geração de arquivos lenta");

    let bad = app
        .post(
            "/api/admin/incidents",
            &admin,
            json!({ "kind": "maintenance", "title": "Janela", "impact": "none", "components": ["nope"], "message": "x" }),
        )
        .await;
    assert_eq!(bad.error_code(), "invalid_components");
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn the_audit_log_filters_by_period_and_category(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let admin = app.login(ADMIN).await;
    app.settings(&admin, json!({ "registrationsOpen": true }))
        .await;
    app.post(
        "/api/admin/announcements",
        &admin,
        json!({ "title": "Olá a todos", "body": "Texto.", "level": "info", "display": "notification", "publish": true }),
    )
    .await;
    let all = app.get("/api/admin/audit?perPage=1", &admin).await.json();
    assert_eq!(all["total"], 2);
    assert_eq!(all["items"].as_array().unwrap().len(), 1);
    let only = app
        .get("/api/admin/audit?category=announcement", &admin)
        .await
        .json();
    assert_eq!(only["items"][0]["action"], "announcement_create");
    let exact = app
        .get("/api/admin/audit?action=settings_update", &admin)
        .await
        .json();
    assert_eq!(exact["total"], 1);
    let future = app
        .get("/api/admin/audit?from=2999-01-01T00:00:00Z", &admin)
        .await
        .json();
    assert_eq!(future["total"], 0);
    assert_eq!(
        app.get("/api/admin/audit?category=nope", &admin)
            .await
            .error_code(),
        "invalid_input"
    );
    let csv = app
        .get("/api/admin/audit/export?category=settings", &admin)
        .await;
    assert_eq!(csv.status, StatusCode::OK);
    let text = String::from_utf8(csv.bytes).unwrap();
    assert!(text.contains("settings_update"));
    assert!(!text.contains("announcement_create"));
}
