//! Disputed card payments (ADR 0104): the webhook records them and alerts the admins, who block
//! the numbers at the door and settle a lost dispute as a refund.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing,
    reason = "test helpers fail loudly by design"
)]

mod common;

use axum::body::Body;
use axum::http::{Method, Request, StatusCode};
use common::{ADMIN, TestApp, WEBHOOK_SECRET};
use ingressoimpresso_server::payments::sign_payload;
use serde_json::{Value, json};
use sqlx::PgPool;

async fn webhook(app: &TestApp, secret: &str, kind: &str, object: &Value) -> StatusCode {
    let payload = serde_json::to_vec(&json!({
        "id": format!("evt_{}", uuid::Uuid::new_v4().simple()),
        "object": "event",
        "type": kind,
        "created": time::OffsetDateTime::now_utc().unix_timestamp(),
        "data": { "object": object },
    }))
    .unwrap();
    let now = time::OffsetDateTime::now_utc().unix_timestamp();
    let request = Request::builder()
        .method(Method::POST)
        .uri("/api/stripe/webhook")
        .header("content-type", "application/json")
        .header("stripe-signature", sign_payload(secret, &payload, now))
        .body(Body::from(payload))
        .unwrap();
    app.send(request).await.status
}

fn dispute(intent: &str, status: &str) -> Value {
    json!({
        "id": "dp_123",
        "object": "dispute",
        "charge": "ch_123",
        "payment_intent": intent,
        "amount": 290,
        "reason": "fraudulent",
        "status": status,
        "created": time::OffsetDateTime::now_utc().unix_timestamp(),
        "evidence_details": { "due_by": time::OffsetDateTime::now_utc().unix_timestamp() + 7 * 86_400 },
    })
}

