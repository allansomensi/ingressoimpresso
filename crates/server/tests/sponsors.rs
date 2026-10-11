//! Sponsors' logos on the ticket (ADR 0059): saved with the design, moderated like the art.

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
use serde_json::{Value, json};
use sqlx::PgPool;

fn png(seed: u8) -> Vec<u8> {
    let image = image::RgbImage::from_fn(240, 120, |x, y| {
        image::Rgb([(x % 255) as u8, seed, (y % 255) as u8])
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

async fn upload(app: &TestApp, token: &str, event: &str, seed: u8) -> String {
    let reply = app
        .send(
            Request::builder()
                .method(Method::POST)
                .uri(format!("/api/events/{event}/art"))
                .header(header::AUTHORIZATION, format!("Bearer {token}"))
                .header(header::CONTENT_TYPE, "image/png")
                .body(Body::from(png(seed)))
                .unwrap(),
        )
        .await;
    assert_eq!(
        reply.status,
        StatusCode::CREATED,
        "{}",
        String::from_utf8_lossy(&reply.bytes)
    );
    reply.json()["id"].as_str().unwrap().to_owned()
}

fn with_strip(design: &Value) -> Value {
    let mut design = design.clone();
    design["sponsors"] = json!({
        "xMm": 6.0, "yMm": 40.0, "widthMm": 100.0, "heightMm": 12.0,
        "label": "Patrocínio", "labelColor": "#333333", "panel": true
    });
    design
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
async fn logos_travel_with_the_design(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let admin = app.login(ADMIN).await;
    let token = app.login("banda@exemplo.com").await;
    let event = app.create_event(&token, "Show").await;
    let batch = app.create_batch(&token, &event, 4).await;
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
    let logos = [
        upload(&app, &token, &event, 10).await,
        upload(&app, &token, &event, 20).await,
    ];
    let current = app
        .get(&format!("/api/events/{event}/design"), &token)
        .await
        .json();
    let design = with_strip(&current["design"]);

    // Saved in order; the design and its preview carry them.
    let saved = app
        .put(
            &format!("/api/events/{event}/design"),
            &token,
            json!({ "design": design, "artId": null, "sponsorIds": [logos[1], logos[0]] }),
        )
        .await;
    assert_eq!(
        saved.status,
        StatusCode::OK,
        "{}",
        String::from_utf8_lossy(&saved.bytes)
    );
    let loaded = app
        .get(&format!("/api/events/{event}/design"), &token)
        .await
        .json();
    assert_eq!(loaded["sponsors"][0]["id"], logos[1].as_str());
    assert_eq!(loaded["sponsors"].as_array().unwrap().len(), 2);
    assert_eq!(loaded["design"]["sponsors"]["label"], "Patrocínio");
    let preview = app
        .post(
            &format!("/api/events/{event}/design/preview"),
            &token,
            json!({ "design": design, "artId": null, "sponsorIds": logos }),
        )
        .await;
    assert_eq!(preview.status, StatusCode::OK);

    // Seven logos, or a logo of another event, are refused.
    let reply = app
        .put(
            &format!("/api/events/{event}/design"),
            &token,
            json!({ "design": design, "artId": null, "sponsorIds": vec![logos[0].clone(); 7] }),
        )
        .await;
    assert_eq!(reply.error_code(), "too_many_sponsors");
    let other = app.create_event(&token, "Outro").await;
    let foreign = upload(&app, &token, &other, 30).await;
    let reply = app
        .put(
            &format!("/api/events/{event}/design"),
            &token,
            json!({ "design": design, "artId": null, "sponsorIds": [foreign] }),
        )
        .await;
    assert_eq!(reply.error_code(), "unknown_art");

    // A logo under review holds the files, like the art.
    assert_eq!(
        export(&app, &token, &event).await.status,
        StatusCode::ACCEPTED
    );
    let flag = app
        .post(
            &format!("/api/admin/moderation/arts/{}/flag", logos[0]),
            &admin,
            json!({ "note": "Conferir" }),
        )
        .await;
    assert_eq!(flag.status, StatusCode::CREATED);
    assert_eq!(
        export(&app, &token, &event).await.error_code(),
        "art_under_review"
    );

    // A duplicate takes the logos along (as new copies of the new event).
    let copy = app
        .post(&format!("/api/events/{event}/duplicate"), &token, json!({}))
        .await
        .json();
    let copied = app
        .get(
            &format!("/api/events/{}/design", copy["id"].as_str().unwrap()),
            &token,
        )
        .await
        .json();
    assert_eq!(copied["sponsors"].as_array().unwrap().len(), 2);
    assert_ne!(copied["sponsors"][0]["id"], logos[1].as_str());
}
