//! Export worker: a Postgres-backed queue processed in this same process (ADR 0008).
//!
//! Signing happens here and only here, for tickets of **paid** batches that are not voided
//! (CLAUDE.md invariant 2). Rendering runs on the blocking pool, one job at a time.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::Duration;

use sqlx::PgPool;
use ticket_core::{EventId, EventSigningKey, EventTag, KeyId, TicketIssuer, TicketNumber};
use ticket_render::{
    PrintOptions, RenderJob, TicketDesign, TicketQr, TicketToRender, WHATSAPP_WIDTH_PX,
};
use uuid::Uuid;

use crate::api::{ExportKind, ExportScope};
use crate::error::{ApiError, ApiResult};
use crate::keys;
use crate::routes::EventRow;
use crate::routes::events::load_art;
use crate::routes::exports::ExportRow;
use crate::state::AppState;

const MAX_ATTEMPTS: i16 = 3;
/// New exports wake the worker at once (`AppState::jobs`); this slow poll only recovers jobs left
/// behind by a failure. Each poll wakes Neon for its 5 idle minutes: hourly costs ~15 CU-hours a
/// month of the Free plan's 100.
const IDLE_POLL: Duration = Duration::from_hours(1);
/// A `running` export not finished after this long belongs to a process that died (a deploy
/// mid-render) and is claimed again. Keep in sync with the claim query in `process_next`.
const STALE_AFTER: Duration = Duration::from_mins(15);
/// Generated files are a cache: older ones are deleted and regenerated on demand.
const FILE_MAX_AGE: Duration = Duration::from_hours(24);

/// Where an export's file lives.
pub fn export_path(dir: &Path, export_id: Uuid, kind: ExportKind) -> PathBuf {
    dir.join(format!("{export_id}.{}", extension(kind)))
}

const fn extension(kind: ExportKind) -> &'static str {
    match kind {
        ExportKind::Whatsapp => "zip",
        ExportKind::Home | ExportKind::Print | ExportKind::Control => "pdf",
    }
}

/// MIME type of an export.
pub const fn content_type(kind: ExportKind) -> &'static str {
    match kind {
        ExportKind::Whatsapp => "application/zip",
        ExportKind::Home | ExportKind::Print | ExportKind::Control => "application/pdf",
    }
}

/// Runs forever: processes queued exports, waking on notification or every [`IDLE_POLL`].
pub async fn run_worker(state: AppState) {
    let mut last_cleanup = std::time::Instant::now();
    cleanup(&state.config.export_dir).await;
    loop {
        match process_next(&state).await {
            Ok(true) => continue,
            Ok(false) => {}
            Err(error) => tracing::error!(?error, "export worker error"),
        }
        if last_cleanup.elapsed() > Duration::from_hours(1) {
            cleanup(&state.config.export_dir).await;
            last_cleanup = std::time::Instant::now();
        }
        let wait = match next_stale(&state).await {
            Ok(wait) => wait,
            Err(error) => {
                tracing::error!(?error, "export worker error");
                IDLE_POLL
            }
        };
        let _ = tokio::time::timeout(wait, state.jobs.notified()).await;
    }
}

/// How long to sleep: until the oldest `running` export goes stale (so an export interrupted by
/// a restart resumes in minutes, not at the next hourly poll), at most [`IDLE_POLL`].
async fn next_stale(state: &AppState) -> ApiResult<Duration> {
    let oldest = sqlx::query_scalar!("select min(locked_at) from exports where status = 'running'")
        .fetch_one(&state.pool)
        .await?;
    Ok(oldest.map_or(IDLE_POLL, |locked_at| {
        let stale_at = locked_at + STALE_AFTER + Duration::from_secs(5);
        let remaining = stale_at - time::OffsetDateTime::now_utc();
        Duration::try_from(remaining)
            .unwrap_or(Duration::ZERO)
            .clamp(Duration::from_secs(5), IDLE_POLL)
    }))
}

/// Processes every queued export now (tests and graceful drains).
///
/// # Errors
///
/// Database errors.
pub async fn run_pending(state: &AppState) -> ApiResult<usize> {
    let mut processed = 0;
    while process_next(state).await? {
        processed += 1;
    }
    Ok(processed)
}

