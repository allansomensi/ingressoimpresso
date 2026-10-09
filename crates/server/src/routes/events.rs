//! Events, signing keys, designs, art and previews.

use std::io::Cursor;

use axum::Json;
use axum::body::Bytes;
use axum::extract::{Path, State};
use axum::http::header::{CACHE_CONTROL, CONTENT_TYPE, HeaderMap};
use axum::http::{HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use sha2::{Digest, Sha256};
use sqlx::{Postgres, Transaction};
use ticket_core::EventSigningKey;
use ticket_render::{Art, RenderJob, TicketDesign, TicketQr, TicketToRender};
use time::OffsetDateTime;
use uuid::Uuid;

use super::{EventRow, authorize_event, door, event_access, optional_text};
use crate::api::{
    ArtDto, DesignBody, DesignResponse, EventBody, EventDto, EventStatus, EventStatusBody,
};
use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult, bad_request};
use crate::keys;
use crate::state::AppState;
use crate::texts;

/// Upload limit for art (also enforced by the router body limit).
pub const MAX_ART_BYTES: usize = 20 * 1024 * 1024;
const MAX_ART_SIDE_PX: u32 = 10_000;
const MAX_ART_PIXELS: u64 = 40_000_000;
/// Art an organization may keep (every event, every saved version): ten large files.
const MAX_ART_BYTES_PER_ORGANIZATION: i64 = 200 * 1024 * 1024;
const PREVIEW_DPI: u32 = 110;
/// Width of the art shown in the editor's live preview.
const ART_PREVIEW_WIDTH_PX: u32 = 1600;

impl EventRow {
    fn into_dto(self) -> ApiResult<EventDto> {
        let offset = self.offset();
        Ok(EventDto {
            id: self.id,
            name: self.name,
            venue: self.venue,
            // Local times with the event's offset, as the painel sent them.
            starts_at: self.starts_at.to_offset(offset),
            ends_at: self.ends_at.to_offset(offset),
            ticket_price_cents: self.ticket_price_cents,
            status: EventStatus::from_db(&self.status).ok_or_else(|| {
                ApiError::Internal(anyhow::anyhow!("unknown event status {}", self.status))
            })?,
            support_access: false,
        })
    }
}

/// Name, venue and UTC offset (minutes) of a valid event body.
fn validate_event(body: &EventBody) -> ApiResult<(String, Option<String>, i16)> {
    let name = body.name.trim().to_owned();
    if name.is_empty() || name.chars().count() > 100 {
        return Err(bad_request(
            "invalid_name",
            "name must have 1-100 characters",
        ));
    }
    let venue = optional_text(body.venue.clone());
    if venue
        .as_ref()
        .is_some_and(|venue| venue.chars().count() > 120)
    {
        return Err(bad_request(
            "invalid_venue",
            "venue must have up to 120 characters",
        ));
    }
    if body.ends_at <= body.starts_at {
        return Err(bad_request("invalid_dates", "end must be after start"));
    }
    if body.ticket_price_cents.is_some_and(|price| price < 0) {
        return Err(bad_request("invalid_price", "price must not be negative"));
    }
    let offset = body.starts_at.offset().whole_minutes();
    if !(-720..=840).contains(&offset) {
        return Err(bad_request(
            "invalid_dates",
            "offset must be -12:00 to +14:00",
        ));
    }
    Ok((name, venue, offset))
}

/// `GET /api/events`.
pub async fn list(State(state): State<AppState>, user: AuthUser) -> ApiResult<Json<Vec<EventDto>>> {
    let rows = sqlx::query_as!(
        EventRow,
        r#"select e.id, e.name, e.venue, e.starts_at, e.ends_at, e.ticket_price_cents, e.status, e.qr_tag,
                  e.utc_offset_minutes
           from events e join memberships m on m.organization_id = e.organization_id
           where m.user_id = $1 order by e.starts_at desc"#,
        user.id,
    )
    .fetch_all(&state.pool)
    .await?;
    rows.into_iter()
        .map(EventRow::into_dto)
        .collect::<ApiResult<Vec<_>>>()
        .map(Json)
}

