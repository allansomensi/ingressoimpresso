//! Events of several days (ADR 0091), checkpoints (ADR 0092) and the instruction at the door
//! (ADR 0089).

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

const SATURDAY: (&str, &str) = ("2026-11-21T18:00:00-03:00", "2026-11-22T01:00:00-03:00");
const SUNDAY: (&str, &str) = ("2026-11-22T12:00:00-03:00", "2026-11-22T20:00:00-03:00");

fn days(list: &[(&str, &str)]) -> Value {
    Value::Array(
        list.iter()
            .map(|(start, end)| json!({ "startsAt": start, "endsAt": end }))
            .collect(),
    )
}

/// A weekend event (Saturday and Sunday) with 20 paid tickets.
async fn weekend(app: &TestApp, token: &str) -> String {
    let reply = app
        .post(
            "/api/events",
            token,
            json!({
                "name": "Encontro",
                "venue": "Salão",
                "startsAt": SATURDAY.0,
                "endsAt": SATURDAY.1,
                "ticketPriceCents": 6000,
                "days": days(&[SUNDAY, SATURDAY]),
            }),
        )
        .await;
    assert_eq!(
        reply.status,
        StatusCode::CREATED,
        "{}",
        String::from_utf8_lossy(&reply.bytes)
    );
    let event = reply.json();
    // Sorted, and the event runs from the first day's start to the last day's end.
    assert_eq!(event["days"][0]["position"], 1);
    assert_eq!(event["days"][0]["startsAt"], "2026-11-21T18:00:00-03:00");
    assert_eq!(event["days"][1]["endsAt"], "2026-11-22T20:00:00-03:00");
    assert_eq!(event["startsAt"], "2026-11-21T18:00:00-03:00");
    assert_eq!(event["endsAt"], "2026-11-22T20:00:00-03:00");
    let id = event["id"].as_str().unwrap().to_owned();
    let admin = app.login(ADMIN).await;
    let batch = app.create_batch(token, &id, 20).await;
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
    id
}

/// A category with numbers `first..=last`; returns its id.
async fn category(
    app: &TestApp,
    token: &str,
    event: &str,
    body: Value,
    first: u32,
    last: u32,
) -> String {
    let reply = app
        .post(&format!("/api/events/{event}/categories"), token, body)
        .await;
    assert_eq!(
        reply.status,
        StatusCode::CREATED,
        "{}",
        String::from_utf8_lossy(&reply.bytes)
    );
    let id = reply.json()["id"].as_str().unwrap().to_owned();
    let ranges = app
        .post(
            &format!("/api/categories/{id}/ranges"),
            token,
            json!({ "first": first, "last": last }),
        )
        .await;
    assert_eq!(
        ranges.status,
        StatusCode::CREATED,
        "{}",
        String::from_utf8_lossy(&ranges.bytes)
    );
    id
}

fn day_scan(
    id: &str,
    number: u32,
    outcome: &str,
    minutes: i64,
    day: u8,
    ledger_day: Option<u8>,
) -> Value {
    let mut value = scan(id, Some(number), outcome, minutes * 60_000);
    value["day"] = json!(day);
    value["ledgerDay"] = json!(ledger_day);
    value
}

/// The entries of a whole manifest once `expected` arrived. Transaction ids are shared by the
/// whole cluster: a write of a test running in parallel holds the cursor back for a moment.
async fn entries_of(app: &TestApp, phone: &common::door::Phone, expected: usize) -> Vec<Value> {
    for _ in 0..100 {
        let entries = manifest(app, phone, None).await["entries"]
            .as_array()
            .unwrap()
            .clone();
        if entries.len() >= expected {
            assert_eq!(entries.len(), expected, "{entries:?}");
            return entries;
        }
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }
    panic!("the manifest never brought {expected} entries");
}

