//! The look of the event's public page (ADR 0125).

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

fn png(width: u32, height: u32) -> Vec<u8> {
    let image = image::RgbImage::from_fn(width, height, |x, y| {
        image::Rgb([(x % 255) as u8, (y % 255) as u8, 90])
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
async fn the_page_takes_the_organizers_look(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("festa@exemplo.com").await;
    let event = app.create_event(&token, "Festa do Campo").await;
    app.put(
        &format!("/api/events/{event}/public-page"),
        &token,
        json!({ "enabled": true, "slug": "festa-do-campo", "soldOut": false, "sellerIds": [] }),
    )
    .await;

    // The default look, with every part shown.
    let settings = app
        .get(&format!("/api/events/{event}/public-page"), &token)
        .await
        .json();
    assert_eq!(settings["design"]["hero"], "color");
    assert_eq!(settings["design"]["sections"].as_array().unwrap().len(), 10);
    assert_eq!(settings["cover"], serde_json::Value::Null);

    // A cover, sent like the ticket's art.
    let upload = Request::builder()
        .method(Method::POST)
        .uri(format!("/api/events/{event}/art"))
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .header(header::CONTENT_TYPE, "image/png")
        .body(Body::from(png(2400, 900)))
        .unwrap();
    let cover = app.send(upload).await.json()["id"]
        .as_str()
        .unwrap()
        .to_owned();

    let design = json!({
        "accent": "#E11D48",
        "background": "dark",
        "hero": "cover",
        "titleFont": "display",
        "cta": { "label": "Comprar pelo formulário", "url": "forms.gle/abc" },
        "sections": [{ "kind": "schedule", "visible": true }, { "kind": "verify", "visible": false }],
        "schedule": [{ "time": "21h", "title": "Abertura com a banda", "detail": null }],
        "faq": [{ "question": "Pode levar criança?", "answer": "Pode.\nAté 12 anos não paga." }],
        "links": [{ "label": "Instagram", "url": "https://instagram.com/festa" }],
    });
    let saved = app
        .put(
            &format!("/api/events/{event}/public-page/design"),
            &token,
            json!({ "design": design, "coverId": cover }),
        )
        .await;
    assert_eq!(saved.status, StatusCode::OK, "{:?}", saved.json());
    let saved = saved.json();
    assert_eq!(saved["design"]["accent"], "#e11d48");
    assert_eq!(saved["design"]["cta"]["url"], "https://forms.gle/abc");
    assert_eq!(saved["design"]["sections"][0]["kind"], "schedule");
    assert_eq!(
        saved["design"]["sections"][1],
        json!({ "kind": "verify", "visible": false })
    );
    assert_eq!(saved["design"]["sections"].as_array().unwrap().len(), 10);
    assert_eq!(saved["cover"]["id"], cover.as_str());

    // The editor's preview is the same page, for the team only.
    let preview = app
        .get(&format!("/api/events/{event}/public-page/preview"), &token)
        .await
        .json();
    assert_eq!(preview["design"]["accent"], "#e11d48");
    let other = app.login("outra@exemplo.com").await;
    assert_eq!(
        app.get(&format!("/api/events/{event}/public-page/preview"), &other)
            .await
            .status,
        StatusCode::NOT_FOUND
    );

    // The public page carries the look and the cover, served small.
    let page = app
        .request(Method::GET, "/api/public/events/festa-do-campo", None, None)
        .await
        .json();
    assert_eq!(page["design"]["titleFont"], "display");
    assert_eq!(
        page["design"]["faq"][0]["answer"],
        "Pode.\nAté 12 anos não paga."
    );
    let path = page["coverPath"].as_str().unwrap().to_owned();
    let image = app.request(Method::GET, &path, None, None).await;
    assert_eq!(image.status, StatusCode::OK);
    assert_eq!(image.headers[header::CONTENT_TYPE], "image/jpeg");
    let decoded = image::load_from_memory(&image.bytes).unwrap();
    assert_eq!(decoded.width(), 1600);

    // Refused by moderation, the cover leaves the page (and its address answers 404).
    sqlx::query("update blobs set moderation_status = 'rejected' where id = $1::uuid")
        .bind(&cover)
        .execute(&app.state.pool)
        .await
        .unwrap();
    let page = app
        .request(Method::GET, "/api/public/events/festa-do-campo", None, None)
        .await
        .json();
    assert_eq!(page["coverPath"], serde_json::Value::Null);
    assert_eq!(
        app.request(Method::GET, &path, None, None).await.status,
        StatusCode::NOT_FOUND
    );

    // Bad input; another organization's image; no cover takes the gradient.
    let bad = app
        .put(
            &format!("/api/events/{event}/public-page/design"),
            &token,
            json!({ "design": { "accent": "blue", "background": "plain", "hero": "color", "titleFont": null, "cta": null,
                                "sections": [], "schedule": [], "faq": [], "links": [] }, "coverId": null }),
        )
        .await;
    assert_eq!(bad.error_code(), "invalid_page_color");
    let plain = app
        .put(
            &format!("/api/events/{event}/public-page/design"),
            &token,
            json!({ "design": { "accent": null, "background": "plain", "hero": "cover", "titleFont": null, "cta": null,
                                "sections": [], "schedule": [], "faq": [], "links": [] }, "coverId": null }),
        )
        .await
        .json();
    assert_eq!(plain["design"]["hero"], "gradient");

    // A copy of the event keeps the look, not the cover.
    let copy = app
        .post(&format!("/api/events/{event}/duplicate"), &token, json!({}))
        .await
        .json()["id"]
        .as_str()
        .unwrap()
        .to_owned();
    let copied = app
        .get(&format!("/api/events/{copy}/public-page"), &token)
        .await
        .json();
    assert_eq!(copied["design"]["hero"], "gradient");
    assert_eq!(copied["cover"], serde_json::Value::Null);
}
