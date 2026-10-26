//! Photos over the ticket's art (ADR 0121): one image per photo, saved with the design and
//! moderated like the art; a refused one stays behind when the event is copied.

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
    let image = image::RgbImage::from_fn(200, 260, |x, y| {
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

fn with_photos(design: &Value, count: usize) -> Value {
    let mut design = design.clone();
    design["photos"] = (0..u8::try_from(count).unwrap())
        .map(|index| {
            json!({
                "xMm": 50.0 + 25.0 * f64::from(index), "yMm": 10.0, "widthMm": 20.0, "heightMm": 26.0,
                "fit": "cover", "shape": if index == 0 { "round" } else { "square" }
            })
        })
        .collect();
    design
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn photos_travel_with_the_design(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let admin = app.login(ADMIN).await;
    let token = app.login("banda@exemplo.com").await;
    let event = app.create_event(&token, "Formatura").await;
    let photos = [
        upload(&app, &token, &event, 10).await,
        upload(&app, &token, &event, 20).await,
    ];
    let current = app
        .get(&format!("/api/events/{event}/design"), &token)
        .await
        .json();
    assert_eq!(current["photos"], json!([]));
    let design = with_photos(&current["design"], 2);

    let saved = app
        .put(
            &format!("/api/events/{event}/design"),
            &token,
            json!({ "design": design, "artId": null, "photoIds": [photos[1], photos[0]] }),
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
    assert_eq!(loaded["photos"][0]["id"], photos[1].as_str());
    assert_eq!(loaded["design"]["photos"][0]["shape"], "round");
    let sample = app
        .post(
            &format!("/api/events/{event}/design/sample"),
            &token,
            json!({ "design": design, "artId": null, "photoIds": photos }),
        )
        .await;
    assert_eq!(sample.status, StatusCode::OK);

    // Each photo has exactly one image of this event.
    let reply = app
        .put(
            &format!("/api/events/{event}/design"),
            &token,
            json!({ "design": design, "artId": null, "photoIds": [photos[0]] }),
        )
        .await;
    assert_eq!(reply.error_code(), "photo_images");
    let other = app.create_event(&token, "Outro").await;
    let foreign = upload(&app, &token, &other, 30).await;
    let reply = app
        .put(
            &format!("/api/events/{event}/design"),
            &token,
            json!({ "design": design, "artId": null, "photoIds": [photos[0], foreign] }),
        )
        .await;
    assert_eq!(reply.error_code(), "unknown_art");

    // A photo under review holds the files, like the art; refused, it is not copied.
    let flag = app
        .post(
            &format!("/api/admin/moderation/arts/{}/flag", photos[0]),
            &admin,
            json!({ "note": "Conferir" }),
        )
        .await;
    assert_eq!(flag.status, StatusCode::CREATED);
    let batch = app.create_batch(&token, &event, 2).await;
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
    let export = app
        .post(
            &format!("/api/events/{event}/exports"),
            &token,
            json!({ "kind": "home", "scope": { "type": "all" } }),
        )
        .await;
    assert_eq!(export.error_code(), "art_under_review");
    let flag_id = flag.json()["id"].as_str().unwrap().to_owned();
    let resolved = app
        .post(
            &format!("/api/admin/moderation/{flag_id}/resolve"),
            &admin,
            json!({ "action": "reject", "note": "Não", "notify": false, "suspend": false }),
        )
        .await;
    assert_eq!(
        resolved.status,
        StatusCode::OK,
        "{}",
        String::from_utf8_lossy(&resolved.bytes)
    );

    let copy = app
        .post(&format!("/api/events/{event}/duplicate"), &token, json!({}))
        .await;
    assert_eq!(
        copy.status,
        StatusCode::CREATED,
        "{}",
        String::from_utf8_lossy(&copy.bytes)
    );
    let copied = app
        .get(
            &format!("/api/events/{}/design", copy.json()["id"].as_str().unwrap()),
            &token,
        )
        .await
        .json();
    // The first photo (the second image) is copied; the refused one leaves with its place.
    assert_eq!(copied["photos"].as_array().unwrap().len(), 1);
    assert_ne!(copied["photos"][0]["id"], photos[1].as_str());
    assert_eq!(copied["design"]["photos"].as_array().unwrap().len(), 1);
    assert_eq!(copied["design"]["photos"][0]["shape"], "round");
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn the_stub_picture_travels_with_the_design(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("banda@exemplo.com").await;
    let event = app.create_event(&token, "Formatura").await;
    let image = upload(&app, &token, &event, 40).await;
    let current = app
        .get(&format!("/api/events/{event}/design"), &token)
        .await
        .json();
    assert_eq!(current["stubImage"], Value::Null);
    let mut design = current["design"].clone();
    design["stub"]["image"] = json!({ "position": "top", "heightMm": 12.0, "fit": "contain" });

    // The picture and its image go together.
    let reply = app
        .put(
            &format!("/api/events/{event}/design"),
            &token,
            json!({ "design": design, "artId": null }),
        )
        .await;
    assert_eq!(reply.error_code(), "stub_image");
    let saved = app
        .put(
            &format!("/api/events/{event}/design"),
            &token,
            json!({ "design": design, "artId": null, "stubImageId": image }),
        )
        .await;
    assert_eq!(
        saved.status,
        StatusCode::OK,
        "{}",
        String::from_utf8_lossy(&saved.bytes)
    );
    let sample = app
        .post(
            &format!("/api/events/{event}/design/sample"),
            &token,
            json!({ "design": design, "artId": null, "stubImageId": image }),
        )
        .await;
    assert_eq!(sample.status, StatusCode::OK);

    let copy = app
        .post(&format!("/api/events/{event}/duplicate"), &token, json!({}))
        .await;
    assert_eq!(copy.status, StatusCode::CREATED);
    let copied = app
        .get(
            &format!("/api/events/{}/design", copy.json()["id"].as_str().unwrap()),
            &token,
        )
        .await
        .json();
    assert_ne!(copied["stubImage"]["id"], Value::Null);
    assert_ne!(copied["stubImage"]["id"], image.as_str());
    assert_eq!(copied["design"]["stub"]["image"]["position"], "top");
}
