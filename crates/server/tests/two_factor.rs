//! Two-step verification (ADR 0045): turning it on with the authenticator app, signing in with
//! the e-mail code or Google plus a second code, recovery codes, turning it off and the admin
//! reset.

#![cfg(feature = "test-util")]
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
use ingressoimpresso_server::google::testing::TestSigner;
use ingressoimpresso_server::two_factor::{STEP_SECONDS, code_at};
use serde_json::json;
use sqlx::PgPool;

const CLIENT: &str = "123-test.apps.googleusercontent.com";
const EMAIL: &str = "banda@exemplo.com";

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

fn step_now() -> i64 {
    time::OffsetDateTime::now_utc().unix_timestamp() / STEP_SECONDS
}

/// Turns two-step verification on for a signed-in user; returns the secret and recovery codes.
async fn turn_on(app: &TestApp, token: &str) -> (Vec<u8>, Vec<String>) {
    let setup = app
        .post("/api/account/two-factor/setup", token, json!({}))
        .await;
    assert_eq!(setup.status, StatusCode::OK);
    let setup = setup.json();
    let secret = decode_base32(setup["secret"].as_str().unwrap());
    assert!(
        setup["uri"]
            .as_str()
            .unwrap()
            .starts_with("otpauth://totp/Ingresso%20Impresso%3A")
    );

    let wrong = app
        .post(
            "/api/account/two-factor/enable",
            token,
            json!({ "code": "000000" }),
        )
        .await;
    assert_eq!(wrong.error_code(), "invalid_two_factor_code");
    let on = app
        .post(
            "/api/account/two-factor/enable",
            token,
            json!({ "code": code_at(&secret, step_now()) }),
        )
        .await;
    assert_eq!(on.status, StatusCode::OK, "{:?}", on.json());
    let codes: Vec<String> = on.json()["codes"]
        .as_array()
        .unwrap()
        .iter()
        .map(|code| code.as_str().unwrap().to_owned())
        .collect();
    assert_eq!(codes.len(), 10);
    (secret, codes)
}

async fn verify(app: &TestApp, code: &str, second: Option<&str>) -> common::Reply {
    let mut body = json!({ "email": EMAIL, "code": code });
    if let Some(second) = second {
        body["twoFactorCode"] = json!(second);
    }
    app.request(Method::POST, "/api/auth/verify", None, Some(body))
        .await
}

