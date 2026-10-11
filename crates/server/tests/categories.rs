//! Ticket categories (ADR 0056) and tables (ADR 0057).

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing,
    reason = "test helpers fail loudly by design"
)]

mod common;

use axum::http::{Method, StatusCode};
use common::{ADMIN, TestApp};
use serde_json::{Value, json};
use sqlx::PgPool;

/// An event at R$ 30 with 20 paid tickets; Maria holds 1–10.
async fn setup(app: &TestApp, token: &str) -> (String, String) {
    let admin = app.login(ADMIN).await;
    let event = app.create_event(token, "Formatura").await;
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
    let seller = app
        .post(
            &format!("/api/events/{event}/sellers"),
            token,
            json!({ "name": "Maria" }),
        )
        .await
        .json();
    let seller = seller["id"].as_str().unwrap().to_owned();
    app.post(
        &format!("/api/sellers/{seller}/ranges"),
        token,
        json!({ "first": 1, "last": 10 }),
    )
    .await;
    (event, seller)
}

async fn category(
    app: &TestApp,
    token: &str,
    event: &str,
    name: &str,
    color: &str,
    price: Value,
) -> String {
    let reply = app
        .post(
            &format!("/api/events/{event}/categories"),
            token,
            json!({ "name": name, "color": color, "priceCents": price }),
        )
        .await;
    assert_eq!(
        reply.status,
        StatusCode::CREATED,
        "{}",
        String::from_utf8_lossy(&reply.bytes)
    );
    reply.json()["id"].as_str().unwrap().to_owned()
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn categories_price_the_settlement(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("formatura@exemplo.com").await;
    let (event, seller) = setup(&app, &token).await;
    let inteira = category(&app, &token, &event, "Inteira", "#2563eb", Value::Null).await;
    let meia = category(&app, &token, &event, "Meia", "#e11d48", json!(1500)).await;
    let cortesia = category(&app, &token, &event, "Cortesia", "#16a34a", json!(0)).await;
    for (id, first, last) in [(&inteira, 1, 5), (&meia, 6, 8), (&cortesia, 9, 12)] {
        let reply = app
            .post(
                &format!("/api/categories/{id}/ranges"),
                &token,
                json!({ "first": first, "last": last }),
            )
            .await;
        assert_eq!(reply.status, StatusCode::CREATED);
    }

    // Refusals: overlapping numbers, a repeated name, a bad colour.
    let reply = app
        .post(
            &format!("/api/categories/{meia}/ranges"),
            &token,
            json!({ "first": 12, "last": 14 }),
        )
        .await;
    assert_eq!(reply.error_code(), "category_overlap");
    let reply = app
        .post(
            &format!("/api/events/{event}/categories"),
            &token,
            json!({ "name": "Meia", "color": "#000000", "priceCents": null }),
        )
        .await;
    assert_eq!(reply.error_code(), "category_exists");
    let reply = app
        .post(
            &format!("/api/events/{event}/categories"),
            &token,
            json!({ "name": "VIP", "color": "dourado", "priceCents": null }),
        )
        .await;
    assert_eq!(reply.error_code(), "invalid_color");

    let list = app
        .get(&format!("/api/events/{event}/categories"), &token)
        .await
        .json();
    assert_eq!(list.as_array().unwrap().len(), 3);
    assert_eq!(list[1]["ranges"][0]["first"], 6);

    // Maria answers for 5 inteiras (R$ 30), 3 meias (R$ 15) and 2 cortesias (R$ 0).
    let report = app
        .get(&format!("/api/events/{event}/report"), &token)
        .await
        .json();
    assert_eq!(report["sellers"][0]["amountDueCents"], 5 * 3000 + 3 * 1500);
    let categories = report["categories"].as_array().unwrap();
    assert_eq!(categories[0]["name"], "Inteira");
    assert_eq!(categories[0]["tickets"], 5);
    assert_eq!(categories[0]["amountCents"], 5 * 3000);
    assert_eq!(categories[2]["tickets"], 4);
    assert_eq!(categories[2]["amountCents"], 0);
    // Numbers 13–20 have no category: their own line, at the event's price.
    assert!(categories[3]["categoryId"].is_null());
    assert_eq!(categories[3]["tickets"], 8);

    // An inteira returned unsold leaves the account.
    app.post(
        &format!("/api/sellers/{seller}/returns"),
        &token,
        json!({ "ranges": [{ "first": 1, "last": 1 }], "reason": "unsold", "note": null }),
    )
    .await;
    let report = app
        .get(&format!("/api/events/{event}/report"), &token)
        .await
        .json();
    assert_eq!(report["sellers"][0]["amountDueCents"], 4 * 3000 + 3 * 1500);

    // The seller's page shows the same lines.
    let link = app
        .post(&format!("/api/sellers/{seller}/link"), &token, json!({}))
        .await
        .json();
    let secret = link["url"]
        .as_str()
        .unwrap()
        .split_once('#')
        .unwrap()
        .1
        .to_owned();
    let view = app
        .request(
            Method::POST,
            "/api/seller",
            None,
            Some(json!({ "token": secret })),
        )
        .await
        .json();
    assert_eq!(view["summary"]["amountDueCents"], 4 * 3000 + 3 * 1500);
    let lines = view["summary"]["dueLines"].as_array().unwrap();
    assert_eq!(lines.len(), 3);
    assert_eq!(lines[1]["category"], "Meia");
    assert_eq!(lines[1]["tickets"], 3);
    assert_eq!(lines[1]["priceCents"], 1500);
    assert_eq!(view["categories"][2]["priceCents"], 0);

    // Removing a category frees its numbers; a duplicate keeps the categories.
    let copy = app
        .post(&format!("/api/events/{event}/duplicate"), &token, json!({}))
        .await
        .json();
    let copied = app
        .get(
            &format!("/api/events/{}/categories", copy["id"].as_str().unwrap()),
            &token,
        )
        .await
        .json();
    assert_eq!(copied[1]["ranges"][0]["last"], 8);
    let reply = app
        .delete(&format!("/api/categories/{cortesia}"), &token, None)
        .await;
    assert_eq!(reply.status, StatusCode::NO_CONTENT);
    let report = app
        .get(&format!("/api/events/{event}/report"), &token)
        .await
        .json();
    assert_eq!(report["sellers"][0]["amountDueCents"], 6 * 3000 + 3 * 1500);
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn tables_seat_tickets(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("formatura@exemplo.com").await;
    let (event, _) = setup(&app, &token).await;
    let reply = app
        .post(
            &format!("/api/events/{event}/tables/bulk"),
            &token,
            json!({ "count": 3, "seats": 4, "shape": "round", "prefix": "Mesa" }),
        )
        .await;
    assert_eq!(reply.status, StatusCode::CREATED);
    let tables = app
        .get(&format!("/api/events/{event}/tables"), &token)
        .await
        .json();
    let names: Vec<&str> = tables
        .as_array()
        .unwrap()
        .iter()
        .map(|t| t["name"].as_str().unwrap())
        .collect();
    assert_eq!(names, ["Mesa 1", "Mesa 2", "Mesa 3"]);
    let (one, two) = (
        tables[0]["id"].as_str().unwrap().to_owned(),
        tables[1]["id"].as_str().unwrap().to_owned(),
    );
    let seat = |table: String, first: i32, last: i32, move_seated: bool| {
        let app = &app;
        let token = token.clone();
        async move {
            app.post(
                &format!("/api/tables/{table}/tickets"),
                &token,
                json!({ "ranges": [{ "first": first, "last": last }], "moveSeated": move_seated }),
            )
            .await
        }
    };

    let guests = seat(one.clone(), 1, 3, false).await.json();
    assert_eq!(
        guests,
        json!([{ "number": 1, "seat": 1 }, { "number": 2, "seat": 2 }, { "number": 3, "seat": 3 }])
    );
    // Seating again changes nothing; 3 is at table 1, so table 2 refuses it unless moved.
    assert_eq!(
        seat(one.clone(), 2, 3, false)
            .await
            .json()
            .as_array()
            .unwrap()
            .len(),
        3
    );
    assert_eq!(
        seat(two.clone(), 3, 5, false).await.error_code(),
        "already_seated"
    );
    let guests = seat(two.clone(), 3, 5, true).await.json();
    assert_eq!(guests[0], json!({ "number": 3, "seat": 1 }));
    // Table 1 has seat 3 free again; two more do not fit.
    assert_eq!(
        seat(one.clone(), 6, 8, false).await.error_code(),
        "table_full"
    );
    let guests = seat(one.clone(), 6, 6, false).await.json();
    assert_eq!(guests[2], json!({ "number": 6, "seat": 3 }));

    // Fewer seats only when the last ones are empty.
    let reply = app
        .put(
            &format!("/api/tables/{one}"),
            &token,
            json!({ "name": "Mesa dos pais", "seats": 2, "shape": "rect", "x": null, "y": null }),
        )
        .await;
    assert_eq!(reply.error_code(), "seats_taken");
    app.post(
        &format!("/api/tables/{one}/tickets/remove"),
        &token,
        json!({ "number": 6 }),
    )
    .await;
    let reply = app
        .put(
            &format!("/api/tables/{one}"),
            &token,
            json!({ "name": "Mesa dos pais", "seats": 2, "shape": "rect", "x": 0.2, "y": 0.3 }),
        )
        .await;
    assert_eq!(reply.status, StatusCode::NO_CONTENT);
    let reply = app
        .put(
            &format!("/api/events/{event}/tables/layout"),
            &token,
            json!({ "positions": [{ "id": two, "x": 1.7, "y": 0.4 }] }),
        )
        .await;
    assert_eq!(reply.status, StatusCode::NO_CONTENT);
    let tables = app
        .get(&format!("/api/events/{event}/tables"), &token)
        .await
        .json();
    let by_id = |id: &str| {
        tables
            .as_array()
            .unwrap()
            .iter()
            .find(|table| table["id"] == id)
            .unwrap()
            .clone()
    };
    assert_eq!(by_id(&one)["name"], "Mesa dos pais");
    assert_eq!(by_id(&one)["shape"], "rect");
    assert_eq!(by_id(&two)["x"], 1.0);

    // A digital ticket shows its table.
    let link = app
        .post(
            &format!("/api/events/{event}/tickets"),
            &token,
            json!({ "number": 4, "holderName": null }),
        )
        .await;
    assert_eq!(
        link.status,
        StatusCode::CREATED,
        "{}",
        String::from_utf8_lossy(&link.bytes)
    );
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
    assert_eq!(pass["seat"], "Mesa 2 · Lugar 2");

    // A duplicate keeps the tables, empty; another organization sees nothing.
    let copy = app
        .post(&format!("/api/events/{event}/duplicate"), &token, json!({}))
        .await
        .json();
    let copied = app
        .get(
            &format!("/api/events/{}/tables", copy["id"].as_str().unwrap()),
            &token,
        )
        .await
        .json();
    assert_eq!(copied.as_array().unwrap().len(), 3);
    assert!(
        copied
            .as_array()
            .unwrap()
            .iter()
            .all(|t| t["guests"] == json!([]))
    );
    let stranger = app.login("outra@exemplo.com").await;
    assert_eq!(
        app.get(&format!("/api/events/{event}/tables"), &stranger)
            .await
            .status,
        StatusCode::NOT_FOUND
    );
    assert_eq!(seat_as(&app, &stranger, &one).await, StatusCode::NOT_FOUND);
}

async fn seat_as(app: &TestApp, token: &str, table: &str) -> StatusCode {
    app.post(
        &format!("/api/tables/{table}/tickets"),
        token,
        json!({ "ranges": [{ "first": 9, "last": 9 }], "moveSeated": false }),
    )
    .await
    .status
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn the_team_seats_but_only_coordination_prices(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("formatura@exemplo.com").await;
    let (event, _) = setup(&app, &token).await;
    app.post(
        &format!("/api/events/{event}/team"),
        &token,
        json!({ "email": "ana@exemplo.com", "name": null, "areas": ["delivery"] }),
    )
    .await;
    let ana = app.login("ana@exemplo.com").await;
    let table = app
        .post(
            &format!("/api/events/{event}/tables"),
            &ana,
            json!({ "name": "Mesa 1", "seats": 8, "shape": "round", "x": null, "y": null }),
        )
        .await;
    assert_eq!(table.status, StatusCode::CREATED);
    assert_eq!(
        seat_as(&app, &ana, table.json()["id"].as_str().unwrap()).await,
        StatusCode::OK
    );
    let reply = app
        .post(
            &format!("/api/events/{event}/categories"),
            &ana,
            json!({ "name": "VIP", "color": "#eab308", "priceCents": 8000 }),
        )
        .await;
    assert_eq!(reply.error_code(), "not_your_area");
    assert_eq!(
        app.get(&format!("/api/events/{event}/categories"), &ana)
            .await
            .status,
        StatusCode::OK
    );
}
