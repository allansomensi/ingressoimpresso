//! Door (ADRs 0006, 0007): access links managed by the organizer, phones registered through
//! them, the offline manifest and the append-only scan log.

use axum::Json;
use axum::extract::{FromRequestParts, Path, Query, State};
use axum::http::StatusCode;
use axum::http::request::Parts;
use serde::Deserialize;
use sqlx::postgres::types::PgRange;
use sqlx::{Postgres, Transaction};
use time::{Duration, OffsetDateTime, UtcOffset};
use uuid::Uuid;

use super::{authorize_event, bounds, one_line};
use crate::api::{
    CapacityBody, CreateDoorAccessBody, CreatedDoorAccess, DoorAccessCategoriesBody, DoorAccessDto,
    DoorCategoryRangeDto, DoorDeviceDto, DoorEntryDto, DoorEventInfo, DoorFirstEntryDto,
    DoorKeyDto, DoorManifest, DoorOverviewDto, DoorRegisterBody, DoorRegistration, DoorRouteDto,
    DoorScanResult, DoorScanUpload, DoorScansBody, DoorScansResponse, DoorSeatDto,
    DoorSellerRangeDto, DoorSettingsBody, DoorVerifierDto, DoorVoidDto, ExceptionKind, KeyStatus,
    ScanClass, ScanOutcome, VoidReason,
};
use crate::auth::{AuthUser, bearer_token, new_token, token_hash};
use crate::error::{ApiError, ApiResult, bad_request};
use crate::state::AppState;

/// Links keep working until the end of the event plus this grace (ADR 0007).
pub(crate) const ACCESS_GRACE: Duration = Duration::hours(12);
const MAX_DEVICES_PER_ACCESS: i64 = 50;
/// Active door links of one event (each registers up to 50 phones).
const MAX_DOOR_ACCESSES: i64 = 60;
const MAX_SCANS_PER_UPLOAD: usize = 500;
/// Requests one registered phone may make per minute (manifests, uploads, the guest list).
const DEVICE_REQUESTS_PER_MINUTE: usize = 240;
/// No door reads a ticket before this (the product did not exist): an earlier clock is a lie.
const EARLIEST_SCAN_UNIX: i64 = 1_577_836_800; // 2020-01-01
/// How far ahead of the server a phone's clock may be: wrong by a time zone or a day at worst,
/// never by seasons (an earlier scan takes the entry; a later one is only ordered after).
const SCAN_FUTURE_TOLERANCE: Duration = Duration::days(31);
const MAX_LABEL_CHARS: usize = 60;
const MAX_DEVICE_NAME_CHARS: usize = 40;
/// `last_seen_at` is written at most this often per phone (it syncs every few seconds).
const LAST_SEEN_EVERY_SECONDS: f64 = 10.0;
/// Most categories one door may be limited to (ADR 0068).
const MAX_DOOR_CATEGORIES: usize = 50;
/// Largest pending count a phone may report (anything above is clamped).
const MAX_REPORTED_PENDING: i64 = 1_000_000;
/// Printed digits when the event has no saved design yet (the default design's).
const DEFAULT_DIGITS: i32 = 4;

// Organizer ------------------------------------------------------------------------------

struct AccessRow {
    id: Uuid,
    label: String,
    expires_at: OffsetDateTime,
    revoked_at: Option<OffsetDateTime>,
    created_at: OffsetDateTime,
    category_ids: Vec<Uuid>,
    checkpoint_id: Option<Uuid>,
}

