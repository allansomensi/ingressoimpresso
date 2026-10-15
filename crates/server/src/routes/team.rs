//! An event's team (ADR 0055). The organization keeps owning the event; people added by e-mail
//! see the whole event and change only what they take care of. Adding someone needs no
//! acceptance: whoever signs in with that e-mail (code or Google) proves it is theirs, and the
//! event shows up in their list.

use std::fmt::Write as _;

use axum::Json;
use axum::extract::{Path, State};
use axum::http::{Method, StatusCode};
use uuid::Uuid;

use super::{event_access, one_line, optional_text};
use crate::api::{
    EventTeamDto, NotificationKind, TeamArea, TeamMemberAdded, TeamMemberBody, TeamMemberDto,
    TeamMemberUpdateBody, TeamOwnerDto,
};
use crate::auth::{AuthUser, normalize_email};
use crate::emails;
use crate::error::{ApiError, ApiResult, bad_request};
use crate::mail::MailKind;
use crate::state::AppState;
use crate::texts;

/// Most people on one event's team (the organization's own people not counted).
pub const MAX_TEAM: i64 = 30;
const MAX_NAME: usize = 80;

/// What a request on an event needs from a team member.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Need {
    /// Anyone on the team: reading, previews, downloads.
    Read,
    /// One area (or `manage`).
    Area(TeamArea),
    /// Either of two areas (or `manage`): undoing a void serves a cancellation (delivery) and a
    /// seller's return (money).
    Either(TeamArea, TeamArea),
    /// Only the organization's own people: deleting, archiving, duplicating, and anything not
    /// listed here (a new endpoint is closed to the team until it is mapped).
    Owner,
}

/// The area a request belongs to, from its method and path (`/api/sellers/{id}/ranges`).
pub fn need(method: &Method, path: &str) -> Need {
    if matches!(*method, Method::GET | Method::HEAD) {
        return Need::Read;
    }
    let shape = path
        .trim_start_matches("/api/")
        .split('/')
        .map(|segment| {
            if Uuid::parse_str(segment).is_ok() {
                "{id}"
            } else {
                segment
            }
        })
        .collect::<Vec<_>>()
        .join("/");
    area(method.as_str(), &shape)
}

/// The area of a request by its method and the path's shape (ids as `{id}`).
fn area(method: &str, shape: &str) -> Need {
    match (method, shape) {
        (
            "POST",
            "events/{id}/design/preview"
            | "events/{id}/batches/quote"
            | "batches/{id}/checkout/sync"
            | "exports/{id}/link"
            | "events/{id}/team/leave",
        ) => Need::Read,
        ("PUT", "events/{id}/design") | ("POST", "events/{id}/art") => Need::Area(TeamArea::Art),
        (
            "POST",
            "events/{id}/sellers"
            | "sellers/{id}/ranges"
            | "sellers/{id}/ranges/remaining"
            | "sellers/{id}/link"
            | "events/{id}/tickets"
            | "events/{id}/tickets/bulk"
            | "events/{id}/tickets/replace"
            | "ticket-links/{id}/revoke"
            | "events/{id}/voids"
            | "events/{id}/exports"
            | "events/{id}/tables"
            | "events/{id}/tables/bulk"
            | "tables/{id}/tickets"
            | "tables/{id}/tickets/remove"
            // Reservations and goals of sellers (ADRs 0072, 0073).
            | "sellers/{id}/reservations"
            | "reservations/{id}/sell"
            | "events/{id}/sellers/goals",
        )
        | (
            "PUT",
            "sellers/{id}"
            | "ticket-links/{id}"
            | "tables/{id}"
            | "events/{id}/tables/layout"
            | "events/{id}/seller-settings"
            | "sellers/{id}/goal"
            // The public check of the event's tickets (ADR 0075) goes with the digital tickets.
            | "events/{id}/verify-settings",
        )
        | (
            "DELETE",
            "sellers/{id}" | "sellers/{id}/link" | "ranges/{id}" | "tables/{id}" | "reservations/{id}",
        ) => {
            Need::Area(TeamArea::Delivery)
        }
        ("POST", "voids/{id}/undo") => Need::Either(TeamArea::Delivery, TeamArea::Money),
        (
            "POST",
            "sellers/{id}/payments"
            | "sellers/{id}/returns"
            | "events/{id}/ledger"
            // Pix of the buyers (ADR 0085).
            | "events/{id}/pix/receipts",
        )
        | ("PUT", "ledger/{id}" | "events/{id}/pix-settings" | "sellers/{id}/pix")
        | ("DELETE", "seller-payments/{id}" | "ledger/{id}" | "sellers/{id}/pix") => {
            Need::Area(TeamArea::Money)
        }
        // Door links, door by category and the guest list (ADRs 0068, 0070).
        (
            "POST",
            "events/{id}/door/accesses"
            | "door-accesses/{id}/revoke"
            | "door-accesses/{id}/link"
            | "door-devices/{id}/revoke"
            | "events/{id}/guests"
            | "events/{id}/guests/bulk",
        )
        | (
            "PUT",
            "door-accesses/{id}/categories" | "guests/{id}"
            // Exit and return (ADR 0083).
            | "events/{id}/door-settings",
        )
        | ("DELETE", "guests/{id}") => Need::Area(TeamArea::Door),
        // Categories set prices, so they belong to coordination.
        ("PUT", "events/{id}" | "team-members/{id}" | "categories/{id}")
        | (
            "POST",
            "events/{id}/batches"
            | "batches/{id}/cancel"
            | "batches/{id}/checkout"
            | "events/{id}/team"
            | "events/{id}/categories"
            | "categories/{id}/ranges"
            // Postponing or canceling the event (ADR 0065) is coordination too.
            | "events/{id}/postpone"
            | "events/{id}/cancel"
            | "events/{id}/cancel/undo",
        )
        | ("DELETE", "team-members/{id}" | "categories/{id}" | "category-ranges/{id}") => {
            Need::Area(TeamArea::Manage)
        }
        _ => Need::Owner,
    }
}

