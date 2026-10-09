//! Ingresso Impresso API: organizer login, events, designs, batches and their payment (Stripe),
//! sellers, voids, file exports, the door and the report. See `docs/arquitetura.md` §8.
#![allow(
    clippy::missing_errors_doc,
    reason = "HTTP handlers fail with ApiError, whose variants and status codes are documented once in error.rs"
)]

pub mod api;
pub mod app;
pub mod auth;
pub mod config;
pub mod error;
pub mod jobs;
pub mod keys;
pub mod mail;
pub mod payments;
pub mod pricing;
pub mod routes;
pub mod state;
mod texts;

/// Embedded migrations (`crates/server/migrations`), applied at startup.
pub static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("./migrations");