/// A new event: its row and its first signing key.
struct NewEvent<'a> {
    organization_id: Uuid,
    name: &'a str,
    venue: Option<&'a str>,
    starts_at: OffsetDateTime,
    ends_at: OffsetDateTime,
    ticket_price_cents: Option<i32>,
    utc_offset_minutes: i16,
}

/// Inserts an event with a random QR tag and its first signing key (ADR 0004, 0005).
async fn insert_event(
    state: &AppState,
    tx: &mut Transaction<'_, Postgres>,
    event: NewEvent<'_>,
) -> ApiResult<EventRow> {
    let event_id = Uuid::new_v4();
    let mut created = None;
    // The tag is random; a collision on the unique index just means "draw again".
    for _ in 0..8 {
        let tag = i64::from(getrandom::u32().map_err(|error| anyhow::anyhow!("OS RNG: {error}"))?);
        created = sqlx::query_as!(
            EventRow,
            r#"insert into events (id, organization_id, name, venue, starts_at, ends_at, qr_tag,
                                   ticket_price_cents, utc_offset_minutes)
               values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
               on conflict (qr_tag) do nothing
               returning id, name, venue, starts_at, ends_at, ticket_price_cents, status, qr_tag,
                         utc_offset_minutes"#,
            event_id,
            event.organization_id,
            event.name,
            event.venue,
            event.starts_at,
            event.ends_at,
            tag,
            event.ticket_price_cents,
            event.utc_offset_minutes,
        )
        .fetch_optional(&mut **tx)
        .await?;
        if created.is_some() {
            break;
        }
    }
    let row = created.ok_or_else(|| anyhow::anyhow!("could not draw a free event tag"))?;

    let seed = keys::generate_seed().map_err(anyhow::Error::from)?;
    let sealed =
        keys::seal(&state.config.master_key, event_id, 1, &seed).map_err(anyhow::Error::from)?;
    let public_key = EventSigningKey::from_seed(&seed).public_key().to_bytes();
    sqlx::query!(
        r#"insert into event_signing_keys (event_id, key_id, public_key, sealed_private_key, status)
           values ($1, 1, $2, $3, 'active')"#,
        event_id,
        public_key.as_slice(),
        sealed,
    )
    .execute(&mut **tx)
    .await?;
    Ok(row)
}

/// `POST /api/events`: creates the event and its first signing key (ADR 0004, 0005).
pub async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<EventBody>,
) -> ApiResult<(StatusCode, Json<EventDto>)> {
    let (name, venue, offset) = validate_event(&body)?;
    let mut tx = state.pool.begin().await?;
    let organization_id = sqlx::query_scalar!(
        "select organization_id from memberships where user_id = $1 and role = 'owner' order by created_at limit 1",
        user.id
    )
    .fetch_optional(&mut *tx)
    .await?
    .ok_or(ApiError::Forbidden)?;
    let event = insert_event(
        &state,
        &mut tx,
        NewEvent {
            organization_id,
            name: &name,
            venue: venue.as_deref(),
            starts_at: body.starts_at,
            ends_at: body.ends_at,
            ticket_price_cents: body.ticket_price_cents,
            utc_offset_minutes: offset,
        },
    )
    .await?;
    tx.commit().await?;
    Ok((StatusCode::CREATED, Json(event.into_dto()?)))
}

/// The name of a copy: "Show (cópia)", cut to fit 100 characters.
fn copy_name(name: &str) -> String {
    let suffix = texts::COPY_SUFFIX;
    let room = 100 - suffix.chars().count();
    let base: String = name.trim().chars().take(room).collect();
    format!("{}{suffix}", base.trim_end())
}

