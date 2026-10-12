//! The organization's profile (ADR 0064): contact, defaults, the moderated logo and where the
//! public pages show them.

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
use common::{ADMIN, Reply, TestApp};
use ingressoimpresso_server::moderation::SafeSearch;
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

fn png(seed: u8, width: u32, height: u32) -> Vec<u8> {
    let image = image::RgbaImage::from_fn(width, height, |x, y| {
        image::Rgba([(x % 255) as u8, (y % 255) as u8, seed, 200])
    });
    let mut bytes = Vec::new();
    image::DynamicImage::ImageRgba8(image)
        .write_to(
            &mut std::io::Cursor::new(&mut bytes),
            image::ImageFormat::Png,
        )
        .unwrap();
    bytes
}

async fn upload_logo(app: &TestApp, token: &str, bytes: Vec<u8>) -> Reply {
    app.send(
        Request::builder()
            .method(Method::POST)
            .uri("/api/account/profile/logo")
            .header(header::AUTHORIZATION, format!("Bearer {token}"))
            .header(header::CONTENT_TYPE, "image/png")
            .body(Body::from(bytes))
            .unwrap(),
    )
    .await
}

async fn public_logo(app: &TestApp, path: &str) -> Reply {
    app.request(Method::GET, path, None, None).await
}

fn profile_body(fields: &Value) -> Value {
    let mut body = json!({
        "brandColor": null,
        "whatsapp": null,
        "contactEmail": null,
        "website": null,
        "instagram": null,
        "defaultVenue": null,
        "defaultAddress": null,
        "defaultTicketPriceCents": null,
    });
    for (key, value) in fields.as_object().unwrap() {
        body[key] = value.clone();
    }
    body
}

/// A paid ticket with a digital link; returns the link's token.
async fn ticket(app: &TestApp, token: &str, event: &str, number: i32) -> String {
    let created = app
        .post(
            &format!("/api/events/{event}/tickets"),
            token,
            json!({ "number": number }),
        )
        .await;
    assert_eq!(created.status, StatusCode::CREATED, "{:?}", created.json());
    let url = created.json()["url"].as_str().unwrap().to_owned();
    url.split_once('#').unwrap().1.to_owned()
}

async fn open_pass(app: &TestApp, secret: &str) -> Value {
    let reply = app
        .request(
            Method::POST,
            "/api/ticket",
            None,
            Some(json!({ "token": secret })),
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK);
    reply.json()
}

