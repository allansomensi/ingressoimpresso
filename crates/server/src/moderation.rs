//! Moderation of uploaded art (ADR 0042). Each new image is classified in the background by
//! Google Cloud Vision `SafeSearch` (when `MODERATION_VISION_API_KEY` is set, within
//! `MODERATION_DAILY_LIMIT`); an image likely sexual or violent becomes a flag that admins
//! approve or reject. A flagged image is not printed until approved; a rejected one never is.

use std::time::Duration;

use base64::Engine as _;
use serde::Deserialize;
use tokio::sync::Semaphore;
use uuid::Uuid;

use crate::error::{ApiError, ApiResult};
use crate::state::AppState;

const VISION_URL: &str = "https://vision.googleapis.com/v1/images:annotate";
/// Images are sent at most this wide: enough for `SafeSearch`, a fraction of the upload.
const CLASSIFY_WIDTH_PX: u32 = 1024;
/// Likelihoods as Vision ranks them.
const LIKELY: u8 = 4;
const VERY_LIKELY: u8 = 5;

/// `SafeSearch` likelihoods, 0 (unknown) to 5 (very likely).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, serde::Serialize)]
pub struct SafeSearch {
    /// Sexual content.
    pub adult: u8,
    /// Violence or gore.
    pub violence: u8,
    /// Suggestive content.
    pub racy: u8,
    /// Medical content.
    pub medical: u8,
    /// Edited to look offensive.
    pub spoof: u8,
}

impl SafeSearch {
    /// Why the image needs a human, with a 0–1 score; `None` when it looks fine. Thresholds:
    /// adult or violence likely, racy very likely (a party flyer can be a little racy).
    pub fn verdict(&self) -> Option<(Vec<&'static str>, f32)> {
        let mut reasons = Vec::new();
        if self.adult >= LIKELY {
            reasons.push("adult");
        }
        if self.violence >= LIKELY {
            reasons.push("violence");
        }
        if self.racy >= VERY_LIKELY {
            reasons.push("racy");
        }
        if reasons.is_empty() {
            return None;
        }
        let top = self.adult.max(self.violence).max(self.racy);
        Some((reasons, f32::from(top) / 5.0))
    }
}

/// The classifier.
#[derive(Debug)]
pub enum Classifier {
    /// Google Cloud Vision.
    Vision {
        /// HTTP client.
        client: reqwest::Client,
        /// API key (sent in a header, never in the URL, so it stays out of proxy logs).
        api_key: String,
        /// At most two requests at a time.
        permits: Semaphore,
    },
    /// Tests: always answers the same.
    Fixed(SafeSearch),
}

#[derive(Deserialize)]
struct VisionResponse {
    #[serde(default)]
    responses: Vec<VisionResult>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct VisionResult {
    safe_search_annotation: Option<VisionAnnotation>,
    error: Option<serde_json::Value>,
}

#[derive(Deserialize)]
struct VisionAnnotation {
    #[serde(default)]
    adult: String,
    #[serde(default)]
    violence: String,
    #[serde(default)]
    racy: String,
    #[serde(default)]
    medical: String,
    #[serde(default)]
    spoof: String,
}

fn likelihood(value: &str) -> u8 {
    match value {
        "VERY_UNLIKELY" => 1,
        "UNLIKELY" => 2,
        "POSSIBLE" => 3,
        "LIKELY" => LIKELY,
        "VERY_LIKELY" => VERY_LIKELY,
        _ => 0,
    }
}

impl Classifier {
    /// Cloud Vision with `api_key`. A rustls crypto provider must be installed first.
    ///
    /// # Errors
    ///
    /// When the HTTP client cannot be built.
    pub fn vision(api_key: String) -> Result<Self, String> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(20))
            .build()
            .map_err(|error| error.to_string())?;
        Ok(Self::Vision {
            client,
            api_key,
            permits: Semaphore::new(2),
        })
    }

    /// Classifies a JPEG.
    ///
    /// # Errors
    ///
    /// The provider's refusal or a network error.
    pub async fn classify(&self, jpeg: &[u8]) -> Result<SafeSearch, String> {
        match self {
            Self::Fixed(answer) => Ok(*answer),
            Self::Vision {
                client,
                api_key,
                permits,
            } => {
                let _permit = permits.acquire().await.map_err(|error| error.to_string())?;
                let body = serde_json::json!({
                    "requests": [{
                        "image": { "content": base64::engine::general_purpose::STANDARD.encode(jpeg) },
                        "features": [{ "type": "SAFE_SEARCH_DETECTION" }],
                    }]
                });
                let response = client
                    .post(VISION_URL)
                    .header("X-goog-api-key", api_key)
                    .json(&body)
                    .send()
                    .await
                    .map_err(|error| error.to_string())?;
                let status = response.status();
                if !status.is_success() {
                    let detail: String = response
                        .text()
                        .await
                        .unwrap_or_default()
                        .chars()
                        .take(300)
                        .collect();
                    return Err(format!("vision answered {status}: {detail}"));
                }
                let parsed: VisionResponse =
                    response.json().await.map_err(|error| error.to_string())?;
                let result = parsed
                    .responses
                    .into_iter()
                    .next()
                    .ok_or_else(|| "empty vision response".to_owned())?;
                if let Some(error) = result.error {
                    return Err(format!("vision error: {error}"));
                }
                let annotation = result
                    .safe_search_annotation
                    .ok_or_else(|| "no safe search annotation".to_owned())?;
                Ok(SafeSearch {
                    adult: likelihood(&annotation.adult),
                    violence: likelihood(&annotation.violence),
                    racy: likelihood(&annotation.racy),
                    medical: likelihood(&annotation.medical),
                    spoof: likelihood(&annotation.spoof),
                })
            }
        }
    }
}

