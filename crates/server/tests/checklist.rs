//! What is missing before the event (ADR 0078): worked out on the server from what the event has,
//! counted in the event list, read by the whole team with the actions of each one's areas.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing,
    reason = "test helpers fail loudly by design"
)]

mod common;

use axum::http::{Method, StatusCode};
use common::TestApp;
use common::door::{create_link, register};
use serde_json::{Value, json};
use sqlx::PgPool;
use time::format_description::well_known::Rfc3339;
use time::macros::offset;
use time::{Duration, OffsetDateTime};

/// An event a month from now (the checklist is about events still ahead).
async fn upcoming_event(app: &TestApp, token: &str, name: &str) -> String {
    let start = (OffsetDateTime::now_utc() + Duration::days(30)).to_offset(offset!(-3));
    let reply = app
        .post(
            "/api/events",
            token,
            json!({
                "name": name,
                "venue": "Salão Paroquial",
                "startsAt": start.format(&Rfc3339).unwrap(),
                "endsAt": (start + Duration::hours(4)).format(&Rfc3339).unwrap(),
                "ticketPriceCents": 2000
            }),
        )
        .await;
    assert_eq!(reply.status, StatusCode::CREATED);
    reply.json()["id"].as_str().unwrap().to_owned()
}

async fn checklist(app: &TestApp, token: &str, event: &str) -> Value {
    let reply = app
        .get(&format!("/api/events/{event}/checklist"), token)
        .await;
    assert_eq!(reply.status, StatusCode::OK);
    reply.json()
}

