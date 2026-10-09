//! Signing in (ADRs 0028, 0029) and the holder's data rights (ADR 0033): Google sign-in, the
//! e-mail quota and per-IP limit, HTML e-mails, exporting and deleting an account.

#![cfg(feature = "test-util")]
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
use common::TestApp;
use ingressoimpresso_server::google::testing::TestSigner;
use serde_json::{Value, json};
use sqlx::PgPool;

const CLIENT: &str = "123-test.apps.googleusercontent.com";

fn google_claims(email: &str, sub: &str) -> Value {
    let now = time::OffsetDateTime::now_utc().unix_timestamp();
    json!({
        "iss": "https://accounts.google.com",
        "aud": CLIENT,
        "sub": sub,
        "email": email,
        "email_verified": true,
        "name": "Banda Exemplo",
        "iat": now - 5,
        "exp": now + 3600,
    })
}

async fn google_login(app: &TestApp, claims: &Value) -> common::Reply {
    let credential = TestSigner::new().token(claims);
    app.request(
        Method::POST,
        "/api/auth/google",
        None,
        Some(json!({ "credential": credential })),
    )
    .await
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn google_is_offered_only_when_configured(pool: PgPool) {
    let app = TestApp::new(pool.clone());
    let options = app
        .request(Method::GET, "/api/auth/options", None, None)
        .await
        .json();
    assert_eq!(options["googleClientId"], Value::Null);
    let off = google_login(&app, &google_claims("banda@exemplo.com", "1")).await;
    assert_eq!(off.status, StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(off.error_code(), "google_unavailable");

    let app = TestApp::new(pool).with_google(CLIENT);
    let options = app
        .request(Method::GET, "/api/auth/options", None, None)
        .await
        .json();
    assert_eq!(options["googleClientId"], CLIENT);
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn google_creates_and_links_accounts(pool: PgPool) {
    let app = TestApp::new(pool).with_google(CLIENT);

    // New e-mail: a new account, named after the Google profile.
    let reply = google_login(&app, &google_claims("Nova@Exemplo.com", "g-1")).await;
    assert_eq!(reply.status, StatusCode::OK, "{:?}", reply.json());
    let session = reply.json();
    assert_eq!(session["user"]["email"], "nova@exemplo.com");
    assert_eq!(session["user"]["google"], true);
    assert_eq!(session["user"]["name"], "Banda Exemplo");
    let token = session["token"].as_str().unwrap();
    let account = app.get("/api/account", token).await.json();
    assert_eq!(account["organizationName"], "Banda Exemplo");
    assert!(account["termsAcceptedAt"].is_string());

    // An account made with e-mail codes is linked on the first Google sign-in.
    let code_token = app.login("antiga@exemplo.com").await;
    let event = app.create_event(&code_token, "Show").await;
    let linked = google_login(&app, &google_claims("antiga@exemplo.com", "g-2")).await;
    assert_eq!(linked.status, StatusCode::OK);
    let linked_token = linked.json()["token"].as_str().unwrap().to_owned();
    let events = app.get("/api/events", &linked_token).await.json();
    assert_eq!(events[0]["id"], event.as_str());

    // Another Google account cannot take an e-mail already linked.
    let other = google_login(&app, &google_claims("antiga@exemplo.com", "g-3")).await;
    assert_eq!(other.status, StatusCode::CONFLICT);
    assert_eq!(other.error_code(), "google_account_mismatch");

    // Tokens for another app, unverified e-mails and forgeries are refused.
    let mut wrong_app = google_claims("x@exemplo.com", "g-4");
    wrong_app["aud"] = json!("other.apps.googleusercontent.com");
    assert_eq!(
        google_login(&app, &wrong_app).await.error_code(),
        "invalid_google_token"
    );
    let mut unverified = google_claims("x@exemplo.com", "g-4");
    unverified["email_verified"] = json!(false);
    assert_eq!(
        google_login(&app, &unverified).await.error_code(),
        "google_email_unverified"
    );
    let forged = app
        .request(
            Method::POST,
            "/api/auth/google",
            None,
            Some(
                json!({ "credential": "eyJhbGciOiJSUzI1NiIsImtpZCI6InRlc3Qta2V5LTEifQ.e30.AAAA" }),
            ),
        )
        .await;
    assert_eq!(forged.status, StatusCode::BAD_REQUEST);
}

async fn request_code(app: &TestApp, email: &str, ip: &str) -> StatusCode {
    let request = Request::builder()
        .method(Method::POST)
        .uri("/api/auth/code")
        .header(header::CONTENT_TYPE, "application/json")
        .header("x-forwarded-for", ip)
        .body(Body::from(json!({ "email": email }).to_string()))
        .unwrap();
    app.send(request).await.status
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn one_address_asks_for_few_codes(pool: PgPool) {
    let app = TestApp::new(pool);
    for index in 0..10 {
        assert_eq!(
            request_code(&app, &format!("p{index}@exemplo.com"), "203.0.113.7").await,
            StatusCode::NO_CONTENT
        );
    }
    assert_eq!(
        request_code(&app, "p10@exemplo.com", "203.0.113.7, 10.0.0.1").await,
        StatusCode::TOO_MANY_REQUESTS
    );
    // Another address is not affected.
    assert_eq!(
        request_code(&app, "p10@exemplo.com", "198.51.100.9").await,
        StatusCode::NO_CONTENT
    );
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn the_daily_quota_stops_codes_but_not_google(pool: PgPool) {
    let app = TestApp::with_settings(pool, &[("MAIL_DAILY_LIMIT", "3")]).with_google(CLIENT);
    for index in 0..3 {
        app.login(&format!("p{index}@exemplo.com")).await;
    }
    let reply = app
        .request(
            Method::POST,
            "/api/auth/code",
            None,
            Some(json!({ "email": "p3@exemplo.com" })),
        )
        .await;
    assert_eq!(reply.status, StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(reply.error_code(), "mail_quota");
    assert_eq!(app.sent.lock().unwrap().len(), 3);
    let google = google_login(&app, &google_claims("p3@exemplo.com", "g-9")).await;
    assert_eq!(google.status, StatusCode::OK);
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn login_e_mails_carry_html_and_text(pool: PgPool) {
    let app = TestApp::new(pool);
    app.login("banda@exemplo.com").await;
    let sent = app.sent.lock().unwrap();
    let mail = sent.last().unwrap();
    let code: String = mail.subject.chars().filter(char::is_ascii_digit).collect();
    assert_eq!(code.len(), 6);
    assert!(mail.body.contains(&code));
    assert!(mail.html.contains(&format!(">{code}</div>")));
    assert!(mail.html.starts_with("<!doctype html>"));
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn holders_export_their_data(pool: PgPool) {
    let app = TestApp::with_free_tickets(pool, 30);
    let token = app.login("banda@exemplo.com").await;
    let event = app.create_event(&token, "Show de Lançamento").await;
    app.create_batch(&token, &event, 10).await;
    let seller = app
        .post(
            &format!("/api/events/{event}/sellers"),
            &token,
            json!({ "name": "João", "phone": "11 98888-7777" }),
        )
        .await;
    assert_eq!(seller.status, StatusCode::CREATED);
    let reply = app.get("/api/account/export", &token).await;
    assert_eq!(reply.status, StatusCode::OK);
    assert!(
        reply.headers[header::CONTENT_DISPOSITION]
            .to_str()
            .unwrap()
            .contains("attachment")
    );
    let export = reply.json();
    assert_eq!(export["user"]["email"], "banda@exemplo.com");
    assert_eq!(export["events"][0]["name"], "Show de Lançamento");
    assert_eq!(export["events"][0]["batches"][0]["paidVia"], "free");
    assert_eq!(export["events"][0]["sellers"][0]["phone"], "11 98888-7777");
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn deleting_keeps_only_fiscal_records(pool: PgPool) {
    let app = TestApp::with_free_tickets(pool.clone(), 30);

    // An account that never got tickets disappears.
    let empty = app.login("vazia@exemplo.com").await;
    app.create_event(&empty, "Teste").await;
    let wrong = app
        .delete(
            "/api/account",
            &empty,
            Some(json!({ "email": "outra@exemplo.com" })),
        )
        .await;
    assert_eq!(wrong.error_code(), "confirmation_mismatch");
    let deleted = app
        .delete(
            "/api/account",
            &empty,
            Some(json!({ "email": "Vazia@Exemplo.com" })),
        )
        .await;
    assert_eq!(deleted.status, StatusCode::NO_CONTENT);
    assert_eq!(
        app.get("/api/me", &empty).await.status,
        StatusCode::UNAUTHORIZED
    );
    let events: i64 = sqlx::query_scalar("select count(*) from events where name = 'Teste'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(events, 0);

    // One with paid batches keeps them, anonymized.
    let token = app.login("banda@exemplo.com").await;
    let event = app.create_event(&token, "Show da Banda").await;
    app.create_batch(&token, &event, 10).await;
    app.post(
        &format!("/api/events/{event}/sellers"),
        &token,
        json!({ "name": "João" }),
    )
    .await;
    let deleted = app
        .delete(
            "/api/account",
            &token,
            Some(json!({ "email": "banda@exemplo.com" })),
        )
        .await;
    assert_eq!(deleted.status, StatusCode::NO_CONTENT);
    let kept: (String, i64, i64) = sqlx::query_as(
        r"select e.name,
                 (select count(*) from ticket_batches b where b.event_id = e.id),
                 (select count(*) from sellers s where s.event_id = e.id)
          from events e where e.id = $1::uuid",
    )
    .bind(&event)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(kept, ("Evento excluído".to_owned(), 1, 0));
    let email_left: i64 =
        sqlx::query_scalar("select count(*) from users where email = 'banda@exemplo.com'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(email_left, 0);

    // The same e-mail can start over with a fresh account.
    let again = app.login("banda@exemplo.com").await;
    let events = app.get("/api/events", &again).await.json();
    assert_eq!(events.as_array().unwrap().len(), 0);
}
