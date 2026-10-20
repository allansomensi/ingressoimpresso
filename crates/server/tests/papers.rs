//! Home printing on ready-made paper (ADR 0102): which papers the design fits, and the file.

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
use serde_json::{Value, json};
use sqlx::PgPool;

async fn paid_event(app: &TestApp, token: &str, kind: &str) -> String {
    let admin = app.login(ADMIN).await;
    let event = app
        .post(
            "/api/events",
            token,
            json!({ "name": "Arraiá", "startsAt": "2026-06-13T21:00:00Z",
                    "endsAt": "2026-06-14T03:00:00Z", "kind": kind }),
        )
        .await
        .json()["id"]
        .as_str()
        .unwrap()
        .to_owned();
    let batch = app.create_batch(token, &event, 25).await;
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

fn fit<'a>(papers: &'a Value, paper: &str) -> &'a Value {
    papers
        .as_array()
        .unwrap()
        .iter()
        .find(|item| item["paper"] == paper)
        .unwrap()
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn a_ticket_lists_the_papers_it_fits(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("banda@exemplo.com").await;
    let event = paid_event(&app, &token, "tickets").await;
    let papers = app
        .get(&format!("/api/events/{event}/papers"), &token)
        .await
        .json();
    assert_eq!(papers.as_array().unwrap().len(), 10);
    // The default ticket (150 × 55 + stub) fits a 210 × 99 strip as it is, not a label.
    assert_eq!(fit(&papers, "perforated3")["scale"], 1.0);
    assert_eq!(fit(&papers, "perforated3")["perSheet"], 3);
    assert_eq!(fit(&papers, "labels21")["scale"], Value::Null);
    assert_eq!(fit(&papers, "labels21")["pieceMm"], json!([63.5, 38.1]));
    assert_eq!(fit(&papers, "plain")["pieceMm"], Value::Null);
    let reply = app
        .post(
            &format!("/api/events/{event}/exports"),
            &token,
            json!({ "kind": "home", "scope": { "type": "all" }, "paper": "labels21" }),
        )
        .await;
    assert_eq!(reply.status, StatusCode::BAD_REQUEST);
    assert_eq!(reply.error_code(), "paper_too_small");
    // Other files ignore the paper.
    let reply = app
        .post(
            &format!("/api/events/{event}/exports"),
            &token,
            json!({ "kind": "print", "scope": { "type": "all" }, "paper": "labels21" }),
        )
        .await;
    assert_eq!(reply.status, StatusCode::ACCEPTED);
    assert_eq!(reply.json()["paper"], "plain");
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn fichas_print_on_a_sheet_of_labels(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("barraca@exemplo.com").await;
    let event = paid_event(&app, &token, "tokens").await;
    let papers = app
        .get(&format!("/api/events/{event}/papers"), &token)
        .await
        .json();
    assert_eq!(fit(&papers, "labels21")["scale"], 1.0);
    let export = app
        .post(
            &format!("/api/events/{event}/exports"),
            &token,
            json!({ "kind": "home", "scope": { "type": "all" }, "paper": "labels21" }),
        )
        .await
        .json();
    assert_eq!(export["paper"], "labels21");
    ingressoimpresso_server::jobs::run_pending(&app.state)
        .await
        .unwrap();
    let done = app
        .get(
            &format!("/api/exports/{}", export["id"].as_str().unwrap()),
            &token,
        )
        .await
        .json();
    assert_eq!(done["status"], "done", "{done}");
    assert_eq!(done["ticketCount"], 25);
    assert_eq!(done["fileName"], "arraia-etiquetas-21.pdf");
}