/// `POST /api/events/{id}/duplicate`: a new event with the same details, the latest ticket
/// design (art included) and the same sellers, without batches, ranges or door links. It gets
/// its own QR tag and signing key: tickets of one event never open the other's door.
pub async fn duplicate(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
) -> ApiResult<(StatusCode, Json<EventDto>)> {
    let source = authorize_event(&state.pool, &user, event_id).await?;
    let mut tx = state.pool.begin().await?;
    let organization_id =
        sqlx::query_scalar!("select organization_id from events where id = $1", event_id)
            .fetch_one(&mut *tx)
            .await?;
    let name = copy_name(&source.name);
    let copy = insert_event(
        &state,
        &mut tx,
        NewEvent {
            organization_id,
            name: &name,
            venue: source.venue.as_deref(),
            starts_at: source.starts_at,
            ends_at: source.ends_at,
            ticket_price_cents: source.ticket_price_cents,
            utc_offset_minutes: source.utc_offset_minutes,
        },
    )
    .await?;

    let design = sqlx::query!(
        "select spec, art_blob_id from ticket_designs where event_id = $1 order by version desc limit 1",
        event_id
    )
    .fetch_optional(&mut *tx)
    .await?;
    if let Some(design) = design {
        let art = match design.art_blob_id {
            Some(blob_id) => Some(copy_art(&mut tx, organization_id, blob_id, copy.id).await?),
            None => None,
        };
        sqlx::query!(
            r#"insert into ticket_designs (id, event_id, version, spec, art_blob_id)
               values ($1, $2, 1, $3, $4)"#,
            Uuid::new_v4(),
            copy.id,
            design.spec,
            art,
        )
        .execute(&mut *tx)
        .await?;
    }
    sqlx::query!(
        r#"insert into sellers (id, event_id, name, phone)
           select gen_random_uuid(), $2, name, phone from sellers where event_id = $1"#,
        event_id,
        copy.id,
    )
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok((StatusCode::CREATED, Json(copy.into_dto()?)))
}

/// Copies an art blob to another event of the same organization, within its art quota.
async fn copy_art(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: Uuid,
    blob_id: Uuid,
    to_event: Uuid,
) -> ApiResult<Uuid> {
    let stored = sqlx::query_scalar!(
        r#"select coalesce(sum(b.byte_size), 0)::bigint as "stored!" from blobs b
           join events e on e.id = b.event_id where e.organization_id = $1"#,
        organization_id
    )
    .fetch_one(&mut **tx)
    .await?;
    let size = sqlx::query_scalar!("select byte_size from blobs where id = $1", blob_id)
        .fetch_one(&mut **tx)
        .await?;
    if stored + i64::from(size) > MAX_ART_BYTES_PER_ORGANIZATION {
        return Err(ApiError::Conflict(
            "art_quota",
            "the organization stores too much art".to_owned(),
        ));
    }
    let id = Uuid::new_v4();
    sqlx::query!(
        r#"insert into blobs (id, event_id, sha256, content_type, width_px, height_px, byte_size, data)
           select $1, $2, sha256, content_type, width_px, height_px, byte_size, data
           from blobs where id = $3"#,
        id,
        to_event,
        blob_id,
    )
    .execute(&mut **tx)
    .await?;
    Ok(id)
}

/// `PUT /api/events/{id}/status`: archives (`closed`) or reopens (`active`) an event. A closed
/// event leaves the main list and takes no new batches; its files and door keep working.
pub async fn set_status(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
    Json(body): Json<EventStatusBody>,
) -> ApiResult<Json<EventDto>> {
    authorize_event(&state.pool, &user, event_id).await?;
    let row = sqlx::query_as!(
        EventRow,
        r#"update events set status = $2 where id = $1
           returning id, name, venue, starts_at, ends_at, ticket_price_cents, status, qr_tag,
                     utc_offset_minutes"#,
        event_id,
        body.status.db(),
    )
    .fetch_one(&state.pool)
    .await?;
    Ok(Json(row.into_dto()?))
}

/// `DELETE /api/events/{id}`: only an event without batches (canceled ones aside): nothing was
/// paid or printed for it. Mistakes and tests go away; real events are archived instead.
pub async fn delete(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    authorize_event(&state.pool, &user, event_id).await?;
    let deleted = sqlx::query_scalar!(
        r#"delete from events e where e.id = $1
           and not exists (select 1 from ticket_batches b
                           where b.event_id = e.id and b.status <> 'canceled')
           returning e.id"#,
        event_id
    )
    .fetch_optional(&state.pool)
    .await?;
    match deleted {
        Some(_) => Ok(StatusCode::NO_CONTENT),
        None => Err(ApiError::Conflict(
            "event_has_batches",
            "cancel the event's unpaid batches first; events with paid batches are archived"
                .to_owned(),
        )),
    }
}

