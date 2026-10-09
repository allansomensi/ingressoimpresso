//! Online payment of batches (ADR 0020) against an in-memory Stripe: checkout, signed webhooks,
//! the return-to-site sync and the interplay with cancel and the admin fallback.

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
use common::{ADMIN, Reply, TestApp, WEBHOOK_SECRET};
use ingressoimpresso_server::payments::{FakeStripe, sign_payload};
use serde_json::{Value, json};
use sqlx::PgPool;

async fn batch(app: &TestApp, token: &str, event: &str, quantity: i32) -> Value {
    let reply = app
        .post(
            &format!("/api/events/{event}/batches"),
            token,
            json!({ "quantity": quantity }),
        )
        .await;
    assert_eq!(reply.status, StatusCode::CREATED);
    reply.json()
}

async fn checkout(app: &TestApp, token: &str, batch_id: &str) -> Reply {
    app.request(
        Method::POST,
        &format!("/api/batches/{batch_id}/checkout"),
        Some(token),
        None,
    )
    .await
}

async fn batch_status(app: &TestApp, token: &str, event: &str, batch_id: &str) -> Value {
    let batches = app
        .get(&format!("/api/events/{event}/batches"), token)
        .await
        .json();
    batches
        .as_array()
        .unwrap()
        .iter()
        .find(|item| item["id"] == batch_id)
        .unwrap()
        .clone()
}

