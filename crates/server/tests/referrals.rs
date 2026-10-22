//! Refer and earn (ADR 0076): a code links a new account to its referrer; the first batch paid
//! with real money gives both their credit, once, even when the webhook and the payer's return
//! race; the referrer's own people, repeated e-mails and small batches earn nothing; a refund
//! takes back what is left of the reward.

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
use ingressoimpresso_server::payments::{CheckoutSession, FakeStripe, sign_payload};
use serde_json::{Value, json};
use sqlx::PgPool;

/// Signs up (or in) with a referral code; returns the token and whether a referral was recorded.
async fn sign_up(app: &TestApp, email: &str, code: Option<&str>) -> (String, bool) {
    let reply = app
        .request(
            Method::POST,
            "/api/auth/code",
            None,
            Some(json!({ "email": email })),
        )
        .await;
    assert_eq!(reply.status, StatusCode::NO_CONTENT);
    let reply = app
        .request(
            Method::POST,
            "/api/auth/verify",
            None,
            Some(json!({ "email": email, "code": app.last_code(email), "referralCode": code })),
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK, "{:?}", reply.json());
    let body = reply.json();
    (
        body["token"].as_str().unwrap().to_owned(),
        body["referred"].as_bool().unwrap(),
    )
}

async fn referrals(app: &TestApp, token: &str) -> Value {
    let reply = app.get("/api/account/referrals", token).await;
    assert_eq!(reply.status, StatusCode::OK, "{:?}", reply.json());
    reply.json()
}

async fn balance(app: &TestApp, token: &str) -> i64 {
    app.get("/api/account/credits", token).await.json()["balanceCents"]
        .as_i64()
        .unwrap()
}

async fn batch(app: &TestApp, token: &str, event: &str, quantity: i32) -> String {
    app.create_batch(token, event, quantity).await["id"]
        .as_str()
        .unwrap()
        .to_owned()
}

async fn mark_paid(app: &TestApp, admin: &str, batch_id: &str) {
    let reply = app
        .request(
            Method::POST,
            &format!("/api/admin/batches/{batch_id}/mark-paid"),
            Some(admin),
            None,
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK, "{:?}", reply.json());
}

async fn set_program(app: &TestApp, admin: &str, body: Value) -> Value {
    let mut full = json!({
        "enabled": true,
        "referrerCents": 1000,
        "referredCents": 1000,
        "monthlyLimit": 10,
        "minBatchCents": 1500,
    });
    for (key, value) in body.as_object().unwrap() {
        full[key] = value.clone();
    }
    let reply = app.put("/api/admin/referrals/settings", admin, full).await;
    assert_eq!(reply.status, StatusCode::OK, "{:?}", reply.json());
    reply.json()
}

