//! Announcements by e-mail (ADR 0107): audiences, the queue, the quota share and unsubscribing.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing,
    reason = "test helpers fail loudly by design"
)]

mod common;

use axum::http::{Method, StatusCode};
use common::{ADMIN, TestApp};
use ingressoimpresso_server::mailings::{self, Step};
use ingressoimpresso_server::routes::announcements::queue_due_emails;
use serde_json::{Value, json};
use sqlx::PgPool;

const TITLE: &str = "Novo: ingresso no celular";

async fn announcement(app: &TestApp, admin: &str, publish: bool) -> String {
    let reply = app
        .post(
            "/api/admin/announcements",
            admin,
            json!({
                "title": TITLE,
                "body": "Agora dá para mandar o ingresso pelo WhatsApp.\n\nVeja na aba Digitais.",
                "level": "success",
                "bell": true, "modal": false, "email": null,
                "ctaLabel": "Abrir o painel",
                "ctaUrl": "/painel",
                "publish": publish,
            }),
        )
        .await;
    assert_eq!(reply.status, StatusCode::CREATED);
    reply.json()["id"].as_str().unwrap().to_owned()
}

fn received(app: &TestApp) -> Vec<(String, String)> {
    app.sent
        .lock()
        .unwrap()
        .iter()
        .filter(|mail| mail.subject == TITLE)
        .map(|mail| (mail.to.clone(), mail.body.clone()))
        .collect()
}

