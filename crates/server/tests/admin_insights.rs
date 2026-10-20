//! The admin funnel and the events around now (ADR 0099).

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing,
    reason = "test helpers fail loudly by design"
)]

mod common;

use axum::http::StatusCode;
use common::{ADMIN, TestApp, door};
use serde_json::{Value, json};
use sqlx::PgPool;
use time::format_description::well_known::Rfc3339;
use time::{Duration, OffsetDateTime};

fn step(funnel: &Value, name: &str) -> i64 {
    funnel["steps"]
        .as_array()
        .unwrap()
        .iter()
        .find(|step| step["step"] == name)
        .unwrap()["organizations"]
        .as_i64()
        .unwrap()
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn the_funnel_follows_each_organization_to_the_door(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let admin = app.login(ADMIN).await;
    // One organization only signs up; another goes all the way to the door.
    app.login("curioso@exemplo.com").await;
    let token = app.login("banda@exemplo.com").await;
    let event = app.create_event(&token, "Show").await;
    let batch = app.create_batch(&token, &event, 10).await;
    if batch["status"] != "paid" {
        app.post(
            &format!(
                "/api/admin/batches/{}/mark-paid",
                batch["id"].as_str().unwrap()
            ),
            &admin,
            json!({}),
        )
        .await;
    }
    let (_, access) = door::create_link(&app, &token, &event).await;
    let phone = door::register(&app, &access, "Porta 1").await;
    door::upload(
        &app,
        &phone,
        vec![door::scan(
            "11111111-1111-4111-8111-111111111111",
            Some(1),
            "admitted",
            0,
        )],
        false,
    )
    .await;

    let reply = app.get("/api/admin/funnel?days=30", &token).await;
    assert_eq!(reply.status, StatusCode::FORBIDDEN);
    let funnel = app.get("/api/admin/funnel?days=30", &admin).await;
    assert_eq!(funnel.status, StatusCode::OK);
    let funnel = funnel.json();
    assert_eq!(funnel["days"], 30);
    // The admin's own organization counts too: three signups.
    assert_eq!(step(&funnel, "signup"), 3);
    assert_eq!(step(&funnel, "event"), 1);
    assert_eq!(step(&funnel, "batch"), 1);
    assert_eq!(step(&funnel, "door"), 1);
    assert!(step(&funnel, "paid") <= 1);

    let reply = app.get("/api/admin/funnel?days=0", &admin).await;
    assert_eq!(reply.error_code(), "invalid_days");
    let all = app.get("/api/admin/funnel", &admin).await.json();
    assert!(all["days"].is_null());
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn events_around_now_show_what_needs_a_look(pool: PgPool) {
    let app = TestApp::new(pool.clone()).await;
    let admin = app.login(ADMIN).await;
    let token = app.login("banda@exemplo.com").await;
    let now = OffsetDateTime::now_utc();
    let at = |offset: Duration| (now + offset).format(&Rfc3339).unwrap();
    let mut events = Vec::new();
    for (name, start, end) in [
        ("Agora", Duration::hours(-1), Duration::hours(3)),
        ("Mais tarde", Duration::hours(1), Duration::hours(5)),
        (
            "Semana que vem",
            Duration::days(7),
            Duration::days(7) + Duration::hours(4),
        ),
    ] {
        let reply = app
            .post(
                "/api/events",
                &token,
                json!({ "name": name, "venue": null, "startsAt": at(start), "endsAt": at(end), "ticketPriceCents": 1000 }),
            )
            .await;
        assert_eq!(reply.status, StatusCode::CREATED);
        let id = reply.json()["id"].as_str().unwrap().to_owned();
        let batch = app.create_batch(&token, &id, 5).await;
        if batch["status"] != "paid" {
            app.post(
                &format!(
                    "/api/admin/batches/{}/mark-paid",
                    batch["id"].as_str().unwrap()
                ),
                &admin,
                json!({}),
            )
            .await;
        }
        events.push(id);
    }
    // The live one has a phone silent for 30 minutes and holding 40 reads.
    let (_, access) = door::create_link(&app, &token, &events[0]).await;
    let phone = door::register(&app, &access, "Porta 1").await;
    sqlx::query(
        "update door_devices set last_sync_at = now() - interval '30 minutes', last_seen_at = now() - interval '30 minutes', pending_scans = 40 where id = $1::uuid",
    )
    .bind(&phone.id)
    .execute(&pool)
    .await
    .unwrap();

    let reply = app.get("/api/admin/live", &token).await;
    assert_eq!(reply.status, StatusCode::FORBIDDEN);
    let live = app.get("/api/admin/live", &admin).await.json();
    let list = live["events"].as_array().unwrap();
    let names: Vec<&str> = list.iter().map(|e| e["name"].as_str().unwrap()).collect();
    assert_eq!(names, ["Agora", "Mais tarde"], "next week stays out");
    let agora = &list[0];
    assert_eq!(agora["state"], "live");
    assert_eq!(agora["devices"], 1);
    assert_eq!(agora["devicesOnline"], 0);
    let kinds: Vec<&str> = agora["problems"]
        .as_array()
        .unwrap()
        .iter()
        .map(|p| p["kind"].as_str().unwrap())
        .collect();
    assert_eq!(kinds, ["stale", "pending"]);
    assert_eq!(agora["problems"][1]["value"], 40);
    // Starting within 2 hours with paid tickets and nobody at the door.
    let later = &list[1];
    assert_eq!(later["state"], "upcoming");
    assert_eq!(later["problems"][0]["kind"], "no_devices");
}