/// Whether the request is a member leaving the team (allowed even on a suspended organization).
pub fn leaving(path: &str) -> bool {
    path.ends_with("/team/leave")
}

/// Validated areas: known, at least one, no repeats, in the panel's order; `manage` alone when
/// chosen (it covers the rest).
fn clean_areas(mut areas: Vec<TeamArea>) -> ApiResult<Vec<TeamArea>> {
    const ORDER: [TeamArea; 5] = [
        TeamArea::Manage,
        TeamArea::Money,
        TeamArea::Delivery,
        TeamArea::Art,
        TeamArea::Door,
    ];
    if areas.contains(&TeamArea::Manage) {
        return Ok(vec![TeamArea::Manage]);
    }
    areas.sort_by_key(|area| ORDER.iter().position(|item| item == area));
    areas.dedup();
    if areas.is_empty() {
        return Err(bad_request(
            "invalid_team_areas",
            "choose at least one area",
        ));
    }
    Ok(areas)
}

fn clean_name(name: Option<String>) -> ApiResult<Option<String>> {
    let name = optional_text(name);
    if let Some(name) = &name {
        one_line(name, "invalid_team_name")?;
        if name.chars().count() > MAX_NAME {
            return Err(bad_request(
                "invalid_team_name",
                format!("name must have at most {MAX_NAME} characters"),
            ));
        }
    }
    Ok(name)
}

fn db_areas(areas: &[TeamArea]) -> Vec<String> {
    areas.iter().map(|area| area.db().to_owned()).collect()
}

fn parse_areas(areas: &[String]) -> Vec<TeamArea> {
    areas
        .iter()
        .filter_map(|area| TeamArea::from_db(area))
        .collect()
}

/// Percent-encodes a query value (e-mails: letters, digits and `.-_@` stay as they are).
fn encode_query(value: &str) -> String {
    let mut encoded = String::with_capacity(value.len());
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'-' | b'_' | b'@') {
            encoded.push(char::from(byte));
        } else {
            let _ = write!(encoded, "%{byte:02X}");
        }
    }
    encoded
}

/// Where an invited person signs in, with the e-mail filled in.
fn sign_in_url(state: &AppState, email: &str) -> String {
    format!(
        "{}/entrar?email={}",
        state.config.public_web_url,
        encode_query(email)
    )
}