/// `GET /api/events/{id}`.
pub async fn get(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
) -> ApiResult<Json<EventDto>> {
    let access = event_access(&state.pool, &user, event_id).await?;
    let mut event = access.event.into_dto()?;
    event.support_access = access.support;
    Ok(Json(event))
}

/// `PUT /api/events/{id}`.
pub async fn update(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
    Json(body): Json<EventBody>,
) -> ApiResult<Json<EventDto>> {
    authorize_event(&state.pool, &user, event_id).await?;
    let (name, venue, offset) = validate_event(&body)?;
    let mut tx = state.pool.begin().await?;
    let row = sqlx::query_as!(
        EventRow,
        r#"update events set name = $2, venue = $3, starts_at = $4, ends_at = $5, ticket_price_cents = $6,
                             utc_offset_minutes = $7
           where id = $1
           returning id, name, venue, starts_at, ends_at, ticket_price_cents, status, qr_tag,
                     utc_offset_minutes"#,
        event_id,
        name,
        venue,
        body.starts_at,
        body.ends_at,
        body.ticket_price_cents,
        offset,
    )
    .fetch_one(&mut *tx)
    .await?;
    // Door links live until the end of the event plus a grace period: a postponed event must
    // not lock its phones out at the gate.
    sqlx::query!(
        "update door_accesses set expires_at = $2 where event_id = $1 and revoked_at is null",
        event_id,
        row.ends_at + door::ACCESS_GRACE,
    )
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(Json(row.into_dto()?))
}

struct ArtRow {
    id: Uuid,
    content_type: String,
    width_px: i32,
    height_px: i32,
}

impl From<ArtRow> for ArtDto {
    fn from(row: ArtRow) -> Self {
        Self {
            id: row.id,
            content_type: row.content_type,
            width_px: row.width_px,
            height_px: row.height_px,
        }
    }
}

async fn art_of_event(state: &AppState, event_id: Uuid, art_id: Uuid) -> ApiResult<ArtRow> {
    sqlx::query_as!(
        ArtRow,
        "select id, content_type, width_px, height_px from blobs where id = $1 and event_id = $2",
        art_id,
        event_id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| bad_request("unknown_art", "art does not belong to this event"))
}

/// `GET /api/events/{id}/design`: the latest version, or the default design (version 0).
pub async fn get_design(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
) -> ApiResult<Json<DesignResponse>> {
    authorize_event(&state.pool, &user, event_id).await?;
    let latest = sqlx::query!(
        "select version, spec, art_blob_id from ticket_designs where event_id = $1 order by version desc limit 1",
        event_id
    )
    .fetch_optional(&state.pool)
    .await?;
    let Some(latest) = latest else {
        return Ok(Json(DesignResponse {
            version: 0,
            design: TicketDesign::default_v1(),
            art: None,
        }));
    };
    let design: TicketDesign = serde_json::from_value(latest.spec).map_err(anyhow::Error::from)?;
    let art = match latest.art_blob_id {
        Some(art_id) => Some(art_of_event(&state, event_id, art_id).await?.into()),
        None => None,
    };
    Ok(Json(DesignResponse {
        version: latest.version,
        design,
        art,
    }))
}

fn validate_design(design: &TicketDesign) -> ApiResult<()> {
    design.validate().map_err(|issues| {
        bad_request(
            "invalid_design",
            issues
                .iter()
                .map(ToString::to_string)
                .collect::<Vec<_>>()
                .join("; "),
        )
    })
}

/// `PUT /api/events/{id}/design`: saves a new immutable version.
pub async fn save_design(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
    Json(body): Json<DesignBody>,
) -> ApiResult<Json<DesignResponse>> {
    authorize_event(&state.pool, &user, event_id).await?;
    validate_design(&body.design)?;
    let art = match body.art_id {
        Some(art_id) => Some(art_of_event(&state, event_id, art_id).await?),
        None => None,
    };
    let spec = serde_json::to_value(&body.design).map_err(anyhow::Error::from)?;
    let version = sqlx::query_scalar!(
        r#"insert into ticket_designs (id, event_id, version, spec, art_blob_id)
           values ($1, $2, (select coalesce(max(version), 0) + 1 from ticket_designs where event_id = $2), $3, $4)
           returning version"#,
        Uuid::new_v4(),
        event_id,
        spec,
        body.art_id,
    )
    .fetch_one(&state.pool)
    .await?;
    Ok(Json(DesignResponse {
        version,
        design: body.design,
        art: art.map(Into::into),
    }))
}