impl From<AccessRow> for DoorAccessDto {
    fn from(row: AccessRow) -> Self {
        Self {
            id: row.id,
            label: row.label,
            expires_at: row.expires_at,
            revoked_at: row.revoked_at,
            created_at: row.created_at,
            category_ids: row.category_ids,
            checkpoint_id: row.checkpoint_id,
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
    rehearsed_at: Option<OffsetDateTime>,
    last_sync_at: Option<OffsetDateTime>,
    pending_scans: Option<i32>,
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
            rehearsed_at: row.rehearsed_at,
            last_sync_at: row.last_sync_at,
            pending_scans: row.pending_scans,
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
        r#"select a.id, a.label, a.expires_at, a.revoked_at, a.created_at,
                  array(select c.category_id from door_access_categories c
                        where c.door_access_id = a.id order by c.category_id) as "category_ids!",
                  a.checkpoint_id
           from door_accesses a where a.event_id = $1 order by a.created_at desc"#,
        event_id
    )
    .fetch_all(&state.pool)
    .await?;
    let devices = sqlx::query_as!(
        DeviceRow,
        r#"select d.id, d.door_access_id, d.name, d.created_at, d.last_seen_at, d.revoked_at,
                  (select count(*) from scans s where s.device_id = d.id) as "scan_count!",
                  d.rehearsed_at, d.last_sync_at, d.pending_scans
           from door_devices d where d.event_id = $1 order by d.created_at desc"#,
        event_id
    )
    .fetch_all(&state.pool)
    .await?;
    let counts = sqlx::query!(
        r#"select (select count(*) from entries where event_id = $1) as "entries!",
                  reentry, capacity, capacity_warn_percent from events where id = $1"#,
        event_id
    )
    .fetch_one(&state.pool)
    .await?;
    Ok(Json(DoorOverviewDto {
        accesses: accesses.into_iter().map(Into::into).collect(),
        devices: devices.into_iter().map(Into::into).collect(),
        entry_count: counts.entries,
        reentry: counts.reentry,
        checkpoints: super::checkpoints::load(&state.pool, event_id).await?,
        capacity: counts.capacity,
        capacity_warn_percent: i32::from(counts.capacity_warn_percent),
    }))
}

/// `PUT /api/events/{id}/capacity` (ADR 0110): how many people the venue holds and when to warn.
/// Phones pick it up on their next sync; a new limit may warn the organization again.
pub async fn update_capacity(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
    Json(body): Json<CapacityBody>,
) -> ApiResult<Json<DoorOverviewDto>> {
    let event = authorize_event(&state.pool, &user, event_id).await?;
    if event.kind() == crate::api::EventKind::Tokens {
        return Err(bad_request(
            "capacity_tokens",
            "consumption tokens fill no venue",
        ));
    }
    if body
        .capacity
        .is_some_and(|capacity| !(1..=1_000_000).contains(&capacity))
    {
        return Err(bad_request(
            "invalid_capacity",
            "capacity must be 1–1000000 people",
        ));
    }
    let warn = i16::try_from(body.warn_percent)
        .ok()
        .filter(|percent| (50..=99).contains(percent))
        .ok_or_else(|| bad_request("invalid_capacity", "the warning must be 50–99%"))?;
    sqlx::query!(
        r#"update events set capacity = $2, capacity_warn_percent = $3,
                  capacity_alerted = case when capacity is not distinct from $2
                                           and capacity_warn_percent = $3
                                      then capacity_alerted else 0 end
           where id = $1"#,
        event_id,
        body.capacity,
        warn,
    )
    .execute(&state.pool)
    .await?;
    crate::capacity::check(&state, event_id).await;
    overview(State(state), user, Path(event_id)).await
}

/// `PUT /api/events/{id}/door-settings` (ADR 0083): whether a ticket that went out may come back.
/// Phones pick the change up on their next sync; turned off, every ticket that entered is
/// "already entered" again, exits or not.
pub async fn update_settings(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
    Json(body): Json<DoorSettingsBody>,
) -> ApiResult<Json<DoorOverviewDto>> {
    let event = authorize_event(&state.pool, &user, event_id).await?;
    // A consumption token is used once (ADR 0084).
    if body.reentry && event.kind() == crate::api::EventKind::Tokens {
        return Err(bad_request(
            "reentry_tokens",
            "consumption tokens are used once",
        ));
    }
    sqlx::query!(
        "update events set reentry = $2 where id = $1",
        event_id,
        body.reentry,
    )
    .execute(&state.pool)
    .await?;
    overview(State(state), user, Path(event_id)).await
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
    one_line(label, "invalid_label")?;
    let links = sqlx::query_scalar!(
        r#"select count(*) as "count!" from door_accesses where event_id = $1 and revoked_at is null"#,
        event_id
    )
    .fetch_one(&state.pool)
    .await?;
    if links >= MAX_DOOR_ACCESSES {
        return Err(ApiError::Conflict(
            "too_many_door_links",
            format!("an event has at most {MAX_DOOR_ACCESSES} active door links"),
        ));
    }
    // A checkpoint's link reads that checkpoint (ADR 0092): who has the right is the checkpoint's
    // own setting, so the door's categories do not apply.
    let checkpoint = match body.checkpoint_id {
        Some(checkpoint_id) => Some(
            sqlx::query_scalar!(
                "select id from event_checkpoints where id = $1 and event_id = $2",
                checkpoint_id,
                event_id
            )
            .fetch_optional(&state.pool)
            .await?
            .ok_or_else(|| bad_request("invalid_checkpoint", "unknown checkpoint"))?,
        ),
        None => None,
    };
    let categories = if checkpoint.is_some() {
        Vec::new()
    } else {
        door_categories(&state, event_id, body.category_ids.unwrap_or_default()).await?
    };
    let (token, hash) = new_token()?;
    let id = Uuid::new_v4();
    let mut tx = state.pool.begin().await?;
    sqlx::query!(
        r#"insert into door_accesses (id, event_id, label, token_hash, expires_at, created_by, checkpoint_id)
           values ($1, $2, $3, $4, $5, $6, $7)"#,
        id,
        event_id,
        label,
        hash,
        event.ends_at + ACCESS_GRACE,
        user.id,
        checkpoint,
    )
    .execute(&mut *tx)
    .await?;
    set_categories(&mut tx, id, &categories).await?;
    tx.commit().await?;
    let row = access_row(&state, id).await?;
    Ok((
        StatusCode::CREATED,
        Json(CreatedDoorAccess {
            access: row.into(),
            token,
        }),
    ))
}

/// Moves the end of every link of the event that was not revoked to the new end of the event
/// plus the grace: a postponed event must not lock its phones out at the gate (ADR 0065), and a
/// link that expired at the old date works again for the new one.
pub(crate) async fn extend_accesses(
    tx: &mut Transaction<'_, Postgres>,
    event_id: Uuid,
    ends_at: OffsetDateTime,
) -> ApiResult<()> {
    sqlx::query!(
        "update door_accesses set expires_at = $2 where event_id = $1 and revoked_at is null",
        event_id,
        ends_at + ACCESS_GRACE,
    )
    .execute(&mut **tx)
    .await?;
    Ok(())
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
    sqlx::query!(
        "update door_accesses set revoked_at = coalesce(revoked_at, now()) where id = $1",
        access_id
    )
    .execute(&state.pool)
    .await?;
    Ok(Json(access_row(&state, access_id).await?.into()))
}

/// `POST /api/door-accesses/{id}/link`: the link again, to hand it to another phone. Only the
/// hash of a token is stored (invariant 7), so the old link cannot be shown: a new token replaces
/// it, with the same name, categories and end. Phones already registered keep working; the old
/// link stops registering new ones.
pub async fn new_link(
    State(state): State<AppState>,
    user: AuthUser,
    Path(access_id): Path<Uuid>,
) -> ApiResult<Json<CreatedDoorAccess>> {
    let event_id = sqlx::query_scalar!(
        "select event_id from door_accesses where id = $1",
        access_id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound)?;
    authorize_event(&state.pool, &user, event_id).await?;
    let (token, hash) = new_token()?;
    let replaced = sqlx::query!(
        r#"update door_accesses set token_hash = $2
           where id = $1 and revoked_at is null and expires_at > now()"#,
        access_id,
        hash,
    )
    .execute(&state.pool)
    .await?;
    if replaced.rows_affected() == 0 {
        return Err(ApiError::Conflict(
            "door_link_inactive",
            "the link was revoked or has expired".to_owned(),
        ));
    }
    Ok(Json(CreatedDoorAccess {
        access: access_row(&state, access_id).await?.into(),
        token,
    }))
}

/// `PUT /api/door-accesses/{id}/categories` (ADR 0068): which categories the door admits. Phones
/// already registered with the link pick the change up on their next sync.
pub async fn update_access_categories(
    State(state): State<AppState>,
    user: AuthUser,
    Path(access_id): Path<Uuid>,
    Json(body): Json<DoorAccessCategoriesBody>,
) -> ApiResult<Json<DoorAccessDto>> {
    let event_id = sqlx::query_scalar!(
        "select event_id from door_accesses where id = $1",
        access_id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound)?;
    authorize_event(&state.pool, &user, event_id).await?;
    let categories = door_categories(&state, event_id, body.category_ids).await?;
    let mut tx = state.pool.begin().await?;
    sqlx::query!(
        "delete from door_access_categories where door_access_id = $1",
        access_id
    )
    .execute(&mut *tx)
    .await?;
    set_categories(&mut tx, access_id, &categories).await?;
    tx.commit().await?;
    Ok(Json(access_row(&state, access_id).await?.into()))
}

/// Categories chosen for a door: distinct, at most [`MAX_DOOR_CATEGORIES`], all of the event.
async fn door_categories(
    state: &AppState,
    event_id: Uuid,
    mut ids: Vec<Uuid>,
) -> ApiResult<Vec<Uuid>> {
    ids.sort_unstable();
    ids.dedup();
    let invalid = || bad_request("invalid_door_categories", "unknown category");
    if ids.len() > MAX_DOOR_CATEGORIES {
        return Err(invalid());
    }
    if ids.is_empty() {
        return Ok(ids);
    }
    let known = sqlx::query_scalar!(
        r#"select count(*) as "count!" from ticket_categories where event_id = $1 and id = any($2)"#,
        event_id,
        &ids,
    )
    .fetch_one(&state.pool)
    .await?;
    if usize::try_from(known).ok() != Some(ids.len()) {
        return Err(invalid());
    }
    Ok(ids)
}

async fn set_categories(
    tx: &mut Transaction<'static, Postgres>,
    access_id: Uuid,
    categories: &[Uuid],
) -> ApiResult<()> {
    sqlx::query!(
        r#"insert into door_access_categories (door_access_id, category_id)
           select $1, unnest($2::uuid[]) on conflict do nothing"#,
        access_id,
        categories,
    )
    .execute(&mut **tx)
    .await?;
    Ok(())
}

async fn access_row(state: &AppState, access_id: Uuid) -> ApiResult<AccessRow> {
    Ok(sqlx::query_as!(
        AccessRow,
        r#"select a.id, a.label, a.expires_at, a.revoked_at, a.created_at,
                  array(select c.category_id from door_access_categories c
                        where c.door_access_id = a.id order by c.category_id) as "category_ids!",
                  a.checkpoint_id
           from door_accesses a where a.id = $1"#,
        access_id
    )
    .fetch_one(&state.pool)
    .await?)
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
                     (select count(*) from scans s where s.device_id = $1) as "scan_count!",
                     rehearsed_at, last_sync_at, pending_scans"#,
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
    /// The access link it registered with.
    pub access_id: Uuid,
    /// The checkpoint its link reads (ADR 0092); `None`: the entrance.
    pub checkpoint_id: Option<Uuid>,
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
            r#"select d.id, d.event_id, d.name, d.door_access_id as access_id, a.checkpoint_id
               from door_devices d
               join door_accesses a on a.id = d.door_access_id
               where d.secret_hash = $1 and d.revoked_at is null and a.revoked_at is null
                 and a.expires_at > now()"#,
            hash,
        )
        .fetch_optional(&state.pool)
        .await?
        .ok_or(ApiError::Unauthorized)?;
        // One phone syncs every few seconds at most; a script replaying manifests or uploads
        // in a loop holds locks and rows of the whole event (ADR 0119).
        if !state
            .attempt(
                &format!("door-device:{}", device.id),
                DEVICE_REQUESTS_PER_MINUTE,
                std::time::Duration::from_mins(1),
            )
            .await
        {
            return Err(ApiError::TooManyRequests);
        }
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
    headers: axum::http::HeaderMap,
    Json(body): Json<DoorRegisterBody>,
) -> ApiResult<(StatusCode, Json<DoorRegistration>)> {
    crate::ratelimit::by_ip(&state, &headers, crate::ratelimit::DOOR_REGISTER).await?;
    let name = body.device_name.trim();
    if name.is_empty() || name.chars().count() > MAX_DEVICE_NAME_CHARS {
        return Err(bad_request(
            "invalid_device_name",
            format!("device name must have 1–{MAX_DEVICE_NAME_CHARS} characters"),
        ));
    }
    one_line(name, "invalid_device_name")?;
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
            checkpoint: super::checkpoints::of_access(&state.pool, access.id).await?,
        }),
    ))
}

