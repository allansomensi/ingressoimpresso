//! Passing a digital ticket on (ADR 0097).

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing,
    reason = "test helpers fail loudly by design"
)]

mod common;

use axum::http::{Method, StatusCode};
use common::{ADMIN, Reply, TestApp};
use serde_json::json;
use sqlx::PgPool;

async fn open(app: &TestApp, token: &str) -> Reply {
    app.request(
        Method::POST,
        "/api/ticket",
        None,
        Some(json!({ "token": token })),
    )
    .await
}

async fn transfer(app: &TestApp, token: &str, name: &str) -> Reply {
    app.request(
        Method::POST,
        "/api/ticket/transfer",
        None,
        Some(json!({ "token": token, "holderName": name })),
    )
    .await
}

fn token_of(url: &str) -> String {
    url.split_once('#').unwrap().1.to_owned()
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn a_holder_passes_the_ticket_on_and_the_old_link_stops(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let admin = app.login(ADMIN).await;
    let token = app.login("banda@exemplo.com").await;
    let event = app.create_event(&token, "Show").await;
    let batch = app.create_batch(&token, &event, 5).await;
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
    let link = app
        .post(
            &format!("/api/events/{event}/tickets"),
            &token,
            json!({ "number": 3, "holderName": "Ana" }),
        )
        .await
        .json();
    let first = token_of(link["url"].as_str().unwrap());
    let pass = open(&app, &first).await.json();
    assert_eq!(pass["transfersLeft"], 3);
    assert_eq!(pass["wallets"], json!({ "apple": false, "google": false }));
    let qr = pass["qrText"].clone();

    // Ana passes it to Bia: same number, same QR, a new link; the old one says so.
    let reply = transfer(&app, &first, " Bia Souza ").await;
    assert_eq!(reply.status, StatusCode::OK);
    let moved = reply.json();
    assert_eq!(moved["holderName"], "Bia Souza");
    let second = token_of(moved["url"].as_str().unwrap());
    let reply = open(&app, &first).await;
    assert_eq!(reply.status, StatusCode::GONE);
    assert_eq!(reply.error_code(), "ticket_transferred");
    let pass = open(&app, &second).await.json();
    assert_eq!(pass["number"], 3);
    assert_eq!(pass["qrText"], qr);
    assert_eq!(pass["holderName"], "Bia Souza");
    assert_eq!(pass["transfersLeft"], 2);
    // The old token cannot move it again.
    assert_eq!(
        transfer(&app, &first, "Caio").await.error_code(),
        "ticket_transferred"
    );
    assert_eq!(
        transfer(&app, &second, "").await.error_code(),
        "invalid_holder_name"
    );

    // The organizer's list shows the new holder; turning transfers off stops them.
    let reply = app
        .put(
            &format!("/api/events/{event}/ticket-settings"),
            &token,
            json!({ "transfers": false }),
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK);
    assert_eq!(open(&app, &second).await.json()["transfersLeft"], 0);
    assert_eq!(
        transfer(&app, &second, "Caio").await.error_code(),
        "transfer_not_allowed"
    );
    app.put(
        &format!("/api/events/{event}/ticket-settings"),
        &token,
        json!({ "transfers": true }),
    )
    .await;

    // Three transfers in a row at most.
    let mut current = second;
    for name in ["Caio", "Duda"] {
        current = token_of(
            transfer(&app, &current, name).await.json()["url"]
                .as_str()
                .unwrap(),
        );
    }
    assert_eq!(open(&app, &current).await.json()["transfersLeft"], 0);
    assert_eq!(
        transfer(&app, &current, "Edu").await.error_code(),
        "transfer_not_allowed"
    );
    // Without credentials, no wallet.
    let reply = app
        .request(
            Method::POST,
            "/api/ticket/wallet/apple",
            None,
            Some(json!({ "token": current })),
        )
        .await;
    assert_eq!(reply.status, StatusCode::NOT_FOUND);
}
