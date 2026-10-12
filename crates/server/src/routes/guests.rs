//! Guest list at the door (ADR 0070): names the organizer lets in without a ticket, checked off
//! by the door phones offline. Arrivals are a G-Set like scans (ids made on the phone, the same
//! safe cursor); an undo marks its arrival and gives it a new `txid`, so every phone hears it.
//! The first arrival that was not undone is when the guest came in; later ones add people up to
//! the size of the party.

use std::collections::HashSet;

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use time::{Duration, OffsetDateTime};
use uuid::Uuid;

use super::door::{DoorDevice, unix_ms};
use super::{authorize_event, one_line, optional_text};
use crate::api::{
    DoorCategoryTagDto, DoorGuestArrivalDto, DoorGuestDto, DoorGuestResult, DoorGuestUpload,
    DoorGuestsBody, DoorGuestsResponse, GuestArrivalDto, GuestBody, GuestBulkBody, GuestDto,
};
use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult, bad_request};
use crate::state::AppState;

/// Most names on one event's list.
pub const MAX_GUESTS: i64 = 2_000;
/// Most names in one paste.
const MAX_BULK: usize = 500;
/// Most arrivals in one upload.
const MAX_ARRIVALS_PER_UPLOAD: usize = 500;
const MAX_NAME_CHARS: usize = 80;
const MAX_NOTE_CHARS: usize = 120;
const MAX_COMPANIONS: i16 = 20;
/// The phone undoes an arrival within 2 minutes; the server allows some clock slack.
const UNDO_WINDOW: Duration = Duration::seconds(150);

/// A guest checked and ready to store.
struct CleanGuest {
    name: String,
    companions: i16,
    note: Option<String>,
    category_id: Option<Uuid>,
}

fn clean(body: GuestBody) -> ApiResult<CleanGuest> {
    let name = body.name.trim().to_owned();
    if name.is_empty() || name.chars().count() > MAX_NAME_CHARS {
        return Err(bad_request(
            "invalid_guest_name",
            format!("name must have 1–{MAX_NAME_CHARS} characters"),
        ));
    }
    one_line(&name, "invalid_guest_name")?;
    let companions = body.companions.unwrap_or(0);
    if !(0..=MAX_COMPANIONS).contains(&companions) {
        return Err(bad_request(
            "invalid_companions",
            format!("companions must be 0–{MAX_COMPANIONS}"),
        ));
    }
    let note = optional_text(body.note);
    if let Some(note) = &note {
        if note.chars().count() > MAX_NOTE_CHARS {
            return Err(bad_request(
                "invalid_note",
                format!("note must have up to {MAX_NOTE_CHARS} characters"),
            ));
        }
        one_line(note, "invalid_note")?;
    }
    Ok(CleanGuest {
        name,
        companions,
        note,
        category_id: body.category_id,
    })
}

/// Refuses categories of another event.
async fn check_categories(
    state: &AppState,
    event_id: Uuid,
    guests: &[CleanGuest],
) -> ApiResult<()> {
    let ids: Vec<Uuid> = guests
        .iter()
        .filter_map(|guest| guest.category_id)
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();
    if ids.is_empty() {
        return Ok(());
    }
    let known = sqlx::query_scalar!(
        r#"select count(*) as "count!" from ticket_categories where event_id = $1 and id = any($2)"#,
        event_id,
        &ids,
    )
    .fetch_one(&state.pool)
    .await?;
    if usize::try_from(known).ok() != Some(ids.len()) {
        return Err(bad_request("invalid_category", "unknown category"));
    }
    Ok(())
}

/// Refuses a list that would pass [`MAX_GUESTS`].
async fn check_room(state: &AppState, event_id: Uuid, adding: usize) -> ApiResult<()> {
    let count = sqlx::query_scalar!(
        r#"select count(*) as "count!" from guest_list where event_id = $1"#,
        event_id
    )
    .fetch_one(&state.pool)
    .await?;
    if count + i64::try_from(adding).unwrap_or(i64::MAX) > MAX_GUESTS {
        return Err(ApiError::Conflict(
            "guest_list_full",
            format!("a list holds at most {MAX_GUESTS} names"),
        ));
    }
    Ok(())
}

