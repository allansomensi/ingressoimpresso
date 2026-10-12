//! The organization's profile (ADR 0064): logo, brand colour, public contact and the defaults of
//! new events. The public pages (digital ticket, seller's page) show the name, the logo and a
//! "Falar com a organização" button.
//!
//! The logo is a blob of the organization (not of an event), moderated like the art (ADR 0042):
//! classified in the background, flagged images wait for an admin, refused ones are remembered
//! by hash. It is served publicly only while it is not under review nor refused. It is stored
//! already shrunk (at most [`LOGO_SIDE_PX`], PNG keeps transparency): the pages show it small.

use std::io::Cursor;

use axum::Json;
use axum::body::Bytes;
use axum::extract::{Path, State};
use axum::http::header::{CACHE_CONTROL, CONTENT_TYPE, HeaderMap};
use axum::http::{HeaderValue, StatusCode};
use axum::response::{IntoResponse as _, Response};
use sha2::{Digest as _, Sha256};
use sqlx::PgPool;
use uuid::Uuid;

use super::events::{
    MAX_ART_PIXELS, MAX_ART_SIDE_PX, MAX_DECODE_BYTES, known_moderation, short_text,
};
use crate::api::{
    OrganizationProfileBody, OrganizationProfileDto, ProfileLogoDto, PublicOrganizationDto,
};
use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult, bad_request};
use crate::state::AppState;

/// Upload limit of a logo (also the router's body limit): a phone photo fits.
pub const MAX_LOGO_BYTES: usize = 8 * 1024 * 1024;
/// Longest side of the stored logo.
const LOGO_SIDE_PX: u32 = 512;
/// Logo uploads one person may make per hour (each one decodes an image).
const LOGOS_PER_HOUR: usize = 30;

/// The organization of the signed-in user (its people edit the profile; a person only on an
/// event's team does not, ADR 0055).
async fn own_organization(pool: &PgPool, user: &AuthUser) -> ApiResult<Uuid> {
    sqlx::query_scalar!(
        "select organization_id from memberships where user_id = $1 order by created_at limit 1",
        user.id
    )
    .fetch_optional(pool)
    .await?
    .ok_or(ApiError::Forbidden)
}

/// Whether a logo with this moderation may be shown to the public.
fn shown(moderation: &str) -> bool {
    !matches!(moderation, "flagged" | "rejected")
}

fn logo_path(id: Uuid) -> String {
    format!("/api/logos/{id}")
}

/// WhatsApp number as typed (`(11) 99999-8888`, `+55 11 99999-8888`, `011 99999-8888`) to digits
/// with the country code. A Brazilian number without it gets `55`; a number with `+` keeps its
/// own country.
pub(crate) fn normalize_whatsapp(value: Option<String>) -> ApiResult<Option<String>> {
    let Some(text) = super::optional_text(value) else {
        return Ok(None);
    };
    let invalid = || bad_request("invalid_whatsapp", "a phone number with area code");
    if text
        .chars()
        .any(|c| !(c.is_ascii_digit() || " ()-.+".contains(c)))
    {
        return Err(invalid());
    }
    let international = text.trim_start().starts_with('+');
    let digits: String = text.chars().filter(char::is_ascii_digit).collect();
    let digits = if international {
        digits
    } else {
        let local = digits.trim_start_matches('0');
        if (10..=11).contains(&local.len()) {
            format!("55{local}")
        } else {
            local.to_owned()
        }
    };
    let brazilian = digits.starts_with("55") && (12..=13).contains(&digits.len());
    if brazilian || (international && (10..=15).contains(&digits.len())) {
        Ok(Some(digits))
    } else {
        Err(invalid())
    }
}

/// A site as typed (`banda.com.br`, `https://…`) to an `http(s)://` address with a host.
pub(crate) fn normalize_website(value: Option<String>) -> ApiResult<Option<String>> {
    let Some(text) = super::optional_text(value) else {
        return Ok(None);
    };
    let invalid = || bad_request("invalid_website", "an address like exemplo.com.br");
    let lower = text.to_ascii_lowercase();
    let url = if lower.starts_with("https://") || lower.starts_with("http://") {
        text
    } else if lower.contains("://") {
        return Err(invalid());
    } else {
        format!("https://{text}")
    };
    if url.chars().count() > 200 || url.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err(invalid());
    }
    let host = url
        .split_once("://")
        .map(|(_, rest)| rest)
        .unwrap_or_default()
        .split(['/', '?', '#'])
        .next()
        .unwrap_or_default();
    let valid_host = host.contains('.')
        && !host.starts_with('.')
        && !host.ends_with('.')
        && host
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | ':'));
    if valid_host {
        Ok(Some(url))
    } else {
        Err(invalid())
    }
}

