//! Router: routes, CORS (ADR 0016), body limits, tracing.

use std::time::Duration;

use axum::Router;
use axum::extract::{DefaultBodyLimit, State};
use axum::http::header::{
    AUTHORIZATION, CACHE_CONTROL, CONTENT_DISPOSITION, CONTENT_TYPE, REFERRER_POLICY,
    STRICT_TRANSPORT_SECURITY, X_CONTENT_TYPE_OPTIONS, X_FRAME_OPTIONS,
};
use axum::http::{HeaderValue, Method, StatusCode};
use axum::middleware;
use axum::response::{IntoResponse as _, Response};
use axum::routing::{delete, get, post, put};
use tower_http::catch_panic::CatchPanicLayer;
use tower_http::compression::CompressionLayer;
use tower_http::compression::predicate::{DefaultPredicate, NotForContentType, Predicate as _};
use tower_http::cors::{AllowOrigin, CorsLayer};
use tower_http::request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer};
use tower_http::timeout::TimeoutLayer;
use tower_http::trace::TraceLayer;

use crate::auth;
use crate::error::ApiError;
use crate::routes::events::MAX_ART_BYTES;
use crate::routes::organization::MAX_LOGO_BYTES;
use crate::routes::{
    account, admin, analytics, announcements, batches, billing, categories, changelog, door,
    door_live, door_rehearsal, event_changes, events, exports, guests, ledger, mail_admin,
    moderation, organization, platform, privacy, refunds, report, reservations, seller_goals,
    seller_links, seller_sync, sellers, settlement, status, support, tables, team, tickets,
    two_factor, voids,
};
use crate::routes::{
    admin_insights, alerts, cashier, certificates, checklist, checkpoints, courtesies, credentials,
    crm, disputes, history, pix, public_page, series,
};
use crate::routes::{mailings, page_design, referrals, revenue_reports, setup, verify, waitlist};
use crate::state::AppState;

/// JSON bodies are small; only art uploads get a bigger limit.
const JSON_BODY_LIMIT: usize = 256 * 1024;
/// Longest a handler may take to answer (the body may stream longer): a slow client or a stuck
/// dependency releases its connection and its database slot instead of holding them.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(90);

