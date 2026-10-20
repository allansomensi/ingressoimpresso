//! Alerts that reach the admins (ADR 0103): something went wrong (the Stripe webhook failed, a
//! file failed every attempt, the e-mail quota is running out, a large event starts without a
//! door link, the API answered a burst of errors, a payment was disputed) and the admins hear of
//! it by e-mail and on Telegram, without opening the panel. Plus a summary every morning.
//!
//! An alert has a key: the same problem again, while its alert is open, only adds to its count,
//! so a flood of failures is one message. Raising never fails its caller: a broken alert is
//! logged and the request that raised it carries on.

use std::fmt::Write as _;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use std::time::Duration;

use axum::extract::{Request, State};
use axum::http::StatusCode;
use axum::middleware::Next;
use axum::response::Response;
use time::{OffsetDateTime, UtcOffset};
use uuid::Uuid;

use crate::api::{AlertDeliveryDto, AlertKind, AlertSettingsDto, AlertSeverity};
use crate::config::TelegramKeys;
use crate::emails::{self, AdminAlert, AdminSummary};
use crate::error::ApiResult;
use crate::mail::MailKind;
use crate::state::AppState;

/// Brasília time (no daylight saving since 2019): the summary's clock.
const BRASILIA: UtcOffset = match UtcOffset::from_hms(-3, 0, 0) {
    Ok(offset) => offset,
    Err(_) => UtcOffset::UTC,
};
/// Unexpected errors (500) in [`ERROR_WINDOW`] that raise an alert.
pub const ERROR_THRESHOLD: usize = 10;
/// The window of [`ERROR_THRESHOLD`].
pub const ERROR_WINDOW: Duration = Duration::from_mins(5);
/// The share of the daily e-mail quota that raises a warning.
const QUOTA_WARNING_PERCENT: i64 = 80;
/// An event that starts within this many hours without a door link raises an alert.
const DOOR_LOOKAHEAD_HOURS: i32 = 2;
/// Telegram's limit for one message.
const TELEGRAM_MAX_CHARS: usize = 4000;
const TELEGRAM_API: &str = "https://api.telegram.org";

/// Where the Telegram messages go: the bot, nowhere, or memory (tests).
#[derive(Debug, Clone)]
pub enum Telegram {
    /// Not configured.
    Off,
    /// The bot of `TELEGRAM_BOT_TOKEN`, writing to `TELEGRAM_CHAT_ID`.
    Bot {
        client: reqwest::Client,
        keys: TelegramKeys,
    },
    /// Messages kept in memory (tests).
    Memory(Arc<std::sync::Mutex<Vec<String>>>),
}

impl Telegram {
    /// The bot of the configuration, if any.
    pub fn from_config(keys: Option<&TelegramKeys>) -> Self {
        match keys {
            None => Self::Off,
            Some(keys) => match reqwest::Client::builder()
                .timeout(Duration::from_secs(10))
                .build()
            {
                Ok(client) => Self::Bot {
                    client,
                    keys: keys.clone(),
                },
                Err(error) => {
                    tracing::error!(%error, "telegram client could not be built; alerts go by e-mail only");
                    Self::Off
                }
            },
        }
    }

    /// Whether messages go anywhere.
    pub const fn configured(&self) -> bool {
        !matches!(self, Self::Off)
    }

    /// Sends one plain-text message.
    async fn send(&self, text: &str) -> Result<(), String> {
        let text: String = text.chars().take(TELEGRAM_MAX_CHARS).collect();
        match self {
            Self::Off => Err("telegram is not configured".to_owned()),
            Self::Memory(sent) => {
                sent.lock()
                    .map_err(|_| "telegram memory poisoned".to_owned())?
                    .push(text);
                Ok(())
            }
            Self::Bot { client, keys } => {
                let response = client
                    .post(format!("{TELEGRAM_API}/bot{}/sendMessage", keys.bot_token))
                    .json(&serde_json::json!({
                        "chat_id": keys.chat_id,
                        "text": text,
                        "disable_web_page_preview": true,
                    }))
                    .send()
                    .await
                    // The token is in the address: never log the request itself.
                    .map_err(|error| format!("telegram unreachable: {}", error.without_url()))?;
                if response.status().is_success() {
                    Ok(())
                } else {
                    Err(format!("telegram answered {}", response.status()))
                }
            }
        }
    }
}

