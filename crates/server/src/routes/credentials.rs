//! Credentials (ADR 0111): badges for the staff, the press and the artists. Each one has a QR of
//! the event's format v1 whose number is above every ticket's; the door recognizes it from the
//! manifest, lets it through any day at the entrance and in the areas (checkpoints) chosen, and
//! never counts it as audience.

use std::collections::HashMap;

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::Response;
use sqlx::PgPool;
use uuid::Uuid;

use super::{authorize_event, one_line, optional_text};
use crate::api::{
    BadgesQuery, CredentialBody, CredentialDto, CredentialsDto, DoorCredentialDto,
    DoorLiveCredentialsDto,
};
use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult, bad_request};
use crate::state::AppState;

/// Credential numbers start above this one; tickets stop at `MAX_TICKET_NUMBER` (9,999,999).
pub const CREDENTIAL_BASE: i32 = 2_000_000_000;
/// Credentials of any event; more come with the paid tickets.
const FREE_CREDENTIALS: i64 = 20;
/// One more credential for every this many paid tickets.
const TICKETS_PER_CREDENTIAL: i64 = 10;
/// Most credentials of one event.
const MAX_CREDENTIALS: i64 = 500;

/// The printed code of a credential ("C-0007").
pub fn code(number: i32) -> String {
    format!("C-{:04}", number - CREDENTIAL_BASE)
}

/// Most credentials the event may have now: 20, plus one for every 10 paid tickets, up to 500.
/// A credential lets in for free, so it grows with what was paid.
async fn limit(pool: &PgPool, event_id: Uuid) -> ApiResult<i64> {
    let paid = sqlx::query_scalar!(
        r#"select coalesce(sum(upper(numbers) - lower(numbers)), 0)::bigint as "paid!"
           from ticket_batches where event_id = $1 and status = 'paid'"#,
        event_id
    )
    .fetch_one(pool)
    .await?;
    Ok((FREE_CREDENTIALS + paid / TICKETS_PER_CREDENTIAL).min(MAX_CREDENTIALS))
}

struct Valid {
    name: String,
    role: String,
    organization: Option<String>,
    color: String,
    checkpoint_ids: Vec<Uuid>,
}

async fn validate(pool: &PgPool, event_id: Uuid, body: &CredentialBody) -> ApiResult<Valid> {
    let name = body.name.trim().to_owned();
    if name.is_empty() || name.chars().count() > 80 {
        return Err(bad_request(
            "invalid_credential_name",
            "name of 1 to 80 characters",
        ));
    }
    one_line(&name, "invalid_credential_name")?;
    let role = body.role.trim().to_owned();
    if role.is_empty() || role.chars().count() > 30 {
        return Err(bad_request(
            "invalid_credential_role",
            "role of 1 to 30 characters",
        ));
    }
    one_line(&role, "invalid_credential_role")?;
    let organization = optional_text(body.organization.clone());
    if let Some(organization) = &organization {
        if organization.chars().count() > 60 {
            return Err(bad_request(
                "invalid_credential_organization",
                "organization of up to 60 characters",
            ));
        }
        one_line(organization, "invalid_credential_organization")?;
    }
    let color = body.color.trim().to_lowercase();
    if color.len() != 7
        || !color.starts_with('#')
        || !color.chars().skip(1).all(|c| c.is_ascii_hexdigit())
    {
        return Err(bad_request("invalid_color", "colour as #rrggbb"));
    }
    let mut checkpoint_ids = body.checkpoint_ids.clone();
    checkpoint_ids.sort_unstable();
    checkpoint_ids.dedup();
    let known = sqlx::query_scalar!(
        r#"select count(*) as "count!" from event_checkpoints where event_id = $1 and id = any($2)"#,
        event_id,
        &checkpoint_ids,
    )
    .fetch_one(pool)
    .await?;
    if usize::try_from(known).ok() != Some(checkpoint_ids.len()) {
        return Err(bad_request(
            "invalid_credential_areas",
            "unknown checkpoint",
        ));
    }
    if !body.entrance && checkpoint_ids.is_empty() {
        return Err(bad_request(
            "invalid_credential_areas",
            "a credential opens the entrance or a checkpoint",
        ));
    }
    Ok(Valid {
        name,
        role,
        organization,
        color,
        checkpoint_ids,
    })
}

