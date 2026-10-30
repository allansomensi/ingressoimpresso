//! Events of digital tickets only (ADR 0123): tickets issued by category for people, with their
//! WhatsApp and a note, all or nothing, and marked as sent.

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

async fn category(
    app: &TestApp,
    token: &str,
    event: &str,
    name: &str,
    first: i32,
    last: i32,
) -> String {
    let reply = app
        .post(
            &format!("/api/events/{event}/categories"),
            token,
            json!({ "name": name, "color": "#2563eb", "priceCents": null }),
        )
        .await;
    assert_eq!(reply.status, StatusCode::CREATED);
    let id = reply.json()["id"].as_str().unwrap().to_owned();
    let range = app
        .post(
            &format!("/api/categories/{id}/ranges"),
            token,
            json!({ "first": first, "last": last }),
        )
        .await;
    assert_eq!(range.status, StatusCode::CREATED);
    id
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn the_event_remembers_it_is_digital_only(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("festa@exemplo.com").await;
    let event = app.create_event(&token, "Festa do Campo").await;
    let dto = app
        .get(&format!("/api/events/{event}"), &token)
        .await
        .json();
    assert_eq!(dto["digitalOnly"], false);
    let mut body = dto.clone();
    body["digitalOnly"] = json!(true);
    let updated = app.put(&format!("/api/events/{event}"), &token, body).await;
    assert_eq!(updated.status, StatusCode::OK, "{:?}", updated.json());
    assert_eq!(updated.json()["digitalOnly"], true);
    // A body without the field leaves it as it is.
    let mut body = dto;
    body.as_object_mut().unwrap().remove("digitalOnly");
    let kept = app.put(&format!("/api/events/{event}"), &token, body).await;
    assert_eq!(kept.json()["digitalOnly"], true);
    let copy = app
        .post(&format!("/api/events/{event}/duplicate"), &token, json!({}))
        .await;
    assert_eq!(copy.json()["digitalOnly"], true);
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn tickets_go_by_category_to_people(pool: PgPool) {
    let app = TestApp::with_free_tickets(pool, 30).await;
    let token = app.login("festa@exemplo.com").await;
    let event = app.create_event(&token, "Festa do Campo").await;
    app.create_batch(&token, &event, 20).await;
    let janta = category(&app, &token, &event, "Sábado com janta", 1, 5).await;
    let simples = category(&app, &token, &event, "Sábado sem janta", 6, 15).await;

    let list = app
        .get(&format!("/api/events/{event}/tickets"), &token)
        .await
        .json();
    let stock = list["stock"].as_array().unwrap();
    assert_eq!(stock.len(), 3);
    assert_eq!(
        stock[0],
        json!({ "categoryId": janta, "free": 5, "nextNumber": 1 })
    );
    assert_eq!(
        stock[1],
        json!({ "categoryId": simples, "free": 10, "nextNumber": 6 })
    );
    assert_eq!(
        stock[2],
        json!({ "categoryId": null, "free": 5, "nextNumber": 16 })
    );

    let issued = app
        .post(
            &format!("/api/events/{event}/tickets/issue"),
            &token,
            json!({ "orders": [
                { "categoryId": janta, "quantity": 3, "holderName": "Ana Lima",
                  "holderPhone": "(11) 99999-0000", "note": "Pix conferido" },
                { "categoryId": simples, "quantity": 1, "holderName": "Bruno", "holderPhone": null, "note": null },
                { "categoryId": janta, "quantity": 1, "holderName": "Carla", "holderPhone": null, "note": null },
            ] }),
        )
        .await;
    assert_eq!(issued.status, StatusCode::CREATED, "{:?}", issued.json());
    let orders = issued.json()["orders"].clone();
    let numbers = |index: usize| -> Vec<i64> {
        orders[index]["links"]
            .as_array()
            .unwrap()
            .iter()
            .map(|link| link["number"].as_i64().unwrap())
            .collect()
    };
    assert_eq!(numbers(0), [1, 2, 3]);
    assert_eq!(numbers(1), [6]);
    assert_eq!(numbers(2), [4]);
    let first = &orders[0]["links"][0];
    assert_eq!(first["holderName"], "Ana Lima");
    assert_eq!(first["holderPhone"], "5511999990000");
    assert_eq!(first["note"], "Pix conferido");
    assert_eq!(first["categoryId"], janta.as_str());
    assert_eq!(first["sentAt"], Value::Null);

    // All or nothing: two more with dinner do not fit, and nothing is made.
    let short = app
        .post(
            &format!("/api/events/{event}/tickets/issue"),
            &token,
            json!({ "orders": [
                { "categoryId": simples, "quantity": 1, "holderName": null, "holderPhone": null, "note": null },
                { "categoryId": janta, "quantity": 2, "holderName": null, "holderPhone": null, "note": null },
            ] }),
        )
        .await;
    assert_eq!(short.error_code(), "not_enough_tickets");
    let list = app
        .get(&format!("/api/events/{event}/tickets"), &token)
        .await
        .json();
    assert_eq!(list["links"].as_array().unwrap().len(), 5);
    assert_eq!(list["stock"][0]["free"], 1);

    // A revoked number is never picked again: its QR may still be on someone's phone.
    let carla = orders[2]["links"][0]["id"].as_str().unwrap().to_owned();
    app.post(
        &format!("/api/ticket-links/{carla}/revoke"),
        &token,
        json!({}),
    )
    .await;
    let list = app
        .get(&format!("/api/events/{event}/tickets"), &token)
        .await
        .json();
    assert_eq!(
        list["stock"][0],
        json!({ "categoryId": janta, "free": 1, "nextNumber": 5 })
    );

    // Bad input.
    for (body, code) in [
        (json!({ "orders": [] }), "invalid_ticket_quantity"),
        (
            json!({ "orders": [{ "categoryId": null, "quantity": 51, "holderName": null, "holderPhone": null, "note": null }] }),
            "invalid_ticket_quantity",
        ),
        (
            json!({ "orders": [{ "categoryId": null, "quantity": 1, "holderName": null, "holderPhone": "12", "note": null }] }),
            "invalid_whatsapp",
        ),
    ] {
        let reply = app
            .post(&format!("/api/events/{event}/tickets/issue"), &token, body)
            .await;
        assert_eq!(reply.error_code(), code);
    }

    // Sent from the panel; phone and note edited, the name alone keeps them.
    let ana = orders[0]["links"][0]["id"].as_str().unwrap().to_owned();
    let sent = app
        .post(
            &format!("/api/events/{event}/tickets/sent"),
            &token,
            json!({ "ids": [ana] }),
        )
        .await;
    assert_eq!(sent.status, StatusCode::NO_CONTENT);
    let renamed = app
        .put(
            &format!("/api/ticket-links/{ana}"),
            &token,
            json!({ "holderName": "Ana L." }),
        )
        .await
        .json();
    assert_eq!(renamed["holderPhone"], "5511999990000");
    assert!(renamed["sentAt"].is_string());
    let cleared = app
        .put(
            &format!("/api/ticket-links/{ana}"),
            &token,
            json!({ "holderName": "Ana L.", "holderPhone": "", "note": "Pagou em dinheiro" }),
        )
        .await
        .json();
    assert_eq!(cleared["holderPhone"], Value::Null);
    assert_eq!(cleared["note"], "Pagou em dinheiro");

    // Another organization sees none of it.
    let other = app.login("outra@exemplo.com").await;
    let reply = app
        .post(
            &format!("/api/events/{event}/tickets/sent"),
            &other,
            json!({ "ids": [ana] }),
        )
        .await;
    assert_eq!(reply.status, StatusCode::NOT_FOUND);
}