/// An Instagram handle as typed (`@banda`, `banda`, `instagram.com/banda/`) without the `@`.
pub(crate) fn normalize_instagram(value: Option<String>) -> ApiResult<Option<String>> {
    let Some(text) = super::optional_text(value) else {
        return Ok(None);
    };
    let lower = text.to_ascii_lowercase();
    let handle = match lower.find("instagram.com/") {
        Some(at) => text
            .get(at + "instagram.com/".len()..)
            .unwrap_or_default()
            .split(['/', '?', '#'])
            .next()
            .unwrap_or_default()
            .to_owned(),
        None => text.trim_start_matches('@').to_owned(),
    };
    let valid = (1..=30).contains(&handle.len())
        && handle
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_');
    if valid {
        Ok(Some(handle))
    } else {
        Err(bad_request("invalid_instagram", "an Instagram profile"))
    }
}

/// A public e-mail: one line, with a user and a domain.
pub(crate) fn normalize_email(value: Option<String>) -> ApiResult<Option<String>> {
    let Some(text) = short_text(value, 254, "invalid_contact_email")? else {
        return Ok(None);
    };
    let valid = text.split_once('@').is_some_and(|(user, domain)| {
        !user.is_empty()
            && domain.contains('.')
            && !domain.starts_with('.')
            && !domain.ends_with('.')
            && !domain.contains('@')
    }) && !text.chars().any(char::is_whitespace);
    if valid {
        Ok(Some(text))
    } else {
        Err(bad_request("invalid_contact_email", "an e-mail address"))
    }
}

/// `#RRGGBB` or `#rrggbb` to `#rrggbb`.
pub(crate) fn normalize_color(value: Option<String>) -> ApiResult<Option<String>> {
    let Some(text) = super::optional_text(value) else {
        return Ok(None);
    };
    let color = text.to_ascii_lowercase();
    let valid = color.len() == 7
        && color.starts_with('#')
        && color.chars().skip(1).all(|c| c.is_ascii_hexdigit());
    if valid {
        Ok(Some(color))
    } else {
        Err(bad_request("invalid_color", "a colour like #5b3df5"))
    }
}

async fn load(pool: &PgPool, organization_id: Uuid) -> ApiResult<OrganizationProfileDto> {
    let row = sqlx::query!(
        r#"select o.name, p.brand_color as "brand_color?", p.whatsapp as "whatsapp?",
                  p.contact_email::text as "contact_email?", p.website as "website?",
                  p.instagram as "instagram?", p.default_venue as "default_venue?",
                  p.default_address as "default_address?",
                  p.default_ticket_price_cents as "default_ticket_price_cents?",
                  b.id as "logo_id?", b.moderation_status as "logo_moderation?"
           from organizations o
           left join organization_profiles p on p.organization_id = o.id
           left join blobs b on b.id = p.logo_blob_id
           where o.id = $1"#,
        organization_id
    )
    .fetch_one(pool)
    .await?;
    let logo = match (row.logo_id, row.logo_moderation) {
        (Some(id), Some(moderation)) => Some(ProfileLogoDto {
            id,
            path: shown(&moderation).then(|| logo_path(id)),
            moderation,
        }),
        _ => None,
    };
    Ok(OrganizationProfileDto {
        organization_name: row.name,
        logo,
        brand_color: row.brand_color,
        whatsapp: row.whatsapp,
        contact_email: row.contact_email,
        website: row.website,
        instagram: row.instagram,
        default_venue: row.default_venue,
        default_address: row.default_address,
        default_ticket_price_cents: row.default_ticket_price_cents,
    })
}