struct GuestRow {
    id: Uuid,
    name: String,
    companions: i16,
    note: Option<String>,
    category_id: Option<Uuid>,
    created_at: OffsetDateTime,
    arrived_at: Option<OffsetDateTime>,
    device_name: Option<String>,
    people: i32,
}

impl From<GuestRow> for GuestDto {
    fn from(row: GuestRow) -> Self {
        let arrival = row
            .arrived_at
            .zip(row.device_name)
            .map(|(at, device_name)| GuestArrivalDto {
                at,
                device_name,
                people: row.people.min(i32::from(row.companions) + 1),
            });
        Self {
            id: row.id,
            name: row.name,
            companions: row.companions,
            note: row.note,
            category_id: row.category_id,
            arrival,
            created_at: row.created_at,
        }
    }
}

/// Guests of an event (or one guest) with their first arrival that was not undone.
async fn load(state: &AppState, event_id: Uuid, only: Option<&[Uuid]>) -> ApiResult<Vec<GuestDto>> {
    let rows = sqlx::query_as!(
        GuestRow,
        r#"select g.id, g.name, g.companions, g.note, g.category_id, g.created_at,
                  f.arrived_at as "arrived_at?", f.name as "device_name?",
                  (select coalesce(sum(a.people), 0) from guest_arrivals a
                   where a.guest_id = g.id and a.undone_at is null)::int as "people!"
           from guest_list g
           left join lateral (
               select a.arrived_at, d.name from guest_arrivals a
               join door_devices d on d.id = a.device_id
               where a.guest_id = g.id and a.undone_at is null
               order by a.arrived_at, a.id limit 1
           ) f on true
           where g.event_id = $1 and ($2::uuid[] is null or g.id = any($2))
           order by lower(g.name), g.created_at"#,
        event_id,
        only,
    )
    .fetch_all(&state.pool)
    .await?;
    Ok(rows.into_iter().map(Into::into).collect())
}

async fn one(state: &AppState, event_id: Uuid, guest_id: Uuid) -> ApiResult<GuestDto> {
    load(state, event_id, Some(&[guest_id]))
        .await?
        .into_iter()
        .next()
        .ok_or(ApiError::NotFound)
}

/// `GET /api/events/{id}/guests`.
pub async fn list(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
) -> ApiResult<Json<Vec<GuestDto>>> {
    authorize_event(&state.pool, &user, event_id).await?;
    Ok(Json(load(&state, event_id, None).await?))
}

async fn insert(
    state: &AppState,
    user: &AuthUser,
    event_id: Uuid,
    guests: Vec<CleanGuest>,
) -> ApiResult<Vec<Uuid>> {
    check_categories(state, event_id, &guests).await?;
    check_room(state, event_id, guests.len()).await?;
    let mut tx = state.pool.begin().await?;
    let mut ids = Vec::with_capacity(guests.len());
    for guest in guests {
        let id = Uuid::new_v4();
        sqlx::query!(
            r#"insert into guest_list (id, event_id, name, companions, note, category_id, created_by)
               values ($1, $2, $3, $4, $5, $6, $7)"#,
            id,
            event_id,
            guest.name,
            guest.companions,
            guest.note,
            guest.category_id,
            user.id,
        )
        .execute(&mut *tx)
        .await?;
        ids.push(id);
    }
    tx.commit().await?;
    Ok(ids)
}

/// `POST /api/events/{id}/guests`.
pub async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
    Json(body): Json<GuestBody>,
) -> ApiResult<(StatusCode, Json<GuestDto>)> {
    authorize_event(&state.pool, &user, event_id).await?;
    let guest = clean(body)?;
    let ids = insert(&state, &user, event_id, vec![guest]).await?;
    let id = ids.first().copied().ok_or(ApiError::NotFound)?;
    Ok((StatusCode::CREATED, Json(one(&state, event_id, id).await?)))
}