async fn ask_code(app: &TestApp) -> String {
    let reply = app
        .request(
            Method::POST,
            "/api/auth/code",
            None,
            Some(json!({ "email": EMAIL })),
        )
        .await;
    assert_eq!(reply.status, StatusCode::NO_CONTENT);
    app.last_code(EMAIL)
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn sign_ins_ask_for_the_second_step(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login(EMAIL).await;
    let status = app.get("/api/account/two-factor", &token).await.json();
    assert_eq!(status["enabled"], false);
    let (secret, recovery) = turn_on(&app, &token).await;
    let status = app.get("/api/account/two-factor", &token).await.json();
    assert_eq!(status["enabled"], true);
    assert_eq!(status["recoveryCodesLeft"], 10);
    // A second setup cannot replace the secret in force.
    let again = app
        .post("/api/account/two-factor/setup", &token, json!({}))
        .await;
    assert_eq!(again.error_code(), "two_factor_enabled");

    // The e-mail code alone is not enough, and asking does not spend it.
    let code = ask_code(&app).await;
    let first = verify(&app, &code, None).await;
    assert_eq!(first.status, StatusCode::FORBIDDEN);
    assert_eq!(first.error_code(), "two_factor_required");
    let wrong = verify(&app, &code, Some("123456")).await;
    assert_eq!(wrong.error_code(), "invalid_two_factor_code");
    // The step used to turn it on cannot be used again; the next one can.
    let replay = verify(&app, &code, Some(&code_at(&secret, step_now()))).await;
    assert_eq!(replay.error_code(), "invalid_two_factor_code");
    let ok = verify(&app, &code, Some(&code_at(&secret, step_now() + 1))).await;
    assert_eq!(ok.status, StatusCode::OK, "{:?}", ok.json());

    // A recovery code works once, typed in any case and without the dash.
    let code = ask_code(&app).await;
    let typed = recovery[0].to_lowercase().replace('-', "");
    assert_eq!(
        verify(&app, &code, Some(&typed)).await.status,
        StatusCode::OK
    );
    let code = ask_code(&app).await;
    assert_eq!(
        verify(&app, &code, Some(&recovery[0])).await.error_code(),
        "invalid_two_factor_code"
    );
    let status = app.get("/api/account/two-factor", &token).await.json();
    assert_eq!(status["recoveryCodesLeft"], 9);

    // New recovery codes replace the old ones.
    let fresh = app
        .post(
            "/api/account/two-factor/recovery-codes",
            &token,
            json!({ "code": recovery[1] }),
        )
        .await;
    assert_eq!(fresh.status, StatusCode::OK);
    let fresh: Vec<String> = fresh.json()["codes"]
        .as_array()
        .unwrap()
        .iter()
        .map(|code| code.as_str().unwrap().to_owned())
        .collect();
    assert_eq!(
        verify(&app, &code, Some(&recovery[2])).await.error_code(),
        "invalid_two_factor_code"
    );
    assert_eq!(
        verify(&app, &code, Some(&fresh[0])).await.status,
        StatusCode::OK
    );

    // Turning it off needs a valid code too; then the e-mail code is enough again.
    let refused = app
        .post(
            "/api/account/two-factor/disable",
            &token,
            json!({ "code": "nope" }),
        )
        .await;
    assert_eq!(refused.error_code(), "invalid_two_factor_code");
    let off = app
        .post(
            "/api/account/two-factor/disable",
            &token,
            json!({ "code": fresh[1] }),
        )
        .await;
    assert_eq!(off.status, StatusCode::NO_CONTENT);
    let status = app.get("/api/account/two-factor", &token).await.json();
    assert_eq!(status["enabled"], false);
    let code = ask_code(&app).await;
    assert_eq!(verify(&app, &code, None).await.status, StatusCode::OK);
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn google_sign_ins_ask_too_and_it_turns_off(pool: PgPool) {
    let app = TestApp::new(pool).await.with_google(CLIENT);
    let token = app.login(EMAIL).await;
    let (_, recovery) = turn_on(&app, &token).await;
    let now = time::OffsetDateTime::now_utc().unix_timestamp();
    let credential = TestSigner::new().token(&json!({
        "iss": "https://accounts.google.com",
        "aud": CLIENT,
        "sub": "g-1",
        "email": EMAIL,
        "email_verified": true,
        "iat": now - 5,
        "exp": now + 3600,
    }));
    let google = |second: Option<&str>| {
        let mut body = json!({ "credential": credential });
        if let Some(second) = second {
            body["twoFactorCode"] = json!(second);
        }
        app.request(Method::POST, "/api/auth/google", None, Some(body))
    };
    let first = google(None).await;
    assert_eq!(first.error_code(), "two_factor_required");
    let ok = google(Some(&recovery[0])).await;
    assert_eq!(ok.status, StatusCode::OK, "{:?}", ok.json());
    assert_eq!(ok.json()["user"]["google"], true);

    let off = app
        .post(
            "/api/account/two-factor/disable",
            &token,
            json!({ "code": recovery[1] }),
        )
        .await;
    assert_eq!(off.status, StatusCode::NO_CONTENT);
    assert_eq!(google(None).await.status, StatusCode::OK);
    let code = ask_code(&app).await;
    assert_eq!(verify(&app, &code, None).await.status, StatusCode::OK);
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn admins_reset_it_for_a_lost_phone(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login(EMAIL).await;
    turn_on(&app, &token).await;
    let admin = app.login(ADMIN).await;
    let user_id: sqlx::types::Uuid = sqlx::query_scalar("select id from users where email = $1")
        .bind(EMAIL)
        .fetch_one(&app.state.pool)
        .await
        .unwrap();
    let uri = format!("/api/admin/users/{user_id}/two-factor/reset");

    // Ten wrong codes (one was tried while turning it on) lock the second step for a while.
    let code = ask_code(&app).await;
    for _ in 0..9 {
        assert_eq!(
            verify(&app, &code, Some("000000")).await.error_code(),
            "invalid_two_factor_code"
        );
    }
    assert_eq!(
        verify(&app, &code, Some("ABCD-EFGH")).await.error_code(),
        "too_many_requests"
    );

    assert_eq!(
        app.post(&uri, &token, json!({})).await.status,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        app.post(&uri, &admin, json!({})).await.status,
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        app.post(&uri, &admin, json!({})).await.status,
        StatusCode::NOT_FOUND,
        "already off"
    );
    let audit = app
        .get("/api/admin/audit?category=user", &admin)
        .await
        .json();
    assert_eq!(audit["items"][0]["action"], "user_two_factor_reset");

    let code = ask_code(&app).await;
    assert_eq!(verify(&app, &code, None).await.status, StatusCode::OK);
}
