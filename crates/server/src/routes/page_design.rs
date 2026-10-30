//! The organizer's own look for the event's public page (ADR 0125): accent colour, background,
//! the top (colour, gradient or a cover image), the title's font, a main button, the order of the
//! parts and the organizer's blocks (program, questions, links). Stored as JSON on the event and
//! checked here; the cover is one of the event's images, moderated like the ticket's art.

use std::io::Cursor;

use axum::Json;
use axum::extract::{Path, State};
use axum::http::header::{CACHE_CONTROL, CONTENT_TYPE, ETAG, IF_NONE_MATCH};
use axum::http::{HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use sqlx::PgPool;
use uuid::Uuid;

use super::{authorize_event, one_line};
use crate::api::{
    PageCoverDto, PageFaqItemDto, PageHero, PageLinkDto, PageScheduleItemDto, PublicPageDesign,
    PublicPageDesignBody, PublicPageSettingsDto,
};
use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult, bad_request};
use crate::state::AppState;

const MAX_SCHEDULE: usize = 60;
/// The most days an event has (ADR 0091).
const MAX_DAY: u8 = 31;
const MAX_FAQ: usize = 15;
const MAX_LINKS: usize = 8;
/// Width of the cover the page loads: sharp on a phone and a laptop, light on a mobile network.
const COVER_WIDTH_PX: u32 = 1600;

/// The design stored on the event, or the default look.
pub(crate) fn from_json(value: Option<serde_json::Value>) -> PublicPageDesign {
    value
        .and_then(|value| serde_json::from_value::<PublicPageDesign>(value).ok())
        .map(with_every_section)
        .unwrap_or_default()
}

/// Every part once, in the chosen order, and the ones the design does not know yet (added
/// after it was saved) at the end, shown.
fn with_every_section(mut design: PublicPageDesign) -> PublicPageDesign {
    let mut seen = Vec::with_capacity(design.sections.len());
    design.sections.retain(|section| {
        let first = !seen.contains(&section.kind);
        seen.push(section.kind);
        first
    });
    for section in PublicPageDesign::default().sections {
        if !seen.contains(&section.kind) {
            design.sections.push(section);
        }
    }
    design
}

fn text(value: &str, min: usize, max: usize, code: &'static str, lines: bool) -> ApiResult<String> {
    let value = value.trim().replace("\r\n", "\n");
    let count = value.chars().count();
    if count < min || count > max {
        return Err(bad_request(code, format!("{min} to {max} characters")));
    }
    if lines {
        if value.chars().any(|c| c.is_control() && c != '\n') {
            return Err(bad_request(code, "control characters are not allowed"));
        }
    } else {
        one_line(&value, code)?;
    }
    Ok(value)
}

fn link(link: &PageLinkDto) -> ApiResult<PageLinkDto> {
    let label = text(&link.label, 1, 40, "invalid_page_link", false)?;
    let url = super::organization::normalize_website(Some(link.url.clone()))
        .map_err(|_| bad_request("invalid_page_link", "an address like exemplo.com.br"))?
        .ok_or_else(|| bad_request("invalid_page_link", "an address"))?;
    Ok(PageLinkDto { label, url })
}

/// A design as the organizer sent it, checked and cleaned.
///
/// # Errors
///
/// `invalid_page_color`, `invalid_page_link`, `invalid_page_text` or `too_many_page_items` as a
/// 400.
pub(crate) fn clean(design: PublicPageDesign) -> ApiResult<PublicPageDesign> {
    if let Some(accent) = &design.accent {
        let valid = accent.len() == 7
            && accent.starts_with('#')
            && accent.chars().skip(1).all(|c| c.is_ascii_hexdigit());
        if !valid {
            return Err(bad_request("invalid_page_color", "a colour like #2563eb"));
        }
    }
    if design.schedule.len() > MAX_SCHEDULE
        || design.faq.len() > MAX_FAQ
        || design.links.len() > MAX_LINKS
    {
        return Err(bad_request(
            "too_many_page_items",
            format!(
                "up to {MAX_SCHEDULE} program lines, {MAX_FAQ} questions and {MAX_LINKS} links"
            ),
        ));
    }
    let schedule = design
        .schedule
        .iter()
        .map(|item| {
            Ok(PageScheduleItemDto {
                time: text(&item.time, 0, 20, "invalid_page_text", false)?,
                title: text(&item.title, 1, 80, "invalid_page_text", false)?,
                detail: item
                    .detail
                    .as_deref()
                    .map(|detail| text(detail, 0, 160, "invalid_page_text", false))
                    .transpose()?
                    .filter(|detail| !detail.is_empty()),
                day: match item.day {
                    Some(day) if !(1..=MAX_DAY).contains(&day) => {
                        return Err(bad_request("invalid_page_text", "a day of the event"));
                    }
                    day => day,
                },
            })
        })
        .collect::<ApiResult<Vec<_>>>()?;
    let faq = design
        .faq
        .iter()
        .map(|item| {
            Ok(PageFaqItemDto {
                question: text(&item.question, 1, 140, "invalid_page_text", false)?,
                answer: text(&item.answer, 1, 600, "invalid_page_text", true)?,
            })
        })
        .collect::<ApiResult<Vec<_>>>()?;
    Ok(with_every_section(PublicPageDesign {
        accent: design.accent.map(|accent| accent.to_ascii_lowercase()),
        cta: design.cta.as_ref().map(link).transpose()?,
        links: design.links.iter().map(link).collect::<ApiResult<_>>()?,
        schedule,
        faq,
        ..design
    }))
}

