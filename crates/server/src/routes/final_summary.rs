//! The event's final summary (ADR 0101): one page for the committee or the board with the
//! audience, what came in and went out, the balance and the sellers who stood out, built on the
//! accountability (ADR 0058). A PDF to print and a picture to send in a chat.

use axum::extract::{Path, State};
use axum::response::Response;
use ticket_render::{SummaryCard, SummaryFigure, SummaryHighlight};
use uuid::Uuid;

use super::authorize_event;
use super::ledger::{
    Accountability, accountability, attachment, brl, generated_line, subtitle, whole,
};
use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult};
use crate::state::AppState;
use crate::texts;

/// Width of the picture, in pixels (a phone screen).
const PICTURE_WIDTH: u32 = 1080;

/// Whether white text reads on `#rrggbb` (relative luminance below 0.4).
fn dark(hex: &str) -> bool {
    let channel = |at: usize| {
        hex.get(at..at + 2)
            .and_then(|pair| u8::from_str_radix(pair, 16).ok())
            .map(|value| {
                let c = f64::from(value) / 255.0;
                if c <= 0.039_28 {
                    c / 12.92
                } else {
                    ((c + 0.055) / 1.055).powf(2.4)
                }
            })
    };
    match (hex.len(), channel(1), channel(3), channel(5)) {
        (7, Some(r), Some(g), Some(b)) => 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.4,
        _ => false,
    }
}

fn figure(
    label: &str,
    value: String,
    note: Option<String>,
    tone: Option<&'static str>,
) -> SummaryFigure {
    SummaryFigure {
        label: label.to_owned(),
        value,
        note,
        tone,
    }
}

/// The page, from the accountability and the organization's colour.
fn card(data: &Accountability, color: Option<String>) -> SummaryCard {
    let t = if data.event.tokens() {
        &texts::SUMMARY_TOKENS
    } else {
        &texts::SUMMARY
    };
    let s = &data.summary;
    let raised = s.received_cents + s.other_income_cents;
    let spent = s.expenses_cents + s.platform_cents;
    let mut details = vec![figure(t.sold, whole(s.sold), None, None)];
    if s.courtesies > 0 {
        details.push(figure(t.courtesies, whole(s.courtesies), None, None));
    }
    if s.commissions_cents > 0 {
        details.push(figure(t.commissions, brl(s.commissions_cents), None, None));
    }
    if let Some(outstanding) = s.outstanding_cents.filter(|cents| *cents > 0) {
        details.push(figure(t.outstanding, brl(outstanding), None, Some("bad")));
    }
    // Who sold the most (box offices sell at the door, not by effort, but count the same).
    let mut sellers: Vec<_> = data
        .report
        .sellers
        .iter()
        .filter(|row| row.declared_sold > 0)
        .collect();
    sellers.sort_by(|a, b| {
        b.declared_sold
            .cmp(&a.declared_sold)
            .then_with(|| a.seller.cmp(&b.seller))
    });
    let highlights = sellers
        .into_iter()
        .take(3)
        .zip(1u8..)
        .map(|(row, position)| SummaryHighlight {
            position,
            name: row.seller.clone().unwrap_or_default(),
            value: t.sold_count.replace("{count}", &whole(row.declared_sold)),
            amount: row.amount_due_cents.map(brl),
        })
        .collect();
    SummaryCard {
        kicker: t.kicker.to_owned(),
        title: data.event.name.clone(),
        subtitle: subtitle(data),
        color: color
            .filter(|color| dark(color))
            .unwrap_or_else(|| "#5b3df5".to_owned()),
        headline: vec![
            figure(
                t.audience,
                whole(s.entries),
                Some(t.audience_note.replace("{sold}", &whole(s.sold))),
                None,
            ),
            figure(t.raised, brl(raised), Some(t.raised_note.to_owned()), None),
            figure(t.spent, brl(spent), None, None),
            figure(
                t.balance,
                brl(s.balance_cents),
                None,
                Some(if s.balance_cents < 0 { "bad" } else { "good" }),
            ),
        ],
        details,
        highlights_title: t.highlights.to_owned(),
        highlights,
        footer: generated_line(),
        brand: t.brand.to_owned(),
    }
}

async fn load(
    state: &AppState,
    user: &AuthUser,
    event_id: Uuid,
) -> ApiResult<(SummaryCard, String)> {
    let event = authorize_event(&state.pool, user, event_id).await?;
    let color = sqlx::query_scalar!(
        r#"select p.brand_color as "color?" from events e
           join organization_profiles p on p.organization_id = e.organization_id where e.id = $1"#,
        event_id
    )
    .fetch_optional(&state.pool)
    .await?
    .flatten();
    let data = accountability(state, event).await?;
    let slug = crate::jobs::slug(&data.event.name);
    let t = if data.event.tokens() {
        &texts::SUMMARY_TOKENS
    } else {
        &texts::SUMMARY
    };
    let name = if slug.is_empty() {
        t.file.to_owned()
    } else {
        format!("{}-{slug}", t.file)
    };
    Ok((card(&data, color), name))
}

async fn render<T: Send + 'static>(
    state: &AppState,
    job: impl FnOnce() -> Result<T, ticket_render::RenderError> + Send + 'static,
) -> ApiResult<T> {
    state
        .blocking_render(job)
        .await?
        .map_err(|error| ApiError::Internal(error.into()))
}

/// `GET /api/events/{id}/summary/pdf`.
pub async fn pdf(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
) -> ApiResult<Response> {
    let (card, name) = load(&state, &user, event_id).await?;
    super::heavy_render(&state, &user).await?;
    let bytes = render(&state, move || ticket_render::summary_pdf(&card)).await?;
    Ok(attachment(&format!("{name}.pdf"), "application/pdf", bytes))
}

/// `GET /api/events/{id}/summary/png`.
pub async fn picture(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
) -> ApiResult<Response> {
    let (card, name) = load(&state, &user, event_id).await?;
    super::heavy_render(&state, &user).await?;
    let bytes = render(&state, move || {
        ticket_render::summary_png(&card, PICTURE_WIDTH)
    })
    .await?;
    Ok(attachment(&format!("{name}.png"), "image/png", bytes))
}
