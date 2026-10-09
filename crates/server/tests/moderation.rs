//! Moderation of uploaded art (ADR 0042).

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
use common::{ADMIN, TestApp};
use ingressoimpresso_server::moderation::SafeSearch;
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

fn png(seed: u8) -> Vec<u8> {
    let image = image::RgbImage::from_fn(300, 200, |x, y| {
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

/// Uploads art, classifies it and saves a design that uses it.
async fn design_with_art(app: &TestApp, token: &str, event: &str, bytes: Vec<u8>) -> Value {
    let art = upload(app, token, event, bytes).await;
    assert_eq!(
        art.status,
        StatusCode::CREATED,
        "{}",
        String::from_utf8_lossy(&art.bytes)
    );
    let art = art.json();
    let id: Uuid = art["id"].as_str().unwrap().parse().unwrap();
    ingressoimpresso_server::moderation::check_art(&app.state, id).await;
    let design = app
        .get(&format!("/api/events/{event}/design"), token)
        .await
        .json();
    let saved = app
        .put(
            &format!("/api/events/{event}/design"),
            token,
            json!({ "design": design["design"], "artId": art["id"] }),
        )
        .await;
    assert_eq!(
        saved.status,
        StatusCode::OK,
        "{}",
        String::from_utf8_lossy(&saved.bytes)
    );
    art
}

async fn export(app: &TestApp, token: &str, event: &str) -> common::Reply {
    app.post(
        &format!("/api/events/{event}/exports"),
        token,
        json!({ "kind": "home", "scope": { "type": "all" } }),
    )
    .await
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn flagged_art_waits_for_a_decision(pool: PgPool) {
    let app = TestApp::new(pool).await.with_classifier(SafeSearch {
        adult: 5,
        violence: 1,
        racy: 4,
        medical: 1,
        spoof: 1,
    });
    let admin = app.login(ADMIN).await;
    let token = app.login("banda@exemplo.com").await;
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
    design_with_art(&app, &token, &event, png(1)).await;
    let design = app
        .get(&format!("/api/events/{event}/design"), &token)
        .await
        .json();
    assert_eq!(design["art"]["moderation"], "flagged");

    // Nothing prints while the team looks at it.
    assert_eq!(
        export(&app, &token, &event).await.error_code(),
        "art_under_review"
    );
    let summary = app
        .get("/api/admin/moderation/summary", &admin)
        .await
        .json();
    assert_eq!(summary["open"], 1);
    assert_eq!(summary["classifier"], true);
    let flags = app.get("/api/admin/moderation", &admin).await.json();
    assert_eq!(flags[0]["reasons"], json!(["adult"]));
    assert_eq!(flags[0]["organizationName"], "banda@exemplo.com");
    let image = app
        .get(
            &format!(
                "/api/admin/moderation/arts/{}",
                flags[0]["artId"].as_str().unwrap()
            ),
            &admin,
        )
        .await;
    assert_eq!(image.headers[header::CACHE_CONTROL], "no-store");
    assert_eq!(
        app.get("/api/admin/moderation", &token).await.status,
        StatusCode::FORBIDDEN
    );

    // Rejected: never printed, the organizer is told, the same file cannot come back.
    let id = flags[0]["id"].as_str().unwrap();
    let rejected = app
        .post(
            &format!("/api/admin/moderation/{id}/resolve"),
            &admin,
            json!({ "action": "reject", "note": "Conteúdo adulto", "notify": true, "suspend": false }),
        )
        .await;
    assert_eq!(
        rejected.status,
        StatusCode::OK,
        "{}",
        String::from_utf8_lossy(&rejected.bytes)
    );
    assert_eq!(rejected.json()["status"], "rejected");
    assert_eq!(
        export(&app, &token, &event).await.error_code(),
        "art_rejected"
    );
    let inbox = app.get("/api/inbox", &token).await.json();
    assert_eq!(inbox["notifications"][0]["kind"], "art_rejected");
    assert_eq!(inbox["notifications"][0]["data"]["note"], "Conteúdo adulto");
    let other_event = app.create_event(&token, "Outro").await;
    assert_eq!(
        upload(&app, &token, &other_event, png(1))
            .await
            .error_code(),
        "art_rejected"
    );
    let again = app
        .post(
            &format!("/api/admin/moderation/{id}/resolve"),
            &admin,
            json!({ "action": "approve", "note": null, "notify": false, "suspend": false }),
        )
        .await;
    assert_eq!(again.error_code(), "flag_already_resolved");
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn approved_or_clean_art_prints(pool: PgPool) {
    let app = TestApp::new(pool)
        .await
        .with_classifier(SafeSearch::default());
    let admin = app.login(ADMIN).await;
    let token = app.login("banda@exemplo.com").await;
    let event = app.create_event(&token, "Show").await;
    let art = design_with_art(&app, &token, &event, png(2)).await;
    let design = app
        .get(&format!("/api/events/{event}/design"), &token)
        .await
        .json();
    assert_eq!(design["art"]["moderation"], "clean");
    assert_eq!(
        export(&app, &token, &event).await.status,
        StatusCode::ACCEPTED
    );

    // An admin can still flag it by hand, then approve it, and it prints again.
    let art_id = art["id"].as_str().unwrap();
    let flag = app
        .post(
            &format!("/api/admin/moderation/arts/{art_id}/flag"),
            &admin,
            json!({ "note": "Conferir" }),
        )
        .await;
    assert_eq!(flag.status, StatusCode::CREATED);
    assert_eq!(
        export(&app, &token, &event).await.error_code(),
        "art_under_review"
    );
    let id = flag.json()["id"].as_str().unwrap().to_owned();
    let approved = app
        .post(
            &format!("/api/admin/moderation/{id}/resolve"),
            &admin,
            json!({ "action": "approve", "note": null, "notify": true, "suspend": false }),
        )
        .await
        .json();
    assert_eq!(approved["status"], "approved");
    assert_eq!(
        export(&app, &token, &event).await.status,
        StatusCode::ACCEPTED
    );
    let recent = app.get("/api/admin/moderation/recent", &admin).await.json();
    assert_eq!(recent[0]["moderation"], "approved");
}
