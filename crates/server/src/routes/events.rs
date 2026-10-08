//! Events, signing keys, designs, art and previews.

use std::io::Cursor;

use axum::Json;
use axum::body::Bytes;
use axum::extract::{Path, State};
use axum::http::header::{CONTENT_TYPE, HeaderMap};
use axum::http::{HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use sha2::{Digest, Sha256};
use ticket_core::EventSigningKey;
use ticket_render::{Art, RenderJob, TicketDesign, TicketQr, TicketToRender};
use uuid::Uuid;

use super::{EventRow, authorize_event, optional_text};
use crate::api::{ArtDto, DesignBody, DesignResponse, EventBody, EventDto, EventStatus};
use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult, bad_request};
use crate::keys;
use crate::state::AppState;

/// Upload limit for art (also enforced by the router body limit).
pub const MAX_ART_BYTES: usize = 20 * 1024 * 1024;
const MAX_ART_SIDE_PX: u32 = 10_000;
const MAX_ART_PIXELS: u64 = 40_000_000;
const PREVIEW_DPI: u32 = 110;

impl EventRow {
    fn into_dto(self) -> ApiResult<EventDto> {
        Ok(EventDto {
            id: self.id,
            name: self.name,
            venue: self.venue,
            starts_at: self.starts_at,
            ends_at: self.ends_at,
            ticket_price_cents: self.ticket_price_cents,
            status: EventStatus::from_db(&self.status).ok_or_else(|| {
                ApiError::Internal(anyhow::anyhow!("unknown event status {}", self.status))
            })?,
        })
    }
}

fn validate_event(body: &EventBody) -> ApiResult<(String, Option<String>)> {
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
    Ok((name, venue))
}

/// `GET /api/events`.
pub async fn list(State(state): State<AppState>, user: AuthUser) -> ApiResult<Json<Vec<EventDto>>> {
    let rows = sqlx::query_as!(
        EventRow,
        r#"select e.id, e.name, e.venue, e.starts_at, e.ends_at, e.ticket_price_cents, e.status, e.qr_tag
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

/// `POST /api/events`: creates the event and its first signing key (ADR 0004, 0005).
pub async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<EventBody>,
) -> ApiResult<(StatusCode, Json<EventDto>)> {
    let (name, venue) = validate_event(&body)?;
    let mut tx = state.pool.begin().await?;
    let organization_id = sqlx::query_scalar!(
        "select organization_id from memberships where user_id = $1 and role = 'owner' order by created_at limit 1",
        user.id
    )
    .fetch_optional(&mut *tx)
    .await?
    .ok_or(ApiError::Forbidden)?;

    let event_id = Uuid::new_v4();
    let mut created = None;
    // The tag is random; a collision on the unique index just means "draw again".
    for _ in 0..8 {
        let tag = i64::from(getrandom::u32().map_err(|error| anyhow::anyhow!("OS RNG: {error}"))?);
        created = sqlx::query_as!(
            EventRow,
            r#"insert into events (id, organization_id, name, venue, starts_at, ends_at, qr_tag, ticket_price_cents)
               values ($1, $2, $3, $4, $5, $6, $7, $8)
               on conflict (qr_tag) do nothing
               returning id, name, venue, starts_at, ends_at, ticket_price_cents, status, qr_tag"#,
            event_id,
            organization_id,
            name,
            venue,
            body.starts_at,
            body.ends_at,
            tag,
            body.ticket_price_cents,
        )
        .fetch_optional(&mut *tx)
        .await?;
        if created.is_some() {
            break;
        }
    }
    let event = created.ok_or_else(|| anyhow::anyhow!("could not draw a free event tag"))?;

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
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok((StatusCode::CREATED, Json(event.into_dto()?)))
}

/// `GET /api/events/{id}`.
pub async fn get(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
) -> ApiResult<Json<EventDto>> {
    Ok(Json(
        authorize_event(&state.pool, &user, event_id)
            .await?
            .into_dto()?,
    ))
}

/// `PUT /api/events/{id}`.
pub async fn update(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
    Json(body): Json<EventBody>,
) -> ApiResult<Json<EventDto>> {
    authorize_event(&state.pool, &user, event_id).await?;
    let (name, venue) = validate_event(&body)?;
    let row = sqlx::query_as!(
        EventRow,
        r#"update events set name = $2, venue = $3, starts_at = $4, ends_at = $5, ticket_price_cents = $6
           where id = $1
           returning id, name, venue, starts_at, ends_at, ticket_price_cents, status, qr_tag"#,
        event_id,
        name,
        venue,
        body.starts_at,
        body.ends_at,
        body.ticket_price_cents,
    )
    .fetch_one(&state.pool)
    .await?;
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