/// Builds the application router.
#[expect(
    clippy::too_many_lines,
    reason = "the whole route table reads best in one place"
)]
pub fn router(state: AppState) -> Router {
    // Public, anonymous answers that change rarely: browsers may reuse them for a little while.
    let public = Router::new()
        .route("/status", get(status::public))
        .route("/changelog", get(changelog::public))
        .route("/pricing", get(batches::pricing_table))
        // The event's public page (ADR 0095).
        .route("/public/events/{slug}", get(public_page::public))
        .route_layer(middleware::map_response(short_public_cache));
    let api = Router::new()
        .merge(public)
        // Not cached: a maintenance switch must reach the panel at once.
        .route("/platform", get(platform::status))
        .route("/auth/options", get(auth::options))
        .route("/auth/code", post(auth::request_code))
        .route("/auth/verify", post(auth::verify_code))
        .route("/auth/google", post(auth::google))
        .route("/auth/logout", post(auth::logout))
        .route("/me", get(auth::me))
        .route(
            "/account",
            get(account::account)
                .put(account::update)
                .delete(privacy::delete),
        )
        .route("/account/export", get(privacy::export))
        .route("/account/credits", get(billing::credits))
        .route("/account/redeem", post(billing::redeem))
        .route("/account/two-factor", get(two_factor::status))
        .route("/account/two-factor/setup", post(two_factor::setup))
        .route("/account/two-factor/enable", post(two_factor::enable))
        .route(
            "/account/two-factor/recovery-codes",
            post(two_factor::regenerate),
        )
        .route("/account/two-factor/disable", post(two_factor::disable))
        .route("/inbox", get(announcements::inbox))
        .route("/inbox/read", post(announcements::read))
        .route("/announcements/{id}/dismiss", post(announcements::dismiss))
        .route("/resend/webhook", post(mail_admin::webhook))
        .route("/analytics", get(analytics::organization))
        .route("/events", get(events::list).post(events::create))
        .route(
            "/events/{id}",
            get(events::get).put(events::update).delete(events::delete),
        )
        .route("/events/{id}/duplicate", post(events::duplicate))
        .route("/events/{id}/status", put(events::set_status))
        .route(
            "/events/{id}/design",
            get(events::get_design).put(events::save_design),
        )
        .route("/events/{id}/design/preview", post(events::preview))
        .route("/events/{id}/design/sample", post(events::sample))
        .route("/events/{id}/analytics", get(analytics::event))
        .route(
            "/events/{id}/tickets",
            get(tickets::list).post(tickets::create),
        )
        .route("/events/{id}/tickets/bulk", post(tickets::create_bulk))
        .route("/events/{id}/tickets/issue", post(tickets::issue))
        .route("/events/{id}/tickets/sent", post(tickets::mark_sent))
        .route("/events/{id}/waitlist", get(waitlist::list))
        .route(
            "/waitlist-entries/{id}",
            put(waitlist::update).delete(waitlist::remove),
        )
        .route("/public/events/{slug}/waitlist", post(waitlist::join))
        .route("/events/{id}/public-page/design", put(page_design::update))
        .route(
            "/events/{id}/public-page/preview",
            get(public_page::preview),
        )
        .route("/public/covers/{id}", get(page_design::cover))
        .route("/events/{id}/tickets/replace", post(tickets::replace))
        .route("/ticket-links/{id}", put(tickets::update))
        .route("/ticket-links/{id}/revoke", post(tickets::revoke))
        .route("/ticket", post(tickets::open))
        .route("/ticket/image", post(tickets::image))
        // Transfer and the phone's wallets (ADR 0097).
        .route("/ticket/transfer", post(tickets::transfer))
        .route("/ticket/wallet/apple", post(tickets::wallet_apple))
        .route("/ticket/wallet/google", post(tickets::wallet_google))
        .route(
            "/events/{id}/ticket-settings",
            get(tickets::settings).put(tickets::update_settings),
        )
        .route(
            "/events/{id}/art",
            post(events::upload_art).layer(DefaultBodyLimit::max(MAX_ART_BYTES)),
        )
        .route("/events/{id}/art/{art_id}", get(events::art_preview))
        .route(
            "/events/{id}/batches",
            get(batches::list).post(batches::create),
        )
        .route("/events/{id}/batches/quote", post(billing::quote))
        .route("/batches/{id}/cancel", post(batches::cancel))
        .route("/batches/{id}/checkout", post(batches::checkout))
        .route("/batches/{id}/checkout/sync", post(batches::sync_checkout))
        .route("/stripe/webhook", post(batches::stripe_webhook))
        .route("/admin/batches/{id}/mark-paid", post(batches::mark_paid))
        .route("/admin/batches/{id}/refund", post(support::refund))
        .route("/admin/payments/sync-refunds", post(refunds::sync))
        .route("/admin/batches/{id}/price", put(support::set_price))
        .route("/admin/overview", get(admin::overview))
        // The funnel and the events around now (ADR 0099).
        .route("/admin/funnel", get(admin_insights::funnel))
        .route("/admin/live", get(admin_insights::live))
        .route("/admin/finance", get(analytics::finance))
        // Revenue reports for the accountant (ADR 0106).
        .route("/admin/reports/closing", get(revenue_reports::closing))
        .route(
            "/admin/reports/closing/xlsx",
            get(revenue_reports::closing_xlsx),
        )
        .route(
            "/admin/reports/closing/csv",
            get(revenue_reports::closing_csv),
        )
        .route("/admin/reports/cohorts", get(revenue_reports::cohorts))
        .route("/admin/reports/coupons", get(revenue_reports::coupons))
        .route("/admin/organizations", get(admin::organizations))
        // The admins' file on an organization (ADR 0105).
        .route("/admin/organizations/tags", get(crm::tags))
        .route("/admin/organizations/{id}/tags", put(crm::set_tags))
        .route("/admin/organizations/{id}/timeline", get(crm::timeline))
        .route("/admin/organizations/{id}/notes", post(crm::create_note))
        .route(
            "/admin/organization-notes/{id}",
            put(crm::update_note).delete(crm::delete_note),
        )
        .route(
            "/admin/organizations/{id}",
            get(support::organization).put(support::rename),
        )
        .route("/admin/organizations/{id}/bonus", put(admin::set_bonus))
        // Admins reach any event and fix any public profile (ADR 0079).
        .route("/admin/events", get(admin::events))
        .route(
            "/admin/organizations/{id}/profile",
            get(organization::admin_profile).put(organization::admin_update),
        )
        .route(
            "/admin/organizations/{id}/profile/logo",
            post(organization::admin_upload_logo)
                .delete(organization::admin_delete_logo)
                .layer(DefaultBodyLimit::max(MAX_LOGO_BYTES)),
        )
        .route(
            "/admin/organizations/{id}/suspension",
            put(support::set_suspension),
        )
        .route(
            "/admin/users/{id}/two-factor/reset",
            post(two_factor::admin_reset),
        )
        .route(
            "/admin/users/{id}/sessions/revoke",
            post(support::revoke_sessions),
        )
        .route("/admin/batches", get(admin::batches))
        .route("/admin/audit", get(support::audit_log))
        .route("/admin/audit/export", get(support::audit_export))
        .route("/admin/settings", get(platform::get).put(platform::update))
        .route(
            "/admin/announcements",
            get(announcements::admin_list).post(announcements::create),
        )
        .route(
            "/admin/announcements/{id}",
            put(announcements::update).delete(announcements::delete),
        )
        // Announcements by e-mail (ADR 0107).
        .route(
            "/admin/announcements/{id}/email",
            get(mailings::preview).post(mailings::send),
        )
        .route("/admin/announcements/{id}/email/test", post(mailings::test))
        .route("/admin/mailings/{id}/cancel", post(mailings::cancel))
        .route("/admin/mailings/estimate", get(mailings::estimate))
        .route("/email/unsubscribe", post(mailings::unsubscribe))
        .route("/email/unsubscribe/{token}", post(mailings::one_click))
        .route("/account/preferences", put(account::preferences))
        .route("/account/tour", post(account::tour))
        .route(
            "/admin/prices",
            get(billing::admin_prices).post(billing::create_prices),
        )
        .route("/admin/prices/{id}", delete(billing::delete_prices))
        .route(
            "/admin/promotions",
            get(billing::promotions).post(billing::create_promotion),
        )
        .route(
            "/admin/promotions/{id}",
            put(billing::update_promotion).delete(billing::delete_promotion),
        )
        .route(
            "/admin/promo-codes",
            get(billing::promo_codes).post(billing::create_promo_code),
        )
        .route("/admin/promo-codes/{id}", put(billing::update_promo_code))
        .route(
            "/admin/promo-codes/{id}/redemptions",
            get(billing::redemptions),
        )
        .route(
            "/admin/organizations/{id}/credits",
            get(billing::admin_credits).post(billing::adjust_credits),
        )
        .route("/admin/emails", get(mail_admin::list))
        .route("/admin/emails/summary", get(mail_admin::summary))
        .route("/admin/emails/test", post(mail_admin::test))
        .route("/admin/moderation", get(moderation::flags))
        .route("/admin/moderation/summary", get(moderation::summary))
        .route("/admin/moderation/recent", get(moderation::recent))
        .route("/admin/moderation/{id}/resolve", post(moderation::resolve))
        .route("/admin/moderation/arts/{id}", get(moderation::art))
        .route("/admin/moderation/arts/{id}/flag", post(moderation::flag))
        .route(
            "/admin/moderation/arts/{id}/rescan",
            post(moderation::rescan),
        )
        .route("/admin/incidents", get(status::list).post(status::create))
        .route(
            "/admin/incidents/{id}",
            put(status::update).delete(status::delete),
        )
        .route("/admin/incidents/{id}/updates", post(status::post_update))
        .route(
            "/admin/changelog",
            get(changelog::list).post(changelog::create),
        )
        .route(
            "/admin/changelog/{id}",
            put(changelog::update).delete(changelog::delete),
        )
        .route(
            "/events/{id}/sellers",
            get(sellers::list).post(sellers::create),
        )
        .route(
            "/sellers/{id}",
            put(sellers::update).delete(sellers::delete),
        )
        .route("/sellers/{id}/ranges", post(sellers::assign))
        .route(
            "/sellers/{id}/ranges/remaining",
            post(sellers::assign_remaining),
        )
        .route("/events/{id}/available-numbers", get(sellers::available))
        .route(
            "/sellers/{id}/link",
            post(seller_links::create).delete(seller_links::revoke),
        )
        .route("/events/{id}/ticket-sales", get(seller_links::list_sales))
        .route(
            "/events/{id}/categories",
            get(categories::list).post(categories::create),
        )
        .route("/events/{id}/setup", post(setup::create))
        .route(
            "/categories/{id}",
            put(categories::update).delete(categories::delete),
        )
        .route("/categories/{id}/ranges", post(categories::assign))
        .route("/category-ranges/{id}", delete(categories::unassign))
        .route(
            "/events/{id}/tables",
            get(tables::list).post(tables::create),
        )
        .route("/events/{id}/tables/bulk", post(tables::create_bulk))
        .route("/events/{id}/tables/layout", put(tables::layout))
        .route("/tables/{id}", put(tables::update).delete(tables::delete))
        .route("/tables/{id}/tickets", post(tables::seat))
        .route("/tables/{id}/tickets/remove", post(tables::unseat))
        .route(
            "/events/{id}/ledger",
            get(ledger::list).post(ledger::create),
        )
        .route("/ledger/{id}", put(ledger::update).delete(ledger::delete))
        .route("/events/{id}/accountability", get(ledger::summary))
        // The final summary to share (ADR 0101).
        .route(
            "/events/{id}/summary/pdf",
            get(crate::routes::final_summary::pdf),
        )
        .route(
            "/events/{id}/summary/png",
            get(crate::routes::final_summary::picture),
        )
        .route("/events/{id}/accountability/pdf", get(ledger::pdf))
        .route("/events/{id}/accountability/xlsx", get(ledger::spreadsheet))
        .route("/events/{id}/team", get(team::list).post(team::add))
        .route("/events/{id}/team/leave", post(team::leave))
        .route("/team-members/{id}", put(team::update).delete(team::remove))
        .route("/seller", post(seller_links::open))
        .route("/seller/sales", post(seller_links::mark))
        .route("/seller/sales/undo", post(seller_links::unmark))
        .route("/seller/tickets", post(seller_links::send_ticket))
        .route(
            "/events/{id}/seller-settings",
            get(seller_links::settings).put(seller_links::update_settings),
        )
        .route("/sellers/{id}/payments", post(settlement::create))
        .route("/sellers/{id}/returns", post(settlement::record_return))
        .route("/events/{id}/seller-payments", get(settlement::list))
        .route("/seller-payments/{id}", delete(settlement::delete))
        .route("/ranges/{id}", delete(sellers::unassign))
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
        .route("/events/{id}/door-settings", put(door::update_settings))
        .route("/events/{id}/capacity", put(door::update_capacity))
        .route(
            "/events/{id}/credentials",
            get(credentials::list).post(credentials::create),
        )
        .route("/events/{id}/credentials/badges", get(credentials::badges))
        .route("/credentials/{id}", put(credentials::update))
        .route("/credentials/{id}/revoke", post(credentials::revoke))
        .route("/credentials/{id}/restore", post(credentials::restore))
        .route("/events/{id}/certificates", get(certificates::list))
        .route(
            "/events/{id}/certificates/settings",
            put(certificates::update_settings),
        )
        .route("/events/{id}/certificates/issue", post(certificates::issue))
        .route(
            "/events/{id}/certificates/sample",
            post(certificates::sample),
        )
        .route(
            "/events/{id}/certificates/sample-image",
            post(certificates::sample_image),
        )
        .route("/events/{id}/certificates/zip", get(certificates::zip))
        .route(
            "/certificates/{id}",
            put(certificates::rename).delete(certificates::delete),
        )
        .route("/certificates/view", post(certificates::view))
        .route("/certificates/pdf", post(certificates::pdf))
        .route("/events/{id}/door/accesses", post(door::create_access))
        .route("/door-accesses/{id}/revoke", post(door::revoke_access))
        .route("/door-accesses/{id}/link", post(door::new_link))
        .route("/door-devices/{id}/revoke", post(door::revoke_device))
        .route(
            "/events/{id}/checkpoints",
            get(checkpoints::list).post(checkpoints::create),
        )
        .route(
            "/checkpoints/{id}",
            put(checkpoints::update).delete(checkpoints::delete),
        )
        .route("/door/register", post(door::register))
        .route("/door/manifest", get(door::manifest))
        .route("/door/scans", post(door::upload_scans))
        // Organization profile, postponing or canceling (ADRs 0064, 0065).
        .route(
            "/account/profile",
            get(organization::profile).put(organization::update),
        )
        .route(
            "/account/profile/logo",
            post(organization::upload_logo)
                .delete(organization::delete_logo)
                .layer(DefaultBodyLimit::max(MAX_LOGO_BYTES)),
        )
        .route("/logos/{id}", get(organization::logo))
        .route("/events/{id}/postpone", post(event_changes::postpone))
        .route("/events/{id}/cancel", post(event_changes::cancel))
        .route("/events/{id}/cancel/undo", post(event_changes::undo_cancel))
        // Door features (ADRs 0067–0071).
        .route(
            "/door-accesses/{id}/categories",
            put(door::update_access_categories),
        )
        .route("/door/rehearsal", post(door_rehearsal::done))
        .route(
            "/events/{id}/door/rehearsal-sheet",
            get(door_rehearsal::sheet),
        )
        .route("/events/{id}/door/live", get(door_live::live))
        .route(
            "/events/{id}/guests",
            get(guests::list).post(guests::create),
        )
        .route("/events/{id}/guests/bulk", post(guests::create_bulk))
        .route("/guests/{id}", put(guests::update).delete(guests::delete))
        .route("/door/guests", post(guests::upload))
        // Sellers' reservations, goals and the offline queue (ADRs 0072–0074).
        .route("/events/{id}/reservations", get(reservations::list))
        .route("/sellers/{id}/reservations", post(reservations::create))
        .route("/reservations/{id}/sell", post(reservations::sell))
        .route("/reservations/{id}", delete(reservations::cancel))
        .route("/sellers/{id}/goal", put(seller_goals::set))
        .route("/events/{id}/sellers/goals", post(seller_goals::set_all))
        .route("/seller/sync", post(seller_sync::sync))
        // Check a ticket before buying it and refer and earn (ADRs 0075, 0076).
        .route("/verify", post(verify::verify))
        .route(
            "/events/{id}/verify-settings",
            get(verify::settings).put(verify::update_settings),
        )
        .route("/referrals/{code}", get(referrals::invite))
        .route("/account/referrals", get(referrals::mine))
        .route("/admin/referrals", get(referrals::admin_list))
        .route("/admin/referrals/settings", put(referrals::update_settings))
        .route(
            "/admin/referrals/{id}/revoke",
            post(referrals::admin_revoke),
        )
        // Several dates of one event and the checklist (ADRs 0077, 0078).
        .route("/events/{id}/dates", post(series::add_date))
        .route("/events/{id}/series/leave", post(series::leave))
        .route("/series/{id}", get(series::get).put(series::rename))
        .route("/events/{id}/checklist", get(checklist::checklist))
        // Pix "copia e cola" (ADR 0085).
        .route(
            "/account/pix",
            get(pix::organization_account)
                .put(pix::set_organization_account)
                .delete(pix::delete_organization_account),
        )
        .route(
            "/sellers/{id}/pix",
            put(pix::set_seller_account).delete(pix::delete_seller_account),
        )
        .route("/events/{id}/pix", get(pix::event))
        .route("/events/{id}/pix-settings", put(pix::update_settings))
        .route("/events/{id}/pix/receipts", post(pix::set_receipts))
        .route("/seller/pix", post(pix::seller_receipt))
        // Notice to the sellers, commissions and courtesies (ADR 0096).
        .route(
            "/events/{id}/seller-notice",
            put(seller_links::update_notice),
        )
        .route("/sellers/{id}/commission", put(sellers::set_commission))
        .route(
            "/events/{id}/sellers/commission",
            post(sellers::set_commission_all),
        )
        .route(
            "/events/{id}/courtesies",
            get(courtesies::list).post(courtesies::create),
        )
        .route("/courtesies/{id}", delete(courtesies::delete))
        .route(
            "/events/{id}/courtesy-givers",
            post(courtesies::create_giver),
        )
        .route(
            "/courtesy-givers/{id}",
            put(courtesies::update_giver).delete(courtesies::delete_giver),
        )
        .route(
            "/events/{id}/public-page",
            get(public_page::settings).put(public_page::update),
        )
        // The event's history (ADR 0099).
        .route("/events/{id}/activity", get(history::list))
        // Ready-made papers for home printing (ADR 0102).
        .route("/events/{id}/papers", get(exports::papers))
        // Disputed card payments (ADR 0104).
        .route("/admin/disputes", get(disputes::list))
        .route("/admin/disputes/{id}/block", post(disputes::block))
        .route("/admin/disputes/{id}/unblock", post(disputes::unblock))
        .route("/admin/disputes/{id}/settle", post(disputes::settle))
        // The admins' alerts and daily summary (ADR 0103).
        .route("/admin/alerts", get(alerts::list))
        .route("/admin/alerts/settings", put(alerts::update_settings))
        .route("/admin/alerts/test", post(alerts::test))
        .route("/admin/alerts/summary", post(alerts::summary_now))
        .route("/admin/alerts/{id}/resolve", post(alerts::resolve))
        // The token cashier (ADR 0098).
        .route("/events/{id}/cashiers", get(cashier::report))
        .route("/sellers/{id}/cashier/close", post(cashier::panel_close))
        .route("/seller/cashier/close", post(cashier::seller_close))
        .fallback(not_found)
        // The event's history (ADR 0099): what a handler let through and finished well.
        .layer(middleware::from_fn_with_state(
            state.clone(),
            crate::activity::record,
        ))
        // Maintenance (ADR 0037) also holds the writers that carry a token instead of a session
        // (ADR 0119); their phones keep the work and retry (invariant 6).
        .layer(middleware::from_fn_with_state(
            state.clone(),
            token_writers_maintenance,
        ))
        // A burst of unexpected errors reaches the admins (ADR 0103).
        .layer(middleware::from_fn_with_state(
            state.clone(),
            crate::alerts::watch_errors,
        ))
        .layer(DefaultBodyLimit::max(JSON_BODY_LIMIT))
        // Axum's own rejections (bad JSON, a malformed id, a body too large) answer plain text;
        // the panel maps error codes, so every API error is JSON.
        .layer(middleware::map_response(json_rejections));

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

    // JSON answers (the door manifest, the event list, reports) shrink 5-10x; PDFs, ZIPs and
    // spreadsheets are already compressed and would only lose their Content-Length.
    let compression = CompressionLayer::new().compress_when(
        DefaultPredicate::new()
            .and(NotForContentType::new("application/pdf"))
            .and(NotForContentType::new("application/zip"))
            .and(NotForContentType::new(
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )),
    );

    let production = state.config.production;
    // Every request gets an id (`x-request-id`, answered back to the client): the log lines it
    // writes, an "unexpected error" included, carry it with the method and the route, so a report
    // from an organizer can be matched to what happened. Tokens never reach the span (below).
    Router::new()
        .route("/healthz", get(alive))
        .route("/readyz", get(ready))
        .nest("/api", api)
        .with_state(state)
        .layer(middleware::map_response(move |response| async move {
            security_headers(response, production)
        }))
        .layer(PropagateRequestIdLayer::x_request_id())
        .layer(compression)
        .layer(cors)
        .layer(TraceLayer::new_for_http().make_span_with(request_span))
        .layer(TimeoutLayer::with_status_code(
            StatusCode::REQUEST_TIMEOUT,
            REQUEST_TIMEOUT,
        ))
        .layer(CatchPanicLayer::new())
        .layer(SetRequestIdLayer::x_request_id(MakeRequestUuid))
        // Always ours: a client may not choose what goes into the logs under that name.
        .layer(middleware::map_request(drop_client_request_id))
}

