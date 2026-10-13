//! Sellers' reservations (ADR 0072), goals and ranking (ADR 0073) and the queue of the seller's
//! page, sent again after a lost answer or from another phone (ADR 0074).

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing,
    reason = "test helpers fail loudly by design"
)]

mod common;

use axum::http::{Method, StatusCode};
use common::{ADMIN, Reply, TestApp};
use serde_json::{Value, json};
use sqlx::PgPool;
use time::format_description::well_known::Rfc3339;
use time::{Duration, OffsetDateTime};
use uuid::Uuid;

/// An event at R$ 30 with 20 paid tickets: Maria Souza holds 1–10, João Lima 11–15 and Caio, the
/// box office, 16–20.
struct Setup {
    event: String,
    maria: String,
    joao: String,
    caio: String,
}

async fn setup(app: &TestApp, token: &str) -> Setup {
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
    let mut ids = Vec::new();
    for (name, first, last, box_office) in [
        ("Maria Souza", 1, 10, false),
        ("João Lima", 11, 15, false),
        ("Caio", 16, 20, true),
    ] {
        let seller = app
            .post(
                &format!("/api/events/{event}/sellers"),
                token,
                json!({ "name": name, "boxOffice": box_office }),
            )
            .await
            .json();
        let id = seller["id"].as_str().unwrap().to_owned();
        let reply = app
            .post(
                &format!("/api/sellers/{id}/ranges"),
                token,
                json!({ "first": first, "last": last }),
            )
            .await;
        assert_eq!(reply.status, StatusCode::CREATED);
        ids.push(id);
    }
    Setup {
        event,
        maria: ids[0].clone(),
        joao: ids[1].clone(),
        caio: ids[2].clone(),
    }
}

async fn link(app: &TestApp, token: &str, seller: &str) -> String {
    let reply = app
        .post(&format!("/api/sellers/{seller}/link"), token, json!({}))
        .await;
    let url = reply.json()["url"].as_str().unwrap().to_owned();
    url.split_once('#').unwrap().1.to_owned()
}

async fn sync(app: &TestApp, secret: &str, ops: Value) -> Reply {
    app.request(
        Method::POST,
        "/api/seller/sync",
        None,
        Some(json!({ "token": secret, "ops": ops })),
    )
    .await
}

/// Sends one change and returns `(result, view)`.
async fn one(app: &TestApp, secret: &str, id: Uuid, op: Value) -> (Value, Value) {
    let reply = sync(app, secret, json!([{ "id": id, "op": op }])).await;
    assert_eq!(reply.status, StatusCode::OK, "{:?}", reply.json());
    let body = reply.json();
    (body["results"][0].clone(), body["view"].clone())
}

fn mark(first: i32, last: i32, buyer: Option<&str>) -> Value {
    json!({ "kind": "mark", "ranges": [{ "first": first, "last": last }], "buyerName": buyer,
            "buyerPhone": null, "edit": false, "reservationId": null })
}

fn reserve(id: Uuid, first: i32, last: i32, holder: &str, until: OffsetDateTime) -> Value {
    json!({ "kind": "reserve", "reservationId": id, "ranges": [{ "first": first, "last": last }],
            "holderName": holder, "holderPhone": "11 98888-7777",
            "expiresAt": until.format(&Rfc3339).unwrap() })
}

fn tomorrow() -> OffsetDateTime {
    OffsetDateTime::now_utc() + Duration::days(1)
}

fn counts(view: &Value) -> (i64, i64, i64) {
    let s = &view["summary"];
    (
        s["sold"].as_i64().unwrap(),
        s["available"].as_i64().unwrap(),
        s["reserved"].as_i64().unwrap(),
    )
}

