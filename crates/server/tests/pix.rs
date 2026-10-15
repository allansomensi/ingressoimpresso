//! Pix "copia e cola" (ADR 0085): keys of the organization and of the sellers, who each number's
//! Pix pays, receipts confirmed by whoever received the money and the settlement with sellers.

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
use common::{ADMIN, Reply, TestApp};
use serde_json::{Value, json};
use sqlx::PgPool;

/// An event at R$ 30 with 20 paid tickets; Maria holds 1–10, João 11–15. A courtesy category
/// holds 19–20.
async fn setup(app: &TestApp, token: &str) -> (String, String, String) {
    let admin = app.login(ADMIN).await;
    let event = app.create_event(token, "Formatura").await;
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
        app.post(
            &format!("/api/sellers/{id}/ranges"),
            token,
            json!({ "first": first, "last": last }),
        )
        .await;
        ids.push(id);
    }
    let courtesy = app
        .post(
            &format!("/api/events/{event}/categories"),
            token,
            json!({ "name": "Cortesia", "color": "#16a34a", "priceCents": 0 }),
        )
        .await
        .json();
    app.post(
        &format!(
            "/api/categories/{}/ranges",
            courtesy["id"].as_str().unwrap()
        ),
        token,
        json!({ "first": 19, "last": 20 }),
    )
    .await;
    let joao = ids.pop().unwrap();
    let maria = ids.pop().unwrap();
    (event, maria, joao)
}

async fn seller_link(app: &TestApp, token: &str, seller: &str) -> String {
    let url = app
        .post(&format!("/api/sellers/{seller}/link"), token, json!({}))
        .await
        .json()["url"]
        .as_str()
        .unwrap()
        .to_owned();
    url.split_once('#').unwrap().1.to_owned()
}

async fn public(app: &TestApp, path: &str, body: Value) -> Reply {
    app.request(Method::POST, path, None, Some(body)).await
}

fn key(key_type: &str, key: &str, name: &str, city: &str) -> Value {
    json!({ "keyType": key_type, "key": key, "name": name, "city": city })
}

fn number(pix: &Value, number: i64) -> &Value {
    pix["numbers"]
        .as_array()
        .unwrap()
        .iter()
        .find(|row| row["number"] == number)
        .unwrap_or_else(|| panic!("number {number} not listed: {pix}"))
}

