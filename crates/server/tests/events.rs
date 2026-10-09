//! Event lifecycle: duplicate (design, art and sellers come along), archive and delete.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing,
    clippy::cast_possible_truncation,
    reason = "test helpers fail loudly by design"
)]

mod common;

use axum::body::Body;
use axum::http::{Method, Request, StatusCode, header};
use common::TestApp;
use serde_json::json;
use sqlx::PgPool;

fn png() -> Vec<u8> {
    let image = image::RgbImage::from_fn(600, 240, |x, y| {
        image::Rgb([(x % 255) as u8, (y % 255) as u8, 40])
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

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn duplicating_copies_details_design_art_and_sellers(pool: PgPool) {
    let app = TestApp::new(pool);
    let token = app.login("banda@exemplo.com").await;
    let event = app.create_event(&token, "Turnê de Inverno").await;

    let upload = Request::builder()
        .method(Method::POST)
        .uri(format!("/api/events/{event}/art"))
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .header(header::CONTENT_TYPE, "image/png")
        .body(Body::from(png()))
        .unwrap();
    let art = app.send(upload).await.json();
    let mut design = app
        .get(&format!("/api/events/{event}/design"), &token)
        .await
        .json()["design"]
        .clone();
    design["texts"] = json!([{
        "text": "{evento}", "xMm": 6, "yMm": 20, "widthMm": 90, "heightMm": 12,
        "font": "condensed", "sizePt": 30, "color": "#ffffff", "align": "left",
        "lines": 2, "bold": false, "uppercase": true, "letterSpacing": 0
    }]);
    let saved = app
        .put(
            &format!("/api/events/{event}/design"),
            &token,
            json!({ "design": design, "artId": art["id"] }),
        )
        .await;
    assert_eq!(saved.status, StatusCode::OK);
    let design = saved.json()["design"].clone();
    app.post(
        &format!("/api/events/{event}/sellers"),
        &token,
        json!({ "name": "Ana", "phone": "11 99999-0000" }),
    )
    .await;
    app.post(
        &format!("/api/events/{event}/batches"),
        &token,
        json!({ "quantity": 10 }),
    )
    .await;

    let copy = app
        .post(&format!("/api/events/{event}/duplicate"), &token, json!({}))
        .await;
    assert_eq!(copy.status, StatusCode::CREATED);
    let copy = copy.json();
    let id = copy["id"].as_str().unwrap();
    assert_ne!(id, event);
    assert_eq!(copy["name"], "Turnê de Inverno (cópia)");
    assert_eq!(copy["venue"], "Bar do Zé");
    assert_eq!(copy["startsAt"], "2026-11-20T22:00:00-03:00");
    assert_eq!(copy["ticketPriceCents"], 3000);

    let copied = app
        .get(&format!("/api/events/{id}/design"), &token)
        .await
        .json();
    assert_eq!(copied["version"], 1);
    assert_eq!(copied["design"], design);
    assert_ne!(copied["art"]["id"], art["id"]);
    assert_eq!(copied["art"]["widthPx"], 600);
    let sellers = app
        .get(&format!("/api/events/{id}/sellers"), &token)
        .await
        .json();
    assert_eq!(sellers.as_array().unwrap().len(), 1);
    assert_eq!(sellers[0]["name"], "Ana");
    assert_eq!(sellers[0]["ranges"], json!([]));
    let batches = app
        .get(&format!("/api/events/{id}/batches"), &token)
        .await
        .json();
    assert_eq!(batches, json!([]));

    // A long name keeps the suffix within 100 characters.
    let long = app.create_event(&token, &"A".repeat(100)).await;
    let long_copy = app
        .post(&format!("/api/events/{long}/duplicate"), &token, json!({}))
        .await
        .json();
    let name = long_copy["name"].as_str().unwrap();
    assert_eq!(name.chars().count(), 100);
    assert!(name.ends_with(" (cópia)"));

    // Another organization cannot copy it.
    let other = app.login("outra@exemplo.com").await;
    let denied = app
        .post(&format!("/api/events/{event}/duplicate"), &other, json!({}))
        .await;
    assert_eq!(denied.status, StatusCode::NOT_FOUND);
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn archived_events_take_no_new_batches(pool: PgPool) {
    let app = TestApp::new(pool);
    let token = app.login("escola@exemplo.com").await;
    let event = app.create_event(&token, "Festa junina").await;
    let closed = app
        .put(
            &format!("/api/events/{event}/status"),
            &token,
            json!({ "status": "closed" }),
        )
        .await;
    assert_eq!(closed.status, StatusCode::OK);
    assert_eq!(closed.json()["status"], "closed");
    let refused = app
        .post(
            &format!("/api/events/{event}/batches"),
            &token,
            json!({ "quantity": 10 }),
        )
        .await;
    assert_eq!(refused.status, StatusCode::CONFLICT);
    assert_eq!(refused.error_code(), "event_closed");

    app.put(
        &format!("/api/events/{event}/status"),
        &token,
        json!({ "status": "active" }),
    )
    .await;
    let created = app
        .post(
            &format!("/api/events/{event}/batches"),
            &token,
            json!({ "quantity": 10 }),
        )
        .await;
    assert_eq!(created.status, StatusCode::CREATED);
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn only_events_without_batches_are_deleted(pool: PgPool) {
    let app = TestApp::new(pool);
    let token = app.login("igreja@exemplo.com").await;
    let event = app.create_event(&token, "Retiro").await;
    let batch = app
        .post(
            &format!("/api/events/{event}/batches"),
            &token,
            json!({ "quantity": 10 }),
        )
        .await
        .json();
    let delete = |token: String, event: String| {
        let app = &app;
        async move {
            app.request(
                Method::DELETE,
                &format!("/api/events/{event}"),
                Some(&token),
                None,
            )
            .await
        }
    };
    let refused = delete(token.clone(), event.clone()).await;
    assert_eq!(refused.status, StatusCode::CONFLICT);
    assert_eq!(refused.error_code(), "event_has_batches");

    let other = app.login("outra@exemplo.com").await;
    assert_eq!(
        delete(other, event.clone()).await.status,
        StatusCode::NOT_FOUND
    );

    app.post(
        &format!("/api/batches/{}/cancel", batch["id"].as_str().unwrap()),
        &token,
        json!({}),
    )
    .await;
    let deleted = delete(token.clone(), event.clone()).await;
    assert_eq!(deleted.status, StatusCode::NO_CONTENT);
    let gone = app.get(&format!("/api/events/{event}"), &token).await;
    assert_eq!(gone.status, StatusCode::NOT_FOUND);
}
