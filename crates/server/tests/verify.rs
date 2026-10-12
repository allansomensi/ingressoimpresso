//! Check a ticket before buying it (ADR 0075): the public check answers what a QR is from its
//! signature, never whether it entered nor who has it, follows voids and the event's changes,
//! and the organizer may turn it off.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing,
    reason = "test helpers fail loudly by design"
)]

mod common;

use axum::body::Body;
use axum::http::{Method, Request, StatusCode};
use common::TestApp;
use serde_json::{Value, json};
use sqlx::PgPool;

async fn check(app: &TestApp, text: &str) -> Value {
    let reply = app
        .request(
            Method::POST,
            "/api/verify",
            None,
            Some(json!({ "text": text })),
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK, "{:?}", reply.json());
    assert_eq!(reply.headers["cache-control"], "no-store");
    reply.json()
}

/// The QR text of number `number`, read from its digital ticket.
async fn qr_of(app: &TestApp, token: &str, event: &str, number: i32, holder: &str) -> String {
    let link = app
        .post(
            &format!("/api/events/{event}/tickets"),
            token,
            json!({ "number": number, "holderName": holder }),
        )
        .await;
    assert_eq!(link.status, StatusCode::CREATED, "{:?}", link.json());
    let url = link.json()["url"].as_str().unwrap().to_owned();
    let pass = app
        .request(
            Method::POST,
            "/api/ticket",
            None,
            Some(json!({ "token": url.split_once('#').unwrap().1 })),
        )
        .await
        .json();
    pass["qrText"].as_str().unwrap().to_owned()
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn an_authentic_ticket_shows_its_event_and_nothing_private(pool: PgPool) {
    let app = TestApp::with_free_tickets(pool, 30).await;
    let token = app.login("banda@exemplo.com").await;
    let event = app.create_event(&token, "Show da Banda").await;
    app.create_batch(&token, &event, 20).await;
    let vip = app
        .post(
            &format!("/api/events/{event}/categories"),
            &token,
            json!({ "name": "VIP", "color": "#d4a017", "priceCents": 5000 }),
        )
        .await
        .json()["id"]
        .as_str()
        .unwrap()
        .to_owned();
    let assigned = app
        .post(
            &format!("/api/categories/{vip}/ranges"),
            &token,
            json!({ "first": 1, "last": 10 }),
        )
        .await;
    assert_eq!(
        assigned.status,
        StatusCode::CREATED,
        "{:?}",
        assigned.json()
    );
    let qr = qr_of(&app, &token, &event, 7, "Maria Souza").await;

    let result = check(&app, &format!("  {qr}\n")).await;
    assert_eq!(result["verdict"], "valid");
    let ticket = &result["ticket"];
    assert_eq!(ticket["event"]["name"], "Show da Banda");
    assert_eq!(ticket["event"]["venue"], "Bar do Zé");
    assert_eq!(ticket["event"]["startsAt"], "2026-11-20T22:00:00-03:00");
    assert_eq!(ticket["number"], 7);
    assert_eq!(ticket["numberLabel"], "0007");
    assert_eq!(ticket["category"]["name"], "VIP");
    assert_eq!(ticket["organization"]["name"], "banda@exemplo.com");
    // Nobody learns who holds it, nor whether it entered.
    let raw = result.to_string();
    assert!(!raw.contains("Maria"), "{raw}");
    assert!(!raw.contains("entered"), "{raw}");
    assert!(!raw.contains(&event), "{raw}");

    // Tampered, foreign or plain text: not one of ours, and no event named.
    let mut tampered = qr.clone().into_bytes();
    let last = tampered.len() - 2;
    tampered[last] = if tampered[last] == b'A' { b'B' } else { b'A' };
    for text in [
        String::from_utf8(tampered).unwrap(),
        "https://exemplo.com".to_owned(),
        String::new(),
        "X".repeat(5_000),
    ] {
        let result = check(&app, &text).await;
        assert_eq!(result["verdict"], "not_ours", "{text}");
        assert_eq!(result["ticket"], Value::Null);
    }

    // A canceled number, then the event's changes, most important first.
    let voided = app
        .post(
            &format!("/api/events/{event}/voids"),
            &token,
            json!({ "first": 7, "last": 7, "reason": "lost", "note": null }),
        )
        .await;
    assert_eq!(voided.status, StatusCode::CREATED, "{:?}", voided.json());
    assert_eq!(check(&app, &qr).await["verdict"], "ticket_canceled");
    let other = qr_of(&app, &token, &event, 12, "Pedro").await;
    let other_result = check(&app, &other).await;
    assert_eq!(other_result["verdict"], "valid");
    assert_eq!(other_result["ticket"]["category"], Value::Null);

    let postponed = app
        .post(
            &format!("/api/events/{event}/postpone"),
            &token,
            json!({ "startsAt": "2026-12-04T22:00:00-03:00", "endsAt": "2026-12-05T03:00:00-03:00", "reason": "Chuva" }),
        )
        .await;
    assert_eq!(postponed.status, StatusCode::OK, "{:?}", postponed.json());
    let moved = check(&app, &other).await;
    assert_eq!(moved["verdict"], "event_postponed");
    assert_eq!(
        moved["ticket"]["event"]["startsAt"],
        "2026-12-04T22:00:00-03:00"
    );
    assert_eq!(
        moved["ticket"]["event"]["change"]["postponedFromStartsAt"],
        "2026-11-20T22:00:00-03:00"
    );
    let canceled = app
        .post(
            &format!("/api/events/{event}/cancel"),
            &token,
            json!({ "reason": "Problema no local" }),
        )
        .await;
    assert_eq!(canceled.status, StatusCode::OK, "{:?}", canceled.json());
    let result = check(&app, &other).await;
    assert_eq!(result["verdict"], "event_canceled");
    assert_eq!(
        result["ticket"]["event"]["change"]["cancelReason"],
        "Problema no local"
    );
    let undone = app
        .post(
            &format!("/api/events/{event}/cancel/undo"),
            &token,
            json!({}),
        )
        .await;
    assert_eq!(undone.status, StatusCode::OK, "{:?}", undone.json());

    // Once it is over, it says so.
    sqlx::query(
        "update events set starts_at = now() - interval '2 days', ends_at = now() - interval '1 day' where id = $1::uuid",
    )
    .bind(&event)
    .execute(&app.state.pool)
    .await
    .unwrap();
    assert_eq!(check(&app, &other).await["verdict"], "event_over");
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn the_organizer_may_turn_the_check_off(pool: PgPool) {
    let app = TestApp::with_free_tickets(pool, 30).await;
    let token = app.login("banda@exemplo.com").await;
    let event = app.create_event(&token, "Festa fechada").await;
    app.create_batch(&token, &event, 10).await;
    let qr = qr_of(&app, &token, &event, 3, "Ana").await;
    let uri = format!("/api/events/{event}/verify-settings");
    assert_eq!(
        app.get(&uri, &token).await.json(),
        json!({ "publicVerify": true })
    );

    let off = app
        .put(&uri, &token, json!({ "publicVerify": false }))
        .await;
    assert_eq!(off.status, StatusCode::OK);
    assert_eq!(app.get(&uri, &token).await.json()["publicVerify"], false);
    let result = check(&app, &qr).await;
    assert_eq!(result, json!({ "verdict": "private", "ticket": null }));

    // Another organization never sees the switch; the door's person cannot flip it.
    let other = app.login("outra@exemplo.com").await;
    assert_eq!(app.get(&uri, &other).await.status, StatusCode::NOT_FOUND);
    let added = app
        .post(
            &format!("/api/events/{event}/team"),
            &token,
            json!({ "email": "porta@exemplo.com", "name": null, "areas": ["door"] }),
        )
        .await;
    assert_eq!(added.status, StatusCode::CREATED);
    let door = app.login("porta@exemplo.com").await;
    let refused = app.put(&uri, &door, json!({ "publicVerify": true })).await;
    assert_eq!(refused.error_code(), "not_your_area");
    let added = app
        .post(
            &format!("/api/events/{event}/team"),
            &token,
            json!({ "email": "entrega@exemplo.com", "name": null, "areas": ["delivery"] }),
        )
        .await;
    assert_eq!(added.status, StatusCode::CREATED);
    let delivery = app.login("entrega@exemplo.com").await;
    let on = app
        .put(&uri, &delivery, json!({ "publicVerify": true }))
        .await;
    assert_eq!(on.status, StatusCode::OK);
    assert_eq!(check(&app, &qr).await["verdict"], "valid");
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn one_address_checks_only_a_few_tickets(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let mut statuses = Vec::new();
    for _ in 0..31 {
        let request = Request::builder()
            .method(Method::POST)
            .uri("/api/verify")
            .header("content-type", "application/json")
            .header("x-forwarded-for", "203.0.113.9")
            .body(Body::from(r#"{"text":"nada"}"#))
            .unwrap();
        statuses.push(app.send(request).await.status);
    }
    assert!(
        statuses[..30]
            .iter()
            .all(|status| *status == StatusCode::OK)
    );
    assert_eq!(statuses[30], StatusCode::TOO_MANY_REQUESTS);
}
