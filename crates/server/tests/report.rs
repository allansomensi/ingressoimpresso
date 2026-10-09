//! Seller report (phase 5): settlement per seller and door activity.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing,
    reason = "test helpers fail loudly by design"
)]

mod common;

use axum::http::{Method, StatusCode};
use common::door::{create_link, register, scan, upload};
use common::{ADMIN, TestApp};
use serde_json::{Value, json};
use sqlx::PgPool;

fn id(suffix: u32) -> String {
    format!("00000000-0000-4000-8000-{suffix:012}")
}

fn line(row: &Value) -> Vec<i64> {
    [
        "tickets",
        "unsold",
        "lost",
        "revoked",
        "declaredSold",
        "entries",
        "offlineDuplicates",
        "blockedCopies",
        "voidEntries",
        "amountDueCents",
    ]
    .iter()
    .map(|key| row[*key].as_i64().unwrap())
    .collect()
}

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn report_settles_sellers_and_counts_the_door(pool: PgPool) {
    let app = TestApp::new(pool).await;
    let token = app.login("banda@exemplo.com").await;
    let admin = app.login(ADMIN).await;
    let event = app.create_event(&token, "Show").await;
    let paid = app
        .post(
            &format!("/api/events/{event}/batches"),
            &token,
            json!({ "quantity": 10 }),
        )
        .await
        .json();
    app.request(
        Method::POST,
        &format!(
            "/api/admin/batches/{}/mark-paid",
            paid["id"].as_str().unwrap()
        ),
        Some(&admin),
        None,
    )
    .await;
    // Unpaid tickets are not settled.
    app.post(
        &format!("/api/events/{event}/batches"),
        &token,
        json!({ "quantity": 2 }),
    )
    .await;
    for (name, range) in [
        ("Maria", Some((1, 4))),
        ("João", Some((5, 8))),
        ("Zeca", None),
    ] {
        let seller = app
            .post(
                &format!("/api/events/{event}/sellers"),
                &token,
                json!({ "name": name }),
            )
            .await
            .json();
        if let Some((first, last)) = range {
            app.post(
                &format!("/api/sellers/{}/ranges", seller["id"].as_str().unwrap()),
                &token,
                json!({ "first": first, "last": last }),
            )
            .await;
        }
    }
    for (number, reason) in [(2, "unsold"), (3, "lost"), (6, "unsold"), (9, "revoked")] {
        app.post(
            &format!("/api/events/{event}/voids"),
            &token,
            json!({ "first": number, "last": number, "reason": reason }),
        )
        .await;
    }

    let (_, access_token) = create_link(&app, &token, &event).await;
    let a = register(&app, &access_token, "Porta A").await;
    let b = register(&app, &access_token, "Porta B").await;
    upload(&app, &a, vec![scan(&id(1), Some(1), "admitted", 0)], true).await;
    // B was offline: its copy of #1 entered.
    upload(&app, &b, vec![scan(&id(2), Some(1), "admitted", 10)], false).await;
    upload(&app, &b, vec![scan(&id(3), Some(5), "admitted", 20)], true).await;
    // A caught a copy of #5 online, then another one locally.
    upload(&app, &a, vec![scan(&id(4), Some(5), "admitted", 30)], true).await;
    upload(
        &app,
        &a,
        vec![
            scan(&id(5), Some(5), "rejected_used", 40),
            scan(&id(6), None, "rejected_invalid", 50),
            scan(&id(7), None, "rejected_other_event", 60),
        ],
        false,
    )
    .await;
    // #3 was lost (voided) but entered through B.
    upload(&app, &b, vec![scan(&id(8), Some(3), "admitted", 70)], false).await;

    let reply = app
        .get(&format!("/api/events/{event}/report"), &token)
        .await;
    assert_eq!(reply.status, StatusCode::OK);
    let report = reply.json();
    assert_eq!(report["ticketPriceCents"], 3000);
    let sellers: Vec<(&str, Vec<i64>)> = report["sellers"]
        .as_array()
        .unwrap()
        .iter()
        .map(|row| (row["seller"].as_str().unwrap(), line(row)))
        .collect();
    //               tickets unsold lost revoked sold entries dup blocked void amount
    assert_eq!(
        sellers,
        [
            ("João", vec![4, 1, 0, 0, 3, 1, 0, 2, 0, 9000]),
            ("Maria", vec![4, 1, 1, 0, 2, 2, 1, 0, 1, 6000]),
            ("Zeca", vec![0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
        ]
    );
    assert_eq!(
        line(&report["unassigned"]),
        [2, 0, 0, 1, 2, 0, 0, 0, 0, 6000]
    );
    assert_eq!(line(&report["totals"]), [10, 2, 1, 1, 7, 3, 1, 2, 1, 21000]);
    assert!(report["totals"]["seller"].is_null());
    assert_eq!(report["invalidScans"], 1);
    assert_eq!(report["otherEventScans"], 1);
    assert_eq!(
        report["devices"],
        json!([
            { "name": "Porta A", "scans": 5, "firstEntries": 1, "offlineDuplicates": 0, "blockedCopies": 2, "invalid": 2 },
            { "name": "Porta B", "scans": 3, "firstEntries": 1, "offlineDuplicates": 1, "blockedCopies": 0, "invalid": 0 },
        ])
    );

    // Another organization cannot read it.
    let stranger = app.login("outra@exemplo.com").await;
    let hidden = app
        .get(&format!("/api/events/{event}/report"), &stranger)
        .await;
    assert_eq!(hidden.status, StatusCode::NOT_FOUND);
}