/// The address the page loads the cover from; changes with the image.
fn cover_path(id: Uuid) -> String {
    format!("/api/public/covers/{id}")
}

/// The design and the cover of an event, as the panel sees them.
pub(crate) async fn of_event(
    pool: &PgPool,
    event_id: Uuid,
) -> ApiResult<(PublicPageDesign, Option<PageCoverDto>)> {
    let row = sqlx::query!(
        r#"select e.public_design, b.id as "cover_id?", b.moderation_status as "moderation?"
           from events e left join blobs b on b.id = e.public_cover_blob_id
           where e.id = $1"#,
        event_id
    )
    .fetch_one(pool)
    .await?;
    let cover = match (row.cover_id, row.moderation) {
        (Some(id), Some(moderation)) => Some(PageCoverDto {
            id,
            moderation,
            url: cover_path(id),
        }),
        _ => None,
    };
    Ok((from_json(row.public_design), cover))
}

/// The cover the public page may show: none while it is under review or refused (ADR 0042).
pub(crate) fn public_cover(cover: Option<&PageCoverDto>) -> Option<String> {
    cover
        .filter(|cover| !matches!(cover.moderation.as_str(), "flagged" | "rejected"))
        .map(|cover| cover.url.clone())
}

/// `PUT /api/events/{id}/public-page/design`: the page's look and its cover.
pub async fn update(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
    Json(body): Json<PublicPageDesignBody>,
) -> ApiResult<Json<PublicPageSettingsDto>> {
    authorize_event(&state.pool, &user, event_id).await?;
    let mut design = clean(body.design)?;
    if let Some(cover) = body.cover_id {
        let ours = sqlx::query_scalar!(
            r#"select exists(select 1 from blobs where id = $1 and event_id = $2
                             and moderation_status <> 'rejected') as "ours!""#,
            cover,
            event_id
        )
        .fetch_one(&state.pool)
        .await?;
        if !ours {
            return Err(ApiError::NotFound);
        }
    } else if design.hero == PageHero::Cover {
        // Without an image, the top falls back to the colour fading.
        design.hero = PageHero::Gradient;
    }
    sqlx::query!(
        "update events set public_design = $2, public_cover_blob_id = $3 where id = $1",
        event_id,
        serde_json::to_value(&design).map_err(anyhow::Error::from)?,
        body.cover_id,
    )
    .execute(&state.pool)
    .await?;
    Ok(Json(
        super::public_page::settings_of(&state, event_id).await?,
    ))
}

/// Resizes an image to [`COVER_WIDTH_PX`] wide at most, as a JPEG.
fn cover_jpeg(bytes: &[u8]) -> ApiResult<Vec<u8>> {
    let mut reader = image::ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(anyhow::Error::from)?;
    let mut limits = image::Limits::default();
    limits.max_alloc = Some(super::events::MAX_DECODE_BYTES);
    reader.limits(limits);
    let image = reader.decode().map_err(anyhow::Error::from)?;
    let image = if image.width() > COVER_WIDTH_PX {
        image.resize(
            COVER_WIDTH_PX,
            u32::MAX,
            image::imageops::FilterType::Triangle,
        )
    } else {
        image
    };
    let mut out = Vec::new();
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, 82)
        .encode_image(&image.to_rgb8())
        .map_err(anyhow::Error::from)?;
    Ok(out)
}

