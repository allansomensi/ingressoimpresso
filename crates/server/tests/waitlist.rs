//! The waiting list of a sold-out event (ADR 0124).

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing,
    reason = "test helpers fail loudly by design"
)]

mod common;

use axum::http::{Method, StatusCode};
use common::{Reply, TestApp};
use serde_json::{Value, json};
use sqlx::PgPool;

async fn join(app: &TestApp, slug: &str, body: Value) -> Reply {
    app.request(
        Method::POST,
        &format!("/api/public/events/{slug}/waitlist"),
        None,
        Some(body),
    )
    .await
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn sold_out_categories_take_names(pool: PgPool) {
    let app = TestApp::with_free_tickets(pool, 30).await;
    let token = app.login("festa@exemplo.com").await;
    let event = app.create_event(&token, "Festa do Campo").await;
    app.create_batch(&token, &event, 4).await;
    let mut ids = Vec::new();
    for (name, first, last) in [("Com janta", 1, 2), ("Sem janta", 3, 4)] {
        let id = app
            .post(
                &format!("/api/events/{event}/categories"),
                &token,
                json!({ "name": name, "color": "#2563eb", "priceCents": 5000 }),
            )
            .await
            .json()["id"]
            .as_str()
            .unwrap()
            .to_owned();
        app.post(
            &format!("/api/categories/{id}/ranges"),
            &token,
            json!({ "first": first, "last": last }),
        )
        .await;
        ids.push(id);
    }
    let reply = app
        .put(
            &format!("/api/events/{event}/public-page"),
            &token,
            json!({ "enabled": true, "slug": "festa-do-campo", "soldOut": false, "sellerIds": [] }),
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK);
    assert_eq!(reply.json()["waitlist"], true);
    let person = |category: &str, phone: &str| json!({ "categoryId": category, "name": "Ana Lima", "phone": phone, "quantity": 2 });

    // Nothing is sold out: the page sends people to buy, not to wait.
    let page = app
        .request(Method::GET, "/api/public/events/festa-do-campo", None, None)
        .await
        .json();
    assert_eq!(page["waitlist"], false);
    let early = join(&app, "festa-do-campo", person(&ids[0], "(11) 99999-0000")).await;
    assert_eq!(early.error_code(), "waitlist_not_sold_out");

    // "Com janta" sells out.
    app.post(
        &format!("/api/events/{event}/tickets/issue"),
        &token,
        json!({ "orders": [{ "categoryId": ids[0], "quantity": 2, "holderName": null, "holderPhone": null, "note": null }] }),
    )
    .await;
    let page = app
        .request(Method::GET, "/api/public/events/festa-do-campo", None, None)
        .await
        .json();
    assert_eq!(page["waitlist"], true);
    assert_eq!(page["categories"][0]["soldOut"], true);
    assert_eq!(page["categories"][0]["id"], ids[0].as_str());

    let first = join(&app, "festa-do-campo", person(&ids[0], "(11) 99999-0000")).await;
    assert_eq!(first.status, StatusCode::CREATED);
    assert_eq!(first.json()["position"], 1);
    let second = join(&app, "festa-do-campo", person(&ids[0], "(21) 98888-7777")).await;
    assert_eq!(second.json()["position"], 2);
    // The same WhatsApp again updates its line and keeps its place.
    let again = join(
        &app,
        "festa-do-campo",
        json!({ "categoryId": ids[0], "name": "Ana L.", "phone": "11 99999-0000", "quantity": 3 }),
    )
    .await;
    assert_eq!(again.json()["position"], 1);
    // A category with tickets left, a bad phone, a robot.
    assert_eq!(
        join(&app, "festa-do-campo", person(&ids[1], "(11) 97777-6666"))
            .await
            .error_code(),
        "waitlist_not_sold_out"
    );
    assert_eq!(
        join(&app, "festa-do-campo", person(&ids[0], "123"))
            .await
            .error_code(),
        "invalid_whatsapp"
    );
    let robot = join(
        &app,
        "festa-do-campo",
        json!({ "categoryId": ids[0], "name": "x", "phone": "(11) 96666-5555", "quantity": 1, "website": "http://spam" }),
    )
    .await;
    assert_eq!(robot.status, StatusCode::CREATED);

    let list = app
        .get(&format!("/api/events/{event}/waitlist"), &token)
        .await
        .json();
    assert_eq!(list["open"], true);
    let entries = list["entries"].as_array().unwrap();
    assert_eq!(entries.len(), 2);
    assert_eq!(entries[0]["name"], "Ana L.");
    assert_eq!(entries[0]["phone"], "5511999990000");
    assert_eq!(entries[0]["quantity"], 3);

    // Taken care of: it goes to the end, and the next one is first.
    let id = entries[0]["id"].as_str().unwrap().to_owned();
    let done = app
        .put(
            &format!("/api/waitlist-entries/{id}"),
            &token,
            json!({ "done": true }),
        )
        .await;
    assert_eq!(done.status, StatusCode::NO_CONTENT);
    let list = app
        .get(&format!("/api/events/{event}/waitlist"), &token)
        .await
        .json();
    assert_eq!(list["entries"][0]["phone"], "5521988887777");
    assert!(list["entries"][1]["doneAt"].is_string());
    let removed = app
        .request(
            Method::DELETE,
            &format!("/api/waitlist-entries/{id}"),
            Some(&token),
            None,
        )
        .await;
    assert_eq!(removed.status, StatusCode::NO_CONTENT);

    // Another organization sees none of it.
    let other = app.login("outra@exemplo.com").await;
    let reply = app
        .get(&format!("/api/events/{event}/waitlist"), &other)
        .await;
    assert_eq!(reply.status, StatusCode::NOT_FOUND);

    // Turned off, the page takes no names.
    app.put(
        &format!("/api/events/{event}/public-page"),
        &token,
        json!({ "enabled": true, "slug": "festa-do-campo", "soldOut": false, "sellerIds": [], "waitlist": false }),
    )
    .await;
    assert_eq!(
        join(&app, "festa-do-campo", person(&ids[0], "(31) 95555-4444"))
            .await
            .error_code(),
        "waitlist_closed"
    );
}
