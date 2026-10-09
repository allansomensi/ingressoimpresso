//! Door (ADRs 0006, 0007): access links managed by the organizer, phones registered through
//! them, the offline manifest and the append-only scan log.

use axum::Json;
use axum::extract::{FromRequestParts, Path, Query, State};
use axum::http::StatusCode;
use axum::http::request::Parts;
use serde::Deserialize;
use sqlx::postgres::types::PgRange;
use sqlx::{Postgres, Transaction};
use time::{Duration, OffsetDateTime};
use uuid::Uuid;

use super::{authorize_event, bounds};
use crate::api::{
    CreateDoorAccessBody, CreatedDoorAccess, DoorAccessDto, DoorDeviceDto, DoorEntryDto,
    DoorEventInfo, DoorFirstEntryDto, DoorKeyDto, DoorManifest, DoorOverviewDto, DoorRegisterBody,
    DoorRegistration, DoorScanResult, DoorScanUpload, DoorScansBody, DoorScansResponse,
    DoorSellerRangeDto, DoorVerifierDto, DoorVoidDto, KeyStatus, ScanClass, ScanOutcome,
    VoidReason,
};
use crate::auth::{AuthUser, bearer_token, new_token, token_hash};
use crate::error::{ApiError, ApiResult, bad_request};
use crate::state::AppState;

/// Links keep working until the end of the event plus this grace (ADR 0007).
pub(crate) const ACCESS_GRACE: Duration = Duration::hours(12);
const MAX_DEVICES_PER_ACCESS: i64 = 50;
const MAX_SCANS_PER_UPLOAD: usize = 500;
const MAX_LABEL_CHARS: usize = 60;
const MAX_DEVICE_NAME_CHARS: usize = 40;
/// `last_seen_at` is written at most this often per phone (it syncs every few seconds).
const LAST_SEEN_EVERY_SECONDS: f64 = 10.0;
/// Printed digits when the event has no saved design yet (the default design's).
const DEFAULT_DIGITS: i32 = 4;

// Organizer ------------------------------------------------------------------------------

struct AccessRow {
    id: Uuid,
    label: String,
    expires_at: OffsetDateTime,
    revoked_at: Option<OffsetDateTime>,
    created_at: OffsetDateTime,
}

impl From<AccessRow> for DoorAccessDto {
    fn from(row: AccessRow) -> Self {
        Self {
            id: row.id,
            label: row.label,
            expires_at: row.expires_at,
            revoked_at: row.revoked_at,
            created_at: row.created_at,
        }
    }
}

struct DeviceRow {
    id: Uuid,
    door_access_id: Uuid,
    name: String,
    created_at: OffsetDateTime,
    last_seen_at: Option<OffsetDateTime>,
    revoked_at: Option<OffsetDateTime>,
    scan_count: i64,
}

impl From<DeviceRow> for DoorDeviceDto {
    fn from(row: DeviceRow) -> Self {
        Self {
            id: row.id,
            access_id: row.door_access_id,
            name: row.name,
            created_at: row.created_at,
            last_seen_at: row.last_seen_at,
            revoked_at: row.revoked_at,
            scan_count: row.scan_count,
        }
    }
}

/// `GET /api/events/{id}/door`: links, phones and the entry count.
pub async fn overview(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
) -> ApiResult<Json<DoorOverviewDto>> {
    authorize_event(&state.pool, &user, event_id).await?;
    let accesses = sqlx::query_as!(
        AccessRow,
        "select id, label, expires_at, revoked_at, created_at from door_accesses where event_id = $1 order by created_at desc",
        event_id
    )
    .fetch_all(&state.pool)
    .await?;
    let devices = sqlx::query_as!(
        DeviceRow,
        r#"select d.id, d.door_access_id, d.name, d.created_at, d.last_seen_at, d.revoked_at,
                  (select count(*) from scans s where s.device_id = d.id) as "scan_count!"
           from door_devices d where d.event_id = $1 order by d.created_at desc"#,
        event_id
    )
    .fetch_all(&state.pool)
    .await?;
    let entry_count = sqlx::query_scalar!(
        r#"select count(*) as "count!" from entries where event_id = $1"#,
        event_id
    )
    .fetch_one(&state.pool)
    .await?;
    Ok(Json(DoorOverviewDto {
        accesses: accesses.into_iter().map(Into::into).collect(),
        devices: devices.into_iter().map(Into::into).collect(),
        entry_count,
    }))
}