/// Sends a webhook event signed with `secret`.
async fn webhook(app: &TestApp, secret: &str, kind: &str, session: &Value) -> StatusCode {
    let payload = serde_json::to_vec(&json!({
        "id": format!("evt_{}", uuid::Uuid::new_v4().simple()),
        "object": "event",
        "type": kind,
        "data": { "object": session },
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

fn session_json(session: &ingressoimpresso_server::payments::CheckoutSession) -> Value {
    json!({
        "id": session.id,
        "object": "checkout.session",
        "url": session.url,
        "status": session.status,
        "payment_status": session.payment_status,
        "amount_total": session.amount_total,
        "currency": session.currency,
        "payment_intent": session.payment_intent,
        "expires_at": session.expires_at,
    })
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn pricing_is_public_and_batches_carry_their_price(pool: PgPool) {
    let app = TestApp::new(pool);
    let pricing = app.request(Method::GET, "/api/pricing", None, None).await;
    assert_eq!(pricing.status, StatusCode::OK);
    let pricing = pricing.json();
    assert_eq!(pricing["currency"], "brl");
    assert_eq!(pricing["onlinePayment"], false);
    assert_eq!(pricing["tiers"][0], json!({ "upTo": 100, "unitCents": 15 }));

    let token = app.login("banda@exemplo.com").await;
    let event = app.create_event(&token, "Show").await;
    let created = batch(&app, &token, &event, 150).await;
    assert_eq!(created["priceCents"], 100 * 15 + 50 * 10);
    assert_eq!(created["pendingPayment"], Value::Null);
    assert_eq!(created["paidVia"], Value::Null);

    // Without Stripe, checkout is unavailable and the admin fallback still works.
    let reply = checkout(&app, &token, created["id"].as_str().unwrap()).await;
    assert_eq!(reply.status, StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(reply.error_code(), "payments_unavailable");
    let admin = app.login(ADMIN).await;
    let paid = app
        .request(
            Method::POST,
            &format!(
                "/api/admin/batches/{}/mark-paid",
                created["id"].as_str().unwrap()
            ),
            Some(&admin),
            None,
        )
        .await
        .json();
    assert_eq!(
        (paid["status"].as_str(), paid["paidVia"].as_str()),
        (Some("paid"), Some("admin"))
    );
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn checkout_and_signed_webhook_pay_the_batch_once(pool: PgPool) {
    let (app, stripe) = TestApp::with_stripe(pool);
    let token = app.login("banda@exemplo.com").await;
    let event = app.create_event(&token, "Show de Lançamento").await;
    let created = batch(&app, &token, &event, 10).await;
    let batch_id = created["id"].as_str().unwrap().to_owned();
    assert_eq!(created["priceCents"], 290, "minimum charge");

    // Another organization cannot pay (or see) the batch.
    let intruder = app.login("intruso@exemplo.com").await;
    assert_eq!(
        checkout(&app, &intruder, &batch_id).await.status,
        StatusCode::NOT_FOUND
    );

    let first = checkout(&app, &token, &batch_id).await;
    assert_eq!(first.status, StatusCode::OK);
    let url = first.json()["url"].as_str().unwrap().to_owned();
    assert!(url.starts_with("https://checkout.stripe.test/"));
    // A second click reuses the open session.
    assert_eq!(checkout(&app, &token, &batch_id).await.json()["url"], url);
    let (session_id, request) = {
        let stripe = stripe.lock().unwrap();
        assert_eq!(stripe.requests.len(), 1);
        let request = stripe.requests[0].clone();
        (stripe.sessions.keys().next().unwrap().clone(), request)
    };
    assert_eq!(request.amount_cents, 290);
    assert_eq!(request.customer_email, "banda@exemplo.com");
    assert!(request.description.contains("Show de Lançamento"));
    assert!(request.description.contains("nº 1 a 10"));
    assert_eq!(
        request.success_url,
        format!(
            "http://localhost:3000/painel/eventos/{event}?aba=lotes&lote={batch_id}&pagamento=sucesso"
        )
    );
    assert!(request.cancel_url.ends_with("&pagamento=cancelado"));
    assert_eq!(
        batch_status(&app, &token, &event, &batch_id).await["pendingPayment"],
        "open"
    );

    // Unsigned or wrongly signed events change nothing.
    let paid_session = stripe.lock().unwrap().pay(&session_id).unwrap();
    let body = session_json(&paid_session);
    assert_eq!(
        webhook(&app, "whsec_wrong", "checkout.session.completed", &body).await,
        StatusCode::BAD_REQUEST
    );
    let unsigned = app
        .send(
            Request::builder()
                .method(Method::POST)
                .uri("/api/stripe/webhook")
                .body(Body::from(serde_json::to_vec(&body).unwrap()))
                .unwrap(),
        )
        .await;
    assert_eq!(unsigned.status, StatusCode::BAD_REQUEST);
    assert_eq!(
        batch_status(&app, &token, &event, &batch_id).await["status"],
        "awaiting_payment"
    );

    // The signed event pays the batch; a replay is harmless.
    for _ in 0..2 {
        assert_eq!(
            webhook(&app, WEBHOOK_SECRET, "checkout.session.completed", &body).await,
            StatusCode::OK
        );
    }
    let paid = batch_status(&app, &token, &event, &batch_id).await;
    assert_eq!(
        (
            paid["status"].as_str(),
            paid["paidVia"].as_str(),
            paid["pendingPayment"].as_str()
        ),
        (Some("paid"), Some("stripe"), None)
    );
    let payment: (String, Option<String>) = sqlx::query_as(
        "select status, payment_intent_id from payments where checkout_session_id = $1",
    )
    .bind(&session_id)
    .fetch_one(&app.state.pool)
    .await
    .unwrap();
    assert_eq!(
        payment,
        ("paid".to_owned(), Some(format!("pi_{session_id}")))
    );
    // The payer gets one e-mail (ADR 0028), however many times the webhook arrives.
    let paid_mails: Vec<_> = app
        .sent
        .lock()
        .unwrap()
        .iter()
        .filter(|mail| mail.subject.starts_with("Pagamento confirmado"))
        .cloned()
        .collect();
    assert_eq!(paid_mails.len(), 1);
    assert!(paid_mails[0].html.contains("aba=arquivos"));

    // A paid batch is neither payable nor cancelable.
    assert_eq!(
        checkout(&app, &token, &batch_id).await.error_code(),
        "batch_not_payable"
    );
    let cancel = app
        .request(
            Method::POST,
            &format!("/api/batches/{batch_id}/cancel"),
            Some(&token),
            None,
        )
        .await;
    assert_eq!(cancel.error_code(), "batch_not_cancelable");
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn mismatched_amounts_and_unknown_sessions_pay_nothing(pool: PgPool) {
    let (app, stripe) = TestApp::with_stripe(pool);
    let token = app.login("banda@exemplo.com").await;
    let event = app.create_event(&token, "Show").await;
    let batch_id = batch(&app, &token, &event, 200).await["id"]
        .as_str()
        .unwrap()
        .to_owned();
    checkout(&app, &token, &batch_id).await;
    let session_id = stripe
        .lock()
        .unwrap()
        .sessions
        .keys()
        .next()
        .unwrap()
        .clone();
    let mut session = stripe.lock().unwrap().pay(&session_id).unwrap();
    session.amount_total = Some(1);
    assert_eq!(
        webhook(
            &app,
            WEBHOOK_SECRET,
            "checkout.session.completed",
            &session_json(&session)
        )
        .await,
        StatusCode::OK
    );
    session.id = "cs_from_another_app".to_owned();
    session.amount_total = Some(7_000);
    webhook(
        &app,
        WEBHOOK_SECRET,
        "checkout.session.completed",
        &session_json(&session),
    )
    .await;
    assert_eq!(
        batch_status(&app, &token, &event, &batch_id).await["status"],
        "awaiting_payment"
    );
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn returning_payer_syncs_and_expired_sessions_are_replaced(pool: PgPool) {
    let (app, stripe) = TestApp::with_stripe(pool);
    let token = app.login("banda@exemplo.com").await;
    let event = app.create_event(&token, "Show").await;
    let batch_id = batch(&app, &token, &event, 50).await["id"]
        .as_str()
        .unwrap()
        .to_owned();
    let sync = format!("/api/batches/{batch_id}/checkout/sync");

    // Expired without paying: the next checkout opens a new session.
    let first_url = checkout(&app, &token, &batch_id).await.json()["url"].clone();
    let first_id = stripe
        .lock()
        .unwrap()
        .sessions
        .keys()
        .next()
        .unwrap()
        .clone();
    let expired = stripe
        .lock()
        .unwrap()
        .sessions
        .get_mut(&first_id)
        .map(|session| {
            session.status = Some("expired".to_owned());
            session.url = None;
            session.clone()
        })
        .unwrap();
    webhook(
        &app,
        WEBHOOK_SECRET,
        "checkout.session.expired",
        &session_json(&expired),
    )
    .await;
    let second_url = checkout(&app, &token, &batch_id).await.json()["url"].clone();
    assert_ne!(first_url, second_url);

    // Paid (Pix confirmed), webhook not delivered yet: the return to the site settles it.
    let second_id = stripe
        .lock()
        .unwrap()
        .sessions
        .keys()
        .find(|id| **id != first_id)
        .unwrap()
        .clone();
    let pending = app
        .request(Method::POST, &sync, Some(&token), None)
        .await
        .json();
    assert_eq!(pending["status"], "awaiting_payment");
    assert_eq!(pending["pendingPayment"], "open");
    stripe.lock().unwrap().pay(&second_id);
    let paid = app.request(Method::POST, &sync, Some(&token), None).await;
    assert_eq!(paid.status, StatusCode::OK);
    assert_eq!(paid.json()["status"], "paid");
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn cancel_and_admin_close_open_checkouts(pool: PgPool) {
    let (app, stripe) = TestApp::with_stripe(pool);
    let token = app.login("banda@exemplo.com").await;
    let admin = app.login(ADMIN).await;
    let event = app.create_event(&token, "Show").await;

    // Cancel expires the open session, so nobody pays for a canceled batch.
    let canceled_id = batch(&app, &token, &event, 10).await["id"]
        .as_str()
        .unwrap()
        .to_owned();
    checkout(&app, &token, &canceled_id).await;
    let reply = app
        .request(
            Method::POST,
            &format!("/api/batches/{canceled_id}/cancel"),
            Some(&token),
            None,
        )
        .await;
    assert_eq!(reply.json()["status"], "canceled");
    assert!(
        stripe
            .lock()
            .unwrap()
            .sessions
            .values()
            .all(|session| session.status.as_deref() == Some("expired"))
    );

    // A session paid just before the cancel wins: the batch is paid, not canceled.
    let raced_id = batch(&app, &token, &event, 10).await["id"]
        .as_str()
        .unwrap()
        .to_owned();
    checkout(&app, &token, &raced_id).await;
    let open_id = stripe
        .lock()
        .unwrap()
        .sessions
        .iter()
        .find(|(_, session)| session.status.as_deref() == Some("open"))
        .map(|(id, _)| id.clone())
        .unwrap();
    stripe.lock().unwrap().pay(&open_id);
    let reply = app
        .request(
            Method::POST,
            &format!("/api/batches/{raced_id}/cancel"),
            Some(&token),
            None,
        )
        .await;
    assert_eq!(reply.error_code(), "batch_not_cancelable");
    assert_eq!(
        batch_status(&app, &token, &event, &raced_id).await["paidVia"],
        "stripe"
    );

    // The admin fallback also closes the open session first.
    let manual_id = batch(&app, &token, &event, 10).await["id"]
        .as_str()
        .unwrap()
        .to_owned();
    checkout(&app, &token, &manual_id).await;
    let paid = app
        .request(
            Method::POST,
            &format!("/api/admin/batches/{manual_id}/mark-paid"),
            Some(&admin),
            None,
        )
        .await
        .json();
    assert_eq!(
        (paid["paidVia"].as_str(), paid["pendingPayment"].as_str()),
        (Some("admin"), None)
    );
    assert!(
        stripe
            .lock()
            .unwrap()
            .sessions
            .values()
            .all(|session| session.status.as_deref() != Some("open"))
    );
}

fn open_session(stripe: &std::sync::Mutex<FakeStripe>) -> String {
    stripe
        .lock()
        .unwrap()
        .sessions
        .iter()
        .find(|(_, session)| session.status.as_deref() == Some("open"))
        .map(|(id, _)| id.clone())
        .unwrap()
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn a_pending_pix_blocks_cancel_mark_paid_and_new_checkouts(pool: PgPool) {
    let (app, stripe) = TestApp::with_stripe(pool);
    let token = app.login("banda@exemplo.com").await;
    let admin = app.login(ADMIN).await;
    let event = app.create_event(&token, "Show").await;
    let batch_id = batch(&app, &token, &event, 10).await["id"]
        .as_str()
        .unwrap()
        .to_owned();
    checkout(&app, &token, &batch_id).await;
    let session_id = open_session(&stripe);

    // The payer chose Pix: the session completes unpaid while the transfer is pending.
    let pending = stripe.lock().unwrap().show_pix(&session_id).unwrap();
    webhook(
        &app,
        WEBHOOK_SECRET,
        "checkout.session.completed",
        &session_json(&pending),
    )
    .await;
    assert_eq!(
        batch_status(&app, &token, &event, &batch_id).await["pendingPayment"],
        "processing"
    );
    assert_eq!(
        checkout(&app, &token, &batch_id).await.error_code(),
        "payment_pending"
    );
    let cancel = app
        .request(
            Method::POST,
            &format!("/api/batches/{batch_id}/cancel"),
            Some(&token),
            None,
        )
        .await;
    assert_eq!(cancel.error_code(), "payment_pending");
    let mark = app
        .request(
            Method::POST,
            &format!("/api/admin/batches/{batch_id}/mark-paid"),
            Some(&admin),
            None,
        )
        .await;
    assert_eq!(mark.error_code(), "payment_pending");

    // The transfer lands.
    let paid = stripe.lock().unwrap().pay(&session_id).unwrap();
    webhook(
        &app,
        WEBHOOK_SECRET,
        "checkout.session.async_payment_succeeded",
        &session_json(&paid),
    )
    .await;
    let batch = batch_status(&app, &token, &event, &batch_id).await;
    assert_eq!(
        (batch["status"].as_str(), batch["pendingPayment"].as_str()),
        (Some("paid"), None)
    );
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn a_failed_pix_frees_the_batch(pool: PgPool) {
    let (app, stripe) = TestApp::with_stripe(pool);
    let token = app.login("banda@exemplo.com").await;
    let event = app.create_event(&token, "Show").await;
    let batch_id = batch(&app, &token, &event, 10).await["id"]
        .as_str()
        .unwrap()
        .to_owned();
    checkout(&app, &token, &batch_id).await;
    let session_id = open_session(&stripe);
    let pending = stripe.lock().unwrap().show_pix(&session_id).unwrap();
    webhook(
        &app,
        WEBHOOK_SECRET,
        "checkout.session.completed",
        &session_json(&pending),
    )
    .await;
    webhook(
        &app,
        WEBHOOK_SECRET,
        "checkout.session.async_payment_failed",
        &session_json(&pending),
    )
    .await;
    assert_eq!(
        batch_status(&app, &token, &event, &batch_id).await["pendingPayment"],
        Value::Null
    );
    // A new attempt opens a new session.
    let retry = checkout(&app, &token, &batch_id).await;
    assert_eq!(retry.status, StatusCode::OK);
    assert_eq!(stripe.lock().unwrap().sessions.len(), 2);
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn an_expiring_session_is_closed_before_a_new_one(pool: PgPool) {
    let (app, stripe) = TestApp::with_stripe(pool);
    let token = app.login("banda@exemplo.com").await;
    let event = app.create_event(&token, "Show").await;
    let batch_id = batch(&app, &token, &event, 10).await["id"]
        .as_str()
        .unwrap()
        .to_owned();
    checkout(&app, &token, &batch_id).await;
    let first = open_session(&stripe);
    // Ten minutes left: too little to pay, so it is not offered again.
    sqlx::query("update payments set expires_at = now() + interval '10 minutes'")
        .execute(&app.state.pool)
        .await
        .unwrap();
    assert_eq!(
        checkout(&app, &token, &batch_id).await.status,
        StatusCode::OK
    );
    let stripe = stripe.lock().unwrap();
    assert_eq!(stripe.sessions.len(), 2);
    assert_eq!(stripe.sessions[&first].status.as_deref(), Some("expired"));
    assert_eq!(
        stripe
            .sessions
            .values()
            .filter(|session| session.status.as_deref() == Some("open"))
            .count(),
        1,
        "never two payable sessions"
    );
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn batches_with_ranges_cannot_be_canceled(pool: PgPool) {
    let app = TestApp::new(pool);
    let token = app.login("banda@exemplo.com").await;
    let event = app.create_event(&token, "Show").await;
    let batch_id = batch(&app, &token, &event, 100).await["id"]
        .as_str()
        .unwrap()
        .to_owned();
    let seller = app
        .post(
            &format!("/api/events/{event}/sellers"),
            &token,
            json!({ "name": "João", "phone": null }),
        )
        .await
        .json();
    let range = app
        .post(
            &format!("/api/sellers/{}/ranges", seller["id"].as_str().unwrap()),
            &token,
            json!({ "first": 1, "last": 50 }),
        )
        .await
        .json();
    let path = format!("/api/batches/{batch_id}/cancel");
    let cancel = || app.request(Method::POST, &path, Some(&token), None);
    assert_eq!(cancel().await.error_code(), "batch_has_ranges");
    let removed = app
        .request(
            Method::DELETE,
            &format!("/api/ranges/{}", range["id"].as_str().unwrap()),
            Some(&token),
            None,
        )
        .await;
    assert!(removed.status.is_success());
    assert_eq!(cancel().await.json()["status"], "canceled");
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn the_first_tickets_of_an_organization_are_free(pool: PgPool) {
    let app = TestApp::with_free_tickets(pool, 30);
    let token = app.login("banda@exemplo.com").await;
    let event = app.create_event(&token, "Show").await;
    let account = app.get("/api/account", &token).await.json();
    assert_eq!(
        (
            account["freeTicketsLeft"].as_i64(),
            account["freeTicketsTotal"].as_i64()
        ),
        (Some(30), Some(30))
    );

    // Entirely free: born paid, nothing to charge.
    let free = batch(&app, &token, &event, 20).await;
    assert_eq!(
        (
            free["status"].as_str(),
            free["paidVia"].as_str(),
            free["priceCents"].as_i64(),
            free["freeTickets"].as_i64()
        ),
        (Some("paid"), Some("free"), Some(0), Some(20))
    );
    // The rest of the allowance comes off the next batch, in any event of the organization.
    let other = app.create_event(&token, "Outro show").await;
    let mixed = batch(&app, &token, &other, 110).await;
    assert_eq!(
        (
            mixed["status"].as_str(),
            mixed["freeTickets"].as_i64(),
            mixed["priceCents"].as_i64()
        ),
        (Some("awaiting_payment"), Some(10), Some(1_500))
    );
    let account = app.get("/api/account", &token).await.json();
    assert_eq!(account["freeTicketsLeft"], 0);
    assert_eq!(account["paidTickets"], 20);

    // Canceling an unpaid batch gives its free tickets back.
    let cancel = app
        .request(
            Method::POST,
            &format!("/api/batches/{}/cancel", mixed["id"].as_str().unwrap()),
            Some(&token),
            None,
        )
        .await;
    assert_eq!(cancel.json()["status"], "canceled");
    assert_eq!(
        app.get("/api/account", &token).await.json()["freeTicketsLeft"],
        10
    );
    // Another organization has its own allowance.
    let other_org = app.login("escola@exemplo.com").await;
    assert_eq!(
        app.get("/api/account", &other_org).await.json()["freeTicketsLeft"],
        30
    );
}
