//! Export worker: a Postgres-backed queue processed in this same process (ADR 0008).
//!
//! Signing happens here and only here, for tickets of **paid** batches that are not voided
//! (CLAUDE.md invariant 2): for the files, and for digital tickets through [`sign_numbers`].
//! Rendering runs on the blocking pool, one job at a time. The hourly cleanup also prunes rows
//! kept only for a while (IP hashes, old login codes, expired sessions).

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::Duration;

use sqlx::PgPool;
use ticket_core::{EventId, EventSigningKey, EventTag, KeyId, TicketIssuer, TicketNumber};
use ticket_render::{
    PrintOptions, RenderJob, TicketDesign, TicketQr, TicketToRender, WHATSAPP_WIDTH_PX,
};
use uuid::Uuid;

use crate::api::{ExportKind, ExportScope, PaperKind};
use crate::error::{ApiError, ApiResult};
use crate::keys;
use crate::routes::EventRow;
use crate::routes::events::load_art;
use crate::routes::exports::ExportRow;
use crate::state::AppState;

const MAX_ATTEMPTS: i16 = 3;
/// Wait before starting the worker again after it died ([`supervise`]).
const RESTART_PAUSE: Duration = Duration::from_secs(5);
/// Pause before a failed export is tried again, per attempt made: a database or disk hiccup
/// would otherwise burn every attempt within a second.
const RETRY_PAUSE: Duration = Duration::from_secs(5);
/// Rows of `exports` are kept this long (their files last a day, ADR 0008): the panel lists only
/// the recent ones, and the table must not grow forever.
const EXPORT_ROWS_MAX_AGE_DAYS: i32 = 30;
/// New exports wake the worker at once (`AppState::jobs`); this slow poll only recovers jobs left
/// behind by a failure. Each poll wakes Neon for its 5 idle minutes: hourly costs ~15 CU-hours a
/// month of the Free plan's 100.
const IDLE_POLL: Duration = Duration::from_hours(1);
/// A `running` export not finished after this long belongs to a process that died (a deploy
/// mid-render) and is claimed again. Keep in sync with the claim query in `process_next`.
const STALE_AFTER: Duration = Duration::from_mins(15);
/// Generated files are a cache: older ones are deleted and regenerated on demand.
const FILE_MAX_AGE: Duration = Duration::from_hours(24);
/// Digital ticket images (`ticket-*.jpg`, ADR 0030) are small and asked again on the day of the
/// event by everyone who opened the link weeks before: they stay, so that day is file reads, not
/// renders. Their name changes with the design and the event details (`routes::tickets::image`).
const TICKET_IMAGE_MAX_AGE: Duration = Duration::from_hours(30 * 24);

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

/// Keeps the worker running: in a build that unwinds (development, tests), a panic inside a job
/// would otherwise end the task silently, leaving every export queued until the next deploy, with
/// the status page only noticing an hour later. The worker is started again after a pause; it
/// returns on its own only when the process is stopping. (The release profile aborts on panic:
/// there the whole process restarts, which recovers the worker too.)
pub async fn supervise(state: AppState) {
    loop {
        match tokio::spawn(run_worker(state.clone())).await {
            Ok(()) => return,
            Err(error) => {
                tracing::error!(
                    ?error,
                    "export worker stopped unexpectedly; starting it again"
                );
                tokio::time::sleep(RESTART_PAUSE).await;
            }
        }
    }
}

