//! The history of an event (ADR 0099): every change made to it by its organization, its team or an
//! admin in support mode, written only when the change succeeded.
//!
//! [`routes::event_access`](crate::routes::event_access) notes the change it lets through (who,
//! which event, the request's shape); [`record`], a layer around the API, writes the note once the
//! handler answered with a success. The note lives in a task-local slot of the request: handlers
//! run inside the layer's future, so nothing has to be threaded through them.

use std::cell::RefCell;

use axum::extract::{Request, State};
use axum::http::Method;
use axum::middleware::Next;
use axum::response::Response;
use uuid::Uuid;

use crate::api::TeamArea;
use crate::routes::team;
use crate::state::AppState;

/// A change let through, waiting for the handler's answer.
#[derive(Debug, Clone)]
pub struct Note {
    pub event_id: Uuid,
    pub user_id: Uuid,
    pub email: String,
    /// `PUT events/{id}/design`.
    pub action: String,
    pub area: Option<TeamArea>,
    pub support: bool,
}

tokio::task_local! {
    static PENDING: RefCell<Option<Note>>;
}

/// Notes a change of `event_id` (the first one of the request wins: some actions touch several
/// events, such as renaming a series). Outside a request (tests, jobs) it does nothing.
pub fn note(
    event_id: Uuid,
    user_id: Uuid,
    email: &str,
    method: &Method,
    path: &str,
    support: bool,
) {
    // Marking digital tickets as sent (ADR 0123) keeps the list's bookkeeping, not a change.
    if path.ends_with("/tickets/sent") {
        return;
    }
    let area = match team::need(method, path) {
        team::Need::Read => return,
        team::Need::Area(area) | team::Need::Either(area, _) => Some(area),
        team::Need::Owner => None,
    };
    let _ = PENDING.try_with(|slot| {
        let mut slot = slot.borrow_mut();
        if slot.is_none() {
            *slot = Some(Note {
                event_id,
                user_id,
                email: email.to_owned(),
                action: format!("{} {}", method.as_str(), team::shape(path))
                    .chars()
                    .take(120)
                    .collect(),
                area,
                support,
            });
        }
    });
}

/// Layer of the API: runs the request with an empty slot and writes its note if it succeeded. A
/// failure to write is logged and never turns the answer into an error.
pub async fn record(State(state): State<AppState>, request: Request, next: Next) -> Response {
    if matches!(
        *request.method(),
        Method::GET | Method::HEAD | Method::OPTIONS
    ) {
        return next.run(request).await;
    }
    let (response, note) = PENDING
        .scope(RefCell::new(None), async {
            let response = next.run(request).await;
            let note = PENDING.with(|slot| slot.borrow_mut().take());
            (response, note)
        })
        .await;
    if let Some(note) = note.filter(|_| response.status().is_success())
        && let Err(error) = write(&state, &note).await
    {
        tracing::warn!(%error, event_id = %note.event_id, "could not write the event history");
    }
    response
}

async fn write(state: &AppState, note: &Note) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"insert into event_activity (id, event_id, user_id, actor_name, actor_email, action, area, support)
           select $1, $2, $3,
                  coalesce((select t.name from event_team t where t.event_id = $2 and t.user_id = $3),
                           (select u.name from users u where u.id = $3)),
                  $4, $5, $6, $7
           where exists (select 1 from events where id = $2)"#,
        Uuid::new_v4(),
        note.event_id,
        note.user_id,
        note.email,
        note.action,
        note.area.map(TeamArea::db),
        note.support,
    )
    .execute(&state.pool)
    .await?;
    Ok(())
}