/// Claims and processes one export. Returns whether there was one.
async fn process_next(state: &AppState) -> ApiResult<bool> {
    // Stale `running` rows (crash mid-job) are retried; SKIP LOCKED lets several workers coexist.
    let Some(export) = sqlx::query_as!(
        ExportRow,
        r#"update exports set status = 'running', attempts = attempts + 1, locked_at = now()
           where id = (
               select id from exports
               where status = 'queued' or (status = 'running' and locked_at < now() - interval '15 minutes')
               order by created_at for update skip locked limit 1)
           returning id, event_id, kind, scope, crop_marks, status, ticket_count, file_name, byte_size, error, created_at"#
    )
    .fetch_optional(&state.pool)
    .await?
    else {
        return Ok(false);
    };
    let attempts = sqlx::query_scalar!("select attempts from exports where id = $1", export.id)
        .fetch_one(&state.pool)
        .await?;
    if attempts > MAX_ATTEMPTS {
        fail(&state.pool, export.id, "too_many_attempts").await?;
        return Ok(true);
    }
    match generate(state, &export).await {
        Ok((ticket_count, file_name, byte_size)) => {
            sqlx::query!(
                r#"update exports set status = 'done', ticket_count = $2, file_name = $3, byte_size = $4,
                   error = null, finished_at = now() where id = $1"#,
                export.id,
                ticket_count,
                file_name,
                byte_size
            )
            .execute(&state.pool)
            .await?;
        }
        Err(JobError::Final(code)) => fail(&state.pool, export.id, code).await?,
        Err(JobError::Retry(error)) => {
            tracing::error!(export_id = %export.id, ?error, "export failed, will retry");
            sqlx::query!(
                "update exports set status = 'queued', locked_at = null where id = $1",
                export.id
            )
            .execute(&state.pool)
            .await?;
        }
    }
    Ok(true)
}

async fn fail(pool: &PgPool, export_id: Uuid, code: &str) -> ApiResult<()> {
    sqlx::query!(
        "update exports set status = 'failed', error = $2, finished_at = now() where id = $1",
        export_id,
        code
    )
    .execute(pool)
    .await?;
    Ok(())
}

