//! Sellers' private links (ADR 0053): the organizer creates and revokes them; the seller opens
//! the page without an account and marks what they sold.

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

/// An event at R$ 30: 20 paid tickets and 2 unpaid ones; Maria holds 1–10 and the unpaid 21–22,
/// João holds 11–15.
async fn setup(app: &TestApp, token: &str) -> (String, String, String) {
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
    let unpaid = app.create_batch(token, &event, 2).await;
    assert_eq!(unpaid["status"], "awaiting_payment");
    let mut ids = Vec::new();
    for (name, ranges) in [("Maria", vec![(1, 10), (21, 22)]), ("João", vec![(11, 15)])] {
        let seller = app
            .post(
                &format!("/api/events/{event}/sellers"),
                token,
                json!({ "name": name }),
            )
            .await
            .json();
        let id = seller["id"].as_str().unwrap().to_owned();
        for (first, last) in ranges {
            let reply = app
                .post(
                    &format!("/api/sellers/{id}/ranges"),
                    token,
                    json!({ "first": first, "last": last }),
                )
                .await;
            assert_eq!(reply.status, StatusCode::CREATED);
        }
        ids.push(id);
    }
    let joao = ids.pop().unwrap();
    let maria = ids.pop().unwrap();
    (event, maria, joao)
}

/// Creates a seller's link and returns the token from its fragment.
async fn link(app: &TestApp, token: &str, seller: &str) -> String {
    let reply = app
        .post(&format!("/api/sellers/{seller}/link"), token, json!({}))
        .await;
    assert_eq!(reply.status, StatusCode::CREATED);
    let url = reply.json()["url"].as_str().unwrap().to_owned();
    let (path, secret) = url.split_once('#').unwrap();
    assert!(path.ends_with("/vendedor"));
    secret.to_owned()
}

async fn open(app: &TestApp, secret: &str) -> Reply {
    app.request(
        Method::POST,
        "/api/seller",
        None,
        Some(json!({ "token": secret })),
    )
    .await
}

async fn mark(app: &TestApp, secret: &str, ranges: Value, buyer: Option<&str>) -> Reply {
    app.request(
        Method::POST,
        "/api/seller/sales",
        None,
        Some(json!({ "token": secret, "ranges": ranges, "buyerName": buyer, "buyerPhone": null })),
    )
    .await
}

