//! Tests added by the audit of format v1 (`docs/auditorias/qr-v1.md`) on the server side: the
//! custody of the event keys and what the door and the public check trust.
//!
//! The ignored test is a proof of concept of finding A-01 (the `public_key` column is trusted
//! as it is): it states the behaviour the audit asks for and fails today. Run it with
//! `cargo test -p ingressoimpresso-server --test audit_qr -- --ignored`; remove the `#[ignore]`
//! when the fix lands, so it becomes the regression test.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing,
    reason = "test helpers fail loudly by design"
)]

mod common;

use axum::http::Method;
use common::TestApp;
use common::door::{create_link, manifest, register};
use ingressoimpresso_server::keys;
use serde_json::{Value, json};
use sqlx::PgPool;
use ticket_core::dto::DoorEventDto;
use ticket_core::{
    EventId, EventSigningKey, EventTag, EventVerifier, KeyId, TicketIssuer, TicketNumber,
};
use uuid::Uuid;

/// An event with a paid batch of `quantity` numbers; returns the organizer token and the event.
async fn paid_event(app: &TestApp, quantity: i32) -> (String, Uuid) {
    let token = app.login("banda@exemplo.com").await;
    let event = app.create_event(&token, "Show da Banda").await;
    app.create_batch(&token, &event, quantity).await;
    (token, event.parse().unwrap())
}

async fn qr_tag(app: &TestApp, event: Uuid) -> u32 {
    let tag: i64 = sqlx::query_scalar("select qr_tag from events where id = $1")
        .bind(event)
        .fetch_one(&app.state.pool)
        .await
        .unwrap();
    u32::try_from(tag).unwrap()
}

async fn check(app: &TestApp, text: &str) -> Value {
    app.request(
        Method::POST,
        "/api/verify",
        None,
        Some(json!({ "text": text })),
    )
    .await
    .json()
}

/// The server derives nothing: the `public_key` column is what the door and the public check
/// publish. This test states the opposite (the published key must come from the sealed seed the
/// server can sign with) and fails today: with write access to the database but no master key,
/// an attacker adds a key generation of their own and every door admits their forgeries.
#[ignore = "audit finding A-01 (docs/auditorias/qr-v1.md): fails until the server validates public keys against the sealed seeds"]
#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn published_keys_must_come_from_the_sealed_seeds(pool: PgPool) {
    let app = TestApp::with_free_tickets(pool, 30).await;
    let (token, event) = paid_event(&app, 10).await;
    let tag = qr_tag(&app, event).await;

    // The attacker's own key pair, written straight into the table as a retired generation (a
    // retired key still verifies; it needs no `active` slot and never has to sign). The sealed
    // blob is garbage: nobody will ever unseal it, because no batch uses key id 2.
    let attacker = EventSigningKey::from_seed(&[0x42; 32]);
    sqlx::query(
        "insert into event_signing_keys (event_id, key_id, public_key, sealed_private_key, status)
         values ($1, 2, $2, $3, 'retired')",
    )
    .bind(event)
    .bind(attacker.public_key().to_bytes().as_slice())
    .bind(b"not sealed by the master key".as_slice())
    .execute(&app.state.pool)
    .await
    .unwrap();
    let forged = TicketIssuer::new(
        EventId::from(event),
        EventTag::new(tag),
        KeyId::new(2),
        attacker,
    )
    .issue(TicketNumber::new(1).unwrap())
    .to_qr_text();

    // The public check must not call the forgery authentic.
    assert_eq!(check(&app, &forged).await["verdict"], "not_ours");

    // The door manifest must not publish a key the server cannot prove it holds.
    let (_, access_token) = create_link(&app, &token, &event.to_string()).await;
    let phone = register(&app, &access_token, "Porta 1").await;
    let page = manifest(&app, &phone, None).await;
    let dto: DoorEventDto = serde_json::from_value(page["verifier"].clone()).unwrap();
    assert!(
        dto.keys.iter().all(|key| key.key_id != 2),
        "the manifest published the attacker's key: {:?}",
        dto.keys
    );
    let verifier = EventVerifier::try_from(&dto).unwrap();
    assert!(verifier.verify_qr_text(&forged).is_err());
}

/// What the fix of A-01 can build on: for a key the server created, the public key in the table
/// is exactly the one derived from the sealed seed under the master key.
#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn the_public_key_column_matches_the_sealed_seed(pool: PgPool) {
    let app = TestApp::with_free_tickets(pool, 30).await;
    let (_, event) = paid_event(&app, 5).await;
    let rows: Vec<(i16, Vec<u8>, Vec<u8>)> = sqlx::query_as(
        "select key_id, public_key, sealed_private_key from event_signing_keys where event_id = $1",
    )
    .bind(event)
    .fetch_all(&app.state.pool)
    .await
    .unwrap();
    assert_eq!(rows.len(), 1, "a new event has exactly one key generation");
    for (key_id, public_key, sealed) in rows {
        let seed = keys::unseal(
            &app.state.config.master_key,
            event,
            u8::try_from(key_id).unwrap(),
            &sealed,
        )
        .unwrap();
        assert_eq!(
            EventSigningKey::from_seed(&seed)
                .public_key()
                .to_bytes()
                .as_slice(),
            public_key.as_slice()
        );
        // The seal is bound to the row: the same blob under another event or key id is refused.
        assert!(keys::unseal(&app.state.config.master_key, Uuid::new_v4(), 1, &sealed).is_err());
        assert!(keys::unseal(&app.state.config.master_key, event, 2, &sealed).is_err());
    }
}

/// A ticket of a number the organizer never paid for is never signed anywhere: the digital
/// ticket refuses it, and the public check does not know it (audit item 3, invariant 2).
#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn unpaid_numbers_are_never_signed(pool: PgPool) {
    let app = TestApp::with_free_tickets(pool, 30).await;
    let (token, event) = paid_event(&app, 5).await;
    // Number 6 is outside the paid batch: no link for it.
    let outside = app
        .post(
            &format!("/api/events/{event}/tickets"),
            &token,
            json!({ "number": 6 }),
        )
        .await;
    assert_eq!(outside.error_code(), "ticket_not_issued");
    // A QR for number 6 forged with the wrong key is not ours either, even with the right tag.
    let forged = TicketIssuer::new(
        EventId::from(event),
        EventTag::new(qr_tag(&app, event).await),
        KeyId::new(1),
        EventSigningKey::from_seed(&[0x24; 32]),
    )
    .issue(TicketNumber::new(6).unwrap())
    .to_qr_text();
    assert_eq!(check(&app, &forged).await["verdict"], "not_ours");
}
