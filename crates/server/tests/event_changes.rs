//! Postponing or canceling an event (ADR 0065), and what the digital ticket shows for the day:
//! address, the change and the room with the holder's table (ADR 0066).

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
use time::OffsetDateTime;
use time::format_description::well_known::Rfc3339;
use uuid::Uuid;

async fn postpone(
    app: &TestApp,
    token: &str,
    event: &str,
    starts: &str,
    ends: &str,
    reason: Option<&str>,
) -> Reply {
    app.post(
        &format!("/api/events/{event}/postpone"),
        token,
        json!({ "startsAt": starts, "endsAt": ends, "reason": reason }),
    )
    .await
}

async fn cancel(app: &TestApp, token: &str, event: &str, reason: Option<&str>) -> Reply {
    app.post(
        &format!("/api/events/{event}/cancel"),
        token,
        json!({ "reason": reason }),
    )
    .await
}

async fn access_expiry(app: &TestApp, access: &str) -> OffsetDateTime {
    sqlx::query_scalar("select expires_at from door_accesses where id = $1")
        .bind(Uuid::parse_str(access).unwrap())
        .fetch_one(&app.state.pool)
        .await
        .unwrap()
}

fn instant(text: &str) -> OffsetDateTime {
    OffsetDateTime::parse(text, &Rfc3339).unwrap()
}

/// A seller with numbers 1–10 and a private link; returns the link's token.
async fn seller_link(app: &TestApp, token: &str, event: &str) -> String {
    let seller = app
        .post(
            &format!("/api/events/{event}/sellers"),
            token,
            json!({ "name": "Maria" }),
        )
        .await
        .json();
    let id = seller["id"].as_str().unwrap();
    let reply = app
        .post(
            &format!("/api/sellers/{id}/ranges"),
            token,
            json!({ "first": 1, "last": 10 }),
        )
        .await;
    assert_eq!(reply.status, StatusCode::CREATED);
    let url = app
        .post(&format!("/api/sellers/{id}/link"), token, json!({}))
        .await
        .json()["url"]
        .as_str()
        .unwrap()
        .to_owned();
    url.split_once('#').unwrap().1.to_owned()
}

