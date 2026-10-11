//! Settling with sellers (ADR 0050): money handed over, returns, and the balance in the report.

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

/// An event at R$ 30 with 20 paid tickets; Maria holds 1–10 and João 11–15.
async fn setup(app: &TestApp, token: &str) -> (String, String, String) {
    let admin = app.login(ADMIN).await;
    let event = app.create_event(token, "Show").await;
    let batch = app.create_batch(token, &event, 20).await;
    if batch["status"] != "paid" {
        let reply = app
            .request(
                Method::POST,
                &format!(
                    "/api/admin/batches/{}/mark-paid",
                    batch["id"].as_str().unwrap()
                ),
                Some(&admin),
                None,
            )
            .await;
        assert!(reply.status.is_success());
    }
    let mut sellers = Vec::new();
    for (name, first, last) in [("Maria", 1, 10), ("João", 11, 15)] {
        let seller = app
            .post(
                &format!("/api/events/{event}/sellers"),
                token,
                json!({ "name": name }),
            )
            .await
            .json();
        let id = seller["id"].as_str().unwrap().to_owned();
        let reply = app
            .post(
                &format!("/api/sellers/{id}/ranges"),
                token,
                json!({ "first": first, "last": last }),
            )
            .await;
        assert_eq!(reply.status, StatusCode::CREATED);
        sellers.push(id);
    }
    let joao = sellers.pop().unwrap();
    let maria = sellers.pop().unwrap();
    (event, maria, joao)
}

fn seller<'a>(report: &'a Value, name: &str) -> &'a Value {
    report["sellers"]
        .as_array()
        .unwrap()
        .iter()
        .find(|row| row["seller"] == name)
        .unwrap()
}