async fn event_info(state: &AppState, event_id: Uuid) -> ApiResult<DoorEventInfo> {
    let row = sqlx::query!(
        r#"select e.id, e.name, e.venue, e.starts_at, e.ends_at, e.ticket_price_cents, e.canceled_at,
                  e.utc_offset_minutes, e.reentry, e.kind, e.capacity, e.capacity_warn_percent,
                  coalesce((select (spec -> 'number' ->> 'digits')::int from ticket_designs
                            where event_id = e.id order by version desc limit 1), $2) as "digits!"
           from events e where e.id = $1"#,
        event_id,
        DEFAULT_DIGITS,
    )
    .fetch_one(&state.pool)
    .await?;
    // In the event's own offset, so the door shows its wall-clock time (the session, ADR 0077).
    let offset = UtcOffset::from_whole_seconds(i32::from(row.utc_offset_minutes) * 60)
        .unwrap_or(UtcOffset::UTC);
    Ok(DoorEventInfo {
        id: row.id,
        name: row.name,
        venue: row.venue,
        starts_at: row.starts_at.to_offset(offset),
        ends_at: row.ends_at.to_offset(offset),
        number_digits: u8::try_from(row.digits)
            .map_err(|_| ApiError::Internal(anyhow::anyhow!("invalid digits {}", row.digits)))?,
        ticket_price_cents: row.ticket_price_cents,
        canceled_at: row.canceled_at,
        in_series: super::series::in_series(&state.pool, event_id).await?,
        reentry: row.reentry,
        kind: crate::api::EventKind::from_db(&row.kind).unwrap_or_default(),
        days: crate::event_days::of_event(&state.pool, event_id, offset).await?,
        // Fichas fill no venue (ADR 0084).
        capacity: row
            .capacity
            .filter(|_| row.kind != "tokens")
            .and_then(|capacity| u32::try_from(capacity).ok()),
        capacity_warn_percent: u8::try_from(row.capacity_warn_percent).unwrap_or(90),
    })
}

