//! Security hardening (ADR 0047): admin powers need the second step, address limits on the
//! endpoints without a session, browser headers, refused art stays refused, deleting an account
//! asks for the second step and leaves nothing behind, the export queue is bounded, and names
//! stay on one line.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing,
    reason = "test helpers fail loudly by design"
)]

mod common;

use axum::body::Body;
use axum::http::{Method, Request, StatusCode, header};
use common::{ADMIN, ADMIN_TOTP_SECRET, TestApp};
use ingressoimpresso_server::moderation::SafeSearch;
use ingressoimpresso_server::two_factor::{STEP_SECONDS, code_at};
use serde_json::json;
use sqlx::PgPool;
use uuid::Uuid;

const EMAIL: &str = "banda@exemplo.com";

fn png(seed: u8) -> Vec<u8> {
    let image = image::RgbImage::from_fn(120, 80, |x, y| {
        image::Rgb([(x % 255) as u8, (y % 255) as u8, seed])
    });
    let mut bytes = Vec::new();
    image::DynamicImage::ImageRgb8(image)
        .write_to(
            &mut std::io::Cursor::new(&mut bytes),
            image::ImageFormat::Png,
        )
        .unwrap();
    bytes
}

async fn upload(app: &TestApp, token: &str, event: &str, bytes: Vec<u8>) -> common::Reply {
    app.send(
        Request::builder()
            .method(Method::POST)
            .uri(format!("/api/events/{event}/art"))
            .header(header::AUTHORIZATION, format!("Bearer {token}"))
            .header(header::CONTENT_TYPE, "image/png")
            .body(Body::from(bytes))
            .unwrap(),
    )
    .await
}

/// A request from `ip`, as the proxy would forward it.
async fn from_ip(app: &TestApp, uri: &str, ip: &str, body: serde_json::Value) -> common::Reply {
    app.send(
        Request::builder()
            .method(Method::POST)
            .uri(uri)
            .header("x-forwarded-for", ip)
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(serde_json::to_vec(&body).unwrap()))
            .unwrap(),
    )
    .await
}

