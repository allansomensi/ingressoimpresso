//! Door features (ADRs 0067–0071): rehearsal, door by category, box office, guest list and the
//! live view, plus phones on the previous app version.

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
use common::door::{AT, Phone, create_link, manifest, register, scan, upload};
use common::{ADMIN, TestApp};
use serde_json::{Value, json};
use sqlx::PgPool;

/// An event with 20 paid tickets; returns its id.
async fn paid_event(app: &TestApp, token: &str) -> String {
    let admin = app.login(ADMIN).await;
    let event = app.create_event(token, "Show").await;
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
    price: Value,
    range: (i32, i32),
) -> String {
    let reply = app
        .post(
            &format!("/api/events/{event}/categories"),
            token,
            json!({ "name": name, "color": "#e11d48", "priceCents": price }),
        )
        .await;
    assert_eq!(reply.status, StatusCode::CREATED);
    let id = reply.json()["id"].as_str().unwrap().to_owned();
    let reply = app
        .post(
            &format!("/api/categories/{id}/ranges"),
            token,
            json!({ "first": range.0, "last": range.1 }),
        )
        .await;
    assert_eq!(reply.status, StatusCode::CREATED);
    id
}

async fn link_with(
    app: &TestApp,
    token: &str,
    event: &str,
    label: &str,
    categories: Value,
) -> (String, String) {
    let reply = app
        .post(
            &format!("/api/events/{event}/door/accesses"),
            token,
            json!({ "label": label, "categoryIds": categories }),
        )
        .await;
    assert_eq!(
        reply.status,
        StatusCode::CREATED,
        "{}",
        String::from_utf8_lossy(&reply.bytes)
    );
    let body = reply.json();
    (
        body["access"]["id"].as_str().unwrap().to_owned(),
        body["token"].as_str().unwrap().to_owned(),
    )
}

