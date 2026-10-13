//! Admins reach every resource of every organization (ADR 0079): they find any event, act on the
//! parts addressed by their own id in support mode, rename a series and fix an organization's
//! public profile and logo. Every change is audited; other organizations still get 404.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing,
    reason = "test helpers fail loudly by design"
)]

mod common;

use axum::body::Body;
use axum::http::{Method, Request, StatusCode, header};
use common::{ADMIN, Reply, TestApp};
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

fn png(seed: u8, width: u32, height: u32) -> Vec<u8> {
    let image = image::RgbaImage::from_fn(width, height, |x, y| {
        image::Rgba([(x % 255) as u8, (y % 255) as u8, seed, 200])
    });
    let mut bytes = Vec::new();
    image::DynamicImage::ImageRgba8(image)
        .write_to(
            &mut std::io::Cursor::new(&mut bytes),
            image::ImageFormat::Png,
        )
        .unwrap();
    bytes
}

async fn upload(app: &TestApp, uri: &str, token: &str, bytes: Vec<u8>) -> Reply {
    app.send(
        Request::builder()
            .method(Method::POST)
            .uri(uri)
            .header(header::AUTHORIZATION, format!("Bearer {token}"))
            .header(header::CONTENT_TYPE, "image/png")
            .body(Body::from(bytes))
            .unwrap(),
    )
    .await
}

async fn organization_of(app: &TestApp, admin: &str, query: &str) -> String {
    app.get(&format!("/api/admin/organizations?q={query}"), admin)
        .await
        .json()[0]["id"]
        .as_str()
        .unwrap()
        .to_owned()
}

