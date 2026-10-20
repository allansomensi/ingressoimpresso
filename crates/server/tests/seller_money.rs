//! Notice to the sellers, commissions and courtesies under control (ADR 0096), and the event's
//! history (ADR 0099).

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

/// An event at R$ 30 with 20 paid tickets; Maria holds 1–10 and João 11–15.
async fn setup(app: &TestApp, token: &str) -> (String, String, String) {
    let admin = app.login(ADMIN).await;
    let event = app.create_event(token, "Show").await;
    let batch = app.create_batch(token, &event, 20).await;
    if batch["status"] != "paid" {
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
        assert!(reply.status.is_success());
    }
    let mut sellers = Vec::new();
    for (name, first, last) in [("Maria", 1, 10), ("João", 11, 15)] {
        let seller = app
            .post(
                &format!("/api/events/{event}/sellers"),
                token,
                json!({ "name": name }),
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
        sellers.push(id);
    }
    let joao = sellers.pop().unwrap();
    let maria = sellers.pop().unwrap();
    (event, maria, joao)
}

fn row<'a>(report: &'a Value, name: &str) -> &'a Value {
    report["sellers"]
        .as_array()
        .unwrap()
        .iter()
        .find(|row| row["seller"] == name)
        .unwrap()
}

async fn report(app: &TestApp, token: &str, event: &str) -> Value {
    let reply = app.get(&format!("/api/events/{event}/report"), token).await;
    assert_eq!(reply.status, StatusCode::OK);
    reply.json()
}

/// The seller's link token.
async fn link(app: &TestApp, token: &str, seller: &str) -> String {
    let reply = app
        .post(&format!("/api/sellers/{seller}/link"), token, json!({}))
        .await;
    assert_eq!(reply.status, StatusCode::CREATED);
    let url = reply.json()["url"].as_str().unwrap().to_owned();
    url.split_once('#').unwrap().1.to_owned()
}