fn seller_row<'a>(report: &'a Value, name: &str) -> &'a Value {
    report["sellers"]
        .as_array()
        .unwrap()
        .iter()
        .find(|row| row["seller"] == name)
        .unwrap()
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn keys_are_checked_and_normalized(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("formatura@exemplo.com").await;
    assert!(app.get("/api/account/pix", &token).await.json().is_null());

    let cases = [
        (
            key("cpf", "123.456.789-08", "Comissão", "Recife"),
            "invalid_pix_key",
        ),
        (
            key("phone", "+1 415 555 0100", "Comissão", "Recife"),
            "invalid_pix_key",
        ),
        (
            key("email", "a@b.com", &"x".repeat(26), "Recife"),
            "invalid_pix_name",
        ),
        (
            key("email", "a@b.com", "Comissão", "Rio de Janeiro RJ"),
            "invalid_pix_city",
        ),
    ];
    for (body, code) in cases {
        let reply = app.put("/api/account/pix", &token, body).await;
        assert_eq!(reply.error_code(), code);
    }

    let saved = app
        .put(
            "/api/account/pix",
            &token,
            key(
                "cnpj",
                "11.222.333/0001-81",
                " Comissão de Formatura ",
                "Recife",
            ),
        )
        .await;
    assert_eq!(saved.status, StatusCode::OK);
    assert_eq!(
        saved.json(),
        json!({ "keyType": "cnpj", "key": "11222333000181", "name": "Comissão de Formatura", "city": "Recife" })
    );
    assert_eq!(
        app.get("/api/account/pix", &token).await.json()["key"],
        "11222333000181"
    );
    // The rest of the profile stays as it was.
    let profile = app.get("/api/account/profile", &token).await;
    assert_eq!(profile.status, StatusCode::OK);

    let removed = app.delete("/api/account/pix", &token, None).await;
    assert_eq!(removed.status, StatusCode::NO_CONTENT);
    assert!(app.get("/api/account/pix", &token).await.json().is_null());
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn buyers_pay_the_organization_and_it_counts_in_the_settlement(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("formatura@exemplo.com").await;
    let (event, maria, _joao) = setup(&app, &token).await;
    let secret = seller_link(&app, &token, &maria).await;

    // Off by default: no Pix on the seller's page.
    let page = public(&app, "/api/seller", json!({ "token": secret }))
        .await
        .json();
    assert!(page["pix"].is_null());

    app.put(
        "/api/account/pix",
        &token,
        key("email", "Tesouraria@Escola.org.br", "Comissão", "Recife"),
    )
    .await;
    let settings = app
        .put(
            &format!("/api/events/{event}/pix-settings"),
            &token,
            json!({ "receiver": "organization" }),
        )
        .await;
    assert_eq!(settings.status, StatusCode::OK);
    assert_eq!(settings.json()["receiver"], "organization");

    // Maria sells 3 and 4; a digital ticket goes to 16 (no seller) and 19 (a courtesy).
    let sold = public(
        &app,
        "/api/seller/sales",
        json!({ "token": secret, "ranges": [{ "first": 3, "last": 4 }], "buyerName": "Ana" }),
    )
    .await
    .json();
    assert_eq!(sold["pix"]["payee"], "organization");
    assert_eq!(sold["pix"]["account"]["key"], "tesouraria@escola.org.br");
    // The page builds the same payment identifier the panel shows.
    assert_eq!(sold["pix"]["eventId"], event.as_str());
    let mut urls = Vec::new();
    for ticket in [16, 19] {
        let link = app
            .post(
                &format!("/api/events/{event}/tickets"),
                &token,
                json!({ "number": ticket, "holderName": "Bia" }),
            )
            .await;
        assert_eq!(link.status, StatusCode::CREATED, "{:?}", link.json());
        urls.push(link.json()["url"].as_str().unwrap().to_owned());
    }

    let pix = app
        .get(&format!("/api/events/{event}/pix"), &token)
        .await
        .json();
    let listed: Vec<i64> = pix["numbers"]
        .as_array()
        .unwrap()
        .iter()
        .map(|row| row["number"].as_i64().unwrap())
        .collect();
    // The courtesy has nothing to pay.
    assert_eq!(listed, [3, 4, 16]);
    assert_eq!(number(&pix, 3)["amountCents"], 3000);
    assert_eq!(number(&pix, 3)["seller"], "Maria");
    assert_eq!(number(&pix, 3)["buyer"], "Ana");
    assert_eq!(number(&pix, 16)["buyer"], "Bia");
    assert!(number(&pix, 16)["sellerId"].is_null());

    // The digital ticket shows the Pix; the courtesy does not.
    let open = |url: &str| {
        let token = url.split_once('#').unwrap().1.to_owned();
        public(&app, "/api/ticket", json!({ "token": token }))
    };
    let pass = open(&urls[0]).await.json();
    assert_eq!(pass["pix"]["amountCents"], 3000);
    assert_eq!(pass["pix"]["paid"], false);
    assert_eq!(pass["pix"]["account"]["name"], "Comissão");
    assert!(open(&urls[1]).await.json()["pix"].is_null());

    // Only sold or sent numbers can be confirmed.
    let unknown = app
        .post(
            &format!("/api/events/{event}/pix/receipts"),
            &token,
            json!({ "numbers": [7], "paid": true }),
        )
        .await;
    assert_eq!(unknown.error_code(), "pix_number_unknown");
    let confirmed = app
        .post(
            &format!("/api/events/{event}/pix/receipts"),
            &token,
            json!({ "numbers": [3, 16], "paid": true }),
        )
        .await;
    assert_eq!(confirmed.status, StatusCode::OK);
    let confirmed = confirmed.json();
    let receipt = &number(&confirmed, 3)["receipt"];
    assert_eq!(receipt["receivedBy"], "organization");
    assert_eq!(receipt["amountCents"], 3000);
    assert_eq!(open(&urls[0]).await.json()["pix"]["paid"], true);

    // Maria no longer owes ticket 3: the organization has the money.
    let report = app
        .get(&format!("/api/events/{event}/report"), &token)
        .await
        .json();
    let row = seller_row(&report, "Maria");
    assert_eq!(row["pixCents"], 3000);
    assert_eq!(row["receivedCents"], 3000);
    // The Pix of a number of no seller goes to the unassigned line and the totals.
    assert_eq!(report["unassigned"]["pixCents"], 3000);
    assert_eq!(report["totals"]["receivedCents"], 6000);
    let page = public(&app, "/api/seller", json!({ "token": secret }))
        .await
        .json();
    assert_eq!(page["summary"]["pixCents"], 3000);
    assert_eq!(page["summary"]["receivedCents"], 3000);
    let sale = page["sales"]
        .as_array()
        .unwrap()
        .iter()
        .find(|sale| sale["number"] == 3)
        .unwrap();
    assert_eq!(sale["pixReceipt"]["receivedBy"], "organization");

    // The seller cannot confirm money that went to the organization.
    let refused = public(
        &app,
        "/api/seller/pix",
        json!({ "token": secret, "number": 4, "paid": true }),
    )
    .await;
    assert_eq!(refused.error_code(), "pix_not_yours");

    // Undone, the balance comes back.
    app.post(
        &format!("/api/events/{event}/pix/receipts"),
        &token,
        json!({ "numbers": [3], "paid": false }),
    )
    .await;
    let report = app
        .get(&format!("/api/events/{event}/report"), &token)
        .await
        .json();
    assert_eq!(seller_row(&report, "Maria")["receivedCents"], 0);
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn sellers_with_a_key_receive_and_confirm_their_own(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("formatura@exemplo.com").await;
    let (event, maria, joao) = setup(&app, &token).await;
    app.put(
        "/api/account/pix",
        &token,
        key("cpf", "123.456.789-09", "Comissão", "Recife"),
    )
    .await;
    app.put(
        &format!("/api/events/{event}/pix-settings"),
        &token,
        json!({ "receiver": "seller" }),
    )
    .await;
    let saved = app
        .put(
            &format!("/api/sellers/{maria}/pix"),
            &token,
            key("phone", "(81) 98888-7777", "Maria Souza", "Olinda"),
        )
        .await;
    assert_eq!(saved.status, StatusCode::OK);
    assert_eq!(saved.json()["key"], "+5581988887777");
    let sellers = app
        .get(&format!("/api/events/{event}/sellers"), &token)
        .await
        .json();
    let listed = sellers
        .as_array()
        .unwrap()
        .iter()
        .find(|s| s["name"] == "Maria")
        .unwrap();
    assert_eq!(listed["pix"]["name"], "Maria Souza");

    let maria_secret = seller_link(&app, &token, &maria).await;
    let joao_secret = seller_link(&app, &token, &joao).await;
    // Maria's buyers pay her; João has no key: his pay the organization.
    let page = public(&app, "/api/seller", json!({ "token": maria_secret }))
        .await
        .json();
    assert_eq!(page["pix"]["payee"], "seller");
    assert_eq!(page["pix"]["account"]["city"], "Olinda");
    let page = public(&app, "/api/seller", json!({ "token": joao_secret }))
        .await
        .json();
    assert_eq!(page["pix"]["payee"], "organization");

    public(
        &app,
        "/api/seller/sales",
        json!({ "token": maria_secret, "ranges": [{ "first": 2, "last": 2 }] }),
    )
    .await;
    // Not sold yet: nothing to confirm.
    let early = public(
        &app,
        "/api/seller/pix",
        json!({ "token": maria_secret, "number": 5, "paid": true }),
    )
    .await;
    assert_eq!(early.error_code(), "ticket_not_sold");
    let paid = public(
        &app,
        "/api/seller/pix",
        json!({ "token": maria_secret, "number": 2, "paid": true }),
    )
    .await;
    assert_eq!(paid.status, StatusCode::OK);
    let page = paid.json();
    assert_eq!(page["sales"][0]["pixReceipt"]["receivedBy"], "seller");
    // Money Maria received is still hers to hand over: her 10 numbers at R$ 30.
    assert_eq!(page["summary"]["pixCents"], 0);
    assert_eq!(page["summary"]["balanceCents"], 30000);
    let pix = app
        .get(&format!("/api/events/{event}/pix"), &token)
        .await
        .json();
    assert_eq!(number(&pix, 2)["payee"], "seller");
    assert_eq!(number(&pix, 2)["receipt"]["receivedBy"], "seller");

    // She may undo her own confirmation.
    let undone = public(
        &app,
        "/api/seller/pix",
        json!({ "token": maria_secret, "number": 2, "paid": false }),
    )
    .await
    .json();
    assert!(undone["sales"][0]["pixReceipt"].is_null());

    // Without her key, the organization receives again.
    app.delete(&format!("/api/sellers/{maria}/pix"), &token, None)
        .await;
    let page = public(&app, "/api/seller", json!({ "token": maria_secret }))
        .await
        .json();
    assert_eq!(page["pix"]["payee"], "organization");
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn pix_belongs_to_the_money_part_of_the_team(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let owner = app.login("formatura@exemplo.com").await;
    let (event, maria, _) = setup(&app, &owner).await;
    for (email, areas) in [
        ("caixa@exemplo.com", json!(["money"])),
        ("entrega@exemplo.com", json!(["delivery"])),
    ] {
        app.post(
            &format!("/api/events/{event}/team"),
            &owner,
            json!({ "email": email, "name": null, "areas": areas }),
        )
        .await;
    }
    let money = app.login("caixa@exemplo.com").await;
    let delivery = app.login("entrega@exemplo.com").await;
    let settings = json!({ "receiver": "organization" });
    let path = format!("/api/events/{event}/pix-settings");
    assert_eq!(
        app.put(&path, &money, settings.clone()).await.status,
        StatusCode::OK
    );
    assert_eq!(
        app.put(&path, &delivery, settings).await.error_code(),
        "not_your_area"
    );
    let seller_key = key("email", "maria@exemplo.com", "Maria", "Recife");
    let path = format!("/api/sellers/{maria}/pix");
    assert_eq!(
        app.put(&path, &delivery, seller_key.clone())
            .await
            .error_code(),
        "not_your_area"
    );
    assert_eq!(
        app.put(&path, &money, seller_key).await.status,
        StatusCode::OK
    );
    // Everyone on the team reads it.
    assert_eq!(
        app.get(&format!("/api/events/{event}/pix"), &delivery)
            .await
            .status,
        StatusCode::OK
    );
    // A copy of the event keeps who receives and the sellers' keys.
    let copy = app
        .post(&format!("/api/events/{event}/duplicate"), &owner, json!({}))
        .await
        .json();
    let pix = app
        .get(
            &format!("/api/events/{}/pix", copy["id"].as_str().unwrap()),
            &owner,
        )
        .await
        .json();
    assert_eq!(pix["receiver"], "organization");
    let maria = pix["sellers"]
        .as_array()
        .unwrap()
        .iter()
        .find(|s| s["name"] == "Maria")
        .unwrap();
    assert_eq!(maria["account"]["key"], "maria@exemplo.com");
}
