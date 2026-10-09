//! Digital tickets (ADR 0030): a link shows the same signed QR the printed ticket carries, for
//! paid numbers only, and follows the ticket's state at the door.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing,
    reason = "test helpers fail loudly by design"
)]

mod common;

use axum::http::{Method, StatusCode};
use common::TestApp;
use serde_json::{Value, json};
use sqlx::PgPool;
use ticket_core::{
    EventId, EventKey, EventPublicKey, EventTag, EventVerifier, KeyId, KeyStatus, SignedTicket,
};

async fn open(app: &TestApp, url: &str) -> common::Reply {
    let token = url.split_once('#').unwrap().1;
    app.request(
        Method::POST,
        "/api/ticket",
        None,
        Some(json!({ "token": token })),
    )
    .await
}

async fn setup(app: &TestApp) -> (String, String) {
    let token = app.login("banda@exemplo.com").await;
    let event = app.create_event(&token, "Show da Banda").await;
    (token, event)
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn a_link_shows_the_signed_ticket(pool: PgPool) {
    let app = TestApp::with_free_tickets(pool, 30);
    let (token, event) = setup(&app).await;

    // Nothing paid yet: no ticket to send.
    let early = app
        .post(
            &format!("/api/events/{event}/tickets"),
            &token,
            json!({ "number": 1 }),
        )
        .await;
    assert_eq!(early.error_code(), "ticket_not_issued");

    app.create_batch(&token, &event, 20).await;
    let created = app
        .post(
            &format!("/api/events/{event}/tickets"),
            &token,
            json!({ "number": 7, "holderName": "  Maria Souza " }),
        )
        .await;
    assert_eq!(created.status, StatusCode::CREATED, "{:?}", created.json());
    let link = created.json();
    assert_eq!(link["number"], 7);
    assert_eq!(link["numberLabel"], "0007");
    assert_eq!(link["holderName"], "Maria Souza");
    assert_eq!(link["state"], "valid");
    let url = link["url"].as_str().unwrap();
    assert!(url.starts_with("http://localhost:3000/ingresso#"), "{url}");

    let pass = open(&app, url).await;
    assert_eq!(pass.status, StatusCode::OK);
    assert_eq!(pass.headers["cache-control"], "no-store");
    let pass = pass.json();
    assert_eq!(pass["event"]["name"], "Show da Banda");
    assert_eq!(pass["event"]["startsAt"], "2026-11-20T22:00:00-03:00");
    assert_eq!(pass["holderName"], "Maria Souza");
    let qr = SignedTicket::from_qr_text(pass["qrText"].as_str().unwrap()).unwrap();
    assert_eq!(qr.header().number.get(), 7);
    // The door accepts it exactly like the printed ticket: same event key, same format.
    let (tag, key): (i64, Vec<u8>) = sqlx::query_as(
        "select e.qr_tag, k.public_key from events e join event_signing_keys k on k.event_id = e.id where e.id = $1::uuid",
    )
    .bind(&event)
    .fetch_one(&app.state.pool)
    .await
    .unwrap();
    let verifier = EventVerifier::new(
        EventId::from(uuid::Uuid::parse_str(&event).unwrap()),
        EventTag::new(u32::try_from(tag).unwrap()),
        vec![EventKey {
            key_id: KeyId::new(1),
            public_key: EventPublicKey::from_bytes(&key.try_into().unwrap()).unwrap(),
            status: KeyStatus::Active,
        }],
    )
    .unwrap();
    let verified = verifier
        .verify_qr_text(pass["qrText"].as_str().unwrap())
        .unwrap();
    assert_eq!(verified.number().get(), 7);

    // The organizer sees that it was opened; one active link per number.
    let list = app
        .get(&format!("/api/events/{event}/tickets"), &token)
        .await
        .json();
    assert_eq!(list["links"][0]["openCount"], 1);
    assert!(list["links"][0]["firstOpenedAt"].is_string());
    assert_eq!(list["paidTickets"], 20);
    assert_eq!(list["nextNumber"], 1);
    let again = app
        .post(
            &format!("/api/events/{event}/tickets"),
            &token,
            json!({ "number": 7 }),
        )
        .await;
    assert_eq!(again.error_code(), "ticket_link_exists");

    // Another organization never sees it; a wrong token finds nothing.
    let other = app.login("outra@exemplo.com").await;
    let hidden = app
        .get(&format!("/api/events/{event}/tickets"), &other)
        .await;
    assert_eq!(hidden.status, StatusCode::NOT_FOUND);
    let wrong = open(&app, "x#nada").await;
    assert_eq!(wrong.status, StatusCode::NOT_FOUND);
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn links_follow_voids_and_revocation(pool: PgPool) {
    let app = TestApp::with_free_tickets(pool, 30);
    let (token, event) = setup(&app).await;
    app.create_batch(&token, &event, 10).await;
    let link = app
        .post(&format!("/api/events/{event}/tickets"), &token, json!({}))
        .await
        .json();
    assert_eq!(link["number"], 1, "the next free number");
    let url = link["url"].as_str().unwrap().to_owned();

    let void = app
        .post(
            &format!("/api/events/{event}/voids"),
            &token,
            json!({ "first": 1, "last": 1, "reason": "lost" }),
        )
        .await;
    assert_eq!(void.status, StatusCode::CREATED);
    let pass = open(&app, &url).await.json();
    assert_eq!(pass["state"], "voided");
    assert_eq!(pass["qrText"], Value::Null);
    let voided = app
        .post(
            &format!("/api/events/{event}/tickets"),
            &token,
            json!({ "number": 1 }),
        )
        .await;
    assert_eq!(voided.error_code(), "ticket_voided");

    let revoked = app
        .post(
            &format!("/api/ticket-links/{}/revoke", link["id"].as_str().unwrap()),
            &token,
            json!({}),
        )
        .await;
    assert!(revoked.json()["revokedAt"].is_string());
    assert_eq!(open(&app, &url).await.status, StatusCode::NOT_FOUND);
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn bulk_links_skip_taken_numbers_and_sellers_are_avoided(pool: PgPool) {
    let app = TestApp::with_free_tickets(pool, 30);
    let (token, event) = setup(&app).await;
    app.create_batch(&token, &event, 30).await;
    let seller = app
        .post(
            &format!("/api/events/{event}/sellers"),
            &token,
            json!({ "name": "João" }),
        )
        .await
        .json();
    app.post(
        &format!("/api/sellers/{}/ranges", seller["id"].as_str().unwrap()),
        &token,
        json!({ "first": 1, "last": 10 }),
    )
    .await;
    let list = app
        .get(&format!("/api/events/{event}/tickets"), &token)
        .await
        .json();
    assert_eq!(
        list["nextNumber"], 11,
        "numbers held by a seller are skipped"
    );

    app.post(
        &format!("/api/events/{event}/tickets"),
        &token,
        json!({ "number": 12 }),
    )
    .await;
    let bulk = app
        .post(
            &format!("/api/events/{event}/tickets/bulk"),
            &token,
            json!({ "first": 11, "last": 40 }),
        )
        .await;
    assert_eq!(bulk.status, StatusCode::CREATED);
    let numbers: Vec<i64> = bulk
        .json()
        .as_array()
        .unwrap()
        .iter()
        .map(|link| link["number"].as_i64().unwrap())
        .collect();
    assert_eq!(numbers.len(), 19, "11..30 except 12; 31..40 are not paid");
    assert!(!numbers.contains(&12));
    let too_many = app
        .post(
            &format!("/api/events/{event}/tickets/bulk"),
            &token,
            json!({ "first": 1, "last": 501 }),
        )
        .await;
    assert_eq!(too_many.error_code(), "invalid_range");
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn the_ticket_image_is_the_printed_design(pool: PgPool) {
    let app = TestApp::with_free_tickets(pool, 30);
    let (token, event) = setup(&app).await;
    app.create_batch(&token, &event, 5).await;
    let link = app
        .post(
            &format!("/api/events/{event}/tickets"),
            &token,
            json!({ "number": 2 }),
        )
        .await
        .json();
    let ticket = link["url"]
        .as_str()
        .unwrap()
        .split_once('#')
        .unwrap()
        .1
        .to_owned();
    let image = app
        .request(
            Method::POST,
            "/api/ticket/image",
            None,
            Some(json!({ "token": ticket })),
        )
        .await;
    assert_eq!(image.status, StatusCode::OK);
    assert_eq!(image.headers["content-type"], "image/jpeg");
    assert_eq!(&image.bytes[..3], &[0xFF, 0xD8, 0xFF]);
    // Asked again, it comes from the cached file, byte for byte.
    let again = app
        .request(
            Method::POST,
            "/api/ticket/image",
            None,
            Some(json!({ "token": ticket })),
        )
        .await;
    assert_eq!(again.bytes, image.bytes);
    let cached = std::fs::read_dir(&app.state.config.export_dir)
        .unwrap()
        .filter_map(Result::ok)
        .any(|entry| entry.file_name().to_string_lossy().starts_with("ticket-"));
    assert!(cached);
}