/// `POST /api/events/{id}/door/accesses`: a new link; its token is returned only here.
pub async fn create_access(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
    Json(body): Json<CreateDoorAccessBody>,
) -> ApiResult<(StatusCode, Json<CreatedDoorAccess>)> {
    let event = authorize_event(&state.pool, &user, event_id).await?;
    let label = body.label.trim();
    if label.is_empty() || label.chars().count() > MAX_LABEL_CHARS {
        return Err(bad_request(
            "invalid_label",
            format!("label must have 1–{MAX_LABEL_CHARS} characters"),
        ));
    }
    let (token, hash) = new_token()?;
    let row = sqlx::query_as!(
        AccessRow,
        r#"insert into door_accesses (id, event_id, label, token_hash, expires_at, created_by)
           values ($1, $2, $3, $4, $5, $6)
           returning id, label, expires_at, revoked_at, created_at"#,
        Uuid::new_v4(),
        event_id,
        label,
        hash,
        event.ends_at + ACCESS_GRACE,
        user.id,
    )
    .fetch_one(&state.pool)
    .await?;
    Ok((
        StatusCode::CREATED,
        Json(CreatedDoorAccess {
            access: row.into(),
            token,
        }),
    ))
}

/// `POST /api/door-accesses/{id}/revoke`: cuts the link and every phone registered with it.
pub async fn revoke_access(
    State(state): State<AppState>,
    user: AuthUser,
    Path(access_id): Path<Uuid>,
) -> ApiResult<Json<DoorAccessDto>> {
    let event_id = sqlx::query_scalar!(
        "select event_id from door_accesses where id = $1",
        access_id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound)?;
    authorize_event(&state.pool, &user, event_id).await?;
    let row = sqlx::query_as!(
        AccessRow,
        r#"update door_accesses set revoked_at = coalesce(revoked_at, now()) where id = $1
           returning id, label, expires_at, revoked_at, created_at"#,
        access_id
    )
    .fetch_one(&state.pool)
    .await?;
    Ok(Json(row.into()))
}

/// `POST /api/door-devices/{id}/revoke`: cuts one phone.
pub async fn revoke_device(
    State(state): State<AppState>,
    user: AuthUser,
    Path(device_id): Path<Uuid>,
) -> ApiResult<Json<DoorDeviceDto>> {
    let event_id =
        sqlx::query_scalar!("select event_id from door_devices where id = $1", device_id)
            .fetch_optional(&state.pool)
            .await?
            .ok_or(ApiError::NotFound)?;
    authorize_event(&state.pool, &user, event_id).await?;
    let row = sqlx::query_as!(
        DeviceRow,
        r#"update door_devices set revoked_at = coalesce(revoked_at, now()) where id = $1
           returning id, door_access_id, name, created_at, last_seen_at, revoked_at,
                     (select count(*) from scans s where s.device_id = $1) as "scan_count!""#,
        device_id
    )
    .fetch_one(&state.pool)
    .await?;
    Ok(Json(row.into()))
}

// Door phones ----------------------------------------------------------------------------

/// A registered phone (`Authorization: Bearer <device secret>`) whose phone and link are
/// neither revoked nor expired.
#[derive(Debug, Clone)]
pub struct DoorDevice {
    /// Device id.
    pub id: Uuid,
    /// Its event.
    pub event_id: Uuid,
    /// Its name.
    pub name: String,
}