/// `GET /api/account/profile`.
pub async fn profile(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<OrganizationProfileDto>> {
    let organization_id = own_organization(&state.pool, &user).await?;
    Ok(Json(load(&state.pool, organization_id).await?))
}

/// `PUT /api/account/profile`: every field at once; a blank one is cleared.
pub async fn update(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<OrganizationProfileBody>,
) -> ApiResult<Json<OrganizationProfileDto>> {
    let organization_id = own_organization(&state.pool, &user).await?;
    let brand_color = normalize_color(body.brand_color)?;
    let whatsapp = normalize_whatsapp(body.whatsapp)?;
    let contact_email = normalize_email(body.contact_email)?;
    let website = normalize_website(body.website)?;
    let instagram = normalize_instagram(body.instagram)?;
    let default_venue = short_text(body.default_venue, 120, "invalid_venue")?;
    let default_address = short_text(body.default_address, 200, "invalid_address")?;
    if body
        .default_ticket_price_cents
        .is_some_and(|price| price < 0)
    {
        return Err(bad_request("invalid_price", "price must not be negative"));
    }
    sqlx::query!(
        r#"insert into organization_profiles
             (organization_id, brand_color, whatsapp, contact_email, website, instagram,
              default_venue, default_address, default_ticket_price_cents)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           on conflict (organization_id) do update
           set brand_color = excluded.brand_color, whatsapp = excluded.whatsapp,
               contact_email = excluded.contact_email, website = excluded.website,
               instagram = excluded.instagram, default_venue = excluded.default_venue,
               default_address = excluded.default_address,
               default_ticket_price_cents = excluded.default_ticket_price_cents,
               updated_at = now()"#,
        organization_id,
        brand_color,
        whatsapp,
        contact_email,
        website,
        instagram,
        default_venue,
        default_address,
        body.default_ticket_price_cents,
    )
    .execute(&state.pool)
    .await?;
    Ok(Json(load(&state.pool, organization_id).await?))
}

/// Decodes an image within the art's limits and stores it at most [`LOGO_SIDE_PX`] per side, as
/// PNG (transparency kept).
fn shrink_logo(bytes: &[u8]) -> Result<Vec<u8>, image::ImageError> {
    let mut reader = image::ImageReader::new(Cursor::new(bytes)).with_guessed_format()?;
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(MAX_ART_SIDE_PX);
    limits.max_image_height = Some(MAX_ART_SIDE_PX);
    limits.max_alloc = Some(MAX_DECODE_BYTES);
    reader.limits(limits);
    let image = reader.decode()?;
    let image = if image.width() > LOGO_SIDE_PX || image.height() > LOGO_SIDE_PX {
        image.resize(
            LOGO_SIDE_PX,
            LOGO_SIDE_PX,
            image::imageops::FilterType::Lanczos3,
        )
    } else {
        image
    };
    let mut out = Cursor::new(Vec::new());
    image::DynamicImage::ImageRgba8(image.to_rgba8())
        .write_to(&mut out, image::ImageFormat::Png)?;
    Ok(out.into_inner())
}

async fn refused(pool: &PgPool, digest: &[u8]) -> ApiResult<bool> {
    Ok(sqlx::query_scalar!(
        r#"select exists(select 1 from rejected_art where sha256 = $1) as "refused!""#,
        digest
    )
    .fetch_one(pool)
    .await?)
}

/// A PNG or JPEG within the art's limits, read from its header only: decompression bombs are
/// refused before anything is decoded.
fn check_upload(headers: &HeaderMap, body: &[u8]) -> ApiResult<()> {
    if body.len() > MAX_LOGO_BYTES {
        return Err(ApiError::PayloadTooLarge);
    }
    let content_type = match body.get(..8) {
        Some(b"\x89PNG\r\n\x1a\n") => "image/png",
        Some([0xFF, 0xD8, 0xFF, ..]) => "image/jpeg",
        _ => {
            return Err(bad_request(
                "unsupported_art",
                "the logo must be PNG or JPEG",
            ));
        }
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
    let (width, height) = image::ImageReader::new(Cursor::new(body))
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
            "the logo must be at most 10000 px per side",
        ));
    }
    Ok(())
}