/// The credentials of an event, by number.
async fn load(pool: &PgPool, event_id: Uuid, id: Option<Uuid>) -> ApiResult<Vec<CredentialDto>> {
    sqlx::query!(
        r#"select c.id, c.number, c.name, c.role, c.organization, c.color, c.entrance, c.revoked_at,
                  c.created_at,
                  array(select k.checkpoint_id from credential_checkpoints k
                        where k.credential_id = c.id order by k.checkpoint_id) as "checkpoint_ids!",
                  (select count(*) from scans s where s.event_id = c.event_id and s.ticket_number = c.number
                     and s.local_outcome = 'credential_admitted') as "reads!",
                  (select max(s.scanned_at) from scans s where s.event_id = c.event_id
                     and s.ticket_number = c.number and s.local_outcome = 'credential_admitted') as last_read_at
           from event_credentials c
           where c.event_id = $1 and ($2::uuid is null or c.id = $2)
           order by c.number"#,
        event_id,
        id,
    )
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(|row| {
        Ok(CredentialDto {
            id: row.id,
            number: u32::try_from(row.number).map_err(|error| ApiError::Internal(error.into()))?,
            code: code(row.number),
            name: row.name,
            role: row.role,
            organization: row.organization,
            color: row.color,
            entrance: row.entrance,
            checkpoint_ids: row.checkpoint_ids,
            revoked_at: row.revoked_at,
            reads: row.reads,
            last_read_at: row.last_read_at,
            created_at: row.created_at,
        })
    })
    .collect()
}

async fn one(pool: &PgPool, event_id: Uuid, id: Uuid) -> ApiResult<CredentialDto> {
    load(pool, event_id, Some(id))
        .await?
        .into_iter()
        .next()
        .ok_or(ApiError::NotFound)
}

/// `GET /api/events/{id}/credentials`.
pub async fn list(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
) -> ApiResult<Json<CredentialsDto>> {
    authorize_event(&state.pool, &user, event_id).await?;
    Ok(Json(CredentialsDto {
        credentials: load(&state.pool, event_id, None).await?,
        limit: limit(&state.pool, event_id).await?,
    }))
}

async fn set_areas(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    credential_id: Uuid,
    checkpoints: &[Uuid],
) -> ApiResult<()> {
    sqlx::query!(
        "delete from credential_checkpoints where credential_id = $1",
        credential_id
    )
    .execute(&mut **tx)
    .await?;
    sqlx::query!(
        r#"insert into credential_checkpoints (credential_id, checkpoint_id)
           select $1, unnest($2::uuid[])"#,
        credential_id,
        checkpoints,
    )
    .execute(&mut **tx)
    .await?;
    Ok(())
}

/// `POST /api/events/{id}/credentials`: the next number of the event.
pub async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
    Json(body): Json<CredentialBody>,
) -> ApiResult<(StatusCode, Json<CredentialDto>)> {
    let event = authorize_event(&state.pool, &user, event_id).await?;
    // A stall takes fichas, not people (ADR 0084).
    if event.tokens() {
        return Err(bad_request(
            "credentials_tokens",
            "consumption tokens have no credentials",
        ));
    }
    let valid = validate(&state.pool, event_id, &body).await?;
    let limit = limit(&state.pool, event_id).await?;
    let mut tx = state.pool.begin().await?;
    // One number at a time per event.
    sqlx::query!("select id from events where id = $1 for update", event_id)
        .fetch_one(&mut *tx)
        .await?;
    let count = sqlx::query_scalar!(
        r#"select count(*) as "count!" from event_credentials where event_id = $1"#,
        event_id
    )
    .fetch_one(&mut *tx)
    .await?;
    if count >= limit {
        return Err(ApiError::Conflict(
            "too_many_credentials",
            format!("this event may have {limit} credentials now; more come with paid tickets"),
        ));
    }
    let id = Uuid::new_v4();
    sqlx::query!(
        r#"insert into event_credentials (id, event_id, number, name, role, organization, color,
                                          entrance, created_by)
           values ($1, $2,
                   (select coalesce(max(number), $3) + 1 from event_credentials where event_id = $2),
                   $4, $5, $6, $7, $8, $9)"#,
        id,
        event_id,
        CREDENTIAL_BASE,
        valid.name,
        valid.role,
        valid.organization,
        valid.color,
        body.entrance,
        user.id,
    )
    .execute(&mut *tx)
    .await?;
    set_areas(&mut tx, id, &valid.checkpoint_ids).await?;
    tx.commit().await?;
    Ok((
        StatusCode::CREATED,
        Json(one(&state.pool, event_id, id).await?),
    ))
}