fn summary(view: &Value) -> (i64, i64, i64, i64) {
    let s = &view["summary"];
    (
        s["tickets"].as_i64().unwrap(),
        s["sold"].as_i64().unwrap(),
        s["available"].as_i64().unwrap(),
        s["unsold"].as_i64().unwrap(),
    )
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn sellers_mark_their_sales_on_their_link(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("banda@exemplo.com").await;
    let (event, maria, joao) = setup(&app, &token).await;
    let secret = link(&app, &token, &maria).await;

    // The page shows only Maria's paid numbers.
    let reply = open(&app, &secret).await;
    assert_eq!(reply.status, StatusCode::OK);
    let view = reply.json();
    assert_eq!(view["seller"], "Maria");
    assert_eq!(view["event"]["name"], "Show");
    assert_eq!(view["ranges"], json!([{ "first": 1, "last": 10 }]));
    assert_eq!(summary(&view), (10, 0, 10, 0));
    assert_eq!(view["summary"]["amountDueCents"], 30000);

    // Marking a few, then one again with another buyer, updates the buyer only.
    let view = mark(
        &app,
        &secret,
        json!([{ "first": 1, "last": 3 }]),
        Some(" Ana "),
    )
    .await
    .json();
    assert_eq!(summary(&view), (10, 3, 7, 0));
    assert_eq!(view["sales"][0]["buyerName"], "Ana");
    let view = mark(
        &app,
        &secret,
        json!([{ "first": 2, "last": 2 }]),
        Some("Bia"),
    )
    .await
    .json();
    assert_eq!(summary(&view), (10, 3, 7, 0));
    assert_eq!(view["sales"][1]["buyerName"], "Bia");
    let view = mark(&app, &secret, json!([{ "first": 3, "last": 3 }]), None)
        .await
        .json();
    assert_eq!(view["sales"][2]["buyerName"], "Ana");

    // Numbers that are not hers, or not paid, are refused.
    for ranges in [
        json!([{ "first": 11, "last": 11 }]),
        json!([{ "first": 21, "last": 21 }]),
    ] {
        let reply = mark(&app, &secret, ranges, None).await;
        assert_eq!(reply.status, StatusCode::BAD_REQUEST);
        assert_eq!(reply.error_code(), "range_not_held");
    }
    let reply = mark(
        &app,
        &secret,
        json!([{ "first": 4, "last": 4 }]),
        Some("a\nb"),
    )
    .await;
    assert_eq!(reply.error_code(), "invalid_buyer_name");

    // The organizer registers 9–10 as returned: they leave her page, and cannot be marked.
    app.post(
        &format!("/api/sellers/{maria}/returns"),
        &token,
        json!({ "ranges": [{ "first": 9, "last": 10 }], "reason": "unsold", "note": null }),
    )
    .await;
    let view = open(&app, &secret).await.json();
    assert_eq!(summary(&view), (10, 3, 5, 2));
    assert_eq!(view["voids"][0]["reason"], "unsold");
    let reply = mark(&app, &secret, json!([{ "first": 9, "last": 9 }]), None).await;
    assert_eq!(reply.status, StatusCode::CONFLICT);
    assert_eq!(reply.error_code(), "already_voided");

    // A mistaken mark is undone.
    let view = app
        .request(
            Method::POST,
            "/api/seller/sales/undo",
            None,
            Some(json!({ "token": secret, "number": 3 })),
        )
        .await
        .json();
    assert_eq!(summary(&view), (10, 2, 6, 2));

    // A returned number loses its mark.
    mark(&app, &secret, json!([{ "first": 4, "last": 4 }]), None).await;
    app.post(
        &format!("/api/sellers/{maria}/returns"),
        &token,
        json!({ "ranges": [{ "first": 4, "last": 4 }], "reason": "lost", "note": null }),
    )
    .await;

    // The organizer sees the marks and the report counts them.
    let sales = app
        .get(&format!("/api/events/{event}/ticket-sales"), &token)
        .await
        .json();
    let numbers: Vec<i64> = sales
        .as_array()
        .unwrap()
        .iter()
        .map(|sale| sale["number"].as_i64().unwrap())
        .collect();
    assert_eq!(numbers, [1, 2]);
    let report = app
        .get(&format!("/api/events/{event}/report"), &token)
        .await
        .json();
    let maria_row = report["sellers"]
        .as_array()
        .unwrap()
        .iter()
        .find(|row| row["seller"] == "Maria")
        .unwrap();
    assert_eq!(maria_row["markedSold"], 2);
    assert_eq!(report["totals"]["markedSold"], 2);

    // Taking a range back from João clears his marks on it.
    let joao_secret = link(&app, &token, &joao).await;
    mark(
        &app,
        &joao_secret,
        json!([{ "first": 11, "last": 12 }]),
        None,
    )
    .await;
    let sellers = app
        .get(&format!("/api/events/{event}/sellers"), &token)
        .await
        .json();
    let joao_row = sellers
        .as_array()
        .unwrap()
        .iter()
        .find(|seller| seller["name"] == "João")
        .unwrap();
    assert!(
        joao_row["link"]["url"]
            .as_str()
            .unwrap()
            .ends_with(&joao_secret)
    );
    let range_id = joao_row["ranges"][0]["id"].as_str().unwrap();
    app.delete(&format!("/api/ranges/{range_id}"), &token, None)
        .await;
    let sales = app
        .get(&format!("/api/events/{event}/ticket-sales"), &token)
        .await
        .json();
    assert_eq!(sales.as_array().unwrap().len(), 2);

    // The account export carries the buyers.
    let export = app.get("/api/account/export", &token).await.json();
    let exported = export["events"][0]["sellers"]
        .as_array()
        .unwrap()
        .iter()
        .find(|seller| seller["name"] == "Maria")
        .unwrap()
        .clone();
    assert_eq!(exported["sales"][0]["buyerName"], "Ana");
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn links_are_replaced_revoked_and_private(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("banda@exemplo.com").await;
    let (event, maria, _) = setup(&app, &token).await;
    let first = link(&app, &token, &maria).await;
    assert_eq!(open(&app, &first).await.status, StatusCode::OK);

    // A new link replaces the old one.
    let second = link(&app, &token, &maria).await;
    assert_ne!(first, second);
    assert_eq!(open(&app, &first).await.status, StatusCode::NOT_FOUND);
    assert_eq!(open(&app, &second).await.status, StatusCode::OK);
    let sellers = app
        .get(&format!("/api/events/{event}/sellers"), &token)
        .await
        .json();
    assert!(sellers[1]["link"]["lastOpenedAt"].is_string());

    // Revoked, it stops working; the list shows no link.
    let reply = app
        .delete(&format!("/api/sellers/{maria}/link"), &token, None)
        .await;
    assert_eq!(reply.status, StatusCode::NO_CONTENT);
    assert_eq!(open(&app, &second).await.status, StatusCode::NOT_FOUND);
    let sellers = app
        .get(&format!("/api/events/{event}/sellers"), &token)
        .await
        .json();
    assert!(sellers[1]["link"].is_null());

    // Made-up tokens find nothing, and another organization sees nothing.
    for secret in ["", "nada", &"x".repeat(200)] {
        assert_eq!(open(&app, secret).await.status, StatusCode::NOT_FOUND);
    }
    let stranger = app.login("outra@exemplo.com").await;
    for reply in [
        app.post(&format!("/api/sellers/{maria}/link"), &stranger, json!({}))
            .await,
        app.delete(&format!("/api/sellers/{maria}/link"), &stranger, None)
            .await,
        app.get(&format!("/api/events/{event}/ticket-sales"), &stranger)
            .await,
    ] {
        assert_eq!(reply.status, StatusCode::NOT_FOUND);
    }
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn maintenance_pauses_marking_but_not_the_page(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let admin = app.login(ADMIN).await;
    let token = app.login("banda@exemplo.com").await;
    let (_, maria, _) = setup(&app, &token).await;
    let secret = link(&app, &token, &maria).await;
    let saved = app
        .settings(&admin, json!({ "maintenanceMode": "read_only" }))
        .await;
    assert_eq!(saved.status, StatusCode::OK);
    assert_eq!(open(&app, &secret).await.status, StatusCode::OK);
    let reply = mark(&app, &secret, json!([{ "first": 1, "last": 1 }]), None).await;
    assert_eq!(reply.status, StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(reply.error_code(), "maintenance");
}

async fn send_ticket(app: &TestApp, secret: &str, number: i32) -> Reply {
    app.request(
        Method::POST,
        "/api/seller/tickets",
        None,
        Some(json!({ "token": secret, "number": number })),
    )
    .await
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn sellers_send_the_digital_ticket_of_a_sale(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("banda@exemplo.com").await;
    let (event, maria, _) = setup(&app, &token).await;
    let secret = link(&app, &token, &maria).await;
    let view = open(&app, &secret).await.json();
    assert_eq!(view["canSendTickets"], true, "on by default");

    // Only a number the seller marked as sold.
    let early = send_ticket(&app, &secret, 3).await;
    assert_eq!(early.error_code(), "ticket_not_sold");
    mark(
        &app,
        &secret,
        json!([{ "first": 3, "last": 3 }]),
        Some("Ana"),
    )
    .await;
    let reply = send_ticket(&app, &secret, 3).await;
    assert_eq!(reply.status, StatusCode::OK, "{:?}", reply.json());
    let view = reply.json();
    let url = view["sales"][0]["ticketUrl"].as_str().unwrap().to_owned();
    assert!(url.starts_with("http://localhost:3000/ingresso#"), "{url}");
    let pass = app
        .request(
            Method::POST,
            "/api/ticket",
            None,
            Some(json!({ "token": url.split_once('#').unwrap().1 })),
        )
        .await
        .json();
    assert_eq!(pass["holderName"], "Ana");

    // Sending again keeps the same link; the panel shows who sent it.
    let again = send_ticket(&app, &secret, 3).await.json();
    assert_eq!(again["sales"][0]["ticketUrl"], url.as_str());
    let links = app
        .get(&format!("/api/events/{event}/tickets"), &token)
        .await
        .json();
    assert_eq!(links["links"].as_array().unwrap().len(), 1);
    assert_eq!(links["links"][0]["seller"], "Maria");

    // Undoing the sale stops the link from opening.
    app.request(
        Method::POST,
        "/api/seller/sales/undo",
        None,
        Some(json!({ "token": secret, "number": 3 })),
    )
    .await;
    let links = app
        .get(&format!("/api/events/{event}/tickets"), &token)
        .await
        .json();
    assert!(links["links"][0]["revokedAt"].is_string());

    // The organizer can turn it off; the team member who cares for tickets too.
    let settings = app
        .get(&format!("/api/events/{event}/seller-settings"), &token)
        .await
        .json();
    assert_eq!(settings["sendTickets"], true);
    let off = app
        .put(
            &format!("/api/events/{event}/seller-settings"),
            &token,
            json!({ "sendTickets": false }),
        )
        .await;
    assert_eq!(off.status, StatusCode::OK);
    mark(&app, &secret, json!([{ "first": 4, "last": 4 }]), None).await;
    let refused = send_ticket(&app, &secret, 4).await;
    assert_eq!(refused.error_code(), "seller_tickets_off");
    assert_eq!(open(&app, &secret).await.json()["canSendTickets"], false);

    let stranger = app.login("outra@exemplo.com").await;
    let hidden = app
        .put(
            &format!("/api/events/{event}/seller-settings"),
            &stranger,
            json!({ "sendTickets": true }),
        )
        .await;
    assert_eq!(hidden.status, StatusCode::NOT_FOUND);
}
