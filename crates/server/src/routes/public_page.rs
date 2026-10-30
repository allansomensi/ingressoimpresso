//! The event's public page (ADR 0095): one link the organizer shares, `/e/<slug>`, with the date,
//! the place, the price of each category, the sellers with a WhatsApp button and a "sold out" seal.
//! Off until the organizer turns it on; the API answers 404 for a page that is off.

use std::collections::HashSet;

use axum::Json;
use axum::extract::{Path, State};
use axum::http::HeaderMap;
use uuid::Uuid;

use super::{authorize_event, optional_text};
use crate::api::{
    PublicCategoryDto, PublicEventDto, PublicPageBody, PublicPageSellerDto, PublicPageSettingsDto,
    PublicSellerDto,
};
use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult, bad_request};
use crate::jobs::slug;
use crate::ratelimit;
use crate::state::AppState;

const MAX_DESCRIPTION: usize = 600;
/// Shortest and longest address.
const SLUG_CHARS: std::ops::RangeInclusive<usize> = 3..=60;
/// Addresses that would read as the site's own pages.
const RESERVED: &[&str] = &[
    "admin", "api", "painel", "entrar", "novo", "evento", "eventos",
];

/// WhatsApp digits of a free-form phone: Brazilian numbers get 55; anything else unusable is
/// `None` (the seller is then not shown).
fn whatsapp(phone: Option<&str>) -> Option<String> {
    let mut digits: String = phone?.chars().filter(char::is_ascii_digit).collect();
    while digits.starts_with('0') {
        digits.remove(0);
    }
    if digits.len() == 10 || digits.len() == 11 {
        digits.insert_str(0, "55");
    }
    (12..=15).contains(&digits.len()).then_some(digits)
}

/// "Ana Souza" → "Ana S.": a public page shows no full names.
fn short_name(name: &str) -> String {
    let mut words = name.split_whitespace();
    let first = words.next().unwrap_or_default();
    match words.last().and_then(|last| last.chars().next()) {
        Some(initial) => format!("{first} {initial}."),
        None => first.to_owned(),
    }
}

/// A free address from the event's name: `arraia-sao-jose`, else `arraia-sao-jose-2`…
async fn suggest(state: &AppState, event_id: Uuid, name: &str) -> ApiResult<String> {
    let mut base: String = slug(name).chars().take(50).collect();
    base = base.trim_end_matches('-').to_owned();
    if base.chars().count() < *SLUG_CHARS.start() || RESERVED.contains(&base.as_str()) {
        base = format!("evento-{base}");
        base = base.trim_end_matches('-').to_owned();
    }
    let taken: HashSet<String> = sqlx::query_scalar!(
        r#"select public_slug as "slug!" from events
           where id <> $1 and public_slug is not null and public_slug like $2 || '%'"#,
        event_id,
        base,
    )
    .fetch_all(&state.pool)
    .await?
    .into_iter()
    .collect();
    if !taken.contains(&base) {
        return Ok(base);
    }
    // `taken` is finite: one of the next `taken.len() + 2` candidates is free.
    Ok((2..taken.len() + 3)
        .map(|n| format!("{base}-{n}"))
        .find(|candidate| !taken.contains(candidate))
        .unwrap_or(base))
}

/// Paid numbers of the event, and how many are gone (sold, sent, given, entered or voided), in
/// all and by category.
pub(crate) async fn availability(
    state: &AppState,
    event_id: Uuid,
) -> ApiResult<(bool, std::collections::HashMap<Uuid, bool>)> {
    let rows = sqlx::query!(
        r#"with issued as (
               select n as number
               from ticket_batches b, generate_series(lower(b.numbers), upper(b.numbers) - 1) as n
               where b.event_id = $1 and b.status = 'paid'
           )
           select cr.category_id as "category_id?",
                  count(*) as "issued!",
                  count(*) filter (where
                      exists (select 1 from ticket_sales s where s.event_id = $1 and s.ticket_number = i.number)
                      or exists (select 1 from ticket_links l where l.event_id = $1 and l.ticket_number = i.number and l.revoked_at is null)
                      or exists (select 1 from courtesies c where c.event_id = $1 and c.ticket_number = i.number)
                      or exists (select 1 from entries e where e.event_id = $1 and e.ticket_number = i.number)
                      or exists (select 1 from ticket_voids v where v.event_id = $1 and v.undone_at is null and v.numbers @> i.number)
                  ) as "gone!"
           from issued i
           left join category_ranges cr on cr.event_id = $1 and cr.numbers @> i.number
           group by cr.category_id"#,
        event_id
    )
    .fetch_all(&state.pool)
    .await?;
    let issued: i64 = rows.iter().map(|row| row.issued).sum();
    let gone: i64 = rows.iter().map(|row| row.gone).sum();
    let by_category = rows
        .into_iter()
        .filter_map(|row| Some((row.category_id?, row.issued > 0 && row.gone >= row.issued)))
        .collect();
    Ok((issued > 0 && gone >= issued, by_category))
}