struct MemberRow {
    id: Uuid,
    email: String,
    name: Option<String>,
    areas: Vec<String>,
    user_id: Option<Uuid>,
    created_at: time::OffsetDateTime,
}

impl MemberRow {
    fn into_dto(self, viewer: Uuid) -> TeamMemberDto {
        TeamMemberDto {
            id: self.id,
            email: self.email,
            name: self.name,
            areas: parse_areas(&self.areas),
            joined: self.user_id.is_some(),
            you: self.user_id == Some(viewer),
            created_at: self.created_at,
        }
    }
}

async fn member(state: &AppState, member_id: Uuid) -> ApiResult<(Uuid, MemberRow)> {
    let row = sqlx::query!(
        r#"select t.id, t.event_id, t.email::text as "email!", coalesce(t.name, u.name) as name,
                  t.areas, t.user_id, t.created_at
           from event_team t left join users u on u.id = t.user_id where t.id = $1"#,
        member_id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound)?;
    Ok((
        row.event_id,
        MemberRow {
            id: row.id,
            email: row.email,
            name: row.name,
            areas: row.areas,
            user_id: row.user_id,
            created_at: row.created_at,
        },
    ))
}

/// `GET /api/events/{id}/team`.
pub async fn list(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
) -> ApiResult<Json<EventTeamDto>> {
    let access = event_access(&state.pool, &user, event_id).await?;
    let owners = sqlx::query!(
        r#"select u.id, u.email::text as "email!", u.name from memberships m
           join users u on u.id = m.user_id where m.organization_id = $1 order by m.created_at"#,
        access.organization_id
    )
    .fetch_all(&state.pool)
    .await?
    .into_iter()
    .map(|row| TeamOwnerDto {
        email: row.email,
        name: row.name,
        you: row.id == user.id,
    })
    .collect();
    let members = sqlx::query_as!(
        MemberRow,
        r#"select t.id, t.email::text as "email!", coalesce(t.name, u.name) as name, t.areas,
                  t.user_id, t.created_at
           from event_team t left join users u on u.id = t.user_id
           where t.event_id = $1 order by t.created_at"#,
        event_id
    )
    .fetch_all(&state.pool)
    .await?
    .into_iter()
    .map(|row| row.into_dto(user.id))
    .collect();
    Ok(Json(EventTeamDto {
        owners,
        members,
        can_manage: access.can(TeamArea::Manage),
    }))
}

/// Refuses the organization's own people (they already do everything) and a full team.
async fn check_addable(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    organization_id: Uuid,
    event_id: Uuid,
    email: &str,
) -> ApiResult<()> {
    let owner = sqlx::query_scalar!(
        r#"select exists(select 1 from memberships m join users u on u.id = m.user_id
                         where m.organization_id = $1 and u.email = $2) as "owner!""#,
        organization_id,
        email
    )
    .fetch_one(&mut **tx)
    .await?;
    if owner {
        return Err(ApiError::Conflict(
            "already_owner",
            "this person already manages the organization's events".to_owned(),
        ));
    }
    let size = sqlx::query_scalar!(
        r#"select count(*) as "count!" from event_team where event_id = $1"#,
        event_id
    )
    .fetch_one(&mut **tx)
    .await?;
    if size >= MAX_TEAM {
        return Err(ApiError::Conflict(
            "team_full",
            format!("a team has at most {MAX_TEAM} people"),
        ));
    }
    Ok(())
}

