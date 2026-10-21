//! Certificates of participation (ADR 0113).

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
use common::door::{AT, create_link, register, scan};
use common::{ADMIN, TestApp};
use serde_json::{Value, json};
use sqlx::PgPool;

async fn paid_event(app: &TestApp, token: &str) -> String {
    let admin = app.login(ADMIN).await;
    let event = app.create_event(token, "Semana de Ciências").await;
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

fn names(overview: &Value) -> Vec<String> {
    overview["participants"]
        .as_array()
        .unwrap()
        .iter()
        .map(|item| item["name"].as_str().unwrap().to_owned())
        .collect()
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn whoever_came_gets_a_certificate_and_a_link(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("escola@exemplo.com").await;
    let event = paid_event(&app, &token).await;
    let url = format!("/api/events/{event}/certificates");

    // Two guests on the list, one of them arrives.
    let mut guest_ids = Vec::new();
    for name in ["Bruno Alves", "Ana Souza"] {
        let reply = app
            .post(&format!("/api/events/{event}/guests"), &token, json!({ "name": name, "companions": 0 }))
            .await;
        assert_eq!(reply.status, StatusCode::CREATED, "{}", String::from_utf8_lossy(&reply.bytes));
        guest_ids.push(reply.json()["id"].as_str().unwrap().to_owned());
    }
    let (_, access) = create_link(&app, &token, &event).await;
    let gate = register(&app, &access, "Portão").await;
    let arrived = app
        .post(
            "/api/door/guests",
            &gate.secret,
            json!({ "arrivals": [{ "id": "00000000-0000-4000-8000-0000000f0001", "guestId": guest_ids[1],
                                   "people": 1, "arrivedAtMs": AT }] }),
        )
        .await;
    assert_eq!(arrived.status, StatusCode::OK);

    // A ticket sold with the buyer's name enters; another one without a name too.
    let seller = app
        .post(&format!("/api/events/{event}/sellers"), &token, json!({ "name": "Duda" }))
        .await
        .json();
    sqlx::query(
        "insert into ticket_sales (event_id, ticket_number, seller_id, buyer_name, buyer_phone) values ($1::uuid, 3, $2::uuid, 'Carla Dias', '51999990000')",
    )
    .bind(&event)
    .bind(seller["id"].as_str().unwrap())
    .execute(&app.state.pool)
    .await
    .unwrap();
    for (id, number) in [("00000000-0000-4000-8000-0000000f0002", 3), ("00000000-0000-4000-8000-0000000f0003", 4)] {
        let reply = app
            .post("/api/door/scans", &gate.secret, json!({ "scans": [scan(id, Some(number), "admitted", 0)], "confirm": false }))
            .await;
        assert_eq!(reply.status, StatusCode::OK);
    }

    // The defaults until saved; who came, by name.
    let overview = app.get(&url, &token).await.json();
    assert_eq!(overview["saved"], false);
    assert_eq!(overview["settings"]["title"], "Certificado de participação");
    assert_eq!(names(&overview), ["Ana Souza", "Carla Dias"]);
    assert_eq!(overview["participants"][1]["phone"], "51999990000");
    assert!(overview["participants"][0]["certificate"].is_null());

    // The words are checked and kept.
    let bad = app
        .put(
            &format!("{url}/settings"),
            &token,
            json!({ "title": "Certificado", "body": "", "workload": null, "signers": [], "color": "#0f766e" }),
        )
        .await;
    assert_eq!(bad.error_code(), "invalid_certificate_body");
    let saved = app
        .put(
            &format!("{url}/settings"),
            &token,
            json!({ "title": "Certificado de presença", "body": "Certificamos que {nome} esteve em {evento}.",
                    "workload": "4 horas", "signers": [{ "name": "Maria Lima", "role": "Diretora" }],
                    "color": "#0F766E" }),
        )
        .await;
    assert_eq!(saved.status, StatusCode::OK, "{}", String::from_utf8_lossy(&saved.bytes));
    let saved = saved.json();
    assert_eq!(saved["saved"], true);
    assert_eq!(saved["settings"]["color"], "#0f766e");
    let sample = app.get(&format!("{url}/sample"), &token).await;
    assert!(sample.bytes.starts_with(b"%PDF"));

    // Made once for everyone who came; making again changes nothing.
    let made = app.post(&format!("{url}/issue"), &token, json!({})).await.json();
    let first = &made["participants"][0]["certificate"];
    assert_eq!(first["code"], "CERT-0001");
    assert_eq!(made["participants"][1]["certificate"]["code"], "CERT-0002");
    let again = app.post(&format!("{url}/issue"), &token, json!({})).await.json();
    assert_eq!(again["participants"][1]["certificate"]["code"], "CERT-0002");

    // The private link: the page and the PDF, without login.
    let link = first["token"].as_str().unwrap();
    let view = app.post("/api/certificates/view", "", json!({ "token": link })).await;
    assert_eq!(view.status, StatusCode::OK);
    let view = view.json();
    assert_eq!(view["name"], "Ana Souza");
    assert_eq!(view["title"], "Certificado de presença");
    assert_eq!(view["workload"], "4 horas");
    let pdf = app.post("/api/certificates/pdf", "", json!({ "token": link })).await;
    assert!(pdf.bytes.starts_with(b"%PDF"));
    // Another signature for the same certificate.
    let flipped = if &link[25..26] == "A" { "B" } else { "A" };
    let forged = format!("{}{flipped}{}", &link[..25], &link[26..]);
    assert_eq!(
        app.post("/api/certificates/view", "", json!({ "token": forged })).await.status,
        StatusCode::NOT_FOUND
    );

    // A typo fixed; the ZIP has one PDF per person.
    let id = first["id"].as_str().unwrap();
    let renamed = app
        .put(&format!("/api/certificates/{id}"), &token, json!({ "name": "Ana Souza Lima" }))
        .await
        .json();
    assert_eq!(names(&renamed)[0], "Ana Souza Lima");
    let zip = app.get(&format!("{url}/zip"), &token).await;
    assert_eq!(zip.status, StatusCode::OK);
    assert!(zip.bytes.starts_with(b"PK"));

    // Deleted: the link stops working.
    let gone = app.delete(&format!("/api/certificates/{id}"), &token, None).await;
    assert_eq!(gone.status, StatusCode::NO_CONTENT);
    assert_eq!(
        app.post("/api/certificates/view", "", json!({ "token": link })).await.status,
        StatusCode::NOT_FOUND
    );

    // Another organization never sees them.
    let other = app.login("outra@exemplo.com").await;
    assert_eq!(app.get(&url, &other).await.status, StatusCode::NOT_FOUND);
}