async fn settings_of(state: &AppState, event_id: Uuid) -> ApiResult<PublicPageSettingsDto> {
    let row = sqlx::query!(
        "select name, public_page, public_slug, public_sold_out, public_description, public_waitlist from events where id = $1",
        event_id
    )
    .fetch_one(&state.pool)
    .await?;
    let sellers = sqlx::query!(
        "select id, name, phone, on_public_page from sellers where event_id = $1 and not box_office order by name",
        event_id
    )
    .fetch_all(&state.pool)
    .await?
    .into_iter()
    .map(|seller| PublicPageSellerDto {
        id: seller.id,
        name: seller.name,
        has_whatsapp: whatsapp(seller.phone.as_deref()).is_some(),
        shown: seller.on_public_page,
    })
    .collect();
    let (sold_out_auto, _) = availability(state, event_id).await?;
    Ok(PublicPageSettingsDto {
        enabled: row.public_page,
        url: row
            .public_slug
            .as_ref()
            .filter(|_| row.public_page)
            .map(|slug| format!("{}/e/{slug}", state.config.public_web_url)),
        suggested_slug: match &row.public_slug {
            Some(slug) => slug.clone(),
            None => suggest(state, event_id, &row.name).await?,
        },
        slug: row.public_slug,
        sold_out: row.public_sold_out,
        sold_out_auto,
        description: row.public_description,
        sellers,
        waitlist: row.public_waitlist,
    })
}

/// `GET /api/events/{id}/public-page`.
pub async fn settings(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
) -> ApiResult<Json<PublicPageSettingsDto>> {
    authorize_event(&state.pool, &user, event_id).await?;
    Ok(Json(settings_of(&state, event_id).await?))
}

pub(crate) fn clean_slug(text: &str) -> ApiResult<String> {
    let slug = text.trim().to_ascii_lowercase();
    let valid = SLUG_CHARS.contains(&slug.chars().count())
        && slug
            .split('-')
            .all(|part| !part.is_empty() && part.chars().all(|c| c.is_ascii_alphanumeric()))
        && !RESERVED.contains(&slug.as_str());
    if valid {
        Ok(slug)
    } else {
        Err(bad_request(
            "invalid_slug",
            "use 3–60 lowercase letters, digits and single hyphens",
        ))
    }
}

/// `PUT /api/events/{id}/public-page`: turns the page on or off, with its address, the sold-out
/// seal, the paragraph and the sellers it lists.
pub async fn update(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
    Json(body): Json<PublicPageBody>,
) -> ApiResult<Json<PublicPageSettingsDto>> {
    authorize_event(&state.pool, &user, event_id).await?;
    let slug = clean_slug(&body.slug)?;
    let description = optional_text(body.description.map(|text| text.replace("\r\n", "\n")));
    if let Some(text) = &description {
        if text.chars().count() > MAX_DESCRIPTION {
            return Err(bad_request(
                "invalid_description",
                format!("up to {MAX_DESCRIPTION} characters"),
            ));
        }
        if text.chars().any(|c| c.is_control() && c != '\n') {
            return Err(bad_request(
                "invalid_description",
                "control characters are not allowed",
            ));
        }
    }
    let mut tx = state.pool.begin().await?;
    sqlx::query!(
        r#"update events set public_page = $2, public_slug = $3, public_sold_out = $4, public_description = $5,
                             public_waitlist = coalesce($6, public_waitlist)
           where id = $1"#,
        event_id,
        body.enabled,
        slug,
        body.sold_out,
        description,
        body.waitlist,
    )
    .execute(&mut *tx)
    .await
    .map_err(|error| match ApiError::from(error) {
        ApiError::Conflict(..) => ApiError::Conflict(
            "slug_taken",
            "another event uses this address".to_owned(),
        ),
        other => other,
    })?;
    sqlx::query!(
        "update sellers set on_public_page = (id = any($2)) where event_id = $1",
        event_id,
        &body.seller_ids,
    )
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(Json(settings_of(&state, event_id).await?))
}

