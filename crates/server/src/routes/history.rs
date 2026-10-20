//! The history of an event (ADR 0099): what its organization, its team and the platform's support
//! changed, newest first. Written by [`crate::activity`]; read by who coordinates the event.

use axum::Json;
use axum::extract::{Path, Query, State};
use serde::Deserialize;
use time::OffsetDateTime;
use uuid::Uuid;

use super::event_access;
use crate::api::{ActivityDto, ActivityEntryDto, TeamArea};
use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult};
use crate::state::AppState;

/// Changes per page.
const PAGE: i64 = 100;

/// `?before=`: an RFC 3339 instant (the `at` of the last change shown).
#[derive(Debug, Deserialize)]
pub struct HistoryQuery {
    #[serde(default, with = "time::serde::rfc3339::option")]
    before: Option<OffsetDateTime>,
}

/// `GET /api/events/{id}/activity?before=`: for the organization and the team's coordination
/// (`manage`), who see what everyone did; the rest of the team does not.
pub async fn list(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
    Query(query): Query<HistoryQuery>,
) -> ApiResult<Json<ActivityDto>> {
    let access = event_access(&state.pool, &user, event_id).await?;
    if !access.is_owner() && !access.can(TeamArea::Manage) {
        return Err(ApiError::Refused(
            "not_your_area",
            "the coordination of the event sees its history".to_owned(),
        ));
    }
    let rows = sqlx::query!(
        r#"select a.id, a.created_at, a.actor_name, a.actor_email, a.action, a.area, a.support,
                  exists(select 1 from event_team t where t.event_id = a.event_id and t.user_id = a.user_id) as "team!"
           from event_activity a
           where a.event_id = $1 and ($2::timestamptz is null or a.created_at < $2)
           order by a.created_at desc
           limit $3"#,
        event_id,
        query.before,
        PAGE + 1,
    )
    .fetch_all(&state.pool)
    .await?;
    let more = rows.len() > usize::try_from(PAGE).unwrap_or(usize::MAX);
    let entries = rows
        .into_iter()
        .take(usize::try_from(PAGE).unwrap_or(usize::MAX))
        .map(|row| ActivityEntryDto {
            id: row.id,
            at: row.created_at,
            // The platform's support speaks as the platform: no admin's name or e-mail.
            actor: if row.support {
                String::new()
            } else {
                row.actor_name
                    .filter(|name| !name.trim().is_empty())
                    .unwrap_or_else(|| row.actor_email.clone())
            },
            email: (!row.support).then_some(row.actor_email),
            team: row.team && !row.support,
            support: row.support,
            action: row.action,
            area: row.area.as_deref().and_then(TeamArea::from_db),
        })
        .collect();
    Ok(Json(ActivityDto { entries, more }))
}