/// `?since=` of the manifest; newer apps also send `pending` (what they still have to upload,
/// ADR 0071) and `guests` (the version of the guest list they hold, ADR 0070).
#[derive(Debug, Deserialize)]
pub struct ManifestQuery {
    since: Option<String>,
    pending: Option<i64>,
    guests: Option<String>,
    /// The version of the credentials the phone holds (ADR 0111).
    credentials: Option<String>,
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
    // Every phone asks every few seconds: the independent reads go out together, so the answer
    // waits for a couple of round trips to the database instead of a dozen.
    let (event, verifier, voids, sellers, (categories, seats), (allowed_category_ids, doors)) = tokio::try_join!(
        event_info(&state, event_id),
        verifier(&state, event_id),
        active_voids(&state, event_id),
        seller_ranges(&state, event_id),
        tags(&state, event_id),
        doors(&state, &device),
    )?;
    let ((guests, guests_version), (), checkpoint, (credentials, credentials_version)) = tokio::try_join!(
        super::guests::door_list(&state, event_id, query.guests.as_deref()),
        record_sync(&state, device.id, query.pending),
        super::checkpoints::of_access(&state.pool, device.access_id),
        super::credentials::door_list(&state.pool, event_id, query.credentials.as_deref()),
    )?;
    // Every transaction below xmin has finished: its rows are visible to the next statement.
    let xmin = sqlx::query_scalar!(
        r#"select pg_snapshot_xmin(pg_current_snapshot())::text::bigint as "xmin!""#
    )
    .fetch_one(&state.pool)
    .await?;
    let ((entries, exits), guest_arrivals, sessions) = tokio::try_join!(
        movements_between(&state, &device, since, xmin),
        super::guests::arrivals_between(&state, event_id, since, xmin),
        super::series::sessions(&state.pool, event_id),
    )?;
    Ok(Json(DoorManifest {
        device_id: device.id,
        device_name: device.name,
        event,
        verifier,
        voids,
        sellers,
        categories,
        seats,
        entries,
        exits,
        cursor: since.max(xmin).to_string(),
        server_time_ms: unix_ms(OffsetDateTime::now_utc()),
        allowed_category_ids,
        doors,
        guests,
        guests_version,
        guest_arrivals,
        sessions,
        checkpoint,
        credentials,
        credentials_version,
    }))
}

/// When the phone last synced and what it still had to send (ADR 0071). Written at most every
/// few seconds unless the pending count changed, like `last_seen_at`.
async fn record_sync(state: &AppState, device_id: Uuid, pending: Option<i64>) -> ApiResult<()> {
    let pending = pending
        .map(|value| i32::try_from(value.clamp(0, MAX_REPORTED_PENDING)))
        .transpose()
        .map_err(|error| ApiError::Internal(error.into()))?;
    sqlx::query!(
        r#"update door_devices set last_sync_at = now(), pending_scans = coalesce($2, pending_scans)
           where id = $1
             and (last_sync_at is null or last_sync_at < now() - make_interval(secs => $3)
                  or pending_scans is distinct from coalesce($2, pending_scans))"#,
        device_id,
        pending,
        LAST_SEEN_EVERY_SECONDS,
    )
    .execute(&state.pool)
    .await?;
    Ok(())
}

