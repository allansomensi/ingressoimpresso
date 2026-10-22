//! The database dropping a connection (Neon restarting its compute) is a 503 the panel retries,
//! not a 500 that raises the admins' alert, and the pool checks its other connections.

#![cfg(feature = "test-util")]
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing,
    reason = "test helpers fail loudly by design"
)]

use std::time::Instant;

use axum::http::StatusCode;
use axum::response::IntoResponse;
use ingressoimpresso_server::db_health;
use ingressoimpresso_server::error::ApiError;
use sqlx::PgPool;

#[sqlx::test(migrator = "ingressoimpresso_server::MIGRATOR")]
async fn a_dropped_connection_is_a_503(pool: PgPool) {
    let before = Instant::now();
    let mut victim = pool.acquire().await.unwrap();
    let pid: i32 = sqlx::query_scalar("select pg_backend_pid()")
        .fetch_one(&mut *victim)
        .await
        .unwrap();
    // What Neon does to every connection when its compute stops.
    let killed: bool = sqlx::query_scalar("select pg_terminate_backend($1)")
        .bind(pid)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert!(killed);
    let error = sqlx::query("select 1")
        .execute(&mut *victim)
        .await
        .unwrap_err();
    assert!(db_health::is_dropped_connection(&error), "{error:?}");
    let response = ApiError::from(error).into_response();
    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    // Connections returned to the pool before the drop are pinged before their next use.
    assert!(db_health::dropped_since(before));
    drop(victim);

    // Other database errors keep their meaning.
    let syntax = sqlx::query("select from nowhere at all")
        .execute(&pool)
        .await
        .unwrap_err();
    assert!(!db_health::is_dropped_connection(&syntax));
    assert_eq!(
        ApiError::from(syntax).into_response().status(),
        StatusCode::INTERNAL_SERVER_ERROR
    );
}
