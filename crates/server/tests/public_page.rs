//! The event's public page (ADR 0095).

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
use serde_json::{Value, json};
use sqlx::PgPool;

async fn public(app: &TestApp, slug: &str) -> Reply {
    app.request(
        Method::GET,
        &format!("/api/public/events/{slug}"),
        None,
        None,
    )
    .await
}

async fn paid_batch(app: &TestApp, token: &str, admin: &str, event: &str, quantity: i32) {
    let batch = app.create_batch(token, event, quantity).await;
    if batch["status"] != "paid" {
        let reply = app
            .post(
                &format!(
                    "/api/admin/batches/{}/mark-paid",
                    batch["id"].as_str().unwrap()
                ),
                admin,
                json!({}),
            )
            .await;
        assert!(reply.status.is_success());
    }
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn the_page_shows_what_a_buyer_needs_once_turned_on(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let admin = app.login(ADMIN).await;
    let token = app.login("banda@exemplo.com").await;
    let event = app.create_event(&token, "Arraiá São José").await;
    paid_batch(&app, &token, &admin, &event, 4).await;
    let mut sellers = Vec::new();
    for (name, phone) in [("Ana Maria Souza", "(11) 99999-8888"), ("Bruno", "")] {
        let seller = app
            .post(
                &format!("/api/events/{event}/sellers"),
                &token,
                json!({ "name": name, "phone": phone }),
            )
            .await
            .json();
        sellers.push(seller["id"].as_str().unwrap().to_owned());
    }

    // Off by default, with an address suggested from the name.
    let settings = app
        .get(&format!("/api/events/{event}/public-page"), &token)
        .await
        .json();
    assert_eq!(settings["enabled"], false);
    assert_eq!(settings["suggestedSlug"], "arraia-sao-jose");
    assert_eq!(settings["sellers"][0]["hasWhatsapp"], true);
    assert_eq!(
        public(&app, "arraia-sao-jose").await.status,
        StatusCode::NOT_FOUND
    );

    let reply = app
        .put(
            &format!("/api/events/{event}/public-page"),
            &token,
            json!({ "enabled": true, "slug": "arraia-sao-jose", "soldOut": false,
                    "description": "Traga um prato!", "sellerIds": sellers }),
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK);
    assert!(
        reply.json()["url"]
            .as_str()
            .unwrap()
            .ends_with("/e/arraia-sao-jose")
    );

    let page = public(&app, "arraia-sao-jose").await;
    assert_eq!(page.status, StatusCode::OK);
    let page = page.json();
    assert_eq!(page["name"], "Arraiá São José");
    assert_eq!(page["ticketPriceCents"], 3000);
    assert_eq!(page["description"], "Traga um prato!");
    assert_eq!(page["soldOut"], false);
    // Only sellers with a usable phone, with a short name.
    assert_eq!(
        page["sellers"],
        json!([{ "name": "Ana S.", "whatsapp": "5511999998888" }])
    );

    // Another event cannot take the address; a bad one is refused.
    let other = app.create_event(&token, "Outro").await;
    let reply = app
        .put(
            &format!("/api/events/{other}/public-page"),
            &token,
            json!({ "enabled": true, "slug": "arraia-sao-jose", "soldOut": false, "sellerIds": [] }),
        )
        .await;
    assert_eq!(reply.error_code(), "slug_taken");
    let reply = app
        .put(
            &format!("/api/events/{other}/public-page"),
            &token,
            json!({ "enabled": true, "slug": "Festa Junina", "soldOut": false, "sellerIds": [] }),
        )
        .await;
    assert_eq!(reply.error_code(), "invalid_slug");
    let suggested = app
        .get(&format!("/api/events/{other}/public-page"), &token)
        .await
        .json();
    assert_eq!(suggested["suggestedSlug"], "outro");
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn every_number_gone_reads_sold_out(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let admin = app.login(ADMIN).await;
    let token = app.login("banda@exemplo.com").await;
    let event = app.create_event(&token, "Show").await;
    paid_batch(&app, &token, &admin, &event, 2).await;
    app.put(
        &format!("/api/events/{event}/public-page"),
        &token,
        json!({ "enabled": true, "slug": "show-da-banda", "soldOut": false, "sellerIds": [] }),
    )
    .await;
    let sold_out = |page: Value| page["soldOut"].as_bool().unwrap();
    assert!(!sold_out(public(&app, "show-da-banda").await.json()));

    // Both numbers go out as digital tickets: nothing left.
    for number in [1, 2] {
        let reply = app
            .post(
                &format!("/api/events/{event}/tickets"),
                &token,
                json!({ "number": number, "holderName": null }),
            )
            .await;
        assert!(
            reply.status.is_success(),
            "{}",
            String::from_utf8_lossy(&reply.bytes)
        );
    }
    assert!(sold_out(public(&app, "show-da-banda").await.json()));
    let settings = app
        .get(&format!("/api/events/{event}/public-page"), &token)
        .await
        .json();
    assert_eq!(settings["soldOutAuto"], true);

    // Turned off, the page is gone.
    app.put(
        &format!("/api/events/{event}/public-page"),
        &token,
        json!({ "enabled": false, "slug": "show-da-banda", "soldOut": false, "sellerIds": [] }),
    )
    .await;
    assert_eq!(
        public(&app, "show-da-banda").await.status,
        StatusCode::NOT_FOUND
    );
}