enum JobError {
    /// Will not succeed on retry; the code is shown to the user.
    Final(&'static str),
    /// Transient; retried up to [`MAX_ATTEMPTS`].
    Retry(anyhow::Error),
}

impl From<ApiError> for JobError {
    fn from(error: ApiError) -> Self {
        match error {
            ApiError::Internal(error) => Self::Retry(error),
            other => Self::Retry(anyhow::anyhow!("{other:?}")),
        }
    }
}

impl From<sqlx::Error> for JobError {
    fn from(error: sqlx::Error) -> Self {
        Self::Retry(error.into())
    }
}

struct TicketRow {
    number: i32,
    key_id: i16,
    seller: Option<String>,
}

async fn generate(state: &AppState, export: &ExportRow) -> Result<(i32, String, i64), JobError> {
    let kind = export.kind()?;
    let scope = export.scope()?;
    let event = sqlx::query_as!(
        EventRow,
        r#"select id, name, venue, starts_at, ends_at, ticket_price_cents, status, qr_tag,
                  utc_offset_minutes
           from events where id = $1"#,
        export.event_id
    )
    .fetch_one(&state.pool)
    .await?;
    let (batch_id, seller_id) = match scope {
        ExportScope::All => (None, None),
        ExportScope::Batch { batch_id } => (Some(batch_id), None),
        ExportScope::Seller { seller_id } => (None, Some(seller_id)),
    };
    // Paid, not voided, optionally restricted to a batch or a seller.
    let tickets = sqlx::query_as!(
        TicketRow,
        r#"select n as "number!", b.key_id, s.name as "seller?"
           from ticket_batches b
           cross join lateral generate_series(lower(b.numbers), upper(b.numbers) - 1) as n
           left join seller_assignments a on a.event_id = b.event_id and a.numbers @> n
           left join sellers s on s.id = a.seller_id
           where b.event_id = $1 and b.status = 'paid'
             and ($2::uuid is null or b.id = $2)
             and ($3::uuid is null or a.seller_id = $3)
             and not exists (
                 select 1 from ticket_voids v
                 where v.event_id = b.event_id and v.undone_at is null and v.numbers @> n)
           order by n"#,
        export.event_id,
        batch_id,
        seller_id,
    )
    .fetch_all(&state.pool)
    .await?;
    if tickets.is_empty() {
        return Err(JobError::Final("no_tickets"));
    }
    if tickets.len() > ticket_render::MAX_TICKETS_PER_JOB {
        return Err(JobError::Final("too_many_tickets"));
    }

    let (design, art) = current_design(state, export.event_id).await?;

    let issuers = issuers(state, export.event_id, event.qr_tag, &tickets).await?;
    let rendered: Vec<TicketToRender> = tickets
        .iter()
        .map(|ticket| {
            let number = u32::try_from(ticket.number)
                .ok()
                .and_then(TicketNumber::new)
                .ok_or(JobError::Final("invalid_number"))?;
            let issuer = issuers
                .get(&ticket.key_id)
                .ok_or(JobError::Final("missing_key"))?;
            Ok(TicketToRender {
                qr: TicketQr::Signed(issuer.issue(number)),
                seller: ticket.seller.clone(),
            })
        })
        .collect::<Result<_, JobError>>()?;
    let ticket_count =
        i32::try_from(rendered.len()).map_err(|error| JobError::Retry(error.into()))?;
    let job = RenderJob {
        details: event.details(),
        design,
        art,
        event_name: event.name.clone(),
        tickets: rendered,
    };
    let path = export_path(&state.config.export_dir, export.id, kind);
    let crop_marks = export.crop_marks;
    let write_path = path.clone();
    tokio::task::spawn_blocking(move || render_to_file(&job, kind, crop_marks, &write_path))
        .await
        .map_err(|error| JobError::Retry(error.into()))??;
    let byte_size = tokio::fs::metadata(&path)
        .await
        .map_err(|error| JobError::Retry(error.into()))?
        .len();
    let file_name = file_name(
        &event.name,
        kind,
        seller_id.and(tickets.first().and_then(|t| t.seller.as_deref())),
    );
    Ok((
        ticket_count,
        file_name,
        i64::try_from(byte_size).map_err(|error| JobError::Retry(error.into()))?,
    ))
}

/// The latest saved design and its art, or the default design.
async fn current_design(
    state: &AppState,
    event_id: Uuid,
) -> Result<(TicketDesign, Option<ticket_render::Art>), JobError> {
    let row = sqlx::query!(
        "select spec, art_blob_id from ticket_designs where event_id = $1 order by version desc limit 1",
        event_id
    )
    .fetch_optional(&state.pool)
    .await?;
    let Some(row) = row else {
        return Ok((TicketDesign::default_v1(), None));
    };
    let design: TicketDesign =
        serde_json::from_value(row.spec).map_err(|error| JobError::Retry(error.into()))?;
    let art = match row.art_blob_id {
        Some(art_id) => Some(load_art(state, event_id, art_id).await?),
        None => None,
    };
    Ok((design, art))
}

/// One issuer per key id used by the tickets. Private keys are unsealed only here.
async fn issuers(
    state: &AppState,
    event_id: Uuid,
    qr_tag: i64,
    tickets: &[TicketRow],
) -> Result<HashMap<i16, TicketIssuer>, JobError> {
    let tag = u32::try_from(qr_tag).map_err(|error| JobError::Retry(error.into()))?;
    let mut issuers = HashMap::new();
    for ticket in tickets {
        if issuers.contains_key(&ticket.key_id) {
            continue;
        }
        let sealed = sqlx::query_scalar!(
            "select sealed_private_key from event_signing_keys where event_id = $1 and key_id = $2 and status <> 'revoked'",
            event_id,
            ticket.key_id
        )
        .fetch_optional(&state.pool)
        .await?
        .ok_or(JobError::Final("missing_key"))?;
        let key_id = u8::try_from(ticket.key_id).map_err(|error| JobError::Retry(error.into()))?;
        let seed = keys::unseal(&state.config.master_key, event_id, key_id, &sealed)
            .map_err(|error| JobError::Retry(error.into()))?;
        issuers.insert(
            ticket.key_id,
            TicketIssuer::new(
                EventId::from(event_id),
                EventTag::new(tag),
                KeyId::new(key_id),
                EventSigningKey::from_seed(&seed),
            ),
        );
    }
    Ok(issuers)
}

fn render_to_file(
    job: &RenderJob,
    kind: ExportKind,
    crop_marks: bool,
    path: &Path,
) -> Result<(), JobError> {
    let render_error = |error: ticket_render::RenderError| match error {
        ticket_render::RenderError::TooLargeForA4 => JobError::Final("too_large_for_a4"),
        ticket_render::RenderError::InvalidDesign(_) => JobError::Final("invalid_design"),
        other => JobError::Retry(other.into()),
    };
    // Write to a temporary name and rename, so a download never sees a half-written file.
    let partial = path.with_extension("partial");
    match kind {
        ExportKind::Whatsapp => {
            let file =
                std::fs::File::create(&partial).map_err(|error| JobError::Retry(error.into()))?;
            let writer = ticket_render::write_whatsapp_zip(
                job,
                WHATSAPP_WIDTH_PX,
                std::io::BufWriter::new(file),
            )
            .map_err(render_error)?;
            writer
                .into_inner()
                .map_err(|error| JobError::Retry(error.into_error().into()))?
                .sync_all()
                .map_err(|error| JobError::Retry(error.into()))?;
        }
        ExportKind::Home | ExportKind::Print | ExportKind::Control => {
            let bytes = match kind {
                ExportKind::Home => ticket_render::home_pdf(job),
                ExportKind::Print => ticket_render::print_pdf(job, PrintOptions { crop_marks }),
                _ => ticket_render::control_sheet_pdf(job),
            }
            .map_err(render_error)?;
            std::fs::write(&partial, bytes).map_err(|error| JobError::Retry(error.into()))?;
        }
    }
    std::fs::rename(&partial, path).map_err(|error| JobError::Retry(error.into()))
}

/// `show-de-lancamento-grafica.pdf`, `show-de-lancamento-joao-whatsapp.zip`, ...
fn file_name(event_name: &str, kind: ExportKind, seller: Option<&str>) -> String {
    let suffix = match kind {
        ExportKind::Home => "casa-a4",
        ExportKind::Print => "grafica",
        ExportKind::Control => "controle",
        ExportKind::Whatsapp => "whatsapp",
    };
    let mut parts = vec![slug(event_name)];
    if let Some(seller) = seller {
        parts.push(slug(seller));
    }
    parts.push(suffix.to_owned());
    let base = parts
        .into_iter()
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    format!("{base}.{}", extension(kind))
}

/// ASCII slug: accents folded, everything else non-alphanumeric becomes a dash.
fn slug(text: &str) -> String {
    let folded: String = text
        .chars()
        .map(|c| match c {
            'á' | 'à' | 'â' | 'ã' | 'ä' | 'Á' | 'À' | 'Â' | 'Ã' | 'Ä' => 'a',
            'é' | 'è' | 'ê' | 'ë' | 'É' | 'È' | 'Ê' | 'Ë' => 'e',
            'í' | 'ì' | 'î' | 'ï' | 'Í' | 'Ì' | 'Î' | 'Ï' => 'i',
            'ó' | 'ò' | 'ô' | 'õ' | 'ö' | 'Ó' | 'Ò' | 'Ô' | 'Õ' | 'Ö' => 'o',
            'ú' | 'ù' | 'û' | 'ü' | 'Ú' | 'Ù' | 'Û' | 'Ü' => 'u',
            'ç' | 'Ç' => 'c',
            other if other.is_ascii_alphanumeric() => other.to_ascii_lowercase(),
            _ => '-',
        })
        .collect();
    folded
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-")
        .chars()
        .take(60)
        .collect()
}

/// Deletes cached files older than [`FILE_MAX_AGE`].
async fn cleanup(dir: &Path) {
    let Ok(mut entries) = tokio::fs::read_dir(dir).await else {
        return;
    };
    while let Ok(Some(entry)) = entries.next_entry().await {
        let expired = entry
            .metadata()
            .await
            .ok()
            .and_then(|meta| meta.modified().ok())
            .and_then(|modified| modified.elapsed().ok())
            .is_some_and(|age| age > FILE_MAX_AGE);
        if expired {
            let _ = tokio::fs::remove_file(entry.path()).await;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slugs_are_ascii() {
        assert_eq!(
            slug("Show de Lançamento — Os Impressos!"),
            "show-de-lancamento-os-impressos"
        );
        assert_eq!(slug("../../etc"), "etc");
        assert_eq!(slug("🎸"), "");
    }

    #[test]
    fn file_names() {
        assert_eq!(
            file_name("Show", ExportKind::Print, None),
            "show-grafica.pdf"
        );
        assert_eq!(
            file_name("Show", ExportKind::Whatsapp, Some("João")),
            "show-joao-whatsapp.zip"
        );
        assert_eq!(file_name("🎸", ExportKind::Home, None), "casa-a4.pdf");
    }
}