/// `POST /api/account/profile/logo`: raw PNG or JPEG body; becomes the organization's logo.
pub async fn upload_logo(
    State(state): State<AppState>,
    user: AuthUser,
    headers: HeaderMap,
    body: Bytes,
) -> ApiResult<(StatusCode, Json<OrganizationProfileDto>)> {
    let organization_id = own_organization(&state.pool, &user).await?;
    check_upload(&headers, &body)?;
    if !state
        .attempt(
            &format!("logo:{}", user.id),
            LOGOS_PER_HOUR,
            std::time::Duration::from_hours(1),
        )
        .await
    {
        return Err(ApiError::TooManyRequests);
    }
    // The bytes as sent were refused somewhere (as art or as a logo): refused again.
    if refused(&state.pool, &Sha256::digest(&body)).await? {
        return Err(ApiError::Conflict(
            "art_rejected",
            "this image was refused by the team".to_owned(),
        ));
    }
    let png = {
        let _permit = state
            .render_permits
            .clone()
            .acquire_owned()
            .await
            .map_err(anyhow::Error::from)?;
        tokio::task::spawn_blocking(move || shrink_logo(&body))
            .await
            .map_err(anyhow::Error::from)?
            .map_err(|_| bad_request("unsupported_art", "unreadable image"))?
    };
    let digest = Sha256::digest(&png).to_vec();
    let inherited = known_moderation(&state, &digest).await?;
    let image = image::ImageReader::new(Cursor::new(&png))
        .with_guessed_format()
        .map_err(anyhow::Error::from)?
        .into_dimensions()
        .map_err(anyhow::Error::from)?;
    let (width, height) = (
        i32::try_from(image.0).map_err(anyhow::Error::from)?,
        i32::try_from(image.1).map_err(anyhow::Error::from)?,
    );
    let size = i32::try_from(png.len()).map_err(|_| ApiError::PayloadTooLarge)?;
    let mut tx = state.pool.begin().await?;
    let blob = sqlx::query!(
        r#"insert into blobs (id, organization_id, sha256, content_type, width_px, height_px, byte_size,
                              data, moderation_status, uploaded_by)
           values ($1, $2, $3, 'image/png', $4, $5, $6, $7, $8, $9)
           on conflict (organization_id, sha256) where organization_id is not null
           do update set organization_id = excluded.organization_id
           returning id, moderation_status"#,
        Uuid::new_v4(),
        organization_id,
        digest,
        width,
        height,
        size,
        png,
        inherited,
        user.id,
    )
    .fetch_one(&mut *tx)
    .await?;
    sqlx::query!(
        r#"insert into organization_profiles (organization_id, logo_blob_id) values ($1, $2)
           on conflict (organization_id) do update set logo_blob_id = excluded.logo_blob_id,
                                                        updated_at = now()"#,
        organization_id,
        blob.id,
    )
    .execute(&mut *tx)
    .await?;
    // Older logos go, except the ones an admin still has to look at (or refused).
    sqlx::query!(
        r#"delete from blobs where organization_id = $1 and id <> $2
           and moderation_status not in ('flagged', 'rejected')"#,
        organization_id,
        blob.id,
    )
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    if blob.moderation_status == "unchecked" {
        crate::moderation::spawn_check(&state, blob.id);
    }
    Ok((
        StatusCode::CREATED,
        Json(load(&state.pool, organization_id).await?),
    ))
}

