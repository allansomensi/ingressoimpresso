//! Accountability (ADR 0058): expenses and other income, the summary, the PDF and the sheet.

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
use serde_json::json;
use sqlx::PgPool;

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn the_group_sees_where_the_money_went(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let admin = app.login(ADMIN).await;
    let token = app.login("comissao@exemplo.com").await;
    let event = app.create_event(&token, "Formatura 3º ano").await;
    let batch = app.create_batch(&token, &event, 20).await;
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
            &token,
            json!({ "name": "Maria" }),
        )
        .await
        .json();
    let seller = seller["id"].as_str().unwrap().to_owned();
    app.post(
        &format!("/api/sellers/{seller}/ranges"),
        &token,
        json!({ "first": 1, "last": 10 }),
    )
    .await;
    app.post(
        &format!("/api/sellers/{seller}/payments"),
        &token,
        json!({ "amountCents": 24000, "method": "pix", "receivedOn": "2026-10-10", "note": null }),
    )
    .await;

    for (kind, description, category, amount) in [
        ("expense", "Buffet", Some("Comida"), 50_000),
        ("income", "Doação da APM", None, 20_000),
    ] {
        let reply = app
            .post(
                &format!("/api/events/{event}/ledger"),
                &token,
                json!({
                    "kind": kind, "description": description, "category": category,
                    "amountCents": amount, "occurredOn": "2026-11-01"
                }),
            )
            .await;
        assert_eq!(
            reply.status,
            StatusCode::CREATED,
            "{}",
            String::from_utf8_lossy(&reply.bytes)
        );
    }
    for (body, code) in [
        (
            json!({ "kind": "expense", "description": " ", "category": null, "amountCents": 100, "occurredOn": "2026-11-01" }),
            "invalid_description",
        ),
        (
            json!({ "kind": "expense", "description": "Som", "category": null, "amountCents": 0, "occurredOn": "2026-11-01" }),
            "invalid_amount",
        ),
        (
            json!({ "kind": "expense", "description": "Som", "category": null, "amountCents": 100, "occurredOn": "01/11/2026" }),
            "invalid_entry_date",
        ),
    ] {
        let reply = app
            .post(&format!("/api/events/{event}/ledger"), &token, body)
            .await;
        assert_eq!(reply.error_code(), code);
    }

    let summary = app
        .get(&format!("/api/events/{event}/accountability"), &token)
        .await
        .json();
    let platform = summary["platformCents"].as_i64().unwrap();
    assert_eq!(summary["issued"], 20);
    assert_eq!(summary["ticketSalesCents"], 30_000);
    assert_eq!(summary["receivedCents"], 24_000);
    assert_eq!(summary["outstandingCents"], 6_000);
    assert_eq!(summary["otherIncomeCents"], 20_000);
    assert_eq!(summary["expensesCents"], 50_000);
    assert_eq!(summary["balanceCents"], 24_000 + 20_000 - 50_000 - platform);
    assert_eq!(summary["entriesList"].as_array().unwrap().len(), 2);

    // Editing and deleting entries.
    let id = summary["entriesList"][0]["id"].as_str().unwrap().to_owned();
    let reply = app
        .put(
            &format!("/api/ledger/{id}"),
            &token,
            json!({ "kind": "expense", "description": "Buffet e bebidas", "category": "Comida", "amountCents": 60000, "occurredOn": "2026-11-02" }),
        )
        .await;
    assert_eq!(reply.status, StatusCode::NO_CONTENT);
    let list = app
        .get(&format!("/api/events/{event}/ledger"), &token)
        .await
        .json();
    assert_eq!(list[1]["description"], "Buffet e bebidas");
    assert_eq!(list[1]["occurredOn"], "2026-11-02");

    // The files.
    let pdf = app
        .get(&format!("/api/events/{event}/accountability/pdf"), &token)
        .await;
    assert_eq!(pdf.status, StatusCode::OK);
    assert!(pdf.bytes.starts_with(b"%PDF"));
    let sheet = app
        .get(&format!("/api/events/{event}/accountability/xlsx"), &token)
        .await;
    assert_eq!(sheet.status, StatusCode::OK);
    assert!(sheet.bytes.starts_with(b"PK"));

    // Another organization sees nothing; on the team, only money writes the entries.
    let stranger = app.login("outra@exemplo.com").await;
    for path in ["accountability", "accountability/pdf", "ledger"] {
        let reply = app
            .get(&format!("/api/events/{event}/{path}"), &stranger)
            .await;
        assert_eq!(reply.status, StatusCode::NOT_FOUND, "{path}");
    }
    assert_eq!(
        app.delete(&format!("/api/ledger/{id}"), &stranger, None)
            .await
            .status,
        StatusCode::NOT_FOUND
    );
    for (email, areas, allowed) in [
        ("arte@exemplo.com", "art", false),
        ("caixa@exemplo.com", "money", true),
    ] {
        app.post(
            &format!("/api/events/{event}/team"),
            &token,
            json!({ "email": email, "name": null, "areas": [areas] }),
        )
        .await;
        let member = app.login(email).await;
        let reply = app
            .post(
                &format!("/api/events/{event}/ledger"),
                &member,
                json!({ "kind": "expense", "description": "Som", "category": null, "amountCents": 100, "occurredOn": "2026-11-01" }),
            )
            .await;
        assert_eq!(reply.status == StatusCode::CREATED, allowed, "{email}");
        assert_eq!(
            app.get(&format!("/api/events/{event}/accountability/xlsx"), &member)
                .await
                .status,
            StatusCode::OK
        );
    }
    let reply = app.delete(&format!("/api/ledger/{id}"), &token, None).await;
    assert_eq!(reply.status, StatusCode::NO_CONTENT);
}
