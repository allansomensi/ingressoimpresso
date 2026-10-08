//! `ingressoimpresso`: the API server (HTTP + export worker in one process).

use std::process::ExitCode;
use std::time::Duration;

use anyhow::{Context, Result};
use ingressoimpresso_server::config::Config;
use ingressoimpresso_server::mail::Mailer;
use ingressoimpresso_server::state::AppState;
use ingressoimpresso_server::{MIGRATOR, app, jobs};
use sqlx::postgres::PgPoolOptions;
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
    let pool = PgPoolOptions::new()
        .max_connections(10)
        .acquire_timeout(Duration::from_secs(10))
        .connect(&config.database_url)
        .await
        .context("connecting to the database")?;
    MIGRATOR.run(&pool).await.context("running migrations")?;
    tokio::fs::create_dir_all(&config.export_dir)
        .await
        .with_context(|| format!("creating {}", config.export_dir.display()))?;

    // reqwest is built without a crypto provider; use ring, like sqlx.
    let _ = rustls::crypto::ring::default_provider().install_default();
    let mailer = match &config.resend_api_key {
        Some(api_key) => Mailer::Resend {
            client: reqwest::Client::builder()
                .timeout(Duration::from_secs(10))
                .build()
                .context("building HTTP client")?,
            api_key: api_key.clone(),
            from: config.mail_from.clone(),
        },
        None => Mailer::Log,
    };
    let port = config.port;
    let state = AppState::new(pool, config, mailer);
    tokio::spawn(jobs::run_worker(state.clone()));

    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port))
        .await
        .with_context(|| format!("binding port {port}"))?;
    tracing::info!(port, "listening");
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