fn item(list: &Value, key: &str) -> Value {
    list["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|item| item["key"] == key)
        .cloned()
        .unwrap_or_else(|| panic!("no item {key}"))
}

fn missing_keys(list: &Value) -> Vec<String> {
    list["items"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|item| item["state"] == "missing")
        .map(|item| item["key"].as_str().unwrap().to_owned())
        .collect()
}

fn listed_missing(list: &Value, event: &str) -> Value {
    list.as_array()
        .unwrap()
        .iter()
        .find(|item| item["id"] == event)
        .unwrap()["checklistMissing"]
        .clone()
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn the_checklist_follows_the_event_until_nothing_is_missing(pool: PgPool) {
    let app = TestApp::with_free_tickets(pool, 50).await;
    let token = app.login("igreja@exemplo.com").await;
    let event = upcoming_event(&app, &token, "Festa da Padroeira").await;

    let list = checklist(&app, &token, &event).await;
    assert_eq!(list["applies"], true);
    assert_eq!(
        missing_keys(&list),
        [
            "details",
            "design",
            "batch",
            "delivery",
            "door_link",
            "rehearsal",
            "organization_contact"
        ]
    );
    assert_eq!(list["missing"], 7);
    assert_eq!(item(&list, "details")["hint"], "no_address");
    assert_eq!(item(&list, "rehearsal")["hint"], "no_devices");
    assert_eq!(item(&list, "art")["state"], "not_applicable");
    assert_eq!(item(&list, "seller_links")["state"], "not_applicable");
    assert_eq!(item(&list, "categories")["state"], "optional");
    assert_eq!(item(&list, "guests")["state"], "optional");
    // The public check is on by default.
    assert_eq!(item(&list, "public_verify")["state"], "done");
    assert!(
        list["items"]
            .as_array()
            .unwrap()
            .iter()
            .all(|item| item["canAct"] == true)
    );
    let events = app.get("/api/events", &token).await.json();
    assert_eq!(listed_missing(&events, &event), 7);

    // The address.
    let mut body = app
        .get(&format!("/api/events/{event}"), &token)
        .await
        .json();
    body["address"] = json!("Rua das Flores, 100");
    app.put(&format!("/api/events/{event}"), &token, body).await;
    // The design.
    let design = app
        .get(&format!("/api/events/{event}/design"), &token)
        .await
        .json();
    let saved = app
        .put(
            &format!("/api/events/{event}/design"),
            &token,
            json!({ "design": design["design"], "artId": null }),
        )
        .await;
    assert_eq!(saved.status, StatusCode::OK);
    // A paid batch, and a seller with numbers but no link yet.
    app.create_batch(&token, &event, 20).await;
    let seller = app
        .post(
            &format!("/api/events/{event}/sellers"),
            &token,
            json!({ "name": "Ana", "phone": null }),
        )
        .await
        .json()["id"]
        .as_str()
        .unwrap()
        .to_owned();
    app.post(
        &format!("/api/sellers/{seller}/ranges"),
        &token,
        json!({ "first": 1, "last": 10 }),
    )
    .await;
    let list = checklist(&app, &token, &event).await;
    assert_eq!(
        missing_keys(&list),
        [
            "seller_links",
            "delivery",
            "door_link",
            "rehearsal",
            "organization_contact"
        ]
    );
    assert_eq!(item(&list, "sellers")["state"], "done");
    assert_eq!(
        item(&list, "seller_links")["progress"],
        json!({ "done": 0, "total": 1 })
    );

    // The seller's link, a digital ticket, the door and its rehearsal, and the contact.
    app.post(&format!("/api/sellers/{seller}/link"), &token, json!({}))
        .await;
    let ticket = app
        .post(
            &format!("/api/events/{event}/tickets"),
            &token,
            json!({ "number": 15, "holderName": "Bia" }),
        )
        .await;
    assert_eq!(ticket.status, StatusCode::CREATED);
    let (_, access) = create_link(&app, &token, &event).await;
    let list = checklist(&app, &token, &event).await;
    assert_eq!(missing_keys(&list), ["rehearsal", "organization_contact"]);
    assert_eq!(item(&list, "rehearsal")["hint"], "no_devices");
    let phone = register(&app, &access, "Porta 1").await;
    let list = checklist(&app, &token, &event).await;
    assert_eq!(item(&list, "rehearsal")["hint"], Value::Null);
    let rehearsed = app
        .request(
            Method::POST,
            "/api/door/rehearsal",
            Some(&phone.secret),
            Some(json!({})),
        )
        .await;
    assert_eq!(rehearsed.status, StatusCode::NO_CONTENT);
    let profile = app
        .put(
            "/api/account/profile",
            &token,
            json!({
                "brandColor": null, "whatsapp": "(11) 99999-8888", "contactEmail": null,
                "website": null, "instagram": null, "defaultVenue": null,
                "defaultAddress": null, "defaultTicketPriceCents": null
            }),
        )
        .await;
    assert_eq!(profile.status, StatusCode::OK);
    let list = checklist(&app, &token, &event).await;
    assert_eq!(list["missing"], 0);
    assert_eq!(missing_keys(&list), Vec::<String>::new());
    let events = app.get("/api/events", &token).await.json();
    assert_eq!(listed_missing(&events, &event), 0);
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn the_team_sees_the_state_and_acts_on_its_areas(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("escola@exemplo.com").await;
    let event = upcoming_event(&app, &token, "Formatura").await;
    let added = app
        .post(
            &format!("/api/events/{event}/team"),
            &token,
            json!({ "email": "porta@exemplo.com", "name": null, "areas": ["door"] }),
        )
        .await;
    assert_eq!(added.status, StatusCode::CREATED);
    let door = app.login("porta@exemplo.com").await;
    let list = checklist(&app, &door, &event).await;
    assert_eq!(list["missing"], 7);
    for item in list["items"].as_array().unwrap() {
        assert_eq!(
            item["canAct"] == true,
            item["area"] == "door",
            "{}",
            item["key"]
        );
    }
    // The profile is the organization's.
    assert_eq!(item(&list, "organization_contact")["area"], Value::Null);
    assert_eq!(item(&list, "organization_contact")["canAct"], false);
    // The team's list counts too.
    let events = app.get("/api/events", &door).await.json();
    assert_eq!(listed_missing(&events, &event), 7);
    // Another organization does not see it.
    let other = app.login("outra@exemplo.com").await;
    let hidden = app
        .get(&format!("/api/events/{event}/checklist"), &other)
        .await;
    assert_eq!(hidden.status, StatusCode::NOT_FOUND);
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn ended_archived_or_canceled_events_have_no_checklist(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("banda@exemplo.com").await;
    let archived = upcoming_event(&app, &token, "Arquivado").await;
    app.put(
        &format!("/api/events/{archived}/status"),
        &token,
        json!({ "status": "closed" }),
    )
    .await;
    let canceled = upcoming_event(&app, &token, "Cancelado").await;
    app.post(
        &format!("/api/events/{canceled}/cancel"),
        &token,
        json!({ "reason": null }),
    )
    .await;
    let ended = upcoming_event(&app, &token, "Passado").await;
    sqlx::query(
        "update events set starts_at = now() - interval '2 days', ends_at = now() - interval '1 day' where id = $1::uuid",
    )
    .bind(&ended)
    .execute(&app.state.pool)
    .await
    .unwrap();
    let events = app.get("/api/events", &token).await.json();
    for event in [&archived, &canceled, &ended] {
        let list = checklist(&app, &token, event).await;
        assert_eq!(list["applies"], false);
        assert_eq!(list["items"], json!([]));
        assert_eq!(listed_missing(&events, event), Value::Null);
    }
}
