//! Ingresso Impresso API: organizer login (e-mail code or Google), events, designs, batches and
//! their payment (Stripe), sellers, voids, file exports, digital tickets, the door, the report and
//! results, the changelog and the admin tools. See `docs/arquitetura.md` §8.
#![allow(
    clippy::missing_errors_doc,
    reason = "HTTP handlers fail with ApiError, whose variants and status codes are documented once in error.rs"
)]

pub mod api;
pub mod app;
pub mod auth;
pub mod captcha;
pub mod config;
pub mod emails;
pub mod error;
pub mod google;
pub mod jobs;
pub mod keys;
pub mod mail;
pub mod moderation;
pub mod payments;
pub mod platform;
pub mod pricing;
pub mod ratelimit;
pub mod routes;
pub mod state;
mod texts;
pub mod two_factor;

/// Version of the product (ADR 0049): one Semantic Versioning number for the API, the site and
/// the tools, set in `[workspace.package]` and tagged `vX.Y.Z` when it reaches production.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Embedded migrations (`crates/server/migrations`), applied at startup.
pub static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("./migrations");
