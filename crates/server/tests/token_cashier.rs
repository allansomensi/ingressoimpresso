//! The token cashier (ADR 0098): sales with how they were paid, the shift and its closing.

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
use uuid::Uuid;

const SATURDAY: (&str, &str) = ("2026-06-13T21:00:00Z", "2026-06-14T03:00:00Z");

/// A token event with 20 paid fichas: 1–10 are beer (R$ 8), the rest cost the event's R$ 5.
async fn token_event(app: &TestApp, token: &str) -> String {
    let admin = app.login(ADMIN).await;
    let event = app
        .post(
            "/api/events",
            token,
            json!({ "name": "Arraiá", "startsAt": SATURDAY.0, "endsAt": SATURDAY.1,
                    "kind": "tokens", "ticketPriceCents": 500 }),
        )
        .await
        .json()["id"]
        .as_str()
        .unwrap()
        .to_owned();
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
    let beer = app
        .post(
            &format!("/api/events/{event}/categories"),
            token,
            json!({ "name": "Cerveja", "color": "#d4a017", "priceCents": 800 }),
        )
        .await
        .json()["id"]
        .as_str()
        .unwrap()
        .to_owned();
    let reply = app
        .post(
            &format!("/api/categories/{beer}/ranges"),
            token,
            json!({ "first": 1, "last": 10 }),
        )
        .await;
    assert!(reply.status.is_success(), "{:?}", reply.json());
    event
}

async fn link(app: &TestApp, token: &str, seller: &str) -> String {
    let reply = app
        .post(&format!("/api/sellers/{seller}/link"), token, json!({}))
        .await;
    let url = reply.json()["url"].as_str().unwrap().to_owned();
    url.split_once('#').unwrap().1.to_owned()
}

async fn sell(app: &TestApp, secret: &str, first: i32, last: i32, method: &str) -> Value {
    let reply = app
        .request(
            Method::POST,
            "/api/seller/sync",
            None,
            Some(
                json!({ "token": secret, "ops": [{ "id": Uuid::new_v4(), "op": {
                "kind": "mark", "ranges": [{ "first": first, "last": last }], "buyerName": null,
                "buyerPhone": null, "edit": false, "reservationId": null, "method": method } }] }),
            ),
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK, "{:?}", reply.json());
    let body = reply.json();
    assert_eq!(body["results"][0]["outcome"], "applied");
    body["view"].clone()
}

