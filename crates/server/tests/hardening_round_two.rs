//! Hardening round of 2026-10-22 (ADR 0119): what a stranger, a rogue phone, a second account
//! or a team member with the wrong area can no longer do.

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
use common::door::{create_link, register, scan};
use common::{ADMIN, TestApp};
use ingressoimpresso_server::two_factor;
use serde_json::{Value, json};
use sqlx::PgPool;

fn decode_base32(text: &str) -> Vec<u8> {
    let alphabet = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let mut out = Vec::new();
    let (mut buffer, mut bits) = (0u32, 0);
    for byte in text.bytes().filter(|byte| *byte != b' ') {
        let value = alphabet.iter().position(|c| *c == byte).unwrap();
        buffer = (buffer << 5) | u32::try_from(value).unwrap();
        bits += 5;
        if bits >= 8 {
            bits -= 8;
            out.push(u8::try_from((buffer >> bits) & 0xff).unwrap());
        }
    }
    out
}

/// A request from a given address (the proxy's header, as in production).
async fn from_address(app: &TestApp, address: &str, uri: &str, body: Value) -> StatusCode {
    let request = Request::builder()
        .method(Method::POST)
        .uri(uri)
        .header("content-type", "application/json")
        .header("x-forwarded-for", address)
        .body(Body::from(serde_json::to_vec(&body).unwrap()))
        .unwrap();
    app.send(request).await.status
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn a_stranger_guessing_codes_never_locks_the_owner_out(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let victim = "ana@exemplo.com";
    let code_uri = "/api/auth/code";
    let verify_uri = "/api/auth/verify";
    // The stranger asks for codes and guesses wrong until their own address pauses.
    for _ in 0..2 {
        assert_eq!(
            from_address(&app, "203.0.113.7", code_uri, json!({ "email": victim })).await,
            StatusCode::NO_CONTENT
        );
        for _ in 0..5 {
            assert_eq!(
                from_address(
                    &app,
                    "203.0.113.7",
                    verify_uri,
                    json!({ "email": victim, "code": "000000" })
                )
                .await,
                StatusCode::BAD_REQUEST
            );
        }
    }
    assert_eq!(
        from_address(
            &app,
            "203.0.113.7",
            verify_uri,
            json!({ "email": victim, "code": "000000" })
        )
        .await,
        StatusCode::TOO_MANY_REQUESTS
    );
    // The owner, from their own phone, asks for a code and gets in.
    assert_eq!(
        from_address(&app, "198.51.100.2", code_uri, json!({ "email": victim })).await,
        StatusCode::NO_CONTENT
    );
    let code = app.last_code(victim);
    assert_eq!(
        from_address(
            &app,
            "198.51.100.2",
            verify_uri,
            json!({ "email": victim, "code": code })
        )
        .await,
        StatusCode::OK
    );
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn a_phone_only_reports_numbers_the_event_issued(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("banda@exemplo.com").await;
    let admin = app.login(ADMIN).await;
    let event = app.create_event(&token, "Show").await;
    let batch = app.create_batch(&token, &event, 10).await;
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
    let (_, access_token) = create_link(&app, &token, &event).await;
    let phone = register(&app, &access_token, "Porta 1").await;
    let upload = |scans: Vec<Value>| {
        let phone = &phone;
        let app = &app;
        async move {
            app.post(
                "/api/door/scans",
                &phone.secret,
                json!({ "scans": scans, "confirm": false }),
            )
            .await
        }
    };
    // A number of the paid batch, with its key: fine.
    let ok = upload(vec![scan(
        "00000000-0000-4000-8000-0000000000a1",
        Some(3),
        "admitted",
        0,
    )])
    .await;
    assert_eq!(ok.status, StatusCode::OK, "{:?}", ok.json());
    // A number the event never issued: the whole upload is refused.
    let beyond = upload(vec![scan(
        "00000000-0000-4000-8000-0000000000a2",
        Some(11),
        "admitted",
        0,
    )])
    .await;
    assert_eq!(beyond.error_code(), "invalid_scans");
    // A key the event never had.
    let mut wrong_key = scan(
        "00000000-0000-4000-8000-0000000000a3",
        Some(4),
        "admitted",
        0,
    );
    wrong_key["keyId"] = json!(7);
    assert_eq!(upload(vec![wrong_key]).await.error_code(), "invalid_scans");
    // A clock from before the product existed.
    let mut old = scan(
        "00000000-0000-4000-8000-0000000000a4",
        Some(4),
        "admitted",
        0,
    );
    old["scannedAtMs"] = json!(0);
    assert_eq!(upload(vec![old]).await.error_code(), "invalid_scans");
    // A refused QR may carry any number: the phone is only saying it was refused.
    let foreign = upload(vec![scan(
        "00000000-0000-4000-8000-0000000000a5",
        Some(11),
        "rejected_other_event",
        0,
    )])
    .await;
    assert_eq!(foreign.status, StatusCode::OK, "{:?}", foreign.json());
    let entered: i64 = sqlx::query_scalar("select count(*) from entries where event_id = $1")
        .bind(uuid::Uuid::parse_str(&event).unwrap())
        .fetch_one(&app.state.pool)
        .await
        .unwrap();
    assert_eq!(entered, 1);
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn free_tickets_go_once_per_mailbox(pool: PgPool) {
    let app = TestApp::with_free_tickets(pool, 30).await;
    let first = app.login("ana.silva@gmail.com").await;
    let event = app.create_event(&first, "Show").await;
    let batch = app.create_batch(&first, &event, 5).await;
    assert_eq!(batch["status"], "paid");
    assert_eq!(batch["freeTickets"], 5);
    // The same mailbox, spelled differently, is no new organizer.
    let second = app.login("AnaSilva+outra@googlemail.com").await;
    let event = app.create_event(&second, "Show de novo").await;
    let batch = app.create_batch(&second, &event, 5).await;
    assert_eq!(batch["status"], "awaiting_payment");
    assert_eq!(batch["freeTickets"], 0);
    // Another mailbox gets its own.
    let third = app.login("joao@exemplo.com").await;
    let event = app.create_event(&third, "Outro show").await;
    let batch = app.create_batch(&third, &event, 5).await;
    assert_eq!(batch["status"], "paid");
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn a_team_member_without_the_money_area_sees_no_credit(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let owner = app.login("banda@exemplo.com").await;
    let event = app.create_event(&owner, "Show").await;
    let added = app
        .post(
            &format!("/api/events/{event}/team"),
            &owner,
            json!({ "email": "porteiro@exemplo.com", "areas": ["door"] }),
        )
        .await;
    assert_eq!(added.status, StatusCode::CREATED, "{:?}", added.json());
    // Whether the e-mail already has an account is not told at once.
    assert_eq!(added.json()["member"]["joined"], false);
    let member = app.login("porteiro@exemplo.com").await;
    let quote = app
        .post(
            &format!("/api/events/{event}/batches/quote"),
            &member,
            json!({ "quantity": 10 }),
        )
        .await;
    assert_eq!(quote.status, StatusCode::OK, "{:?}", quote.json());
    assert_eq!(quote.json()["creditBalanceCents"], 0);
    assert!(quote.json()["discountCode"].is_null());
    let team = app.get(&format!("/api/events/{event}/team"), &owner).await;
    let members = team.json()["members"].as_array().unwrap().clone();
    assert_eq!(members[0]["joined"], true);
    // The platform's admins are never put on a team.
    assert_eq!(
        app.post(
            &format!("/api/events/{event}/team"),
            &owner,
            json!({ "email": ADMIN, "areas": ["door"] }),
        )
        .await
        .error_code(),
        "already_admin"
    );
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn turning_the_second_step_on_signs_the_other_phones_out(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let here = app.login("banda@exemplo.com").await;
    let elsewhere = app.login("banda@exemplo.com").await;
    let setup = app
        .post("/api/account/two-factor/setup", &here, json!({}))
        .await;
    assert_eq!(setup.status, StatusCode::OK, "{:?}", setup.json());
    let secret = decode_base32(setup.json()["secret"].as_str().unwrap());
    let step = time::OffsetDateTime::now_utc().unix_timestamp() / two_factor::STEP_SECONDS;
    let code = two_factor::code_at(&secret, step);
    let enabled = app
        .post(
            "/api/account/two-factor/enable",
            &here,
            json!({ "code": code }),
        )
        .await;
    assert_eq!(enabled.status, StatusCode::OK, "{:?}", enabled.json());
    assert_eq!(app.get("/api/me", &here).await.status, StatusCode::OK);
    assert_eq!(
        app.get("/api/me", &elsewhere).await.status,
        StatusCode::UNAUTHORIZED
    );
}
