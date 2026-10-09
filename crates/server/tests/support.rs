//! Admin control (ADR 0032), the changelog (ADR 0031) and results (ADR 0034): admins act on any
//! account with the audit log watching, suspend, refund and reprice; organizers see their results.

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
async fn admins_support_any_event_and_it_is_audited(pool: PgPool) {
    let app = TestApp::new(pool);
    let admin = app.login(ADMIN).await;
    let token = app.login("banda@exemplo.com").await;
    let event = app.create_event(&token, "Show da Banda").await;

    let seen = app
        .get(&format!("/api/events/{event}"), &admin)
        .await
        .json();
    assert_eq!(seen["supportAccess"], true);
    let own = app
        .get(&format!("/api/events/{event}"), &token)
        .await
        .json();
    assert_eq!(own["supportAccess"], false);
    let other = app.login("outra@exemplo.com").await;
    assert_eq!(
        app.get(&format!("/api/events/{event}"), &other)
            .await
            .status,
        StatusCode::NOT_FOUND
    );

    // Reading leaves no trace; a change does.
    let batch = app.create_batch(&admin, &event, 10).await;
    assert_eq!(batch["first"], 1);
    let audit = app.get("/api/admin/audit", &admin).await.json();
    let entry = &audit[0];
    assert_eq!(entry["action"], "support_write");
    assert_eq!(entry["actorEmail"], ADMIN);
    assert_eq!(entry["eventName"], "Show da Banda");
    assert_eq!(entry["detail"]["method"], "POST");
    assert_eq!(audit.as_array().unwrap().len(), 1);
    assert_eq!(
        app.get("/api/admin/audit", &token).await.status,
        StatusCode::FORBIDDEN
    );

    let organization = app
        .get("/api/admin/organizations?q=banda", &admin)
        .await
        .json()[0]["id"]
        .as_str()
        .unwrap()
        .to_owned();
    let detail = app
        .get(&format!("/api/admin/organizations/{organization}"), &admin)
        .await
        .json();
    assert_eq!(detail["events"][0]["name"], "Show da Banda");
    assert_eq!(detail["members"][0]["email"], "banda@exemplo.com");
    assert_eq!(detail["members"][0]["sessions"], 1);
    assert_eq!(detail["audit"][0]["action"], "support_write");

    let user = detail["members"][0]["userId"].as_str().unwrap().to_owned();
    let ended = app
        .post(
            &format!("/api/admin/users/{user}/sessions/revoke"),
            &admin,
            json!({}),
        )
        .await;
    assert_eq!(ended.status, StatusCode::NO_CONTENT);
    assert_eq!(
        app.get("/api/me", &token).await.status,
        StatusCode::UNAUTHORIZED
    );
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn a_suspended_account_only_reads(pool: PgPool) {
    let app = TestApp::new(pool);
    let admin = app.login(ADMIN).await;
    let token = app.login("banda@exemplo.com").await;
    let event = app.create_event(&token, "Show").await;
    let organization = app.get("/api/admin/organizations", &admin).await.json()[0]["id"]
        .as_str()
        .unwrap()
        .to_owned();
    let suspended = app
        .put(
            &format!("/api/admin/organizations/{organization}/suspension"),
            &admin,
            json!({ "suspended": true, "reason": "Pagamento contestado" }),
        )
        .await
        .json();
    assert!(suspended["suspendedAt"].is_string());
    assert_eq!(suspended["organization"]["suspended"], true);

    let me = app.get("/api/me", &token).await.json();
    assert_eq!(me["suspended"], true);
    assert_eq!(
        app.get("/api/account", &token).await.json()["suspendedReason"],
        "Pagamento contestado"
    );
    assert_eq!(
        app.get(&format!("/api/events/{event}"), &token)
            .await
            .status,
        StatusCode::OK
    );
    let blocked = app
        .post(
            &format!("/api/events/{event}/batches"),
            &token,
            json!({ "quantity": 5 }),
        )
        .await;
    assert_eq!(blocked.status, StatusCode::FORBIDDEN);
    assert_eq!(blocked.error_code(), "account_suspended");
    // Admins still act on it; lifting restores the account.
    app.create_batch(&admin, &event, 5).await;
    app.put(
        &format!("/api/admin/organizations/{organization}/suspension"),
        &admin,
        json!({ "suspended": false }),
    )
    .await;
    app.create_batch(&token, &event, 5).await;
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn refunds_keep_numbers_taken_and_voided(pool: PgPool) {
    let app = TestApp::with_free_tickets(pool, 10);
    let admin = app.login(ADMIN).await;
    let token = app.login("banda@exemplo.com").await;
    let event = app.create_event(&token, "Show").await;
    let free = app.create_batch(&token, &event, 10).await;
    let paid = app.create_batch(&token, &event, 20).await;
    assert_eq!(paid["status"], "awaiting_payment");

    // Repricing an unpaid batch; zero frees it.
    let id = paid["id"].as_str().unwrap();
    let repriced = app
        .put(
            &format!("/api/admin/batches/{id}/price"),
            &admin,
            json!({ "priceCents": 0 }),
        )
        .await
        .json();
    assert_eq!(repriced["status"], "paid");
    assert_eq!(repriced["paidVia"], "admin");

    let refund = app
        .post(
            &format!("/api/admin/batches/{}/refund", free["id"].as_str().unwrap()),
            &admin,
            json!({ "refundOnStripe": false, "note": "Pedido em 7 dias" }),
        )
        .await;
    assert_eq!(refund.status, StatusCode::OK, "{:?}", refund.json());
    assert_eq!(refund.json()["status"], "refunded");
    assert!(refund.json()["refundedAt"].is_string());
    let again = app
        .post(
            &format!("/api/admin/batches/{}/refund", free["id"].as_str().unwrap()),
            &admin,
            json!({ "refundOnStripe": false }),
        )
        .await;
    assert_eq!(again.error_code(), "batch_not_refundable");

    let voids = app
        .get(&format!("/api/events/{event}/voids"), &token)
        .await
        .json();
    assert_eq!(
        (voids[0]["first"].clone(), voids[0]["last"].clone()),
        (json!(1), json!(10))
    );
    // The next batch never reuses refunded numbers.
    let next = app.create_batch(&token, &event, 5).await;
    assert_eq!(next["first"], 31);
    let audit = app.get("/api/admin/audit?q=batch", &admin).await.json();
    let actions: Vec<&str> = audit
        .as_array()
        .unwrap()
        .iter()
        .map(|entry| entry["action"].as_str().unwrap())
        .collect();
    assert!(
        actions.contains(&"batch_refund") && actions.contains(&"batch_price"),
        "{actions:?}"
    );
    let finance = app.get("/api/admin/finance?days=30", &admin).await.json();
    assert_eq!(finance["refundedBatches"], 1);
    assert_eq!(
        app.get("/api/admin/finance?days=12", &admin)
            .await
            .error_code(),
        "invalid_period"
    );
}

async fn public(app: &TestApp) -> serde_json::Value {
    app.request(Method::GET, "/api/changelog", None, None)
        .await
        .json()
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn admins_publish_changelog_notes(pool: PgPool) {
    let app = TestApp::new(pool);
    let admin = app.login(ADMIN).await;
    let token = app.login("banda@exemplo.com").await;
    let forbidden = app
        .post(
            "/api/admin/changelog",
            &token,
            json!({ "kind": "new", "title": "X", "body": "", "published": true }),
        )
        .await;
    assert_eq!(forbidden.status, StatusCode::FORBIDDEN);

    let draft = app
        .post(
            "/api/admin/changelog",
            &admin,
            json!({ "kind": "new", "title": "Ingresso digital", "body": "Envie pelo WhatsApp.", "published": false }),
        )
        .await;
    assert_eq!(draft.status, StatusCode::CREATED);
    let id = draft.json()["id"].as_str().unwrap().to_owned();
    // The launch notes come with the migrations; drafts stay hidden.
    let launch = public(&app).await.as_array().unwrap().len();
    assert_eq!(launch, 4);

    let published = app
        .put(
            &format!("/api/admin/changelog/{id}"),
            &admin,
            json!({ "kind": "security", "title": "Ingresso digital", "body": "Texto", "published": true }),
        )
        .await
        .json();
    assert!(published["publishedAt"].is_string());
    let after = public(&app).await;
    assert_eq!(after.as_array().unwrap().len(), launch + 1);
    assert_eq!(after[0]["title"], "Ingresso digital");
    assert_eq!(after[0]["kind"], "security");
    let invalid = app
        .post(
            "/api/admin/changelog",
            &admin,
            json!({ "kind": "new", "title": " ", "body": "", "published": true }),
        )
        .await;
    assert_eq!(invalid.error_code(), "invalid_title");
    let deleted = app
        .delete(&format!("/api/admin/changelog/{id}"), &admin, None)
        .await;
    assert_eq!(deleted.status, StatusCode::NO_CONTENT);
    assert_eq!(public(&app).await.as_array().unwrap().len(), launch);
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn organizers_see_their_results(pool: PgPool) {
    let app = TestApp::with_free_tickets(pool, 50);
    let token = app.login("banda@exemplo.com").await;
    let event = app.create_event(&token, "Show").await;
    app.create_batch(&token, &event, 40).await;
    app.post(
        &format!("/api/events/{event}/voids"),
        &token,
        json!({ "first": 31, "last": 40, "reason": "unsold" }),
    )
    .await;
    let results = app
        .get(&format!("/api/events/{event}/analytics"), &token)
        .await
        .json();
    assert_eq!(results["paidTickets"], 40);
    assert_eq!(results["sold"], 30);
    assert_eq!(results["unsold"], 10);
    assert_eq!(results["grossCents"], 30 * 3000);
    assert_eq!(results["costCents"], 0);
    assert_eq!(results["freeTickets"], 40);
    assert_eq!(results["timeline"].as_array().unwrap().len(), 0);

    let organization = app.get("/api/analytics", &token).await.json();
    assert_eq!(organization["totals"]["events"], 1);
    assert_eq!(organization["totals"]["sold"], 30);
    assert_eq!(organization["totals"]["netCents"], 90_000);
    assert_eq!(organization["months"].as_array().unwrap().len(), 12);
    assert_eq!(organization["events"][0]["grossCents"], 90_000);
}