/// The categories this phone's door admits and the event's other open doors (ADR 0068).
async fn doors(state: &AppState, device: &DoorDevice) -> ApiResult<(Vec<Uuid>, Vec<DoorRouteDto>)> {
    let rows = sqlx::query!(
        r#"select a.id, a.label,
                  array(select c.category_id from door_access_categories c
                        where c.door_access_id = a.id order by c.category_id) as "category_ids!"
           from door_accesses a
           where a.event_id = $1
             and (a.id = $2 or (a.revoked_at is null and a.expires_at > now() and a.checkpoint_id is null))
           order by a.label, a.created_at"#,
        device.event_id,
        device.access_id,
    )
    .fetch_all(&state.pool)
    .await?;
    let mut allowed = Vec::new();
    let mut others = Vec::new();
    for row in rows {
        if row.id == device.access_id {
            allowed = row.category_ids;
        } else {
            others.push(DoorRouteDto {
                label: row.label,
                category_ids: row.category_ids,
            });
        }
    }
    Ok((allowed, others))
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

/// Category ranges and seats (ADR 0056, 0057), sent whole: small.
async fn tags(
    state: &AppState,
    event_id: Uuid,
) -> ApiResult<(Vec<DoorCategoryRangeDto>, Vec<DoorSeatDto>)> {
    let categories = sqlx::query!(
        r#"select c.id, c.name, c.color, c.price_cents, c.check_document, c.document_note,
                  c.door_instruction, c.day_rule, c.valid_days, r.numbers
           from category_ranges r
           join ticket_categories c on c.id = r.category_id
           where r.event_id = $1 order by lower(r.numbers)"#,
        event_id
    )
    .fetch_all(&state.pool)
    .await?
    .into_iter()
    .map(|row| {
        let (first, last) = unsigned_bounds(&row.numbers)?;
        let (day_rule, valid_days) = crate::event_days::rule_of(&row.day_rule, &row.valid_days);
        Ok(DoorCategoryRangeDto {
            id: row.id,
            name: row.name,
            color: row.color,
            first,
            last,
            price_cents: row.price_cents,
            check_document: row.check_document,
            document_note: row.document_note,
            door_instruction: row.door_instruction,
            day_rule,
            valid_days,
        })
    })
    .collect::<ApiResult<Vec<_>>>()?;
    let seats = sqlx::query!(
        r#"select s.ticket_number, s.seat, t.name from ticket_seats s
           join event_tables t on t.id = s.table_id
           where s.event_id = $1
             -- A ficha has no seat (ADR 0084), even if the event once had tables.
             and exists(select 1 from events e where e.id = $1 and e.kind = 'tickets')
           order by s.ticket_number"#,
        event_id
    )
    .fetch_all(&state.pool)
    .await?
    .into_iter()
    .filter_map(|row| {
        u32::try_from(row.ticket_number)
            .ok()
            .map(|number| DoorSeatDto {
                number,
                label: crate::texts::seat_label(&row.name, row.seat),
            })
    })
    .collect();
    Ok((categories, seats))
}

async fn seller_ranges(state: &AppState, event_id: Uuid) -> ApiResult<Vec<DoorSellerRangeDto>> {
    sqlx::query!(
        r#"select s.name, s.box_office, a.numbers from seller_assignments a join sellers s on s.id = a.seller_id
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
            box_office: row.box_office,
        })
    })
    .collect()
}

/// Entries (first ones and returns) and exits (ADR 0083) of every phone written by transactions
/// in `[since, until)`. Phones on an app without re-entry read only the entries: a return is an
/// entry like any other to them (the earliest one per ticket still wins).
///
/// The entrance and each checkpoint keep apart (ADR 0092): a checkpoint's phones get its uses as
/// their "entries", the entrance's phones never see a use.
async fn movements_between(
    state: &AppState,
    device: &DoorDevice,
    since: i64,
    until: i64,
) -> ApiResult<(Vec<DoorEntryDto>, Vec<DoorEntryDto>)> {
    let mut entries = Vec::new();
    let mut exits = Vec::new();
    for row in sqlx::query!(
        r#"select s.id, s.ticket_number as "ticket_number!", s.scanned_at, s.local_outcome, d.name,
                  s.day, s.ledger_day, s.slot
           from scans s join door_devices d on d.id = s.device_id
           where s.event_id = $1
             and case when $4::uuid is null
                      then s.checkpoint_id is null and s.local_outcome in ('admitted', 'readmitted', 'exited')
                      else s.checkpoint_id = $4 and s.local_outcome = 'benefit_granted'
                 end
             and s.txid >= $2::bigint::text::xid8 and s.txid < $3::bigint::text::xid8
           order by s.txid, s.id"#,
        device.event_id,
        since,
        until,
        device.checkpoint_id,
    )
    .fetch_all(&state.pool)
    .await?
    {
        let movement = DoorEntryDto {
            scan_id: row.id,
            number: u32::try_from(row.ticket_number)
                .map_err(|error| ApiError::Internal(error.into()))?,
            at_unix_ms: unix_ms(row.scanned_at),
            device_name: row.name,
            day: row.day.and_then(|day| u8::try_from(day).ok()),
            ledger_day: row.ledger_day.and_then(|day| u8::try_from(day).ok()),
            slot: row.slot.and_then(|slot| u8::try_from(slot).ok()),
        };
        if row.local_outcome == "exited" {
            exits.push(movement);
        } else {
            entries.push(movement);
        }
    }
    Ok((entries, exits))
}

/// `POST /api/door/scans`: appends scans (idempotent by id) and classifies admitted ones.
///
/// With `confirm`, a single fresh scan is classified while the phone waits (ADR 0006): the
/// insert into `door_ledger_entries` is the atomic "first entry" check across every phone, in
/// the scan's book (the entrance or a checkpoint, a day or the whole event, ADRs 0091, 0092).
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
    let days = sqlx::query_scalar!(
        r#"select count(*)::int2 as "days!" from event_days where event_id = $1"#,
        device.event_id
    )
    .fetch_one(&state.pool)
    .await?;
    let scans = body
        .scans
        .iter()
        .map(|scan| ValidScan::new(scan, &device, days))
        .collect::<ApiResult<Vec<_>>>()?;
    check_scan_facts(&state, &device, &scans).await?;
    // Entries are locked in ticket order, so concurrent uploads cannot deadlock. Within a ticket,
    // its movements go in the order they happened (an exit after an entry at the same instant):
    // a phone's batch comes in any order, and each scan is classified against the ones before it.
    let mut order: Vec<usize> = (0..scans.len()).collect();
    order.sort_by_key(|&index| {
        scans.get(index).map(|scan| {
            (
                scan.number,
                scan.ledger_day,
                scan.slot,
                scan.scanned_at,
                scan.outcome == ScanOutcome::Exited,
            )
        })
    });

    let mut tx = state.pool.begin().await?;
    let mut results: Vec<Option<DoorScanResult>> = vec![None; scans.len()];
    for index in order {
        let (Some(scan), Some(slot)) = (scans.get(index), results.get_mut(index)) else {
            continue;
        };
        *slot = Some(record_scan(&mut tx, &device, scan, body.confirm).await?);
    }
    tx.commit().await?;
    // The entrance fills the venue (ADR 0110).
    if device.checkpoint_id.is_none() && scans.iter().any(ValidScan::classified) {
        crate::capacity::check(&state, device.event_id).await;
    }
    Ok(Json(DoorScansResponse {
        results: results.into_iter().flatten().collect(),
    }))
}

