//! Alerts that reach the admins and the summary (ADRs 0103, 0108).

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing,
    reason = "test helpers fail loudly by design"
)]

mod common;

use axum::http::{Method, StatusCode};
use common::{ADMIN, TestApp};
use ingressoimpresso_server::alerts::{self, NewAlert};
use ingressoimpresso_server::api::{AlertKind, AlertSeverity};
use serde_json::json;
use sqlx::PgPool;
use time::{Duration, OffsetDateTime, format_description::well_known::Rfc3339};

fn webhook_alert() -> NewAlert {
    NewAlert {
        kind: AlertKind::StripeWebhook,
        key: "stripe_webhook_error".to_owned(),
        severity: AlertSeverity::Critical,
        title: "O webhook da Stripe falhou".to_owned(),
        detail: Some("checkout.session.completed".to_owned()),
        section: "alertas",
    }
}

fn alert_mails(app: &TestApp) -> Vec<String> {
    app.sent
        .lock()
        .unwrap()
        .iter()
        .filter(|mail| mail.to == ADMIN && !mail.subject.contains("código"))
        .map(|mail| mail.subject.clone())
        .collect()
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn an_alert_opens_once_and_tells_every_channel(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let admin = app.login(ADMIN).await;
    let (state, telegram) = app.state.clone().with_telegram_memory();

    // The same problem three times: one alert, counted, told once.
    for _ in 0..3 {
        alerts::raise(state.clone(), webhook_alert()).await;
    }
    assert_eq!(alert_mails(&app), ["[Urgente] O webhook da Stripe falhou"]);
    assert_eq!(telegram.lock().unwrap().len(), 1);
    assert!(telegram.lock().unwrap()[0].starts_with("🔴 O webhook da Stripe falhou"));

    let list = app.get("/api/admin/alerts", &admin).await.json();
    assert_eq!(list["open"], 1);
    let alert = &list["alerts"][0];
    assert_eq!(alert["count"], 3);
    assert_eq!(alert["kind"], "stripe_webhook");
    assert_eq!(alert["link"], "/painel/admin?aba=alertas");
    assert!(alert["notifiedAt"].is_string());
    assert_eq!(list["channels"]["emails"], json!([ADMIN]));

    // Solved: the same problem again is a new alert, told again.
    let id = alert["id"].as_str().unwrap();
    let reply = app
        .request(
            Method::POST,
            &format!("/api/admin/alerts/{id}/resolve"),
            Some(&admin),
            None,
        )
        .await;
    assert_eq!(reply.status, StatusCode::NO_CONTENT);
    assert_eq!(app.get("/api/admin/alerts", &admin).await.json()["open"], 0);
    alerts::raise(state.clone(), webhook_alert()).await;
    assert_eq!(alert_mails(&app).len(), 2);
    let all = app
        .get("/api/admin/alerts?resolved=true", &admin)
        .await
        .json();
    assert_eq!(all["alerts"].as_array().unwrap().len(), 2);
    assert_eq!(all["alerts"][1]["resolvedBy"], ADMIN);

    // E-mail off: the next alert goes only to Telegram.
    let reply = app
        .put(
            "/api/admin/alerts/settings",
            &admin,
            json!({ "email": false, "telegram": true, "summary": true, "summaryFrequency": "weekly", "summaryWeekday": 1, "summaryTelegram": false, "summaryHour": 7, "doorMinTickets": 10 }),
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK);
    alerts::raise(
        state.clone(),
        NewAlert {
            key: "another".to_owned(),
            ..webhook_alert()
        },
    )
    .await;
    assert_eq!(alert_mails(&app).len(), 2);
    assert_eq!(telegram.lock().unwrap().len(), 3);
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn only_admins_see_alerts(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("banda@exemplo.com").await;
    assert_eq!(
        app.get("/api/admin/alerts", &token).await.status,
        StatusCode::FORBIDDEN
    );
    let admin = app.login(ADMIN).await;
    let reply = app
        .put(
            "/api/admin/alerts/settings",
            &admin,
            json!({ "email": true, "telegram": true, "summary": true, "summaryFrequency": "weekly", "summaryWeekday": 1, "summaryTelegram": false, "summaryHour": 24, "doorMinTickets": 10 }),
        )
        .await;
    assert_eq!(reply.error_code(), "invalid_hour");
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn a_large_event_about_to_start_without_a_door_link_raises_an_alert(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let admin = app.login(ADMIN).await;
    let token = app.login("banda@exemplo.com").await;
    let starts = OffsetDateTime::now_utc() + Duration::minutes(70);
    let event = app
        .post(
            "/api/events",
            &token,
            json!({ "name": "Show grande", "startsAt": starts.format(&Rfc3339).unwrap(),
                    "endsAt": (starts + Duration::hours(4)).format(&Rfc3339).unwrap() }),
        )
        .await
        .json()["id"]
        .as_str()
        .unwrap()
        .to_owned();
    let batch = app.create_batch(&token, &event, 60).await;
    if batch["status"] != "paid" {
        app.request(
            Method::POST,
            &format!(
                "/api/admin/batches/{}/mark-paid",
                batch["id"].as_str().unwrap()
            ),
            Some(&admin),
            None,
        )
        .await;
    }
    assert_eq!(alerts::check_doors(&app.state).await.unwrap(), 1);
    let list = app.get("/api/admin/alerts", &admin).await.json();
    assert_eq!(list["alerts"][0]["kind"], "door_missing");
    assert!(
        list["alerts"][0]["title"]
            .as_str()
            .unwrap()
            .contains("Show grande")
    );

    // With a door link, nothing to say; the threshold above the event's size, neither.
    let reply = app
        .post(
            &format!("/api/events/{event}/door/accesses"),
            &token,
            json!({ "label": "Portão 1" }),
        )
        .await;
    assert!(reply.status.is_success(), "{:?}", reply.json());
    assert_eq!(alerts::check_doors(&app.state).await.unwrap(), 0);
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn the_summary_goes_out_weekly_by_email_and_on_demand(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let admin = app.login(ADMIN).await;
    let (state, telegram) = app.state.clone().with_telegram_memory();
    alerts::raise(state.clone(), webhook_alert()).await;
    let alerts_on_telegram = telegram.lock().unwrap().len();

    // Weekly by default (ADR 0108): the last 7 days, by e-mail only.
    let settings = app.get("/api/admin/alerts", &admin).await.json()["settings"].clone();
    assert_eq!(settings["summaryFrequency"], "weekly");
    assert_eq!(settings["summaryTelegram"], false);
    let reply = app
        .request(
            Method::POST,
            "/api/admin/alerts/summary",
            Some(&admin),
            None,
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK);
    assert_eq!(reply.json()["emails"], 1);
    assert_eq!(reply.json()["telegram"], false);
    let summary = app
        .sent
        .lock()
        .unwrap()
        .iter()
        .rev()
        .find(|mail| mail.subject.starts_with("Resumo da semana"))
        .cloned()
        .expect("a weekly summary was sent");
    assert!(summary.body.contains("Últimos 7 dias"));
    assert!(summary.body.contains("Lotes pagos"));
    assert!(summary.body.contains("1 alerta aberto"));
    assert_eq!(telegram.lock().unwrap().len(), alerts_on_telegram);

    // Not on another weekday; on its own, once.
    let today = OffsetDateTime::now_utc()
        .to_offset(time::UtcOffset::from_hms(-3, 0, 0).unwrap())
        .weekday()
        .number_from_monday();
    let other = today % 7 + 1;
    sqlx::query("update alert_settings set summary_hour = 0, summary_weekday = $1")
        .bind(i16::from(other))
        .execute(&app.state.pool)
        .await
        .unwrap();
    assert!(!alerts::maybe_send_summary(&state).await.unwrap());
    sqlx::query("update alert_settings set summary_weekday = $1")
        .bind(i16::from(today))
        .execute(&app.state.pool)
        .await
        .unwrap();
    assert!(alerts::maybe_send_summary(&state).await.unwrap());
    assert!(!alerts::maybe_send_summary(&state).await.unwrap());

    // Daily and also on Telegram, when asked.
    let reply = app
        .put(
            "/api/admin/alerts/settings",
            &admin,
            json!({ "email": true, "telegram": true, "summary": true, "summaryFrequency": "daily",
                    "summaryWeekday": 1, "summaryTelegram": true, "summaryHour": 0, "doorMinTickets": 10 }),
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK);
    let reply = app
        .put(
            "/api/admin/alerts/settings",
            &admin,
            json!({ "email": true, "telegram": true, "summary": true, "summaryFrequency": "daily",
                    "summaryWeekday": 8, "summaryTelegram": true, "summaryHour": 0, "doorMinTickets": 10 }),
        )
        .await;
    assert_eq!(reply.status, StatusCode::BAD_REQUEST);
    let reply = app
        .request(
            Method::POST,
            "/api/admin/alerts/summary",
            Some(&admin),
            None,
        )
        .await;
    assert_eq!(reply.json()["telegram"], true);
    assert!(
        app.sent
            .lock()
            .unwrap()
            .iter()
            .any(|mail| mail.subject.starts_with("Resumo do dia"))
    );
    assert!(
        telegram
            .lock()
            .unwrap()
            .iter()
            .any(|text| text.starts_with("☀️ Resumo de"))
    );
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn the_mail_quota_warns_before_it_runs_out(pool: PgPool) {
    let app = TestApp::with_settings(pool, &[("MAIL_DAILY_LIMIT", "5")]).await;
    for index in 0..4 {
        app.request(
            Method::POST,
            "/api/auth/code",
            None,
            Some(json!({ "email": format!("pessoa{index}@exemplo.com") })),
        )
        .await;
    }
    // The alert is raised beside the e-mail that crossed 80%: give it a moment.
    let mut found = false;
    for _ in 0..50 {
        let kinds: Vec<String> =
            sqlx::query_scalar("select kind from admin_alerts where resolved_at is null")
                .fetch_all(&app.state.pool)
                .await
                .unwrap();
        if kinds.iter().any(|kind| kind == "mail_quota") {
            found = true;
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(20)).await;
    }
    assert!(found, "no quota alert");
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn a_burst_of_errors_crosses_the_threshold_once(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let mut crossed = 0;
    for _ in 0..(alerts::ERROR_THRESHOLD * 2) {
        if app.state.note_server_error().await {
            crossed += 1;
        }
    }
    assert_eq!(crossed, 1);
}
