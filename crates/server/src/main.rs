//! `ingressoimpresso`: the API server (HTTP + export worker in one process).

use std::process::ExitCode;
use std::time::Duration;

use anyhow::{Context, Result};
use ingressoimpresso_server::captcha::Captcha;
use ingressoimpresso_server::config::Config;
use ingressoimpresso_server::google::GoogleAuth;
use ingressoimpresso_server::mail::Mailer;
use ingressoimpresso_server::moderation::Classifier;
use ingressoimpresso_server::payments::Payments;
use ingressoimpresso_server::state::AppState;
use ingressoimpresso_server::{MIGRATOR, app, jobs};
use sqlx::postgres::{PgConnectOptions, PgPoolOptions, PgSslMode};
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> ExitCode {
    let config = match Config::from_env() {
        Ok(config) => config,
        Err(error) => {
            #[allow(clippy::print_stderr, reason = "logging is not configured yet")]
            {
                eprintln!("configuration error: {error}");
            }
            return ExitCode::FAILURE;
        }
    };
    init_tracing(config.production);
    match run(config).await {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            tracing::error!(error = format!("{error:#}"), "server stopped");
            ExitCode::FAILURE
        }
    }
}

fn init_tracing(json: bool) {
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info,sqlx=warn,tower_http=info"));
    let builder = tracing_subscriber::fmt().with_env_filter(filter);
    if json {
        builder.json().init();
    } else {
        builder.init();
    }
}

async fn run(config: Config) -> Result<()> {
    let mut options: PgConnectOptions = config
        .database_url
        .parse()
        .context("parsing DATABASE_URL")?;
    if config.production {
        // The database lives on another network (ADR 0013): its certificate is always checked,
        // whatever the URL says, so a stripped connection never silently goes in plain text.
        options = options.ssl_mode(PgSslMode::VerifyFull);
    }
    let pool = PgPoolOptions::new()
        .max_connections(10)
        .acquire_timeout(Duration::from_secs(10))
        .connect_with(options)
        .await
        .context("connecting to the database")?;
    MIGRATOR.run(&pool).await.context("running migrations")?;
    tokio::fs::create_dir_all(&config.export_dir)
        .await
        .with_context(|| format!("creating {}", config.export_dir.display()))?;

    // reqwest is built without a crypto provider; use ring, like sqlx.
    let _ = rustls::crypto::ring::default_provider().install_default();
    if config.production && config.uses_test_sender() {
        tracing::warn!(
            "MAIL_FROM uses onboarding@resend.dev: login e-mails only reach the Resend account owner"
        );
    }
    let mailer = match &config.resend_api_key {
        Some(api_key) => Mailer::resend(api_key.clone(), config.mail_from.clone())
            .context("building the e-mail client")?,
        None => Mailer::Log,
    };
    let payments = if let Some(keys) = &config.stripe {
        if config.production && keys.test_mode() {
            tracing::warn!("Stripe is in test mode: no real payment is collected");
        }
        Payments::stripe(keys.secret_key.clone(), keys.webhook_secret.clone())
            .context("building the Stripe client")?
    } else {
        tracing::info!("Stripe not configured: batches are marked as paid by an admin");
        Payments::Disabled
    };
    let google = if let Some(client_id) = &config.google_client_id {
        Some(GoogleAuth::new(client_id.clone()).context("building the Google sign-in client")?)
    } else {
        tracing::info!("GOOGLE_CLIENT_ID not set: sign-in by e-mail code only");
        None
    };
    let classifier = if let Some(api_key) = &config.vision_api_key {
        Some(Classifier::vision(api_key.clone()).map_err(|error| anyhow::anyhow!(error))?)
    } else {
        tracing::info!("MODERATION_VISION_API_KEY not set: art is reviewed by hand only");
        None
    };
    let captcha = if let Some(keys) = &config.turnstile {
        Some(
            Captcha::turnstile(keys.site_key.clone(), keys.secret_key.clone())
                .map_err(|error| anyhow::anyhow!(error))?,
        )
    } else {
        tracing::info!(
            "TURNSTILE_SITE_KEY not set: login codes are sent without the anti-bot check"
        );
        None
    };
    let port = config.port;
    let mut state = AppState::new(pool, config, mailer).with_payments(payments);
    if let Some(google) = google {
        state = state.with_google(google);
    }
    if let Some(classifier) = classifier {
        state = state.with_classifier(classifier);
    }
    if let Some(captcha) = captcha {
        state = state.with_captcha(captcha);
    }
    tokio::spawn(jobs::run_worker(state.clone()));

    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port))
        .await
        .with_context(|| format!("binding port {port}"))?;
    tracing::info!(
        port,
        version = ingressoimpresso_server::VERSION,
        "listening"
    );
    axum::serve(listener, app::router(state))
        .with_graceful_shutdown(shutdown_signal())
        .await
        .context("serving")
}

async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };
    #[cfg(unix)]
    let terminate = async {
        match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            Ok(mut signal) => {
                signal.recv().await;
            }
            Err(_) => std::future::pending::<()>().await,
        }
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();
    tokio::select! {
        () = ctrl_c => {},
        () = terminate => {},
    }
    tracing::info!("shutting down");
}
