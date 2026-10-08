//! Door API (phase 4): access links, phone registration, manifest cursor and scan classification.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing,
    reason = "test helpers fail loudly by design"
)]

mod common;

use axum::http::{Method, StatusCode};
use common::door::{AT, create_link, manifest, numbers, register, scan, upload};
use common::{ADMIN, TestApp};
use serde_json::{Value, json};
use sqlx::PgPool;

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn links_register_phones_and_revocation_cuts_them(pool: PgPool) {
    let app = TestApp::new(pool);
    let token = app.login("banda@exemplo.com").await;
    let event = app.create_event(&token, "Show").await;
    let (access_id, access_token) = create_link(&app, &token, &event).await;

    let overview = app.get(&format!("/api/events/{event}/door"), &token).await;
    let expires = overview.json()["accesses"][0]["expiresAt"].clone();
    // Event ends 2026-11-21T03:00-03:00; links last 12 hours more.
    assert_eq!(expires, "2026-11-21T18:00:00Z");

    // Wrong token, blank name.
    let wrong = app
        .request(
            Method::POST,
            "/api/door/register",
            None,
            Some(json!({ "accessToken": "nope", "deviceName": "Porta 1" })),
        )
        .await;
    assert_eq!(wrong.status, StatusCode::UNAUTHORIZED);
    let blank = app
        .request(
            Method::POST,
            "/api/door/register",
            None,
            Some(json!({ "accessToken": access_token, "deviceName": "  " })),
        )
        .await;
    assert_eq!(blank.error_code(), "invalid_device_name");

    let first = register(&app, &access_token, "Porta 1").await;
    let second = register(&app, &access_token, "Porta 2").await;
    let start = manifest(&app, &first, None).await;
    assert_eq!(start["deviceName"], "Porta 1");
    assert_eq!(start["event"]["name"], "Show");
    assert_eq!(start["event"]["numberDigits"], 4);
    assert_eq!(start["verifier"]["eventId"], event.as_str());
    assert_eq!(start["verifier"]["keys"][0]["status"], "active");
    assert_eq!(
        start["verifier"]["keys"][0]["publicKey"]
            .as_str()
            .unwrap()
            .len(),
        64
    );

    let devices = app.get(&format!("/api/events/{event}/door"), &token).await;
    assert_eq!(devices.json()["devices"].as_array().unwrap().len(), 2);

    // Another organization sees nothing.
    let stranger = app.login("outra@exemplo.com").await;
    let hidden = app
        .get(&format!("/api/events/{event}/door"), &stranger)
        .await;
    assert_eq!(hidden.status, StatusCode::NOT_FOUND);
    let hidden = app
        .request(
            Method::POST,
            &format!("/api/door-devices/{}/revoke", first.id),
            Some(&stranger),
            None,
        )
        .await;
    assert_eq!(hidden.status, StatusCode::NOT_FOUND);

    // Revoking a phone cuts only that phone; revoking the link cuts the rest.
    let revoked = app
        .request(
            Method::POST,
            &format!("/api/door-devices/{}/revoke", second.id),
            Some(&token),
            None,
        )
        .await;
    assert!(revoked.json()["revokedAt"].is_string());
    let cut = app.get("/api/door/manifest", &second.secret).await;
    assert_eq!(cut.status, StatusCode::UNAUTHORIZED);
    manifest(&app, &first, None).await;
    app.request(
        Method::POST,
        &format!("/api/door-accesses/{access_id}/revoke"),
        Some(&token),
        None,
    )
    .await;
    let cut = app.get("/api/door/manifest", &first.secret).await;
    assert_eq!(cut.status, StatusCode::UNAUTHORIZED);
    let late = app
        .request(
            Method::POST,
            "/api/door/register",
            None,
            Some(json!({ "accessToken": access_token, "deviceName": "Porta 3" })),
        )
        .await;
    assert_eq!(late.status, StatusCode::UNAUTHORIZED);
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn scans_are_classified_once_across_phones(pool: PgPool) {
    let app = TestApp::new(pool);
    let token = app.login("banda@exemplo.com").await;
    let admin = app.login(ADMIN).await;
    let event = app.create_event(&token, "Show").await;
    let batch = app
        .post(
            &format!("/api/events/{event}/batches"),
            &token,
            json!({ "quantity": 10 }),
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
    let seller = app
        .post(
            &format!("/api/events/{event}/sellers"),
            &token,
            json!({ "name": "João" }),
        )
        .await
        .json();
    app.post(
        &format!("/api/sellers/{}/ranges", seller["id"].as_str().unwrap()),
        &token,
        json!({ "first": 1, "last": 5 }),
    )
    .await;
    app.post(
        &format!("/api/events/{event}/voids"),
        &token,
        json!({ "first": 5, "last": 5, "reason": "lost" }),
    )
    .await;
    let (_, access_token) = create_link(&app, &token, &event).await;
    let door_a = register(&app, &access_token, "Porta A").await;
    let door_b = register(&app, &access_token, "Porta B").await;

    let start = manifest(&app, &door_a, None).await;
    assert_eq!(
        start["voids"],
        json!([{ "first": 5, "last": 5, "reason": "lost" }])
    );
    assert_eq!(
        start["sellers"],
        json!([{ "seller": "João", "first": 1, "last": 5 }])
    );
    let cursor = start["cursor"].as_str().unwrap().to_owned();

    // Online confirmation: the first phone wins, the copy learns where it entered.
    let a1 = "00000000-0000-4000-8000-0000000000a1";
    let first = upload(&app, &door_a, vec![scan(a1, Some(1), "admitted", 0)], true).await;
    assert_eq!(first["results"][0]["class"], "first_entry");
    let copy = upload(
        &app,
        &door_b,
        vec![scan(
            "00000000-0000-4000-8000-0000000000b1",
            Some(1),
            "admitted",
            60_000,
        )],
        true,
    )
    .await;
    assert_eq!(copy["results"][0]["class"], "duplicate_entry");
    assert_eq!(
        copy["results"][0]["firstEntry"],
        json!({ "atUnixMs": AT, "deviceName": "Porta A" })
    );
    // A retried upload gets the same answer.
    let retry = upload(&app, &door_a, vec![scan(a1, Some(1), "admitted", 0)], false).await;
    assert_eq!(retry["results"][0]["class"], "first_entry");

    // Offline batch from B, in any order: void entry, rejection, first entry.
    let batch = upload(
        &app,
        &door_b,
        vec![
            scan(
                "00000000-0000-4000-8000-0000000000b5",
                Some(5),
                "admitted",
                1,
            ),
            scan(
                "00000000-0000-4000-8000-0000000000b0",
                None,
                "rejected_invalid",
                2,
            ),
            scan(
                "00000000-0000-4000-8000-0000000000b2",
                Some(2),
                "admitted",
                3,
            ),
        ],
        false,
    )
    .await;
    let classes: Vec<&Value> = batch["results"]
        .as_array()
        .unwrap()
        .iter()
        .map(|result| &result["class"])
        .collect();
    assert_eq!(
        classes,
        [&json!("void_entry"), &Value::Null, &json!("first_entry")]
    );
    assert_eq!(batch["results"][0]["voidReason"], "lost");

    // Every admitted scan reaches every phone once, through the cursor.
    let synced = manifest(&app, &door_a, Some(&cursor)).await;
    assert_eq!(
        numbers(&synced),
        [
            (1, "Porta A".to_owned()),
            (1, "Porta B".to_owned()),
            (2, "Porta B".to_owned()),
            (5, "Porta B".to_owned()),
        ]
    );
    let again = manifest(&app, &door_a, synced["cursor"].as_str()).await;
    assert!(again["entries"].as_array().unwrap().is_empty());

    let overview = app
        .get(&format!("/api/events/{event}/door"), &token)
        .await
        .json();
    assert_eq!(overview["entryCount"], 3);

    // Malformed uploads.
    let taken = app
        .post(
            "/api/door/scans",
            &door_a.secret,
            json!({ "scans": [scan("00000000-0000-4000-8000-0000000000b2", Some(2), "admitted", 0)] }),
        )
        .await;
    assert_eq!(taken.error_code(), "scan_conflict");
    for body in [
        json!({ "scans": [scan("00000000-0000-4000-8000-0000000000c1", None, "admitted", 0)] }),
        json!({ "scans": [], "confirm": false }),
        json!({ "scans": [
            scan("00000000-0000-4000-8000-0000000000c2", Some(3), "admitted", 0),
            scan("00000000-0000-4000-8000-0000000000c3", Some(4), "admitted", 0)
        ], "confirm": true }),
    ] {
        let reply = app.post("/api/door/scans", &door_a.secret, body).await;
        assert_eq!(reply.error_code(), "invalid_scans");
    }
}