/// A batch, paid by the admin when the free tickets do not cover it.
async fn paid_batch(app: &TestApp, token: &str, event: &str, quantity: i32) {
    let batch = app.create_batch(token, event, quantity).await;
    if batch["status"] != "paid" {
        let admin = app.login(ADMIN).await;
        let reply = app
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
        assert_eq!(reply.status, StatusCode::OK, "{:?}", reply.json());
    }
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn the_profile_is_normalized_and_reaches_the_public_pages(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("banda@exemplo.com").await;

    let empty = app.get("/api/account/profile", &token).await.json();
    assert_eq!(empty["organizationName"], "banda@exemplo.com");
    assert_eq!(empty["logo"], Value::Null);
    assert_eq!(empty["whatsapp"], Value::Null);

    let saved = app
        .put(
            "/api/account/profile",
            &token,
            profile_body(&json!({
                "brandColor": "#1A7F5A",
                "whatsapp": "(11) 99999-8888",
                "contactEmail": " contato@osvizinhos.com.br ",
                "website": "osvizinhos.com.br",
                "instagram": "https://instagram.com/os.vizinhos/",
                "defaultVenue": " Bar do Zé ",
                "defaultAddress": "Rua das Flores, 123 - Centro",
                "defaultTicketPriceCents": 2500,
            })),
        )
        .await;
    assert_eq!(saved.status, StatusCode::OK, "{:?}", saved.json());
    let saved = saved.json();
    assert_eq!(saved["brandColor"], "#1a7f5a");
    assert_eq!(saved["whatsapp"], "5511999998888");
    assert_eq!(saved["contactEmail"], "contato@osvizinhos.com.br");
    assert_eq!(saved["website"], "https://osvizinhos.com.br");
    assert_eq!(saved["instagram"], "os.vizinhos");
    assert_eq!(saved["defaultVenue"], "Bar do Zé");
    assert_eq!(saved["defaultTicketPriceCents"], 2500);

    for (field, value, code) in [
        ("whatsapp", json!("9999-8888"), "invalid_whatsapp"),
        ("website", json!("javascript:alert(1)"), "invalid_website"),
        ("instagram", json!("os vizinhos"), "invalid_instagram"),
        ("contactEmail", json!("contato"), "invalid_contact_email"),
        ("brandColor", json!("verde"), "invalid_color"),
        ("defaultAddress", json!("Rua\nNova"), "invalid_address"),
        ("defaultTicketPriceCents", json!(-1), "invalid_price"),
    ] {
        let reply = app
            .put(
                "/api/account/profile",
                &token,
                profile_body(&json!({ field: value })),
            )
            .await;
        assert_eq!(reply.error_code(), code, "{field}");
    }
    // A refused change keeps what was saved.
    let kept = app.get("/api/account/profile", &token).await.json();
    assert_eq!(kept["whatsapp"], "5511999998888");

    // The digital ticket and the seller's page show who runs the event, with the contact.
    let event = app.create_event(&token, "Show").await;
    paid_batch(&app, &token, &event, 10).await;
    let secret = ticket(&app, &token, &event, 3).await;
    let pass = open_pass(&app, &secret).await;
    assert_eq!(
        pass["organization"],
        json!({
            "name": "banda@exemplo.com",
            "logoPath": null,
            "brandColor": "#1a7f5a",
            "whatsapp": "5511999998888",
            "email": "contato@osvizinhos.com.br",
            "website": "https://osvizinhos.com.br",
            "instagram": "os.vizinhos",
        })
    );
    let seller = app
        .post(
            &format!("/api/events/{event}/sellers"),
            &token,
            json!({ "name": "Maria" }),
        )
        .await
        .json();
    let url = app
        .post(
            &format!("/api/sellers/{}/link", seller["id"].as_str().unwrap()),
            &token,
            json!({}),
        )
        .await
        .json()["url"]
        .as_str()
        .unwrap()
        .to_owned();
    let view = app
        .request(
            Method::POST,
            "/api/seller",
            None,
            Some(json!({ "token": url.split_once('#').unwrap().1 })),
        )
        .await
        .json();
    assert_eq!(view["organization"]["whatsapp"], "5511999998888");
    assert_eq!(view["organization"]["name"], "banda@exemplo.com");

    // Clearing a field removes it from the pages.
    app.put(
        "/api/account/profile",
        &token,
        profile_body(&json!({ "whatsapp": "" })),
    )
    .await;
    assert_eq!(
        open_pass(&app, &secret).await["organization"]["whatsapp"],
        Value::Null
    );

    // The account export carries the profile.
    let export = app.get("/api/account/export", &token).await.json();
    assert_eq!(export["organization"]["profile"]["hasLogo"], false);
    assert_eq!(export["organization"]["profile"]["whatsapp"], Value::Null);
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn the_logo_is_shrunk_served_publicly_and_removed(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("banda@exemplo.com").await;

    let reply = upload_logo(&app, &token, b"not an image at all".to_vec()).await;
    assert_eq!(reply.error_code(), "unsupported_art");

    let reply = upload_logo(&app, &token, png(1, 1200, 600)).await;
    assert_eq!(reply.status, StatusCode::CREATED, "{:?}", reply.json());
    let profile = reply.json();
    assert_eq!(profile["logo"]["moderation"], "unchecked");
    let path = profile["logo"]["path"].as_str().unwrap().to_owned();
    assert_eq!(
        path,
        format!("/api/logos/{}", profile["logo"]["id"].as_str().unwrap())
    );

    // Public, cached for an hour, at most 512 px, transparency kept (PNG).
    let served = public_logo(&app, &path).await;
    assert_eq!(served.status, StatusCode::OK);
    assert_eq!(served.headers[header::CONTENT_TYPE], "image/png");
    assert_eq!(
        served.headers[header::CACHE_CONTROL],
        "public, max-age=3600"
    );
    let image = image::load_from_memory(&served.bytes).unwrap();
    assert_eq!((image.width(), image.height()), (512, 256));
    assert!(image.color().has_alpha());

    // Shown on the digital ticket.
    let event = app.create_event(&token, "Show").await;
    paid_batch(&app, &token, &event, 5).await;
    let secret = ticket(&app, &token, &event, 1).await;
    assert_eq!(
        open_pass(&app, &secret).await["organization"]["logoPath"],
        path
    );

    // A new logo replaces the old one, which stops being served.
    let second = upload_logo(&app, &token, png(2, 300, 300)).await.json();
    let second_path = second["logo"]["path"].as_str().unwrap().to_owned();
    assert_ne!(second_path, path);
    assert_eq!(public_logo(&app, &path).await.status, StatusCode::NOT_FOUND);
    assert_eq!(public_logo(&app, &second_path).await.status, StatusCode::OK);

    // An event's art is not a logo: the public address serves logos only.
    let art: Uuid = sqlx::query_scalar(
        "insert into blobs (id, event_id, sha256, content_type, width_px, height_px, byte_size, data)
         values (gen_random_uuid(), $1, sha256('x'::bytea), 'image/png', 1, 1, 1, 'x'::bytea) returning id",
    )
    .bind(Uuid::parse_str(&event).unwrap())
    .fetch_one(&app.state.pool)
    .await
    .unwrap();
    assert_eq!(
        public_logo(&app, &format!("/api/logos/{art}")).await.status,
        StatusCode::NOT_FOUND
    );

    let removed = app
        .delete("/api/account/profile/logo", &token, None)
        .await
        .json();
    assert_eq!(removed["logo"], Value::Null);
    assert_eq!(
        public_logo(&app, &second_path).await.status,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        open_pass(&app, &secret).await["organization"]["logoPath"],
        Value::Null
    );
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn a_flagged_logo_waits_for_the_team_and_a_refused_one_never_comes_back(pool: PgPool) {
    let app = TestApp::new(pool).await.with_classifier(SafeSearch {
        adult: 5,
        violence: 1,
        racy: 4,
        medical: 1,
        spoof: 1,
    });
    let admin = app.login(ADMIN).await;
    let token = app.login("banda@exemplo.com").await;
    let bytes = png(7, 200, 200);
    let profile = upload_logo(&app, &token, bytes.clone()).await.json();
    let id: Uuid = profile["logo"]["id"].as_str().unwrap().parse().unwrap();
    ingressoimpresso_server::moderation::check_art(&app.state, id).await;

    // Under review: the profile says so and the public pages do not show it.
    let profile = app.get("/api/account/profile", &token).await.json();
    assert_eq!(profile["logo"]["moderation"], "flagged");
    assert_eq!(profile["logo"]["path"], Value::Null);
    assert_eq!(
        public_logo(&app, &format!("/api/logos/{id}")).await.status,
        StatusCode::NOT_FOUND
    );

    // The review center lists it without an event.
    let flags = app.get("/api/admin/moderation", &admin).await.json();
    assert_eq!(flags[0]["artId"], id.to_string());
    assert_eq!(flags[0]["eventId"], Value::Null);
    assert_eq!(flags[0]["eventName"], Value::Null);
    assert_eq!(flags[0]["organizationName"], "banda@exemplo.com");
    let recent = app.get("/api/admin/moderation/recent", &admin).await.json();
    assert_eq!(recent[0]["eventId"], Value::Null);

    let rejected = app
        .post(
            &format!(
                "/api/admin/moderation/{}/resolve",
                flags[0]["id"].as_str().unwrap()
            ),
            &admin,
            json!({ "action": "reject", "note": "Fora dos termos", "notify": true, "suspend": false }),
        )
        .await;
    assert_eq!(rejected.status, StatusCode::OK, "{:?}", rejected.json());
    let inbox = app.get("/api/inbox", &token).await.json();
    let notification = &inbox["notifications"][0];
    assert_eq!(notification["kind"], "art_rejected");
    assert_eq!(notification["data"]["logo"], true);
    assert_eq!(notification["data"]["eventId"], Value::Null);

    // The same file is refused again, as a logo or as an event's art.
    assert_eq!(
        upload_logo(&app, &token, bytes.clone()).await.error_code(),
        "art_rejected"
    );
    let profile = app.get("/api/account/profile", &token).await.json();
    assert_eq!(profile["logo"]["moderation"], "rejected");

    // Deleting the account forgets the profile; the refusal stays by hash.
    let event = app.create_event(&token, "Show").await;
    paid_batch(&app, &token, &event, 5).await;
    let organization: Uuid = sqlx::query_scalar("select organization_id from events where id = $1")
        .bind(Uuid::parse_str(&event).unwrap())
        .fetch_one(&app.state.pool)
        .await
        .unwrap();
    let deleted = app
        .delete(
            "/api/account",
            &token,
            Some(json!({ "email": "banda@exemplo.com" })),
        )
        .await;
    assert_eq!(deleted.status, StatusCode::NO_CONTENT);
    let left: (i64, i64, i64) = sqlx::query_as(
        "select (select count(*) from organization_profiles where organization_id = $1),
                (select count(*) from blobs where organization_id = $1),
                (select count(*) from rejected_art)",
    )
    .bind(organization)
    .fetch_one(&app.state.pool)
    .await
    .unwrap();
    assert_eq!(left, (0, 0, 1));
}
