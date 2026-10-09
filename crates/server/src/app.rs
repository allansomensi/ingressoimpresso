//! Router: routes, CORS (ADR 0016), body limits, tracing.

use std::time::Duration;

use axum::Router;
use axum::extract::{DefaultBodyLimit, State};
use axum::http::header::{AUTHORIZATION, CONTENT_DISPOSITION, CONTENT_TYPE};
use axum::http::{HeaderValue, Method, StatusCode};
use axum::routing::{get, post, put};
use tower_http::catch_panic::CatchPanicLayer;
use tower_http::cors::{AllowOrigin, CorsLayer};
use tower_http::trace::TraceLayer;

use crate::auth;
use crate::routes::events::MAX_ART_BYTES;
use crate::routes::{batches, door, events, exports, report, sellers, voids};
use crate::state::AppState;

/// JSON bodies are small; only art uploads get a bigger limit.
const JSON_BODY_LIMIT: usize = 256 * 1024;

/// Builds the application router.
pub fn router(state: AppState) -> Router {
    let api = Router::new()
        .route("/auth/code", post(auth::request_code))
        .route("/auth/verify", post(auth::verify_code))
        .route("/auth/logout", post(auth::logout))
        .route("/me", get(auth::me))
        .route("/events", get(events::list).post(events::create))
        .route("/events/{id}", get(events::get).put(events::update))
        .route(
            "/events/{id}/design",
            get(events::get_design).put(events::save_design),
        )
        .route("/events/{id}/design/preview", post(events::preview))
        .route(
            "/events/{id}/art",
            post(events::upload_art).layer(DefaultBodyLimit::max(MAX_ART_BYTES)),
        )
        .route(
            "/events/{id}/batches",
            get(batches::list).post(batches::create),
        )
        .route("/batches/{id}/cancel", post(batches::cancel))
        .route("/batches/{id}/checkout", post(batches::checkout))
        .route("/batches/{id}/checkout/sync", post(batches::sync_checkout))
        .route("/pricing", get(batches::pricing_table))
        .route("/stripe/webhook", post(batches::stripe_webhook))
        .route("/admin/batches/{id}/mark-paid", post(batches::mark_paid))
        .route(
            "/events/{id}/sellers",
            get(sellers::list).post(sellers::create),
        )
        .route(
            "/sellers/{id}",
            put(sellers::update).delete(sellers::delete),
        )
        .route("/sellers/{id}/ranges", post(sellers::assign))
        .route("/ranges/{id}", axum::routing::delete(sellers::unassign))
        .route("/events/{id}/voids", get(voids::list).post(voids::create))
        .route("/voids/{id}/undo", post(voids::undo))
        .route(
            "/events/{id}/exports",
            get(exports::list).post(exports::create),
        )
        .route("/exports/{id}", get(exports::get))
        .route("/exports/{id}/link", post(exports::link))
        .route("/downloads/{token}", get(exports::download))
        .route("/events/{id}/report", get(report::report))
        .route("/events/{id}/door", get(door::overview))
        .route("/events/{id}/door/accesses", post(door::create_access))
        .route("/door-accesses/{id}/revoke", post(door::revoke_access))
        .route("/door-devices/{id}/revoke", post(door::revoke_device))
        .route("/door/register", post(door::register))
        .route("/door/manifest", get(door::manifest))
        .route("/door/scans", post(door::upload_scans))
        .layer(DefaultBodyLimit::max(JSON_BODY_LIMIT));

    let origins: Vec<HeaderValue> = state
        .config
        .allowed_origins
        .iter()
        .filter_map(|origin| HeaderValue::from_str(origin).ok())
        .collect();
    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::list(origins))
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE])
        .allow_headers([AUTHORIZATION, CONTENT_TYPE])
        .expose_headers([CONTENT_DISPOSITION])
        .max_age(Duration::from_hours(1));

    Router::new()
        .route("/healthz", get(alive))
        .route("/readyz", get(ready))
        .nest("/api", api)
        .with_state(state)
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .layer(CatchPanicLayer::new())
}

/// `GET /healthz`: the process answers (Render's health check, every few seconds). It does not
/// touch the database, so an idle Neon compute can scale to zero.
async fn alive() -> StatusCode {
    StatusCode::OK
}

/// `GET /readyz`: the database answers too (for people and external monitors, not Render).
async fn ready(State(state): State<AppState>) -> StatusCode {
    match sqlx::query_scalar!("select 1 as one")
        .fetch_one(&state.pool)
        .await
    {
        Ok(_) => StatusCode::OK,
        Err(error) => {
            tracing::error!(%error, "health check failed");
            StatusCode::SERVICE_UNAVAILABLE
        }
    }
}