async fn voids(app: &TestApp, token: &str, event: &str) -> Vec<Value> {
    app.get(&format!("/api/events/{event}/voids"), token)
        .await
        .json()
        .as_array()
        .unwrap()
        .clone()
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn a_disputed_payment_is_blocked_and_settled_by_the_admins(pool: PgPool) {
    let (app, stripe) = TestApp::with_stripe(pool).await;
    let admin = app.login(ADMIN).await;
    let token = app.login("banda@exemplo.com").await;
    let event = app.create_event(&token, "Show").await;
    let batch = app.create_batch(&token, &event, 10).await;
    let batch_id = batch["id"].as_str().unwrap().to_owned();
    let reply = app
        .request(
            Method::POST,
            &format!("/api/batches/{batch_id}/checkout"),
            Some(&token),
            None,
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK);
    let session_id = stripe
        .lock()
        .unwrap()
        .sessions
        .keys()
        .next()
        .unwrap()
        .clone();
    let paid = stripe.lock().unwrap().pay(&session_id).unwrap();
    let intent = paid.payment_intent.clone().unwrap();
    let session = json!({
        "id": paid.id, "object": "checkout.session", "url": paid.url, "status": paid.status,
        "payment_status": paid.payment_status, "amount_total": paid.amount_total,
        "currency": paid.currency, "payment_intent": paid.payment_intent, "expires_at": paid.expires_at,
    });
    assert_eq!(
        webhook(&app, WEBHOOK_SECRET, "checkout.session.completed", &session).await,
        StatusCode::OK
    );

    // The buyer contests the card payment: recorded, and the admins are alerted once.
    for _ in 0..2 {
        assert_eq!(
            webhook(
                &app,
                WEBHOOK_SECRET,
                "charge.dispute.created",
                &dispute(&intent, "needs_response")
            )
            .await,
            StatusCode::OK
        );
    }
    let alerts: Vec<String> = app
        .sent
        .lock()
        .unwrap()
        .iter()
        .filter(|mail| mail.subject.contains("Contestação"))
        .map(|mail| mail.subject.clone())
        .collect();
    assert_eq!(alerts, ["[Urgente] Contestação de pagamento de R$ 2,90"]);
    let list = app.get("/api/admin/disputes", &admin).await.json();
    assert_eq!(list.as_array().unwrap().len(), 1);
    let item = &list[0];
    assert_eq!(item["open"], true);
    assert_eq!(item["status"], "needs_response");
    assert_eq!(item["batchId"], batch_id);
    assert_eq!(
        (item["first"].as_i64(), item["last"].as_i64()),
        (Some(1), Some(10))
    );
    assert_eq!(item["eventName"], "Show");
    assert_eq!(item["blocked"], false);
    assert!(item["evidenceDueBy"].is_string());

    // Blocked at the door while it lasts, then unblocked.
    let blocked = app
        .post("/api/admin/disputes/dp_123/block", &admin, json!({}))
        .await;
    assert_eq!(blocked.status, StatusCode::OK);
    assert_eq!(blocked.json()["blocked"], true);
    let active: Vec<Value> = voids(&app, &token, &event)
        .await
        .into_iter()
        .filter(|void| void["undoneAt"].is_null())
        .collect();
    assert_eq!(active.len(), 1);
    assert_eq!(active[0]["reason"], "revoked");
    // The block is the admins' (ADR 0119): the organizer sees it locked and cannot undo it.
    assert_eq!(active[0]["locked"], true);
    assert_eq!(
        app.post(
            &format!("/api/voids/{}/undo", active[0]["id"].as_str().unwrap()),
            &token,
            json!({})
        )
        .await
        .error_code(),
        "void_locked"
    );
    assert_eq!(
        app.post("/api/admin/disputes/dp_123/block", &admin, json!({}))
            .await
            .error_code(),
        "dispute_already_blocked"
    );
    // Only a lost dispute is settled.
    assert_eq!(
        app.post("/api/admin/disputes/dp_123/settle", &admin, json!({}))
            .await
            .error_code(),
        "dispute_not_lost"
    );

    // Lost: closed once, then settled as a refund for good.
    assert_eq!(
        webhook(
            &app,
            WEBHOOK_SECRET,
            "charge.dispute.closed",
            &dispute(&intent, "lost")
        )
        .await,
        StatusCode::OK
    );
    assert!(
        app.sent
            .lock()
            .unwrap()
            .iter()
            .any(|mail| mail.subject == "[Atenção] Contestação perdida")
    );
    let settled = app
        .post("/api/admin/disputes/dp_123/settle", &admin, json!({}))
        .await;
    assert_eq!(settled.status, StatusCode::OK, "{:?}", settled.json());
    let settled = settled.json();
    assert_eq!(settled["settled"], true);
    assert_eq!(settled["blocked"], false);
    assert_eq!(settled["batchStatus"], "refunded");
    let payment: (String, i32) =
        sqlx::query_as("select status, refunded_cents from payments where payment_intent_id = $1")
            .bind(&intent)
            .fetch_one(&app.state.pool)
            .await
            .unwrap();
    assert_eq!(payment, ("refunded".to_owned(), 290));
    // The refund's own void stays; the block was undone.
    let active: Vec<Value> = voids(&app, &token, &event)
        .await
        .into_iter()
        .filter(|void| void["undoneAt"].is_null())
        .collect();
    assert_eq!(active.len(), 1);
    // Organizers never see the admins' disputes.
    assert_eq!(
        app.get("/api/admin/disputes", &token).await.status,
        StatusCode::FORBIDDEN
    );
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn a_refused_webhook_signature_alerts_the_admins(pool: PgPool) {
    let (app, _stripe) = TestApp::with_stripe(pool).await;
    let admin = app.login(ADMIN).await;
    for _ in 0..3 {
        assert_eq!(
            webhook(
                &app,
                "whsec_wrong",
                "charge.dispute.created",
                &dispute("pi_x", "needs_response")
            )
            .await,
            StatusCode::BAD_REQUEST
        );
    }
    let alerts = app.get("/api/admin/alerts", &admin).await.json();
    assert_eq!(alerts["open"], 1);
    assert_eq!(alerts["alerts"][0]["kind"], "stripe_webhook");
    assert_eq!(alerts["alerts"][0]["count"], 3);
}