/// `POST /api/events/{id}/art`: raw PNG or JPEG body (max 20 MB).
pub async fn upload_art(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
    headers: HeaderMap,
    body: Bytes,
) -> ApiResult<(StatusCode, Json<ArtDto>)> {
    authorize_event(&state.pool, &user, event_id).await?;
    if body.len() > MAX_ART_BYTES {
        return Err(ApiError::PayloadTooLarge);
    }
    let content_type = match body.get(..8) {
        Some(b"\x89PNG\r\n\x1a\n") => "image/png",
        Some([0xFF, 0xD8, 0xFF, ..]) => "image/jpeg",
        _ => return Err(bad_request("unsupported_art", "art must be PNG or JPEG")),
    };
    if headers
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|declared| declared != content_type && declared != "application/octet-stream")
    {
        return Err(bad_request(
            "unsupported_art",
            "content type does not match the file",
        ));
    }
    // Reads only the header: refuses decompression bombs before Typst ever decodes the image.
    let (width, height) = image::ImageReader::new(Cursor::new(&body))
        .with_guessed_format()
        .map_err(|_| bad_request("unsupported_art", "unreadable image"))?
        .into_dimensions()
        .map_err(|_| bad_request("unsupported_art", "unreadable image"))?;
    if width == 0
        || height == 0
        || width > MAX_ART_SIDE_PX
        || height > MAX_ART_SIDE_PX
        || u64::from(width) * u64::from(height) > MAX_ART_PIXELS
    {
        return Err(bad_request(
            "art_too_large",
            "art must be at most 10000 px per side and 40 MP",
        ));
    }
    let digest = Sha256::digest(&body).to_vec();
    let size = i32::try_from(body.len()).map_err(|_| ApiError::PayloadTooLarge)?;
    // Art lives in Postgres (ADR 0011): drop this event's older uploads no saved design uses (an
    // abandoned try; recent ones stay for the editor's undo) and cap what an organization keeps,
    // so one account cannot fill the database.
    sqlx::query!(
        r#"delete from blobs b where b.event_id = $1 and b.sha256 <> $2
           and b.created_at < now() - interval '2 hours'
           and not exists (select 1 from ticket_designs d where d.art_blob_id = b.id)"#,
        event_id,
        digest,
    )
    .execute(&state.pool)
    .await?;
    let stored = sqlx::query_scalar!(
        r#"select coalesce(sum(b.byte_size), 0)::bigint as "stored!" from blobs b
           join events e on e.id = b.event_id
           where e.organization_id = (select organization_id from events where id = $1)"#,
        event_id
    )
    .fetch_one(&state.pool)
    .await?;
    if stored + i64::from(size) > MAX_ART_BYTES_PER_ORGANIZATION
        && !blob_exists(&state, event_id, &digest).await?
    {
        return Err(ApiError::Conflict(
            "art_quota",
            "the organization stores too much art".to_owned(),
        ));
    }
    let (width, height) = (
        i32::try_from(width).map_err(anyhow::Error::from)?,
        i32::try_from(height).map_err(anyhow::Error::from)?,
    );
    let row = sqlx::query_as!(
        ArtRow,
        r#"insert into blobs (id, event_id, sha256, content_type, width_px, height_px, byte_size, data)
           values ($1, $2, $3, $4, $5, $6, $7, $8)
           on conflict (event_id, sha256) do update set event_id = excluded.event_id
           returning id, content_type, width_px, height_px"#,
        Uuid::new_v4(),
        event_id,
        digest,
        content_type,
        width,
        height,
        size,
        body.as_ref(),
    )
    .fetch_one(&state.pool)
    .await?;
    Ok((StatusCode::CREATED, Json(row.into())))
}

async fn blob_exists(state: &AppState, event_id: Uuid, digest: &[u8]) -> ApiResult<bool> {
    Ok(sqlx::query_scalar!(
        r#"select exists(select 1 from blobs where event_id = $1 and sha256 = $2) as "exists!""#,
        event_id,
        digest
    )
    .fetch_one(&state.pool)
    .await?)
}

