//! Consumption tokens (ADR 0084): an event of fichas is an event like any other, with its kind
//! told to the panel, the door, the seller's page and the digital ticket.

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
use common::door::{create_link, manifest, register};
use serde_json::{Value, json};
use sqlx::PgPool;

fn body(kind: Option<&str>) -> Value {
    let mut body = json!({
        "name": "Quermesse de São João",
        "venue": "Pátio da paróquia",
        "startsAt": "2026-11-21T18:00:00-03:00",
        "endsAt": "2026-11-21T23:00:00-03:00",
        "ticketPriceCents": 600
    });
    if let Some(kind) = kind {
        body["kind"] = json!(kind);
    }
    body
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn events_print_tickets_or_tokens(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("paroquia@exemplo.com").await;

    // An old panel sends no kind: tickets.
    let tickets = app.post("/api/events", &token, body(None)).await;
    assert_eq!(tickets.status, StatusCode::CREATED);
    assert_eq!(tickets.json()["kind"], "tickets");

    let created = app.post("/api/events", &token, body(Some("tokens"))).await;
    assert_eq!(created.status, StatusCode::CREATED);
    let event = created.json();
    assert_eq!(event["kind"], "tokens");
    let id = event["id"].as_str().unwrap();

    let bad = app.post("/api/events", &token, body(Some("coupons"))).await;
    assert!(bad.status.is_client_error());

    // Editing without the field keeps it; the list says it too.
    let edited = app
        .put(&format!("/api/events/{id}"), &token, body(None))
        .await;
    assert_eq!(edited.status, StatusCode::OK);
    assert_eq!(edited.json()["kind"], "tokens");
    let list = app.get("/api/events", &token).await.json();
    let listed = list
        .as_array()
        .unwrap()
        .iter()
        .find(|item| item["id"] == id)
        .unwrap()
        .clone();
    assert_eq!(listed["kind"], "tokens");

    // A token is used once: no exit and return.
    let reentry = app
        .put(
            &format!("/api/events/{id}/door-settings"),
            &token,
            json!({ "reentry": true }),
        )
        .await;
    assert_eq!(reentry.error_code(), "reentry_tokens");

    // The stall's phone hears of the kind.
    let (_, access) = create_link(&app, &token, id).await;
    let phone = register(&app, &access, "Barraca do pastel").await;
    assert_eq!(
        manifest(&app, &phone, None).await["event"]["kind"],
        "tokens"
    );

    // A copy keeps it.
    let copy = app
        .post(&format!("/api/events/{id}/duplicate"), &token, json!({}))
        .await
        .json();
    assert_eq!(copy["kind"], "tokens");

    // Turning a ticket event with re-entry into tokens turns re-entry off.
    let tickets_id = tickets.json()["id"].as_str().unwrap().to_owned();
    app.put(
        &format!("/api/events/{tickets_id}/door-settings"),
        &token,
        json!({ "reentry": true }),
    )
    .await;
    let changed = app
        .put(
            &format!("/api/events/{tickets_id}"),
            &token,
            body(Some("tokens")),
        )
        .await;
    assert_eq!(changed.json()["kind"], "tokens");
    let overview = app
        .get(&format!("/api/events/{tickets_id}/door"), &token)
        .await
        .json();
    assert_eq!(overview["reentry"], false);
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn a_token_event_asks_nothing_of_the_door(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("paroquia@exemplo.com").await;
    let event = app.post("/api/events", &token, body(None)).await.json();
    let id = event["id"].as_str().unwrap();

    // Set up as tickets: a category with a document check, a box office.
    let meia = app
        .post(
            &format!("/api/events/{id}/categories"),
            &token,
            json!({ "name": "Meia", "color": "#2563eb", "checkDocument": true }),
        )
        .await;
    assert_eq!(meia.json()["checkDocument"], true);
    let seller = app
        .post(
            &format!("/api/events/{id}/sellers"),
            &token,
            json!({ "name": "Caixa", "boxOffice": true }),
        )
        .await;
    assert_eq!(seller.json()["boxOffice"], true);

    // Switched to fichas: no document, no box office, and none can come back.
    app.put(&format!("/api/events/{id}"), &token, body(Some("tokens")))
        .await;
    let categories = app
        .get(&format!("/api/events/{id}/categories"), &token)
        .await
        .json();
    assert_eq!(categories[0]["checkDocument"], false);
    let sellers = app
        .get(&format!("/api/events/{id}/sellers"), &token)
        .await
        .json();
    assert_eq!(sellers[0]["boxOffice"], false);
    let again = app
        .post(
            &format!("/api/events/{id}/sellers"),
            &token,
            json!({ "name": "Outro caixa", "boxOffice": true }),
        )
        .await;
    assert_eq!(again.error_code(), "box_office_tokens");
    let pastel = app
        .post(
            &format!("/api/events/{id}/categories"),
            &token,
            json!({ "name": "Pastel", "color": "#ea580c", "checkDocument": true }),
        )
        .await;
    assert_eq!(pastel.json()["checkDocument"], false);

    // Never designed: the editor starts from a ficha, 21 per A4 sheet.
    let design = app
        .get(&format!("/api/events/{id}/design"), &token)
        .await
        .json();
    assert_eq!(design["version"], 0);
    assert_eq!(design["design"]["widthMm"], 63.0);
    assert_eq!(design["design"]["heightMm"], 38.0);
}