/// A problem to tell the admins about.
#[derive(Debug, Clone)]
pub struct NewAlert {
    pub kind: AlertKind,
    /// The same key, while its alert is open, adds to it instead of opening another.
    pub key: String,
    pub severity: AlertSeverity,
    pub title: String,
    pub detail: Option<String>,
    /// The admin section that shows it (`agora`, `alertas`…).
    pub section: &'static str,
}

/// Opens (or adds to) an alert and tells the admins when it is new. Boxed, so `send_mail` can
/// raise an alert that is itself sent by e-mail.
pub fn raise(state: AppState, alert: NewAlert) -> Pin<Box<dyn Future<Output = ()> + Send>> {
    Box::pin(async move {
        match open_alert(&state, &alert).await {
            Ok(Some(id)) => {
                deliver_alert(&state, &alert).await;
                if let Err(error) = sqlx::query!(
                    "update admin_alerts set notified_at = now() where id = $1",
                    id
                )
                .execute(&state.pool)
                .await
                {
                    tracing::error!(%error, "alert notified but not marked");
                }
            }
            Ok(None) => {}
            Err(error) => {
                tracing::error!(?error, key = %alert.key, "an alert could not be recorded");
            }
        }
    })
}

/// Records the alert; `Some(id)` when it opened now (to be told), `None` when it added to an
/// open one.
async fn open_alert(state: &AppState, alert: &NewAlert) -> ApiResult<Option<Uuid>> {
    let row = sqlx::query!(
        r#"insert into admin_alerts (id, kind, key, severity, title, detail, link)
           values ($1, $2, $3, $4, $5, $6, $7)
           on conflict (key) where resolved_at is null do update
           set count = admin_alerts.count + 1, last_at = now(),
               detail = coalesce(excluded.detail, admin_alerts.detail),
               severity = case when excluded.severity = 'critical' then 'critical'
                               else admin_alerts.severity end
           returning id, (xmax = 0) as "opened!""#,
        Uuid::new_v4(),
        alert.kind.db(),
        alert.key.chars().take(200).collect::<String>(),
        alert.severity.db(),
        alert.title.chars().take(200).collect::<String>(),
        alert
            .detail
            .as_ref()
            .map(|detail| detail.chars().take(2000).collect::<String>()),
        format!("/painel/admin?aba={}", alert.section),
    )
    .fetch_one(&state.pool)
    .await?;
    Ok(row.opened.then_some(row.id))
}

/// The admins' settings.
///
/// # Errors
///
/// Database errors.
pub async fn settings(pool: &sqlx::PgPool) -> ApiResult<AlertSettingsDto> {
    let row = sqlx::query!(
        "select email, telegram, summary, summary_hour, door_min_tickets from alert_settings where id"
    )
    .fetch_one(pool)
    .await?;
    Ok(AlertSettingsDto {
        email: row.email,
        telegram: row.telegram,
        summary: row.summary,
        summary_hour: row.summary_hour,
        door_min_tickets: row.door_min_tickets,
    })
}

async fn deliver_alert(state: &AppState, alert: &NewAlert) {
    let url = format!(
        "{}/painel/admin?aba={}",
        state.config.public_web_url, alert.section
    );
    let email = emails::admin_alert(
        &AdminAlert {
            critical: alert.severity == AlertSeverity::Critical,
            title: &alert.title,
            detail: alert.detail.as_deref(),
            url: &url,
        },
        &state.config.public_web_url,
    );
    let icon = match alert.severity {
        AlertSeverity::Critical => "🔴",
        AlertSeverity::Warning => "🟡",
    };
    let mut text = format!("{icon} {}", alert.title);
    if let Some(detail) = &alert.detail {
        text.push_str("\n\n");
        text.push_str(detail);
    }
    text.push_str("\n\n");
    text.push_str(&url);
    deliver(state, &email, &text).await;
}

