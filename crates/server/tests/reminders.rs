//! E-mails that bring people back (ADR 0118): who gets which, once, only in working hours, and
//! the way out.

#![cfg(feature = "test-util")]
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing,
    reason = "test helpers fail loudly by design"
)]

mod common;

use common::TestApp;
use ingressoimpresso_server::reminders;
use serde_json::json;
use sqlx::PgPool;
use time::macros::datetime;

/// 14:00 in Brasília.
const WORKING_HOURS: time::OffsetDateTime = datetime!(2026-10-22 17:00 UTC);

fn sent_to(app: &TestApp, email: &str) -> Vec<String> {
    app.sent
        .lock()
        .unwrap()
        .iter()
        .filter(|mail| mail.to == email)
        .map(|mail| mail.subject.clone())
        .collect()
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn an_account_without_an_event_hears_twice_then_never(pool: PgPool) {
    let app = TestApp::new(pool.clone()).await;
    app.login("nova@exemplo.com").await;
    let before = sent_to(&app, "nova@exemplo.com").len();

    // A new account is left alone for two days, and nothing goes out at night.
    assert_eq!(
        reminders::run_at(&app.state, WORKING_HOURS).await.unwrap(),
        0
    );
    sqlx::query(
        "update users set created_at = now() - interval '3 days' where email = 'nova@exemplo.com'",
    )
    .execute(&pool)
    .await
    .unwrap();
    assert_eq!(
        reminders::run_at(&app.state, datetime!(2026-10-22 05:00 UTC))
            .await
            .unwrap(),
        0
    );
    assert_eq!(
        reminders::run_at(&app.state, WORKING_HOURS).await.unwrap(),
        1
    );
    let subjects = sent_to(&app, "nova@exemplo.com");
    assert_eq!(subjects.len(), before + 1);
    assert_eq!(
        subjects.last().unwrap(),
        "Seu primeiro evento sai em poucos minutos"
    );
    // Once: the next hour sends nothing.
    assert_eq!(
        reminders::run_at(&app.state, WORKING_HOURS).await.unwrap(),
        0
    );

    // A week later, the second; then no more.
    sqlx::query("update reminder_sends set created_at = now() - interval '8 days'")
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(
        reminders::run_at(&app.state, WORKING_HOURS).await.unwrap(),
        1
    );
    assert_eq!(
        sent_to(&app, "nova@exemplo.com").last().unwrap(),
        "Ingressos numerados, sem planilha e sem papel solto"
    );
    sqlx::query("update reminder_sends set created_at = now() - interval '30 days'")
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(
        reminders::run_at(&app.state, WORKING_HOURS).await.unwrap(),
        0
    );
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn a_stalled_event_gets_a_nudge_and_the_link_stops_them(pool: PgPool) {
    let app = TestApp::new(pool.clone()).await;
    let token = app.login("banda@exemplo.com").await;
    let event = app.create_event(&token, "Show da Banda").await;
    sqlx::query(
        "update events set created_at = now() - interval '4 days', starts_at = now() + interval '10 days', ends_at = now() + interval '10 days 5 hours'",
    )
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query("update users set created_at = now() - interval '5 days', last_login_at = now() - interval '4 days'")
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(
        reminders::run_at(&app.state, WORKING_HOURS).await.unwrap(),
        1
    );
    let mail = app
        .sent
        .lock()
        .unwrap()
        .iter()
        .rfind(|mail| mail.to == "banda@exemplo.com")
        .cloned()
        .unwrap();
    assert_eq!(mail.subject, "Show da Banda: falta pouco para os ingressos");
    assert!(
        mail.html
            .contains(&format!("/painel/eventos/{event}?aba=visao-geral"))
    );

    // The e-mail's own link turns reminders off, and only them.
    let link = mail
        .body
        .lines()
        .find_map(|line| line.split("/descadastrar#").nth(1))
        .unwrap()
        .trim()
        .to_owned();
    assert!(link.starts_with("r."));
    let reply = app
        .request(
            axum::http::Method::POST,
            "/api/email/unsubscribe",
            None,
            Some(json!({ "token": link })),
        )
        .await
        .json();
    assert_eq!(reply["reminders"], true);
    assert_eq!(reply["subscribed"], false);
    let account = app.get("/api/account", &token).await.json();
    assert_eq!(account["reminderEmails"], false);
    assert_eq!(account["announcementEmails"], true);
}