/// Classifies an uploaded image once (idempotent: an image already checked is skipped). Runs
/// in the background after the upload; errors are logged and leave the image unchecked, for an
/// admin to look at in the list of recent uploads.
pub async fn check_art(state: &AppState, blob_id: Uuid) {
    if let Err(error) = try_check_art(state, blob_id).await {
        tracing::error!(?error, %blob_id, "art moderation failed");
    }
}

async fn try_check_art(state: &AppState, blob_id: Uuid) -> ApiResult<()> {
    let Some(classifier) = state.classifier.clone() else {
        return Ok(());
    };
    let Some(blob) = sqlx::query!(
        r#"select b.data, b.moderation_status, b.event_id, e.organization_id
           from blobs b join events e on e.id = b.event_id where b.id = $1"#,
        blob_id
    )
    .fetch_optional(&state.pool)
    .await?
    else {
        return Ok(());
    };
    if blob.moderation_status != "unchecked" || state.config.moderation_daily_limit == 0 {
        return Ok(());
    }
    // Daily budget: one row per day, counted atomically.
    let allowed = sqlx::query_scalar!(
        r#"insert into moderation_usage (day, requests) values (current_date, 1)
           on conflict (day) do update set requests = moderation_usage.requests + 1
           where moderation_usage.requests < $1
           returning requests"#,
        state.config.moderation_daily_limit,
    )
    .fetch_optional(&state.pool)
    .await?;
    if allowed.is_none() {
        tracing::warn!(%blob_id, "moderation budget spent: image left for manual review");
        return Ok(());
    }
    let data = blob.data;
    let jpeg = tokio::task::spawn_blocking(move || {
        crate::routes::events::shrink_to_jpeg(&data, CLASSIFY_WIDTH_PX)
    })
    .await
    .map_err(anyhow::Error::from)?
    .map_err(anyhow::Error::from)?;
    let verdict = classifier
        .classify(&jpeg)
        .await
        .map_err(|detail| anyhow::anyhow!(detail))?;
    let details = serde_json::to_value(verdict).map_err(anyhow::Error::from)?;
    let mut tx = state.pool.begin().await?;
    match verdict.verdict() {
        None => {
            sqlx::query!(
                "update blobs set moderation_status = 'clean' where id = $1 and moderation_status = 'unchecked'",
                blob_id
            )
            .execute(&mut *tx)
            .await?;
        }
        Some((reasons, score)) => {
            let reasons: Vec<String> = reasons.into_iter().map(str::to_owned).collect();
            sqlx::query!(
                "update blobs set moderation_status = 'flagged' where id = $1 and moderation_status = 'unchecked'",
                blob_id
            )
            .execute(&mut *tx)
            .await?;
            sqlx::query!(
                r#"insert into moderation_flags
                     (id, blob_id, organization_id, event_id, reasons, details, score, source)
                   values ($1, $2, $3, $4, $5, $6, $7, 'automatic')
                   on conflict (blob_id) where status = 'open' do nothing"#,
                Uuid::new_v4(),
                blob_id,
                blob.organization_id,
                blob.event_id,
                &reasons,
                details,
                score,
            )
            .execute(&mut *tx)
            .await?;
            tracing::warn!(%blob_id, ?reasons, "art flagged for review");
        }
    }
    tx.commit().await?;
    Ok(())
}

/// Starts [`check_art`] in the background.
pub fn spawn_check(state: &AppState, blob_id: Uuid) {
    if state.classifier.is_some() {
        let state = state.clone();
        tokio::spawn(async move { check_art(&state, blob_id).await });
    }
}

/// [`ensure_printable`] for the art of an event's latest design.
///
/// # Errors
///
/// As [`ensure_printable`].
pub async fn ensure_event_printable(pool: &sqlx::PgPool, event_id: Uuid) -> ApiResult<()> {
    let art = sqlx::query_scalar!(
        "select art_blob_id from ticket_designs where event_id = $1 order by version desc limit 1",
        event_id
    )
    .fetch_optional(pool)
    .await?
    .flatten();
    ensure_printable(pool, art).await
}

/// Refuses to print art under review (`art_under_review`) or refused (`art_rejected`).
///
/// # Errors
///
/// [`ApiError::Conflict`] as above; database errors.
pub async fn ensure_printable<'e, E: sqlx::PgExecutor<'e>>(
    executor: E,
    blob_id: Option<Uuid>,
) -> ApiResult<()> {
    let Some(blob_id) = blob_id else {
        return Ok(());
    };
    let status = sqlx::query_scalar!("select moderation_status from blobs where id = $1", blob_id)
        .fetch_optional(executor)
        .await?;
    match status.as_deref() {
        Some("flagged") => Err(ApiError::Conflict(
            "art_under_review",
            "the art is being reviewed by the team".to_owned(),
        )),
        Some("rejected") => Err(ApiError::Conflict(
            "art_rejected",
            "the art was refused by the team".to_owned(),
        )),
        _ => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verdicts() {
        let calm = SafeSearch {
            adult: 2,
            violence: 1,
            racy: 4,
            medical: 1,
            spoof: 1,
        };
        assert_eq!(calm.verdict(), None);
        let adult = SafeSearch {
            adult: 5,
            racy: 5,
            ..calm
        };
        assert_eq!(adult.verdict(), Some((vec!["adult", "racy"], 1.0)));
        let gore = SafeSearch {
            violence: 4,
            ..calm
        };
        assert_eq!(gore.verdict(), Some((vec!["violence"], 0.8)));
        assert_eq!(likelihood("LIKELY"), 4);
        assert_eq!(likelihood("whatever"), 0);
    }
}