/// Sends a message to every admin by e-mail and on Telegram, as the settings allow.
pub(crate) async fn deliver(
    state: &AppState,
    email: &emails::Email,
    telegram_text: &str,
) -> AlertDeliveryDto {
    let settings = match settings(&state.pool).await {
        Ok(settings) => settings,
        Err(error) => {
            tracing::error!(
                ?error,
                "alert settings unreadable; sending by every channel"
            );
            AlertSettingsDto {
                email: true,
                telegram: true,
                summary: true,
                summary_hour: 8,
                door_min_tickets: 50,
            }
        }
    };
    let mut delivery = AlertDeliveryDto {
        emails: 0,
        telegram: false,
    };
    if settings.email {
        for to in &state.config.admin_emails {
            match state.send_mail(MailKind::Alert, to, email).await {
                Ok(()) => delivery.emails += 1,
                Err(error) => tracing::error!(%error, "alert e-mail not sent"),
            }
        }
    }
    if settings.telegram && state.telegram.configured() {
        match state.telegram.send(telegram_text).await {
            Ok(()) => delivery.telegram = true,
            Err(error) => tracing::error!(%error, "alert not sent on telegram"),
        }
    }
    delivery
}

/// After every e-mail counted in the quota: warns at [`QUOTA_WARNING_PERCENT`] of the day and
/// when it runs out. Never for the alerts' own messages.
pub(crate) fn quota_alert(sent: i64, limit: i64, full: bool) -> Option<NewAlert> {
    let day = OffsetDateTime::now_utc().to_offset(BRASILIA).date();
    if full {
        return Some(NewAlert {
            kind: AlertKind::MailQuota,
            key: format!("mail_quota_full:{day}"),
            severity: AlertSeverity::Critical,
            title: "A cota diária de e-mails acabou".to_owned(),
            detail: Some(format!(
                "{sent} de {limit} e-mails nas últimas 24 horas. Códigos de acesso só por Google até a cota voltar."
            )),
            section: "emails",
        });
    }
    (sent * 100 >= limit * QUOTA_WARNING_PERCENT).then(|| NewAlert {
        kind: AlertKind::MailQuota,
        key: format!("mail_quota:{day}"),
        severity: AlertSeverity::Warning,
        title: format!("E-mails em {}% da cota do dia", sent * 100 / limit.max(1)),
        detail: Some(format!(
            "{sent} de {limit} e-mails nas últimas 24 horas (MAIL_DAILY_LIMIT)."
        )),
        section: "emails",
    })
}

/// Counts unexpected errors (500) and raises an alert when [`ERROR_THRESHOLD`] of them land in
/// [`ERROR_WINDOW`].
pub async fn watch_errors(State(state): State<AppState>, request: Request, next: Next) -> Response {
    let response = next.run(request).await;
    if response.status() == StatusCode::INTERNAL_SERVER_ERROR && state.note_server_error().await {
        tokio::spawn(raise(
            state.clone(),
            NewAlert {
                kind: AlertKind::ApiErrors,
                key: "api_errors".to_owned(),
                severity: AlertSeverity::Critical,
                title: format!(
                    "A API respondeu {ERROR_THRESHOLD} erros inesperados em {} minutos",
                    ERROR_WINDOW.as_secs() / 60
                ),
                detail: Some(
                    "Veja o log do serviço no Render: cada erro tem o x-request-id e a rota."
                        .to_owned(),
                ),
                section: "alertas",
            },
        ));
    }
    response
}

/// Large events that start within [`DOOR_LOOKAHEAD_HOURS`] with no door link (hourly).
///
/// # Errors
///
/// Database errors.
pub async fn check_doors(state: &AppState) -> ApiResult<usize> {
    let minimum = settings(&state.pool).await?.door_min_tickets;
    let events = sqlx::query!(
        r#"select e.id, e.name, e.starts_at, e.utc_offset_minutes, o.name as organization,
                  coalesce((select sum(upper(b.numbers) - lower(b.numbers)) from ticket_batches b
                            where b.event_id = e.id and b.status = 'paid'), 0)::bigint as "tickets!"
           from events e join organizations o on o.id = e.organization_id
           where e.status = 'active' and e.canceled_at is null
             and e.starts_at between now() and now() + make_interval(hours => $1)
             and not exists (select 1 from door_accesses d
                             where d.event_id = e.id and d.revoked_at is null and d.expires_at > now())"#,
        DOOR_LOOKAHEAD_HOURS,
    )
    .fetch_all(&state.pool)
    .await?;
    let mut raised = 0;
    for event in events
        .into_iter()
        .filter(|event| event.tickets >= i64::from(minimum))
    {
        let offset = UtcOffset::from_whole_seconds(i32::from(event.utc_offset_minutes) * 60)
            .unwrap_or(BRASILIA);
        let starts = event.starts_at.to_offset(offset);
        raise(
            state.clone(),
            NewAlert {
                kind: AlertKind::DoorMissing,
                key: format!("door_missing:{}", event.id),
                severity: AlertSeverity::Warning,
                title: format!("\"{}\" começa logo e não tem link da portaria", event.name),
                detail: Some(format!(
                    "{} · {} ingressos pagos · começa às {:02}:{:02} de {:02}/{:02}. Vale um contato com a organização.",
                    event.organization,
                    event.tickets,
                    starts.hour(),
                    starts.minute(),
                    starts.day(),
                    u8::from(starts.month()),
                )),
                section: "agora",
            },
        )
        .await;
        raised += 1;
    }
    Ok(raised)
}