async fn report_row(app: &TestApp, token: &str, event: &str, seller: &str) -> Value {
    let report = app
        .get(&format!("/api/events/{event}/report"), token)
        .await
        .json();
    report["sellers"]
        .as_array()
        .unwrap()
        .iter()
        .find(|row| row["sellerId"] == seller)
        .unwrap()
        .clone()
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn sellers_reserve_sell_and_give_up_reservations(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("banda@exemplo.com").await;
    let s = setup(&app, &token).await;
    let secret = link(&app, &token, &s.maria).await;

    // 1–2 for Ana until tomorrow: reserved, neither sold nor free to sell.
    let ana = Uuid::new_v4();
    let (result, view) = one(
        &app,
        &secret,
        Uuid::new_v4(),
        reserve(ana, 1, 2, " Ana ", tomorrow()),
    )
    .await;
    assert_eq!(result["outcome"], "applied");
    assert_eq!(counts(&view), (0, 8, 2));
    let reservation = &view["reservations"][0];
    assert_eq!(reservation["id"], ana.to_string());
    assert_eq!(reservation["holderName"], "Ana");
    assert_eq!(reservation["numbers"], json!([{ "first": 1, "last": 2 }]));
    assert_eq!(reservation["active"], true);
    assert_eq!(reservation["byOrganizer"], false);
    // The deadline comes in the event's time.
    assert!(
        reservation["expiresAt"]
            .as_str()
            .unwrap()
            .ends_with("-03:00")
    );
    let row = report_row(&app, &token, &s.event, &s.maria).await;
    assert_eq!(row["reserved"], 2);

    // Another person cannot take 2; 3 goes to Bia.
    let (result, _) = one(
        &app,
        &secret,
        Uuid::new_v4(),
        reserve(Uuid::new_v4(), 2, 3, "Bia", tomorrow()),
    )
    .await;
    assert_eq!(result["outcome"], "partial");
    assert_eq!(result["problems"][0]["reason"], "reserved");
    assert_eq!(result["problems"][0]["holder"], "Ana");
    assert_eq!(
        result["problems"][0]["numbers"],
        json!([{ "first": 2, "last": 2 }])
    );

    // A reservation id belongs to its seller: another seller cannot join it with their numbers.
    let joao = link(&app, &token, &s.joao).await;
    let (result, _) = one(
        &app,
        &joao,
        Uuid::new_v4(),
        reserve(ana, 11, 11, "Ana", tomorrow()),
    )
    .await;
    assert_eq!(result["outcome"], "rejected");
    assert_eq!(result["problems"][0]["reason"], "invalid");

    // Selling 2 without knowing it was reserved is a conflict; selling the reservation works.
    let (result, _) = one(&app, &secret, Uuid::new_v4(), mark(2, 2, Some("Caio"))).await;
    assert_eq!(result["outcome"], "rejected");
    assert_eq!(result["problems"][0]["reason"], "reserved");
    let mut sell = mark(1, 1, Some("Ana"));
    sell["reservationId"] = json!(ana);
    let (result, view) = one(&app, &secret, Uuid::new_v4(), sell).await;
    assert_eq!(result["outcome"], "applied");
    assert_eq!(counts(&view), (1, 7, 2));
    assert_eq!(view["sales"][0]["buyerName"], "Ana");
    let ana_left = view["reservations"]
        .as_array()
        .unwrap()
        .iter()
        .find(|item| item["id"] == ana.to_string())
        .unwrap();
    assert_eq!(ana_left["numbers"], json!([{ "first": 2, "last": 2 }]));

    // Giving it up frees 2; giving it up again is fine.
    for _ in 0..2 {
        let (result, view) = one(
            &app,
            &secret,
            Uuid::new_v4(),
            json!({ "kind": "cancel_reservation", "reservationId": ana }),
        )
        .await;
        assert_eq!(result["outcome"], "applied");
        assert_eq!(counts(&view), (1, 8, 1));
    }

    // A return clears the reservation of what came back (Bia's 3).
    let reply = app
        .post(
            &format!("/api/sellers/{}/returns", s.maria),
            &token,
            json!({ "ranges": [{ "first": 3, "last": 3 }], "reason": "unsold", "note": null }),
        )
        .await;
    assert_eq!(reply.status, StatusCode::CREATED);
    let view = sync(&app, &secret, json!([])).await.json()["view"].clone();
    assert_eq!(counts(&view), (1, 8, 0));
    assert_eq!(view["summary"]["unsold"], 1);
    assert_eq!(view["reservations"], json!([]));
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn reservations_expire_by_themselves(pool: PgPool) {
    let app = TestApp::new(pool.clone()).await;
    let token = app.login("banda@exemplo.com").await;
    let s = setup(&app, &token).await;
    let secret = link(&app, &token, &s.maria).await;

    // Deadlines in the past or after the event are refused.
    let (result, _) = one(
        &app,
        &secret,
        Uuid::new_v4(),
        reserve(
            Uuid::new_v4(),
            4,
            4,
            "Ana",
            OffsetDateTime::now_utc() - Duration::minutes(1),
        ),
    )
    .await;
    assert_eq!(result["outcome"], "rejected");
    assert_eq!(result["problems"][0]["reason"], "expired");
    let after = OffsetDateTime::parse("2026-11-21T03:01:00-03:00", &Rfc3339).unwrap();
    let (result, _) = one(
        &app,
        &secret,
        Uuid::new_v4(),
        reserve(Uuid::new_v4(), 4, 4, "Ana", after),
    )
    .await;
    assert_eq!(result["problems"][0]["reason"], "invalid");

    let ana = Uuid::new_v4();
    one(
        &app,
        &secret,
        Uuid::new_v4(),
        reserve(ana, 4, 5, "Ana", tomorrow()),
    )
    .await;
    // The deadline passes: the numbers are free again, the reservation still shows as expired.
    sqlx::query(
        "update ticket_reservations set expires_at = now() - interval '1 hour' where reservation_id = $1",
    )
    .bind(ana)
    .execute(&pool)
    .await
    .unwrap();
    let view = sync(&app, &secret, json!([])).await.json()["view"].clone();
    assert_eq!(counts(&view), (0, 10, 0));
    assert_eq!(view["reservations"][0]["active"], false);
    assert_eq!(
        report_row(&app, &token, &s.event, &s.maria).await["reserved"],
        0
    );
    // Someone else may reserve 5 now; the late payer still gets 4 by selling the reservation.
    let (result, _) = one(
        &app,
        &secret,
        Uuid::new_v4(),
        reserve(Uuid::new_v4(), 5, 5, "Bia", tomorrow()),
    )
    .await;
    assert_eq!(result["outcome"], "applied");
    let mut sell = mark(4, 5, Some("Ana"));
    sell["reservationId"] = json!(ana);
    let (result, view) = one(&app, &secret, Uuid::new_v4(), sell).await;
    assert_eq!(result["outcome"], "partial");
    assert_eq!(result["problems"][0]["holder"], "Bia");
    assert_eq!(counts(&view), (1, 8, 1));
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn a_change_sent_twice_is_done_once(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("banda@exemplo.com").await;
    let s = setup(&app, &token).await;
    let secret = link(&app, &token, &s.maria).await;

    // A queue of three changes; the answer is "lost" and the phone sends it again.
    let first = Uuid::new_v4();
    let ops = json!([
        { "id": first, "op": mark(5, 6, Some("Ana")) },
        { "id": Uuid::new_v4(), "op": { "kind": "unmark", "number": 6 } },
        { "id": Uuid::new_v4(), "op": mark(7, 7, None) },
    ]);
    let once = sync(&app, &secret, ops.clone()).await.json();
    let twice = sync(&app, &secret, ops).await.json();
    assert_eq!(once["results"], twice["results"]);
    assert_eq!(counts(&twice["view"]), (2, 8, 0));
    let sold: Vec<i64> = twice["view"]["sales"]
        .as_array()
        .unwrap()
        .iter()
        .map(|sale| sale["number"].as_i64().unwrap())
        .collect();
    assert_eq!(
        sold,
        [5, 7],
        "6 stays undone: the first change is not redone"
    );

    // Another phone sold 5 to Bia meanwhile: a conflict naming the sale kept.
    let (result, view) = one(&app, &secret, Uuid::new_v4(), mark(5, 5, Some("Bia"))).await;
    assert_eq!(result["outcome"], "rejected");
    assert_eq!(result["problems"][0]["reason"], "already_sold");
    assert_eq!(result["problems"][0]["holder"], "Ana");
    assert_eq!(view["sales"][0]["buyerName"], "Ana");
    // An edit changes the buyer (and clears the phone).
    let mut edit = mark(5, 5, Some("Bia"));
    edit["edit"] = json!(true);
    let (result, view) = one(&app, &secret, Uuid::new_v4(), edit).await;
    assert_eq!(result["outcome"], "applied");
    assert_eq!(view["sales"][0]["buyerName"], "Bia");

    // Numbers taken back or returned are explained, the rest goes through.
    let (result, _) = one(&app, &secret, Uuid::new_v4(), mark(9, 11, None)).await;
    assert_eq!(result["outcome"], "partial");
    assert_eq!(result["problems"][0]["reason"], "not_held");
    assert_eq!(
        result["problems"][0]["numbers"],
        json!([{ "first": 11, "last": 11 }])
    );

    // A bad change is rejected as invalid without stopping the queue.
    let reply = sync(
        &app,
        &secret,
        json!([
            { "id": Uuid::new_v4(), "op": mark(8, 8, Some("a\nb")) },
            { "id": Uuid::new_v4(), "op": mark(8, 8, Some("Duda")) },
        ]),
    )
    .await
    .json();
    assert_eq!(reply["results"][0]["problems"][0]["reason"], "invalid");
    assert_eq!(reply["results"][1]["outcome"], "applied");

    // Too many changes at once, or a dead link.
    let many: Vec<Value> = (0..51)
        .map(|_| json!({ "id": Uuid::new_v4(), "op": { "kind": "unmark", "number": 1 } }))
        .collect();
    assert_eq!(
        sync(&app, &secret, json!(many)).await.status,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        sync(&app, "nope", json!([])).await.status,
        StatusCode::NOT_FOUND
    );
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn box_offices_canceled_events_and_maintenance_hold_changes(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let admin = app.login(ADMIN).await;
    let token = app.login("banda@exemplo.com").await;
    let s = setup(&app, &token).await;

    // A box office sells at the door: no reservations, no goal.
    let caio = link(&app, &token, &s.caio).await;
    let (result, view) = one(
        &app,
        &caio,
        Uuid::new_v4(),
        reserve(Uuid::new_v4(), 16, 16, "Ana", tomorrow()),
    )
    .await;
    assert_eq!(result["problems"][0]["reason"], "box_office");
    assert_eq!(view["goal"], Value::Null);
    let reply = app
        .put(
            &format!("/api/sellers/{}/goal", s.caio),
            &token,
            json!({ "goal": 10 }),
        )
        .await;
    assert_eq!(reply.error_code(), "box_office_seller");
    // Turning a seller into a box office drops their goal and reservations.
    let joao = link(&app, &token, &s.joao).await;
    one(
        &app,
        &joao,
        Uuid::new_v4(),
        reserve(Uuid::new_v4(), 11, 11, "Ana", tomorrow()),
    )
    .await;
    app.put(
        &format!("/api/sellers/{}/goal", s.joao),
        &token,
        json!({ "goal": 5 }),
    )
    .await;
    let reply = app
        .put(
            &format!("/api/sellers/{}", s.joao),
            &token,
            json!({ "name": "João Lima", "phone": null, "boxOffice": true }),
        )
        .await;
    assert_eq!(reply.status, StatusCode::NO_CONTENT);
    let view = sync(&app, &joao, json!([])).await.json()["view"].clone();
    assert_eq!(view["reservations"], json!([]));
    assert_eq!(view["goal"], Value::Null);

    // Maintenance holds the queue (the page keeps it); an empty sync still refreshes the page.
    let maria = link(&app, &token, &s.maria).await;
    app.settings(&admin, json!({ "maintenanceMode": "read_only" }))
        .await;
    let reply = sync(
        &app,
        &maria,
        json!([{ "id": Uuid::new_v4(), "op": mark(1, 1, None) }]),
    )
    .await;
    assert_eq!(reply.error_code(), "maintenance");
    assert_eq!(sync(&app, &maria, json!([])).await.status, StatusCode::OK);
    app.settings(&admin, json!({ "maintenanceMode": "off" }))
        .await;

    // A canceled event takes no more sales nor reservations; giving one up still works.
    let ana = Uuid::new_v4();
    one(
        &app,
        &maria,
        Uuid::new_v4(),
        reserve(ana, 1, 1, "Ana", tomorrow()),
    )
    .await;
    let reply = app
        .post(
            &format!("/api/events/{}/cancel", s.event),
            &token,
            json!({ "reason": null }),
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK, "{:?}", reply.json());
    let (result, _) = one(&app, &maria, Uuid::new_v4(), mark(2, 2, None)).await;
    assert_eq!(result["problems"][0]["reason"], "event_canceled");
    let (result, _) = one(
        &app,
        &maria,
        Uuid::new_v4(),
        reserve(Uuid::new_v4(), 3, 3, "Bia", tomorrow()),
    )
    .await;
    assert_eq!(result["problems"][0]["reason"], "event_canceled");
    let (result, view) = one(
        &app,
        &maria,
        Uuid::new_v4(),
        json!({ "kind": "cancel_reservation", "reservationId": ana }),
    )
    .await;
    assert_eq!(result["outcome"], "applied");
    assert_eq!(view["reservations"], json!([]));
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn organizers_manage_reservations_on_the_panel(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("banda@exemplo.com").await;
    let s = setup(&app, &token).await;
    let until = tomorrow().format(&Rfc3339).unwrap();

    let reply = app
        .post(
            &format!("/api/sellers/{}/reservations", s.maria),
            &token,
            json!({ "ranges": [{ "first": 8, "last": 9 }], "holderName": "Ana",
                    "holderPhone": null, "expiresAt": until }),
        )
        .await;
    assert_eq!(reply.status, StatusCode::CREATED, "{:?}", reply.json());
    let created = reply.json();
    assert_eq!(created["byOrganizer"], true);
    assert_eq!(created["sellerId"], s.maria.as_str());
    let id = created["id"].as_str().unwrap().to_owned();

    // All or nothing: 9 is taken, 12 is João's, the box office never reserves.
    for (seller, first, last, code) in [
        (&s.maria, 9, 10, "already_reserved"),
        (&s.maria, 10, 12, "range_not_held"),
        (&s.caio, 16, 16, "box_office_seller"),
    ] {
        let reply = app
            .post(
                &format!("/api/sellers/{seller}/reservations"),
                &token,
                json!({ "ranges": [{ "first": first, "last": last }], "holderName": "Bia",
                        "holderPhone": null, "expiresAt": until }),
            )
            .await;
        assert_eq!(reply.error_code(), code);
    }
    let list = app
        .get(&format!("/api/events/{}/reservations", s.event), &token)
        .await
        .json();
    assert_eq!(list.as_array().unwrap().len(), 1);

    // Selling it marks the sale for Ana in Maria's name.
    let reply = app
        .post(&format!("/api/reservations/{id}/sell"), &token, json!({}))
        .await;
    assert_eq!(reply.status, StatusCode::NO_CONTENT);
    let sales = app
        .get(&format!("/api/events/{}/ticket-sales", s.event), &token)
        .await
        .json();
    assert_eq!(sales.as_array().unwrap().len(), 2);
    assert_eq!(sales[0]["buyerName"], "Ana");
    assert_eq!(sales[0]["sellerId"], s.maria.as_str());
    let reply = app
        .post(&format!("/api/reservations/{id}/sell"), &token, json!({}))
        .await;
    assert_eq!(reply.status, StatusCode::NOT_FOUND);

    // Another organization sees nothing.
    let other = app.login("outra@exemplo.com").await;
    let reply = app
        .post(
            &format!("/api/sellers/{}/reservations", s.maria),
            &other,
            json!({ "ranges": [{ "first": 1, "last": 1 }], "holderName": "X",
                    "holderPhone": null, "expiresAt": until }),
        )
        .await;
    assert_eq!(reply.status, StatusCode::NOT_FOUND);
    let reply = app
        .get(&format!("/api/events/{}/reservations", s.event), &other)
        .await;
    assert_eq!(reply.status, StatusCode::NOT_FOUND);

    // Canceling one.
    let reply = app
        .post(
            &format!("/api/sellers/{}/reservations", s.joao),
            &token,
            json!({ "ranges": [{ "first": 11, "last": 11 }], "holderName": "Bia",
                    "holderPhone": null, "expiresAt": until }),
        )
        .await;
    let id = reply.json()["id"].as_str().unwrap().to_owned();
    let reply = app
        .delete(&format!("/api/reservations/{id}"), &other, None)
        .await;
    assert_eq!(reply.status, StatusCode::NOT_FOUND);
    let reply = app
        .delete(&format!("/api/reservations/{id}"), &token, None)
        .await;
    assert_eq!(reply.status, StatusCode::NO_CONTENT);
    let list = app
        .get(&format!("/api/events/{}/reservations", s.event), &token)
        .await
        .json();
    assert_eq!(list, json!([]));
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn goals_and_the_ranking(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("banda@exemplo.com").await;
    let s = setup(&app, &token).await;
    // A fourth seller without numbers stays out of the ranking.
    app.post(
        &format!("/api/events/{}/sellers", s.event),
        &token,
        json!({ "name": "Duda" }),
    )
    .await;

    // One goal for everyone (the box office aside), then João's own.
    let reply = app
        .post(
            &format!("/api/events/{}/sellers/goals", s.event),
            &token,
            json!({ "goal": 20, "onlyMissing": false }),
        )
        .await;
    assert_eq!(reply.json()["updated"], 3);
    app.put(
        &format!("/api/sellers/{}/goal", s.joao),
        &token,
        json!({ "goal": 4 }),
    )
    .await;
    let reply = app
        .post(
            &format!("/api/events/{}/sellers/goals", s.event),
            &token,
            json!({ "goal": 8, "onlyMissing": true }),
        )
        .await;
    assert_eq!(reply.json()["updated"], 0, "everyone has a goal");
    let reply = app
        .put(
            &format!("/api/sellers/{}/goal", s.maria),
            &token,
            json!({ "goal": 0 }),
        )
        .await;
    assert_eq!(reply.error_code(), "invalid_goal");
    let sellers = app
        .get(&format!("/api/events/{}/sellers", s.event), &token)
        .await
        .json();
    let goals: Vec<Value> = sellers
        .as_array()
        .unwrap()
        .iter()
        .map(|seller| seller["goal"].clone())
        .collect();
    // Caio, Duda, João Lima, Maria Souza.
    assert_eq!(goals, [Value::Null, json!(20), json!(4), json!(20)]);

    // Sales: Maria 3, João 3 (a tie).
    let maria = link(&app, &token, &s.maria).await;
    let joao = link(&app, &token, &s.joao).await;
    one(&app, &maria, Uuid::new_v4(), mark(1, 3, None)).await;
    let (_, view) = one(&app, &joao, Uuid::new_v4(), mark(11, 13, None)).await;
    assert_eq!(view["goal"], 4);
    assert_eq!(view["ranking"], Value::Null, "off by default");

    let reply = app
        .put(
            &format!("/api/events/{}/seller-settings", s.event),
            &token,
            json!({ "ranking": true }),
        )
        .await;
    assert_eq!(
        reply.json(),
        json!({ "sendTickets": true, "ranking": true }),
        "a missing field keeps its value"
    );
    let view = sync(&app, &joao, json!([])).await.json()["view"].clone();
    let ranking = &view["ranking"];
    assert_eq!(ranking["position"], 1);
    assert_eq!(ranking["participants"], 2);
    assert_eq!(
        ranking["top"],
        json!([
            { "position": 1, "name": "João L.", "sold": 3, "you": true },
            { "position": 1, "name": "Maria S.", "sold": 3, "you": false },
        ])
    );
    // The box office sees no ranking.
    let caio = link(&app, &token, &s.caio).await;
    let view = sync(&app, &caio, json!([])).await.json()["view"].clone();
    assert_eq!(view["ranking"], Value::Null);
}

/// "The rest" gives a seller every free number at once: not held by another seller, not
/// cancelled, not sent as a digital ticket by the organization; optionally of one category.
#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn the_box_office_takes_the_remaining_numbers(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let admin = app.login(ADMIN).await;
    let token = app.login("banda@exemplo.com").await;
    let event = app.create_event(&token, "Show").await;
    let batch = app.create_batch(&token, &event, 40).await;
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
    let seller = |name: &'static str, box_office: bool| {
        let (app, token, event) = (&app, &token, &event);
        async move {
            app.post(
                &format!("/api/events/{event}/sellers"),
                token,
                json!({ "name": name, "boxOffice": box_office }),
            )
            .await
            .json()["id"]
                .as_str()
                .unwrap()
                .to_owned()
        }
    };
    let maria = seller("Maria", false).await;
    let caixa = seller("Bilheteria", true).await;
    app.post(
        &format!("/api/sellers/{maria}/ranges"),
        &token,
        json!({ "first": 1, "last": 10 }),
    )
    .await;
    let void = app
        .post(
            &format!("/api/events/{event}/voids"),
            &token,
            json!({ "first": 15, "last": 16, "reason": "lost", "note": null }),
        )
        .await;
    assert_eq!(void.status, StatusCode::CREATED);
    let ticket = app
        .post(
            &format!("/api/events/{event}/tickets"),
            &token,
            json!({ "number": 20, "holderName": "Bia" }),
        )
        .await;
    assert_eq!(ticket.status, StatusCode::CREATED);
    let vip = app
        .post(
            &format!("/api/events/{event}/categories"),
            &token,
            json!({ "name": "VIP", "color": "#ca8a04", "priceCents": 8000 }),
        )
        .await
        .json()["id"]
        .as_str()
        .unwrap()
        .to_owned();
    app.post(
        &format!("/api/categories/{vip}/ranges"),
        &token,
        json!({ "first": 31, "last": 40 }),
    )
    .await;

    let available = app
        .get(&format!("/api/events/{event}/available-numbers"), &token)
        .await
        .json();
    assert_eq!(
        available["ranges"],
        json!([
            { "first": 11, "last": 14 },
            { "first": 17, "last": 19 },
            { "first": 21, "last": 40 }
        ])
    );
    assert_eq!(available["count"], 27);

    // The VIP numbers first, then the rest.
    let only_vip = app
        .post(
            &format!("/api/sellers/{caixa}/ranges/remaining"),
            &token,
            json!({ "categoryId": vip }),
        )
        .await;
    assert_eq!(only_vip.status, StatusCode::CREATED);
    assert_eq!(only_vip.json()[0]["first"], 31);
    let rest = app
        .post(
            &format!("/api/sellers/{caixa}/ranges/remaining"),
            &token,
            json!({}),
        )
        .await;
    assert_eq!(rest.status, StatusCode::CREATED);
    assert_eq!(rest.json().as_array().unwrap().len(), 3);
    let again = app
        .post(
            &format!("/api/sellers/{caixa}/ranges/remaining"),
            &token,
            json!({}),
        )
        .await;
    assert_eq!(again.error_code(), "no_free_numbers");

    // Another organization sees nothing.
    let other = app.login("outra@exemplo.com").await;
    let foreign = app
        .post(
            &format!("/api/sellers/{caixa}/ranges/remaining"),
            &other,
            json!({}),
        )
        .await;
    assert_eq!(foreign.status, StatusCode::NOT_FOUND);
}
