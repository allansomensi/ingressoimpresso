//! An event with several dates (ADR 0077): each date is a whole event with its own numbers,
//! keys and QR tag; the series groups them, carries the shared name and adds them up.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing,
    reason = "test helpers fail loudly by design"
)]

mod common;

use axum::http::{Method, StatusCode};
use common::door::{create_link, manifest, register};
use common::{ADMIN, Reply, TestApp};
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

async fn add_date(app: &TestApp, token: &str, event: &str, starts: &str, ends: &str) -> Reply {
    app.post(
        &format!("/api/events/{event}/dates"),
        token,
        json!({ "startsAt": starts, "endsAt": ends }),
    )
    .await
}

async fn new_date(app: &TestApp, token: &str, event: &str, day: u8) -> String {
    let reply = add_date(
        app,
        token,
        event,
        &format!("2030-11-{day:02}T20:00:00-03:00"),
        &format!("2030-11-{day:02}T23:00:00-03:00"),
    )
    .await;
    assert_eq!(
        reply.status,
        StatusCode::CREATED,
        "{}",
        String::from_utf8_lossy(&reply.bytes)
    );
    reply.json()["id"].as_str().unwrap().to_owned()
}

async fn qr_tag(app: &TestApp, event: &str) -> i64 {
    sqlx::query_scalar("select qr_tag from events where id = $1")
        .bind(Uuid::parse_str(event).unwrap())
        .fetch_one(&app.state.pool)
        .await
        .unwrap()
}

async fn seller(app: &TestApp, token: &str, event: &str, name: &str) -> String {
    let sellers = app
        .get(&format!("/api/events/{event}/sellers"), token)
        .await
        .json();
    if let Some(found) = sellers
        .as_array()
        .unwrap()
        .iter()
        .find(|seller| seller["name"] == name)
    {
        return found["id"].as_str().unwrap().to_owned();
    }
    let reply = app
        .post(
            &format!("/api/events/{event}/sellers"),
            token,
            json!({ "name": name, "phone": null }),
        )
        .await;
    assert_eq!(reply.status, StatusCode::CREATED);
    reply.json()["id"].as_str().unwrap().to_owned()
}

async fn assign(app: &TestApp, token: &str, seller: &str, first: i32, last: i32) {
    let reply = app
        .post(
            &format!("/api/sellers/{seller}/ranges"),
            token,
            json!({ "first": first, "last": last }),
        )
        .await;
    assert_eq!(
        reply.status,
        StatusCode::CREATED,
        "{}",
        String::from_utf8_lossy(&reply.bytes)
    );
}