fn wrong_door(id: &str, number: u32) -> Value {
    json!({
        "id": id,
        "number": number,
        "keyId": 1,
        "outcome": "rejected_wrong_door",
        "scannedAtMs": AT,
    })
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
async fn doors_take_only_their_categories(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("banda@exemplo.com").await;
    let event = paid_event(&app, &token).await;
    let vip = category(&app, &token, &event, "VIP", json!(5000), (1, 5)).await;
    let pista = category(&app, &token, &event, "Pista", Value::Null, (6, 10)).await;

    // A category of another event is refused.
    let other = app.create_event(&token, "Outro").await;
    let foreign = category(&app, &token, &other, "Camarote", Value::Null, (1, 1)).await;
    let reply = app
        .post(
            &format!("/api/events/{event}/door/accesses"),
            &token,
            json!({ "label": "Porta VIP", "categoryIds": [foreign] }),
        )
        .await;
    assert_eq!(reply.error_code(), "invalid_door_categories");

    let (vip_door, vip_token) = link_with(&app, &token, &event, "Porta VIP", json!([vip])).await;
    let (_, main_token) = link_with(&app, &token, &event, "Portão principal", json!([pista])).await;
    // An old panel sends no categories: every ticket.
    let (_, all_token) = create_link(&app, &token, &event).await;
    let phone = register(&app, &vip_token, "VIP 1").await;
    register(&app, &main_token, "Principal 1").await;
    register(&app, &all_token, "Geral").await;

    let overview = app
        .get(&format!("/api/events/{event}/door"), &token)
        .await
        .json();
    let accesses = overview["accesses"].as_array().unwrap();
    let vip_access = accesses
        .iter()
        .find(|access| access["id"] == vip_door.as_str())
        .unwrap();
    assert_eq!(vip_access["categoryIds"], json!([vip]));
    assert!(
        accesses
            .iter()
            .any(|access| access["categoryIds"] == json!([]))
    );

    let start = manifest(&app, &phone, None).await;
    assert_eq!(start["allowedCategoryIds"], json!([vip]));
    let doors: Vec<(String, Value)> = start["doors"]
        .as_array()
        .unwrap()
        .iter()
        .map(|door| {
            (
                door["label"].as_str().unwrap().to_owned(),
                door["categoryIds"].clone(),
            )
        })
        .collect();
    assert_eq!(
        doors,
        [
            ("Equipe da porta".to_owned(), json!([])),
            ("Portão principal".to_owned(), json!([pista])),
        ]
    );
    let categories = start["categories"].as_array().unwrap();
    assert_eq!(categories[0]["id"], vip.as_str());
    assert_eq!(categories[0]["priceCents"], 5000);
    assert!(categories[1]["priceCents"].is_null());

    // A pista ticket at the VIP door: refused without an entry, then let in anyway.
    let result = upload(
        &app,
        &phone,
        vec![wrong_door("00000000-0000-4000-8000-00000000f001", 7)],
        false,
    )
    .await;
    assert!(result["results"][0]["class"].is_null());
    let mut exception = scan(
        "00000000-0000-4000-8000-00000000f002",
        Some(7),
        "admitted",
        1,
    );
    exception["exception"] = json!(true);
    let result = upload(&app, &phone, vec![exception], false).await;
    assert_eq!(result["results"][0]["class"], "first_entry");

    // Malformed: an exception that did not admit, a wrong door without a number.
    let mut bad = scan(
        "00000000-0000-4000-8000-00000000f003",
        Some(8),
        "rejected_used",
        2,
    );
    bad["exception"] = json!(true);
    for body in [
        json!({ "scans": [bad] }),
        json!({ "scans": [{ "id": "00000000-0000-4000-8000-00000000f004", "number": null, "keyId": null,
                            "outcome": "rejected_wrong_door", "scannedAtMs": AT }] }),
    ] {
        let reply = app.post("/api/door/scans", &phone.secret, body).await;
        assert_eq!(reply.error_code(), "invalid_scans");
    }

    let now = live(&app, &token, &event).await;
    assert_eq!(now["refusals"]["wrongDoor"], 1);
    assert_eq!(now["refusals"]["wrongDoorAdmitted"], 1);
    assert_eq!(now["entries"], 1);
    let vip_live = now["doors"]
        .as_array()
        .unwrap()
        .iter()
        .find(|door| door["label"] == "Porta VIP")
        .unwrap()
        .clone();
    assert_eq!(vip_live["categories"], json!(["VIP"]));
    assert_eq!(vip_live["entries"], 1);

    // Changing the door's categories reaches the phone on its next sync; deleting the
    // category leaves the door open to every ticket.
    let reply = app
        .put(
            &format!("/api/door-accesses/{vip_door}/categories"),
            &token,
            json!({ "categoryIds": [vip, pista] }),
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK);
    assert_eq!(
        manifest(&app, &phone, None).await["allowedCategoryIds"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
    app.delete(&format!("/api/categories/{vip}"), &token, None)
        .await;
    app.delete(&format!("/api/categories/{pista}"), &token, None)
        .await;
    assert_eq!(
        manifest(&app, &phone, None).await["allowedCategoryIds"],
        json!([])
    );

    // Another organization cannot touch the door.
    let stranger = app.login("outra@exemplo.com").await;
    let hidden = app
        .put(
            &format!("/api/door-accesses/{vip_door}/categories"),
            &stranger,
            json!({ "categoryIds": [] }),
        )
        .await;
    assert_eq!(hidden.status, StatusCode::NOT_FOUND);
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn rehearsal_is_reported_and_never_scanned(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("banda@exemplo.com").await;
    let event = paid_event(&app, &token).await;
    let (_, access) = create_link(&app, &token, &event).await;
    let phone = register(&app, &access, "Porta 1").await;

    let before = app
        .get(&format!("/api/events/{event}/door"), &token)
        .await
        .json();
    assert!(before["devices"][0]["rehearsedAt"].is_null());
    let reply = app
        .request(
            Method::POST,
            "/api/door/rehearsal",
            Some(&phone.secret),
            Some(json!({})),
        )
        .await;
    assert_eq!(reply.status, StatusCode::NO_CONTENT);
    let after = app
        .get(&format!("/api/events/{event}/door"), &token)
        .await
        .json();
    assert!(after["devices"][0]["rehearsedAt"].is_string());
    assert_eq!(after["devices"][0]["scanCount"], 0);
    assert!(live(&app, &token, &event).await["devices"][0]["rehearsedAt"].is_string());

    // Only a registered phone reports a rehearsal.
    let reply = app
        .request(
            Method::POST,
            "/api/door/rehearsal",
            Some(&token),
            Some(json!({})),
        )
        .await;
    assert_eq!(reply.status, StatusCode::UNAUTHORIZED);

    // The sheet: sample tickets of the event's design, as a PDF.
    let sheet = app
        .get(&format!("/api/events/{event}/door/rehearsal-sheet"), &token)
        .await;
    assert_eq!(sheet.status, StatusCode::OK);
    assert_eq!(sheet.headers["content-type"], "application/pdf");
    assert!(sheet.bytes.starts_with(b"%PDF"));
    let stranger = app.login("outra@exemplo.com").await;
    let hidden = app
        .get(
            &format!("/api/events/{event}/door/rehearsal-sheet"),
            &stranger,
        )
        .await;
    assert_eq!(hidden.status, StatusCode::NOT_FOUND);
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn box_office_sells_what_enters(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("banda@exemplo.com").await;
    let event = paid_event(&app, &token).await;
    category(&app, &token, &event, "Cortesia", json!(0), (11, 12)).await;
    let created = app
        .post(
            &format!("/api/events/{event}/sellers"),
            &token,
            json!({ "name": "Bilheteria", "boxOffice": true }),
        )
        .await
        .json();
    assert_eq!(created["boxOffice"], true);
    let seller = created["id"].as_str().unwrap().to_owned();
    app.post(
        &format!("/api/sellers/{seller}/ranges"),
        &token,
        json!({ "first": 10, "last": 15 }),
    )
    .await;
    // Editing without the field keeps the choice.
    let reply = app
        .put(
            &format!("/api/sellers/{seller}"),
            &token,
            json!({ "name": "Bilheteria", "phone": null }),
        )
        .await;
    assert_eq!(reply.status, StatusCode::NO_CONTENT);
    let sellers = app
        .get(&format!("/api/events/{event}/sellers"), &token)
        .await
        .json();
    assert_eq!(sellers[0]["boxOffice"], true);

    // Who only delivers tickets edits the seller, but the box office is the money part's call.
    app.post(
        &format!("/api/events/{event}/team"),
        &token,
        json!({ "email": "entrega@exemplo.com", "name": null, "areas": ["delivery"] }),
    )
    .await;
    let delivery = app.login("entrega@exemplo.com").await;
    let renamed = app
        .put(
            &format!("/api/sellers/{seller}"),
            &delivery,
            json!({ "name": "Bilheteria", "phone": "11 90000-0000", "boxOffice": true }),
        )
        .await;
    assert_eq!(renamed.status, StatusCode::NO_CONTENT);
    let refused = app
        .put(
            &format!("/api/sellers/{seller}"),
            &delivery,
            json!({ "name": "Bilheteria", "phone": null, "boxOffice": false }),
        )
        .await;
    assert_eq!(refused.error_code(), "not_your_area");
    let refused = app
        .post(
            &format!("/api/events/{event}/sellers"),
            &delivery,
            json!({ "name": "Porta 2", "boxOffice": true }),
        )
        .await;
    assert_eq!(refused.error_code(), "not_your_area");

    let (_, access) = create_link(&app, &token, &event).await;
    let phone = register(&app, &access, "Caixa").await;
    let start = manifest(&app, &phone, None).await;
    assert_eq!(
        start["sellers"],
        json!([{ "seller": "Bilheteria", "first": 10, "last": 15, "boxOffice": true }])
    );
    assert_eq!(start["event"]["ticketPriceCents"], 3000);

    // Three enter: 10 (R$ 30), 11 (courtesy) and 10 again (a copy, sold once).
    upload(
        &app,
        &phone,
        vec![
            scan(
                "00000000-0000-4000-8000-00000000b010",
                Some(10),
                "admitted",
                0,
            ),
            scan(
                "00000000-0000-4000-8000-00000000b011",
                Some(11),
                "admitted",
                1,
            ),
            scan(
                "00000000-0000-4000-8000-00000000b012",
                Some(10),
                "admitted",
                2,
            ),
        ],
        false,
    )
    .await;
    let report = app
        .get(&format!("/api/events/{event}/report"), &token)
        .await
        .json();
    let row = &report["sellers"][0];
    assert_eq!(row["boxOffice"], true);
    assert_eq!(row["tickets"], 6);
    assert_eq!(row["declaredSold"], 2);
    assert_eq!(row["amountDueCents"], 3000);
    assert_eq!(row["balanceCents"], 3000);

    let now = live(&app, &token, &event).await;
    assert_eq!(
        now["boxOffice"],
        json!({ "enabled": true, "sold": 2, "amountCents": 3000, "courtesies": 1 })
    );

    // The seller's page counts the same.
    let link = app
        .post(&format!("/api/sellers/{seller}/link"), &token, json!({}))
        .await
        .json();
    let secret = link["url"]
        .as_str()
        .unwrap()
        .split_once('#')
        .unwrap()
        .1
        .to_owned();
    let view = app
        .request(
            Method::POST,
            "/api/seller",
            None,
            Some(json!({ "token": secret })),
        )
        .await
        .json();
    assert_eq!(view["boxOffice"], true);
    assert_eq!(view["summary"]["dueTickets"], 2);
    assert_eq!(view["summary"]["amountDueCents"], 3000);

    // Turned off, the seller answers for every number again.
    app.put(
        &format!("/api/sellers/{seller}"),
        &token,
        json!({ "name": "Bilheteria", "phone": null, "boxOffice": false }),
    )
    .await;
    let report = app
        .get(&format!("/api/events/{event}/report"), &token)
        .await
        .json();
    assert_eq!(report["sellers"][0]["declaredSold"], 6);
}

async fn guest(app: &TestApp, token: &str, event: &str, body: Value) -> Value {
    let reply = app
        .post(&format!("/api/events/{event}/guests"), token, body)
        .await;
    assert_eq!(
        reply.status,
        StatusCode::CREATED,
        "{}",
        String::from_utf8_lossy(&reply.bytes)
    );
    reply.json()
}

async fn arrivals(app: &TestApp, phone: &Phone, items: Value) -> Value {
    let reply = app
        .post(
            "/api/door/guests",
            &phone.secret,
            json!({ "arrivals": items }),
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

/// Follows the cursor until `expected` arrivals came (other tests share transaction ids).
async fn sync_arrivals(
    app: &TestApp,
    phone: &Phone,
    cursor: &str,
    expected: usize,
) -> (Vec<Value>, String) {
    let mut cursor = cursor.to_owned();
    let mut seen = Vec::new();
    for _ in 0..100 {
        let page = manifest(app, phone, Some(&format!("{cursor}&guests="))).await;
        seen.extend(page["guestArrivals"].as_array().unwrap().iter().cloned());
        cursor = page["cursor"].as_str().unwrap().to_owned();
        if seen.len() >= expected {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }
    assert_eq!(seen.len(), expected, "{seen:?}");
    (seen, cursor)
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn guest_list_converges_across_phones(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("banda@exemplo.com").await;
    let event = paid_event(&app, &token).await;

    // Validation.
    for (body, code) in [
        (json!({ "name": " " }), "invalid_guest_name"),
        (
            json!({ "name": "Ana", "companions": 21 }),
            "invalid_companions",
        ),
        (
            json!({ "name": "Ana", "note": "x".repeat(121) }),
            "invalid_note",
        ),
        (json!({ "name": "Ana\nBia" }), "invalid_guest_name"),
    ] {
        let reply = app
            .post(&format!("/api/events/{event}/guests"), &token, body)
            .await;
        assert_eq!(reply.error_code(), code);
    }
    let maria = guest(
        &app,
        &token,
        &event,
        json!({ "name": "Maria Souza", "companions": 2, "note": "camarim" }),
    )
    .await;
    let maria_id = maria["id"].as_str().unwrap().to_owned();
    let bulk = app
        .post(
            &format!("/api/events/{event}/guests/bulk"),
            &token,
            json!({ "guests": [{ "name": "João Lima" }, { "name": "Banda", "companions": 4 }] }),
        )
        .await;
    assert_eq!(bulk.status, StatusCode::CREATED);
    let joao_id = bulk.json()[1]["id"].as_str().unwrap().to_owned();
    assert_eq!(bulk.json()[1]["name"], "João Lima");

    let (_, access) = create_link(&app, &token, &event).await;
    let door_a = register(&app, &access, "Porta A").await;
    let door_b = register(&app, &access, "Porta B").await;

    // The list comes when the phone asks with another version; an old app never gets it.
    let old = manifest(&app, &door_a, None).await;
    assert!(old["guests"].is_null());
    let first = manifest(&app, &door_a, Some("0&guests=")).await;
    let guests = first["guests"].as_array().unwrap();
    assert_eq!(guests.len(), 3);
    assert_eq!(guests[2]["name"], "Maria Souza");
    assert_eq!(guests[2]["note"], "camarim");
    let version = first["guestsVersion"].as_str().unwrap().to_owned();
    let cursor = first["cursor"].as_str().unwrap().to_owned();
    let same = manifest(&app, &door_a, Some(&format!("{cursor}&guests={version}"))).await;
    assert!(same["guests"].is_null());

    // A arrives with 2 of Maria's 3; B (offline) records the whole party later.
    let a1 = "00000000-0000-4000-8000-0000000000a1";
    let result = arrivals(
        &app,
        &door_a,
        json!([{ "id": a1, "guestId": maria_id, "people": 2, "arrivedAtMs": AT, "undoneAtMs": null }]),
    )
    .await;
    assert_eq!(result["results"], json!([{ "id": a1, "kept": true }]));
    // A retry is answered the same.
    arrivals(&app, &door_a, json!([{ "id": a1, "guestId": maria_id, "people": 2, "arrivedAtMs": AT, "undoneAtMs": null }])).await;
    let b1 = "00000000-0000-4000-8000-0000000000b1";
    arrivals(
        &app,
        &door_b,
        json!([{ "id": b1, "guestId": maria_id, "people": 3, "arrivedAtMs": AT + 60_000, "undoneAtMs": null }]),
    )
    .await;
    let (seen, cursor) = sync_arrivals(&app, &door_a, &cursor, 2).await;
    assert!(
        seen.iter()
            .any(|arrival| arrival["id"] == a1 && arrival["deviceName"] == "Porta A")
    );
    assert!(
        seen.iter()
            .any(|arrival| arrival["id"] == b1 && arrival["people"] == 3)
    );

    // The panel: the first arrival, people capped at the party.
    let list = app
        .get(&format!("/api/events/{event}/guests"), &token)
        .await
        .json();
    let maria_row = list
        .as_array()
        .unwrap()
        .iter()
        .find(|row| row["id"] == maria_id.as_str())
        .unwrap()
        .clone();
    assert_eq!(maria_row["arrival"]["deviceName"], "Porta A");
    assert_eq!(maria_row["arrival"]["people"], 3);

    // A undoes its own arrival by mistake: every phone hears it again, marked undone.
    let undo = arrivals(
        &app,
        &door_a,
        json!([{ "id": a1, "guestId": maria_id, "people": 2, "arrivedAtMs": AT, "undoneAtMs": AT + 30_000 }]),
    )
    .await;
    assert_eq!(undo["results"][0]["kept"], true);
    let (seen, _) = sync_arrivals(&app, &door_b, &cursor, 1).await;
    assert_eq!(seen[0]["id"], a1);
    assert_eq!(seen[0]["undone"], true);
    let list = app
        .get(&format!("/api/events/{event}/guests"), &token)
        .await
        .json();
    let maria_row = list
        .as_array()
        .unwrap()
        .iter()
        .find(|row| row["id"] == maria_id.as_str())
        .unwrap()
        .clone();
    assert_eq!(maria_row["arrival"]["deviceName"], "Porta B");

    // Only the phone that recorded it may undo it, within the window.
    let reply = app
        .post(
            "/api/door/guests",
            &door_b.secret,
            json!({ "arrivals": [{ "id": a1, "guestId": maria_id, "people": 2, "arrivedAtMs": AT, "undoneAtMs": AT + 1 }] }),
        )
        .await;
    assert_eq!(reply.error_code(), "arrival_conflict");
    let reply = app
        .post(
            "/api/door/guests",
            &door_b.secret,
            json!({ "arrivals": [{ "id": "00000000-0000-4000-8000-0000000000b2", "guestId": joao_id, "people": 1,
                                  "arrivedAtMs": AT, "undoneAtMs": AT + 600_000 }] }),
        )
        .await;
    assert_eq!(reply.error_code(), "invalid_arrivals");

    // A guest removed meanwhile: the phone's arrival is dropped, not retried forever.
    let reply = app
        .delete(&format!("/api/guests/{joao_id}"), &token, None)
        .await;
    assert_eq!(reply.status, StatusCode::NO_CONTENT);
    let dropped = arrivals(
        &app,
        &door_b,
        json!([{ "id": "00000000-0000-4000-8000-0000000000b3", "guestId": joao_id, "people": 1, "arrivedAtMs": AT, "undoneAtMs": null }]),
    )
    .await;
    assert_eq!(dropped["results"][0]["kept"], false);

    // Editing changes the version the phones hold.
    let reply = app
        .put(
            &format!("/api/guests/{maria_id}"),
            &token,
            json!({ "name": "Maria S.", "companions": 1 }),
        )
        .await;
    assert_eq!(reply.json()["companions"], 1);
    let changed = manifest(&app, &door_a, Some(&format!("0&guests={version}"))).await;
    assert_eq!(changed["guests"].as_array().unwrap().len(), 2);

    // So does renaming the category a guest is in: the phones show its name and colour.
    let vip = app
        .post(
            &format!("/api/events/{event}/categories"),
            &token,
            json!({ "name": "VIP", "color": "#7c3aed", "priceCents": null }),
        )
        .await
        .json();
    let vip_id = vip["id"].as_str().unwrap().to_owned();
    app.put(
        &format!("/api/guests/{maria_id}"),
        &token,
        json!({ "name": "Maria S.", "companions": 1, "categoryId": vip_id }),
    )
    .await;
    let before = manifest(&app, &door_a, Some("0&guests=")).await["guestsVersion"]
        .as_str()
        .unwrap()
        .to_owned();
    let renamed = app
        .put(
            &format!("/api/categories/{vip_id}"),
            &token,
            json!({ "name": "Camarote", "color": "#7c3aed", "priceCents": null }),
        )
        .await;
    assert!(renamed.status.is_success(), "{}", renamed.status);
    let after = manifest(&app, &door_a, Some(&format!("0&guests={before}"))).await;
    let maria_now = after["guests"]
        .as_array()
        .unwrap()
        .iter()
        .find(|guest| guest["id"] == maria_id.as_str())
        .unwrap()
        .clone();
    assert_eq!(maria_now["category"]["name"], "Camarote");

    let now = live(&app, &token, &event).await;
    assert_eq!(
        now["guests"],
        json!({ "guests": 2, "people": 7, "arrivedGuests": 1, "arrivedPeople": 2 })
    );

    // A team member without the door part reads the list but cannot change it.
    app.post(
        &format!("/api/events/{event}/team"),
        &token,
        json!({ "email": "caixa@exemplo.com", "name": null, "areas": ["money"] }),
    )
    .await;
    let member = app.login("caixa@exemplo.com").await;
    assert_eq!(
        app.get(&format!("/api/events/{event}/guests"), &member)
            .await
            .status,
        StatusCode::OK
    );
    let refused = app
        .post(
            &format!("/api/events/{event}/guests"),
            &member,
            json!({ "name": "Penetra" }),
        )
        .await;
    assert_eq!(refused.error_code(), "not_your_area");
    assert_eq!(
        app.get(&format!("/api/events/{event}/door/live"), &member)
            .await
            .status,
        StatusCode::OK
    );
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn live_view_counts_the_door(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("banda@exemplo.com").await;
    let event = paid_event(&app, &token).await;
    app.post(
        &format!("/api/events/{event}/voids"),
        &token,
        json!({ "first": 20, "last": 20, "reason": "unsold" }),
    )
    .await;
    let (_, access) = create_link(&app, &token, &event).await;
    let phone = register(&app, &access, "Porta 1").await;

    let empty = live(&app, &token, &event).await;
    assert_eq!(empty["issued"], 20);
    assert_eq!(empty["sold"], 19);
    assert_eq!(empty["entries"], 0);
    assert_eq!(empty["timeline"].as_array().unwrap().len(), 12);
    assert!(empty["firstEntryAt"].is_null());
    assert!(empty["devices"][0]["pendingScans"].is_null());

    // Entries now land in the last bucket of the curve.
    let now_ms = time::OffsetDateTime::now_utc().unix_timestamp() * 1000;
    let mut first = scan(
        "00000000-0000-4000-8000-0000000000c1",
        Some(1),
        "admitted",
        0,
    );
    first["scannedAtMs"] = json!(now_ms);
    let mut second = scan(
        "00000000-0000-4000-8000-0000000000c2",
        Some(2),
        "admitted",
        0,
    );
    second["scannedAtMs"] = json!(now_ms);
    let mut copy = scan(
        "00000000-0000-4000-8000-0000000000c3",
        Some(1),
        "rejected_used",
        0,
    );
    copy["scannedAtMs"] = json!(now_ms);
    upload(
        &app,
        &phone,
        vec![
            first,
            second,
            copy,
            scan(
                "00000000-0000-4000-8000-0000000000c4",
                None,
                "rejected_invalid",
                0,
            ),
        ],
        false,
    )
    .await;
    // The phone reports what it still has to send.
    manifest(&app, &phone, Some("0&pending=3")).await;

    let now = live(&app, &token, &event).await;
    assert_eq!(now["entries"], 2);
    let timeline = now["timeline"].as_array().unwrap();
    assert_eq!(
        timeline
            .iter()
            .map(|bucket| bucket["entries"].as_i64().unwrap())
            .sum::<i64>(),
        2
    );
    assert_eq!(timeline[11]["entries"], 2);
    assert_eq!(now["refusals"]["blockedCopies"], 1);
    assert_eq!(now["refusals"]["invalid"], 1);
    let device = &now["devices"][0];
    assert_eq!(device["pendingScans"], 3);
    assert_eq!(device["entries"], 2);
    assert_eq!(device["scans"], 4);
    assert!(device["lastSyncAt"].is_string());
    assert_eq!(now["doors"][0]["entries"], 2);
    assert!(now["firstEntryAt"].is_string());
    assert_eq!(now["boxOffice"]["enabled"], false);

    // An old app neither reports nor clears it.
    manifest(&app, &phone, None).await;
    assert_eq!(
        live(&app, &token, &event).await["devices"][0]["pendingScans"],
        3
    );

    let stranger = app.login("outra@exemplo.com").await;
    assert_eq!(
        app.get(&format!("/api/events/{event}/door/live"), &stranger)
            .await
            .status,
        StatusCode::NOT_FOUND
    );
}
