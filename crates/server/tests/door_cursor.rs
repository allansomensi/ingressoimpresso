//! Door sync cursor (ADR 0006). In its own test binary: it holds a write transaction open, and
//! transaction ids are shared by every database of the cluster, so it would hold back the
//! cursor of tests running in parallel.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing,
    reason = "test helpers fail loudly by design"
)]

mod common;

use common::TestApp;
use common::door::{create_link, manifest, register, scan, sync_entries, upload};
use sqlx::PgPool;

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn cursor_never_skips_a_late_commit(pool: PgPool) {
    let app = TestApp::new(pool.clone()).await;
    let token = app.login("banda@exemplo.com").await;
    let event = app.create_event(&token, "Show").await;
    let (_, access_token) = create_link(&app, &token, &event).await;
    let door = register(&app, &access_token, "Porta").await;
    let cursor = manifest(&app, &door, None).await["cursor"]
        .as_str()
        .unwrap()
        .to_owned();

    // A slow transaction takes its transaction id first and commits last.
    let event_id: uuid::Uuid = event.parse().unwrap();
    let device_id: uuid::Uuid = door.id.parse().unwrap();
    let mut slow = pool.begin().await.unwrap();
    sqlx::query(
        "insert into scans (id, event_id, device_id, ticket_number, local_outcome, scanned_at, server_class)
         values ($1, $2, $3, 7, 'admitted', now(), 'first_entry')",
    )
    .bind(uuid::Uuid::new_v4())
    .bind(event_id)
    .bind(device_id)
    .execute(&mut *slow)
    .await
    .unwrap();
    upload(
        &app,
        &door,
        vec![scan(
            "00000000-0000-4000-8000-0000000000d1",
            Some(8),
            "admitted",
            0,
        )],
        false,
    )
    .await;

    // The quick commit is held back while the slow one is open...
    let held = manifest(&app, &door, Some(&cursor)).await;
    assert!(held["entries"].as_array().unwrap().is_empty());
    slow.commit().await.unwrap();
    // ...and both arrive once it commits.
    let (both, _) = sync_entries(&app, &door, held["cursor"].as_str().unwrap(), 2).await;
    assert_eq!(both, [(7, "Porta".to_owned()), (8, "Porta".to_owned())]);
}