fn session_json(session: &CheckoutSession) -> Value {
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

async fn webhook(app: &TestApp, kind: &str, object: &Value) -> StatusCode {
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
        .header(
            "stripe-signature",
            sign_payload(WEBHOOK_SECRET, &payload, now),
        )
        .body(Body::from(payload))
        .unwrap();
    app.send(request).await.status
}

/// Opens the batch's checkout and pays it on the fake Stripe; returns the paid session.
async fn pay_on_stripe(
    app: &TestApp,
    stripe: &std::sync::Mutex<FakeStripe>,
    token: &str,
    batch_id: &str,
) -> CheckoutSession {
    let reply = app
        .request(
            Method::POST,
            &format!("/api/batches/{batch_id}/checkout"),
            Some(token),
            None,
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK, "{:?}", reply.json());
    let session_id = stripe
        .lock()
        .unwrap()
        .sessions
        .values()
        .find(|session| session.status.as_deref() == Some("open"))
        .unwrap()
        .id
        .clone();
    stripe.lock().unwrap().pay(&session_id).unwrap()
}

async fn referral_credits(app: &TestApp) -> i64 {
    sqlx::query_scalar("select count(*) from credit_ledger where reason = 'referral'")
        .fetch_one(&app.state.pool)
        .await
        .unwrap()
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn the_first_paid_batch_rewards_both_once(pool: PgPool) {
    let (app, stripe) = TestApp::with_stripe(pool).await;
    let ana = app.login("ana@banda.com.br").await;
    let mine = referrals(&app, &ana).await;
    let code = mine["code"].as_str().unwrap().to_owned();
    assert_eq!(code.len(), 8);
    assert_eq!(
        (
            &mine["enabled"],
            &mine["referrerCents"],
            &mine["referredCents"]
        ),
        (&json!(true), &json!(1000), &json!(1000))
    );
    assert_eq!(mine["invitedBy"], Value::Null);
    // The same code every time.
    assert_eq!(referrals(&app, &ana).await["code"], code.as_str());

    // The sign-up page learns who invites, in any case; unknown codes are 404.
    let invite = app
        .request(
            Method::GET,
            &format!("/api/referrals/{}", code.to_lowercase()),
            None,
            None,
        )
        .await;
    assert_eq!(invite.status, StatusCode::OK);
    // Still named after its owner's e-mail: a public invite never shows it.
    assert_eq!(invite.json()["organizationName"], Value::Null);
    assert_eq!(invite.json()["referredCents"], 1000);
    let unknown = app
        .request(Method::GET, "/api/referrals/ZZZZZZZZ", None, None)
        .await;
    assert_eq!(unknown.status, StatusCode::NOT_FOUND);

    let (maria, referred) = sign_up(&app, "Maria.Souza@gmail.com", Some(&code)).await;
    assert!(referred);
    let list = referrals(&app, &ana).await["referrals"].clone();
    assert_eq!(list.as_array().unwrap().len(), 1);
    assert_eq!(list[0]["emailHint"], "ma•••@gmail.com");
    assert_eq!(list[0]["status"], "pending");
    let invited = referrals(&app, &maria).await["invitedBy"].clone();
    assert_eq!(
        invited,
        json!({ "organizationName": null, "status": "pending", "referredCents": 1000 })
    );

    // A batch under the minimum (10 tickets: R$ 2,90) is paid, but earns nothing.
    let event = app.create_event(&maria, "Sarau").await;
    let small = batch(&app, &maria, &event, 10).await;
    let paid = pay_on_stripe(&app, &stripe, &maria, &small).await;
    assert_eq!(
        webhook(&app, "checkout.session.completed", &session_json(&paid)).await,
        StatusCode::OK
    );
    assert_eq!(referral_credits(&app).await, 0);

    // 100 tickets cost R$ 15: the webhook and the payer's return arrive together.
    let big = batch(&app, &maria, &event, 100).await;
    let paid = pay_on_stripe(&app, &stripe, &maria, &big).await;
    let session = session_json(&paid);
    let sync_uri = format!("/api/batches/{big}/checkout/sync");
    let (hook, back, hook_again) = tokio::join!(
        webhook(&app, "checkout.session.completed", &session),
        app.request(Method::POST, &sync_uri, Some(&maria), None),
        webhook(&app, "checkout.session.completed", &session),
    );
    assert_eq!(hook, StatusCode::OK);
    assert_eq!(hook_again, StatusCode::OK);
    assert_eq!(back.status, StatusCode::OK);
    assert_eq!(back.json()["status"], "paid");
    assert_eq!(referral_credits(&app).await, 2);
    assert_eq!(balance(&app, &ana).await, 1000);
    assert_eq!(balance(&app, &maria).await, 1000);
    // A replay later changes nothing.
    assert_eq!(
        webhook(&app, "checkout.session.completed", &session).await,
        StatusCode::OK
    );
    assert_eq!(referral_credits(&app).await, 2);

    let mine = referrals(&app, &ana).await;
    assert_eq!(mine["earnedCents"], 1000);
    assert_eq!(mine["referrals"][0]["status"], "rewarded");
    assert_eq!(mine["referrals"][0]["earnedCents"], 1000);
    assert_eq!(
        referrals(&app, &maria).await["invitedBy"]["status"],
        "rewarded"
    );
    let inbox = app.get("/api/inbox", &ana).await.json();
    assert!(
        inbox["notifications"]
            .as_array()
            .unwrap()
            .iter()
            .any(|item| item["kind"] == "referral_rewarded"),
        "{inbox}"
    );

    // The export carries the referral, with the masked e-mail only.
    let export = app.get("/api/account/export", &ana).await.json();
    assert_eq!(export["organization"]["referrals"]["code"], code.as_str());
    assert_eq!(
        export["organization"]["referrals"]["referred"][0]["email"],
        "ma•••@gmail.com"
    );

    // A partial refund that leaves less than the minimum paid takes the reward back too.
    let intent = paid.payment_intent.clone().unwrap();
    let partial = json!({
        "id": format!("ch_{intent}"),
        "object": "charge",
        "amount": 1500,
        "amount_refunded": 1000,
        "refunded": false,
        "currency": "brl",
        "payment_intent": intent,
    });
    assert_eq!(
        webhook(&app, "charge.refunded", &partial).await,
        StatusCode::OK
    );
    assert_eq!(
        referrals(&app, &ana).await["referrals"][0]["status"],
        "revoked"
    );
    assert_eq!(balance(&app, &ana).await, 0);
    assert_eq!(balance(&app, &maria).await, 0);
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn own_people_repeats_and_a_closed_program_earn_nothing(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let admin = app.login(ADMIN).await;
    let ana = app.login("ana@banda.com.br").await;
    let code = referrals(&app, &ana).await["code"]
        .as_str()
        .unwrap()
        .to_owned();
    let joao = app.login("joao.silva@gmail.com").await;
    let joao_code = referrals(&app, &joao).await["code"]
        .as_str()
        .unwrap()
        .to_owned();

    // The same company domain, the same Gmail mailbox, someone on the referrer's team.
    assert!(!sign_up(&app, "pedro@banda.com.br", Some(&code)).await.1);
    assert!(
        !sign_up(&app, "joaosilva+2@gmail.com", Some(&joao_code))
            .await
            .1
    );
    let event = app.create_event(&ana, "Show").await;
    let added = app
        .post(
            &format!("/api/events/{event}/team"),
            &ana,
            json!({ "email": "roadie@gmail.com", "name": null, "areas": ["door"] }),
        )
        .await;
    assert_eq!(added.status, StatusCode::CREATED, "{:?}", added.json());
    assert!(!sign_up(&app, "roadie@gmail.com", Some(&code)).await.1);
    // An existing account signing in with a code is no referral; a bad code is ignored.
    assert!(!sign_up(&app, "joao.silva@gmail.com", Some(&code)).await.1);
    assert!(!sign_up(&app, "bia@gmail.com", Some("??")).await.1);

    // One e-mail counts once, ever: deleting the account and coming back does not repeat it.
    let (carla, referred) = sign_up(&app, "carla@gmail.com", Some(&code)).await;
    assert!(referred);
    let gone = app
        .delete(
            "/api/account",
            &carla,
            Some(json!({ "email": "carla@gmail.com" })),
        )
        .await;
    assert_eq!(gone.status, StatusCode::NO_CONTENT, "{:?}", gone.json());
    assert!(!sign_up(&app, "Carla+volta@gmail.com", Some(&code)).await.1);
    let list = referrals(&app, &ana).await["referrals"].clone();
    assert_eq!(list.as_array().unwrap().len(), 1, "{list}");
    // Only the keyed hash stays: the referrer no longer sees the deleted account's e-mail hint.
    assert_eq!(list[0]["emailHint"], "", "{list}");

    // A closed program: the invite is 404 and new accounts are not linked.
    let settings = set_program(&app, &admin, json!({ "enabled": false })).await;
    assert_eq!(settings["settings"]["enabled"], false);
    let invite = app
        .request(Method::GET, &format!("/api/referrals/{code}"), None, None)
        .await;
    assert_eq!(invite.status, StatusCode::NOT_FOUND);
    assert!(!sign_up(&app, "davi@gmail.com", Some(&code)).await.1);
    let audited: i64 = sqlx::query_scalar(
        "select count(*) from audit_log where action = 'referral_settings_update'",
    )
    .fetch_one(&app.state.pool)
    .await
    .unwrap();
    assert_eq!(audited, 1);
    // Only admins change it.
    let refused = app
        .put(
            "/api/admin/referrals/settings",
            &ana,
            json!({ "enabled": true, "referrerCents": 99999, "referredCents": 0, "monthlyLimit": 1, "minBatchCents": 0 }),
        )
        .await;
    assert_eq!(refused.status, StatusCode::FORBIDDEN);
    let invalid = app
        .put(
            "/api/admin/referrals/settings",
            &admin,
            json!({ "enabled": true, "referrerCents": -1, "referredCents": 0, "monthlyLimit": 1, "minBatchCents": 0 }),
        )
        .await;
    assert_eq!(invalid.error_code(), "invalid_amount");
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn the_monthly_limit_holds_and_refunds_take_the_reward_back(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let admin = app.login(ADMIN).await;
    set_program(
        &app,
        &admin,
        json!({ "monthlyLimit": 1, "minBatchCents": 290, "referrerCents": 500, "referredCents": 800 }),
    )
    .await;
    let ana = app.login("ana@banda.com.br").await;
    let code = referrals(&app, &ana).await["code"]
        .as_str()
        .unwrap()
        .to_owned();
    let (bia, _) = sign_up(&app, "bia@gmail.com", Some(&code)).await;
    let (caio, _) = sign_up(&app, "caio@gmail.com", Some(&code)).await;

    // Bia pays first: both earn. Caio pays next: the referrer is over the limit, Caio earns.
    let bia_event = app.create_event(&bia, "Festa").await;
    let bia_batch = batch(&app, &bia, &bia_event, 10).await;
    mark_paid(&app, &admin, &bia_batch).await;
    let caio_event = app.create_event(&caio, "Quermesse").await;
    let caio_batch = batch(&app, &caio, &caio_event, 10).await;
    mark_paid(&app, &admin, &caio_batch).await;
    assert_eq!(balance(&app, &ana).await, 500);
    assert_eq!(balance(&app, &bia).await, 800);
    assert_eq!(balance(&app, &caio).await, 800);
    let list = referrals(&app, &ana).await["referrals"].clone();
    let caio_row = list
        .as_array()
        .unwrap()
        .iter()
        .find(|row| row["emailHint"] == "ca•••@gmail.com")
        .unwrap()
        .clone();
    assert_eq!(
        (
            &caio_row["status"],
            &caio_row["capped"],
            &caio_row["earnedCents"]
        ),
        (&json!("rewarded"), &json!(true), &json!(0))
    );

    // A batch paid with credit never earns (Caio's credit covers 10 tickets: R$ 2,90).
    let covered = app.create_batch(&caio, &caio_event, 10).await;
    assert_eq!(covered["paidVia"], "credit");
    assert_eq!(balance(&app, &caio).await, 800 - 290);

    // Bia's batch is refunded in full before she used her credit: both rewards go back.
    let refund = app
        .post(
            &format!("/api/admin/batches/{bia_batch}/refund"),
            &admin,
            json!({ "refundOnStripe": false, "note": null }),
        )
        .await;
    assert_eq!(refund.status, StatusCode::OK, "{:?}", refund.json());
    assert_eq!(balance(&app, &bia).await, 0);
    assert_eq!(balance(&app, &ana).await, 0);
    let overview = app.get("/api/admin/referrals", &admin).await.json();
    assert_eq!(
        (
            &overview["totals"]["pending"],
            &overview["totals"]["rewarded"],
            &overview["totals"]["revoked"]
        ),
        (&json!(0), &json!(1), &json!(1))
    );
    let revoked = overview["referrals"]
        .as_array()
        .unwrap()
        .iter()
        .find(|row| row["status"] == "revoked")
        .unwrap()
        .clone();
    assert_eq!(revoked["revokeReason"], "batch_refunded");

    // An admin revokes Caio's: the whole reward comes off, the part already spent included, and
    // the balance stays owed until the next batches repay it (ADR 0119).
    let caio_id = overview["referrals"]
        .as_array()
        .unwrap()
        .iter()
        .find(|row| row["status"] == "rewarded")
        .unwrap()["id"]
        .as_str()
        .unwrap()
        .to_owned();
    let revoke_uri = format!("/api/admin/referrals/{caio_id}/revoke");
    let revoked = app
        .request(Method::POST, &revoke_uri, Some(&admin), None)
        .await;
    assert_eq!(revoked.status, StatusCode::OK);
    assert_eq!(balance(&app, &caio).await, -290);
    let again = app
        .request(Method::POST, &revoke_uri, Some(&admin), None)
        .await;
    assert_eq!(again.error_code(), "referral_revoked");
    let refused = app
        .request(Method::POST, &revoke_uri, Some(&ana), None)
        .await;
    assert_eq!(refused.status, StatusCode::FORBIDDEN);
    let audited: i64 =
        sqlx::query_scalar("select count(*) from audit_log where action = 'referral_revoke'")
            .fetch_one(&app.state.pool)
            .await
            .unwrap();
    assert_eq!(audited, 1);
}