/// The endpoints that write with a token, not a session: during maintenance they answer like
/// the panel does (`check_request`), since the extractor that enforces it never sees them.
const TOKEN_WRITERS: &[&str] = &[
    "/api/door/register",
    "/api/door/scans",
    "/api/door/guests",
    "/api/door/rehearsal",
    "/api/ticket/transfer",
];

async fn token_writers_maintenance(
    State(state): State<AppState>,
    request: axum::http::Request<axum::body::Body>,
    next: middleware::Next,
) -> Response {
    let path = request
        .extensions()
        .get::<axum::extract::OriginalUri>()
        .map_or_else(
            || request.uri().path().to_owned(),
            |uri| uri.path().to_owned(),
        );
    if request.method() != Method::GET && TOKEN_WRITERS.contains(&path.as_str()) {
        let checked = match state.settings.get(&state.pool).await {
            Ok(settings) => settings.check_request(request.method(), &path),
            Err(error) => Err(error),
        };
        if let Err(error) = checked {
            return error.into_response();
        }
    }
    next.run(request).await
}

async fn drop_client_request_id(
    mut request: axum::http::Request<axum::body::Body>,
) -> axum::http::Request<axum::body::Body> {
    request.headers_mut().remove("x-request-id");
    request
}

/// The span every log line of a request is written in: method, the path with its capability
/// tokens masked, and the request id. Query strings stay out too.
fn request_span(request: &axum::http::Request<axum::body::Body>) -> tracing::Span {
    let id = request
        .headers()
        .get("x-request-id")
        .and_then(|value| value.to_str().ok())
        .unwrap_or("-");
    tracing::info_span!(
        "request",
        method = %request.method(),
        path = %loggable_path(request.uri().path()),
        request_id = %id,
    )
}

