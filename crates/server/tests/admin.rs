//! The admin panel (ADR 0026): only `ADMIN_EMAILS` see the whole service, and the free ticket
//! bonus they give reaches the organization's next batch.

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
use serde_json::json;
use sqlx::PgPool;

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn only_admins_see_the_admin_panel(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("banda@exemplo.com").await;
    for path in [
        "/api/admin/overview",
        "/api/admin/organizations",
        "/api/admin/batches",
    ] {
        let reply = app.get(path, &token).await;
        assert_eq!(reply.status, StatusCode::FORBIDDEN, "{path}");
    }
    let bonus = app
        .put(
            "/api/admin/organizations/00000000-0000-0000-0000-000000000000/bonus",
            &token,
            json!({ "bonusFreeTickets": 10 }),
        )
        .await;
    assert_eq!(bonus.status, StatusCode::FORBIDDEN);
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn admins_see_totals_organizations_and_batches(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let admin = app.login(ADMIN).await;
    let token = app.login("banda@exemplo.com").await;
    let event = app.create_event(&token, "Show da Banda").await;
    let first = app
        .post(
            &format!("/api/events/{event}/batches"),
            &token,
            json!({ "quantity": 100 }),
        )
        .await
        .json();
    app.post(
        &format!("/api/events/{event}/batches"),
        &token,
        json!({ "quantity": 20 }),
    )
    .await;
    let paid = app
        .post(
            &format!(
                "/api/admin/batches/{}/mark-paid",
                first["id"].as_str().unwrap()
            ),
            &admin,
            json!({}),
        )
        .await;
    assert_eq!(paid.status, StatusCode::OK);

    let overview = app.get("/api/admin/overview", &admin).await;
    assert_eq!(overview.status, StatusCode::OK);
    let overview = overview.json();
    assert_eq!(overview["paidTickets"], 100);
    assert_eq!(overview["revenueCents"], 1_500);
    assert_eq!(overview["revenue30dCents"], 1_500);
    assert_eq!(overview["awaitingBatches"], 1);
    assert_eq!(overview["events"], 1);
    // Both sign-ins created an organization.
    assert_eq!(overview["organizations"], 2);
    let days = overview["days"].as_array().unwrap();
    assert_eq!(days.len(), 30);
    assert_eq!(days.last().unwrap()["tickets"], 100);
    assert_eq!(days.last().unwrap()["revenueCents"], 1_500);

    let found = app
        .get("/api/admin/organizations?q=banda%40exemplo", &admin)
        .await
        .json();
    let found = found.as_array().unwrap();
    assert_eq!(found.len(), 1);
    assert_eq!(found[0]["ownerEmail"], "banda@exemplo.com");
    assert_eq!(found[0]["eventCount"], 1);
    assert_eq!(found[0]["paidTickets"], 100);
    assert_eq!(found[0]["revenueCents"], 1_500);
    assert!(found[0]["lastBatchAt"].is_string());
    let none = app
        .get("/api/admin/organizations?q=100%25", &admin)
        .await
        .json();
    assert_eq!(none.as_array().unwrap().len(), 0);

    let awaiting = app
        .get("/api/admin/batches?status=awaiting_payment", &admin)
        .await
        .json();
    let awaiting = awaiting.as_array().unwrap();
    assert_eq!(awaiting.len(), 1);
    assert_eq!(awaiting[0]["eventName"], "Show da Banda");
    assert_eq!(awaiting[0]["ownerEmail"], "banda@exemplo.com");
    assert_eq!(awaiting[0]["batch"]["first"], 101);
    let all = app.get("/api/admin/batches?q=show", &admin).await.json();
    assert_eq!(all.as_array().unwrap().len(), 2);
    let wrong = app.get("/api/admin/batches?status=lost", &admin).await;
    assert_eq!(wrong.status, StatusCode::BAD_REQUEST);
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn a_bonus_gives_free_tickets_to_the_next_batch(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let admin = app.login(ADMIN).await;
    let token = app.login("escola@exemplo.com").await;
    let event = app.create_event(&token, "Festa junina").await;
    let organization = app
        .get("/api/admin/organizations?q=escola", &admin)
        .await
        .json()[0]["id"]
        .as_str()
        .unwrap()
        .to_owned();
    let path = format!("/api/admin/organizations/{organization}/bonus");

    let invalid = app
        .put(&path, &admin, json!({ "bonusFreeTickets": -1 }))
        .await;
    assert_eq!(invalid.status, StatusCode::BAD_REQUEST);
    assert_eq!(invalid.error_code(), "invalid_bonus");
    let updated = app
        .put(&path, &admin, json!({ "bonusFreeTickets": 50 }))
        .await;
    assert_eq!(updated.status, StatusCode::OK);
    assert_eq!(updated.json()["freeTotal"], 50);

    let account = app.get("/api/account", &token).await.json();
    assert_eq!(account["freeTicketsLeft"], 50);
    let batch = app
        .post(
            &format!("/api/events/{event}/batches"),
            &token,
            json!({ "quantity": 40 }),
        )
        .await
        .json();
    assert_eq!(batch["status"], "paid");
    assert_eq!(batch["paidVia"], "free");
    assert_eq!(batch["freeTickets"], 40);
    let account = app.get("/api/account", &token).await.json();
    assert_eq!(account["freeTicketsLeft"], 10);

    let missing = app
        .put(
            "/api/admin/organizations/00000000-0000-0000-0000-000000000000/bonus",
            &admin,
            json!({ "bonusFreeTickets": 10 }),
        )
        .await;
    assert_eq!(missing.status, StatusCode::NOT_FOUND);
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn owners_rename_their_organization(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("coral@exemplo.com").await;
    let renamed = app
        .put(
            "/api/account",
            &token,
            json!({ "organizationName": "  Coral da Igreja  " }),
        )
        .await;
    assert_eq!(renamed.status, StatusCode::OK);
    assert_eq!(renamed.json()["organizationName"], "Coral da Igreja");
    let empty = app
        .put("/api/account", &token, json!({ "organizationName": " " }))
        .await;
    assert_eq!(empty.error_code(), "invalid_name");
}