/// Sends the daily summary once the configured hour has come (hourly; at most once a day).
///
/// # Errors
///
/// Database errors.
pub async fn maybe_send_summary(state: &AppState) -> ApiResult<bool> {
    let settings = settings(&state.pool).await?;
    let now = OffsetDateTime::now_utc().to_offset(BRASILIA);
    if !settings.summary || i32::from(now.hour()) < settings.summary_hour {
        return Ok(false);
    }
    let claimed = sqlx::query_scalar!(
        "insert into alert_digests (day) values ($1) on conflict do nothing returning day",
        now.date()
    )
    .fetch_optional(&state.pool)
    .await?;
    if claimed.is_none() {
        return Ok(false);
    }
    send_summary(state).await?;
    Ok(true)
}

/// Builds and sends the summary of the last 24 hours now.
///
/// # Errors
///
/// Database errors.
pub async fn send_summary(state: &AppState) -> ApiResult<AlertDeliveryDto> {
    let (highlights, sections) = summary_content(state).await?;
    let day = OffsetDateTime::now_utc().to_offset(BRASILIA).date();
    let day = format!(
        "{:02}/{:02}/{}",
        day.day(),
        u8::from(day.month()),
        day.year()
    );
    let url = format!("{}/painel/admin", state.config.public_web_url);
    let email = emails::admin_summary(
        &AdminSummary {
            day: &day,
            sections: &sections,
            highlights: &highlights,
            url: &url,
        },
        &state.config.public_web_url,
    );
    let mut text = format!("☀️ Resumo de {day}");
    for line in &highlights {
        text.push_str("\n• ");
        text.push_str(line);
    }
    for (title, items) in &sections {
        text.push_str("\n\n");
        text.push_str(title);
        for (label, value) in items {
            let _ = write!(text, "\n{label}: {value}");
        }
    }
    text.push_str("\n\n");
    text.push_str(&url);
    Ok(deliver(state, &email, &text).await)
}

type Sections = Vec<(String, Vec<(String, String)>)>;