/// `GET /api/public/events/{slug}` (no login, limited per address).
pub async fn public(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(slug): Path<String>,
) -> ApiResult<Json<PublicEventDto>> {
    ratelimit::by_ip(&state, &headers, ratelimit::PUBLIC_PAGE).await?;
    let slug = clean_slug(&slug).map_err(|_| ApiError::NotFound)?;
    let event = sqlx::query!(
        r#"select e.id, e.public_sold_out, e.public_description, e.public_verify, e.public_waitlist,
                  o.suspended_at is not null as "suspended!"
           from events e join organizations o on o.id = e.organization_id
           where e.public_slug = $1 and e.public_page"#,
        slug
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound)?;
    // A suspended organization's page goes dark with it (ADR 0032).
    if event.suspended {
        return Err(ApiError::NotFound);
    }
    let row = super::seller_links::event_row(&state, event.id).await?;
    let offset = row.offset();
    let (organization, days, categories, (sold_out_auto, sold_out_by_category), sellers) = tokio::try_join!(
        super::organization::event_organization(&state.pool, event.id),
        crate::event_days::of_event(&state.pool, event.id, offset),
        super::categories::load(&state.pool, event.id),
        availability(&state, event.id),
        async {
            Ok(sqlx::query!(
                    "select name, phone from sellers where event_id = $1 and on_public_page and not box_office order by name",
                    event.id
                )
                .fetch_all(&state.pool)
                .await?)
        },
    )?;
    let waiting_open = event.public_waitlist
        && row.canceled_at.is_none()
        && row.ends_at > time::OffsetDateTime::now_utc()
        && (event.public_sold_out
            || sold_out_auto
            || sold_out_by_category.values().any(|sold_out| *sold_out));
    Ok(Json(PublicEventDto {
        slug,
        name: row.name.clone(),
        kind: row.kind(),
        starts_at: row.starts_at.to_offset(offset),
        ends_at: row.ends_at.to_offset(offset),
        days,
        venue: row.venue.clone(),
        address: row.address.clone(),
        description: event.public_description,
        organization,
        ticket_price_cents: row.ticket_price_cents,
        categories: categories
            .into_iter()
            .map(|category| PublicCategoryDto {
                id: category.id,
                sold_out: sold_out_by_category
                    .get(&category.id)
                    .copied()
                    .unwrap_or(false),
                name: category.name,
                color: category.color,
                price_cents: category.price_cents.or(row.ticket_price_cents),
            })
            .collect(),
        sellers: sellers
            .into_iter()
            .filter_map(|seller| {
                Some(PublicSellerDto {
                    whatsapp: whatsapp(seller.phone.as_deref())?,
                    name: short_name(&seller.name),
                })
            })
            .collect(),
        sold_out: event.public_sold_out || sold_out_auto,
        change: row.change(),
        public_verify: event.public_verify,
        waitlist: waiting_open,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn phones_become_whatsapp_digits() {
        assert_eq!(
            whatsapp(Some("(11) 99999-8888")).as_deref(),
            Some("5511999998888")
        );
        assert_eq!(
            whatsapp(Some("+55 21 98888-7777")).as_deref(),
            Some("5521988887777")
        );
        assert_eq!(whatsapp(Some("1234")), None);
        assert_eq!(whatsapp(None), None);
    }

    #[test]
    fn public_names_are_short() {
        assert_eq!(short_name("Ana Maria Souza"), "Ana S.");
        assert_eq!(short_name("  Bia "), "Bia");
    }

    #[test]
    fn slugs_are_checked() {
        assert_eq!(clean_slug(" Arraia-Sao-Jose ").unwrap(), "arraia-sao-jose");
        for bad in ["ab", "a--b", "-ab", "ab-", "festa junina", "painel", "ação"] {
            assert!(clean_slug(bad).is_err(), "{bad}");
        }
    }
}