/// Loads art bytes for rendering.
pub async fn load_art(state: &AppState, event_id: Uuid, art_id: Uuid) -> ApiResult<Art> {
    let data = sqlx::query_scalar!(
        "select data from blobs where id = $1 and event_id = $2",
        art_id,
        event_id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| bad_request("unknown_art", "art does not belong to this event"))?;
    Art::from_bytes(data).map_err(|error| ApiError::Internal(error.into()))
}

/// `POST /api/events/{id}/design/preview`: first home A4 sheet with SAMPLE tickets (watermark,
/// invalid QR), as PNG. Never signs anything.
pub async fn preview(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
    Json(body): Json<DesignBody>,
) -> ApiResult<Response> {
    let event = authorize_event(&state.pool, &user, event_id).await?;
    validate_design(&body.design)?;
    let art = match body.art_id {
        Some(art_id) => Some(load_art(&state, event_id, art_id).await?),
        None => None,
    };
    let job = RenderJob {
        details: event.details(),
        design: body.design,
        art,
        event_name: event.name,
        tickets: (1..=200)
            .map(|number| TicketToRender {
                qr: TicketQr::Sample { number },
                seller: None,
            })
            .collect(),
    };
    let _permit = state
        .render_permits
        .clone()
        .acquire_owned()
        .await
        .map_err(anyhow::Error::from)?;
    let sheets =
        tokio::task::spawn_blocking(move || ticket_render::home_sheet_pngs(&job, PREVIEW_DPI, 1))
            .await
            .map_err(anyhow::Error::from)?
            .map_err(|error| match error {
                ticket_render::RenderError::TooLargeForA4 => {
                    bad_request("too_large_for_a4", "ticket does not fit on A4")
                }
                other => ApiError::Internal(other.into()),
            })?;
    let png = sheets
        .into_iter()
        .next()
        .ok_or_else(|| anyhow::anyhow!("no preview sheet"))?;
    Ok(([(CONTENT_TYPE, HeaderValue::from_static("image/png"))], png).into_response())
}

/// `GET /api/events/{id}/art/{art_id}`: the art as a JPEG at most 1600 px wide, for the editor's
/// live preview. Art never changes once uploaded, so the browser may keep it.
pub async fn art_preview(
    State(state): State<AppState>,
    user: AuthUser,
    Path((event_id, art_id)): Path<(Uuid, Uuid)>,
) -> ApiResult<Response> {
    authorize_event(&state.pool, &user, event_id).await?;
    let blob = sqlx::query!(
        "select content_type, width_px, data from blobs where id = $1 and event_id = $2",
        art_id,
        event_id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound)?;
    let small_jpeg = blob.content_type == "image/jpeg"
        && u32::try_from(blob.width_px).is_ok_and(|width| width <= ART_PREVIEW_WIDTH_PX);
    let jpeg = if small_jpeg {
        blob.data
    } else {
        let _permit = state
            .render_permits
            .clone()
            .acquire_owned()
            .await
            .map_err(anyhow::Error::from)?;
        tokio::task::spawn_blocking(move || shrink_to_jpeg(&blob.data, ART_PREVIEW_WIDTH_PX))
            .await
            .map_err(anyhow::Error::from)?
            .map_err(anyhow::Error::from)?
    };
    Ok((
        [
            (CONTENT_TYPE, HeaderValue::from_static("image/jpeg")),
            (
                CACHE_CONTROL,
                HeaderValue::from_static("private, max-age=31536000, immutable"),
            ),
        ],
        jpeg,
    )
        .into_response())
}

/// Decodes an image and encodes it as JPEG, scaled down to `max_width` if wider.
fn shrink_to_jpeg(bytes: &[u8], max_width: u32) -> Result<Vec<u8>, image::ImageError> {
    let image = image::load_from_memory(bytes)?;
    let image = if image.width() > max_width {
        image.resize(max_width, u32::MAX, image::imageops::FilterType::Triangle)
    } else {
        image
    };
    let mut out = Cursor::new(Vec::new());
    image::DynamicImage::ImageRgb8(image.to_rgb8()).write_to(&mut out, image::ImageFormat::Jpeg)?;
    Ok(out.into_inner())
}