/// The summary in words: the highlights and the sections with their rows.
async fn summary_content(state: &AppState) -> ApiResult<(Vec<String>, Sections)> {
    let day = sqlx::query!(
        r#"select
             (select count(*) from organizations where created_at > now() - interval '24 hours') as "organizations!",
             (select count(*) from events where created_at > now() - interval '24 hours') as "events!",
             (select count(*) from ticket_batches where paid_at > now() - interval '24 hours'
                and status in ('paid', 'refunded')) as "batches!",
             (select coalesce(sum(upper(numbers) - lower(numbers)), 0) from ticket_batches
               where paid_at > now() - interval '24 hours' and status in ('paid', 'refunded'))::bigint as "tickets!",
             (select coalesce(sum(cents), 0) from revenue_entries
               where kind = 'gross' and at > now() - interval '24 hours')::bigint as "gross!",
             (select coalesce(sum(cents), 0) from revenue_entries
               where kind = 'refund' and at > now() - interval '24 hours')::bigint as "refunds!",
             (select count(*) from mail_sends where created_at > now() - interval '24 hours'
                and status <> 'quota') as "mails!",
             (select count(*) from mail_sends where created_at > now() - interval '24 hours'
                and status in ('failed', 'bounced')) as "mail_failures!",
             (select count(*) from scans where scanned_at > now() - interval '24 hours') as "scans!""#
    )
    .fetch_one(&state.pool)
    .await?;
    let alerts = sqlx::query!(
        r#"select severity, title, count from admin_alerts where resolved_at is null
           order by (severity = 'critical') desc, last_at desc limit 8"#
    )
    .fetch_all(&state.pool)
    .await?;
    let upcoming = upcoming_section(state).await?;
    let disputes = open_disputes(state).await?;

    let mut highlights = Vec::new();
    if !alerts.is_empty() {
        highlights.push(if alerts.len() == 1 {
            "1 alerta aberto".to_owned()
        } else {
            format!("{} alertas abertos", alerts.len())
        });
    }
    if disputes > 0 {
        highlights.push(if disputes == 1 {
            "1 contestação de pagamento aberta".to_owned()
        } else {
            format!("{disputes} contestações de pagamento abertas")
        });
    }
    let mut sections: Sections = vec![(
        "Últimas 24 horas".to_owned(),
        vec![
            (
                "Organizações novas".to_owned(),
                day.organizations.to_string(),
            ),
            ("Eventos criados".to_owned(), day.events.to_string()),
            (
                "Lotes pagos".to_owned(),
                format!("{} ({} ingressos)", day.batches, day.tickets),
            ),
            ("Receita bruta".to_owned(), emails::money_long(day.gross)),
            ("Reembolsos".to_owned(), emails::money_long(day.refunds)),
            ("Leituras na portaria".to_owned(), day.scans.to_string()),
        ],
    )];
    let quota = state.config.mail_daily_limit.map_or_else(
        || day.mails.to_string(),
        |limit| format!("{} de {limit}", day.mails),
    );
    sections.push((
        "E-mails".to_owned(),
        vec![
            ("Enviados".to_owned(), quota),
            (
                "Falhas e devoluções".to_owned(),
                day.mail_failures.to_string(),
            ),
        ],
    ));
    sections.extend(upcoming);
    if !alerts.is_empty() {
        sections.push((
            "Alertas abertos".to_owned(),
            alerts
                .into_iter()
                .map(|alert| {
                    let urgency = if alert.severity == "critical" {
                        "urgente"
                    } else {
                        "atenção"
                    };
                    (alert.title, format!("{urgency} · {}×", alert.count))
                })
                .collect(),
        ));
    }
    Ok((highlights, sections))
}

/// The largest events of the next 24 hours, if any.
async fn upcoming_section(state: &AppState) -> ApiResult<Option<(String, Vec<(String, String)>)>> {
    let upcoming = sqlx::query!(
        r#"select e.name, e.starts_at, e.utc_offset_minutes, o.name as organization,
                  coalesce((select sum(upper(b.numbers) - lower(b.numbers)) from ticket_batches b
                            where b.event_id = e.id and b.status = 'paid'), 0)::bigint as "tickets!"
           from events e join organizations o on o.id = e.organization_id
           where e.status = 'active' and e.canceled_at is null
             and e.starts_at between now() and now() + interval '24 hours'
           order by 5 desc, e.starts_at limit 5"#
    )
    .fetch_all(&state.pool)
    .await?;
    if upcoming.is_empty() {
        return Ok(None);
    }
    let rows = upcoming
        .into_iter()
        .map(|event| {
            let offset = UtcOffset::from_whole_seconds(i32::from(event.utc_offset_minutes) * 60)
                .unwrap_or(BRASILIA);
            let starts = event.starts_at.to_offset(offset);
            (
                format!("{} ({})", event.name, event.organization),
                format!(
                    "{:02}/{:02} {:02}:{:02} · {} ingressos",
                    starts.day(),
                    u8::from(starts.month()),
                    starts.hour(),
                    starts.minute(),
                    event.tickets
                ),
            )
        })
        .collect();
    Ok(Some(("Eventos nas próximas 24 horas".to_owned(), rows)))
}

/// Open disputes (ADR 0104), for the summary.
async fn open_disputes(state: &AppState) -> ApiResult<i64> {
    Ok(sqlx::query_scalar!(
        r#"select count(*) as "count!" from payment_disputes
           where closed_at is null"#
    )
    .fetch_one(&state.pool)
    .await?)
}
