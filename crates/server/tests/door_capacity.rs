//! The venue's capacity (ADR 0110): the limit, the count of who is in and the warnings.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing,
    reason = "test helpers fail loudly by design"
)]

mod common;

use axum::http::{Method, StatusCode};
use common::door::{create_link, manifest, register, scan, upload};
use common::{ADMIN, TestApp};
use serde_json::{Value, json};
use sqlx::PgPool;

async fn paid_event(app: &TestApp, token: &str) -> String {
    let admin = app.login(ADMIN).await;
    let event = app.create_event(token, "Show lotado").await;
    let batch = app.create_batch(token, &event, 20).await;
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
    event
}

async fn capacity(app: &TestApp, token: &str, event: &str, body: Value) -> (StatusCode, Value) {
    let reply = app
        .put(&format!("/api/events/{event}/capacity"), token, body)
        .await;
    (reply.status, reply.json())
}

fn kinds(inbox: &Value) -> Vec<String> {
    inbox["notifications"]
        .as_array()
        .unwrap()
        .iter()
        .map(|item| item["kind"].as_str().unwrap().to_owned())
        .collect()
}

const MINUTE: i64 = 60_000;

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn the_venue_fills_and_the_organization_hears_once(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("casa@exemplo.com").await;
    let event = paid_event(&app, &token).await;

    // Checked values; no limit by default.
    let overview = app
        .get(&format!("/api/events/{event}/door"), &token)
        .await
        .json();
    assert!(overview["capacity"].is_null());
    assert_eq!(
        capacity(
            &app,
            &token,
            &event,
            json!({ "capacity": 0, "warnPercent": 90 })
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        capacity(
            &app,
            &token,
            &event,
            json!({ "capacity": 10, "warnPercent": 40 })
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    let (status, overview) = capacity(
        &app,
        &token,
        &event,
        json!({ "capacity": 4, "warnPercent": 75 }),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(overview["capacity"], 4);
    assert_eq!(overview["capacityWarnPercent"], 75);

    // The phones know the limit.
    let (_, access) = create_link(&app, &token, &event).await;
    let gate = register(&app, &access, "Portão").await;
    let page = manifest(&app, &gate, None).await;
    assert_eq!(page["event"]["capacity"], 4);
    assert_eq!(page["event"]["capacityWarnPercent"], 75);

    // Two in: half full, no warning.
    for (index, number) in [1, 2].into_iter().enumerate() {
        upload(
            &app,
            &gate,
            vec![scan(
                &format!("00000000-0000-4000-8000-0000000c000{index}"),
                Some(number),
                "admitted",
                i64::try_from(index).unwrap() * MINUTE,
            )],
            false,
        )
        .await;
    }
    let live = app
        .get(&format!("/api/events/{event}/door/live"), &token)
        .await
        .json();
    assert_eq!(live["capacity"]["occupied"], 2);
    assert_eq!(live["capacity"]["left"], 2);
    assert_eq!(
        kinds(&app.get("/api/inbox", &token).await.json()),
        Vec::<String>::new()
    );

    // The third reaches 75%: one warning, even when a copy of it comes again.
    for (id, number) in [("a", 3), ("b", 3)] {
        upload(
            &app,
            &gate,
            vec![scan(
                &format!("00000000-0000-4000-8000-0000000c00{id}0"),
                Some(number),
                "admitted",
                5 * MINUTE,
            )],
            false,
        )
        .await;
    }
    assert_eq!(
        kinds(&app.get("/api/inbox", &token).await.json()),
        ["capacity_near"]
    );

    // Full: the second and last warning.
    upload(
        &app,
        &gate,
        vec![scan(
            "00000000-0000-4000-8000-0000000c00d0",
            Some(4),
            "admitted",
            9 * MINUTE,
        )],
        false,
    )
    .await;
    upload(
        &app,
        &gate,
        vec![scan(
            "00000000-0000-4000-8000-0000000c00e0",
            Some(5),
            "admitted",
            10 * MINUTE,
        )],
        false,
    )
    .await;
    let inbox = app.get("/api/inbox", &token).await.json();
    assert_eq!(kinds(&inbox), ["capacity_full", "capacity_near"]);
    assert_eq!(inbox["notifications"][0]["data"]["capacity"], 4);
    let live = app
        .get(&format!("/api/events/{event}/door/live"), &token)
        .await
        .json();
    assert_eq!(live["capacity"]["occupied"], 5);
    assert_eq!(live["capacity"]["left"], 0);

    // With exit and return, who went out leaves room.
    app.put(
        &format!("/api/events/{event}/door-settings"),
        &token,
        json!({ "reentry": true }),
    )
    .await;
    upload(
        &app,
        &gate,
        vec![scan(
            "00000000-0000-4000-8000-0000000c00f0",
            Some(1),
            "exited",
            20 * MINUTE,
        )],
        false,
    )
    .await;
    let live = app
        .get(&format!("/api/events/{event}/door/live"), &token)
        .await
        .json();
    assert_eq!(live["capacity"]["occupied"], 4);

    // A bigger venue may warn again; taking the limit off hides it.
    let (_, overview) = capacity(
        &app,
        &token,
        &event,
        json!({ "capacity": null, "warnPercent": 90 }),
    )
    .await;
    assert!(overview["capacity"].is_null());
    let live = app
        .get(&format!("/api/events/{event}/door/live"), &token)
        .await
        .json();
    assert!(live["capacity"].is_null());
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn tokens_have_no_capacity(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("bar@exemplo.com").await;
    let reply = app
        .post(
            "/api/events",
            &token,
            json!({ "name": "Fichas", "startsAt": "2030-01-01T20:00:00Z", "endsAt": "2030-01-02T02:00:00Z", "kind": "tokens" }),
        )
        .await;
    let event = reply.json()["id"].as_str().unwrap().to_owned();
    let (status, body) = capacity(
        &app,
        &token,
        &event,
        json!({ "capacity": 100, "warnPercent": 90 }),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "{body}");
    assert_eq!(body["error"]["code"], "capacity_tokens");
}