/// `POST /api/events/{id}/team`: adds a person by e-mail. An existing account sees the event at
/// once (and gets a notification); a new e-mail finds it on the first sign-in. Either way an
/// e-mail goes out, within the daily quota.
pub async fn add(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
    Json(body): Json<TeamMemberBody>,
) -> ApiResult<(StatusCode, Json<TeamMemberAdded>)> {
    let access = event_access(&state.pool, &user, event_id).await?;
    let email = normalize_email(&body.email)?;
    let name = clean_name(body.name)?;
    let areas = clean_areas(body.areas)?;
    if state.settings.get(&state.pool).await?.email_blocked(&email) {
        return Err(ApiError::Refused(
            "email_domain_blocked",
            "addresses of this domain cannot create an account".to_owned(),
        ));
    }
    let mut tx = state.pool.begin().await?;
    check_addable(&mut tx, access.organization_id, event_id, &email).await?;
    let account = sqlx::query!("select id, name from users where email = $1", email)
        .fetch_optional(&mut *tx)
        .await?;
    let id = Uuid::new_v4();
    let row = sqlx::query!(
        r#"insert into event_team (id, event_id, email, name, user_id, areas, invited_by, joined_at)
           values ($1, $2, $3, $4, $5, $6, $7, case when $5::uuid is null then null else now() end)
           on conflict (event_id, email) do nothing
           returning created_at"#,
        id,
        event_id,
        email,
        name,
        account.as_ref().map(|account| account.id),
        &db_areas(&areas),
        user.id,
    )
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| {
        ApiError::Conflict(
            "already_on_team",
            "this e-mail is already on the team".to_owned(),
        )
    })?;
    let inviter = sqlx::query_scalar!(
        r#"select coalesce(name, email::text) as "name!" from users where id = $1"#,
        user.id
    )
    .fetch_one(&mut *tx)
    .await?;
    if let Some(account) = &account {
        sqlx::query!(
            "insert into notifications (id, user_id, kind, data) values ($1, $2, $3, $4)",
            Uuid::new_v4(),
            account.id,
            NotificationKind::TeamAdded.db(),
            serde_json::json!({
                "eventId": event_id,
                "eventName": access.event.name,
                "by": inviter,
                "areas": db_areas(&areas),
            }),
        )
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;

    let url = sign_in_url(&state, &email);
    let message = emails::team_invite(
        &emails::TeamInvite {
            inviter: &inviter,
            event_name: &access.event.name,
            areas: &texts::team_areas(&areas, access.event.tokens()),
            url: &url,
        },
        &state.config.public_web_url,
    );
    let emailed = match state
        .send_mail(MailKind::TeamInvite, &email, &message)
        .await
    {
        Ok(()) => true,
        Err(error) => {
            tracing::warn!(%error, "team invite e-mail not sent");
            false
        }
    };
    let member = MemberRow {
        id,
        email,
        name: name.or_else(|| account.as_ref().and_then(|account| account.name.clone())),
        areas: db_areas(&areas),
        user_id: account.map(|account| account.id),
        created_at: row.created_at,
    }
    .into_dto(user.id);
    Ok((
        StatusCode::CREATED,
        Json(TeamMemberAdded {
            member,
            emailed,
            sign_in_url: url,
        }),
    ))
}

/// `PUT /api/team-members/{id}`: changes the name or what the person takes care of.
pub async fn update(
    State(state): State<AppState>,
    user: AuthUser,
    Path(member_id): Path<Uuid>,
    Json(body): Json<TeamMemberUpdateBody>,
) -> ApiResult<Json<TeamMemberDto>> {
    let (event_id, _) = member(&state, member_id).await?;
    event_access(&state.pool, &user, event_id).await?;
    let name = clean_name(body.name)?;
    let areas = clean_areas(body.areas)?;
    sqlx::query!(
        "update event_team set name = $2, areas = $3 where id = $1",
        member_id,
        name,
        &db_areas(&areas),
    )
    .execute(&state.pool)
    .await?;
    let (_, row) = member(&state, member_id).await?;
    Ok(Json(row.into_dto(user.id)))
}