async fn live(app: &TestApp, token: &str, event: &str) -> Value {
    let reply = app
        .get(&format!("/api/events/{event}/door/live"), token)
        .await;
    assert_eq!(
        reply.status,
        StatusCode::OK,
        "{}",
        String::from_utf8_lossy(&reply.bytes)
    );
    reply.json()
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn days_are_checked_kept_and_moved(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("encontro@exemplo.com").await;
    let event = weekend(&app, &token).await;

    // Overlapping days and a single day are refused.
    let base = json!({ "name": "Encontro", "venue": "Salão", "startsAt": SATURDAY.0, "endsAt": SATURDAY.1 });
    let mut overlapping = base.clone();
    overlapping["days"] = days(&[
        SATURDAY,
        ("2026-11-22T00:00:00-03:00", "2026-11-22T10:00:00-03:00"),
    ]);
    let reply = app
        .put(&format!("/api/events/{event}"), &token, overlapping)
        .await;
    assert_eq!(reply.status, StatusCode::BAD_REQUEST);
    assert_eq!(reply.error_code(), "invalid_days");
    let mut single = base.clone();
    single["days"] = days(&[SATURDAY]);
    assert_eq!(
        app.put(&format!("/api/events/{event}"), &token, single)
            .await
            .error_code(),
        "invalid_days"
    );

    // An edit without days keeps them, and the event still runs to the last day.
    let kept = app
        .put(&format!("/api/events/{event}"), &token, base.clone())
        .await
        .json();
    assert_eq!(kept["days"].as_array().unwrap().len(), 2);
    assert_eq!(kept["endsAt"], "2026-11-22T20:00:00-03:00");

    // A category may be valid only on Sunday; a day the event does not have is refused.
    let refused = app
        .post(
            &format!("/api/events/{event}/categories"),
            &token,
            json!({ "name": "Domingo", "color": "#2563eb", "priceCents": 4000, "dayRule": "days", "validDays": [3] }),
        )
        .await;
    assert_eq!(refused.error_code(), "invalid_day_rule");
    let sunday = category(
        &app,
        &token,
        &event,
        json!({ "name": "Domingo", "color": "#2563eb", "priceCents": 4000, "dayRule": "days", "validDays": [2],
                "doorInstruction": "  Pulseira azul  " }),
        1,
        5,
    )
    .await;
    let categories = app
        .get(&format!("/api/events/{event}/categories"), &token)
        .await
        .json();
    assert_eq!(categories[0]["dayRule"], "days");
    assert_eq!(categories[0]["validDays"], json!([2]));
    assert_eq!(categories[0]["doorInstruction"], "Pulseira azul");
    // An update from a panel that does not know the days keeps the rule.
    app.put(
        &format!("/api/categories/{sunday}"),
        &token,
        json!({ "name": "Domingo", "color": "#2563eb", "priceCents": 4000 }),
    )
    .await;
    let categories = app
        .get(&format!("/api/events/{event}/categories"), &token)
        .await
        .json();
    assert_eq!(categories[0]["dayRule"], "days");
    assert_eq!(categories[0]["doorInstruction"], Value::Null);

    // A duplicate keeps the days and the rules.
    let copy = app
        .post(&format!("/api/events/{event}/duplicate"), &token, json!({}))
        .await
        .json();
    assert_eq!(copy["days"], kept["days"]);
    let copied = app
        .get(
            &format!("/api/events/{}/categories", copy["id"].as_str().unwrap()),
            &token,
        )
        .await
        .json();
    assert_eq!(copied[0]["validDays"], json!([2]));

    // Postponing moves every day by the same time.
    let moved = app
        .post(
            &format!("/api/events/{event}/postpone"),
            &token,
            json!({ "startsAt": "2026-11-28T18:00:00-03:00", "endsAt": "2026-11-28T23:00:00-03:00" }),
        )
        .await;
    assert_eq!(
        moved.status,
        StatusCode::OK,
        "{}",
        String::from_utf8_lossy(&moved.bytes)
    );
    let moved = moved.json();
    assert_eq!(moved["days"][1]["startsAt"], "2026-11-29T12:00:00-03:00");
    assert_eq!(moved["endsAt"], "2026-11-29T20:00:00-03:00");

    // Once the door read tickets on Sunday, Sunday cannot go away; clearing the days of a fresh
    // copy turns it into an event of one day and its rules into "every day".
    let (_, access) = create_link(&app, &token, &event).await;
    let phone = register(&app, &access, "Portão").await;
    upload(
        &app,
        &phone,
        vec![day_scan(
            "00000000-0000-4000-8000-00000000d001",
            1,
            "admitted",
            0,
            2,
            Some(2),
        )],
        false,
    )
    .await;
    let mut cleared = base.clone();
    cleared["days"] = json!([]);
    let reply = app
        .put(&format!("/api/events/{event}"), &token, cleared.clone())
        .await;
    assert_eq!(reply.status, StatusCode::CONFLICT);
    assert_eq!(reply.error_code(), "day_has_entries");
    let copy_id = copy["id"].as_str().unwrap();
    let single = app
        .put(&format!("/api/events/{copy_id}"), &token, cleared)
        .await
        .json();
    assert_eq!(single["days"], json!([]));
    let copied = app
        .get(&format!("/api/events/{copy_id}/categories"), &token)
        .await
        .json();
    assert_eq!(copied[0]["dayRule"], "every");
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn passes_enter_once_a_day(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("encontro@exemplo.com").await;
    let event = weekend(&app, &token).await;
    category(
        &app,
        &token,
        &event,
        json!({ "name": "2 dias", "color": "#ea580c", "priceCents": 12000,
        "doorInstruction": "Pulseira laranja" }),
        1,
        10,
    )
    .await;
    category(
        &app,
        &token,
        &event,
        json!({ "name": "1 dia", "color": "#0891b2", "priceCents": 7000,
        "dayRule": "any_one" }),
        11,
        20,
    )
    .await;
    let (_, access) = create_link(&app, &token, &event).await;
    let gate = register(&app, &access, "Portão").await;
    let other = register(&app, &access, "Lateral").await;

    // The phones get the days and the rules.
    let page = manifest(&app, &gate, None).await;
    assert_eq!(page["event"]["days"].as_array().unwrap().len(), 2);
    assert_eq!(page["categories"][0]["doorInstruction"], "Pulseira laranja");
    assert_eq!(page["categories"][1]["dayRule"], "any_one");
    assert!(page["checkpoint"].is_null());

    // The pass enters on Saturday; a copy on Saturday is caught; it enters again on Sunday.
    let first = upload(
        &app,
        &gate,
        vec![day_scan(
            "00000000-0000-4000-8000-00000000e001",
            5,
            "admitted",
            0,
            1,
            Some(1),
        )],
        true,
    )
    .await;
    assert_eq!(first["results"][0]["class"], "first_entry");
    let copy = upload(
        &app,
        &other,
        vec![day_scan(
            "00000000-0000-4000-8000-00000000e002",
            5,
            "admitted",
            5,
            1,
            Some(1),
        )],
        true,
    )
    .await;
    assert_eq!(copy["results"][0]["class"], "duplicate_entry");
    assert_eq!(copy["results"][0]["firstEntry"]["deviceName"], "Portão");
    let sunday = upload(
        &app,
        &other,
        vec![day_scan(
            "00000000-0000-4000-8000-00000000e003",
            5,
            "admitted",
            20 * 60,
            2,
            Some(2),
        )],
        true,
    )
    .await;
    assert_eq!(sunday["results"][0]["class"], "first_entry");

    // "One day of their choice" enters once in the whole event.
    let once = upload(
        &app,
        &gate,
        vec![day_scan(
            "00000000-0000-4000-8000-00000000e004",
            15,
            "admitted",
            10,
            1,
            None,
        )],
        true,
    )
    .await;
    assert_eq!(once["results"][0]["class"], "first_entry");
    let again = upload(
        &app,
        &gate,
        vec![day_scan(
            "00000000-0000-4000-8000-00000000e005",
            15,
            "admitted",
            20 * 60 + 5,
            2,
            None,
        )],
        true,
    )
    .await;
    assert_eq!(again["results"][0]["class"], "duplicate_entry");

    // Wrong day turned away, and one let in anyway.
    upload(
        &app,
        &gate,
        vec![day_scan(
            "00000000-0000-4000-8000-00000000e006",
            16,
            "rejected_wrong_day",
            15,
            1,
            None,
        )],
        false,
    )
    .await;
    let mut anyway = day_scan(
        "00000000-0000-4000-8000-00000000e007",
        16,
        "admitted",
        16,
        1,
        Some(1),
    );
    anyway["exception"] = json!(true);
    anyway["exceptionKind"] = json!("wrong_day");
    upload(&app, &gate, vec![anyway], false).await;
    // A ledger day that is not the scan's day is malformed.
    let reply = app
        .post(
            "/api/door/scans",
            &gate.secret,
            json!({ "scans": [day_scan("00000000-0000-4000-8000-00000000e008", 3, "admitted", 1, 1, Some(2))] }),
        )
        .await;
    assert_eq!(reply.status, StatusCode::BAD_REQUEST);

    // The manifest says the day and book of every entry.
    let entries = entries_of(&app, &gate, 6).await;
    let sunday_entry = entries
        .iter()
        .find(|entry| entry["scanId"] == "00000000-0000-4000-8000-00000000e003")
        .unwrap();
    assert_eq!(sunday_entry["day"], 2);
    assert_eq!(sunday_entry["ledgerDay"], 2);
    let choice = entries
        .iter()
        .find(|entry| entry["scanId"] == "00000000-0000-4000-8000-00000000e004")
        .unwrap();
    assert_eq!(choice["day"], 1);
    assert!(choice["ledgerDay"].is_null());

    // Three tickets entered the event; Saturday had three first entries, Sunday one.
    let overview = app
        .get(&format!("/api/events/{event}/door"), &token)
        .await
        .json();
    assert_eq!(overview["entryCount"], 3);
    let now = live(&app, &token, &event).await;
    assert_eq!(now["entries"], 3);
    assert_eq!(now["days"][0]["entries"], 3);
    assert_eq!(now["days"][1]["entries"], 1);
    assert_eq!(now["refusals"]["wrongDay"], 1);
    assert_eq!(now["refusals"]["wrongDayAdmitted"], 1);
    assert_eq!(now["refusals"]["wrongDoorAdmitted"], 0);
    assert!(now["today"].is_number());
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn checkpoints_keep_their_own_book(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("encontro@exemplo.com").await;
    let event = weekend(&app, &token).await;
    let dinner_category = category(
        &app,
        &token,
        &event,
        json!({ "name": "Com janta", "color": "#ea580c", "priceCents": 12000 }),
        1,
        10,
    )
    .await;
    category(
        &app,
        &token,
        &event,
        json!({ "name": "Sem janta", "color": "#2563eb", "priceCents": 8000 }),
        11,
        20,
    )
    .await;

    // A dinner, once a day, for the "com janta" tickets.
    let created = app
        .post(
            &format!("/api/events/{event}/checkpoints"),
            &token,
            json!({ "name": " Janta ", "instruction": "Entregar o prato", "perDay": true, "categoryIds": [dinner_category] }),
        )
        .await;
    assert_eq!(
        created.status,
        StatusCode::CREATED,
        "{}",
        String::from_utf8_lossy(&created.bytes)
    );
    let dinner = created.json();
    assert_eq!(dinner["name"], "Janta");
    assert_eq!(dinner["uses"], 0);
    let dinner_id = dinner["id"].as_str().unwrap().to_owned();
    // The checklist asks for a link at the dinner.
    let checklist = app
        .get(&format!("/api/events/{event}/checklist"), &token)
        .await
        .json();
    let item = checklist["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|item| item["key"] == "checkpoint_links")
        .unwrap()
        .clone();
    assert_eq!(item["state"], "missing");

    let link = app
        .post(
            &format!("/api/events/{event}/door/accesses"),
            &token,
            json!({ "label": "Balcão da janta", "checkpointId": dinner_id }),
        )
        .await
        .json();
    assert_eq!(link["access"]["checkpointId"], dinner_id);
    let counter = register(&app, link["token"].as_str().unwrap(), "Balcão 1").await;
    let (_, access) = create_link(&app, &token, &event).await;
    let gate = register(&app, &access, "Portão").await;
    let checklist = app
        .get(&format!("/api/events/{event}/checklist"), &token)
        .await
        .json();
    let item = checklist["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|item| item["key"] == "checkpoint_links")
        .unwrap()
        .clone();
    assert_eq!(item["state"], "done");

    let page = manifest(&app, &counter, None).await;
    assert_eq!(page["checkpoint"]["name"], "Janta");
    assert_eq!(page["checkpoint"]["instruction"], "Entregar o prato");
    assert_eq!(page["checkpoint"]["categoryIds"], json!([dinner_category]));
    // Checkpoint phones are no doors for the entrance.
    assert_eq!(manifest(&app, &gate, None).await["doors"], json!([]));

    // Dinner on Saturday, once; a second plate is caught; Sunday again.
    let used = upload(
        &app,
        &counter,
        vec![day_scan(
            "00000000-0000-4000-8000-00000000f001",
            3,
            "benefit_granted",
            0,
            1,
            Some(1),
        )],
        true,
    )
    .await;
    assert_eq!(used["results"][0]["class"], "first_entry");
    let second = upload(
        &app,
        &counter,
        vec![day_scan(
            "00000000-0000-4000-8000-00000000f002",
            3,
            "benefit_granted",
            30,
            1,
            Some(1),
        )],
        true,
    )
    .await;
    assert_eq!(second["results"][0]["class"], "duplicate_entry");
    assert_eq!(second["results"][0]["firstEntry"]["deviceName"], "Balcão 1");
    upload(
        &app,
        &counter,
        vec![day_scan(
            "00000000-0000-4000-8000-00000000f003",
            3,
            "benefit_granted",
            20 * 60,
            2,
            Some(2),
        )],
        false,
    )
    .await;
    // A phone of an app before checkpoints speaks of entries: they are uses here.
    let legacy = upload(
        &app,
        &counter,
        vec![day_scan(
            "00000000-0000-4000-8000-00000000f004",
            4,
            "admitted",
            31,
            1,
            Some(1),
        )],
        false,
    )
    .await;
    assert_eq!(legacy["results"][0]["class"], "first_entry");
    upload(
        &app,
        &counter,
        vec![day_scan(
            "00000000-0000-4000-8000-00000000f005",
            12,
            "rejected_not_entitled",
            32,
            1,
            Some(1),
        )],
        false,
    )
    .await;

    // Uses are not entries: the entrance still lets ticket 3 in, and never hears of the dinner.
    let entry = upload(
        &app,
        &gate,
        vec![day_scan(
            "00000000-0000-4000-8000-00000000f006",
            3,
            "admitted",
            40,
            1,
            Some(1),
        )],
        true,
    )
    .await;
    assert_eq!(entry["results"][0]["class"], "first_entry");
    entries_of(&app, &gate, 1).await;
    // Every use read at the dinner, the second plate included (like the entrance's copies).
    entries_of(&app, &counter, 4).await;

    // The entrance cannot record a dinner, nor the dinner an exit.
    let reply = app
        .post("/api/door/scans", &gate.secret, json!({ "scans": [day_scan("00000000-0000-4000-8000-00000000f007", 5, "benefit_granted", 41, 1, Some(1))] }))
        .await;
    assert_eq!(reply.status, StatusCode::BAD_REQUEST);
    let reply = app
        .post("/api/door/scans", &counter.secret, json!({ "scans": [day_scan("00000000-0000-4000-8000-00000000f008", 5, "exited", 41, 1, Some(1))] }))
        .await;
    assert_eq!(reply.status, StatusCode::BAD_REQUEST);

    let overview = app
        .get(&format!("/api/events/{event}/door"), &token)
        .await
        .json();
    assert_eq!(overview["entryCount"], 1);
    assert_eq!(overview["checkpoints"][0]["uses"], 3);
    assert_eq!(overview["checkpoints"][0]["links"], 1);
    let now = live(&app, &token, &event).await;
    let block = &now["checkpoints"][0];
    assert_eq!(block["entitled"], 10);
    assert_eq!(block["used"], 3);
    assert_eq!(block["repeats"], 1);
    assert_eq!(block["notEntitled"], 1);
    assert_eq!(now["entries"], 1);
    assert_eq!(now["doors"].as_array().unwrap().len(), 1);

    // Deleting the checkpoint cuts its phones.
    assert_eq!(
        app.delete(&format!("/api/checkpoints/{dinner_id}"), &token, None)
            .await
            .status,
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        app.get("/api/door/manifest", &counter.secret).await.status,
        StatusCode::UNAUTHORIZED
    );
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn tokens_have_no_days_nor_checkpoints(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("barraca@exemplo.com").await;
    let reply = app
        .post(
            "/api/events",
            &token,
            json!({ "name": "Arraiá", "startsAt": SATURDAY.0, "endsAt": SATURDAY.1, "kind": "tokens",
                    "days": days(&[SATURDAY, SUNDAY]) }),
        )
        .await;
    assert_eq!(reply.error_code(), "days_tokens");
    let reply = app
        .post(
            "/api/events",
            &token,
            json!({ "name": "Arraiá", "startsAt": SATURDAY.0, "endsAt": SATURDAY.1, "kind": "tokens" }),
        )
        .await;
    let event = reply.json()["id"].as_str().unwrap().to_owned();
    let reply = app
        .post(
            &format!("/api/events/{event}/checkpoints"),
            &token,
            json!({ "name": "Janta", "perDay": true, "categoryIds": [] }),
        )
        .await;
    assert_eq!(reply.error_code(), "checkpoints_tokens");
}