fn money(row: &Value) -> (i64, i64, i64, Option<i64>) {
    (
        row["declaredSold"].as_i64().unwrap(),
        row["amountDueCents"].as_i64().unwrap(),
        row["receivedCents"].as_i64().unwrap(),
        row["balanceCents"].as_i64(),
    )
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn payments_and_returns_settle_each_seller(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("banda@exemplo.com").await;
    let (event, maria, joao) = setup(&app, &token).await;

    // Maria pays twice, by Pix and in cash; João once.
    for (seller, amount, method, day) in [
        (&maria, 9000, "pix", "2026-10-01"),
        (&maria, 6000, "cash", "2026-10-03"),
        (&joao, 3000, "pix", "2026-10-02"),
    ] {
        let reply = app
            .post(
                &format!("/api/sellers/{seller}/payments"),
                &token,
                json!({ "amountCents": amount, "method": method, "receivedOn": day, "note": " ensaio " }),
            )
            .await;
        assert_eq!(reply.status, StatusCode::CREATED);
        let payment = reply.json();
        assert_eq!(payment["amountCents"], amount);
        assert_eq!(payment["receivedOn"], day);
        assert_eq!(payment["note"], "ensaio");
    }

    // Maria gives back 9–10 unsold and lost 8; João gives back 15.
    let reply = app
        .post(
            &format!("/api/sellers/{maria}/returns"),
            &token,
            json!({ "ranges": [{ "first": 9, "last": 10 }], "reason": "unsold", "note": null }),
        )
        .await;
    assert_eq!(reply.status, StatusCode::CREATED);
    assert_eq!(reply.json().as_array().unwrap().len(), 1);
    app.post(
        &format!("/api/sellers/{maria}/returns"),
        &token,
        json!({ "ranges": [{ "first": 8, "last": 8 }], "reason": "lost", "note": "caiu do bolso" }),
    )
    .await;
    app.post(
        &format!("/api/sellers/{joao}/returns"),
        &token,
        json!({ "ranges": [{ "first": 15, "last": 15 }], "reason": "unsold", "note": null }),
    )
    .await;

    let report = app
        .get(&format!("/api/events/{event}/report"), &token)
        .await
        .json();
    // Maria: 10 − 2 unsold − 1 lost = 7 sold = R$ 210; received R$ 150; owes R$ 60.
    assert_eq!(
        money(seller(&report, "Maria")),
        (7, 21000, 15000, Some(6000))
    );
    // João: 5 − 1 = 4 sold = R$ 120; received R$ 30; owes R$ 90.
    assert_eq!(money(seller(&report, "João")), (4, 12000, 3000, Some(9000)));
    // Nobody owes the 5 unassigned tickets.
    assert_eq!(report["unassigned"]["receivedCents"], 0);
    assert!(report["unassigned"]["balanceCents"].is_null());
    // Totals: what sellers still owe, without the unassigned tickets.
    assert_eq!(report["totals"]["receivedCents"], 18000);
    assert_eq!(report["totals"]["balanceCents"], 15000);

    // Overpaying shows a negative balance.
    app.post(
        &format!("/api/sellers/{joao}/payments"),
        &token,
        json!({ "amountCents": 10000, "method": "other", "receivedOn": "2026-10-04", "note": null }),
    )
    .await;
    let report = app
        .get(&format!("/api/events/{event}/report"), &token)
        .await
        .json();
    assert_eq!(seller(&report, "João")["balanceCents"], -1000);

    // The list is newest first; deleting a payment brings the balance back.
    let payments = app
        .get(&format!("/api/events/{event}/seller-payments"), &token)
        .await
        .json();
    let days: Vec<&str> = payments
        .as_array()
        .unwrap()
        .iter()
        .map(|payment| payment["receivedOn"].as_str().unwrap())
        .collect();
    assert_eq!(
        days,
        ["2026-10-04", "2026-10-03", "2026-10-02", "2026-10-01"]
    );
    let last = payments[0]["id"].as_str().unwrap();
    let reply = app
        .delete(&format!("/api/seller-payments/{last}"), &token, None)
        .await;
    assert_eq!(reply.status, StatusCode::NO_CONTENT);
    let report = app
        .get(&format!("/api/events/{event}/report"), &token)
        .await
        .json();
    assert_eq!(seller(&report, "João")["balanceCents"], 9000);

    // Removing a seller removes what they handed over.
    app.delete(&format!("/api/sellers/{joao}"), &token, None)
        .await;
    let payments = app
        .get(&format!("/api/events/{event}/seller-payments"), &token)
        .await
        .json();
    assert_eq!(payments.as_array().unwrap().len(), 2);
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn returns_are_checked_and_atomic(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("banda@exemplo.com").await;
    let (event, maria, joao) = setup(&app, &token).await;
    let give_back = |seller: String, ranges: Value, reason: &'static str| {
        let app = &app;
        let token = &token;
        async move {
            app.post(
                &format!("/api/sellers/{seller}/returns"),
                token,
                json!({ "ranges": ranges, "reason": reason, "note": null }),
            )
            .await
        }
    };

    // Numbers of another seller, or outside every range, are refused, and nothing is voided.
    let reply = give_back(
        maria.clone(),
        json!([{ "first": 3, "last": 3 }, { "first": 11, "last": 11 }]),
        "unsold",
    )
    .await;
    assert_eq!(reply.status, StatusCode::BAD_REQUEST);
    assert_eq!(reply.error_code(), "range_not_held");
    let voids = app
        .get(&format!("/api/events/{event}/voids"), &token)
        .await
        .json();
    assert_eq!(voids, json!([]));

    // Overlapping ranges, no ranges, and other reasons are refused.
    for (ranges, reason, code) in [
        (
            json!([{ "first": 1, "last": 3 }, { "first": 3, "last": 4 }]),
            "unsold",
            "invalid_range",
        ),
        (json!([]), "unsold", "invalid_range"),
        (
            json!([{ "first": 1, "last": 1 }]),
            "revoked",
            "invalid_return_reason",
        ),
    ] {
        let reply = give_back(maria.clone(), ranges, reason).await;
        assert_eq!(reply.status, StatusCode::BAD_REQUEST);
        assert_eq!(reply.error_code(), code);
    }

    // Scattered numbers go together, one void per range.
    let reply = give_back(
        joao.clone(),
        json!([{ "first": 14, "last": 15 }, { "first": 11, "last": 11 }]),
        "unsold",
    )
    .await;
    assert_eq!(reply.status, StatusCode::CREATED);
    let created: Vec<(i64, i64)> = reply
        .json()
        .as_array()
        .unwrap()
        .iter()
        .map(|item| {
            (
                item["first"].as_i64().unwrap(),
                item["last"].as_i64().unwrap(),
            )
        })
        .collect();
    assert_eq!(created, [(11, 11), (14, 15)]);

    // A number voided already cannot be returned again.
    let reply = give_back(joao.clone(), json!([{ "first": 15, "last": 15 }]), "lost").await;
    assert_eq!(reply.status, StatusCode::CONFLICT);
    assert_eq!(reply.error_code(), "already_voided");
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn payments_are_validated_and_private(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("banda@exemplo.com").await;
    let (event, maria, _) = setup(&app, &token).await;
    let pay = |body: Value| {
        let app = &app;
        let token = &token;
        let maria = maria.clone();
        async move {
            app.post(&format!("/api/sellers/{maria}/payments"), token, body)
                .await
        }
    };

    for (body, code) in [
        (
            json!({ "amountCents": 0, "method": "pix", "receivedOn": "2026-10-01", "note": null }),
            "invalid_amount",
        ),
        (
            json!({ "amountCents": 100_000_001, "method": "pix", "receivedOn": "2026-10-01", "note": null }),
            "invalid_amount",
        ),
        (
            json!({ "amountCents": 100, "method": "pix", "receivedOn": "01/10/2026", "note": null }),
            "invalid_date",
        ),
        (
            json!({ "amountCents": 100, "method": "pix", "receivedOn": "2099-01-01", "note": null }),
            "invalid_date",
        ),
        (
            json!({ "amountCents": 100, "method": "pix", "receivedOn": "2026-10-01", "note": "a\nb" }),
            "invalid_note",
        ),
    ] {
        let reply = pay(body).await;
        assert_eq!(reply.status, StatusCode::BAD_REQUEST);
        assert_eq!(reply.error_code(), code);
    }

    let payment = pay(
        json!({ "amountCents": 100, "method": "cash", "receivedOn": "2026-10-01", "note": null }),
    )
    .await
    .json();
    let payment_id = payment["id"].as_str().unwrap();

    // Another organization sees none of it.
    let stranger = app.login("outra@exemplo.com").await;
    for reply in [
        app.get(&format!("/api/events/{event}/seller-payments"), &stranger)
            .await,
        app.post(
            &format!("/api/sellers/{maria}/payments"),
            &stranger,
            json!({ "amountCents": 100, "method": "pix", "receivedOn": "2026-10-01", "note": null }),
        )
        .await,
        app.post(
            &format!("/api/sellers/{maria}/returns"),
            &stranger,
            json!({ "ranges": [{ "first": 1, "last": 1 }], "reason": "unsold", "note": null }),
        )
        .await,
        app.delete(&format!("/api/seller-payments/{payment_id}"), &stranger, None)
            .await,
    ] {
        assert_eq!(reply.status, StatusCode::NOT_FOUND);
    }

    // The account export carries what each seller handed over.
    let export = app.get("/api/account/export", &token).await.json();
    let sellers = export["events"][0]["sellers"].clone();
    let maria_export = sellers
        .as_array()
        .unwrap()
        .iter()
        .find(|seller| seller["name"] == "Maria")
        .unwrap()
        .clone();
    assert_eq!(maria_export["received"][0]["amountCents"], 100);
    assert_eq!(maria_export["received"][0]["method"], "cash");
}