fn token_in(text: &str) -> String {
    let start = text.find("/descadastrar#").unwrap() + "/descadastrar#".len();
    text[start..].split_whitespace().next().unwrap().to_owned()
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn announcements_reach_the_audience_once_and_respect_opt_outs(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let admin = app.login(ADMIN).await;
    let banda = app.login("banda@exemplo.com").await;
    app.login("igreja@exemplo.com").await;
    let escola = app.login("escola@exemplo.com").await;
    let off = app
        .put(
            "/api/account/preferences",
            &escola,
            json!({ "announcementEmails": false }),
        )
        .await;
    assert_eq!(off.status, StatusCode::OK);
    assert_eq!(off.json()["announcementEmails"], false);

    // A draft is not e-mailed.
    let draft = announcement(&app, &admin, false).await;
    assert_eq!(
        app.post(
            &format!("/api/admin/announcements/{draft}/email"),
            &admin,
            json!({ "audience": "all" }),
        )
        .await
        .error_code(),
        "announcement_not_published"
    );

    let id = announcement(&app, &admin, true).await;
    let preview = app
        .get(
            &format!("/api/admin/announcements/{id}/email?audience=all"),
            &admin,
        )
        .await;
    assert_eq!(preview.status, StatusCode::OK);
    let preview = preview.json();
    assert_eq!(preview["recipients"], 3);
    assert_eq!(preview["optedOut"], 1);
    assert_eq!(preview["already"], 0);
    assert_eq!(
        app.get(
            &format!("/api/admin/announcements/{id}/email?audience=tagged"),
            &admin,
        )
        .await
        .error_code(),
        "invalid_tag"
    );

    let sent = app
        .post(
            &format!("/api/admin/announcements/{id}/email"),
            &admin,
            json!({ "audience": "all" }),
        )
        .await;
    assert_eq!(sent.status, StatusCode::OK, "{:?}", sent.json());
    assert_eq!(sent.json()["mailing"]["total"], 3);
    assert_eq!(mailings::drain(&app.state).await.unwrap(), Step::Idle);
    // The background sender may still be finishing its last one.
    for _ in 0..50 {
        if received(&app).len() == 3 {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }
    let mut to: Vec<String> = received(&app).into_iter().map(|(to, _)| to).collect();
    to.sort();
    assert_eq!(
        to,
        [ADMIN, "banda@exemplo.com", "igreja@exemplo.com"].map(str::to_owned)
    );
    let listed: Vec<Value> = app
        .get("/api/admin/announcements", &admin)
        .await
        .json()
        .as_array()
        .unwrap()
        .clone();
    let mailing = &listed
        .iter()
        .find(|item| item["id"] == id.as_str())
        .unwrap()["mailing"];
    assert_eq!(mailing["sent"], 3);
    assert_eq!(mailing["pending"], 0);
    assert!(mailing["finishedAt"].is_string());

    // The e-mail carries the button and the way out.
    let (_, text) = received(&app)
        .into_iter()
        .find(|(to, _)| to == "banda@exemplo.com")
        .unwrap();
    assert!(text.contains("Abrir o painel: http"));
    assert!(text.contains("/painel"));
    let token = token_in(&text);

    // Nobody gets it twice.
    assert_eq!(
        app.post(
            &format!("/api/admin/announcements/{id}/email"),
            &admin,
            json!({ "audience": "owners" }),
        )
        .await
        .error_code(),
        "no_recipients"
    );

    // The link stops them with no session, and can undo it; a made-up token does nothing.
    let stopped = app
        .request(
            Method::POST,
            "/api/email/unsubscribe",
            None,
            Some(json!({ "token": token })),
        )
        .await;
    assert_eq!(stopped.status, StatusCode::OK);
    assert_eq!(stopped.json()["email"], "ba•••@exemplo.com");
    assert_eq!(stopped.json()["subscribed"], false);
    assert_eq!(
        app.get("/api/account", &banda).await.json()["announcementEmails"],
        false
    );
    let back = app
        .request(
            Method::POST,
            "/api/email/unsubscribe",
            None,
            Some(json!({ "token": token, "subscribed": true })),
        )
        .await;
    assert_eq!(back.json()["subscribed"], true);
    let one_click = app
        .request(
            Method::POST,
            &format!("/api/email/unsubscribe/{token}"),
            None,
            None,
        )
        .await;
    assert_eq!(one_click.status, StatusCode::OK);
    assert_eq!(
        app.get("/api/account", &banda).await.json()["announcementEmails"],
        false
    );
    assert_eq!(
        app.request(
            Method::POST,
            "/api/email/unsubscribe",
            None,
            Some(json!({ "token": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" })),
        )
        .await
        .status,
        StatusCode::NOT_FOUND
    );

    // Organizers never send.
    assert_eq!(
        app.post(
            &format!("/api/admin/announcements/{id}/email"),
            &banda,
            json!({ "audience": "all" }),
        )
        .await
        .status,
        StatusCode::FORBIDDEN
    );
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn the_quota_share_holds_announcements_and_a_sending_can_stop(pool: PgPool) {
    // A daily limit of 5 is all reserve: announcements wait, codes still go out.
    let app = TestApp::with_settings(pool, &[("MAIL_DAILY_LIMIT", "5")]).await;
    let admin = app.login(ADMIN).await;
    app.login("banda@exemplo.com").await;
    let id = announcement(&app, &admin, true).await;
    let preview = app
        .get(
            &format!("/api/admin/announcements/{id}/email?audience=owners"),
            &admin,
        )
        .await
        .json();
    assert_eq!(preview["dailyBudget"], 0);
    let sent = app
        .post(
            &format!("/api/admin/announcements/{id}/email"),
            &admin,
            json!({ "audience": "owners" }),
        )
        .await
        .json();
    assert_eq!(mailings::drain(&app.state).await.unwrap(), Step::Budget);
    assert_eq!(received(&app).len(), 0);
    assert_eq!(sent["mailing"]["pending"], 2);
    // Another sending of the same announcement waits for this one.
    assert_eq!(
        app.post(
            &format!("/api/admin/announcements/{id}/email"),
            &admin,
            json!({ "audience": "all" }),
        )
        .await
        .error_code(),
        "mailing_in_progress"
    );
    let mailing = sent["mailing"]["id"].as_str().unwrap();
    let canceled = app
        .post(
            &format!("/api/admin/mailings/{mailing}/cancel"),
            &admin,
            json!({}),
        )
        .await;
    assert_eq!(canceled.status, StatusCode::OK);
    let canceled = canceled.json();
    assert!(canceled["mailing"]["canceledAt"].is_string());
    assert_eq!(canceled["mailing"]["skipped"], 2);
    assert_eq!(canceled["mailing"]["pending"], 0);
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn a_test_reaches_the_admin_only(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let admin = app.login(ADMIN).await;
    app.login("banda@exemplo.com").await;
    let id = announcement(&app, &admin, false).await;
    let test = app
        .post(
            &format!("/api/admin/announcements/{id}/email/test"),
            &admin,
            json!({}),
        )
        .await;
    assert_eq!(test.status, StatusCode::NO_CONTENT);
    let sent = app.sent.lock().unwrap().clone();
    let tests: Vec<_> = sent
        .iter()
        .filter(|mail| mail.subject == format!("[Teste] {TITLE}"))
        .collect();
    assert_eq!(tests.len(), 1);
    assert_eq!(tests[0].to, ADMIN);
    assert!(tests[0].html.contains("Parar de receber comunicados"));
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn an_announcement_goes_to_the_channels_chosen(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let admin = app.login(ADMIN).await;
    let banda = app.login("banda@exemplo.com").await;
    let create = |body: Value| {
        let app = &app;
        let admin = admin.clone();
        async move { app.post("/api/admin/announcements", &admin, body).await }
    };
    let base = json!({ "title": TITLE, "body": "Texto.", "level": "info", "publish": true });
    let with = |channels: Value| {
        let mut body = base.clone();
        for (key, value) in channels.as_object().unwrap() {
            body[key] = value.clone();
        }
        body
    };

    // No channel at all is refused.
    let none = create(with(
        json!({ "bell": false, "modal": false, "email": null }),
    ))
    .await;
    assert_eq!(none.status, StatusCode::BAD_REQUEST);
    assert_eq!(none.json()["error"]["code"], "invalid_channels");

    // All three: in the bell, as a dialog, and e-mailed right away to the audience.
    let all = create(with(
        json!({ "bell": true, "modal": true, "email": { "audience": "all" } }),
    ))
    .await;
    assert_eq!(all.status, StatusCode::CREATED);
    let all = all.json();
    assert_eq!(all["email"]["audience"], "all");
    assert_eq!(all["mailing"]["total"], 2);
    assert_eq!(mailings::drain(&app.state).await.unwrap(), Step::Idle);
    assert_eq!(received(&app).len(), 2);
    let inbox = app.get("/api/inbox", &banda).await.json();
    assert_eq!(inbox["announcements"][0]["bell"], true);
    assert_eq!(inbox["announcements"][0]["modal"], true);
    assert_eq!(inbox["unread"], 1);

    // E-mail only: never in the panel. A dialog only: shown, not counted in the bell.
    create(with(
        json!({ "bell": false, "modal": false, "email": { "audience": "owners" } }),
    ))
    .await;
    create(with(json!({ "bell": false, "modal": true, "email": null }))).await;
    let inbox = app.get("/api/inbox", &banda).await.json();
    let shown = inbox["announcements"].as_array().unwrap();
    assert_eq!(shown.len(), 2);
    assert_eq!(inbox["unread"], 1);
    assert!(
        shown
            .iter()
            .any(|item| item["bell"] == false && item["modal"] == true)
    );

    // Scheduled: the e-mail waits for the start, then goes out once.
    let later = time::OffsetDateTime::now_utc() + time::Duration::hours(3);
    let scheduled = create(with(json!({
        "bell": true, "modal": false, "email": { "audience": "all" },
        "startsAt": later.format(&time::format_description::well_known::Rfc3339).unwrap(),
    })))
    .await
    .json();
    assert!(scheduled["mailing"].is_null());
    let id = scheduled["id"].as_str().unwrap();
    sqlx::query(
        "update announcements set starts_at = now() - interval '1 minute' where id = $1::uuid",
    )
    .bind(id)
    .execute(&app.state.pool)
    .await
    .unwrap();
    assert_eq!(queue_due_emails(&app.state).await.unwrap(), 1);
    assert_eq!(queue_due_emails(&app.state).await.unwrap(), 0);
}