/// `GET /api/public/covers/{id}` (no login): the cover of a public page, resized, while it is
/// the cover of a page that is on and neither under review nor refused.
pub async fn cover(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(blob_id): Path<Uuid>,
) -> ApiResult<Response> {
    crate::ratelimit::by_ip(&state, &headers, crate::ratelimit::LOGO).await?;
    let blob = sqlx::query!(
        r#"select e.id as event_id, b.sha256 from blobs b
           join events e on e.public_cover_blob_id = b.id and e.public_page
           where b.id = $1 and b.moderation_status not in ('flagged', 'rejected')
             and not exists (select 1 from rejected_art r where r.sha256 = b.sha256)"#,
        blob_id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound)?;
    let etag = format!("\"c{}\"", hex::encode(&blob.sha256));
    let cache = [
        (
            CACHE_CONTROL,
            HeaderValue::from_static("public, max-age=3600"),
        ),
        (
            ETAG,
            HeaderValue::from_str(&etag).map_err(anyhow::Error::from)?,
        ),
    ];
    let fresh = headers
        .get(IF_NONE_MATCH)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value.split(',').any(|tag| tag.trim() == etag));
    if fresh {
        return Ok((StatusCode::NOT_MODIFIED, cache).into_response());
    }
    let path = state.config.export_dir.join(format!("cover-{blob_id}.jpg"));
    let jpeg = match tokio::fs::read(&path).await {
        Ok(bytes) if !bytes.is_empty() => bytes,
        _ => {
            let original = crate::art::bytes(&state, blob.event_id, blob_id)
                .await?
                .ok_or(ApiError::NotFound)?;
            let jpeg = tokio::task::spawn_blocking(move || cover_jpeg(&original))
                .await
                .map_err(anyhow::Error::from)??;
            let _ = tokio::fs::write(&path, &jpeg).await;
            jpeg
        }
    };
    Ok((
        cache,
        [(CONTENT_TYPE, HeaderValue::from_static("image/jpeg"))],
        jpeg,
    )
        .into_response())
}

/// Copies the design of `source` to `copy` (duplicating an event, another date): the cover is
/// an image of the source event, so it stays behind.
pub(crate) async fn copy(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    source: Uuid,
    copy: Uuid,
) -> ApiResult<()> {
    sqlx::query!(
        r#"update events c set public_design = s.public_design
           from events s where s.id = $1 and c.id = $2"#,
        source,
        copy
    )
    .execute(&mut **tx)
    .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api::{PageSection, PageSectionDto};

    #[test]
    fn a_saved_design_gets_the_parts_it_lacks() {
        let design = PublicPageDesign {
            sections: vec![
                PageSectionDto {
                    kind: PageSection::Faq,
                    visible: false,
                },
                PageSectionDto {
                    kind: PageSection::Faq,
                    visible: true,
                },
            ],
            ..PublicPageDesign::default()
        };
        let cleaned = clean(design).unwrap();
        assert_eq!(cleaned.sections.len(), 10);
        assert_eq!(cleaned.sections[0].kind, PageSection::Faq);
        assert!(!cleaned.sections[0].visible);
    }

    #[test]
    fn colours_links_and_texts_are_checked() {
        let bad_colour = PublicPageDesign {
            accent: Some("red".to_owned()),
            ..PublicPageDesign::default()
        };
        assert!(clean(bad_colour).is_err());
        let with_link = PublicPageDesign {
            accent: Some("#2563EB".to_owned()),
            cta: Some(PageLinkDto {
                label: " Comprar pelo formulário ".to_owned(),
                url: "forms.gle/abc".to_owned(),
            }),
            ..PublicPageDesign::default()
        };
        let cleaned = clean(with_link).unwrap();
        assert_eq!(cleaned.accent.as_deref(), Some("#2563eb"));
        let cta = cleaned.cta.unwrap();
        assert_eq!(cta.label, "Comprar pelo formulário");
        assert_eq!(cta.url, "https://forms.gle/abc");
        let empty_title = PublicPageDesign {
            schedule: vec![PageScheduleItemDto {
                time: "21h".to_owned(),
                title: " ".to_owned(),
                detail: None,
                day: None,
            }],
            ..PublicPageDesign::default()
        };
        assert!(clean(empty_title).is_err());
        let line = |day| PublicPageDesign {
            schedule: vec![PageScheduleItemDto {
                time: "21h".to_owned(),
                title: "Show".to_owned(),
                detail: None,
                day,
            }],
            ..PublicPageDesign::default()
        };
        assert_eq!(clean(line(Some(2))).unwrap().schedule[0].day, Some(2));
        assert!(clean(line(Some(0))).is_err());
        assert!(clean(line(Some(32))).is_err());
        // A design saved before the days keeps its program, without a day.
        let old = from_json(Some(serde_json::json!({
            "accent": null, "background": "plain", "hero": "color", "titleFont": null, "cta": null,
            "sections": [], "schedule": [{ "time": "21h", "title": "Show", "detail": null }],
            "faq": [], "links": [],
        })));
        assert_eq!(old.schedule[0].day, None);
        assert_eq!(
            from_json(Some(serde_json::json!({"nonsense": true}))),
            PublicPageDesign::default()
        );
    }
}
