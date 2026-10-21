//! Combos (ADR 0112): a ticket that takes several items at a checkpoint ("entrada + 2 bebidas").

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
use common::door::{create_link, manifest, register, scan};
use common::{ADMIN, TestApp};
use serde_json::{Value, json};
use sqlx::PgPool;

async fn paid_event(app: &TestApp, token: &str) -> String {
    let admin = app.login(ADMIN).await;
    let event = app.create_event(token, "Baile").await;
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

async fn category(
    app: &TestApp,
    token: &str,
    event: &str,
    name: &str,
    first: u32,
    last: u32,
) -> String {
    let reply = app
        .post(
            &format!("/api/events/{event}/categories"),
            token,
            json!({ "name": name, "color": "#ea580c", "priceCents": 5000 }),
        )
        .await;
    assert_eq!(reply.status, StatusCode::CREATED);
    let id = reply.json()["id"].as_str().unwrap().to_owned();
    let ranges = app
        .post(
            &format!("/api/categories/{id}/ranges"),
            token,
            json!({ "first": first, "last": last }),
        )
        .await;
    assert_eq!(ranges.status, StatusCode::CREATED);
    id
}

fn use_scan(id: &str, number: u32, minutes: i64, slot: Option<u8>) -> Value {
    let mut value = scan(id, Some(number), "benefit_granted", minutes * 60_000);
    if let Some(slot) = slot {
        value["slot"] = json!(slot);
    }
    value
}

async fn upload_status(
    app: &TestApp,
    phone: &common::door::Phone,
    scans: Vec<Value>,
) -> (StatusCode, Value) {
    let reply = app
        .post(
            "/api/door/scans",
            &phone.secret,
            json!({ "scans": scans, "confirm": false }),
        )
        .await;
    (reply.status, reply.json())
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn a_combo_hands_over_each_item_once(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("baile@exemplo.com").await;
    let event = paid_event(&app, &token).await;
    let combo = category(&app, &token, &event, "Entrada + 2 bebidas", 1, 10).await;
    category(&app, &token, &event, "Entrada", 11, 20).await;

    // Items per ticket are checked: 1–20, only for the categories with the right.
    let checkpoints = format!("/api/events/{event}/checkpoints");
    let too_many = app
        .post(
            &checkpoints,
            &token,
            json!({ "name": "Bebida", "perDay": false, "categoryIds": [combo],
                    "categoryAllowances": [{ "categoryId": combo, "allowance": 21 }] }),
        )
        .await;
    assert_eq!(too_many.error_code(), "invalid_checkpoint_allowance");
    let created = app
        .post(
            &checkpoints,
            &token,
            json!({ "name": "Bebida", "perDay": false, "categoryIds": [combo],
                    "categoryAllowances": [{ "categoryId": combo, "allowance": 2 }] }),
        )
        .await;
    assert_eq!(
        created.status,
        StatusCode::CREATED,
        "{}",
        String::from_utf8_lossy(&created.bytes)
    );
    let bar = created.json();
    assert_eq!(bar["allowance"], 1);
    assert_eq!(
        bar["categoryAllowances"],
        json!([{ "categoryId": combo, "allowance": 2 }])
    );
    let bar_id = bar["id"].as_str().unwrap().to_owned();

    // The bar's phones know how many items each category takes.
    let link = app
        .post(
            &format!("/api/events/{event}/door/accesses"),
            &token,
            json!({ "label": "Bar", "checkpointId": bar_id }),
        )
        .await
        .json();
    let counter = register(&app, link["token"].as_str().unwrap(), "Bar 1").await;
    let page = manifest(&app, &counter, None).await;
    assert_eq!(page["checkpoint"]["categoryAllowances"][0]["allowance"], 2);

    // Ticket 3: the first and the second drink, each once.
    let (status, first) = upload_status(
        &app,
        &counter,
        vec![use_scan(
            "00000000-0000-4000-8000-0000000d0001",
            3,
            10,
            None,
        )],
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(first["results"][0]["class"], "first_entry");
    let (_, second) = upload_status(
        &app,
        &counter,
        vec![use_scan(
            "00000000-0000-4000-8000-0000000d0002",
            3,
            20,
            Some(2),
        )],
    )
    .await;
    assert_eq!(second["results"][0]["class"], "first_entry");
    let (_, again) = upload_status(
        &app,
        &counter,
        vec![use_scan(
            "00000000-0000-4000-8000-0000000d0003",
            3,
            30,
            Some(2),
        )],
    )
    .await;
    assert_eq!(again["results"][0]["class"], "duplicate_entry");
    assert_eq!(again["results"][0]["firstEntry"]["deviceName"], "Bar 1");

    // Other phones of the bar hear of both items, each in its slot.
    let page = manifest(&app, &counter, None).await;
    let mut slots: Vec<Value> = page["entries"]
        .as_array()
        .unwrap()
        .iter()
        .map(|entry| entry["slot"].clone())
        .collect();
    slots.sort_by_key(ToString::to_string);
    slots.dedup();
    assert_eq!(slots, [json!(2), Value::Null]);

    // The entrance has a single slot.
    let (_, access) = create_link(&app, &token, &event).await;
    let gate = register(&app, &access, "Portão").await;
    let mut entry = scan(
        "00000000-0000-4000-8000-0000000d0004",
        Some(3),
        "admitted",
        0,
    );
    entry["slot"] = json!(2);
    let (status, _) = upload_status(&app, &gate, vec![entry]).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    // The live view counts items: ten combos of two drinks.
    let live = app
        .get(&format!("/api/events/{event}/door/live"), &token)
        .await
        .json();
    let block = &live["checkpoints"][0];
    assert_eq!(block["entitled"], 10);
    assert_eq!(block["allowanceTotal"], 20);
    assert_eq!(block["used"], 2);

    // A copy of the event keeps the combo.
    let overview = app
        .get(&format!("/api/events/{event}/door"), &token)
        .await
        .json();
    assert_eq!(overview["checkpoints"][0]["uses"], 2);
    let edited = app
        .put(
            &format!("/api/checkpoints/{bar_id}"),
            &token,
            json!({ "name": "Bebida", "perDay": false, "categoryIds": [], "allowance": 3 }),
        )
        .await;
    assert_eq!(edited.status, StatusCode::OK);
    assert_eq!(edited.json()["allowance"], 3);
    assert_eq!(edited.json()["categoryAllowances"], json!([]));
}
