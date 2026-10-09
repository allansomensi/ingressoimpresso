//! Prices, promotions, promo codes and credit (ADRs 0039, 0040).

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

const LAUNCH_TIERS: [(i32, i32); 4] = [(100, 15), (500, 10), (2_000, 7), (5_000, 5)];

fn tiers(list: &[(i32, i32)]) -> Value {
    json!(
        list.iter()
            .map(|(up_to, unit)| json!({ "upTo": up_to, "unitCents": unit }))
            .collect::<Vec<_>>()
    )
}

async fn quote(app: &TestApp, token: &str, event: &str, quantity: i32) -> Value {
    let reply = app
        .post(
            &format!("/api/events/{event}/batches/quote"),
            token,
            json!({ "quantity": quantity }),
        )
        .await;
    assert_eq!(
        reply.status,
        StatusCode::OK,
        "{}",
        String::from_utf8_lossy(&reply.bytes)
    );
    reply.json()
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn admins_version_the_price_table(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let admin = app.login(ADMIN).await;
    let token = app.login("banda@exemplo.com").await;
    let event = app.create_event(&token, "Show").await;
    assert_eq!(
        app.create_batch(&token, &event, 100).await["priceCents"],
        1_500
    );

    // New prices now, announced to everyone.
    let created = app
        .post(
            "/api/admin/prices",
            &admin,
            json!({
                "tiers": tiers(&[(100, 20), (5_000, 10)]),
                "minimumCents": 300,
                "freeTickets": 10,
                "note": "Reajuste",
                "announce": true,
                "announcementDisplay": "modal",
            }),
        )
        .await;
    assert_eq!(
        created.status,
        StatusCode::CREATED,
        "{}",
        String::from_utf8_lossy(&created.bytes)
    );
    let prices = created.json();
    assert_eq!(prices["current"]["minimumCents"], 300);
    assert_eq!(prices["history"].as_array().unwrap().len(), 2);
    let pricing = app
        .request(Method::GET, "/api/pricing", None, None)
        .await
        .json();
    assert_eq!(pricing["tiers"][0]["unitCents"], 20);
    assert_eq!(pricing["freeTickets"], 10);
    // The earlier batch keeps its price; a new one pays the new table.
    let batches = app
        .get(&format!("/api/events/{event}/batches"), &token)
        .await
        .json();
    assert_eq!(batches[0]["priceCents"], 1_500);
    // 10 free tickets now: 90 × 20.
    assert_eq!(
        app.create_batch(&token, &event, 100).await["priceCents"],
        1_800
    );
    let inbox = app.get("/api/inbox", &token).await.json();
    assert_eq!(
        inbox["announcements"][0]["title"],
        "Novos preços dos ingressos"
    );
    assert_eq!(inbox["announcements"][0]["display"], "modal");

    // Prices for later: announced, not in force, can be withdrawn.
    let later = app
        .post(
            "/api/admin/prices",
            &admin,
            json!({
                "tiers": tiers(&LAUNCH_TIERS),
                "minimumCents": 290,
                "freeTickets": 30,
                "effectiveAt": "2999-01-01T00:00:00Z",
                "note": null,
                "announce": false,
                "announcementDisplay": "notification",
            }),
        )
        .await
        .json();
    let upcoming = later["upcoming"]["id"].as_str().unwrap().to_owned();
    let platform = app
        .request(Method::GET, "/api/platform", None, None)
        .await
        .json();
    assert_eq!(platform["newPricesAt"], "2999-01-01T00:00:00Z");
    let pricing = app
        .request(Method::GET, "/api/pricing", None, None)
        .await
        .json();
    assert_eq!(pricing["tiers"][0]["unitCents"], 20);
    assert_eq!(pricing["upcoming"]["freeTickets"], 30);
    let current = later["current"]["id"].as_str().unwrap().to_owned();
    assert_eq!(
        app.delete(&format!("/api/admin/prices/{current}"), &admin, None)
            .await
            .error_code(),
        "prices_in_force"
    );
    let withdrawn = app
        .delete(&format!("/api/admin/prices/{upcoming}"), &admin, None)
        .await
        .json();
    assert_eq!(withdrawn["upcoming"], json!(null));

    // Bad tables are refused.
    let bad = app
        .post(
            "/api/admin/prices",
            &admin,
            json!({
                "tiers": tiers(&[(100, 10), (5_000, 20)]),
                "minimumCents": 0, "freeTickets": 0, "note": null,
                "announce": false, "announcementDisplay": "notification",
            }),
        )
        .await;
    assert_eq!(bad.error_code(), "invalid_prices");
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn promotions_discount_batches_while_they_run(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let admin = app.login(ADMIN).await;
    let token = app.login("banda@exemplo.com").await;
    let event = app.create_event(&token, "Show").await;
    let created = app
        .post(
            "/api/admin/promotions",
            &admin,
            json!({
                "name": "Semana do rock",
                "headline": "20% em todos os lotes",
                "discountPercent": 20,
                "startsAt": "2020-01-01T00:00:00Z",
                "endsAt": "2999-01-01T00:00:00Z",
                "active": true,
            }),
        )
        .await;
    assert_eq!(
        created.status,
        StatusCode::CREATED,
        "{}",
        String::from_utf8_lossy(&created.bytes)
    );
    let promotion = created.json();

    let quoted = quote(&app, &token, &event, 100).await;
    assert_eq!(quoted["listPriceCents"], 1_500);
    assert_eq!(quoted["discountCents"], 300);
    assert_eq!(quoted["totalCents"], 1_200);
    assert_eq!(quoted["promotion"]["discountPercent"], 20);
    let batch = app.create_batch(&token, &event, 100).await;
    assert_eq!(
        (batch["priceCents"].clone(), batch["discountCents"].clone()),
        (json!(1_200), json!(300))
    );
    let platform = app
        .request(Method::GET, "/api/platform", None, None)
        .await
        .json();
    assert_eq!(platform["promotion"]["name"], "Semana do rock");

    // Switched off, prices are back.
    let id = promotion["id"].as_str().unwrap();
    let mut body = json!({
        "name": "Semana do rock", "headline": null, "discountPercent": 20,
        "startsAt": "2020-01-01T00:00:00Z", "endsAt": "2999-01-01T00:00:00Z", "active": false,
    });
    let updated = app
        .put(&format!("/api/admin/promotions/{id}"), &admin, body.clone())
        .await
        .json();
    assert_eq!(updated["batches"], 1);
    assert_eq!(updated["discountCents"], 300);
    assert_eq!(quote(&app, &token, &event, 100).await["totalCents"], 1_500);
    body["endsAt"] = json!("2019-01-01T00:00:00Z");
    assert_eq!(
        app.put(&format!("/api/admin/promotions/{id}"), &admin, body)
            .await
            .error_code(),
        "invalid_dates"
    );
}

async fn create_code(app: &TestApp, admin: &str, body: Value) -> Value {
    let mut full = json!({
        "code": null, "creditCents": null, "freeTickets": null, "discountPercent": null,
        "description": null, "maxRedemptions": null, "newOrganizationsOnly": false,
        "startsAt": null, "expiresAt": null,
    });
    for (key, value) in body.as_object().unwrap() {
        full[key] = value.clone();
    }
    let reply = app.post("/api/admin/promo-codes", admin, full).await;
    assert_eq!(
        reply.status,
        StatusCode::CREATED,
        "{}",
        String::from_utf8_lossy(&reply.bytes)
    );
    reply.json()
}

async fn redeem(app: &TestApp, token: &str, code: &str) -> common::Reply {
    app.post("/api/account/redeem", token, json!({ "code": code }))
        .await
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn credit_codes_pay_batches_and_come_back_on_cancel(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let admin = app.login(ADMIN).await;
    let token = app.login("banda@exemplo.com").await;
    let event = app.create_event(&token, "Show").await;
    create_code(
        &app,
        &admin,
        json!({ "code": "rock-10", "kind": "credit", "creditCents": 1_000, "maxRedemptions": 1 }),
    )
    .await;

    let redeemed = redeem(&app, &token, " Rock-10 ").await;
    assert_eq!(
        redeemed.status,
        StatusCode::OK,
        "{}",
        String::from_utf8_lossy(&redeemed.bytes)
    );
    assert_eq!(redeemed.json()["creditCents"], 1_000);
    assert_eq!(
        redeem(&app, &token, "ROCK-10").await.error_code(),
        "promo_code_already_redeemed"
    );
    let other = app.login("outra@exemplo.com").await;
    assert_eq!(
        redeem(&app, &other, "ROCK-10").await.error_code(),
        "promo_code_exhausted"
    );
    assert_eq!(
        redeem(&app, &other, "NOPE").await.error_code(),
        "promo_code_invalid"
    );
    assert_eq!(
        app.get("/api/account", &token).await.json()["creditCents"],
        1_000
    );

    // 100 tickets cost 1500: 1000 of credit, 500 to pay.
    let batch = app.create_batch(&token, &event, 100).await;
    assert_eq!(
        (batch["creditCents"].clone(), batch["priceCents"].clone()),
        (json!(1_000), json!(500))
    );
    assert_eq!(
        app.get("/api/account/credits", &token).await.json()["balanceCents"],
        0
    );
    // Canceling gives the credit back.
    let id = batch["id"].as_str().unwrap();
    let canceled = app
        .request(
            Method::POST,
            &format!("/api/batches/{id}/cancel"),
            Some(&token),
            None,
        )
        .await;
    assert_eq!(canceled.status, StatusCode::OK);
    let credits = app.get("/api/account/credits", &token).await.json();
    assert_eq!(credits["balanceCents"], 1_000);
    let reasons: Vec<&str> = credits["entries"]
        .as_array()
        .unwrap()
        .iter()
        .map(|entry| entry["reason"].as_str().unwrap())
        .collect();
    assert_eq!(reasons, ["batch_cancel", "batch_payment", "promo_code"]);

    // A batch the credit covers is paid at once.
    let small = app.create_batch(&token, &event, 20).await;
    assert_eq!(
        (small["status"].clone(), small["paidVia"].clone()),
        (json!("paid"), json!("credit"))
    );
    assert_eq!(small["creditCents"], 300);

    // Admins add or take credit, never below zero.
    let org = app
        .get("/api/admin/organizations?q=banda", &admin)
        .await
        .json()[0]["id"]
        .as_str()
        .unwrap()
        .to_owned();
    let taken = app
        .post(
            &format!("/api/admin/organizations/{org}/credits"),
            &admin,
            json!({ "amountCents": -5_000, "note": null }),
        )
        .await;
    assert_eq!(taken.error_code(), "insufficient_credit");
    let given = app
        .post(
            &format!("/api/admin/organizations/{org}/credits"),
            &admin,
            json!({ "amountCents": 2_000, "note": "Cortesia" }),
        )
        .await
        .json();
    assert_eq!(given["balanceCents"], 2_700);
    let inbox = app.get("/api/inbox", &token).await.json();
    assert_eq!(inbox["notifications"][0]["kind"], "credits_granted");
    assert_eq!(inbox["notifications"][0]["data"]["amountCents"], 2_000);
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn discount_and_free_ticket_codes(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let admin = app.login(ADMIN).await;
    let token = app.login("banda@exemplo.com").await;
    let event = app.create_event(&token, "Show").await;
    create_code(
        &app,
        &admin,
        json!({ "code": "METADE", "kind": "discount", "discountPercent": 50 }),
    )
    .await;
    create_code(
        &app,
        &admin,
        json!({ "code": "BRINDE", "kind": "free_tickets", "freeTickets": 40 }),
    )
    .await;
    create_code(&app, &admin, json!({ "code": "VELHO", "kind": "credit", "creditCents": 100, "expiresAt": "2020-01-01T00:00:00Z" })).await;
    let generated = create_code(
        &app,
        &admin,
        json!({ "kind": "credit", "creditCents": 100 }),
    )
    .await;
    assert_eq!(generated["code"].as_str().unwrap().len(), 8);

    assert_eq!(
        redeem(&app, &token, "VELHO").await.error_code(),
        "promo_code_expired"
    );
    redeem(&app, &token, "METADE").await;
    let credits = app.get("/api/account/credits", &token).await.json();
    assert_eq!(credits["pendingDiscount"]["code"], "METADE");
    let quoted = quote(&app, &token, &event, 100).await;
    assert_eq!(quoted["discountCode"]["discountPercent"], 50);
    assert_eq!(quoted["totalCents"], 750);
    // Used once, then gone.
    assert_eq!(
        app.create_batch(&token, &event, 100).await["priceCents"],
        750
    );
    assert_eq!(quote(&app, &token, &event, 100).await["totalCents"], 1_500);

    redeem(&app, &token, "BRINDE").await;
    let batch = app.create_batch(&token, &event, 40).await;
    assert_eq!(
        (batch["freeTickets"].clone(), batch["paidVia"].clone()),
        (json!(40), json!("free"))
    );

    let codes = app.get("/api/admin/promo-codes", &admin).await.json();
    let metade = codes
        .as_array()
        .unwrap()
        .iter()
        .find(|code| code["code"] == "METADE")
        .unwrap();
    let id = metade["id"].as_str().unwrap();
    let uses = app
        .get(&format!("/api/admin/promo-codes/{id}/redemptions"), &admin)
        .await
        .json();
    assert!(uses[0]["appliedAt"].is_string());
    let off = app
        .put(
            &format!("/api/admin/promo-codes/{id}"),
            &admin,
            json!({ "description": null, "maxRedemptions": null, "expiresAt": null, "disabled": true }),
        )
        .await
        .json();
    assert_eq!(off["disabled"], true);
    let other = app.login("outra@exemplo.com").await;
    assert_eq!(
        redeem(&app, &other, "METADE").await.error_code(),
        "promo_code_invalid"
    );
    let duplicate = app
        .post(
            "/api/admin/promo-codes",
            &admin,
            json!({ "code": "metade", "kind": "credit", "creditCents": 1, "freeTickets": null, "discountPercent": null,
                    "description": null, "maxRedemptions": null, "newOrganizationsOnly": false,
                    "startsAt": null, "expiresAt": null }),
        )
        .await;
    assert_eq!(duplicate.error_code(), "promo_code_exists");
}
