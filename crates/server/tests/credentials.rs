//! Credentials for the staff, the press and the artists (ADR 0111).

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing,
    clippy::too_many_lines,
    reason = "test helpers fail loudly by design"
)]

mod common;

use axum::http::{Method, StatusCode};
use common::door::{create_link, register, scan};
use common::{ADMIN, TestApp};
use serde_json::{Value, json};
use sqlx::PgPool;

const FIRST: u32 = 2_000_000_001;

async fn paid_event(app: &TestApp, token: &str, tickets: i32) -> String {
    let admin = app.login(ADMIN).await;
    let event = app.create_event(token, "Festival").await;
    let batch = app.create_batch(token, &event, tickets).await;
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
    event
}

async fn manifest_with(app: &TestApp, phone: &common::door::Phone, version: &str) -> Value {
    let reply = app
        .get(
            &format!("/api/door/manifest?credentials={version}"),
            &phone.secret,
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK);
    reply.json()
}

async fn upload(app: &TestApp, phone: &common::door::Phone, scans: Vec<Value>) -> StatusCode {
    app.post(
        "/api/door/scans",
        &phone.secret,
        json!({ "scans": scans, "confirm": false }),
    )
    .await
    .status
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn credentials_open_their_areas_and_never_count_as_audience(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("festival@exemplo.com").await;
    let event = paid_event(&app, &token, 50).await;
    let backstage = app
        .post(
            &format!("/api/events/{event}/checkpoints"),
            &token,
            json!({ "name": "Camarim", "perDay": false, "categoryIds": [] }),
        )
        .await
        .json();
    let backstage_id = backstage["id"].as_str().unwrap().to_owned();
    let url = format!("/api/events/{event}/credentials");

    // Checked: a name, a role, a colour and somewhere to go.
    for (body, code) in [
        (json!({ "name": "", "role": "Staff", "color": "#1d4ed8", "entrance": true, "checkpointIds": [] }), "invalid_credential_name"),
        (json!({ "name": "Ana", "role": "Staff", "color": "azul", "entrance": true, "checkpointIds": [] }), "invalid_color"),
        (json!({ "name": "Ana", "role": "Staff", "color": "#1d4ed8", "entrance": false, "checkpointIds": [] }), "invalid_credential_areas"),
    ] {
        assert_eq!(app.post(&url, &token, body).await.error_code(), code);
    }

    let press = app
        .post(
            &url,
            &token,
            json!({ "name": " Bia Lima ", "role": "Imprensa", "organization": "Rádio Cidade",
                    "color": "#1D4ED8", "entrance": true, "checkpointIds": [] }),
        )
        .await;
    assert_eq!(press.status, StatusCode::CREATED, "{}", String::from_utf8_lossy(&press.bytes));
    let press = press.json();
    assert_eq!(press["number"], FIRST);
    assert_eq!(press["code"], "C-0001");
    assert_eq!(press["name"], "Bia Lima");
    assert_eq!(press["color"], "#1d4ed8");
    let artist = app
        .post(
            &url,
            &token,
            json!({ "name": "Caio", "role": "Artista", "color": "#7c3aed", "entrance": true,
                    "checkpointIds": [backstage_id] }),
        )
        .await
        .json();
    assert_eq!(artist["code"], "C-0002");
    let list = app.get(&url, &token).await.json();
    assert_eq!(list["credentials"].as_array().unwrap().len(), 2);
    // 20 plus one for every 10 paid tickets.
    assert_eq!(list["limit"], 25);

    // The badges, four to a page.
    let pdf = app
        .get(&format!("/api/events/{event}/credentials/badges"), &token)
        .await;
    assert_eq!(pdf.status, StatusCode::OK);
    assert!(pdf.bytes.starts_with(b"%PDF"));

    // The door hears of them once, then only when they change.
    let (_, access) = create_link(&app, &token, &event).await;
    let gate = register(&app, &access, "Portão").await;
    let page = manifest_with(&app, &gate, "").await;
    let version = page["credentialsVersion"].as_str().unwrap().to_owned();
    let credentials = page["credentials"].as_array().unwrap();
    assert_eq!(credentials.len(), 2);
    assert_eq!(credentials[1]["checkpointIds"], json!([backstage_id]));
    assert!(manifest_with(&app, &gate, &version).await["credentials"].is_null());

    // Let through at the entrance: recorded, never an entry.
    let mut read = scan("00000000-0000-4000-8000-0000000e0001", Some(FIRST), "credential_admitted", 0);
    assert_eq!(upload(&app, &gate, vec![read.clone()]).await, StatusCode::OK);
    read["id"] = json!("00000000-0000-4000-8000-0000000e0002");
    read["outcome"] = json!("rejected_credential");
    read["number"] = json!(FIRST + 1);
    assert_eq!(upload(&app, &gate, vec![read]).await, StatusCode::OK);
    // A credential's number is never a ticket's, nor the other way round.
    assert_eq!(
        upload(&app, &gate, vec![scan("00000000-0000-4000-8000-0000000e0003", Some(FIRST), "admitted", 0)]).await,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        upload(&app, &gate, vec![scan("00000000-0000-4000-8000-0000000e0004", Some(7), "credential_admitted", 0)]).await,
        StatusCode::BAD_REQUEST
    );
    let overview = app.get(&format!("/api/events/{event}/door"), &token).await.json();
    assert_eq!(overview["entryCount"], 0);
    let live = app
        .get(&format!("/api/events/{event}/door/live"), &token)
        .await
        .json();
    assert_eq!(live["entries"], 0);
    assert_eq!(live["credentials"], json!({ "active": 2, "seen": 1, "refused": 1 }));
    let list = app.get(&url, &token).await.json();
    assert_eq!(list["credentials"][0]["reads"], 1);

    // Revoked: the phones hear of it, the badge sheet leaves it out.
    let artist_id = artist["id"].as_str().unwrap();
    let revoked = app
        .post(&format!("/api/credentials/{artist_id}/revoke"), &token, json!({}))
        .await;
    assert_eq!(revoked.status, StatusCode::OK);
    let page = manifest_with(&app, &gate, &version).await;
    assert_eq!(page["credentials"][1]["revoked"], true);
    let only = app
        .get(
            &format!("/api/events/{event}/credentials/badges?ids={artist_id}"),
            &token,
        )
        .await;
    assert_eq!(only.error_code(), "no_credentials");
    app.post(&format!("/api/credentials/{artist_id}/restore"), &token, json!({}))
        .await;

    // Edited: another role, no entrance.
    let edited = app
        .put(
            &format!("/api/credentials/{artist_id}"),
            &token,
            json!({ "name": "Caio", "role": "Banda", "color": "#7c3aed", "entrance": false,
                    "checkpointIds": [backstage_id] }),
        )
        .await;
    assert_eq!(edited.status, StatusCode::OK);
    assert_eq!(edited.json()["entrance"], false);
    assert!(edited.json()["revokedAt"].is_null());
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn credentials_grow_with_paid_tickets(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("escola@exemplo.com").await;
    let event = app.create_event(&token, "Feira").await;
    let url = format!("/api/events/{event}/credentials");
    for index in 0..20 {
        let reply = app
            .post(
                &url,
                &token,
                json!({ "name": format!("Pessoa {index}"), "role": "Staff", "color": "#0f766e",
                        "entrance": true, "checkpointIds": [] }),
            )
            .await;
        assert_eq!(reply.status, StatusCode::CREATED);
    }
    let over = app
        .post(
            &url,
            &token,
            json!({ "name": "Mais uma", "role": "Staff", "color": "#0f766e", "entrance": true, "checkpointIds": [] }),
        )
        .await;
    assert_eq!(over.error_code(), "too_many_credentials");
}