/// The audit entries of one action, newest first.
async fn audited(app: &TestApp, admin: &str, action: &str) -> Vec<Value> {
    app.get(&format!("/api/admin/audit?action={action}"), admin)
        .await
        .json()["items"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|entry| entry["action"] == action)
        .cloned()
        .collect()
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn admins_find_any_event_and_fix_its_parts(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let admin = app.login(ADMIN).await;
    let token = app.login("banda@exemplo.com").await;
    let other = app.login("outra@exemplo.com").await;
    let event = app.create_event(&token, "Festa Palavrão").await;

    // The search finds it by its name, the organization's member and its id.
    let found = app.get("/api/admin/events?q=palavr", &admin).await;
    assert_eq!(found.status, StatusCode::OK);
    let found = found.json();
    assert_eq!(found.as_array().unwrap().len(), 1);
    assert_eq!(found[0]["id"], event.as_str());
    assert_eq!(found[0]["canceled"], false);
    let organization = found[0]["organizationId"].as_str().unwrap().to_owned();
    assert_eq!(
        app.get("/api/admin/events?q=banda@exemplo", &admin)
            .await
            .json()[0]["id"],
        event.as_str()
    );
    assert_eq!(
        app.get(&format!("/api/admin/events?q={event}"), &admin)
            .await
            .json()[0]["id"],
        event.as_str()
    );
    assert_eq!(
        app.get("/api/admin/events?q=nada%20disso", &admin)
            .await
            .json(),
        json!([])
    );
    assert_eq!(
        app.get("/api/admin/events?q=palavr", &token).await.status,
        StatusCode::FORBIDDEN
    );

    // An improper name is renamed with the organizer's own screen (support mode).
    let mut body = app
        .get(&format!("/api/events/{event}"), &admin)
        .await
        .json();
    body["name"] = json!("Festa");
    let renamed = app.put(&format!("/api/events/{event}"), &admin, body).await;
    assert_eq!(renamed.status, StatusCode::OK);
    assert_eq!(renamed.json()["name"], "Festa");

    // Parts addressed by their own id: a table.
    let tables = app
        .post(
            &format!("/api/events/{event}/tables/bulk"),
            &token,
            json!({ "count": 1, "seats": 4, "shape": "round", "prefix": "Mesa" }),
        )
        .await;
    assert_eq!(tables.status, StatusCode::CREATED);
    let table = app
        .get(&format!("/api/events/{event}/tables"), &admin)
        .await
        .json()[0]["id"]
        .as_str()
        .unwrap()
        .to_owned();
    let table_body = json!({ "name": "Mesa da frente", "seats": 4, "shape": "round" });
    assert_eq!(
        app.put(&format!("/api/tables/{table}"), &other, table_body.clone())
            .await
            .status,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        app.put(&format!("/api/tables/{table}"), &admin, table_body)
            .await
            .status,
        StatusCode::NO_CONTENT
    );

    // A series: renamed by the admin, hidden from another organization.
    let date = app
        .post(
            &format!("/api/events/{event}/dates"),
            &token,
            json!({ "startsAt": "2030-11-21T20:00:00-03:00", "endsAt": "2030-11-21T23:00:00-03:00" }),
        )
        .await;
    assert_eq!(date.status, StatusCode::CREATED);
    let series = date.json()["series"]["id"].as_str().unwrap().to_owned();
    assert_eq!(
        app.put(
            &format!("/api/series/{series}"),
            &other,
            json!({ "name": "Festa" })
        )
        .await
        .status,
        StatusCode::NOT_FOUND
    );
    let renamed = app
        .put(
            &format!("/api/series/{series}"),
            &admin,
            json!({ "name": "Festa da Banda" }),
        )
        .await;
    assert_eq!(renamed.status, StatusCode::OK);
    assert_eq!(renamed.json()["supportAccess"], true);

    // Every change is in the audit log, under the organization.
    let writes = audited(&app, &admin, "support_write").await;
    let paths: Vec<&str> = writes
        .iter()
        .map(|entry| entry["detail"]["path"].as_str().unwrap())
        .collect();
    assert!(paths.contains(&format!("/api/events/{event}").as_str()));
    assert!(paths.contains(&format!("/api/tables/{table}").as_str()));
    assert!(paths.contains(&format!("/api/series/{series}").as_str()));
    assert!(
        writes
            .iter()
            .all(|entry| entry["organizationId"] == organization.as_str())
    );
    // The organizer's own changes are not.
    assert_eq!(writes.len(), 3);
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn admins_fix_any_profile_and_take_an_improper_logo_down(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let admin = app.login(ADMIN).await;
    let token = app.login("banda@exemplo.com").await;
    let other = app.login("outra@exemplo.com").await;
    let organization = organization_of(&app, &admin, "banda").await;
    let profile = format!("/api/admin/organizations/{organization}/profile");
    let logo = format!("{profile}/logo");

    let sent = upload(&app, "/api/account/profile/logo", &token, png(1, 200, 200)).await;
    assert_eq!(sent.status, StatusCode::CREATED);
    let mut body = json!({
        "brandColor": "#112233",
        "whatsapp": "(11) 99999-8888",
        "contactEmail": null,
        "website": null,
        "instagram": "@palavrao",
        "defaultVenue": null,
        "defaultAddress": null,
        "defaultTicketPriceCents": null
    });
    assert_eq!(
        app.put("/api/account/profile", &token, body.clone())
            .await
            .status,
        StatusCode::OK
    );

    // Only admins, and only existing organizations.
    for (token, status) in [
        (&token, StatusCode::FORBIDDEN),
        (&other, StatusCode::FORBIDDEN),
    ] {
        assert_eq!(app.get(&profile, token).await.status, status);
        assert_eq!(app.put(&profile, token, body.clone()).await.status, status);
        assert_eq!(app.delete(&logo, token, None).await.status, status);
    }
    let missing = Uuid::new_v4();
    assert_eq!(
        app.get(
            &format!("/api/admin/organizations/{missing}/profile"),
            &admin
        )
        .await
        .status,
        StatusCode::NOT_FOUND
    );

    let seen = app.get(&profile, &admin).await.json();
    assert_eq!(seen["instagram"], "palavrao");
    assert!(seen["logo"]["id"].is_string());

    // An improper contact is fixed; the audit says which fields changed.
    body["instagram"] = json!("banda");
    let fixed = app.put(&profile, &admin, body).await;
    assert_eq!(fixed.status, StatusCode::OK);
    assert_eq!(fixed.json()["instagram"], "banda");
    assert_eq!(
        app.get("/api/account/profile", &token).await.json()["instagram"],
        "banda"
    );
    let entry = &audited(&app, &admin, "organization_profile_update").await[0];
    assert_eq!(entry["organizationId"], organization.as_str());
    assert_eq!(entry["detail"]["fields"], json!(["instagram"]));

    // An improper logo goes at once and, refused, never comes back.
    let removed = app
        .delete(&format!("{logo}?reject=true"), &admin, None)
        .await;
    assert_eq!(removed.status, StatusCode::OK);
    assert_eq!(removed.json()["logo"], Value::Null);
    let entry = &audited(&app, &admin, "organization_logo_remove").await[0];
    assert_eq!(entry["detail"]["reject"], true);
    assert_eq!(entry["targetId"], seen["logo"]["id"]);
    let again = upload(&app, "/api/account/profile/logo", &token, png(1, 200, 200)).await;
    assert_eq!(again.error_code(), "art_rejected");

    // An admin sends a logo for someone who could not.
    let helped = upload(&app, &logo, &admin, png(2, 120, 120)).await;
    assert_eq!(helped.status, StatusCode::CREATED);
    let helped = helped.json();
    assert!(helped["logo"]["id"].is_string());
    let entry = &audited(&app, &admin, "organization_logo_upload").await[0];
    assert_eq!(entry["targetId"], helped["logo"]["id"]);
    assert_eq!(
        upload(&app, &logo, &other, png(3, 120, 120)).await.status,
        StatusCode::FORBIDDEN
    );

    // Removing without refusing lets the organization send it again.
    let removed = app.delete(&logo, &admin, None).await;
    assert_eq!(removed.status, StatusCode::OK);
    assert_eq!(
        upload(&app, "/api/account/profile/logo", &token, png(2, 120, 120))
            .await
            .status,
        StatusCode::CREATED
    );
}