impl FromRequestParts<AppState> for DoorDevice {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let hash = token_hash(bearer_token(parts)?);
        let device = sqlx::query_as!(
            DoorDevice,
            r#"select d.id, d.event_id, d.name from door_devices d
               join door_accesses a on a.id = d.door_access_id
               where d.secret_hash = $1 and d.revoked_at is null and a.revoked_at is null
                 and a.expires_at > now()"#,
            hash,
        )
        .fetch_optional(&state.pool)
        .await?
        .ok_or(ApiError::Unauthorized)?;
        sqlx::query!(
            r#"update door_devices set last_seen_at = now()
               where id = $1 and (last_seen_at is null or last_seen_at < now() - make_interval(secs => $2))"#,
            device.id,
            LAST_SEEN_EVERY_SECONDS,
        )
        .execute(&state.pool)
        .await?;
        Ok(device)
    }
}

/// `POST /api/door/register`: trades the link token for this phone's own secret.
pub async fn register(
    State(state): State<AppState>,
    Json(body): Json<DoorRegisterBody>,
) -> ApiResult<(StatusCode, Json<DoorRegistration>)> {
    let name = body.device_name.trim();
    if name.is_empty() || name.chars().count() > MAX_DEVICE_NAME_CHARS {
        return Err(bad_request(
            "invalid_device_name",
            format!("device name must have 1–{MAX_DEVICE_NAME_CHARS} characters"),
        ));
    }
    let access = sqlx::query!(
        r#"select a.id, a.event_id,
                  (select count(*) from door_devices d where d.door_access_id = a.id) as "devices!"
           from door_accesses a
           where a.token_hash = $1 and a.revoked_at is null and a.expires_at > now()"#,
        token_hash(body.access_token.trim()),
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::Unauthorized)?;
    if access.devices >= MAX_DEVICES_PER_ACCESS {
        return Err(ApiError::Conflict(
            "too_many_devices",
            format!("a link registers at most {MAX_DEVICES_PER_ACCESS} phones"),
        ));
    }
    let (secret, secret_hash) = new_token()?;
    let device_id = Uuid::new_v4();
    sqlx::query!(
        r#"insert into door_devices (id, door_access_id, event_id, name, secret_hash, last_seen_at)
           values ($1, $2, $3, $4, $5, now())"#,
        device_id,
        access.id,
        access.event_id,
        name,
        secret_hash,
    )
    .execute(&state.pool)
    .await?;
    Ok((
        StatusCode::CREATED,
        Json(DoorRegistration {
            device_id,
            device_name: name.to_owned(),
            device_secret: secret,
            event: event_info(&state, access.event_id).await?,
        }),
    ))
}

async fn event_info(state: &AppState, event_id: Uuid) -> ApiResult<DoorEventInfo> {
    let row = sqlx::query!(
        r#"select e.id, e.name, e.venue, e.starts_at, e.ends_at,
                  coalesce((select (spec -> 'number' ->> 'digits')::int from ticket_designs
                            where event_id = e.id order by version desc limit 1), $2) as "digits!"
           from events e where e.id = $1"#,
        event_id,
        DEFAULT_DIGITS,
    )
    .fetch_one(&state.pool)
    .await?;
    Ok(DoorEventInfo {
        id: row.id,
        name: row.name,
        venue: row.venue,
        starts_at: row.starts_at,
        ends_at: row.ends_at,
        number_digits: u8::try_from(row.digits)
            .map_err(|_| ApiError::Internal(anyhow::anyhow!("invalid digits {}", row.digits)))?,
    })
}

/// `?since=` of the manifest.
#[derive(Debug, Deserialize)]
pub struct ManifestQuery {
    since: Option<String>,
}

