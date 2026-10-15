//! Exit and return (ADR 0083) and the document check of a category (ADR 0082) at the door.

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
use common::door::{create_link, manifest, register, scan, upload};
use common::{ADMIN, TestApp};
use serde_json::{Value, json};
use sqlx::PgPool;

/// An event with 20 paid tickets; returns its id.
async fn paid_event(app: &TestApp, token: &str) -> String {
    let admin = app.login(ADMIN).await;
    let event = app.create_event(token, "Formatura").await;
    let batch = app.create_batch(token, &event, 20).await;
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

async fn set_reentry(app: &TestApp, token: &str, event: &str, allowed: bool) -> Value {
    let reply = app
        .put(
            &format!("/api/events/{event}/door-settings"),
            token,
            json!({ "reentry": allowed }),
        )
        .await;
    assert_eq!(
        reply.status,
        StatusCode::OK,
        "{}",
        String::from_utf8_lossy(&reply.bytes)
    );
    reply.json()
}

async fn live(app: &TestApp, token: &str, event: &str) -> Value {
    let reply = app
        .get(&format!("/api/events/{event}/door/live"), token)
        .await;
    assert_eq!(reply.status, StatusCode::OK);
    reply.json()
}

/// Exits and entries of a manifest page, as `(number, device)`.
fn movements(page: &Value, key: &str) -> Vec<(u64, String)> {
    page[key]
        .as_array()
        .unwrap()
        .iter()
        .map(|item| {
            (
                item["number"].as_u64().unwrap(),
                item["deviceName"].as_str().unwrap().to_owned(),
            )
        })
        .collect()
}

const MINUTE: i64 = 60_000;

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn tickets_go_out_and_come_back(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("formatura@exemplo.com").await;
    let event = paid_event(&app, &token).await;
    let (_, access) = create_link(&app, &token, &event).await;
    let gate = register(&app, &access, "Portão").await;
    let exit = register(&app, &access, "Saída").await;

    // Off by default; the overview and the phones say so.
    let overview = app
        .get(&format!("/api/events/{event}/door"), &token)
        .await
        .json();
    assert_eq!(overview["reentry"], false);
    let start = manifest(&app, &gate, None).await;
    assert_eq!(start["event"]["reentry"], false);
    assert_eq!(start["exits"], json!([]));

    let overview = set_reentry(&app, &token, &event, true).await;
    assert_eq!(overview["reentry"], true);
    assert_eq!(manifest(&app, &gate, None).await["event"]["reentry"], true);

    // Ticket 7 enters, goes out and comes back.
    let first = upload(
        &app,
        &gate,
        vec![scan(
            "00000000-0000-4000-8000-00000000a001",
            Some(7),
            "admitted",
            0,
        )],
        true,
    )
    .await;
    assert_eq!(first["results"][0]["class"], "first_entry");
    let out = upload(
        &app,
        &exit,
        vec![scan(
            "00000000-0000-4000-8000-00000000a002",
            Some(7),
            "exited",
            30 * MINUTE,
        )],
        false,
    )
    .await;
    assert!(out["results"][0]["class"].is_null());
    let back = upload(
        &app,
        &gate,
        vec![scan(
            "00000000-0000-4000-8000-00000000a003",
            Some(7),
            "readmitted",
            60 * MINUTE,
        )],
        true,
    )
    .await;
    assert_eq!(back["results"][0]["class"], "reentry");

    // A copy coming back through another phone while the ticket is inside: a duplicate, with the
    // entry that holds now (the return), not the first one.
    let copy = upload(
        &app,
        &exit,
        vec![scan(
            "00000000-0000-4000-8000-00000000a004",
            Some(7),
            "readmitted",
            61 * MINUTE,
        )],
        true,
    )
    .await;
    assert_eq!(copy["results"][0]["class"], "duplicate_entry");
    assert_eq!(copy["results"][0]["firstEntry"]["deviceName"], "Portão");
    assert_eq!(
        copy["results"][0]["firstEntry"]["atUnixMs"],
        common::door::AT + 60 * MINUTE
    );

    // A phone that never heard of the entry let ticket 8 "in" after it went out elsewhere: the
    // server sees a return.
    upload(
        &app,
        &gate,
        vec![scan(
            "00000000-0000-4000-8000-00000000a005",
            Some(8),
            "admitted",
            0,
        )],
        false,
    )
    .await;
    upload(
        &app,
        &exit,
        vec![scan(
            "00000000-0000-4000-8000-00000000a006",
            Some(8),
            "exited",
            10 * MINUTE,
        )],
        false,
    )
    .await;
    let late = upload(
        &app,
        &exit,
        vec![scan(
            "00000000-0000-4000-8000-00000000a007",
            Some(8),
            "admitted",
            20 * MINUTE,
        )],
        false,
    )
    .await;
    assert_eq!(late["results"][0]["class"], "reentry");

    // Uploads are idempotent: the stored class answers a retry.
    let retry = upload(
        &app,
        &gate,
        vec![scan(
            "00000000-0000-4000-8000-00000000a003",
            Some(7),
            "readmitted",
            60 * MINUTE,
        )],
        true,
    )
    .await;
    assert_eq!(retry["results"][0]["class"], "reentry");

    // Every phone hears of the exits apart from the entries (old apps read only the entries).
    // Transaction ids are shared by the cluster: a test running alongside may hold the cursor
    // back for a moment, so the pages are followed until everything arrived.
    let (mut entries, mut exits) = (Vec::new(), Vec::new());
    let mut cursor: Option<String> = None;
    for _ in 0..100 {
        let page = manifest(&app, &gate, cursor.as_deref()).await;
        entries.extend(movements(&page, "entries"));
        exits.extend(movements(&page, "exits"));
        cursor = Some(page["cursor"].as_str().unwrap().to_owned());
        if entries.len() >= 5 && exits.len() >= 2 {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }
    exits.sort();
    assert_eq!(exits, [(7, "Saída".to_owned()), (8, "Saída".to_owned())]);
    assert_eq!(entries.len(), 5);

    // Ticket 7 is inside (came back), 8 too; then 8 goes out again.
    upload(
        &app,
        &exit,
        vec![scan(
            "00000000-0000-4000-8000-00000000a008",
            Some(8),
            "exited",
            90 * MINUTE,
        )],
        false,
    )
    .await;
    let view = live(&app, &token, &event).await;
    assert_eq!(view["entries"], 2);
    assert_eq!(
        view["reentry"],
        json!({ "allowed": true, "inside": 1, "out": 1, "exits": 3, "returns": 2 })
    );

    // Turned off: what went out counts as inside again and a return is a copy.
    set_reentry(&app, &token, &event, false).await;
    let view = live(&app, &token, &event).await;
    assert_eq!(view["reentry"]["inside"], 2);
    assert_eq!(view["reentry"]["out"], 0);
    let refused = upload(
        &app,
        &gate,
        vec![scan(
            "00000000-0000-4000-8000-00000000a009",
            Some(8),
            "readmitted",
            95 * MINUTE,
        )],
        true,
    )
    .await;
    assert_eq!(refused["results"][0]["class"], "duplicate_entry");
    assert_eq!(refused["results"][0]["firstEntry"]["deviceName"], "Portão");
    assert_eq!(
        refused["results"][0]["firstEntry"]["atUnixMs"],
        common::door::AT
    );
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn a_batch_is_classified_in_the_order_things_happened(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("formatura@exemplo.com").await;
    let event = paid_event(&app, &token).await;
    let (_, access) = create_link(&app, &token, &event).await;
    let gate = register(&app, &access, "Portão").await;
    let other = register(&app, &access, "Lateral").await;
    set_reentry(&app, &token, &event, true).await;

    // One phone without signal: 42 enters, goes out and comes back; the batch goes up in any order.
    let batch = upload(
        &app,
        &gate,
        vec![
            scan(
                "00000000-0000-4000-8000-00000000c003",
                Some(42),
                "readmitted",
                90 * MINUTE,
            ),
            scan(
                "00000000-0000-4000-8000-00000000c001",
                Some(42),
                "admitted",
                0,
            ),
            scan(
                "00000000-0000-4000-8000-00000000c002",
                Some(42),
                "exited",
                60 * MINUTE,
            ),
        ],
        false,
    )
    .await;
    assert_eq!(batch["results"][0]["class"], "reentry");
    assert_eq!(batch["results"][1]["class"], "first_entry");
    assert!(batch["results"][2]["class"].is_null());

    // 42 goes out again; the owner comes back through the gate and, later in the upload, a copy
    // let in earlier by a phone without signal: one exit lets one return in.
    upload(
        &app,
        &gate,
        vec![scan(
            "00000000-0000-4000-8000-00000000c004",
            Some(42),
            "exited",
            120 * MINUTE,
        )],
        false,
    )
    .await;
    let owner = upload(
        &app,
        &gate,
        vec![scan(
            "00000000-0000-4000-8000-00000000c005",
            Some(42),
            "readmitted",
            150 * MINUTE,
        )],
        true,
    )
    .await;
    assert_eq!(owner["results"][0]["class"], "reentry");
    let copy = upload(
        &app,
        &other,
        vec![scan(
            "00000000-0000-4000-8000-00000000c006",
            Some(42),
            "readmitted",
            135 * MINUTE,
        )],
        false,
    )
    .await;
    assert_eq!(copy["results"][0]["class"], "duplicate_entry");
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn exits_need_an_authentic_number(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("formatura@exemplo.com").await;
    let event = paid_event(&app, &token).await;
    let (_, access) = create_link(&app, &token, &event).await;
    let phone = register(&app, &access, "Saída").await;
    for outcome in ["exited", "readmitted", "rejected_already_out"] {
        let reply = app
            .post(
                "/api/door/scans",
                &phone.secret,
                json!({ "scans": [scan("00000000-0000-4000-8000-00000000b001", None, outcome, 0)] }),
            )
            .await;
        assert_eq!(reply.error_code(), "invalid_scans", "{outcome}");
    }
    // Only an entry may be an exception of a door limited to some categories (ADR 0068).
    let mut exit = scan("00000000-0000-4000-8000-00000000b002", Some(3), "exited", 0);
    exit["exception"] = json!(true);
    let reply = app
        .post("/api/door/scans", &phone.secret, json!({ "scans": [exit] }))
        .await;
    assert_eq!(reply.error_code(), "invalid_scans");
    let mut back = scan(
        "00000000-0000-4000-8000-00000000b003",
        Some(3),
        "readmitted",
        0,
    );
    back["exception"] = json!(true);
    let result = upload(&app, &phone, vec![back], false).await;
    assert_eq!(result["results"][0]["class"], "first_entry");
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn door_settings_belong_to_the_door_area(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let owner = app.login("formatura@exemplo.com").await;
    let event = paid_event(&app, &owner).await;
    for (email, areas) in [
        ("porta@exemplo.com", json!(["door"])),
        ("arte@exemplo.com", json!(["art"])),
    ] {
        let reply = app
            .post(
                &format!("/api/events/{event}/team"),
                &owner,
                json!({ "email": email, "areas": areas }),
            )
            .await;
        assert_eq!(reply.status, StatusCode::CREATED);
    }
    let door = app.login("porta@exemplo.com").await;
    assert_eq!(
        set_reentry(&app, &door, &event, true).await["reentry"],
        true
    );
    let art = app.login("arte@exemplo.com").await;
    let reply = app
        .put(
            &format!("/api/events/{event}/door-settings"),
            &art,
            json!({ "reentry": false }),
        )
        .await;
    assert_eq!(reply.error_code(), "not_your_area");

    // A copy of the event keeps the switch.
    let copy = app
        .post(&format!("/api/events/{event}/duplicate"), &owner, json!({}))
        .await
        .json();
    let overview = app
        .get(
            &format!("/api/events/{}/door", copy["id"].as_str().unwrap()),
            &owner,
        )
        .await
        .json();
    assert_eq!(overview["reentry"], true);
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn categories_ask_for_a_document(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("formatura@exemplo.com").await;
    let event = paid_event(&app, &token).await;

    let too_long = app
        .post(
            &format!("/api/events/{event}/categories"),
            &token,
            json!({ "name": "Meia", "color": "#e11d48", "priceCents": 1000,
                    "checkDocument": true, "documentNote": "x".repeat(81) }),
        )
        .await;
    assert_eq!(too_long.error_code(), "invalid_document_note");
    let two_lines = app
        .post(
            &format!("/api/events/{event}/categories"),
            &token,
            json!({ "name": "Meia", "color": "#e11d48", "priceCents": 1000,
                    "checkDocument": true, "documentNote": "Estudante\nIdoso" }),
        )
        .await;
    assert_eq!(two_lines.error_code(), "invalid_document_note");

    let meia = app
        .post(
            &format!("/api/events/{event}/categories"),
            &token,
            json!({ "name": "Meia", "color": "#e11d48", "priceCents": 1000,
                    "checkDocument": true, "documentNote": "  Carteira de estudante  " }),
        )
        .await;
    assert_eq!(meia.status, StatusCode::CREATED);
    let meia = meia.json();
    assert_eq!(meia["checkDocument"], true);
    assert_eq!(meia["documentNote"], "Carteira de estudante");
    let id = meia["id"].as_str().unwrap();
    app.post(
        &format!("/api/categories/{id}/ranges"),
        &token,
        json!({ "first": 1, "last": 5 }),
    )
    .await;
    // An old panel sends neither field: no document.
    let inteira = app
        .post(
            &format!("/api/events/{event}/categories"),
            &token,
            json!({ "name": "Inteira", "color": "#2563eb", "priceCents": null }),
        )
        .await
        .json();
    assert_eq!(inteira["checkDocument"], false);
    assert!(inteira["documentNote"].is_null());

    let (_, access) = create_link(&app, &token, &event).await;
    let phone = register(&app, &access, "Portão").await;
    let page = manifest(&app, &phone, None).await;
    let category = &page["categories"][0];
    assert_eq!(category["checkDocument"], true);
    assert_eq!(category["documentNote"], "Carteira de estudante");

    // Without the check the note goes too.
    let reply = app
        .put(
            &format!("/api/categories/{id}"),
            &token,
            json!({ "name": "Meia", "color": "#e11d48", "priceCents": 1000,
                    "checkDocument": false, "documentNote": "Carteira de estudante" }),
        )
        .await;
    assert_eq!(reply.status, StatusCode::NO_CONTENT);
    let list = app
        .get(&format!("/api/events/{event}/categories"), &token)
        .await
        .json();
    assert_eq!(list[0]["checkDocument"], false);
    assert!(list[0]["documentNote"].is_null());

    // A copy of the event keeps the categories as they are.
    app.put(
        &format!("/api/categories/{id}"),
        &token,
        json!({ "name": "Meia", "color": "#e11d48", "priceCents": 1000,
                "checkDocument": true, "documentNote": null }),
    )
    .await;
    let copy = app
        .post(&format!("/api/events/{event}/duplicate"), &token, json!({}))
        .await
        .json();
    let copied = app
        .get(
            &format!("/api/events/{}/categories", copy["id"].as_str().unwrap()),
            &token,
        )
        .await
        .json();
    assert_eq!(copied[0]["checkDocument"], true);
    assert!(copied[0]["documentNote"].is_null());
}