/// What an honest phone can only have read from a signed QR of this event (ADR 0119): a
/// ticket's number inside a paid (or refunded: the range stays taken, invariant 10) batch of the
/// event and a key of the event; a credential that the event issued. A phone that says
/// otherwise is not reporting the door, and its whole upload is refused.
async fn check_scan_facts(
    state: &AppState,
    device: &DoorDevice,
    scans: &[ValidScan],
) -> ApiResult<()> {
    let mut numbers: Vec<i32> = Vec::new();
    let mut keys: Vec<i16> = Vec::new();
    let mut credentials: Vec<i32> = Vec::new();
    for scan in scans {
        match (scan.outcome, scan.number) {
            (ScanOutcome::CredentialAdmitted, Some(number)) => credentials.push(number),
            (_, Some(number)) if scan.vouched() => {
                if number > super::MAX_TICKET_NUMBER {
                    return Err(bad_request(
                        "invalid_scans",
                        "a ticket number of this event was expected",
                    ));
                }
                numbers.push(number);
                if let Some(key) = scan.key_id {
                    keys.push(key);
                }
            }
            _ => {}
        }
    }
    numbers.sort_unstable();
    numbers.dedup();
    keys.sort_unstable();
    keys.dedup();
    credentials.sort_unstable();
    credentials.dedup();
    let facts = sqlx::query!(
        r#"select
             (select coalesce(bool_and(exists(
                 select 1 from ticket_batches b
                 where b.event_id = $1 and b.status in ('paid', 'refunded') and b.numbers @> n.number)), true)
              from unnest($2::int[]) as n(number)) as "numbers_ok!",
             (select coalesce(bool_and(exists(
                 select 1 from event_signing_keys k where k.event_id = $1 and k.key_id = n.key_id)), true)
              from unnest($3::smallint[]) as n(key_id)) as "keys_ok!",
             (select coalesce(bool_and(exists(
                 select 1 from event_credentials c where c.event_id = $1 and c.number = n.number)), true)
              from unnest($4::int[]) as n(number)) as "credentials_ok!""#,
        device.event_id,
        &numbers,
        &keys,
        &credentials,
    )
    .fetch_one(&state.pool)
    .await?;
    if !(facts.numbers_ok && facts.keys_ok && facts.credentials_ok) {
        tracing::warn!(device = %device.id, event = %device.event_id, "scans of numbers the event never issued");
        return Err(bad_request(
            "invalid_scans",
            "a ticket number or key of this event was expected",
        ));
    }
    Ok(())
}

/// An uploaded scan with its values checked and converted.
struct ValidScan {
    id: Uuid,
    number: Option<i32>,
    key_id: Option<i16>,
    outcome: ScanOutcome,
    scanned_at: OffsetDateTime,
    exception: bool,
    exception_kind: Option<ExceptionKind>,
    /// The event day the phone was on (ADR 0091).
    day: Option<i16>,
    /// The book's day; `None`: the whole event.
    ledger_day: Option<i16>,
    /// The item of a combo at a checkpoint (ADR 0112); `None`: the first.
    slot: Option<i16>,
}

/// The nil UUID: the entrance's place in `door_ledger_entries`.
const ENTRANCE: Uuid = Uuid::nil();