/// Processes queued exports, waking on notification or every [`IDLE_POLL`], until the process
/// stops ([`AppState::begin_shutdown`]): the job in hand is finished, no other is claimed.
pub async fn run_worker(state: AppState) {
    let mut last_cleanup = std::time::Instant::now();
    cleanup(&state.config.export_dir).await;
    // Announcement e-mails left waiting by a restart (ADR 0107).
    crate::mailings::wake(&state);
    loop {
        if state.shutting_down() {
            return;
        }
        state.worker_tick();
        match process_next(&state).await {
            Ok(true) => continue,
            Ok(false) => {}
            Err(error) => tracing::error!(?error, "export worker error"),
        }
        if last_cleanup.elapsed() > Duration::from_hours(1) {
            cleanup(&state.config.export_dir).await;
            if let Err(error) = prune(&state.pool).await {
                tracing::error!(?error, "pruning old rows failed");
            }
            // The admins' hourly checks (ADR 0103): a large event about to start without a door
            // link, and the morning summary.
            if let Err(error) = crate::alerts::check_doors(&state).await {
                tracing::error!(?error, "door check failed");
            }
            if let Err(error) = crate::alerts::maybe_send_summary(&state).await {
                tracing::error!(?error, "daily summary failed");
            }
            // Announcements whose e-mail waited for their start (ADR 0109), and the ones held for
            // the quota, which go on as the day's count goes down.
            if let Err(error) = crate::routes::announcements::queue_due_emails(&state).await {
                tracing::error!(?error, "announcement e-mails not queued");
            }
            crate::mailings::wake(&state);
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
    let Some(claimed) = sqlx::query!(
        r#"update exports set status = 'running', attempts = attempts + 1, locked_at = now()
           where id = (
               select id from exports
               where status = 'queued' or (status = 'running' and locked_at < now() - interval '15 minutes')
               order by created_at for update skip locked limit 1)
           returning id, event_id, kind, scope, crop_marks, paper, status, ticket_count, file_name, byte_size, error, created_at, attempts"#
    )
    .fetch_optional(&state.pool)
    .await?
    else {
        return Ok(false);
    };
    let attempts = claimed.attempts;
    let export = ExportRow {
        id: claimed.id,
        event_id: claimed.event_id,
        kind: claimed.kind,
        scope: claimed.scope,
        crop_marks: claimed.crop_marks,
        paper: claimed.paper,
        status: claimed.status,
        ticket_count: claimed.ticket_count,
        file_name: claimed.file_name,
        byte_size: claimed.byte_size,
        error: claimed.error,
        created_at: claimed.created_at,
    };
    if attempts > MAX_ATTEMPTS {
        fail(&state.pool, export.id, "too_many_attempts").await?;
        // Every attempt failed: something the organizer cannot fix (ADR 0103).
        crate::alerts::raise(
            state.clone(),
            crate::alerts::NewAlert {
                kind: crate::api::AlertKind::ExportFailed,
                key: format!("export_failed:{}", export.event_id),
                severity: crate::api::AlertSeverity::Warning,
                title: "Um arquivo de impressão falhou em todas as tentativas".to_owned(),
                detail: Some(format!(
                    "Arquivo {} do evento {}. Veja o log do worker no Render.",
                    export.kind, export.event_id
                )),
                section: "eventos",
            },
        )
        .await;
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
            tokio::time::sleep(RETRY_PAUSE * u32::try_from(attempts).unwrap_or(1).max(1)).await;
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

/// Category and seat of every number (ADR 0056, 0057).
async fn ticket_tags(
    state: &AppState,
    event_id: Uuid,
) -> Result<crate::routes::categories::NumberTags, JobError> {
    crate::routes::categories::NumberTags::load(&state.pool, event_id)
        .await
        .map_err(|error| JobError::Retry(anyhow::anyhow!("{error:?}")))
}

async fn generate(state: &AppState, export: &ExportRow) -> Result<(i32, String, i64), JobError> {
    let kind = export.kind()?;
    let scope = export.scope()?;
    let event = sqlx::query_as!(
        EventRow,
        r#"select id, name, venue, starts_at, ends_at, ticket_price_cents, status, qr_tag, utc_offset_minutes,
                  address, postponed_from_starts_at, postponed_at, postpone_reason, canceled_at, cancel_reason, kind
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
    // Flagged after the export was queued (ADR 0042).
    match crate::moderation::ensure_event_printable(&state.pool, export.event_id).await {
        Err(ApiError::Conflict(code, _)) => return Err(JobError::Final(code)),
        Err(other) => return Err(JobError::Retry(anyhow::anyhow!("{other:?}"))),
        Ok(()) => {}
    }
    if tickets.len() > ticket_render::MAX_TICKETS_PER_JOB {
        return Err(JobError::Final("too_many_tickets"));
    }

    let (design, art, sponsors) = current_design(state, export.event_id).await?;

    let issuers = issuers(state, export.event_id, event.qr_tag, &tickets).await?;
    let tags = ticket_tags(state, export.event_id).await?;
    let ticket_count =
        i32::try_from(tickets.len()).map_err(|error| JobError::Retry(error.into()))?;
    let details = crate::routes::event_details(&state.pool, &event).await?;
    let event_name = event.name.clone();
    let tokens = event.tokens();
    let first_seller = tickets.first().and_then(|ticket| ticket.seller.clone());
    let path = export_path(&state.config.export_dir, export.id, kind);
    let crop_marks = export.crop_marks;
    let paper_kind = export.paper()?;
    let paper = paper_kind.render();
    let write_path = path.clone();
    // Rendering shares the two slots of the design previews and the ticket images: the single
    // instance never decodes and draws more than two big jobs at once (memory, ADR 0015).
    let _permit = state
        .render_permits
        .clone()
        .acquire_owned()
        .await
        .map_err(|error| JobError::Retry(error.into()))?;
    // Signing thousands of tickets is CPU work like the rendering: both stay off the runtime.
    tokio::task::spawn_blocking(move || {
        let rendered = sign_tickets(&tickets, &issuers, &tags)?;
        let job = RenderJob {
            tokens,
            details,
            design,
            art,
            sponsors,
            event_name,
            tickets: rendered,
        };
        render_to_file(&job, kind, crop_marks, paper, &write_path)
    })
    .await
    .map_err(|error| JobError::Retry(error.into()))??;
    let byte_size = tokio::fs::metadata(&path)
        .await
        .map_err(|error| JobError::Retry(error.into()))?
        .len();
    let file_name = file_name(
        &event.name,
        kind,
        paper_kind,
        seller_id.and(first_seller.as_deref()),
    );
    Ok((
        ticket_count,
        file_name,
        i64::try_from(byte_size).map_err(|error| JobError::Retry(error.into()))?,
    ))
}

/// The latest saved design, its art and its sponsors' logos, or the default design.
pub(crate) async fn current_design(
    state: &AppState,
    event_id: Uuid,
) -> ApiResult<(
    TicketDesign,
    Option<ticket_render::Art>,
    Vec<ticket_render::Art>,
)> {
    let row = sqlx::query!(
        "select spec, art_blob_id, sponsor_blob_ids from ticket_designs where event_id = $1 order by version desc limit 1",
        event_id
    )
    .fetch_optional(&state.pool)
    .await?;
    let Some(row) = row else {
        // Never saved: the default of the event's kind, a ficha for consumption tokens (ADR 0086).
        let tokens = sqlx::query_scalar!(
            r#"select kind = 'tokens' as "tokens!" from events where id = $1"#,
            event_id
        )
        .fetch_one(&state.pool)
        .await?;
        return Ok((TicketDesign::default_for(tokens), None, Vec::new()));
    };
    let design: TicketDesign =
        serde_json::from_value(row.spec).map_err(|error| ApiError::Internal(error.into()))?;
    let art = match row.art_blob_id {
        Some(art_id) => Some(load_art(state, event_id, art_id).await?),
        None => None,
    };
    let sponsors = crate::routes::events::load_arts(state, event_id, &row.sponsor_blob_ids).await?;
    Ok((design, art, sponsors))
}

/// Signs the QR texts of `numbers` (number, key id) for a digital ticket (ADR 0030): the same
/// signature the printed ticket carries. Callers pass only numbers of paid, non-voided batches
/// (CLAUDE.md invariant 2); keys are unsealed here, like for the files.
pub(crate) async fn sign_numbers(
    state: &AppState,
    event_id: Uuid,
    qr_tag: i64,
    numbers: &[(i32, i16)],
) -> ApiResult<Vec<(i32, String)>> {
    let tickets: Vec<TicketRow> = numbers
        .iter()
        .map(|(number, key_id)| TicketRow {
            number: *number,
            key_id: *key_id,
            seller: None,
        })
        .collect();
    let issuers =
        issuers(state, event_id, qr_tag, &tickets)
            .await
            .map_err(|error| match error {
                JobError::Final(code) => {
                    ApiError::Internal(anyhow::anyhow!("signing failed: {code}"))
                }
                JobError::Retry(error) => ApiError::Internal(error),
            })?;
    tickets
        .iter()
        .map(|ticket| {
            let number = u32::try_from(ticket.number)
                .ok()
                .and_then(TicketNumber::new)
                .ok_or_else(|| ApiError::Internal(anyhow::anyhow!("invalid number")))?;
            let issuer = issuers
                .get(&ticket.key_id)
                .ok_or_else(|| ApiError::Internal(anyhow::anyhow!("missing key")))?;
            Ok((ticket.number, issuer.issue(number).to_qr_text()))
        })
        .collect()
}

/// The QR texts of credentials (ADR 0111), signed with the event's active key. Credentials are
/// not tickets: their numbers are above every ticket's, and only `routes::credentials` asks for
/// them, for the badges of credentials not revoked.
pub(crate) async fn sign_credentials(
    state: &AppState,
    event_id: Uuid,
    qr_tag: i64,
    numbers: &[i32],
) -> ApiResult<Vec<(i32, String)>> {
    let key_id = sqlx::query_scalar!(
        "select key_id from event_signing_keys where event_id = $1 and status = 'active'",
        event_id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| ApiError::Internal(anyhow::anyhow!("event without an active key")))?;
    let pairs: Vec<(i32, i16)> = numbers.iter().map(|number| (*number, key_id)).collect();
    sign_numbers(state, event_id, qr_tag, &pairs).await
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

/// The QR of every ticket, signed with the key of its batch, with its category and seat.
fn sign_tickets(
    tickets: &[TicketRow],
    issuers: &HashMap<i16, TicketIssuer>,
    tags: &crate::routes::categories::NumberTags,
) -> Result<Vec<TicketToRender>, JobError> {
    tickets
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
                category: tags.category(ticket.number),
                seat: tags.seat(ticket.number),
            })
        })
        .collect()
}

fn render_to_file(
    job: &RenderJob,
    kind: ExportKind,
    crop_marks: bool,
    paper: ticket_render::Paper,
    path: &Path,
) -> Result<(), JobError> {
    let render_error = |error: ticket_render::RenderError| match error {
        ticket_render::RenderError::TooLargeForA4 => JobError::Final("too_large_for_a4"),
        // The design changed after the file was asked for (ADR 0102).
        ticket_render::RenderError::PaperTooSmall => JobError::Final("paper_too_small"),
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
                ExportKind::Home => ticket_render::home_pdf_on(job, paper),
                ExportKind::Print => ticket_render::print_pdf(job, PrintOptions { crop_marks }),
                _ => ticket_render::control_sheet_pdf(job),
            }
            .map_err(render_error)?;
            std::fs::write(&partial, bytes).map_err(|error| JobError::Retry(error.into()))?;
        }
    }
    std::fs::rename(&partial, path).map_err(|error| JobError::Retry(error.into()))
}