/// `GET /api/door/manifest?since=<cursor>`: keys, voids and sellers whole, admitted scans
/// since the cursor.
///
/// The cursor is a transaction id: rows are served only below the current snapshot's `xmin`,
/// so a transaction that commits late can never be skipped (outbox pattern, ADR 0006).
pub async fn manifest(
    State(state): State<AppState>,
    device: DoorDevice,
    Query(query): Query<ManifestQuery>,
) -> ApiResult<Json<DoorManifest>> {
    let since: i64 = match query.since.as_deref() {
        None | Some("") => 0,
        Some(cursor) => cursor
            .parse()
            .ok()
            .filter(|value| *value >= 0)
            .ok_or_else(|| bad_request("invalid_cursor", "cursor must come from a manifest"))?,
    };
    let event_id = device.event_id;
    let event = event_info(&state, event_id).await?;
    let verifier = verifier(&state, event_id).await?;
    let voids = active_voids(&state, event_id).await?;
    let sellers = seller_ranges(&state, event_id).await?;
    // Every transaction below xmin has finished: its rows are visible to the next statement.
    let xmin = sqlx::query_scalar!(
        r#"select pg_snapshot_xmin(pg_current_snapshot())::text::bigint as "xmin!""#
    )
    .fetch_one(&state.pool)
    .await?;
    let entries = entries_between(&state, event_id, since, xmin).await?;
    Ok(Json(DoorManifest {
        device_id: device.id,
        device_name: device.name,
        event,
        verifier,
        voids,
        sellers,
        entries,
        cursor: since.max(xmin).to_string(),
        server_time_ms: unix_ms(OffsetDateTime::now_utc()),
    }))
}

async fn verifier(state: &AppState, event_id: Uuid) -> ApiResult<DoorVerifierDto> {
    let tag = sqlx::query_scalar!("select qr_tag from events where id = $1", event_id)
        .fetch_one(&state.pool)
        .await?;
    let keys = sqlx::query!(
        "select key_id, public_key, status from event_signing_keys where event_id = $1 order by key_id",
        event_id
    )
    .fetch_all(&state.pool)
    .await?
    .into_iter()
    .map(|row| {
        Ok(DoorKeyDto {
            key_id: u8::try_from(row.key_id).map_err(|error| ApiError::Internal(error.into()))?,
            public_key: hex::encode(&row.public_key),
            status: KeyStatus::from_db(&row.status).ok_or_else(|| {
                ApiError::Internal(anyhow::anyhow!("unknown key status {}", row.status))
            })?,
        })
    })
    .collect::<ApiResult<Vec<_>>>()?;
    Ok(DoorVerifierDto {
        event_id: event_id.hyphenated().to_string(),
        event_tag: u32::try_from(tag).map_err(|error| ApiError::Internal(error.into()))?,
        keys,
    })
}

async fn active_voids(state: &AppState, event_id: Uuid) -> ApiResult<Vec<DoorVoidDto>> {
    sqlx::query!(
        "select numbers, reason from ticket_voids where event_id = $1 and undone_at is null order by lower(numbers)",
        event_id
    )
    .fetch_all(&state.pool)
    .await?
    .into_iter()
    .map(|row| {
        let (first, last) = unsigned_bounds(&row.numbers)?;
        Ok(DoorVoidDto {
            first,
            last,
            reason: VoidReason::from_db(&row.reason).ok_or_else(|| {
                ApiError::Internal(anyhow::anyhow!("unknown void reason {}", row.reason))
            })?,
        })
    })
    .collect()
}

async fn seller_ranges(state: &AppState, event_id: Uuid) -> ApiResult<Vec<DoorSellerRangeDto>> {
    sqlx::query!(
        r#"select s.name, a.numbers from seller_assignments a join sellers s on s.id = a.seller_id
           where a.event_id = $1 order by lower(a.numbers)"#,
        event_id
    )
    .fetch_all(&state.pool)
    .await?
    .into_iter()
    .map(|row| {
        let (first, last) = unsigned_bounds(&row.numbers)?;
        Ok(DoorSellerRangeDto {
            seller: row.name,
            first,
            last,
        })
    })
    .collect()
}

/// Admitted scans of every phone written by transactions in `[since, until)`.
async fn entries_between(
    state: &AppState,
    event_id: Uuid,
    since: i64,
    until: i64,
) -> ApiResult<Vec<DoorEntryDto>> {
    sqlx::query!(
        r#"select s.id, s.ticket_number as "ticket_number!", s.scanned_at, d.name
           from scans s join door_devices d on d.id = s.device_id
           where s.event_id = $1 and s.local_outcome = 'admitted'
             and s.txid >= $2::bigint::text::xid8 and s.txid < $3::bigint::text::xid8
           order by s.txid, s.id"#,
        event_id,
        since,
        until,
    )
    .fetch_all(&state.pool)
    .await?
    .into_iter()
    .map(|row| {
        Ok(DoorEntryDto {
            scan_id: row.id,
            number: u32::try_from(row.ticket_number)
                .map_err(|error| ApiError::Internal(error.into()))?,
            at_unix_ms: unix_ms(row.scanned_at),
            device_name: row.name,
        })
    })
    .collect()
}