impl ValidScan {
    #[expect(
        clippy::too_many_lines,
        reason = "every rule of an uploaded scan, side by side"
    )]
    fn new(scan: &DoorScanUpload, device: &DoorDevice, days: i16) -> ApiResult<Self> {
        let invalid = || bad_request("invalid_scans", format!("scan {} is malformed", scan.id));
        let number = scan
            .number
            .map(|number| i32::try_from(number).ok().filter(|number| *number >= 1))
            .map(|number| number.ok_or_else(invalid))
            .transpose()?;
        let checkpoint = device.checkpoint_id.is_some();
        // A phone on an app before checkpoints, opened with a checkpoint's link, speaks of
        // entries: they are its uses (ADR 0092).
        let outcome = match (checkpoint, scan.outcome) {
            (true, ScanOutcome::Admitted) => ScanOutcome::BenefitGranted,
            (true, ScanOutcome::RejectedUsed) => ScanOutcome::RejectedBenefitUsed,
            (_, outcome) => outcome,
        };
        let place_ok = if checkpoint {
            !matches!(
                outcome,
                ScanOutcome::Admitted
                    | ScanOutcome::Readmitted
                    | ScanOutcome::Exited
                    | ScanOutcome::RejectedUsed
                    | ScanOutcome::RejectedAlreadyOut
                    | ScanOutcome::RejectedWrongDoor
            )
        } else {
            !matches!(
                outcome,
                ScanOutcome::BenefitGranted
                    | ScanOutcome::RejectedBenefitUsed
                    | ScanOutcome::RejectedNotEntitled
            )
        };
        let exception = scan.exception.unwrap_or(false);
        let exception_kind = match (exception, scan.exception_kind) {
            (false, _) => None,
            // Apps before ADR 0091 let in anyway only at the wrong door.
            (true, None) => Some(if checkpoint {
                ExceptionKind::NotEntitled
            } else {
                ExceptionKind::WrongDoor
            }),
            (true, Some(kind)) => Some(kind),
        };
        // A credential's number (ADR 0111) is never a ticket's, and only a credential's outcome
        // carries one.
        let credential_outcome = matches!(
            outcome,
            ScanOutcome::CredentialAdmitted | ScanOutcome::RejectedCredential
        );
        if number.is_some_and(|number| number > super::credentials::CREDENTIAL_BASE)
            != credential_outcome
        {
            return Err(invalid());
        }
        let exception_ok = match exception_kind {
            None | Some(ExceptionKind::WrongDay) => true,
            Some(ExceptionKind::WrongDoor) => !checkpoint,
            Some(ExceptionKind::NotEntitled) => checkpoint,
        };
        // Only an authentic ticket of this event can enter, come back, go out, be at the wrong
        // door or day, or use a checkpoint; only an entry or a use may be let in anyway.
        if (matches!(
            outcome,
            ScanOutcome::Admitted
                | ScanOutcome::Readmitted
                | ScanOutcome::Exited
                | ScanOutcome::RejectedAlreadyOut
                | ScanOutcome::RejectedWrongDoor
                | ScanOutcome::RejectedWrongDay
                | ScanOutcome::BenefitGranted
                | ScanOutcome::RejectedBenefitUsed
                | ScanOutcome::RejectedNotEntitled
        ) && number.is_none())
            || (exception
                && !matches!(
                    outcome,
                    ScanOutcome::Admitted | ScanOutcome::Readmitted | ScanOutcome::BenefitGranted
                ))
            || !place_ok
            || !exception_ok
        {
            return Err(invalid());
        }
        // The day only means something in an event of several days; a day the event no longer
        // has (the organizer changed the days while the phone was offline) keeps the whole
        // event's book.
        let day = scan
            .day
            .map(i16::from)
            .filter(|day| days >= 2 && (1..=days).contains(day));
        let ledger_day = scan.ledger_day.map(i16::from).filter(|_| day.is_some());
        if ledger_day.is_some() && ledger_day != day {
            return Err(invalid());
        }
        let scanned_at =
            OffsetDateTime::from_unix_timestamp_nanos(i128::from(scan.scanned_at_ms) * 1_000_000)
                .map_err(|_| invalid())?;
        // A phone's clock may be off by hours, never by years: a scan "from 1970" would stand
        // in front of every real entry (invariant 3 dedups by number), and a far future one
        // would never be undone.
        if scanned_at.unix_timestamp() < EARLIEST_SCAN_UNIX
            || scanned_at > OffsetDateTime::now_utc() + SCAN_FUTURE_TOLERANCE
        {
            return Err(invalid());
        }
        // Only a checkpoint hands over several items (ADR 0112); the first is no slot at all.
        let slot = match scan.slot {
            None | Some(1) => None,
            Some(slot)
                if checkpoint && slot <= super::checkpoints::MAX_ALLOWANCE && number.is_some() =>
            {
                Some(i16::from(slot))
            }
            Some(_) => return Err(invalid()),
        };
        Ok(Self {
            id: scan.id,
            number,
            key_id: scan.key_id.map(i16::from),
            outcome,
            scanned_at,
            exception,
            exception_kind,
            day,
            ledger_day,
            slot,
        })
    }

    /// Whether the phone says the QR was authentic for this event: a ticket's number and key
    /// must then be the event's own (ADR 0119). Invalid, foreign and credential scans carry
    /// numbers the server cannot vouch for.
    const fn vouched(&self) -> bool {
        matches!(
            self.outcome,
            ScanOutcome::Admitted
                | ScanOutcome::RejectedUsed
                | ScanOutcome::RejectedVoid
                | ScanOutcome::RejectedWrongDoor
                | ScanOutcome::Readmitted
                | ScanOutcome::Exited
                | ScanOutcome::RejectedAlreadyOut
                | ScanOutcome::RejectedWrongDay
                | ScanOutcome::BenefitGranted
                | ScanOutcome::RejectedBenefitUsed
                | ScanOutcome::RejectedNotEntitled
        )
    }

    /// Whether the server classifies it: an entry, a return or a use.
    const fn classified(&self) -> bool {
        matches!(
            self.outcome,
            ScanOutcome::Admitted | ScanOutcome::Readmitted | ScanOutcome::BenefitGranted
        )
    }
}

#[expect(
    clippy::too_many_lines,
    reason = "the classification of a scan reads best in one place"
)]
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
        return describe(tx, device, scan, class).await;
    }

    let book = device.checkpoint_id.unwrap_or(ENTRANCE);
    let book_day = scan.ledger_day.unwrap_or(0);
    let book_slot = scan.slot.unwrap_or(1);
    let class = match (scan.classified(), scan.number) {
        (true, Some(number)) => {
            let first = sqlx::query_scalar!(
                r#"insert into door_ledger_entries (event_id, ticket_number, checkpoint, ledger_day, first_scan_id, slot)
                   values ($1, $2, $3, $4, $5, $6)
                   on conflict do nothing returning ticket_number"#,
                device.event_id,
                number,
                book,
                book_day,
                scan.id,
                book_slot,
            )
            .fetch_optional(&mut **tx)
            .await?
            .is_some();
            // The book's row is the per-ticket lock: two returns of one ticket uploaded by two
            // phones at once are classified one after the other.
            let first_scan_id = sqlx::query_scalar!(
                r#"select first_scan_id from door_ledger_entries
                   where event_id = $1 and ticket_number = $2 and checkpoint = $3 and ledger_day = $4
                     and slot = $5
                   for update"#,
                device.event_id,
                number,
                book,
                book_day,
                book_slot,
            )
            .fetch_one(&mut **tx)
            .await?;
            if device.checkpoint_id.is_none() {
                // "The ticket entered the event" (reports, box office, second copy), whatever
                // the day.
                sqlx::query!(
                    r#"insert into entries (event_id, ticket_number, first_scan_id) values ($1, $2, $3)
                       on conflict do nothing"#,
                    device.event_id,
                    number,
                    scan.id,
                )
                .execute(&mut **tx)
                .await?;
            }
            // A concurrent upload of this same scan (the confirm and the sync loop racing) may
            // have inserted the entry first: it is still this scan's first entry.
            let first = first || first_scan_id == scan.id;
            // Same precedence as the door decision: voided > first entry > return > already
            // entered.
            Some(
                if void_reason(tx, device.event_id, number).await?.is_some() {
                    ScanClass::VoidEntry
                } else if first {
                    ScanClass::FirstEntry
                } else if device.checkpoint_id.is_none()
                    && went_out_before(tx, device, number, scan).await?
                {
                    ScanClass::Reentry
                } else {
                    ScanClass::DuplicateEntry
                },
            )
        }
        _ => None,
    };
    sqlx::query!(
        r#"insert into scans (id, event_id, device_id, ticket_number, key_id, local_outcome, scanned_at,
                              confirmed_online, server_class, door_exception, checkpoint_id, day,
                              ledger_day, exception_kind, slot)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
           on conflict (id) do nothing"#,
        scan.id,
        device.event_id,
        device.id,
        scan.number,
        scan.key_id,
        scan.outcome.db(),
        scan.scanned_at,
        confirm,
        class.map(ScanClass::db),
        scan.exception,
        device.checkpoint_id,
        scan.day,
        scan.ledger_day,
        scan.exception_kind.map(ExceptionKind::db),
        scan.slot,
    )
    .execute(&mut **tx)
    .await?;
    describe(tx, device, scan, class).await
}