/// A path as it may be logged: the segment after `downloads/` (a download link, invariant 7's
/// cousin: the token is the capability) and `referrals/` (an invitation code) is masked.
fn loggable_path(path: &str) -> String {
    let mut out = String::with_capacity(path.len());
    let mut mask_next = false;
    for (index, segment) in path.split('/').enumerate() {
        if index > 0 {
            out.push('/');
        }
        if mask_next && !segment.is_empty() {
            out.push_str("<masked>");
        } else {
            out.push_str(segment);
        }
        mask_next = matches!(segment, "downloads" | "referrals" | "unsubscribe");
    }
    out
}

/// Browser-facing hardening on every answer (ADR 0047): the API is never framed or sniffed, it
/// sends no referrer, its answers are personal unless a handler says otherwise, and in production
/// browsers remember to use HTTPS for the whole domain.
fn security_headers(mut response: Response, production: bool) -> Response {
    let headers = response.headers_mut();
    headers.insert(X_CONTENT_TYPE_OPTIONS, HeaderValue::from_static("nosniff"));
    headers.insert(X_FRAME_OPTIONS, HeaderValue::from_static("DENY"));
    headers.insert(REFERRER_POLICY, HeaderValue::from_static("no-referrer"));
    headers
        .entry(CACHE_CONTROL)
        .or_insert(HeaderValue::from_static("no-store"));
    if production {
        headers.insert(
            STRICT_TRANSPORT_SECURITY,
            HeaderValue::from_static("max-age=63072000; includeSubDomains; preload"),
        );
    }
    response
}

