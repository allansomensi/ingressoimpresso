//! The setup assistant (ADR 0126): categories, numbers and checkpoints in one go.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing,
    reason = "test helpers fail loudly by design"
)]

mod common;

use axum::http::StatusCode;
use common::TestApp;
use serde_json::{Value, json};
use sqlx::PgPool;

fn weekend_setup() -> Value {
    json!({
        "categories": [
            { "category": { "name": "Passaporte", "color": "#EA580C", "priceCents": 10000,
                            "doorInstruction": "Pulseira laranja" }, "quantity": 100 },
            { "category": { "name": "Sábado", "color": "#2563eb", "priceCents": 6000,
                            "dayRule": "days", "validDays": [1] }, "quantity": 50 },
            { "category": { "name": "Meia", "color": "#16a34a", "priceCents": 3000,
                            "checkDocument": true, "documentNote": "Carteira de estudante",
                            "dayRule": "any_one" }, "quantity": 30 },
        ],
        "checkpoints": [
            { "name": "Jantar", "instruction": "Entregue o prato", "perDay": true,
              "categories": [0, 1], "allowance": 1 },
        ],
    })
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn the_assistant_builds_the_event(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("assistente@exemplo.com").await;
    let reply = app
        .post(
            "/api/events",
            &token,
            json!({
                "name": "Encontro",
                "startsAt": "2026-11-21T18:00:00-03:00",
                "endsAt": "2026-11-22T20:00:00-03:00",
                "ticketPriceCents": 6000,
                "days": [
                    { "startsAt": "2026-11-21T18:00:00-03:00", "endsAt": "2026-11-22T01:00:00-03:00" },
                    { "startsAt": "2026-11-22T12:00:00-03:00", "endsAt": "2026-11-22T20:00:00-03:00" },
                ],
            }),
        )
        .await;
    let event = reply.json()["id"].as_str().unwrap().to_owned();

    // A mistake in the last category leaves the event untouched.
    let mut broken = weekend_setup();
    broken["categories"][2]["category"]["color"] = json!("laranja");
    let refused = app
        .post(&format!("/api/events/{event}/setup"), &token, broken)
        .await;
    assert_eq!(refused.status, StatusCode::BAD_REQUEST);
    assert_eq!(refused.error_code(), "invalid_color");
    let mut no_right = weekend_setup();
    no_right["checkpoints"][0]["categories"] = json!([]);
    let refused = app
        .post(&format!("/api/events/{event}/setup"), &token, no_right)
        .await;
    assert_eq!(refused.error_code(), "invalid_checkpoint_categories");
    let categories = app
        .get(&format!("/api/events/{event}/categories"), &token)
        .await
        .json();
    assert_eq!(categories.as_array().unwrap().len(), 0);

    // Everything at once, numbers in a row from 1.
    let created = app
        .post(
            &format!("/api/events/{event}/setup"),
            &token,
            weekend_setup(),
        )
        .await;
    assert_eq!(
        created.status,
        StatusCode::CREATED,
        "{}",
        String::from_utf8_lossy(&created.bytes)
    );
    let created = created.json();
    let categories = created["categories"].as_array().unwrap();
    assert_eq!(categories.len(), 3);
    assert_eq!(categories[0]["color"], "#ea580c");
    assert_eq!(categories[0]["doorInstruction"], "Pulseira laranja");
    assert_eq!(
        categories[0]["ranges"],
        json!([{ "id": categories[0]["ranges"][0]["id"], "first": 1, "last": 100 }])
    );
    assert_eq!(categories[1]["ranges"][0]["first"], 101);
    assert_eq!(categories[1]["ranges"][0]["last"], 150);
    assert_eq!(categories[1]["validDays"], json!([1]));
    assert_eq!(categories[2]["dayRule"], "any_one");
    assert_eq!(categories[2]["checkDocument"], true);
    assert_eq!(categories[2]["ranges"][0]["last"], 180);
    let checkpoint = &created["checkpoints"][0];
    assert_eq!(checkpoint["name"], "Jantar");
    assert_eq!(checkpoint["perDay"], true);
    let entitled: Vec<&str> = checkpoint["categoryIds"]
        .as_array()
        .unwrap()
        .iter()
        .map(|id| id.as_str().unwrap())
        .collect();
    assert_eq!(entitled.len(), 2);
    assert!(entitled.contains(&categories[0]["id"].as_str().unwrap()));
    assert!(entitled.contains(&categories[1]["id"].as_str().unwrap()));

    // Only for an event still empty.
    let again = app
        .post(
            &format!("/api/events/{event}/setup"),
            &token,
            weekend_setup(),
        )
        .await;
    assert_eq!(again.status, StatusCode::CONFLICT);
    assert_eq!(again.error_code(), "setup_not_empty");

    // Another organization's event is not found.
    let other = app.login("outra@exemplo.com").await;
    let reply = app
        .post(
            &format!("/api/events/{event}/setup"),
            &other,
            weekend_setup(),
        )
        .await;
    assert_eq!(reply.status, StatusCode::NOT_FOUND);
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn quantities_and_tokens_are_checked(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("fichas@exemplo.com").await;
    let event = app.create_event(&token, "Quermesse").await;
    let mut huge = weekend_setup();
    huge["checkpoints"] = json!([]);
    huge["categories"][0]["quantity"] = json!(10_001);
    let reply = app
        .post(&format!("/api/events/{event}/setup"), &token, huge)
        .await;
    assert_eq!(reply.error_code(), "invalid_setup_quantity");
    let empty = app
        .post(
            &format!("/api/events/{event}/setup"),
            &token,
            json!({ "categories": [] }),
        )
        .await;
    assert_eq!(empty.error_code(), "invalid_setup");

    let reply = app
        .post(
            "/api/events",
            &token,
            json!({
                "name": "Fichas da quermesse",
                "kind": "tokens",
                "startsAt": "2026-11-21T18:00:00-03:00",
                "endsAt": "2026-11-21T23:00:00-03:00",
            }),
        )
        .await;
    let tokens = reply.json()["id"].as_str().unwrap().to_owned();
    let reply = app
        .post(
            &format!("/api/events/{tokens}/setup"),
            &token,
            weekend_setup(),
        )
        .await;
    assert_eq!(reply.error_code(), "checkpoints_tokens");
}