async fn seller(app: &TestApp, path: &str, body: Value) -> Reply {
    app.request(Method::POST, path, None, Some(body)).await
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
async fn postponing_keeps_the_original_date_and_moves_the_door(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("banda@exemplo.com").await;
    let event = app.create_event(&token, "Show").await;
    let (access, _) = create_link(&app, &token, &event).await;

    let first = postpone(
        &app,
        &token,
        &event,
        "2027-01-15T21:00:00-03:00",
        "2027-01-16T02:00:00-03:00",
        Some(" Previsão de chuva "),
    )
    .await;
    assert_eq!(first.status, StatusCode::OK, "{:?}", first.json());
    let first = first.json();
    assert_eq!(first["startsAt"], "2027-01-15T21:00:00-03:00");
    assert_eq!(
        first["change"]["postponedFromStartsAt"],
        "2026-11-20T22:00:00-03:00"
    );
    assert_eq!(first["change"]["postponeReason"], "Previsão de chuva");
    assert!(first["change"]["postponedAt"].is_string());
    assert_eq!(first["change"]["canceledAt"], Value::Null);
    // The door's links follow the new end (plus the 12 h grace).
    assert_eq!(
        access_expiry(&app, &access).await,
        instant("2027-01-16T14:00:00-03:00")
    );

    // A second postponement keeps the very first date; no reason clears the old one.
    let second = postpone(
        &app,
        &token,
        &event,
        "2027-02-05T21:00:00-03:00",
        "2027-02-06T02:00:00-03:00",
        None,
    )
    .await
    .json();
    assert_eq!(
        second["change"]["postponedFromStartsAt"],
        "2026-11-20T22:00:00-03:00"
    );
    assert_eq!(second["change"]["postponeReason"], Value::Null);

    // Back to the original date: not postponed any more.
    let back = postpone(
        &app,
        &token,
        &event,
        "2026-11-20T22:00:00-03:00",
        "2026-11-21T03:00:00-03:00",
        None,
    )
    .await
    .json();
    assert_eq!(back["change"]["postponedFromStartsAt"], Value::Null);
    assert_eq!(back["change"]["postponedAt"], Value::Null);
    assert_eq!(
        access_expiry(&app, &access).await,
        instant("2026-11-21T15:00:00-03:00")
    );

    for (starts, ends, code) in [
        (
            "2026-11-20T22:00:00-03:00",
            "2026-11-21T03:00:00-03:00",
            "same_dates",
        ),
        (
            "2027-01-15T21:00:00-03:00",
            "2027-01-15T20:00:00-03:00",
            "invalid_dates",
        ),
        (
            "2020-01-15T21:00:00-03:00",
            "2020-01-16T02:00:00-03:00",
            "invalid_dates",
        ),
    ] {
        let reply = postpone(&app, &token, &event, starts, ends, None).await;
        assert_eq!(reply.error_code(), code, "{starts}");
    }
    let long = "x".repeat(201);
    let reply = postpone(
        &app,
        &token,
        &event,
        "2027-01-15T21:00:00-03:00",
        "2027-01-16T02:00:00-03:00",
        Some(&long),
    )
    .await;
    assert_eq!(reply.error_code(), "invalid_reason");

    // Other organizations never see the event.
    let stranger = app.login("outra@exemplo.com").await;
    let reply = postpone(
        &app,
        &stranger,
        &event,
        "2027-01-15T21:00:00-03:00",
        "2027-01-16T02:00:00-03:00",
        None,
    )
    .await;
    assert_eq!(reply.status, StatusCode::NOT_FOUND);
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn a_canceled_event_takes_no_sales_and_can_come_back(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("banda@exemplo.com").await;
    let event = app.create_event(&token, "Show").await;
    paid_batch(&app, &token, &event, 20).await;
    let secret = seller_link(&app, &token, &event).await;
    let (_, door_token) = create_link(&app, &token, &event).await;
    let phone = register(&app, &door_token, "Porta 1").await;
    assert_eq!(
        manifest(&app, &phone, None).await["event"]["canceledAt"],
        Value::Null
    );

    let canceled = cancel(&app, &token, &event, Some("Problema no local")).await;
    assert_eq!(canceled.status, StatusCode::OK, "{:?}", canceled.json());
    let canceled = canceled.json();
    assert!(canceled["change"]["canceledAt"].is_string());
    assert_eq!(canceled["change"]["cancelReason"], "Problema no local");
    // Not the same as archiving: the event stays in the list, active.
    assert_eq!(canceled["status"], "active");
    let list = app.get("/api/events", &token).await.json();
    assert!(list[0]["change"]["canceledAt"].is_string());

    // Canceling again changes the reason, not the date.
    let again = cancel(&app, &token, &event, None).await.json();
    assert_eq!(
        again["change"]["canceledAt"],
        canceled["change"]["canceledAt"]
    );
    assert_eq!(again["change"]["cancelReason"], Value::Null);

    // No new batches, no sales on the sellers' links; the door shows it and keeps reading.
    let batch = app
        .post(
            &format!("/api/events/{event}/batches"),
            &token,
            json!({ "quantity": 5 }),
        )
        .await;
    assert_eq!(batch.error_code(), "event_canceled");
    let mark = seller(
        &app,
        "/api/seller/sales",
        json!({ "token": secret, "ranges": [{ "first": 1, "last": 1 }], "buyerName": null, "buyerPhone": null }),
    )
    .await;
    assert_eq!(mark.error_code(), "event_canceled");
    let send = seller(
        &app,
        "/api/seller/tickets",
        json!({ "token": secret, "number": 1 }),
    )
    .await;
    assert_eq!(send.error_code(), "event_canceled");
    let view = seller(&app, "/api/seller", json!({ "token": secret }))
        .await
        .json();
    assert!(view["event"]["change"]["canceledAt"].is_string());
    assert!(manifest(&app, &phone, None).await["event"]["canceledAt"].is_string());
    // Postponing a canceled event makes no sense until the cancellation is undone.
    let reply = postpone(
        &app,
        &token,
        &event,
        "2027-01-15T21:00:00-03:00",
        "2027-01-16T02:00:00-03:00",
        None,
    )
    .await;
    assert_eq!(reply.error_code(), "event_canceled");

    let undone = app
        .post(
            &format!("/api/events/{event}/cancel/undo"),
            &token,
            json!({}),
        )
        .await;
    assert_eq!(undone.status, StatusCode::OK);
    assert_eq!(undone.json()["change"]["canceledAt"], Value::Null);
    let undo_again = app
        .post(
            &format!("/api/events/{event}/cancel/undo"),
            &token,
            json!({}),
        )
        .await;
    assert_eq!(undo_again.error_code(), "event_not_canceled");
    let mark = seller(
        &app,
        "/api/seller/sales",
        json!({ "token": secret, "ranges": [{ "first": 1, "last": 1 }], "buyerName": null, "buyerPhone": null }),
    )
    .await;
    assert_eq!(mark.status, StatusCode::OK, "{:?}", mark.json());
    paid_batch(&app, &token, &event, 5).await;
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn coordination_postpones_and_the_team_is_told(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let owner = app.login("banda@exemplo.com").await;
    let event = app.create_event(&owner, "Show").await;
    for (email, areas) in [
        ("ana@exemplo.com", json!(["manage"])),
        ("bia@exemplo.com", json!(["art"])),
    ] {
        let reply = app
            .post(
                &format!("/api/events/{event}/team"),
                &owner,
                json!({ "email": email, "name": null, "areas": areas }),
            )
            .await;
        assert_eq!(reply.status, StatusCode::CREATED);
    }
    let ana = app.login("ana@exemplo.com").await;
    let bia = app.login("bia@exemplo.com").await;

    let refused = cancel(&app, &bia, &event, None).await;
    assert_eq!(refused.error_code(), "not_your_area");
    let reply = postpone(
        &app,
        &ana,
        &event,
        "2027-01-15T21:00:00-03:00",
        "2027-01-16T02:00:00-03:00",
        Some("Chuva"),
    )
    .await;
    assert_eq!(reply.status, StatusCode::OK, "{:?}", reply.json());
    // The answer keeps saying how the member is on the team.
    assert_eq!(reply.json()["team"]["areas"], json!(["manage"]));

    // Everyone else on the event hears it in the bell; who did it does not.
    let kinds = |inbox: Value| -> Vec<String> {
        inbox["notifications"]
            .as_array()
            .unwrap()
            .iter()
            .map(|item| item["kind"].as_str().unwrap().to_owned())
            .collect()
    };
    let owner_inbox = app.get("/api/inbox", &owner).await.json();
    let postponed = &owner_inbox["notifications"][0];
    assert_eq!(postponed["kind"], "event_postponed");
    assert_eq!(postponed["data"]["eventId"], event);
    assert_eq!(postponed["data"]["eventName"], "Show");
    assert_eq!(postponed["data"]["by"], "ana@exemplo.com");
    assert_eq!(postponed["data"]["startsAt"], "2027-01-15T21:00:00-03:00");
    assert_eq!(postponed["data"]["reason"], "Chuva");
    assert!(
        kinds(app.get("/api/inbox", &bia).await.json()).contains(&"event_postponed".to_owned())
    );
    assert!(
        !kinds(app.get("/api/inbox", &ana).await.json()).contains(&"event_postponed".to_owned())
    );

    // An admin in support mode is not named, and the change is audited.
    let admin = app.login(ADMIN).await;
    let reply = cancel(&app, &admin, &event, None).await;
    assert_eq!(reply.status, StatusCode::OK);
    let canceled = app.get("/api/inbox", &owner).await.json();
    assert_eq!(canceled["notifications"][0]["kind"], "event_canceled");
    assert_eq!(canceled["notifications"][0]["data"]["by"], Value::Null);
    let audited: i64 = sqlx::query_scalar(
        "select count(*) from audit_log where action = 'support_write' and detail ->> 'path' like '%/cancel'",
    )
    .fetch_one(&app.state.pool)
    .await
    .unwrap();
    assert_eq!(audited, 1);
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn the_digital_ticket_brings_the_address_the_change_and_the_room(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("formatura@exemplo.com").await;
    let reply = app
        .post(
            "/api/events",
            &token,
            json!({
                "name": "Formatura",
                "venue": "Clube Recreativo",
                "address": "Av. Brasil, 1500 - Centro",
                "startsAt": "2026-12-12T21:00:00-03:00",
                "endsAt": "2026-12-13T04:00:00-03:00",
                "ticketPriceCents": 12000
            }),
        )
        .await;
    assert_eq!(reply.status, StatusCode::CREATED);
    let event = reply.json()["id"].as_str().unwrap().to_owned();
    assert_eq!(reply.json()["address"], "Av. Brasil, 1500 - Centro");
    let bad = app
        .put(
            &format!("/api/events/{event}"),
            &token,
            json!({
                "name": "Formatura",
                "venue": "Clube Recreativo",
                "address": "x".repeat(201),
                "startsAt": "2026-12-12T21:00:00-03:00",
                "endsAt": "2026-12-13T04:00:00-03:00",
                "ticketPriceCents": 12000
            }),
        )
        .await;
    assert_eq!(bad.error_code(), "invalid_address");
    paid_batch(&app, &token, &event, 10).await;
    app.post(
        &format!("/api/events/{event}/tables/bulk"),
        &token,
        json!({ "count": 3, "seats": 8, "shape": "round", "prefix": "Mesa" }),
    )
    .await;
    let tables = app
        .get(&format!("/api/events/{event}/tables"), &token)
        .await
        .json();
    let second = tables[1]["id"].as_str().unwrap();
    app.post(
        &format!("/api/tables/{second}/tickets"),
        &token,
        json!({ "ranges": [{ "first": 4, "last": 5 }], "moveSeated": false }),
    )
    .await;

    let open = |number: i32| {
        let app = &app;
        let token = token.clone();
        let event = event.clone();
        async move {
            let created = app
                .post(
                    &format!("/api/events/{event}/tickets"),
                    &token,
                    json!({ "number": number }),
                )
                .await;
            assert_eq!(created.status, StatusCode::CREATED, "{:?}", created.json());
            let url = created.json()["url"].as_str().unwrap().to_owned();
            app.request(
                Method::POST,
                "/api/ticket",
                None,
                Some(json!({ "token": url.split_once('#').unwrap().1 })),
            )
            .await
            .json()
        }
    };
    let seated = open(5).await;
    assert_eq!(seated["event"]["id"], event);
    assert_eq!(seated["event"]["address"], "Av. Brasil, 1500 - Centro");
    assert_eq!(seated["event"]["change"]["canceledAt"], Value::Null);
    assert_eq!(seated["seat"], "Mesa 2 · Lugar 2");
    let map = &seated["tableMap"];
    assert_eq!(map["table"], "Mesa 2");
    assert_eq!(map["seat"], 2);
    assert_eq!(map["tables"].as_array().unwrap().len(), 3);
    // The map has tables only: nobody's seat but the holder's.
    assert_eq!(
        map["tables"][0]
            .as_object()
            .unwrap()
            .keys()
            .collect::<Vec<_>>(),
        ["name", "seats", "shape", "x", "y"]
    );
    let free = open(9).await;
    assert_eq!(free["tableMap"], Value::Null);

    // Postponed: the pass has the new date and the original one.
    postpone(
        &app,
        &token,
        &event,
        "2026-12-19T21:00:00-03:00",
        "2026-12-20T04:00:00-03:00",
        Some("Reforma no clube"),
    )
    .await;
    let later = open(6).await;
    assert_eq!(later["event"]["startsAt"], "2026-12-19T21:00:00-03:00");
    assert_eq!(
        later["event"]["change"]["postponedFromStartsAt"],
        "2026-12-12T21:00:00-03:00"
    );
    assert_eq!(
        later["event"]["change"]["postponeReason"],
        "Reforma no clube"
    );
}