fn admin_code() -> String {
    let step = time::OffsetDateTime::now_utc().unix_timestamp() / STEP_SECONDS;
    code_at(ADMIN_TOTP_SECRET, step)
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn admin_powers_wait_for_the_second_step(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let organizer = app.login(EMAIL).await;
    let event = app.create_event(&organizer, "Show").await;
    let batch = app.create_batch(&organizer, &event, 10).await;
    let mark_paid = format!(
        "/api/admin/batches/{}/mark-paid",
        batch["id"].as_str().unwrap()
    );

    // The harness turns the second step on after the first sign-in; this session was issued
    // before that, and still only becomes an admin because the account now has it.
    let admin = app.login(ADMIN).await;
    sqlx::query("update users set totp_secret = null, totp_enabled_at = null where email = $1")
        .bind(ADMIN)
        .execute(&app.state.pool)
        .await
        .unwrap();
    let me = app.get("/api/me", &admin).await.json();
    assert_eq!(me["isAdmin"], false);
    assert_eq!(me["adminPendingTwoFactor"], true);
    let refused = app
        .request(Method::POST, &mark_paid, Some(&admin), None)
        .await;
    assert_eq!(refused.status, StatusCode::FORBIDDEN);
    assert_eq!(refused.error_code(), "admin_two_factor_required");
    // No support mode either: another organization's event does not exist for this session.
    assert_eq!(
        app.get(&format!("/api/events/{event}"), &admin)
            .await
            .status,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        app.get("/api/admin/overview", &admin).await.error_code(),
        "admin_two_factor_required"
    );

    // Turned on again (through the API, like anyone): the same session has its powers back.
    let setup = app
        .post("/api/account/two-factor/setup", &admin, json!({}))
        .await;
    assert_eq!(setup.status, StatusCode::OK);
    let secret = setup.json()["secret"].as_str().unwrap().replace(' ', "");
    let decoded = {
        let alphabet = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
        let mut out = Vec::new();
        let (mut buffer, mut bits) = (0u32, 0);
        for byte in secret.bytes() {
            let value = alphabet.iter().position(|c| *c == byte).unwrap();
            buffer = (buffer << 5) | u32::try_from(value).unwrap();
            bits += 5;
            if bits >= 8 {
                bits -= 8;
                out.push(u8::try_from((buffer >> bits) & 0xff).unwrap());
            }
        }
        out
    };
    let step = time::OffsetDateTime::now_utc().unix_timestamp() / STEP_SECONDS;
    let enabled = app
        .post(
            "/api/account/two-factor/enable",
            &admin,
            json!({ "code": code_at(&decoded, step) }),
        )
        .await;
    assert_eq!(enabled.status, StatusCode::OK);
    let me = app.get("/api/me", &admin).await.json();
    assert_eq!(me["isAdmin"], true);
    assert_eq!(me["adminPendingTwoFactor"], false);
    let paid = app
        .request(Method::POST, &mark_paid, Some(&admin), None)
        .await;
    assert_eq!(paid.status, StatusCode::OK);
    assert_eq!(paid.json()["status"], "paid");

    // A plain organizer is simply forbidden, with no hint about the second step.
    let refused = app
        .request(Method::POST, &mark_paid, Some(&organizer), None)
        .await;
    assert_eq!(refused.error_code(), "forbidden");
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn wrong_second_factor_codes_are_counted_in_the_database(pool: PgPool) {
    let app = TestApp::new(pool).await;
    app.login(ADMIN).await;
    let code = {
        let reply = app
            .request(
                Method::POST,
                "/api/auth/code",
                None,
                Some(json!({ "email": ADMIN })),
            )
            .await;
        assert_eq!(reply.status, StatusCode::NO_CONTENT);
        app.last_code(ADMIN)
    };
    for _ in 0..10 {
        let reply = app
            .request(
                Method::POST,
                "/api/auth/verify",
                None,
                Some(json!({ "email": ADMIN, "code": code, "twoFactorCode": "000000" })),
            )
            .await;
        assert_eq!(reply.error_code(), "invalid_two_factor_code");
    }
    let counted: i64 = sqlx::query_scalar("select count(*) from second_factor_attempts")
        .fetch_one(&app.state.pool)
        .await
        .unwrap();
    assert_eq!(counted, 10);
    // Even the right code waits now (a restart of the API would change nothing).
    let reply = app
        .request(
            Method::POST,
            "/api/auth/verify",
            None,
            Some(json!({ "email": ADMIN, "code": code, "twoFactorCode": admin_code() })),
        )
        .await;
    assert_eq!(reply.status, StatusCode::TOO_MANY_REQUESTS);
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn addresses_are_rate_limited_on_public_endpoints(pool: PgPool) {
    let app = TestApp::new(pool).await;
    // The door: 60 registrations per address per window, then 429 whatever the token.
    let body = json!({ "accessToken": "nope", "deviceName": "Porta" });
    for _ in 0..60 {
        let reply = from_ip(&app, "/api/door/register", "203.0.113.9", body.clone()).await;
        assert_eq!(reply.status, StatusCode::UNAUTHORIZED);
    }
    let reply = from_ip(&app, "/api/door/register", "203.0.113.9", body.clone()).await;
    assert_eq!(reply.status, StatusCode::TOO_MANY_REQUESTS);
    // Another address is not affected, and the limit is per endpoint.
    let reply = from_ip(&app, "/api/door/register", "203.0.113.10", body.clone()).await;
    assert_eq!(reply.status, StatusCode::UNAUTHORIZED);
    let reply = from_ip(
        &app,
        "/api/ticket",
        "203.0.113.9",
        json!({ "token": "nope" }),
    )
    .await;
    assert_eq!(reply.status, StatusCode::NOT_FOUND);
    // Sign-in verification: 60 tries per address.
    let verify = json!({ "email": EMAIL, "code": "123456" });
    for _ in 0..60 {
        let reply = from_ip(&app, "/api/auth/verify", "198.51.100.7", verify.clone()).await;
        assert_eq!(reply.error_code(), "invalid_code");
    }
    let reply = from_ip(&app, "/api/auth/verify", "198.51.100.7", verify.clone()).await;
    assert_eq!(reply.status, StatusCode::TOO_MANY_REQUESTS);
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn every_answer_carries_the_browser_headers(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let reply = app.request(Method::GET, "/api/me", None, None).await;
    assert_eq!(reply.status, StatusCode::UNAUTHORIZED);
    assert_eq!(reply.headers[header::X_CONTENT_TYPE_OPTIONS], "nosniff");
    assert_eq!(reply.headers[header::X_FRAME_OPTIONS], "DENY");
    assert_eq!(reply.headers[header::REFERRER_POLICY], "no-referrer");
    assert_eq!(reply.headers[header::CACHE_CONTROL], "no-store");
    // Not production: no HSTS on plain HTTP.
    assert!(
        !reply
            .headers
            .contains_key(header::STRICT_TRANSPORT_SECURITY)
    );
    // Public answers keep their own short cache.
    let pricing = app.request(Method::GET, "/api/pricing", None, None).await;
    assert_eq!(pricing.status, StatusCode::OK);
    assert!(
        pricing.headers[header::CACHE_CONTROL]
            .to_str()
            .unwrap()
            .starts_with("public")
    );
    // A constraint violation answers a neutral message, never the database's own.
    let token = app.login(EMAIL).await;
    let event = app.create_event(&token, "Show").await;
    let sellers = format!("/api/events/{event}/sellers");
    let body = json!({ "name": "Ana", "phone": null });
    assert_eq!(
        app.post(&sellers, &token, body.clone()).await.status,
        StatusCode::CREATED
    );
    let duplicate = app.post(&sellers, &token, body).await;
    assert_eq!(duplicate.status, StatusCode::CONFLICT);
    assert!(
        !String::from_utf8_lossy(&duplicate.bytes).contains("constraint"),
        "{}",
        String::from_utf8_lossy(&duplicate.bytes)
    );
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn refused_art_stays_refused_through_copies_and_deletions(pool: PgPool) {
    let app = TestApp::new(pool).await.with_classifier(SafeSearch {
        adult: 5,
        violence: 1,
        racy: 4,
        medical: 1,
        spoof: 1,
    });
    let admin = app.login(ADMIN).await;
    let token = app.login(EMAIL).await;
    let event = app.create_event(&token, "Show").await;
    let art = upload(&app, &token, &event, png(7)).await;
    assert_eq!(art.status, StatusCode::CREATED);
    let art = art.json();
    let art_id: Uuid = art["id"].as_str().unwrap().parse().unwrap();
    ingressoimpresso_server::moderation::check_art(&app.state, art_id).await;
    let design = app
        .get(&format!("/api/events/{event}/design"), &token)
        .await
        .json();
    let saved = app
        .put(
            &format!("/api/events/{event}/design"),
            &token,
            json!({ "design": design["design"], "artId": art["id"] }),
        )
        .await;
    assert_eq!(saved.status, StatusCode::OK);

    // Under review: the same bytes cannot sneak in through another event, nor through a copy.
    let other = app.create_event(&token, "Outro").await;
    assert_eq!(
        upload(&app, &token, &other, png(7)).await.error_code(),
        "art_under_review"
    );
    let copy = app
        .request(
            Method::POST,
            &format!("/api/events/{event}/duplicate"),
            Some(&token),
            None,
        )
        .await;
    assert_eq!(copy.status, StatusCode::CREATED);
    let copy_id = copy.json()["id"].as_str().unwrap().to_owned();
    let export = app
        .post(
            &format!("/api/events/{copy_id}/exports"),
            &token,
            json!({ "kind": "home", "scope": { "type": "all" } }),
        )
        .await;
    assert_eq!(export.error_code(), "art_under_review");
    let open_flags: i64 =
        sqlx::query_scalar("select count(*) from moderation_flags where status = 'open'")
            .fetch_one(&app.state.pool)
            .await
            .unwrap();
    assert_eq!(open_flags, 2, "the copy is in the queue too");

    // Rejected: the decision is remembered by hash, even after the event is deleted.
    let flags = app.get("/api/admin/moderation", &admin).await.json();
    let flag = flags
        .as_array()
        .unwrap()
        .iter()
        .find(|flag| flag["artId"] == art["id"])
        .unwrap();
    let rejected = app
        .post(
            &format!(
                "/api/admin/moderation/{}/resolve",
                flag["id"].as_str().unwrap()
            ),
            &admin,
            json!({ "action": "reject", "note": null, "notify": false, "suspend": false }),
        )
        .await;
    assert_eq!(rejected.status, StatusCode::OK);
    assert_eq!(
        app.request(
            Method::POST,
            &format!("/api/events/{event}/duplicate"),
            Some(&token),
            None
        )
        .await
        .error_code(),
        "art_rejected"
    );
    for id in [&event, &copy_id, &other] {
        let deleted = app.delete(&format!("/api/events/{id}"), &token, None).await;
        assert_eq!(deleted.status, StatusCode::NO_CONTENT);
    }
    let fresh = app.create_event(&token, "De novo").await;
    assert_eq!(
        upload(&app, &token, &fresh, png(7)).await.error_code(),
        "art_rejected"
    );
    assert_eq!(
        upload(&app, &token, &fresh, png(8)).await.status,
        StatusCode::CREATED
    );
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn deleting_an_account_asks_for_the_second_step_and_leaves_nothing(pool: PgPool) {
    let app = TestApp::new(pool).await;
    // The admin is the one account the harness gives a second step to.
    let admin = app.login(ADMIN).await;
    let user_id: Uuid = sqlx::query_scalar("select id from users where email = $1")
        .bind(ADMIN)
        .fetch_one(&app.state.pool)
        .await
        .unwrap();
    sqlx::query("insert into recovery_codes (id, user_id, code_hash) values ($1, $2, $3)")
        .bind(Uuid::new_v4())
        .bind(user_id)
        .bind(vec![1u8; 32])
        .execute(&app.state.pool)
        .await
        .unwrap();
    let without = app
        .delete("/api/account", &admin, Some(json!({ "email": ADMIN })))
        .await;
    assert_eq!(without.error_code(), "two_factor_required");
    let wrong = app
        .delete(
            "/api/account",
            &admin,
            Some(json!({ "email": ADMIN, "twoFactorCode": "000000" })),
        )
        .await;
    assert_eq!(wrong.error_code(), "invalid_two_factor_code");
    let deleted = app
        .delete(
            "/api/account",
            &admin,
            Some(json!({ "email": ADMIN, "twoFactorCode": admin_code() })),
        )
        .await;
    assert_eq!(
        deleted.status,
        StatusCode::NO_CONTENT,
        "{}",
        String::from_utf8_lossy(&deleted.bytes)
    );
    let row: (bool, bool, i64, i64) = sqlx::query_as(
        "select totp_secret is null, totp_enabled_at is null,
                (select count(*) from recovery_codes where user_id = $1),
                (select count(*) from sessions where user_id = $1)
         from users where id = $1",
    )
    .bind(user_id)
    .fetch_one(&app.state.pool)
    .await
    .unwrap();
    assert_eq!(row, (true, true, 0, 0));
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn the_export_queue_is_bounded_and_names_stay_on_one_line(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let admin = app.login(ADMIN).await;
    let token = app.login(EMAIL).await;
    let event = app.create_event(&token, "Show").await;
    let batch = app.create_batch(&token, &event, 10).await;
    let paid = app
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
    assert_eq!(paid.status, StatusCode::OK);
    let exports = format!("/api/events/{event}/exports");
    for _ in 0..6 {
        let queued = app
            .post(
                &exports,
                &token,
                json!({ "kind": "home", "scope": { "type": "all" } }),
            )
            .await;
        assert_eq!(queued.status, StatusCode::ACCEPTED);
    }
    let refused = app
        .post(
            &exports,
            &token,
            json!({ "kind": "home", "scope": { "type": "all" } }),
        )
        .await;
    assert_eq!(refused.error_code(), "export_queue_full");

    // Names with a line break (or any control character) are refused everywhere they print.
    let event_body = json!({
        "name": "Show\nSubject: x",
        "venue": null,
        "startsAt": "2026-11-20T22:00:00-03:00",
        "endsAt": "2026-11-21T03:00:00-03:00",
        "ticketPriceCents": 3000
    });
    assert_eq!(
        app.post("/api/events", &token, event_body)
            .await
            .error_code(),
        "invalid_name"
    );
    assert_eq!(
        app.post(
            &format!("/api/events/{event}/sellers"),
            &token,
            json!({ "name": "Ana\r\nBeatriz", "phone": null })
        )
        .await
        .error_code(),
        "invalid_name"
    );
    assert_eq!(
        app.post(
            &format!("/api/events/{event}/door/accesses"),
            &token,
            json!({ "label": "Porta\u{0007}" })
        )
        .await
        .error_code(),
        "invalid_label"
    );
    assert_eq!(
        app.post(
            &format!("/api/events/{event}/tickets"),
            &token,
            json!({ "number": 10_000_000, "holderName": null })
        )
        .await
        .error_code(),
        "invalid_number"
    );
    assert_eq!(
        app.post(
            &format!("/api/events/{event}/tickets/bulk"),
            &token,
            json!({ "first": 1, "last": 2_147_483_647 })
        )
        .await
        .error_code(),
        "invalid_range"
    );
}
