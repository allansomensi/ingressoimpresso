//! Revenue reports (ADR 0106): the month's closing, sign-up cohorts and coupon return.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing,
    reason = "test helpers fail loudly by design"
)]

mod common;

use axum::http::StatusCode;
use common::{ADMIN, TestApp};
use serde_json::{Value, json};
use sqlx::PgPool;

fn this_month() -> String {
    let now = time::OffsetDateTime::now_utc().to_offset(time::macros::offset!(-3));
    format!("{}-{:02}", now.year(), u8::from(now.month()))
}

async fn paid_batch(app: &TestApp, admin: &str, token: &str, event: &str, quantity: i32) -> Value {
    let batch = app.create_batch(token, event, quantity).await;
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
    assert_eq!(reply.status, StatusCode::OK);
    reply.json()
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn the_month_closes_with_payments_refunds_and_credit(pool: PgPool) {
    let app = TestApp::with_free_tickets(pool, 0).await;
    let admin = app.login(ADMIN).await;
    let token = app.login("banda@exemplo.com").await;
    let event = app.create_event(&token, "Show; parte 2").await;
    let kept = paid_batch(&app, &admin, &token, &event, 100).await;
    let refunded = paid_batch(&app, &admin, &token, &event, 50).await;
    let refund = app
        .post(
            &format!(
                "/api/admin/batches/{}/refund",
                refunded["id"].as_str().unwrap()
            ),
            &admin,
            json!({ "refundOnStripe": false }),
        )
        .await;
    assert_eq!(refund.status, StatusCode::OK);
    let kept_cents = kept["priceCents"].as_i64().unwrap();
    let refunded_cents = refunded["priceCents"].as_i64().unwrap();
    assert!(kept_cents > 0 && refunded_cents > 0);

    let month = this_month();
    let closing = app
        .get(&format!("/api/admin/reports/closing?month={month}"), &admin)
        .await;
    assert_eq!(closing.status, StatusCode::OK);
    let closing = closing.json();
    assert_eq!(closing["month"], month);
    assert_eq!(closing["grossCents"], kept_cents + refunded_cents);
    assert_eq!(closing["refundsCents"], refunded_cents);
    assert_eq!(closing["netCents"], kept_cents);
    assert_eq!(closing["manualCents"], kept_cents + refunded_cents);
    assert_eq!(closing["stripeCents"], 0);
    assert_eq!(closing["batches"], 2);
    assert_eq!(closing["tickets"], 150);
    assert_eq!(closing["methods"][0]["method"], "admin");
    assert_eq!(closing["organizations"][0]["refundsCents"], refunded_cents);
    let kinds: Vec<&str> = closing["lines"]
        .as_array()
        .unwrap()
        .iter()
        .map(|line| line["kind"].as_str().unwrap())
        .collect();
    assert_eq!(kinds, ["payment", "payment", "refund"]);

    // The files for the accountant.
    let sheet = app
        .get(
            &format!("/api/admin/reports/closing/xlsx?month={month}"),
            &admin,
        )
        .await;
    assert_eq!(sheet.status, StatusCode::OK);
    assert!(sheet.bytes.starts_with(b"PK"));
    assert!(
        sheet.headers["content-disposition"]
            .to_str()
            .unwrap()
            .contains(&format!("fechamento-{month}.xlsx"))
    );
    let csv = app
        .get(
            &format!("/api/admin/reports/closing/csv?month={month}"),
            &admin,
        )
        .await;
    assert_eq!(csv.status, StatusCode::OK);
    let text = String::from_utf8(csv.bytes.clone()).unwrap();
    let rows: Vec<&str> = text.trim_end().split("\r\n").collect();
    assert_eq!(rows.len(), 4);
    assert!(rows[0].starts_with("\u{feff}data;tipo;organizacao;evento"));
    assert!(rows[1].contains(";recebimento;"));
    assert!(rows[1].contains("\"Show; parte 2\""));
    let refund_row = rows[3];
    assert!(refund_row.contains(";devolucao;"));
    assert!(refund_row.contains(&format!(
        ";-{},{:02};",
        refunded_cents / 100,
        refunded_cents % 100
    )));
    // Downloads are audited; organizers never reach any of it.
    let exports: i64 =
        sqlx::query_scalar("select count(*) from audit_log where action = 'report_export'")
            .fetch_one(&app.state.pool)
            .await
            .unwrap();
    assert_eq!(exports, 2);
    for uri in [
        format!("/api/admin/reports/closing?month={month}"),
        format!("/api/admin/reports/closing/csv?month={month}"),
        "/api/admin/reports/cohorts".to_owned(),
        "/api/admin/reports/coupons".to_owned(),
    ] {
        assert_eq!(app.get(&uri, &token).await.status, StatusCode::FORBIDDEN);
    }
    assert_eq!(
        app.get("/api/admin/reports/closing?month=2026-13", &admin)
            .await
            .error_code(),
        "invalid_month"
    );
    // An empty month is all zeros.
    let empty = app
        .get("/api/admin/reports/closing?month=2021-01", &admin)
        .await
        .json();
    assert_eq!(empty["grossCents"], 0);
    assert_eq!(empty["lines"], json!([]));

    // This month's cohort: the two accounts, one of them paying, with its net money.
    let cohorts = app.get("/api/admin/reports/cohorts", &admin).await.json();
    let cohorts = cohorts.as_array().unwrap();
    assert_eq!(cohorts.len(), 12);
    assert_eq!(cohorts[0]["month"], month);
    assert_eq!(cohorts[0]["signups"], 2);
    assert_eq!(cohorts[0]["paying"], 1);
    assert_eq!(cohorts[0]["revenueCents"], kept_cents);
    assert_eq!(cohorts[0]["byMonth"], json!([kept_cents]));
    assert_eq!(cohorts[11]["byMonth"].as_array().unwrap().len(), 12);
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn coupons_show_what_they_cost_and_brought(pool: PgPool) {
    let app = TestApp::with_free_tickets(pool, 0).await;
    let admin = app.login(ADMIN).await;
    let mut code = json!({
        "code": "ROCK10", "kind": "credit", "creditCents": 1_000, "freeTickets": null,
        "discountPercent": null, "description": null, "maxRedemptions": null,
        "newOrganizationsOnly": false, "startsAt": null, "expiresAt": null,
    });
    let created = app
        .post("/api/admin/promo-codes", &admin, code.clone())
        .await;
    assert_eq!(created.status, StatusCode::CREATED);
    code["code"] = json!("NINGUEM");
    app.post("/api/admin/promo-codes", &admin, code).await;

    let token = app.login("banda@exemplo.com").await;
    let redeemed = app
        .post("/api/account/redeem", &token, json!({ "code": "rock10" }))
        .await;
    assert_eq!(redeemed.status, StatusCode::OK);
    let event = app.create_event(&token, "Show").await;
    let batch = paid_batch(&app, &admin, &token, &event, 100).await;

    let coupons = app.get("/api/admin/reports/coupons", &admin).await.json();
    let rock = coupons
        .as_array()
        .unwrap()
        .iter()
        .find(|item| item["name"] == "ROCK10")
        .unwrap();
    assert_eq!(rock["source"], "code");
    assert_eq!(rock["kind"], "credit");
    assert_eq!(rock["organizations"], 1);
    assert_eq!(rock["creditCents"], 1_000);
    assert_eq!(rock["revenueCents"], batch["priceCents"]);
    assert_eq!(
        rock["paying"],
        i32::from(batch["priceCents"].as_i64().unwrap() > 0)
    );
    let nobody = coupons
        .as_array()
        .unwrap()
        .iter()
        .find(|item| item["name"] == "NINGUEM")
        .unwrap();
    assert_eq!(nobody["organizations"], 0);
    assert_eq!(nobody["revenueCents"], 0);
}