async fn credential_event(state: &AppState, user: &AuthUser, id: Uuid) -> ApiResult<Uuid> {
    let event_id = sqlx::query_scalar!("select event_id from event_credentials where id = $1", id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or(ApiError::NotFound)?;
    authorize_event(&state.pool, user, event_id).await?;
    Ok(event_id)
}

/// `PUT /api/credentials/{id}`: phones pick the change up on their next sync; the printed badge
/// keeps working (its QR has only the number).
pub async fn update(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<CredentialBody>,
) -> ApiResult<Json<CredentialDto>> {
    let event_id = credential_event(&state, &user, id).await?;
    let valid = validate(&state.pool, event_id, &body).await?;
    let mut tx = state.pool.begin().await?;
    sqlx::query!(
        r#"update event_credentials set name = $2, role = $3, organization = $4, color = $5,
                  entrance = $6, updated_at = now()
           where id = $1"#,
        id,
        valid.name,
        valid.role,
        valid.organization,
        valid.color,
        body.entrance,
    )
    .execute(&mut *tx)
    .await?;
    set_areas(&mut tx, id, &valid.checkpoint_ids).await?;
    tx.commit().await?;
    Ok(Json(one(&state.pool, event_id, id).await?))
}

/// `POST /api/credentials/{id}/revoke`: lost or misused; the door turns it away.
pub async fn revoke(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<CredentialDto>> {
    let event_id = credential_event(&state, &user, id).await?;
    sqlx::query!(
        "update event_credentials set revoked_at = coalesce(revoked_at, now()), updated_at = now() where id = $1",
        id
    )
    .execute(&state.pool)
    .await?;
    Ok(Json(one(&state.pool, event_id, id).await?))
}

/// `POST /api/credentials/{id}/restore`.
pub async fn restore(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<CredentialDto>> {
    let event_id = credential_event(&state, &user, id).await?;
    sqlx::query!(
        "update event_credentials set revoked_at = null, updated_at = now() where id = $1",
        id
    )
    .execute(&state.pool)
    .await?;
    Ok(Json(one(&state.pool, event_id, id).await?))
}

/// `GET /api/events/{id}/credentials/badges?ids=`: the badges to print, four per A4 (every
/// credential not revoked, or the ones asked for).
pub async fn badges(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
    Query(query): Query<BadgesQuery>,
) -> ApiResult<Response> {
    let event = authorize_event(&state.pool, &user, event_id).await?;
    let wanted: Option<Vec<Uuid>> = query
        .ids
        .as_deref()
        .map(|ids| {
            ids.split(',')
                .filter(|id| !id.trim().is_empty())
                .map(|id| {
                    Uuid::parse_str(id.trim())
                        .map_err(|_| bad_request("invalid_ids", "ids must be uuids"))
                })
                .collect()
        })
        .transpose()?;
    let credentials: Vec<CredentialDto> = load(&state.pool, event_id, None)
        .await?
        .into_iter()
        .filter(|credential| credential.revoked_at.is_none())
        .filter(|credential| {
            wanted
                .as_ref()
                .is_none_or(|ids| ids.contains(&credential.id))
        })
        .collect();
    if credentials.is_empty() {
        return Err(bad_request(
            "no_credentials",
            "no active credential to print",
        ));
    }
    let names = checkpoint_names(&state.pool, event_id).await?;
    let numbers: Vec<i32> = credentials
        .iter()
        .map(|credential| i32::try_from(credential.number))
        .collect::<Result<_, _>>()
        .map_err(|error| ApiError::Internal(error.into()))?;
    let signed: HashMap<i32, String> =
        crate::jobs::sign_credentials(&state, event_id, event.qr_tag, &numbers)
            .await?
            .into_iter()
            .collect();
    let starts = event.starts_at.to_offset(event.offset());
    let subtitle = [
        Some(format!(
            "{:02}/{:02}/{}",
            starts.day(),
            u8::from(starts.month()),
            starts.year()
        )),
        event.venue.clone(),
    ]
    .into_iter()
    .flatten()
    .collect::<Vec<_>>()
    .join(" · ");
    let badges = credentials
        .iter()
        .zip(&numbers)
        .map(|(credential, number)| {
            Ok(ticket_render::Badge {
                name: credential.name.clone(),
                role: credential.role.clone(),
                organization: credential.organization.clone(),
                color: credential.color.clone(),
                code: credential.code.clone(),
                areas: areas(credential, &names),
                qr_text: signed
                    .get(number)
                    .cloned()
                    .ok_or_else(|| ApiError::Internal(anyhow::anyhow!("unsigned credential")))?,
            })
        })
        .collect::<ApiResult<Vec<_>>>()?;
    let sheet = ticket_render::BadgeSheet {
        event: event.name.clone(),
        subtitle,
        footer: crate::texts::CREDENTIAL_FOOTER.to_owned(),
        badges,
    };
    let _permit = state
        .render_permits
        .clone()
        .acquire_owned()
        .await
        .map_err(anyhow::Error::from)?;
    let bytes = tokio::task::spawn_blocking(move || ticket_render::badges_pdf(&sheet))
        .await
        .map_err(anyhow::Error::from)?
        .map_err(|error| ApiError::Internal(error.into()))?;
    let slug = crate::jobs::slug(&event.name);
    let name = if slug.is_empty() {
        "credenciais".to_owned()
    } else {
        format!("credenciais-{slug}")
    };
    Ok(super::ledger::attachment(
        &format!("{name}.pdf"),
        "application/pdf",
        bytes,
    ))
}

async fn checkpoint_names(pool: &PgPool, event_id: Uuid) -> ApiResult<HashMap<Uuid, String>> {
    Ok(sqlx::query!(
        "select id, name from event_checkpoints where event_id = $1",
        event_id
    )
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(|row| (row.id, row.name))
    .collect())
}

/// Where a credential lets in, in words ("Entrada · Camarim").
fn areas(credential: &CredentialDto, names: &HashMap<Uuid, String>) -> String {
    let mut areas: Vec<&str> = Vec::new();
    if credential.entrance {
        areas.push(crate::texts::CREDENTIAL_ENTRANCE);
    }
    areas.extend(
        credential
            .checkpoint_ids
            .iter()
            .filter_map(|id| names.get(id).map(String::as_str)),
    );
    areas.join(" · ")
}

/// The credentials for the door phones, only when they changed since `held` (like the guest
/// list, ADR 0070).
pub(crate) async fn door_list(
    pool: &PgPool,
    event_id: Uuid,
    held: Option<&str>,
) -> ApiResult<(Option<Vec<DoorCredentialDto>>, String)> {
    let version = sqlx::query_scalar!(
        r#"select count(*)::text || '-' ||
                  coalesce(md5(string_agg(c.id::text || c.updated_at::text
                                          || coalesce(c.revoked_at::text, '')
                                          || array_to_string(array(select k.checkpoint_id::text
                                                                   from credential_checkpoints k
                                                                   where k.credential_id = c.id
                                                                   order by 1), ','),
                                          ',' order by c.id)), '')
                  as "version!"
           from event_credentials c where c.event_id = $1"#,
        event_id
    )
    .fetch_one(pool)
    .await?;
    if held.is_none_or(|held| held == version) {
        return Ok((None, version));
    }
    let names = checkpoint_names(pool, event_id).await?;
    let credentials = load(pool, event_id, None)
        .await?
        .into_iter()
        .map(|credential| DoorCredentialDto {
            areas: areas(&credential, &names),
            number: credential.number,
            name: credential.name,
            role: credential.role,
            organization: credential.organization,
            color: credential.color,
            entrance: credential.entrance,
            checkpoint_ids: credential.checkpoint_ids,
            revoked: credential.revoked_at.is_some(),
        })
        .collect();
    Ok((Some(credentials), version))
}

/// Credentials at the door for the live view; `None` when the event has none.
pub(crate) async fn live(
    pool: &PgPool,
    event_id: Uuid,
) -> ApiResult<Option<DoorLiveCredentialsDto>> {
    let row = sqlx::query!(
        r#"select (select count(*) from event_credentials where event_id = $1) as "total!",
                  (select count(*) from event_credentials where event_id = $1 and revoked_at is null) as "active!",
                  (select count(distinct ticket_number) from scans
                   where event_id = $1 and local_outcome = 'credential_admitted') as "seen!",
                  (select count(*) from scans
                   where event_id = $1 and local_outcome = 'rejected_credential') as "refused!""#,
        event_id
    )
    .fetch_one(pool)
    .await?;
    Ok((row.total > 0).then_some(DoorLiveCredentialsDto {
        active: row.active,
        seen: row.seen,
        refused: row.refused,
    }))
}