/// `POST /api/events/{id}/guests/bulk`: names pasted one per line (the panel parses them).
pub async fn create_bulk(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
    Json(body): Json<GuestBulkBody>,
) -> ApiResult<(StatusCode, Json<Vec<GuestDto>>)> {
    authorize_event(&state.pool, &user, event_id).await?;
    if body.guests.is_empty() || body.guests.len() > MAX_BULK {
        return Err(bad_request(
            "invalid_guests",
            format!("send 1–{MAX_BULK} names"),
        ));
    }
    let guests = body
        .guests
        .into_iter()
        .map(clean)
        .collect::<ApiResult<Vec<_>>>()?;
    let ids = insert(&state, &user, event_id, guests).await?;
    Ok((
        StatusCode::CREATED,
        Json(load(&state, event_id, Some(&ids)).await?),
    ))
}

async fn guest_event(state: &AppState, user: &AuthUser, guest_id: Uuid) -> ApiResult<Uuid> {
    let event_id = sqlx::query_scalar!("select event_id from guest_list where id = $1", guest_id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or(ApiError::NotFound)?;
    authorize_event(&state.pool, user, event_id).await?;
    Ok(event_id)
}

/// `PUT /api/guests/{id}`.
pub async fn update(
    State(state): State<AppState>,
    user: AuthUser,
    Path(guest_id): Path<Uuid>,
    Json(body): Json<GuestBody>,
) -> ApiResult<Json<GuestDto>> {
    let event_id = guest_event(&state, &user, guest_id).await?;
    let guest = clean(body)?;
    check_categories(&state, event_id, std::slice::from_ref(&guest)).await?;
    sqlx::query!(
        r#"update guest_list set name = $2, companions = $3, note = $4, category_id = $5,
                                 updated_at = now()
           where id = $1"#,
        guest_id,
        guest.name,
        guest.companions,
        guest.note,
        guest.category_id,
    )
    .execute(&state.pool)
    .await?;
    Ok(Json(one(&state, event_id, guest_id).await?))
}

/// `DELETE /api/guests/{id}` (and their arrivals).
pub async fn delete(
    State(state): State<AppState>,
    user: AuthUser,
    Path(guest_id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    guest_event(&state, &user, guest_id).await?;
    sqlx::query!("delete from guest_list where id = $1", guest_id)
        .execute(&state.pool)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

// Door phones ----------------------------------------------------------------------------

/// The guest list for the manifest, only when the phone's `held` version is not current (an app
/// that does not ask, `None`, gets nothing), and the current version.
pub(crate) async fn door_list(
    state: &AppState,
    event_id: Uuid,
    held: Option<&str>,
) -> ApiResult<(Option<Vec<DoorGuestDto>>, String)> {
    let version = sqlx::query_scalar!(
        r#"select count(*)::text || '-' ||
                  coalesce(md5(string_agg(g.id::text || g.updated_at::text, ',' order by g.id)), '')
                  as "version!"
           from guest_list g where g.event_id = $1"#,
        event_id
    )
    .fetch_one(&state.pool)
    .await?;
    if held.is_none_or(|held| held == version) {
        return Ok((None, version));
    }
    let guests = sqlx::query!(
        r#"select g.id, g.name, g.companions, g.note, c.name as "category_name?", c.color as "category_color?"
           from guest_list g left join ticket_categories c on c.id = g.category_id
           where g.event_id = $1 order by g.name"#,
        event_id
    )
    .fetch_all(&state.pool)
    .await?
    .into_iter()
    .map(|row| DoorGuestDto {
        id: row.id,
        name: row.name,
        companions: row.companions,
        note: row.note,
        category: row
            .category_name
            .zip(row.category_color)
            .map(|(name, color)| DoorCategoryTagDto { name, color }),
    })
    .collect();
    Ok((Some(guests), version))
}

/// Arrivals (and undos) written by transactions in `[since, until)`, like the scans' entries.
pub(crate) async fn arrivals_between(
    state: &AppState,
    event_id: Uuid,
    since: i64,
    until: i64,
) -> ApiResult<Vec<DoorGuestArrivalDto>> {
    Ok(sqlx::query!(
        r#"select a.id, a.guest_id, a.people, a.arrived_at, a.undone_at is not null as "undone!", d.name
           from guest_arrivals a join door_devices d on d.id = a.device_id
           where a.event_id = $1
             and a.txid >= $2::bigint::text::xid8 and a.txid < $3::bigint::text::xid8
           order by a.txid, a.id"#,
        event_id,
        since,
        until,
    )
    .fetch_all(&state.pool)
    .await?
    .into_iter()
    .map(|row| DoorGuestArrivalDto {
        id: row.id,
        guest_id: row.guest_id,
        people: row.people,
        at_unix_ms: unix_ms(row.arrived_at),
        device_name: row.name,
        undone: row.undone,
    })
    .collect())
}

/// An uploaded arrival with its values checked.
struct ValidArrival {
    id: Uuid,
    guest_id: Uuid,
    people: i16,
    arrived_at: OffsetDateTime,
    undone_at: Option<OffsetDateTime>,
}

impl TryFrom<&DoorGuestUpload> for ValidArrival {
    type Error = ApiError;

    fn try_from(upload: &DoorGuestUpload) -> ApiResult<Self> {
        let invalid = || {
            bad_request(
                "invalid_arrivals",
                format!("arrival {} is malformed", upload.id),
            )
        };
        let time = |ms: i64| {
            OffsetDateTime::from_unix_timestamp_nanos(i128::from(ms) * 1_000_000)
                .map_err(|_| invalid())
        };
        let arrived_at = time(upload.arrived_at_ms)?;
        let undone_at = upload.undone_at_ms.map(time).transpose()?;
        if !(1..=MAX_COMPANIONS + 1).contains(&upload.people)
            || undone_at.is_some_and(|at| at < arrived_at || at - arrived_at > UNDO_WINDOW)
        {
            return Err(invalid());
        }
        Ok(Self {
            id: upload.id,
            guest_id: upload.guest_id,
            people: upload.people,
            arrived_at,
            undone_at,
        })
    }
}

/// `POST /api/door/guests` (door phone): appends arrivals and undos, idempotent by id.
pub async fn upload(
    State(state): State<AppState>,
    device: DoorDevice,
    Json(body): Json<DoorGuestsBody>,
) -> ApiResult<Json<DoorGuestsResponse>> {
    if body.arrivals.is_empty() || body.arrivals.len() > MAX_ARRIVALS_PER_UPLOAD {
        return Err(bad_request(
            "invalid_arrivals",
            format!("send 1–{MAX_ARRIVALS_PER_UPLOAD} arrivals"),
        ));
    }
    let arrivals = body
        .arrivals
        .iter()
        .map(ValidArrival::try_from)
        .collect::<ApiResult<Vec<_>>>()?;
    let mut tx = state.pool.begin().await?;
    let mut results = Vec::with_capacity(arrivals.len());
    for arrival in arrivals {
        let stored = sqlx::query!(
            "select device_id, undone_at from guest_arrivals where id = $1",
            arrival.id
        )
        .fetch_optional(&mut *tx)
        .await?;
        let kept = match stored {
            Some(stored) if stored.device_id != device.id => {
                return Err(ApiError::Conflict(
                    "arrival_conflict",
                    "arrival id belongs to another phone".to_owned(),
                ));
            }
            Some(stored) => {
                // The undo of a stored arrival: a new txid sends it to every phone again.
                if stored.undone_at.is_none()
                    && let Some(undone_at) = arrival.undone_at
                {
                    sqlx::query!(
                        r#"update guest_arrivals set undone_at = $2, txid = pg_current_xact_id()
                           where id = $1"#,
                        arrival.id,
                        undone_at,
                    )
                    .execute(&mut *tx)
                    .await?;
                }
                true
            }
            // A guest removed from the list meanwhile: nothing to keep, nothing to send again.
            None => {
                sqlx::query!(
                    r#"insert into guest_arrivals (id, event_id, guest_id, device_id, people, arrived_at, undone_at)
                       select $1, g.event_id, g.id, $3, $4, $5, $6 from guest_list g
                       where g.id = $2 and g.event_id = $7"#,
                    arrival.id,
                    arrival.guest_id,
                    device.id,
                    arrival.people,
                    arrival.arrived_at,
                    arrival.undone_at,
                    device.event_id,
                )
                .execute(&mut *tx)
                .await?
                .rows_affected()
                    == 1
            }
        };
        results.push(DoorGuestResult {
            id: arrival.id,
            kept,
        });
    }
    tx.commit().await?;
    Ok(Json(DoorGuestsResponse { results }))
}
