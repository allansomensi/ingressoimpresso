//! An event's team (ADR 0055): people added by e-mail see the event and change only what they
//! take care of.

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

async fn add(app: &TestApp, token: &str, event: &str, email: &str, areas: Value) -> Reply {
    app.post(
        &format!("/api/events/{event}/team"),
        token,
        json!({ "email": email, "name": null, "areas": areas }),
    )
    .await
}

fn event_in(list: &Value, event: &str) -> Option<Value> {
    list.as_array()
        .unwrap()
        .iter()
        .find(|item| item["id"] == event)
        .cloned()
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn a_member_sees_the_event_and_changes_only_their_part(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let owner = app.login("banda@exemplo.com").await;
    let event = app.create_event(&owner, "Show").await;
    let seller = app
        .post(
            &format!("/api/events/{event}/sellers"),
            &owner,
            json!({ "name": "Maria" }),
        )
        .await
        .json();
    let seller = seller["id"].as_str().unwrap().to_owned();

    // Added before having an account: the invite e-mail says where to sign in.
    let reply = app
        .post(
            &format!("/api/events/{event}/team"),
            &owner,
            json!({ "email": " Ana@Exemplo.com ", "name": "Ana", "areas": ["money"] }),
        )
        .await;
    assert_eq!(reply.status, StatusCode::CREATED);
    let added = reply.json();
    assert_eq!(added["member"]["email"], "ana@exemplo.com");
    assert_eq!(added["member"]["joined"], false);
    assert_eq!(added["emailed"], true);
    assert!(
        added["signInUrl"]
            .as_str()
            .unwrap()
            .ends_with("/entrar?email=ana@exemplo.com")
    );
    {
        let sent = app.sent.lock().unwrap();
        let invite = sent.last().unwrap();
        assert_eq!(invite.to, "ana@exemplo.com");
        assert_eq!(invite.subject, "Você está na equipe de Show");
        assert!(invite.body.contains("Recebimentos"));
    }

    // Signing in links the invite: the event is in her list, marked as a team event.
    let ana = app.login("ana@exemplo.com").await;
    let events = app.get("/api/events", &ana).await.json();
    let listed = event_in(&events, &event).unwrap();
    assert_eq!(listed["team"]["areas"], json!(["money"]));
    assert_eq!(listed["team"]["organization"], "banda@exemplo.com");
    assert!(
        event_in(&app.get("/api/events", &owner).await.json(), &event).unwrap()["team"].is_null()
    );
    let detail = app.get(&format!("/api/events/{event}"), &ana).await.json();
    assert_eq!(detail["team"]["areas"], json!(["money"]));
    assert_eq!(detail["supportAccess"], false);

    // She reads everything and records money...
    for path in ["sellers", "report", "batches", "design", "door"] {
        let reply = app.get(&format!("/api/events/{event}/{path}"), &ana).await;
        assert_eq!(reply.status, StatusCode::OK, "{path}");
    }
    let reply = app
        .post(
            &format!("/api/sellers/{seller}/payments"),
            &ana,
            json!({ "amountCents": 3000, "method": "pix", "receivedOn": "2026-10-10", "note": null }),
        )
        .await;
    assert_eq!(reply.status, StatusCode::CREATED);

    // ...but nothing else.
    for reply in [
        app.post(
            &format!("/api/events/{event}/sellers"),
            &ana,
            json!({ "name": "João" }),
        )
        .await,
        app.post(
            &format!("/api/events/{event}/door/accesses"),
            &ana,
            json!({ "label": "Porta" }),
        )
        .await,
        add(&app, &ana, &event, "bia@exemplo.com", json!(["art"])).await,
    ] {
        assert_eq!(reply.status, StatusCode::FORBIDDEN);
        assert_eq!(reply.error_code(), "not_your_area");
    }
    for reply in [
        app.delete(&format!("/api/events/{event}"), &ana, None)
            .await,
        app.put(
            &format!("/api/events/{event}/status"),
            &ana,
            json!({ "status": "closed" }),
        )
        .await,
        app.post(&format!("/api/events/{event}/duplicate"), &ana, json!({}))
            .await,
    ] {
        assert_eq!(reply.status, StatusCode::FORBIDDEN);
    }

    // The team list shows who is who.
    let team = app
        .get(&format!("/api/events/{event}/team"), &ana)
        .await
        .json();
    assert_eq!(team["canManage"], false);
    assert_eq!(team["owners"][0]["email"], "banda@exemplo.com");
    assert_eq!(team["members"][0]["joined"], true);
    assert_eq!(team["members"][0]["you"], true);
    assert_eq!(team["members"][0]["name"], "Ana");
    let owner_view = app
        .get(&format!("/api/events/{event}/team"), &owner)
        .await
        .json();
    assert_eq!(owner_view["canManage"], true);
    assert_eq!(owner_view["members"][0]["you"], false);

    // She leaves, and the event is gone for her.
    let reply = app
        .post(&format!("/api/events/{event}/team/leave"), &ana, json!({}))
        .await;
    assert_eq!(reply.status, StatusCode::NO_CONTENT);
    assert_eq!(
        app.get(&format!("/api/events/{event}"), &ana).await.status,
        StatusCode::NOT_FOUND
    );
    assert!(event_in(&app.get("/api/events", &ana).await.json(), &event).is_none());
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn coordinators_manage_the_team(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let owner = app.login("banda@exemplo.com").await;
    let event = app.create_event(&owner, "Show").await;
    let bia = app.login("bia@exemplo.com").await;

    // An existing account gets a notification and sees the event at once.
    let reply = add(
        &app,
        &owner,
        &event,
        "bia@exemplo.com",
        json!(["art", "manage"]),
    )
    .await;
    assert_eq!(reply.status, StatusCode::CREATED);
    let added = reply.json();
    assert_eq!(added["member"]["joined"], true);
    assert_eq!(added["member"]["areas"], json!(["manage"]));
    let inbox = app.get("/api/inbox", &bia).await.json();
    assert_eq!(inbox["notifications"][0]["kind"], "team_added");
    assert_eq!(inbox["notifications"][0]["data"]["event"], "Show");

    // Coordination changes the event and the team, but does not delete the event.
    let reply = app
        .put(
            &format!("/api/events/{event}"),
            &bia,
            json!({
                "name": "Show novo", "venue": null, "ticketPriceCents": 2500,
                "startsAt": "2030-05-01T20:00:00-03:00", "endsAt": "2030-05-01T23:00:00-03:00"
            }),
        )
        .await;
    assert_eq!(
        reply.status,
        StatusCode::OK,
        "{}",
        String::from_utf8_lossy(&reply.bytes)
    );
    let reply = add(
        &app,
        &bia,
        &event,
        "caio@exemplo.com",
        json!(["door", "delivery", "door"]),
    )
    .await;
    assert_eq!(reply.status, StatusCode::CREATED);
    let caio = reply.json()["member"].clone();
    assert_eq!(caio["areas"], json!(["delivery", "door"]));
    let caio_id = caio["id"].as_str().unwrap();
    let reply = app
        .put(
            &format!("/api/team-members/{caio_id}"),
            &bia,
            json!({ "name": "Caio", "areas": ["door"] }),
        )
        .await;
    assert_eq!(reply.json()["areas"], json!(["door"]));
    assert_eq!(
        app.delete(&format!("/api/events/{event}"), &bia, None)
            .await
            .status,
        StatusCode::FORBIDDEN
    );

    // Refusals: the owner, a repeated e-mail, no area, a bad name.
    for (email, areas, code) in [
        ("banda@exemplo.com", json!(["art"]), "already_owner"),
        ("CAIO@exemplo.com", json!(["art"]), "already_on_team"),
        ("dani@exemplo.com", json!([]), "invalid_team_areas"),
        ("dani", json!(["art"]), "invalid_email"),
    ] {
        let reply = add(&app, &owner, &event, email, areas).await;
        assert_eq!(reply.error_code(), code, "{email}");
    }

    // Another organization sees nothing of the team.
    let stranger = app.login("outra@exemplo.com").await;
    for reply in [
        app.get(&format!("/api/events/{event}/team"), &stranger)
            .await,
        app.put(
            &format!("/api/team-members/{caio_id}"),
            &stranger,
            json!({ "name": null, "areas": ["art"] }),
        )
        .await,
        app.delete(&format!("/api/team-members/{caio_id}"), &stranger, None)
            .await,
        app.post(
            &format!("/api/events/{event}/team/leave"),
            &stranger,
            json!({}),
        )
        .await,
    ] {
        assert_eq!(reply.status, StatusCode::NOT_FOUND);
    }

    // A duplicate keeps the team; removing someone takes the event away from them.
    let copy = app
        .post(&format!("/api/events/{event}/duplicate"), &owner, json!({}))
        .await
        .json();
    let copy = copy["id"].as_str().unwrap().to_owned();
    let copied = app
        .get(&format!("/api/events/{copy}/team"), &owner)
        .await
        .json();
    assert_eq!(copied["members"].as_array().unwrap().len(), 2);
    let bia_id = added["member"]["id"].as_str().unwrap();
    let reply = app
        .delete(&format!("/api/team-members/{bia_id}"), &owner, None)
        .await;
    assert_eq!(reply.status, StatusCode::NO_CONTENT);
    assert_eq!(
        app.get(&format!("/api/events/{event}"), &bia).await.status,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        app.get(&format!("/api/events/{copy}"), &bia).await.status,
        StatusCode::OK
    );
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn invited_people_get_in_while_sign_ups_are_closed(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let admin = app.login(ADMIN).await;
    let owner = app.login("banda@exemplo.com").await;
    let event = app.create_event(&owner, "Show").await;
    app.settings(&admin, json!({ "registrationsOpen": false }))
        .await;
    let code = |email: &str| {
        app.request(
            Method::POST,
            "/api/auth/code",
            None,
            Some(json!({ "email": email })),
        )
    };
    assert_eq!(
        code("nova@exemplo.com").await.error_code(),
        "registrations_closed"
    );
    add(&app, &owner, &event, "nova@exemplo.com", json!(["door"])).await;
    let nova = app.login("nova@exemplo.com").await;
    assert_eq!(
        app.get(&format!("/api/events/{event}"), &nova).await.status,
        StatusCode::OK
    );
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn sellers_see_who_receives_their_money(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let owner = app.login("banda@exemplo.com").await;
    let event = app.create_event(&owner, "Show").await;
    let seller = app
        .post(
            &format!("/api/events/{event}/sellers"),
            &owner,
            json!({ "name": "Maria" }),
        )
        .await
        .json();
    let seller = seller["id"].as_str().unwrap();
    app.post(
        &format!("/api/events/{event}/team"),
        &owner,
        json!({ "email": "ana@exemplo.com", "name": "Ana", "areas": ["money"] }),
    )
    .await;
    // Without a name the person is not shown to sellers (their e-mail stays private).
    add(&app, &owner, &event, "bia@exemplo.com", json!(["money"])).await;
    add(&app, &owner, &event, "caio@exemplo.com", json!(["art"])).await;
    let link = app
        .post(&format!("/api/sellers/{seller}/link"), &owner, json!({}))
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
    assert_eq!(view["receivers"], json!(["Ana"]));
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn deleting_an_account_leaves_every_team(pool: PgPool) {
    let app = TestApp::new(pool.clone()).await;
    let owner = app.login("banda@exemplo.com").await;
    let event = app.create_event(&owner, "Show").await;
    add(&app, &owner, &event, "ana@exemplo.com", json!(["art"])).await;
    let ana = app.login("ana@exemplo.com").await;
    let export = app.get("/api/account/export", &ana).await.json();
    assert_eq!(export["teams"][0]["event"], "Show");
    let owner_export = app.get("/api/account/export", &owner).await.json();
    assert_eq!(
        owner_export["events"][0]["team"][0]["email"],
        "ana@exemplo.com"
    );
    let reply = app
        .delete(
            "/api/account",
            &ana,
            Some(json!({ "email": "ana@exemplo.com" })),
        )
        .await;
    assert_eq!(reply.status, StatusCode::NO_CONTENT);
    let left = sqlx::query_scalar!(r#"select count(*) as "count!" from event_team"#)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(left, 0);
}
