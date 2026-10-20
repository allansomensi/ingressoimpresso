//! The admins' file on an organization (ADR 0105): notes, labels and the timeline.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing,
    reason = "test helpers fail loudly by design"
)]

mod common;

use axum::http::StatusCode;
use common::{ADMIN, TestApp};
use serde_json::{Value, json};
use sqlx::PgPool;

async fn organization_of(app: &TestApp, admin: &str, email: &str) -> String {
    let list = app
        .get(&format!("/api/admin/organizations?q={email}"), admin)
        .await
        .json();
    list[0]["id"].as_str().unwrap().to_owned()
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn notes_and_labels_stay_with_the_admins(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let admin = app.login(ADMIN).await;
    let token = app.login("banda@exemplo.com").await;
    app.login("igreja@exemplo.com").await;
    let organization = organization_of(&app, &admin, "banda@exemplo.com").await;

    // Notes: pinned first, edited, deleted.
    let first = app
        .post(
            &format!("/api/admin/organizations/{organization}/notes"),
            &admin,
            json!({ "body": "Ligou pedindo nota fiscal." }),
        )
        .await;
    assert_eq!(first.status, StatusCode::CREATED);
    let first = first.json();
    assert_eq!(first["authorEmail"], ADMIN);
    let pinned = app
        .post(
            &format!("/api/admin/organizations/{organization}/notes"),
            &admin,
            json!({ "body": "  Cliente grande: atender rápido.  ", "pinned": true }),
        )
        .await
        .json();
    assert_eq!(pinned["body"], "Cliente grande: atender rápido.");
    assert_eq!(
        app.post(
            &format!("/api/admin/organizations/{organization}/notes"),
            &admin,
            json!({ "body": "   " }),
        )
        .await
        .error_code(),
        "invalid_organization_note"
    );
    let detail = app
        .get(&format!("/api/admin/organizations/{organization}"), &admin)
        .await
        .json();
    let bodies: Vec<&str> = detail["notes"]
        .as_array()
        .unwrap()
        .iter()
        .map(|note| note["body"].as_str().unwrap())
        .collect();
    assert_eq!(
        bodies,
        [
            "Cliente grande: atender rápido.",
            "Ligou pedindo nota fiscal."
        ]
    );
    let note = first["id"].as_str().unwrap();
    let edited = app
        .put(
            &format!("/api/admin/organization-notes/{note}"),
            &admin,
            json!({ "body": "Ligou pedindo recibo.", "pinned": true }),
        )
        .await
        .json();
    assert_eq!(edited["pinned"], true);
    assert_eq!(
        app.delete(
            &format!("/api/admin/organization-notes/{note}"),
            &admin,
            None
        )
        .await
        .status,
        StatusCode::NO_CONTENT
    );

    // Labels: kept lowercase, once, and searchable.
    let tagged = app
        .put(
            &format!("/api/admin/organizations/{organization}/tags"),
            &admin,
            json!({ "tags": ["VIP", " Banda ", "vip"] }),
        )
        .await;
    assert_eq!(tagged.status, StatusCode::OK);
    assert_eq!(tagged.json()["tags"], json!(["vip", "banda"]));
    let found = app
        .get("/api/admin/organizations?tag=VIP", &admin)
        .await
        .json();
    assert_eq!(found.as_array().unwrap().len(), 1);
    assert_eq!(found[0]["id"], organization);
    let tags = app
        .get("/api/admin/organizations/tags", &admin)
        .await
        .json();
    assert_eq!(
        tags,
        json!([{ "tag": "banda", "count": 1 }, { "tag": "vip", "count": 1 }])
    );
    assert_eq!(
        app.put(
            &format!("/api/admin/organizations/{organization}/tags"),
            &admin,
            json!({ "tags": ["a\u{7}b"] }),
        )
        .await
        .error_code(),
        "invalid_tag"
    );

    // Organizers never reach any of it.
    for uri in [
        format!("/api/admin/organizations/{organization}/timeline"),
        "/api/admin/organizations/tags".to_owned(),
    ] {
        assert_eq!(app.get(&uri, &token).await.status, StatusCode::FORBIDDEN);
    }
    assert_eq!(
        app.post(
            &format!("/api/admin/organizations/{organization}/notes"),
            &token,
            json!({ "body": "oi" }),
        )
        .await
        .status,
        StatusCode::FORBIDDEN
    );
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn the_timeline_tells_the_account_story(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let admin = app.login(ADMIN).await;
    let token = app.login("banda@exemplo.com").await;
    let organization = organization_of(&app, &admin, "banda@exemplo.com").await;
    let event = app.create_event(&token, "Show").await;
    let batch = app.create_batch(&token, &event, 10).await;
    let paid = app
        .post(
            &format!(
                "/api/admin/batches/{}/mark-paid",
                batch["id"].as_str().unwrap()
            ),
            &admin,
            json!({}),
        )
        .await;
    assert_eq!(paid.status, StatusCode::OK);
    app.post(
        &format!("/api/admin/organizations/{organization}/notes"),
        &admin,
        json!({ "body": "Primeiro show." }),
    )
    .await;

    let timeline = app
        .get(
            &format!("/api/admin/organizations/{organization}/timeline"),
            &admin,
        )
        .await;
    assert_eq!(timeline.status, StatusCode::OK);
    let timeline = timeline.json();
    let entries = timeline.as_array().unwrap();
    let kinds: Vec<&str> = entries
        .iter()
        .map(|entry| entry["kind"].as_str().unwrap())
        .collect();
    for kind in [
        "signup",
        "member_joined",
        "login",
        "event_created",
        "batch_created",
        "batch_paid",
        "admin",
        "note",
    ] {
        assert!(kinds.contains(&kind), "{kind} missing in {kinds:?}");
    }
    // Newest first; writing the note is not repeated as an admin action.
    assert!(
        entries
            .windows(2)
            .all(|pair| pair[0]["at"].as_str() >= pair[1]["at"].as_str())
    );
    assert!(
        !entries
            .iter()
            .any(|entry| entry["code"] == "organization_note_create")
    );
    let created: &Value = entries
        .iter()
        .find(|entry| entry["kind"] == "batch_created")
        .unwrap();
    assert_eq!(created["count"], 10);
    assert_eq!(created["eventName"], "Show");
    let paid = entries
        .iter()
        .find(|entry| entry["kind"] == "batch_paid")
        .unwrap();
    assert_eq!(paid["code"], "admin");

    // The next page starts before the last entry.
    let last = entries.last().unwrap()["at"].as_str().unwrap();
    let older = app
        .get(
            &format!(
                "/api/admin/organizations/{organization}/timeline?before={}",
                urlencode(last)
            ),
            &admin,
        )
        .await
        .json();
    assert_eq!(older, json!([]));
    assert_eq!(
        app.get(
            &format!("/api/admin/organizations/{}/timeline", uuid::Uuid::new_v4()),
            &admin
        )
        .await
        .status,
        StatusCode::NOT_FOUND
    );
}

fn urlencode(text: &str) -> String {
    text.replace('+', "%2B").replace(':', "%3A")
}
