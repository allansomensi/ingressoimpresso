//! End-to-end API tests against a real Postgres (one database per test).

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
use serde_json::json;
use sqlx::PgPool;
use ticket_core::{EventId, EventKey, EventPublicKey, EventTag, EventVerifier, KeyId, KeyStatus};

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
async fn liveness_skips_the_database_and_readiness_checks_it(pool: PgPool) {
    let app = TestApp::new(pool);
    for path in ["/healthz", "/readyz"] {
        let reply = app.request(Method::GET, path, None, None).await;
        assert_eq!(reply.status, StatusCode::OK, "{path}");
    }
    // With the database gone, the process is still alive but not ready.
    app.state.pool.close().await;
    let alive = app.request(Method::GET, "/healthz", None, None).await;
    assert_eq!(alive.status, StatusCode::OK);
    let ready = app.request(Method::GET, "/readyz", None, None).await;
    assert_eq!(ready.status, StatusCode::SERVICE_UNAVAILABLE);
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn login_me_and_logout(pool: PgPool) {
    let app = TestApp::new(pool);
    assert_eq!(
        app.request(Method::GET, "/api/me", None, None).await.status,
        StatusCode::UNAUTHORIZED
    );

    let token = app.login("Banda@Exemplo.com").await;
    let me = app.get("/api/me", &token).await;
    assert_eq!(me.status, StatusCode::OK);
    assert_eq!(me.json()["email"], "banda@exemplo.com");
    assert_eq!(me.json()["isAdmin"], false);

    // Same user on a second login: no duplicate account.
    let second = app.login("banda@exemplo.com").await;
    assert_ne!(token, second);

    let logout = app
        .request(Method::POST, "/api/auth/logout", Some(&token), None)
        .await;
    assert_eq!(logout.status, StatusCode::NO_CONTENT);
    assert_eq!(
        app.get("/api/me", &token).await.status,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(app.get("/api/me", &second).await.status, StatusCode::OK);
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn wrong_codes_are_limited(pool: PgPool) {
    let app = TestApp::new(pool);
    let email = "eu@exemplo.com";
    let request = json!({ "email": email });
    assert_eq!(
        app.request(Method::POST, "/api/auth/code", None, Some(request.clone()))
            .await
            .status,
        StatusCode::NO_CONTENT
    );
    let code = app.last_code(email);
    let wrong = if code == "000000" { "111111" } else { "000000" };
    for _ in 0..5 {
        let reply = app
            .request(
                Method::POST,
                "/api/auth/verify",
                None,
                Some(json!({ "email": email, "code": wrong })),
            )
            .await;
        assert_eq!(reply.status, StatusCode::BAD_REQUEST);
        assert_eq!(reply.error_code(), "invalid_code");
    }
    // After 5 wrong attempts even the right code is refused.
    let reply = app
        .request(
            Method::POST,
            "/api/auth/verify",
            None,
            Some(json!({ "email": email, "code": code })),
        )
        .await;
    assert_eq!(reply.status, StatusCode::BAD_REQUEST);

    // Code requests per e-mail are rate limited.
    for _ in 0..4 {
        app.request(Method::POST, "/api/auth/code", None, Some(request.clone()))
            .await;
    }
    let reply = app
        .request(Method::POST, "/api/auth/code", None, Some(request))
        .await;
    assert_eq!(reply.status, StatusCode::TOO_MANY_REQUESTS);
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn events_are_isolated_between_organizations(pool: PgPool) {
    let app = TestApp::new(pool);
    let alice = app.login("alice@exemplo.com").await;
    let bob = app.login("bob@exemplo.com").await;
    let event = app.create_event(&alice, "Show da Alice").await;

    assert_eq!(
        app.get(&format!("/api/events/{event}"), &alice)
            .await
            .status,
        StatusCode::OK
    );
    assert_eq!(
        app.get(&format!("/api/events/{event}"), &bob).await.status,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        app.get(&format!("/api/events/{event}/batches"), &bob)
            .await
            .status,
        StatusCode::NOT_FOUND
    );
    let reply = app
        .post(
            &format!("/api/events/{event}/batches"),
            &bob,
            json!({ "quantity": 5 }),
        )
        .await;
    assert_eq!(reply.status, StatusCode::NOT_FOUND);
    assert_eq!(app.get("/api/events", &bob).await.json(), json!([]));
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn event_validation(pool: PgPool) {
    let app = TestApp::new(pool);
    let token = app.login("eu@exemplo.com").await;
    let reply = app
        .post(
            "/api/events",
            &token,
            json!({ "name": "  ", "venue": null, "startsAt": "2026-11-20T22:00:00Z", "endsAt": "2026-11-20T21:00:00Z", "ticketPriceCents": null }),
        )
        .await;
    assert_eq!(reply.status, StatusCode::BAD_REQUEST);
    assert_eq!(reply.error_code(), "invalid_name");
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn design_art_and_preview(pool: PgPool) {
    let app = TestApp::new(pool);
    let token = app.login("eu@exemplo.com").await;
    let event = app.create_event(&token, "Show").await;

    let design = app
        .get(&format!("/api/events/{event}/design"), &token)
        .await
        .json();
    assert_eq!(design["version"], 0);

    let upload = |bytes: Vec<u8>, content_type: &'static str| {
        Request::builder()
            .method(Method::POST)
            .uri(format!("/api/events/{event}/art"))
            .header(header::AUTHORIZATION, format!("Bearer {token}"))
            .header(header::CONTENT_TYPE, content_type)
            .body(Body::from(bytes))
            .unwrap()
    };
    let art = app.send(upload(png(1843, 720), "image/png")).await;
    assert_eq!(
        art.status,
        StatusCode::CREATED,
        "{}",
        String::from_utf8_lossy(&art.bytes)
    );
    let art = art.json();
    assert_eq!(art["widthPx"], 1843);
    // Same bytes → same blob.
    let again = app.send(upload(png(1843, 720), "image/png")).await.json();
    assert_eq!(again["id"], art["id"]);
    let svg = app.send(upload(b"<svg/>".to_vec(), "image/svg+xml")).await;
    assert_eq!(svg.status, StatusCode::BAD_REQUEST);
    assert_eq!(svg.error_code(), "unsupported_art");

    let mut body = json!({ "design": design["design"], "artId": art["id"] });
    let saved = app
        .put(&format!("/api/events/{event}/design"), &token, body.clone())
        .await;
    assert_eq!(
        saved.status,
        StatusCode::OK,
        "{}",
        String::from_utf8_lossy(&saved.bytes)
    );
    assert_eq!(saved.json()["version"], 1);
    assert_eq!(
        app.get(&format!("/api/events/{event}/design"), &token)
            .await
            .json()["art"]["id"],
        art["id"]
    );

    let preview = app
        .post(
            &format!("/api/events/{event}/design/preview"),
            &token,
            body.clone(),
        )
        .await;
    assert_eq!(preview.status, StatusCode::OK);
    assert_eq!(preview.headers[header::CONTENT_TYPE], "image/png");
    assert!(preview.bytes.starts_with(b"\x89PNG"));

    body["design"]["qr"]["sizeMm"] = json!(10);
    let invalid = app
        .put(&format!("/api/events/{event}/design"), &token, body)
        .await;
    assert_eq!(invalid.status, StatusCode::BAD_REQUEST);
    assert_eq!(invalid.error_code(), "invalid_design");

    // Art of another event cannot be referenced.
    let other = app.create_event(&token, "Outro").await;
    let foreign = app
        .put(
            &format!("/api/events/{other}/design"),
            &token,
            json!({ "design": design["design"], "artId": art["id"] }),
        )
        .await;
    assert_eq!(foreign.error_code(), "unknown_art");
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn batches_sellers_voids_and_exports(pool: PgPool) {
    let app = TestApp::new(pool);
    let token = app.login("banda@exemplo.com").await;
    let admin = app.login(ADMIN).await;
    let event = app.create_event(&token, "Show de Lançamento").await;

    // Batches are numbered sequentially.
    let first = app
        .post(
            &format!("/api/events/{event}/batches"),
            &token,
            json!({ "quantity": 10 }),
        )
        .await;
    assert_eq!(first.status, StatusCode::CREATED);
    let first = first.json();
    assert_eq!(
        (first["first"].as_i64(), first["last"].as_i64()),
        (Some(1), Some(10))
    );
    let second = app
        .post(
            &format!("/api/events/{event}/batches"),
            &token,
            json!({ "quantity": 5 }),
        )
        .await
        .json();
    assert_eq!(
        (second["first"].as_i64(), second["last"].as_i64()),
        (Some(11), Some(15))
    );
    let canceled = app
        .request(
            Method::POST,
            &format!("/api/batches/{}/cancel", second["id"].as_str().unwrap()),
            Some(&token),
            None,
        )
        .await;
    assert_eq!(canceled.json()["status"], "canceled");
    let third = app
        .post(
            &format!("/api/events/{event}/batches"),
            &token,
            json!({ "quantity": 2 }),
        )
        .await
        .json();
    assert_eq!(third["first"], 11, "numbers of a canceled batch are reused");

    // Unpaid batches produce nothing.
    let export = app
        .post(
            &format!("/api/events/{event}/exports"),
            &token,
            json!({ "kind": "home", "scope": { "type": "all" } }),
        )
        .await;
    assert_eq!(export.status, StatusCode::ACCEPTED);
    ingressoimpresso_server::jobs::run_pending(&app.state)
        .await
        .unwrap();
    let export_id = export.json()["id"].as_str().unwrap().to_owned();
    let status = app
        .get(&format!("/api/exports/{export_id}"), &token)
        .await
        .json();
    assert_eq!(
        (status["status"].as_str(), status["error"].as_str()),
        (Some("failed"), Some("no_tickets"))
    );

    // Only an admin marks batches as paid.
    let first_id = first["id"].as_str().unwrap();
    let path = format!("/api/admin/batches/{first_id}/mark-paid");
    assert_eq!(
        app.request(Method::POST, &path, Some(&token), None)
            .await
            .status,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        app.request(Method::POST, &path, Some(&admin), None)
            .await
            .json()["status"],
        "paid"
    );
    let cancel_paid = app
        .request(
            Method::POST,
            &format!("/api/batches/{first_id}/cancel"),
            Some(&token),
            None,
        )
        .await;
    assert_eq!(cancel_paid.status, StatusCode::CONFLICT);

    // Sellers and ranges.
    let seller = app
        .post(
            &format!("/api/events/{event}/sellers"),
            &token,
            json!({ "name": "João", "phone": null }),
        )
        .await;
    assert_eq!(seller.status, StatusCode::CREATED);
    let seller_id = seller.json()["id"].as_str().unwrap().to_owned();
    let duplicate = app
        .post(
            &format!("/api/events/{event}/sellers"),
            &token,
            json!({ "name": "João" }),
        )
        .await;
    assert_eq!(duplicate.error_code(), "seller_exists");
    let ranges = format!("/api/sellers/{seller_id}/ranges");
    assert_eq!(
        app.post(&ranges, &token, json!({ "first": 1, "last": 5 }))
            .await
            .status,
        StatusCode::CREATED
    );
    let overlap = app
        .post(&ranges, &token, json!({ "first": 4, "last": 8 }))
        .await;
    assert_eq!(
        (overlap.status, overlap.error_code().as_str()),
        (StatusCode::CONFLICT, "range_overlap")
    );
    let not_issued = app
        .post(&ranges, &token, json!({ "first": 20, "last": 30 }))
        .await;
    assert_eq!(not_issued.error_code(), "range_not_issued");
    let sellers = app
        .get(&format!("/api/events/{event}/sellers"), &token)
        .await
        .json();
    assert_eq!(sellers[0]["ranges"][0]["last"], 5);

    // Voids: 9–10 voided, then 10 restored by undo + a smaller void.
    let void = app
        .post(
            &format!("/api/events/{event}/voids"),
            &token,
            json!({ "first": 9, "last": 10, "reason": "lost", "note": "perdidos" }),
        )
        .await;
    assert_eq!(void.status, StatusCode::CREATED);
    let void_id = void.json()["id"].as_str().unwrap().to_owned();
    assert!(
        app.request(
            Method::POST,
            &format!("/api/voids/{void_id}/undo"),
            Some(&token),
            None
        )
        .await
        .json()["undoneAt"]
            .is_string()
    );
    app.post(
        &format!("/api/events/{event}/voids"),
        &token,
        json!({ "first": 9, "last": 9, "reason": "unsold" }),
    )
    .await;

    // Home PDF of every paid, non-voided ticket: 1–10 minus 9.
    let export = app
        .post(
            &format!("/api/events/{event}/exports"),
            &token,
            json!({ "kind": "home", "scope": { "type": "all" } }),
        )
        .await
        .json();
    ingressoimpresso_server::jobs::run_pending(&app.state)
        .await
        .unwrap();
    let export_id = export["id"].as_str().unwrap();
    let done = app
        .get(&format!("/api/exports/{export_id}"), &token)
        .await
        .json();
    assert_eq!(done["status"], "done", "{done}");
    assert_eq!(done["ticketCount"], 9);
    assert_eq!(done["fileName"], "show-de-lancamento-casa-a4.pdf");

    let link = app
        .request(
            Method::POST,
            &format!("/api/exports/{export_id}/link"),
            Some(&token),
            None,
        )
        .await
        .json();
    let url = link["url"].as_str().unwrap();
    let path = url.strip_prefix("http://api.test").unwrap();
    let file = app.request(Method::GET, path, None, None).await;
    assert_eq!(file.status, StatusCode::OK);
    assert!(file.bytes.starts_with(b"%PDF"));
    assert!(
        file.headers[header::CONTENT_DISPOSITION]
            .to_str()
            .unwrap()
            .contains("show-de-lancamento-casa-a4.pdf")
    );
    assert_eq!(
        app.request(Method::GET, "/api/downloads/not-a-token", None, None)
            .await
            .status,
        StatusCode::NOT_FOUND
    );

    // WhatsApp images of João's range: signed with the event key, verified independently.
    let export = app
        .post(
            &format!("/api/events/{event}/exports"),
            &token,
            json!({ "kind": "whatsapp", "scope": { "type": "seller", "sellerId": seller_id } }),
        )
        .await
        .json();
    ingressoimpresso_server::jobs::run_pending(&app.state)
        .await
        .unwrap();
    let export_id = export["id"].as_str().unwrap();
    let done = app
        .get(&format!("/api/exports/{export_id}"), &token)
        .await
        .json();
    assert_eq!(
        (done["status"].as_str(), done["ticketCount"].as_i64()),
        (Some("done"), Some(5)),
        "{done}"
    );
    let link = app
        .request(
            Method::POST,
            &format!("/api/exports/{export_id}/link"),
            Some(&token),
            None,
        )
        .await
        .json();
    let zip_bytes = app
        .request(
            Method::GET,
            link["url"]
                .as_str()
                .unwrap()
                .strip_prefix("http://api.test")
                .unwrap(),
            None,
            None,
        )
        .await
        .bytes;
    let mut archive = zip::ZipArchive::new(std::io::Cursor::new(zip_bytes)).unwrap();
    assert_eq!(archive.len(), 5);

    let verifier = verifier(&app, &event).await;
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).unwrap();
        assert!(entry.name().starts_with("João/"), "{}", entry.name());
        let mut jpeg = Vec::new();
        std::io::Read::read_to_end(&mut entry, &mut jpeg).unwrap();
        let luma = image::load_from_memory(&jpeg).unwrap().to_luma8();
        let mut prepared = rqrr::PreparedImage::prepare(luma);
        let grids = prepared.detect_grids();
        assert_eq!(grids.len(), 1);
        let (_, text) = grids[0].decode().unwrap();
        let number = verifier
            .verify_qr_text(&text)
            .expect("signed by the event key")
            .number()
            .get();
        assert!((1..=5).contains(&number));
    }
}

/// A verifier built from what the database holds (public key, tag), like a door device.
async fn verifier(app: &TestApp, event: &str) -> EventVerifier {
    let event_id: uuid::Uuid = event.parse().unwrap();
    let row = sqlx::query!(
        "select e.qr_tag, k.public_key from events e join event_signing_keys k on k.event_id = e.id where e.id = $1 and k.key_id = 1",
        event_id
    )
    .fetch_one(&app.state.pool)
    .await
    .unwrap();
    let public_key: [u8; 32] = row.public_key.as_slice().try_into().unwrap();
    EventVerifier::new(
        EventId::from(event_id),
        EventTag::new(u32::try_from(row.qr_tag).unwrap()),
        vec![EventKey {
            key_id: KeyId::new(1),
            public_key: EventPublicKey::from_bytes(&public_key).unwrap(),
            status: KeyStatus::Active,
        }],
    )
    .unwrap()
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn missing_export_file_is_gone(pool: PgPool) {
    let app = TestApp::new(pool);
    let token = app.login("banda@exemplo.com").await;
    let admin = app.login(ADMIN).await;
    let event = app.create_event(&token, "Show").await;
    let batch = app
        .post(
            &format!("/api/events/{event}/batches"),
            &token,
            json!({ "quantity": 2 }),
        )
        .await
        .json();
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
    let export = app
        .post(
            &format!("/api/events/{event}/exports"),
            &token,
            json!({ "kind": "control", "scope": { "type": "all" } }),
        )
        .await
        .json();
    ingressoimpresso_server::jobs::run_pending(&app.state)
        .await
        .unwrap();
    let export_id = export["id"].as_str().unwrap();
    let link = app
        .request(
            Method::POST,
            &format!("/api/exports/{export_id}/link"),
            Some(&token),
            None,
        )
        .await
        .json();
    for entry in std::fs::read_dir(&app.state.config.export_dir).unwrap() {
        std::fs::remove_file(entry.unwrap().path()).unwrap();
    }
    let reply = app
        .request(
            Method::GET,
            link["url"]
                .as_str()
                .unwrap()
                .strip_prefix("http://api.test")
                .unwrap(),
            None,
            None,
        )
        .await;
    assert_eq!(reply.status, StatusCode::GONE);
    assert_eq!(reply.error_code(), "export_expired");
}