/// `show-de-lancamento-grafica.pdf`, `show-de-lancamento-joao-whatsapp.zip`,
/// `show-etiquetas-21.pdf` (ADR 0102)...
fn file_name(event_name: &str, kind: ExportKind, paper: PaperKind, seller: Option<&str>) -> String {
    let suffix = match (kind, paper) {
        (ExportKind::Home, PaperKind::Plain) => "casa-a4",
        (ExportKind::Home, PaperKind::Perforated3) => "picotado-3",
        (ExportKind::Home, PaperKind::Perforated4) => "picotado-4",
        (ExportKind::Home, PaperKind::Perforated6) => "picotado-6",
        (ExportKind::Home, PaperKind::Perforated8) => "picotado-8",
        (ExportKind::Home, PaperKind::Perforated10) => "picotado-10",
        (ExportKind::Home, PaperKind::Labels21) => "etiquetas-21",
        (ExportKind::Home, PaperKind::Labels14) => "etiquetas-14",
        (ExportKind::Home, PaperKind::Labels8) => "etiquetas-8",
        (ExportKind::Home, PaperKind::Labels2) => "etiquetas-2",
        (ExportKind::Print, _) => "grafica",
        (ExportKind::Control, _) => "controle",
        (ExportKind::Whatsapp, _) => "whatsapp",
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
pub(crate) fn slug(text: &str) -> String {
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

/// Forgets what is only needed for a while (ADRs 0028, 0033): the IP hashes of login codes within a
/// day (the hourly run keeps them under 24 hours), login codes and the e-mail counter after a
/// month, expired sessions.
async fn prune(pool: &PgPool) -> ApiResult<()> {
    sqlx::query!(
        "update login_codes set ip_hash = null where ip_hash is not null and created_at < now() - interval '23 hours'"
    )
    .execute(pool)
    .await?;
    sqlx::query!("delete from login_codes where created_at < now() - interval '30 days'")
        .execute(pool)
        .await?;
    sqlx::query!("delete from mail_sends where created_at < now() - interval '30 days'")
        .execute(pool)
        .await?;
    sqlx::query!("delete from sessions where expires_at < now()")
        .execute(pool)
        .await?;
    sqlx::query!("delete from download_links where expires_at < now() - interval '1 hour'")
        .execute(pool)
        .await?;
    sqlx::query!("delete from second_factor_attempts where created_at < now() - interval '1 day'")
        .execute(pool)
        .await?;
    sqlx::query!("delete from notifications where created_at < now() - interval '180 days'")
        .execute(pool)
        .await?;
    sqlx::query!("delete from moderation_usage where day < current_date - 60")
        .execute(pool)
        .await?;
    // An expired reservation frees its numbers by itself (ADR 0072); the seller still sees it for
    // a week, to sell it late or give it up.
    sqlx::query!("delete from ticket_reservations where expires_at < now() - interval '7 days'")
        .execute(pool)
        .await?;
    // The answers kept for repeated changes of the seller's page (ADR 0074): a phone retries
    // within hours, not weeks.
    sqlx::query!("delete from seller_sync_ops where created_at < now() - interval '30 days'")
        .execute(pool)
        .await?;
    // Old export rows (their files went long ago; the download links go with them).
    sqlx::query!(
        "delete from exports where created_at < now() - make_interval(days => $1::int)",
        EXPORT_ROWS_MAX_AGE_DAYS,
    )
    .execute(pool)
    .await?;
    // Art nobody saved in a design (an abandoned try, a replaced upload), once the editor's undo
    // no longer needs it. Uploads do the same for their own event; this covers every event, so
    // one organization's trials never fill its quota or the database (images under review or
    // refused stay for the admins).
    sqlx::query!(
        r#"delete from blobs b where b.event_id is not null
           and b.created_at < now() - interval '2 hours'
           and b.moderation_status not in ('flagged', 'rejected')
           and not exists (select 1 from ticket_designs d
                           where d.art_blob_id = b.id or b.id = any(d.sponsor_blob_ids))"#
    )
    .execute(pool)
    .await?;
    Ok(())
}

/// Deletes cached files older than [`FILE_MAX_AGE`] ([`TICKET_IMAGE_MAX_AGE`] for ticket images).
async fn cleanup(dir: &Path) {
    let Ok(mut entries) = tokio::fs::read_dir(dir).await else {
        return;
    };
    while let Ok(Some(entry)) = entries.next_entry().await {
        let max_age = if entry.file_name().to_string_lossy().starts_with("ticket-") {
            TICKET_IMAGE_MAX_AGE
        } else {
            FILE_MAX_AGE
        };
        let expired = entry
            .metadata()
            .await
            .ok()
            .and_then(|meta| meta.modified().ok())
            .and_then(|modified| modified.elapsed().ok())
            .is_some_and(|age| age > max_age);
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
            file_name("Show", ExportKind::Print, PaperKind::Plain, None),
            "show-grafica.pdf"
        );
        assert_eq!(
            file_name("Show", ExportKind::Whatsapp, PaperKind::Plain, Some("João")),
            "show-joao-whatsapp.zip"
        );
        assert_eq!(
            file_name("🎸", ExportKind::Home, PaperKind::Plain, None),
            "casa-a4.pdf"
        );
        assert_eq!(
            file_name("Arraiá", ExportKind::Home, PaperKind::Labels21, None),
            "arraia-etiquetas-21.pdf"
        );
    }
}