/// `POST /api/door/scans`: appends scans (idempotent by id) and classifies admitted ones.
///
/// With `confirm`, a single fresh scan is classified while the phone waits (ADR 0006): the
/// insert into `entries` is the atomic "first entry" check across every phone.
pub async fn upload_scans(
    State(state): State<AppState>,
    device: DoorDevice,
    Json(body): Json<DoorScansBody>,
) -> ApiResult<Json<DoorScansResponse>> {
    if body.scans.is_empty()
        || body.scans.len() > MAX_SCANS_PER_UPLOAD
        || (body.confirm && body.scans.len() != 1)
    {
        return Err(bad_request(
            "invalid_scans",
            format!("send 1–{MAX_SCANS_PER_UPLOAD} scans (exactly one to confirm)"),
        ));
    }
    let scans = body
        .scans
        .iter()
        .map(ValidScan::try_from)
        .collect::<ApiResult<Vec<_>>>()?;
    // Entries are locked in ticket order, so concurrent uploads cannot deadlock.
    let mut order: Vec<usize> = (0..scans.len()).collect();
    order.sort_by_key(|&index| scans.get(index).and_then(|scan| scan.number));

    let mut tx = state.pool.begin().await?;
    let mut results: Vec<Option<DoorScanResult>> = vec![None; scans.len()];
    for index in order {
        let (Some(scan), Some(slot)) = (scans.get(index), results.get_mut(index)) else {
            continue;
        };
        *slot = Some(record_scan(&mut tx, &device, scan, body.confirm).await?);
    }
    tx.commit().await?;
    Ok(Json(DoorScansResponse {
        results: results.into_iter().flatten().collect(),
    }))
}

/// An uploaded scan with its values checked and converted.
struct ValidScan {
    id: Uuid,
    number: Option<i32>,
    key_id: Option<i16>,
    outcome: ScanOutcome,
    scanned_at: OffsetDateTime,
}

impl TryFrom<&DoorScanUpload> for ValidScan {
    type Error = ApiError;

    fn try_from(scan: &DoorScanUpload) -> ApiResult<Self> {
        let invalid = || bad_request("invalid_scans", format!("scan {} is malformed", scan.id));
        let number = scan
            .number
            .map(|number| i32::try_from(number).ok().filter(|number| *number >= 1))
            .map(|number| number.ok_or_else(invalid))
            .transpose()?;
        if scan.outcome == ScanOutcome::Admitted && number.is_none() {
            return Err(invalid());
        }
        let scanned_at =
            OffsetDateTime::from_unix_timestamp_nanos(i128::from(scan.scanned_at_ms) * 1_000_000)
                .map_err(|_| invalid())?;
        Ok(Self {
            id: scan.id,
            number,
            key_id: scan.key_id.map(i16::from),
            outcome: scan.outcome,
            scanned_at,
        })
    }
}