/// `DELETE /api/account/profile/logo`: the pages show the name only.
pub async fn delete_logo(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<OrganizationProfileDto>> {
    let organization_id = own_organization(&state.pool, &user).await?;
    let mut tx = state.pool.begin().await?;
    sqlx::query!(
        "update organization_profiles set logo_blob_id = null, updated_at = now() where organization_id = $1",
        organization_id
    )
    .execute(&mut *tx)
    .await?;
    sqlx::query!(
        r#"delete from blobs where organization_id = $1
           and moderation_status not in ('flagged', 'rejected')"#,
        organization_id
    )
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(Json(load(&state.pool, organization_id).await?))
}

/// `GET /api/logos/{id}` (no login): the current logo of an organization, while it is neither
/// under review nor refused. Browsers and the CDN may keep it for an hour.
pub async fn logo(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(blob_id): Path<Uuid>,
) -> ApiResult<Response> {
    crate::ratelimit::by_ip(&state, &headers, crate::ratelimit::LOGO).await?;
    let data = sqlx::query_scalar!(
        r#"select b.data from blobs b
           join organization_profiles p on p.logo_blob_id = b.id
           where b.id = $1 and b.moderation_status not in ('flagged', 'rejected')
             and not exists (select 1 from rejected_art r where r.sha256 = b.sha256)"#,
        blob_id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound)?;
    Ok((
        [
            (CONTENT_TYPE, HeaderValue::from_static("image/png")),
            (
                CACHE_CONTROL,
                HeaderValue::from_static("public, max-age=3600"),
            ),
        ],
        data,
    )
        .into_response())
}

/// Who runs an event, as the public pages show it.
pub(crate) async fn public_organization(
    pool: &PgPool,
    organization_id: Uuid,
) -> ApiResult<PublicOrganizationDto> {
    let profile = load(pool, organization_id).await?;
    Ok(PublicOrganizationDto {
        name: profile.organization_name,
        logo_path: profile.logo.and_then(|logo| logo.path),
        brand_color: profile.brand_color,
        whatsapp: profile.whatsapp,
        email: profile.contact_email,
        website: profile.website,
        instagram: profile.instagram,
    })
}

/// [`public_organization`] of the organization that runs an event.
pub(crate) async fn event_organization(
    pool: &PgPool,
    event_id: Uuid,
) -> ApiResult<PublicOrganizationDto> {
    let organization_id =
        sqlx::query_scalar!("select organization_id from events where id = $1", event_id)
            .fetch_one(pool)
            .await?;
    public_organization(pool, organization_id).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[expect(
        clippy::unnecessary_wraps,
        reason = "the fields are optional: tests read like the requests"
    )]
    fn some(text: &str) -> Option<String> {
        Some(text.to_owned())
    }

    #[test]
    fn whatsapp_numbers_get_the_country_code() {
        let cases = [
            ("(11) 99999-8888", "5511999998888"),
            ("11 3333-4444", "551133334444"),
            ("011 99999-8888", "5511999998888"),
            ("+55 (21) 98888-7777", "5521988887777"),
            ("55 21 98888 7777", "5521988887777"),
            ("+351 912 345 678", "351912345678"),
        ];
        for (typed, expected) in cases {
            assert_eq!(
                normalize_whatsapp(some(typed)).unwrap().as_deref(),
                Some(expected),
                "{typed}"
            );
        }
        assert_eq!(normalize_whatsapp(some("  ")).unwrap(), None);
        for wrong in ["9999-8888", "abc", "11 99999-8888 ramal 2", "+1 23"] {
            assert!(normalize_whatsapp(some(wrong)).is_err(), "{wrong}");
        }
    }

    #[test]
    fn websites_get_a_scheme() {
        assert_eq!(
            normalize_website(some("banda.com.br")).unwrap().as_deref(),
            Some("https://banda.com.br")
        );
        assert_eq!(
            normalize_website(some("http://banda.com.br/agenda?x=1"))
                .unwrap()
                .as_deref(),
            Some("http://banda.com.br/agenda?x=1")
        );
        for wrong in [
            "javascript:alert(1)",
            "ftp://banda.com.br",
            "banda",
            "https://ba nda.com",
            "https://.com",
        ] {
            assert!(normalize_website(some(wrong)).is_err(), "{wrong}");
        }
    }

    #[test]
    fn instagram_handles_lose_the_at_and_the_address() {
        for typed in [
            "@os.vizinhos",
            "os.vizinhos",
            "https://www.instagram.com/os.vizinhos/",
            "instagram.com/os.vizinhos?igsh=abc",
        ] {
            assert_eq!(
                normalize_instagram(some(typed)).unwrap().as_deref(),
                Some("os.vizinhos"),
                "{typed}"
            );
        }
        assert!(normalize_instagram(some("os vizinhos")).is_err());
        assert!(normalize_instagram(some("@")).is_err());
    }

    #[test]
    fn emails_and_colors() {
        assert_eq!(
            normalize_email(some(" contato@banda.com.br "))
                .unwrap()
                .as_deref(),
            Some("contato@banda.com.br")
        );
        for wrong in ["contato", "a@b", "a @b.com", "@b.com", "a@b.com."] {
            assert!(normalize_email(some(wrong)).is_err(), "{wrong}");
        }
        assert_eq!(
            normalize_color(some("#5B3DF5")).unwrap().as_deref(),
            Some("#5b3df5")
        );
        assert!(normalize_color(some("5b3df5")).is_err());
        assert!(normalize_color(some("#5b3df")).is_err());
    }
}