/// `DELETE /api/team-members/{id}`: takes the person off the team (they stop seeing the event).
pub async fn remove(
    State(state): State<AppState>,
    user: AuthUser,
    Path(member_id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    let (event_id, _) = member(&state, member_id).await?;
    event_access(&state.pool, &user, event_id).await?;
    sqlx::query!("delete from event_team where id = $1", member_id)
        .execute(&state.pool)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// `POST /api/events/{id}/team/leave`: the current user leaves the event's team.
pub async fn leave(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    let deleted = sqlx::query!(
        "delete from event_team where event_id = $1 and user_id = $2",
        event_id,
        user.id
    )
    .execute(&state.pool)
    .await?
    .rows_affected();
    if deleted == 0 {
        return Err(ApiError::NotFound);
    }
    Ok(StatusCode::NO_CONTENT)
}

/// Links the team invites of an e-mail to its account (on sign-in).
pub(crate) async fn link_invites<'e, E: sqlx::PgExecutor<'e>>(
    executor: E,
    user_id: Uuid,
) -> ApiResult<()> {
    sqlx::query!(
        r#"update event_team set user_id = $1, joined_at = now()
           where user_id is null and email = (select email from users where id = $1)"#,
        user_id
    )
    .execute(executor)
    .await?;
    Ok(())
}

/// Whether an e-mail has a waiting team invite (it may sign up while new accounts are closed).
pub(crate) async fn invited<'e, E: sqlx::PgExecutor<'e>>(
    executor: E,
    email: &str,
) -> ApiResult<bool> {
    Ok(sqlx::query_scalar!(
        r#"select exists(select 1 from event_team where email = $1 and user_id is null) as "invited!""#,
        email
    )
    .fetch_one(executor)
    .await?)
}

/// Copies an event's team to its duplicate (the next show usually has the same people).
pub(crate) async fn copy(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    from: Uuid,
    to: Uuid,
    by: Uuid,
) -> ApiResult<()> {
    sqlx::query!(
        r#"insert into event_team (id, event_id, email, name, user_id, areas, invited_by, joined_at)
           select gen_random_uuid(), $2, email, name, user_id, areas, $3, joined_at
           from event_team where event_id = $1"#,
        from,
        to,
        by
    )
    .execute(&mut **tx)
    .await?;
    Ok(())
}

/// Names of who receives the sellers' money (shown on the seller's page).
pub(crate) async fn receivers(state: &AppState, event_id: Uuid) -> ApiResult<Vec<String>> {
    Ok(sqlx::query_scalar!(
        r#"select coalesce(t.name, u.name) as "name!" from event_team t
           left join users u on u.id = t.user_id
           where t.event_id = $1 and 'money' = any(t.areas) and coalesce(t.name, u.name) is not null
           order by t.created_at"#,
        event_id
    )
    .fetch_all(&state.pool)
    .await?)
}

#[cfg(test)]
mod tests {
    use super::*;

    const ID: &str = "0b9b0a52-6f5f-4c1e-9d6a-3f1f0e7a1c2d";

    fn path(template: &str) -> String {
        format!("/api/{}", template.replace("{id}", ID))
    }

    #[test]
    fn requests_map_to_areas() {
        let cases = [
            (Method::GET, "events/{id}/sellers", Need::Read),
            (Method::POST, "events/{id}/design/preview", Need::Read),
            (Method::POST, "exports/{id}/link", Need::Read),
            (Method::POST, "events/{id}/team/leave", Need::Read),
            (Method::PUT, "events/{id}/design", Need::Area(TeamArea::Art)),
            (Method::POST, "events/{id}/art", Need::Area(TeamArea::Art)),
            (
                Method::POST,
                "sellers/{id}/ranges",
                Need::Area(TeamArea::Delivery),
            ),
            (
                Method::DELETE,
                "ranges/{id}",
                Need::Area(TeamArea::Delivery),
            ),
            (
                Method::POST,
                "events/{id}/exports",
                Need::Area(TeamArea::Delivery),
            ),
            (
                Method::POST,
                "sellers/{id}/payments",
                Need::Area(TeamArea::Money),
            ),
            (
                Method::DELETE,
                "seller-payments/{id}",
                Need::Area(TeamArea::Money),
            ),
            (
                Method::POST,
                "voids/{id}/undo",
                Need::Either(TeamArea::Delivery, TeamArea::Money),
            ),
            (
                Method::POST,
                "events/{id}/door/accesses",
                Need::Area(TeamArea::Door),
            ),
            (Method::PUT, "events/{id}", Need::Area(TeamArea::Manage)),
            (
                Method::POST,
                "events/{id}/batches",
                Need::Area(TeamArea::Manage),
            ),
            (
                Method::POST,
                "events/{id}/team",
                Need::Area(TeamArea::Manage),
            ),
            (
                Method::DELETE,
                "team-members/{id}",
                Need::Area(TeamArea::Manage),
            ),
            (
                Method::POST,
                "tables/{id}/tickets",
                Need::Area(TeamArea::Delivery),
            ),
            (
                Method::PUT,
                "events/{id}/tables/layout",
                Need::Area(TeamArea::Delivery),
            ),
            (
                Method::POST,
                "categories/{id}/ranges",
                Need::Area(TeamArea::Manage),
            ),
            (
                Method::DELETE,
                "category-ranges/{id}",
                Need::Area(TeamArea::Manage),
            ),
            (Method::DELETE, "events/{id}", Need::Owner),
            (Method::PUT, "events/{id}/status", Need::Owner),
            (Method::POST, "events/{id}/duplicate", Need::Owner),
            // Another date of the event and leaving the series (ADR 0077), like duplicating.
            (Method::POST, "events/{id}/dates", Need::Owner),
            (Method::POST, "events/{id}/series/leave", Need::Owner),
            (Method::POST, "events/{id}/something-new", Need::Owner),
        ];
        for (method, template, expected) in cases {
            assert_eq!(
                need(&method, &path(template)),
                expected,
                "{method} {template}"
            );
        }
    }

    #[test]
    fn door_features_belong_to_the_door() {
        let cases = [
            (
                Method::PUT,
                "door-accesses/{id}/categories",
                Need::Area(TeamArea::Door),
            ),
            (
                Method::PUT,
                "events/{id}/door-settings",
                Need::Area(TeamArea::Door),
            ),
            (
                Method::PUT,
                "events/{id}/pix-settings",
                Need::Area(TeamArea::Money),
            ),
            (
                Method::POST,
                "events/{id}/pix/receipts",
                Need::Area(TeamArea::Money),
            ),
            (
                Method::DELETE,
                "sellers/{id}/pix",
                Need::Area(TeamArea::Money),
            ),
            (
                Method::POST,
                "events/{id}/guests/bulk",
                Need::Area(TeamArea::Door),
            ),
            (
                Method::POST,
                "door-accesses/{id}/link",
                Need::Area(TeamArea::Door),
            ),
            (
                Method::POST,
                "sellers/{id}/ranges/remaining",
                Need::Area(TeamArea::Delivery),
            ),
            (Method::DELETE, "guests/{id}", Need::Area(TeamArea::Door)),
            (Method::GET, "events/{id}/door/live", Need::Read),
        ];
        for (method, template, expected) in cases {
            assert_eq!(
                need(&method, &path(template)),
                expected,
                "{method} {template}"
            );
        }
    }

    #[test]
    fn reservations_and_goals_belong_to_delivery() {
        let cases = [
            (Method::POST, "sellers/{id}/reservations"),
            (Method::POST, "reservations/{id}/sell"),
            (Method::DELETE, "reservations/{id}"),
            (Method::PUT, "sellers/{id}/goal"),
            (Method::POST, "events/{id}/sellers/goals"),
        ];
        for (method, template) in cases {
            assert_eq!(
                need(&method, &path(template)),
                Need::Area(TeamArea::Delivery),
                "{method} {template}"
            );
        }
        assert_eq!(
            need(&Method::GET, &path("events/{id}/reservations")),
            Need::Read
        );
    }

    #[test]
    fn postponing_and_canceling_are_coordination() {
        for template in [
            "events/{id}/postpone",
            "events/{id}/cancel",
            "events/{id}/cancel/undo",
        ] {
            assert_eq!(
                need(&Method::POST, &path(template)),
                Need::Area(TeamArea::Manage),
                "{template}"
            );
        }
    }

    #[test]
    fn areas_are_cleaned() {
        assert_eq!(
            clean_areas(vec![TeamArea::Door, TeamArea::Money, TeamArea::Door]).unwrap(),
            [TeamArea::Money, TeamArea::Door]
        );
        assert_eq!(
            clean_areas(vec![TeamArea::Art, TeamArea::Manage]).unwrap(),
            [TeamArea::Manage]
        );
        assert!(clean_areas(Vec::new()).is_err());
    }

    #[test]
    fn sign_in_links_keep_the_email() {
        assert_eq!(
            encode_query("ana+show@exemplo.com"),
            "ana%2Bshow@exemplo.com"
        );
        assert_eq!(encode_query("jo ão@x.com"), "jo%20%C3%A3o@x.com");
    }
}