async fn record_scan(
    tx: &mut Transaction<'static, Postgres>,
    device: &DoorDevice,
    scan: &ValidScan,
    confirm: bool,
) -> ApiResult<DoorScanResult> {
    // A retried upload is answered from the stored row.
    if let Some(stored) = sqlx::query!(
        "select device_id, server_class from scans where id = $1",
        scan.id
    )
    .fetch_optional(&mut **tx)
    .await?
    {
        if stored.device_id != device.id {
            return Err(ApiError::Conflict(
                "scan_conflict",
                "scan id belongs to another phone".to_owned(),
            ));
        }
        let class = stored.server_class.as_deref().and_then(ScanClass::from_db);
        return describe(tx, device.event_id, scan, class).await;
    }

    let class = match (scan.outcome, scan.number) {
        (ScanOutcome::Admitted, Some(number)) => {
            let first = sqlx::query_scalar!(
                r#"insert into entries (event_id, ticket_number, first_scan_id) values ($1, $2, $3)
                   on conflict do nothing returning ticket_number"#,
                device.event_id,
                number,
                scan.id,
            )
            .fetch_optional(&mut **tx)
            .await?
            .is_some();
            // A concurrent upload of this same scan (the confirm and the sync loop racing) may
            // have inserted the entry first: it is still this scan's first entry.
            let first = first
                || sqlx::query_scalar!(
                    "select first_scan_id from entries where event_id = $1 and ticket_number = $2",
                    device.event_id,
                    number,
                )
                .fetch_optional(&mut **tx)
                .await?
                    == Some(scan.id);
            // Same precedence as the door decision: voided > already entered > first entry.
            Some(
                if void_reason(tx, device.event_id, number).await?.is_some() {
                    ScanClass::VoidEntry
                } else if first {
                    ScanClass::FirstEntry
                } else {
                    ScanClass::DuplicateEntry
                },
            )
        }
        _ => None,
    };
    sqlx::query!(
        r#"insert into scans (id, event_id, device_id, ticket_number, key_id, local_outcome, scanned_at,
                              confirmed_online, server_class)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9) on conflict (id) do nothing"#,
        scan.id,
        device.event_id,
        device.id,
        scan.number,
        scan.key_id,
        scan.outcome.db(),
        scan.scanned_at,
        confirm,
        class.map(ScanClass::db),
    )
    .execute(&mut **tx)
    .await?;
    describe(tx, device.event_id, scan, class).await
}

/// The result of a classified scan, with the first entry or void reason when relevant.
async fn describe(
    tx: &mut Transaction<'static, Postgres>,
    event_id: Uuid,
    scan: &ValidScan,
    class: Option<ScanClass>,
) -> ApiResult<DoorScanResult> {
    let mut result = DoorScanResult {
        id: scan.id,
        class,
        first_entry: None,
        void_reason: None,
    };
    let Some(number) = scan.number else {
        return Ok(result);
    };
    match class {
        Some(ScanClass::DuplicateEntry) => {
            result.first_entry = sqlx::query!(
                r#"select s.scanned_at, d.name from entries e
                   join scans s on s.id = e.first_scan_id
                   join door_devices d on d.id = s.device_id
                   where e.event_id = $1 and e.ticket_number = $2"#,
                event_id,
                number,
            )
            .fetch_optional(&mut **tx)
            .await?
            .map(|row| DoorFirstEntryDto {
                at_unix_ms: unix_ms(row.scanned_at),
                device_name: row.name,
            });
        }
        Some(ScanClass::VoidEntry) => {
            result.void_reason = void_reason(tx, event_id, number).await?;
        }
        Some(ScanClass::FirstEntry) | None => {}
    }
    Ok(result)
}

async fn void_reason(
    tx: &mut Transaction<'static, Postgres>,
    event_id: Uuid,
    number: i32,
) -> ApiResult<Option<VoidReason>> {
    Ok(sqlx::query_scalar!(
        r#"select reason from ticket_voids
           where event_id = $1 and undone_at is null and numbers @> $2::int4
           order by created_at limit 1"#,
        event_id,
        number,
    )
    .fetch_optional(&mut **tx)
    .await?
    .as_deref()
    .and_then(VoidReason::from_db))
}

fn unsigned_bounds(range: &PgRange<i32>) -> ApiResult<(u32, u32)> {
    let (first, last) = bounds(range)?;
    let convert =
        |value: i32| u32::try_from(value).map_err(|error| ApiError::Internal(error.into()));
    Ok((convert(first)?, convert(last)?))
}

#[expect(
    clippy::cast_possible_truncation,
    reason = "Unix milliseconds of any timestamptz fit in i64"
)]
fn unix_ms(at: OffsetDateTime) -> i64 {
    (at.unix_timestamp_nanos() / 1_000_000) as i64
}