/// `Cache-Control: public, max-age=30` on successful public reads.
async fn short_public_cache(mut response: Response) -> Response {
    if response.status() == StatusCode::OK {
        response.headers_mut().insert(
            CACHE_CONTROL,
            HeaderValue::from_static("public, max-age=30, stale-while-revalidate=60"),
        );
    }
    response
}

async fn not_found() -> ApiError {
    ApiError::NotFound
}

async fn json_rejections(response: Response) -> Response {
    let status = response.status();
    let is_json = response
        .headers()
        .get(CONTENT_TYPE)
        .is_some_and(|value| value.as_bytes().starts_with(b"application/json"));
    if !status.is_client_error() || is_json {
        return response;
    }
    let code = match status {
        StatusCode::PAYLOAD_TOO_LARGE => "payload_too_large",
        StatusCode::NOT_FOUND => "not_found",
        StatusCode::METHOD_NOT_ALLOWED => "method_not_allowed",
        _ => "invalid_input",
    };
    let message = status
        .canonical_reason()
        .unwrap_or("bad request")
        .to_lowercase();
    (
        status,
        axum::Json(serde_json::json!({ "error": { "code": code, "message": message } })),
    )
        .into_response()
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

#[cfg(test)]
mod tests {
    use super::loggable_path;

    #[test]
    fn capability_tokens_stay_out_of_the_logs() {
        assert_eq!(
            loggable_path("/api/downloads/abc-DEF_123"),
            "/api/downloads/<masked>"
        );
        assert_eq!(
            loggable_path("/api/referrals/BANDA42"),
            "/api/referrals/<masked>"
        );
        assert_eq!(
            loggable_path("/api/events/8f1d6a52-3c1e-4b6f-9a2d-6c0e5b7a9d01/report"),
            "/api/events/8f1d6a52-3c1e-4b6f-9a2d-6c0e5b7a9d01/report"
        );
        assert_eq!(
            loggable_path("/api/email/unsubscribe/v1.abc"),
            "/api/email/unsubscribe/<masked>"
        );
        assert_eq!(loggable_path("/api/downloads/"), "/api/downloads/");
        assert_eq!(loggable_path("/healthz"), "/healthz");
    }
}