async fn close(app: &TestApp, secret: &str, counted: Option<i64>) -> Reply {
    app.request(
        Method::POST,
        "/api/seller/cashier/close",
        None,
        Some(json!({ "token": secret, "countedCents": counted, "note": " troco de R$ 50 " })),
    )
    .await
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn a_cashier_sells_and_closes_the_drawer(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("barraca@exemplo.com").await;
    let event = token_event(&app, &token).await;
    let cashier = app
        .post(
            &format!("/api/events/{event}/sellers"),
            &token,
            json!({ "name": "Caixa 1", "cashier": true }),
        )
        .await
        .json();
    assert_eq!(cashier["cashier"], true);
    let seller = cashier["id"].as_str().unwrap().to_owned();
    app.post(
        &format!("/api/sellers/{seller}/ranges"),
        &token,
        json!({ "first": 1, "last": 20 }),
    )
    .await;
    let secret = link(&app, &token, &seller).await;

    // Nothing sold: nothing to close.
    assert_eq!(
        close(&app, &secret, Some(0)).await.error_code(),
        "empty_shift"
    );

    // Two beers in cash, one by Pix, two fichas of R$ 5 by card.
    sell(&app, &secret, 1, 2, "cash").await;
    sell(&app, &secret, 3, 3, "pix").await;
    let view = sell(&app, &secret, 11, 12, "card").await;
    let shift = &view["cashier"]["open"];
    assert_eq!(shift["tokens"], 5);
    assert_eq!(shift["cashCents"], 1600);
    assert_eq!(shift["pixCents"], 800);
    assert_eq!(shift["cardCents"], 1000);
    assert_eq!(shift["otherCents"], 0);
    assert_eq!(shift["since"], Value::Null);
    let sale = view["sales"]
        .as_array()
        .unwrap()
        .iter()
        .find(|sale| sale["number"] == 3)
        .unwrap();
    assert_eq!(sale["method"], "pix");
    assert_eq!(sale["closed"], false);

    // The drawer had R$ 15: R$ 1 missing.
    let reply = close(&app, &secret, Some(1500)).await;
    assert_eq!(reply.status, StatusCode::OK);
    let view = reply.json();
    assert_eq!(view["cashier"]["open"]["tokens"], 0);
    assert_ne!(view["cashier"]["open"]["since"], Value::Null);
    let closing = &view["cashier"]["closings"][0];
    assert_eq!(closing["tokens"], 5);
    assert_eq!(closing["cashCents"], 1600);
    assert_eq!(closing["countedCents"], 1500);
    assert_eq!(closing["differenceCents"], -100);
    assert_eq!(closing["note"], "troco de R$ 50");
    assert_eq!(closing["byOrganizer"], false);
    assert!(
        view["sales"]
            .as_array()
            .unwrap()
            .iter()
            .all(|sale| sale["closed"] == true)
    );

    // A closed sale stays: the cashier cannot undo it, the organizer can.
    let reply = app
        .request(
            Method::POST,
            "/api/seller/sync",
            None,
            Some(json!({ "token": secret, "ops": [{ "id": Uuid::new_v4(),
                "op": { "kind": "unmark", "number": 1 } }] })),
        )
        .await;
    let result = &reply.json()["results"][0];
    assert_eq!(result["outcome"], "rejected");
    assert_eq!(result["problems"][0]["reason"], "shift_closed");

    // A second shift, closed by the organizer on the panel without counting.
    sell(&app, &secret, 4, 4, "cash").await;
    let reply = app
        .post(
            &format!("/api/sellers/{seller}/cashier/close"),
            &token,
            json!({ "countedCents": null, "note": null }),
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK);
    let report = reply.json();
    assert_eq!(report["closings"].as_array().unwrap().len(), 2);
    assert_eq!(report["closings"][0]["byOrganizer"], true);
    assert_eq!(report["closings"][0]["differenceCents"], Value::Null);
    let all = app
        .get(&format!("/api/events/{event}/cashiers"), &token)
        .await
        .json();
    assert_eq!(all.as_array().unwrap().len(), 1);
    assert_eq!(all[0]["name"], "Caixa 1");
    assert_eq!(all[0]["closings"][1]["cashCents"], 1600);
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn only_token_events_have_cashiers(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("banda@exemplo.com").await;
    let event = app.create_event(&token, "Show").await;
    let reply = app
        .post(
            &format!("/api/events/{event}/sellers"),
            &token,
            json!({ "name": "Caixa", "cashier": true }),
        )
        .await;
    assert_eq!(reply.error_code(), "cashier_tickets");
    let seller = app
        .post(
            &format!("/api/events/{event}/sellers"),
            &token,
            json!({ "name": "Ana" }),
        )
        .await
        .json();
    assert_eq!(seller["cashier"], false);
    let id = seller["id"].as_str().unwrap();
    let reply = app
        .post(
            &format!("/api/sellers/{id}/cashier/close"),
            &token,
            json!({ "countedCents": 0, "note": null }),
        )
        .await;
    assert_eq!(reply.error_code(), "not_cashier");
    // Someone else's seller does not exist.
    let other = app.login("outra@exemplo.com").await;
    let reply = app
        .post(
            &format!("/api/sellers/{id}/cashier/close"),
            &other,
            json!({ "countedCents": 0, "note": null }),
        )
        .await;
    assert_eq!(reply.status, StatusCode::NOT_FOUND);
}