/// The QR text of number `number`, read from its digital ticket.
async fn qr_of(app: &TestApp, token: &str, event: &str, number: i32) -> (String, Value) {
    let link = app
        .post(
            &format!("/api/events/{event}/tickets"),
            token,
            json!({ "number": number, "holderName": "Bia" }),
        )
        .await;
    assert_eq!(link.status, StatusCode::CREATED, "{:?}", link.json());
    let url = link.json()["url"].as_str().unwrap().to_owned();
    let pass = app
        .request(
            Method::POST,
            "/api/ticket",
            None,
            Some(json!({ "token": url.split_once('#').unwrap().1 })),
        )
        .await
        .json();
    (pass["qrText"].as_str().unwrap().to_owned(), pass)
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn another_date_copies_the_setup_and_never_shares_tickets(pool: PgPool) {
    let app = TestApp::with_free_tickets(pool, 100).await;
    let token = app.login("teatro@exemplo.com").await;
    let first = app.create_event(&token, "Peça da Escola").await;
    seller(&app, &token, &first, "Ana").await;
    let category = app
        .post(
            &format!("/api/events/{first}/categories"),
            &token,
            json!({ "name": "Plateia", "color": "#2563eb", "priceCents": 2000 }),
        )
        .await;
    assert_eq!(category.status, StatusCode::CREATED);
    app.put(
        &format!("/api/events/{first}/verify-settings"),
        &token,
        json!({ "publicVerify": false }),
    )
    .await;

    let reply = add_date(
        &app,
        &token,
        &first,
        "2030-11-21T20:00:00-03:00",
        "2030-11-21T23:00:00-03:00",
    )
    .await;
    assert_eq!(reply.status, StatusCode::CREATED);
    let second = reply.json();
    let second_id = second["id"].as_str().unwrap().to_owned();
    assert_eq!(second["name"], "Peça da Escola");
    assert_eq!(second["venue"], "Bar do Zé");
    assert_eq!(second["startsAt"], "2030-11-21T20:00:00-03:00");
    assert_eq!(second["ticketPriceCents"], 3000);
    assert_eq!(second["series"]["dates"], 2);
    assert_eq!(second["series"]["position"], 2);
    assert_eq!(second["series"]["name"], "Peça da Escola");
    let series = second["series"]["id"].as_str().unwrap().to_owned();
    let original = app
        .get(&format!("/api/events/{first}"), &token)
        .await
        .json();
    assert_eq!(original["series"]["id"], series.as_str());
    assert_eq!(original["series"]["position"], 1);

    // The setup came along: sellers without numbers, categories and the switches.
    let sellers = app
        .get(&format!("/api/events/{second_id}/sellers"), &token)
        .await
        .json();
    assert_eq!(sellers[0]["name"], "Ana");
    assert_eq!(sellers[0]["ranges"], json!([]));
    let categories = app
        .get(&format!("/api/events/{second_id}/categories"), &token)
        .await
        .json();
    assert_eq!(categories[0]["name"], "Plateia");
    let verify = app
        .get(&format!("/api/events/{second_id}/verify-settings"), &token)
        .await
        .json();
    assert_eq!(verify["publicVerify"], false);

    // Each date has its own QR tag and key: a ticket of one never opens the other's door.
    assert_ne!(qr_tag(&app, &first).await, qr_tag(&app, &second_id).await);
    let keys: Vec<Vec<u8>> = sqlx::query_scalar(
        "select public_key from event_signing_keys where event_id = any($1) order by event_id",
    )
    .bind(vec![
        Uuid::parse_str(&first).unwrap(),
        Uuid::parse_str(&second_id).unwrap(),
    ])
    .fetch_all(&app.state.pool)
    .await
    .unwrap();
    assert_eq!(keys.len(), 2);
    assert_ne!(keys[0], keys[1]);

    // The same start twice, a date already gone and a broken range are refused.
    let taken = add_date(
        &app,
        &token,
        &first,
        "2030-11-21T20:00:00-03:00",
        "2030-11-21T22:00:00-03:00",
    )
    .await;
    assert_eq!(taken.status, StatusCode::CONFLICT);
    assert_eq!(taken.error_code(), "date_taken");
    let past = add_date(
        &app,
        &token,
        &first,
        "2020-01-10T20:00:00-03:00",
        "2020-01-10T22:00:00-03:00",
    )
    .await;
    assert_eq!(past.error_code(), "invalid_dates");
    let backwards = add_date(
        &app,
        &token,
        &first,
        "2030-11-22T20:00:00-03:00",
        "2030-11-22T19:00:00-03:00",
    )
    .await;
    assert_eq!(backwards.error_code(), "invalid_dates");

    // The ticket, the public check and the door say which session it is.
    app.create_batch(&token, &second_id, 10).await;
    app.put(
        &format!("/api/events/{second_id}/verify-settings"),
        &token,
        json!({ "publicVerify": true }),
    )
    .await;
    let (qr, pass) = qr_of(&app, &token, &second_id, 3).await;
    assert_eq!(pass["event"]["inSeries"], true);
    assert_eq!(pass["event"]["startsAt"], "2030-11-21T20:00:00-03:00");
    let checked = app
        .request(
            Method::POST,
            "/api/verify",
            None,
            Some(json!({ "text": qr })),
        )
        .await
        .json();
    assert_eq!(checked["verdict"], "valid");
    assert_eq!(checked["ticket"]["event"]["inSeries"], true);
    assert_eq!(
        checked["ticket"]["event"]["startsAt"],
        "2030-11-21T20:00:00-03:00"
    );
    let (_, access) = create_link(&app, &token, &first).await;
    let phone = register(&app, &access, "Porta 1").await;
    let door = manifest(&app, &phone, None).await;
    assert_eq!(door["event"]["inSeries"], true);
    assert_eq!(
        door["verifier"]["eventTag"],
        json!(qr_tag(&app, &first).await)
    );
    assert_eq!(
        door["sessions"],
        json!([{ "eventTag": qr_tag(&app, &second_id).await, "startsAt": "2030-11-21T20:00:00-03:00" }])
    );

    // The list shows both dates with their series.
    let list = app.get("/api/events", &token).await.json();
    let in_series = list
        .as_array()
        .unwrap()
        .iter()
        .filter(|event| event["series"]["id"] == series.as_str())
        .count();
    assert_eq!(in_series, 2);

    // Another organization neither adds dates nor sees the series.
    let other = app.login("outra@exemplo.com").await;
    let denied = new_date_reply(&app, &other, &first).await;
    assert_eq!(denied.status, StatusCode::NOT_FOUND);
    let hidden = app.get(&format!("/api/series/{series}"), &other).await;
    assert_eq!(hidden.status, StatusCode::NOT_FOUND);
}

async fn new_date_reply(app: &TestApp, token: &str, event: &str) -> Reply {
    add_date(
        app,
        token,
        event,
        "2030-11-28T20:00:00-03:00",
        "2030-11-28T23:00:00-03:00",
    )
    .await
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn the_series_page_adds_dates_and_sellers_by_name(pool: PgPool) {
    let app = TestApp::with_free_tickets(pool, 100).await;
    let token = app.login("banda@exemplo.com").await;
    let first = app.create_event(&token, "Turnê").await;
    let ana = seller(&app, &token, &first, "Ana Souza").await;
    let second = new_date(&app, &token, &first, 27).await;

    app.create_batch(&token, &first, 20).await;
    app.create_batch(&token, &second, 10).await;
    assign(&app, &token, &ana, 1, 10).await;
    // The same person on the second date, typed differently.
    let ana_again = seller(&app, &token, &second, "Ana Souza").await;
    app.put(
        &format!("/api/sellers/{ana_again}"),
        &token,
        json!({ "name": "  ana   souza ", "phone": null }),
    )
    .await;
    assign(&app, &token, &ana_again, 1, 5).await;
    // Two returned on the first date.
    let voided = app
        .post(
            &format!("/api/events/{first}/voids"),
            &token,
            json!({ "first": 9, "last": 10, "reason": "unsold", "note": null }),
        )
        .await;
    assert_eq!(voided.status, StatusCode::CREATED);
    let paid = app
        .post(
            &format!("/api/sellers/{ana}/payments"),
            &token,
            json!({ "amountCents": 6000, "method": "pix", "receivedOn": "2026-10-01", "note": null }),
        )
        .await;
    assert_eq!(paid.status, StatusCode::CREATED);

    let series_id = app
        .get(&format!("/api/events/{first}"), &token)
        .await
        .json()["series"]["id"]
        .as_str()
        .unwrap()
        .to_owned();
    let page = app.get(&format!("/api/series/{series_id}"), &token).await;
    assert_eq!(page.status, StatusCode::OK);
    let page = page.json();
    assert_eq!(page["name"], "Turnê");
    assert_eq!(page["canManage"], true);
    assert_eq!(page["hiddenDates"], 0);
    let dates = page["dates"].as_array().unwrap();
    assert_eq!(dates.len(), 2);
    assert_eq!(dates[0]["event"]["id"], first.as_str());
    assert_eq!(dates[0]["numbers"]["tickets"], 20);
    assert_eq!(dates[0]["numbers"]["sold"], 18);
    assert_eq!(dates[0]["numbers"]["amountDueCents"], 18 * 3000);
    assert_eq!(dates[1]["numbers"]["tickets"], 10);
    assert_eq!(dates[1]["numbers"]["sold"], 10);
    // Free tickets cost nothing; the result is what was sold.
    assert_eq!(page["totals"]["tickets"], 30);
    assert_eq!(page["totals"]["sold"], 28);
    assert_eq!(page["totals"]["amountDueCents"], 28 * 3000);
    assert_eq!(page["totals"]["receivedCents"], 6000);
    assert_eq!(page["totals"]["netCents"], 28 * 3000);

    // Ana is one seller across the dates: 8 + 5 sold, R$ 60 received.
    let sellers = page["sellers"].as_array().unwrap();
    assert_eq!(sellers.len(), 1);
    assert_eq!(sellers[0]["name"], "Ana Souza");
    assert_eq!(sellers[0]["dates"], 2);
    assert_eq!(sellers[0]["tickets"], 15);
    assert_eq!(sellers[0]["sold"], 13);
    assert_eq!(sellers[0]["amountDueCents"], 13 * 3000);
    assert_eq!(sellers[0]["receivedCents"], 6000);
    assert_eq!(sellers[0]["balanceCents"], 13 * 3000 - 6000);
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn renaming_detaching_and_deleting_dates(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("igreja@exemplo.com").await;
    let first = app.create_event(&token, "Cantata de Natal").await;
    let second = new_date(&app, &token, &first, 21).await;
    let third = new_date(&app, &token, &first, 22).await;
    let series_id = app
        .get(&format!("/api/events/{third}"), &token)
        .await
        .json()["series"]["id"]
        .as_str()
        .unwrap()
        .to_owned();

    // A date renamed on its own keeps its name when the series is renamed.
    let mut body = app
        .get(&format!("/api/events/{third}"), &token)
        .await
        .json();
    body["name"] = json!("Cantata · sessão extra");
    let renamed = app.put(&format!("/api/events/{third}"), &token, body).await;
    assert_eq!(renamed.status, StatusCode::OK);
    assert_eq!(renamed.json()["series"]["dates"], 3);
    let page = app
        .put(
            &format!("/api/series/{series_id}"),
            &token,
            json!({ "name": "Cantata 2026" }),
        )
        .await;
    assert_eq!(page.status, StatusCode::OK);
    let names: Vec<Value> = page.json()["dates"]
        .as_array()
        .unwrap()
        .iter()
        .map(|date| date["event"]["name"].clone())
        .collect();
    assert_eq!(
        names,
        vec![
            json!("Cantata 2026"),
            json!("Cantata 2026"),
            json!("Cantata · sessão extra")
        ]
    );
    let blank = app
        .put(
            &format!("/api/series/{series_id}"),
            &token,
            json!({ "name": "  " }),
        )
        .await;
    assert_eq!(blank.error_code(), "invalid_name");
    // A date added later takes the series' name, even from the renamed one.
    let fourth = add_date(
        &app,
        &token,
        &third,
        "2030-11-23T20:00:00-03:00",
        "2030-11-23T23:00:00-03:00",
    )
    .await
    .json();
    assert_eq!(fourth["name"], "Cantata 2026");
    let fourth = fourth["id"].as_str().unwrap().to_owned();

    // Someone on the team of one date sees that date only, and changes nothing of the series.
    let added = app
        .post(
            &format!("/api/events/{first}/team"),
            &token,
            json!({ "email": "porta@exemplo.com", "name": null, "areas": ["door"] }),
        )
        .await;
    assert_eq!(added.status, StatusCode::CREATED);
    let door = app.login("porta@exemplo.com").await;
    let seen = app.get(&format!("/api/series/{series_id}"), &door).await;
    assert_eq!(seen.status, StatusCode::OK);
    let seen = seen.json();
    assert_eq!(seen["dates"].as_array().unwrap().len(), 1);
    assert_eq!(seen["hiddenDates"], 3);
    assert_eq!(seen["canManage"], false);
    let refused = app
        .put(
            &format!("/api/series/{series_id}"),
            &door,
            json!({ "name": "Outro" }),
        )
        .await;
    assert_eq!(refused.status, StatusCode::FORBIDDEN);
    assert_eq!(refused.error_code(), "not_your_area");
    let refused = new_date_reply(&app, &door, &first).await;
    assert_eq!(refused.error_code(), "not_your_area");

    // An admin in support mode reads the series; a rename is audited.
    let admin = app.login(ADMIN).await;
    let support = app.get(&format!("/api/series/{series_id}"), &admin).await;
    assert_eq!(support.json()["supportAccess"], true);
    app.put(
        &format!("/api/series/{series_id}"),
        &admin,
        json!({ "name": "Cantata de Natal" }),
    )
    .await;
    let audited: i64 = sqlx::query_scalar(
        "select count(*) from audit_log where action = 'support_write' and target_id = $1",
    )
    .bind(Uuid::parse_str(&series_id).unwrap())
    .fetch_one(&app.state.pool)
    .await
    .unwrap();
    assert_eq!(audited, 1);

    // Exporting the account names the series of each date.
    let export = app.get("/api/account/export", &token).await.json();
    assert_eq!(export["events"][0]["series"], "Cantata de Natal");

    // A date leaves the series and goes on alone.
    let left = app
        .post(
            &format!("/api/events/{fourth}/series/leave"),
            &token,
            json!({}),
        )
        .await;
    assert_eq!(left.status, StatusCode::OK);
    assert_eq!(left.json()["series"], Value::Null);
    let again = app
        .post(
            &format!("/api/events/{fourth}/series/leave"),
            &token,
            json!({}),
        )
        .await;
    assert_eq!(again.error_code(), "not_in_series");
    let refused = app
        .post(
            &format!("/api/events/{first}/series/leave"),
            &door,
            json!({}),
        )
        .await;
    assert_eq!(refused.error_code(), "not_your_area");

    // Deleting dates down to one dissolves the series.
    let deleted = app
        .delete(&format!("/api/events/{third}"), &token, None)
        .await;
    assert_eq!(deleted.status, StatusCode::NO_CONTENT);
    let first_now = app
        .get(&format!("/api/events/{first}"), &token)
        .await
        .json();
    assert_eq!(first_now["series"]["dates"], 2);
    let deleted = app
        .delete(&format!("/api/events/{second}"), &token, None)
        .await;
    assert_eq!(deleted.status, StatusCode::NO_CONTENT);
    let first_now = app
        .get(&format!("/api/events/{first}"), &token)
        .await
        .json();
    assert_eq!(first_now["series"], Value::Null);
    let gone = app.get(&format!("/api/series/{series_id}"), &token).await;
    assert_eq!(gone.status, StatusCode::NOT_FOUND);
}