async fn seller_page(app: &TestApp, secret: &str) -> Value {
    let reply = app
        .request(
            Method::POST,
            "/api/seller",
            None,
            Some(json!({ "token": secret })),
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK);
    reply.json()
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn commissions_come_off_the_balance(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("banda@exemplo.com").await;
    let (event, maria, joao) = setup(&app, &token).await;

    // 10% for Maria; R$ 2 per ticket for João.
    let reply = app
        .put(
            &format!("/api/sellers/{maria}/commission"),
            &token,
            json!({ "commission": { "kind": "percent", "value": 1000 } }),
        )
        .await;
    assert_eq!(reply.status, StatusCode::NO_CONTENT);
    app.put(
        &format!("/api/sellers/{joao}/commission"),
        &token,
        json!({ "commission": { "kind": "per_ticket", "value": 200 } }),
    )
    .await;
    // Out of range: refused.
    let reply = app
        .put(
            &format!("/api/sellers/{joao}/commission"),
            &token,
            json!({ "commission": { "kind": "percent", "value": 10001 } }),
        )
        .await;
    assert_eq!(reply.status, StatusCode::BAD_REQUEST);
    assert_eq!(reply.error_code(), "invalid_commission");

    // Maria hands over R$ 100.
    app.post(
        &format!("/api/sellers/{maria}/payments"),
        &token,
        json!({ "amountCents": 10000, "method": "pix", "receivedOn": "2026-10-01", "note": null }),
    )
    .await;

    let data = report(&app, &token, &event).await;
    let maria_row = row(&data, "Maria");
    // 10 × R$ 30 = R$ 300; 10% = R$ 30; owes 300 − 30 − 100.
    assert_eq!(maria_row["amountDueCents"], 30000);
    assert_eq!(maria_row["commissionCents"], 3000);
    assert_eq!(maria_row["balanceCents"], 17000);
    let joao_row = row(&data, "João");
    assert_eq!(joao_row["commissionCents"], 1000);
    assert_eq!(joao_row["balanceCents"], 14000);
    assert_eq!(data["totals"]["commissionCents"], 4000);
    assert_eq!(data["totals"]["balanceCents"], 31000);

    // The seller's own page says the same.
    let secret = link(&app, &token, &maria).await;
    let page = seller_page(&app, &secret).await;
    assert_eq!(page["commission"]["kind"], "percent");
    assert_eq!(page["summary"]["commissionCents"], 3000);
    assert_eq!(page["summary"]["balanceCents"], 17000);

    // The same commission for everyone; the list shows it.
    let reply = app
        .post(
            &format!("/api/events/{event}/sellers/commission"),
            &token,
            json!({ "commission": null }),
        )
        .await;
    assert_eq!(reply.json(), json!(2));
    let sellers = app
        .get(&format!("/api/events/{event}/sellers"), &token)
        .await
        .json();
    assert!(
        sellers
            .as_array()
            .unwrap()
            .iter()
            .all(|seller| seller["commission"].is_null())
    );
    let data = report(&app, &token, &event).await;
    assert!(row(&data, "Maria")["commissionCents"].is_null());
    assert_eq!(row(&data, "Maria")["balanceCents"], 20000);
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn courtesies_are_owed_by_nobody_and_respect_each_limit(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("banda@exemplo.com").await;
    let (event, maria, _joao) = setup(&app, &token).await;

    let reply = app
        .post(
            &format!("/api/events/{event}/courtesy-givers"),
            &token,
            json!({ "name": "Diretora Ana", "quota": 3 }),
        )
        .await;
    assert_eq!(reply.status, StatusCode::CREATED);
    let giver = reply.json()["givers"][0]["id"].as_str().unwrap().to_owned();
    let reply = app
        .post(
            &format!("/api/events/{event}/courtesy-givers"),
            &token,
            json!({ "name": "diretora ana", "quota": null }),
        )
        .await;
    assert_eq!(reply.error_code(), "courtesy_giver_exists");

    // Two of Maria's numbers for the press.
    let reply = app
        .post(
            &format!("/api/events/{event}/courtesies"),
            &token,
            json!({ "giverId": giver, "first": 9, "last": 10, "recipient": "Rádio Cidade", "reason": "Divulgação" }),
        )
        .await;
    assert_eq!(reply.status, StatusCode::CREATED);
    let data = reply.json();
    assert_eq!(data["givers"][0]["given"], 2);
    assert_eq!(data["courtesies"][0]["seller"], "Maria");
    // Beyond the limit, a number that is not paid, one already given: refused.
    for (first, last, code) in [
        (11, 12, "courtesy_quota"),
        (40, 40, "courtesy_not_paid"),
        (10, 10, "already_courtesy"),
    ] {
        let reply = app
            .post(
                &format!("/api/events/{event}/courtesies"),
                &token,
                json!({ "giverId": giver, "first": first, "last": last, "recipient": "Outro" }),
            )
            .await;
        assert_eq!(reply.error_code(), code, "{first}–{last}");
    }
    // The limit never goes below what was given.
    let reply = app
        .put(
            &format!("/api/courtesy-givers/{giver}"),
            &token,
            json!({ "name": "Diretora Ana", "quota": 1 }),
        )
        .await;
    assert_eq!(reply.error_code(), "quota_below_given");

    // Maria no longer owes them: 8 × R$ 30.
    let data = report(&app, &token, &event).await;
    let maria_row = row(&data, "Maria");
    assert_eq!(maria_row["courtesies"], 2);
    assert_eq!(maria_row["amountDueCents"], 24000);
    let secret = link(&app, &token, &maria).await;
    let page = seller_page(&app, &secret).await;
    let lines = page["summary"]["dueLines"].as_array().unwrap();
    assert!(
        lines.iter().any(|line| line["courtesy"] == true
            && line["tickets"] == 2
            && line["priceCents"] == 0)
    );
    assert_eq!(page["summary"]["amountDueCents"], 24000);
    let summary = app
        .get(&format!("/api/events/{event}/accountability"), &token)
        .await
        .json();
    assert_eq!(summary["courtesies"], 2);

    // A giver with courtesies stays; removing them frees the name.
    let reply = app
        .delete(&format!("/api/courtesy-givers/{giver}"), &token, None)
        .await;
    assert_eq!(reply.error_code(), "courtesy_giver_in_use");
    let courtesies = app
        .get(&format!("/api/events/{event}/courtesies"), &token)
        .await
        .json();
    for courtesy in courtesies["courtesies"].as_array().unwrap() {
        let reply = app
            .delete(
                &format!("/api/courtesies/{}", courtesy["id"].as_str().unwrap()),
                &token,
                None,
            )
            .await;
        assert_eq!(reply.status, StatusCode::OK);
    }
    let reply = app
        .delete(&format!("/api/courtesy-givers/{giver}"), &token, None)
        .await;
    assert_eq!(reply.status, StatusCode::OK);
    assert_eq!(
        row(&report(&app, &token, &event).await, "Maria")["amountDueCents"],
        30000
    );

    // Another organization sees none of it.
    let stranger = app.login("outra@exemplo.com").await;
    let reply = app
        .get(&format!("/api/events/{event}/courtesies"), &stranger)
        .await;
    assert_eq!(reply.status, StatusCode::NOT_FOUND);
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn the_notice_reaches_every_seller_link(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("banda@exemplo.com").await;
    let (event, maria, _joao) = setup(&app, &token).await;
    let secret = link(&app, &token, &maria).await;
    assert!(seller_page(&app, &secret).await["notice"].is_null());

    let reply = app
        .put(
            &format!("/api/events/{event}/seller-notice"),
            &token,
            json!({ "text": "  Acerto sábado às 10h\r\nna secretaria  " }),
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK);
    assert_eq!(
        reply.json()["notice"]["text"],
        "Acerto sábado às 10h\nna secretaria"
    );
    let page = seller_page(&app, &secret).await;
    assert_eq!(
        page["notice"]["text"],
        "Acerto sábado às 10h\nna secretaria"
    );

    for text in ["x".repeat(281), "a\u{7}b".to_owned()] {
        let reply = app
            .put(
                &format!("/api/events/{event}/seller-notice"),
                &token,
                json!({ "text": text }),
            )
            .await;
        assert_eq!(reply.error_code(), "invalid_notice");
    }
    app.put(
        &format!("/api/events/{event}/seller-notice"),
        &token,
        json!({ "text": "" }),
    )
    .await;
    assert!(seller_page(&app, &secret).await["notice"].is_null());
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn the_history_keeps_what_the_team_changed(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let owner = app.login("banda@exemplo.com").await;
    let event = app.create_event(&owner, "Show").await;
    app.post(
        &format!("/api/events/{event}/team"),
        &owner,
        json!({ "email": "ana@exemplo.com", "name": "Ana", "areas": ["delivery"] }),
    )
    .await;
    app.post(
        &format!("/api/events/{event}/team"),
        &owner,
        json!({ "email": "rui@exemplo.com", "name": null, "areas": ["manage"] }),
    )
    .await;
    let ana = app.login("ana@exemplo.com").await;
    let rui = app.login("rui@exemplo.com").await;

    // Ana adds a seller; her try at the money part fails and leaves no trace.
    let reply = app
        .post(
            &format!("/api/events/{event}/sellers"),
            &ana,
            json!({ "name": "Maria" }),
        )
        .await;
    assert_eq!(reply.status, StatusCode::CREATED);
    let reply = app
        .post(
            &format!("/api/events/{event}/ledger"),
            &ana,
            json!({ "kind": "expense", "description": "Som", "amountCents": 100, "occurredOn": "2026-10-01" }),
        )
        .await;
    assert_eq!(reply.error_code(), "not_your_area");
    // A refused change (a duplicate seller) leaves none either.
    let reply = app
        .post(
            &format!("/api/events/{event}/sellers"),
            &ana,
            json!({ "name": "Maria" }),
        )
        .await;
    assert_eq!(reply.status, StatusCode::CONFLICT);

    // Previews only read: not in the history.
    let history = app
        .get(&format!("/api/events/{event}/activity"), &owner)
        .await
        .json();
    let entries = history["entries"].as_array().unwrap();
    let mine: Vec<&Value> = entries.iter().filter(|e| e["actor"] == "Ana").collect();
    assert_eq!(mine.len(), 1, "{entries:?}");
    assert_eq!(mine[0]["action"], "POST events/{id}/sellers");
    assert_eq!(mine[0]["area"], "delivery");
    assert_eq!(mine[0]["team"], true);
    assert_eq!(mine[0]["email"], "ana@exemplo.com");
    // The owner's own changes (adding the team) are there too.
    assert!(
        entries
            .iter()
            .any(|e| e["action"] == "POST events/{id}/team" && e["team"] == false)
    );

    // The coordination sees it; the rest of the team does not.
    let reply = app
        .get(&format!("/api/events/{event}/activity"), &rui)
        .await;
    assert_eq!(reply.status, StatusCode::OK);
    let reply = app
        .get(&format!("/api/events/{event}/activity"), &ana)
        .await;
    assert_eq!(reply.error_code(), "not_your_area");
}