/// The result of a classified scan, with the first entry or void reason when relevant.
async fn describe(
    tx: &mut Transaction<'static, Postgres>,
    device: &DoorDevice,
    scan: &ValidScan,
    class: Option<ScanClass>,
) -> ApiResult<DoorScanResult> {
    let event_id = device.event_id;
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
            // With re-entry, the entry that holds now: the latest one before this scan (the copy
            // that came back first). Without it, the first entry of the book, as always.
            result.first_entry = sqlx::query!(
                r#"select s.scanned_at, d.name from scans s
                   join door_devices d on d.id = s.device_id
                   where s.id = coalesce(
                       (select m.id from scans m join door_devices md on md.id = m.device_id
                        where (select reentry from events where id = $1) and $6::uuid is null
                          and m.event_id = $1 and m.ticket_number = $2 and m.id <> $3
                          and m.checkpoint_id is null and m.ledger_day is not distinct from $7
                          and m.local_outcome in ('admitted', 'readmitted')
                          and (m.scanned_at, md.name) <= ($4, $5)
                        order by m.scanned_at desc, md.name desc limit 1),
                       (select first_scan_id from door_ledger_entries
                        where event_id = $1 and ticket_number = $2
                          and checkpoint = coalesce($6, '00000000-0000-0000-0000-000000000000'::uuid)
                          and ledger_day = coalesce($7, 0) and slot = coalesce($8::int2, 1)))"#,
                event_id,
                number,
                scan.id,
                scan.scanned_at,
                device.name,
                device.checkpoint_id,
                scan.ledger_day,
                scan.slot,
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
        Some(ScanClass::FirstEntry | ScanClass::Reentry) | None => {}
    }
    Ok(result)
}

/// Whether `number` was out when `scan` let it in (ADR 0083): the event allows re-entry, the
/// ticket's latest movement before the scan in the same book (ADR 0091), in the order every phone
/// uses (time, phone name, direction), is an exit, and no other entry came back after that same
/// exit (a phone without signal may upload a copy's return after the owner's: one exit lets one
/// return in).
async fn went_out_before(
    tx: &mut Transaction<'static, Postgres>,
    device: &DoorDevice,
    number: i32,
    scan: &ValidScan,
) -> ApiResult<bool> {
    Ok(sqlx::query_scalar!(
        r#"with previous as (
               select m.local_outcome = 'exited' as is_exit, m.scanned_at, d.name
               from scans m join door_devices d on d.id = m.device_id
               where m.event_id = $1 and m.ticket_number = $2 and m.id <> $3
                 and m.checkpoint_id is null and m.ledger_day is not distinct from $6
                 and m.local_outcome in ('admitted', 'readmitted', 'exited')
                 -- Before this entry: an exit at the very same instant and phone comes after it.
                 and ((m.scanned_at, d.name) < ($4, $5)
                      or ((m.scanned_at, d.name) = ($4, $5) and m.local_outcome <> 'exited'))
               order by m.scanned_at desc, d.name desc, (m.local_outcome = 'exited') desc
               limit 1
           )
           select coalesce((select is_exit from previous), false)
           and not exists (
               -- Another entry after that exit and before the next one already used it.
               select 1
               from scans e join door_devices de on de.id = e.device_id, previous p
               where e.event_id = $1 and e.ticket_number = $2 and e.id <> $3
                 and e.checkpoint_id is null and e.ledger_day is not distinct from $6
                 and e.local_outcome in ('admitted', 'readmitted')
                 and (e.scanned_at, de.name) > (p.scanned_at, p.name)
                 and not exists (
                     select 1 from scans x join door_devices dx on dx.id = x.device_id
                     where x.event_id = $1 and x.ticket_number = $2 and x.local_outcome = 'exited'
                       and x.checkpoint_id is null and x.ledger_day is not distinct from $6
                       and (x.scanned_at, dx.name) > (p.scanned_at, p.name)
                       and (x.scanned_at, dx.name) < (e.scanned_at, de.name)))
           and (select reentry from events where id = $1) as "out!""#,
        device.event_id,
        number,
        scan.id,
        scan.scanned_at,
        device.name,
        scan.ledger_day,
    )
    .fetch_one(&mut **tx)
    .await?)
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
pub(crate) fn unix_ms(at: OffsetDateTime) -> i64 {
    (at.unix_timestamp_nanos() / 1_000_000) as i64
}
