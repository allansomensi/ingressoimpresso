//! Announcements and notifications (ADR 0038). Admins publish announcements to every organizer,
//! in any of three channels (ADR 0109): the bell, a dialog when the panel opens, and e-mail
//! (queued when the announcement starts). Notifications tell one account what happened to it (an
//! image refused, credit added). The bell reads both with one request.

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use time::OffsetDateTime;
use uuid::Uuid;

use super::admin::{audit, require_admin};
use super::optional_text;
use crate::api::{
    AdminAnnouncementDto, AnnouncementAudience, AnnouncementBody, AnnouncementDto,
    AnnouncementEmailBody, AnnouncementLevel, AnnouncementStatsDto, AnnouncementStatus, InboxDto,
    InboxReadBody, NotificationDto, NotificationKind,
};
use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult, bad_request};
use crate::state::AppState;

/// Notifications returned by the bell.
const INBOX_NOTIFICATIONS: i64 = 30;
/// Announcements returned by the bell.
const INBOX_ANNOUNCEMENTS: i64 = 20;
const MAX_TITLE: usize = 120;
const MAX_BODY: usize = 4000;
const MAX_CTA_LABEL: usize = 40;
const MAX_CTA_URL: usize = 500;

/// Writes a notification for every member of an organization.
///
/// # Errors
///
/// Database errors.
pub(crate) async fn notify_organization<'e, E: sqlx::PgExecutor<'e>>(
    executor: E,
    organization_id: Uuid,
    kind: NotificationKind,
    data: serde_json::Value,
) -> ApiResult<()> {
    sqlx::query!(
        r#"insert into notifications (id, user_id, kind, data)
           select gen_random_uuid(), m.user_id, $2, $3 from memberships m where m.organization_id = $1"#,
        organization_id,
        kind.db(),
        data,
    )
    .execute(executor)
    .await?;
    Ok(())
}

/// `GET /api/inbox`: announcements running now and the latest notifications.
pub async fn inbox(State(state): State<AppState>, user: AuthUser) -> ApiResult<Json<InboxDto>> {
    let announcements = sqlx::query!(
        r#"select a.id, a.title, a.body, a.level, a.bell, a.modal, a.cta_label, a.cta_url, a.starts_at,
                  r.seen_at as "seen_at?", r.dismissed_at
           from announcements a
           left join announcement_receipts r on r.announcement_id = a.id and r.user_id = $1
           where a.published_at is not null and a.archived_at is null and (a.bell or a.modal)
             and a.starts_at <= now() and (a.ends_at is null or a.ends_at > now())
           order by a.starts_at desc limit $2"#,
        user.id,
        INBOX_ANNOUNCEMENTS,
    )
    .fetch_all(&state.pool)
    .await?;
    let announcements: Vec<AnnouncementDto> = announcements
        .into_iter()
        .map(|row| AnnouncementDto {
            id: row.id,
            title: row.title,
            body: row.body,
            level: AnnouncementLevel::from_db(&row.level).unwrap_or(AnnouncementLevel::Info),
            bell: row.bell,
            modal: row.modal,
            cta_label: row.cta_label,
            cta_url: row.cta_url,
            starts_at: row.starts_at,
            seen: row.seen_at.is_some(),
            dismissed: row.dismissed_at.is_some(),
        })
        .collect();
    let notifications = sqlx::query!(
        "select id, kind, data, read_at, created_at from notifications where user_id = $1 order by created_at desc limit $2",
        user.id,
        INBOX_NOTIFICATIONS,
    )
    .fetch_all(&state.pool)
    .await?;
    let notifications: Vec<NotificationDto> = notifications
        .into_iter()
        .filter_map(|row| {
            Some(NotificationDto {
                id: row.id,
                kind: NotificationKind::from_db(&row.kind)?,
                data: row.data,
                read_at: row.read_at,
                created_at: row.created_at,
            })
        })
        .collect();
    let unread_notifications = sqlx::query_scalar!(
        r#"select count(*) as "count!" from notifications where user_id = $1 and read_at is null"#,
        user.id
    )
    .fetch_one(&state.pool)
    .await?;
    // Notes published before the account existed are not news to it: a new account starts with
    // an empty bell instead of every past release.
    let news_seen_at = sqlx::query_scalar!(
        r#"select greatest(news_seen_at, created_at) as "seen!" from users where id = $1"#,
        user.id
    )
    .fetch_one(&state.pool)
    .await?;
    // Only the bell counts: a dialog shows by itself.
    let unseen = announcements
        .iter()
        .filter(|item| item.bell && !item.seen)
        .count();
    let unread = i32::try_from(unread_notifications)
        .unwrap_or(i32::MAX)
        .saturating_add(i32::try_from(unseen).unwrap_or(i32::MAX));
    Ok(Json(InboxDto {
        announcements,
        notifications,
        unread,
        news_seen_at: Some(news_seen_at),
    }))
}

/// `POST /api/inbox/read`: marks announcements as seen and notifications as read (both lists
/// empty: everything running now), and the release notes up to `newsSeenAt` (ADR 0088: never
/// moves back nor past now).
pub async fn read(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<InboxReadBody>,
) -> ApiResult<StatusCode> {
    let everything = body.announcements.is_empty() && body.notifications.is_empty();
    sqlx::query!(
        r#"insert into announcement_receipts (announcement_id, user_id)
           select a.id, $1 from announcements a
           where a.published_at is not null and a.archived_at is null and a.starts_at <= now()
             and ($2 or a.id = any($3))
           on conflict do nothing"#,
        user.id,
        everything,
        &body.announcements,
    )
    .execute(&state.pool)
    .await?;
    sqlx::query!(
        "update notifications set read_at = now() where user_id = $1 and read_at is null and ($2 or id = any($3))",
        user.id,
        everything,
        &body.notifications,
    )
    .execute(&state.pool)
    .await?;
    if let Some(seen) = body.news_seen_at {
        sqlx::query!(
            "update users set news_seen_at = greatest(news_seen_at, least($2, now())) where id = $1",
            user.id,
            seen,
        )
        .execute(&state.pool)
        .await?;
    }
    Ok(StatusCode::NO_CONTENT)
}

/// `POST /api/announcements/{id}/dismiss`: the user closed the dialog (it stays in the bell).
pub async fn dismiss(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    let updated = sqlx::query!(
        r#"insert into announcement_receipts (announcement_id, user_id, dismissed_at)
           select a.id, $2, now() from announcements a
           where a.id = $1 and a.published_at is not null
           on conflict (announcement_id, user_id) do update set dismissed_at = now()"#,
        id,
        user.id,
    )
    .execute(&state.pool)
    .await?
    .rows_affected();
    if updated == 0 {
        return Err(ApiError::NotFound);
    }
    Ok(StatusCode::NO_CONTENT)
}

struct AdminRow {
    id: Uuid,
    title: String,
    body: String,
    level: String,
    bell: bool,
    modal: bool,
    email_audience: Option<String>,
    email_tag: Option<String>,
    cta_label: Option<String>,
    cta_url: Option<String>,
    starts_at: OffsetDateTime,
    ends_at: Option<OffsetDateTime>,
    published_at: Option<OffsetDateTime>,
    archived_at: Option<OffsetDateTime>,
    created_at: OffsetDateTime,
    created_by: Option<String>,
    seen: i64,
    dismissed: i64,
}

fn status_of(row: &AdminRow, now: OffsetDateTime) -> AnnouncementStatus {
    if row.archived_at.is_some() {
        AnnouncementStatus::Archived
    } else if row.published_at.is_none() {
        AnnouncementStatus::Draft
    } else if row.starts_at > now {
        AnnouncementStatus::Scheduled
    } else if row.ends_at.is_some_and(|ends_at| ends_at <= now) {
        AnnouncementStatus::Ended
    } else {
        AnnouncementStatus::Active
    }
}

async fn load_admin(state: &AppState, id: Option<Uuid>) -> ApiResult<Vec<AdminAnnouncementDto>> {
    let rows = sqlx::query_as!(
        AdminRow,
        r#"select a.id, a.title, a.body, a.level, a.bell, a.modal, a.email_audience, a.email_tag,
                  a.cta_label, a.cta_url, a.starts_at, a.ends_at, a.published_at, a.archived_at, a.created_at,
                  u.email::text as "created_by?",
                  (select count(*) from announcement_receipts r where r.announcement_id = a.id) as "seen!",
                  (select count(*) from announcement_receipts r
                   where r.announcement_id = a.id and r.dismissed_at is not null) as "dismissed!"
           from announcements a left join users u on u.id = a.created_by
           where ($1::uuid is null or a.id = $1)
           order by coalesce(a.published_at, a.created_at) desc limit 200"#,
        id,
    )
    .fetch_all(&state.pool)
    .await?;
    let audience = sqlx::query_scalar!(r#"select count(*) as "count!" from users"#)
        .fetch_one(&state.pool)
        .await?;
    // The latest sending by e-mail of each one (ADR 0107), newest first.
    let mut mailings = crate::mailings::load(state, id, None).await?;
    let now = OffsetDateTime::now_utc();
    Ok(rows
        .into_iter()
        .map(|row| AdminAnnouncementDto {
            mailing: mailings
                .iter()
                .position(|(announcement, _)| *announcement == row.id)
                .map(|index| mailings.swap_remove(index).1),
            status: status_of(&row, now),
            id: row.id,
            level: AnnouncementLevel::from_db(&row.level).unwrap_or(AnnouncementLevel::Info),
            bell: row.bell,
            modal: row.modal,
            email: row
                .email_audience
                .as_deref()
                .and_then(AnnouncementAudience::from_db)
                .map(|audience| AnnouncementEmailBody {
                    audience,
                    tag: row.email_tag.clone(),
                }),
            title: row.title,
            body: row.body,
            cta_label: row.cta_label,
            cta_url: row.cta_url,
            starts_at: row.starts_at,
            ends_at: row.ends_at,
            published_at: row.published_at,
            stats: AnnouncementStatsDto {
                audience,
                seen: row.seen,
                dismissed: row.dismissed,
            },
            created_by: row.created_by,
            created_at: row.created_at,
        })
        .collect())
}

pub(crate) async fn load_one(state: &AppState, id: Uuid) -> ApiResult<AdminAnnouncementDto> {
    load_admin(state, Some(id))
        .await?
        .into_iter()
        .next()
        .ok_or(ApiError::NotFound)
}

/// A checked announcement.
pub(crate) struct Announcement {
    pub title: String,
    pub body: String,
    pub cta: Option<(String, String)>,
    pub starts_at: OffsetDateTime,
    pub ends_at: Option<OffsetDateTime>,
    pub channels: Channels,
}

/// Where an announcement goes (ADR 0109): at least one channel.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Channels {
    pub bell: bool,
    pub modal: bool,
    /// The e-mail's audience and its label (for `tagged`).
    pub email: Option<(AnnouncementAudience, Option<String>)>,
}

impl Channels {
    pub(crate) fn check(self) -> ApiResult<Self> {
        if self.bell || self.modal || self.email.is_some() {
            Ok(self)
        } else {
            Err(bad_request(
                "invalid_channels",
                "choose the bell, the dialog or e-mail",
            ))
        }
    }
}

pub(crate) fn validate(body: &AnnouncementBody) -> ApiResult<Announcement> {
    let title = body.title.trim().to_owned();
    let text = body.body.trim().to_owned();
    if !(3..=MAX_TITLE).contains(&title.chars().count()) {
        return Err(bad_request("invalid_title", "title of 3 to 120 characters"));
    }
    if text.is_empty() || text.chars().count() > MAX_BODY {
        return Err(bad_request("invalid_body", "text of 1 to 4000 characters"));
    }
    let cta = match (
        optional_text(body.cta_label.clone()),
        optional_text(body.cta_url.clone()),
    ) {
        (None, None) => None,
        (Some(label), Some(url)) => {
            let path = url.starts_with('/') && !url.starts_with("//");
            if label.chars().count() > MAX_CTA_LABEL
                || url.len() > MAX_CTA_URL
                || !(path || url.starts_with("https://"))
                || url.chars().any(char::is_whitespace)
            {
                return Err(bad_request(
                    "invalid_cta",
                    "button: a short label and a /path or https:// address",
                ));
            }
            Some((label, url))
        }
        _ => {
            return Err(bad_request(
                "invalid_cta",
                "button needs both a label and an address",
            ));
        }
    };
    let starts_at = body.starts_at.unwrap_or_else(OffsetDateTime::now_utc);
    if body.ends_at.is_some_and(|ends_at| ends_at <= starts_at) {
        return Err(bad_request(
            "invalid_dates",
            "the end must be after the start",
        ));
    }
    let email = match &body.email {
        None => None,
        Some(email) => Some((email.audience, super::mailings::audience_tag(email)?)),
    };
    Ok(Announcement {
        title,
        body: text,
        cta,
        starts_at,
        ends_at: body.ends_at,
        channels: Channels {
            bell: body.bell,
            modal: body.modal,
            email,
        }
        .check()?,
    })
}

/// Inserts an announcement (also used when prices change).
///
/// # Errors
///
/// Database errors.
pub(crate) async fn insert<'e, E: sqlx::PgExecutor<'e>>(
    executor: E,
    user: &AuthUser,
    announcement: &Announcement,
    level: AnnouncementLevel,
    publish: bool,
) -> ApiResult<Uuid> {
    let (cta_label, cta_url) = announcement.cta.clone().unzip();
    let channels = &announcement.channels;
    let (audience, tag) = channels.email.clone().unzip();
    Ok(sqlx::query_scalar!(
        r#"insert into announcements
             (id, title, body, level, bell, modal, email_audience, email_tag, cta_label, cta_url,
              starts_at, ends_at, published_at, created_by)
           values ($1, $2, $3, $4, $5, $12, $13, $14, $6, $7, $8, $9, case when $10 then now() end, $11)
           returning id"#,
        Uuid::new_v4(),
        announcement.title,
        announcement.body,
        level.db(),
        channels.bell,
        cta_label,
        cta_url,
        announcement.starts_at,
        announcement.ends_at,
        publish,
        user.id,
        channels.modal,
        audience.map(AnnouncementAudience::db),
        tag.flatten(),
    )
    .fetch_one(executor)
    .await?)
}

/// Queues the e-mail of an announcement that is published, up and has started, once (ADR 0109).
/// One that starts later is queued by the worker, or by a timer set now for the next day.
///
/// # Errors
///
/// Database errors.
pub(crate) async fn queue_email(state: &AppState, id: Uuid) -> ApiResult<()> {
    let due = sqlx::query!(
        r#"update announcements set email_queued_at = now()
           where id = $1 and email_audience is not null and email_queued_at is null
             and published_at is not null and archived_at is null and starts_at <= now()
             and (ends_at is null or ends_at > now())
           returning email_audience as "audience!", email_tag, created_by"#,
        id
    )
    .fetch_optional(&state.pool)
    .await?;
    let Some(due) = due else {
        return Ok(());
    };
    let Some(audience) = AnnouncementAudience::from_db(&due.audience) else {
        return Ok(());
    };
    // Someone else's e-mail of it still going out: the new audience waits for the next tick.
    let running = sqlx::query_scalar!(
        r#"select exists(select 1 from announcement_mailings
                         where announcement_id = $1 and finished_at is null and canceled_at is null) as "running!""#,
        id
    )
    .fetch_one(&state.pool)
    .await?;
    if running {
        sqlx::query!(
            "update announcements set email_queued_at = null where id = $1",
            id
        )
        .execute(&state.pool)
        .await?;
        return Ok(());
    }
    if let Err(error) = crate::mailings::queue(
        state,
        id,
        audience,
        due.email_tag.as_deref(),
        due.created_by,
    )
    .await
    {
        // Not queued after all: the next tick tries again instead of never sending it.
        sqlx::query!(
            "update announcements set email_queued_at = null where id = $1",
            id
        )
        .execute(&state.pool)
        .await?;
        return Err(error);
    }
    Ok(())
}

/// Queues the e-mails of every announcement that started (the worker's tick, ADR 0109).
///
/// # Errors
///
/// Database errors.
pub async fn queue_due_emails(state: &AppState) -> ApiResult<usize> {
    let due = sqlx::query_scalar!(
        r#"select id from announcements
           where email_audience is not null and email_queued_at is null
             and published_at is not null and archived_at is null and starts_at <= now()
             and (ends_at is null or ends_at > now())"#
    )
    .fetch_all(&state.pool)
    .await?;
    for id in &due {
        queue_email(state, *id).await?;
    }
    Ok(due.len())
}

/// After saving: queues the e-mail now, or sets a timer for a start within a day.
async fn schedule_email(state: &AppState, id: Uuid, starts_at: OffsetDateTime) -> ApiResult<()> {
    let wait = starts_at - OffsetDateTime::now_utc();
    if wait <= time::Duration::ZERO {
        return queue_email(state, id).await;
    }
    if wait < time::Duration::days(1) {
        let state = state.clone();
        let wait = std::time::Duration::try_from(wait).unwrap_or_default();
        tokio::spawn(async move {
            tokio::time::sleep(wait + std::time::Duration::from_secs(1)).await;
            if let Err(error) = queue_email(&state, id).await {
                tracing::error!(?error, "announcement e-mail not queued");
            }
        });
    }
    Ok(())
}

/// `GET /api/admin/announcements`.
pub async fn admin_list(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<Vec<AdminAnnouncementDto>>> {
    require_admin(&user)?;
    Ok(Json(load_admin(&state, None).await?))
}

/// `POST /api/admin/announcements`.
pub async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<AnnouncementBody>,
) -> ApiResult<(StatusCode, Json<AdminAnnouncementDto>)> {
    require_admin(&user)?;
    let announcement = validate(&body)?;
    let id = insert(&state.pool, &user, &announcement, body.level, body.publish).await?;
    audit(
        &state,
        &user,
        "announcement_create",
        None,
        None,
        Some(id),
        serde_json::json!({
            "title": announcement.title,
            "published": body.publish,
            "bell": body.bell,
            "modal": body.modal,
            "email": body.email.as_ref().map(|email| email.audience.db()),
        }),
    )
    .await?;
    if body.publish {
        schedule_email(&state, id, announcement.starts_at).await?;
    }
    Ok((StatusCode::CREATED, Json(load_one(&state, id).await?)))
}

/// `PUT /api/admin/announcements/{id}`: edits; `publish` publishes a draft (never unpublishes).
pub async fn update(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<AnnouncementBody>,
) -> ApiResult<Json<AdminAnnouncementDto>> {
    require_admin(&user)?;
    let announcement = validate(&body)?;
    let (cta_label, cta_url) = announcement.cta.clone().unzip();
    let channels = &announcement.channels;
    let (audience, tag) = channels.email.clone().unzip();
    // Changing the e-mail's audience before it went out keeps it waiting; after, it stays sent
    // (another audience goes by "Enviar por e-mail").
    let updated = sqlx::query!(
        r#"update announcements set title = $2, body = $3, level = $4, bell = $5, modal = $11,
                  email_audience = case when email_queued_at is null then $12 else email_audience end,
                  email_tag = case when email_queued_at is null then $13 else email_tag end,
                  cta_label = $6, cta_url = $7, starts_at = $8, ends_at = $9,
                  published_at = coalesce(published_at, case when $10 then now() end),
                  updated_at = now()
           where id = $1 and archived_at is null"#,
        id,
        announcement.title,
        announcement.body,
        body.level.db(),
        channels.bell,
        cta_label,
        cta_url,
        announcement.starts_at,
        announcement.ends_at,
        body.publish,
        channels.modal,
        audience.map(AnnouncementAudience::db),
        tag.flatten(),
    )
    .execute(&state.pool)
    .await?
    .rows_affected();
    if updated == 0 {
        return Err(ApiError::NotFound);
    }
    audit(
        &state,
        &user,
        "announcement_update",
        None,
        None,
        Some(id),
        serde_json::json!({ "title": announcement.title, "publish": body.publish }),
    )
    .await?;
    schedule_email(&state, id, announcement.starts_at).await?;
    Ok(Json(load_one(&state, id).await?))
}

/// `DELETE /api/admin/announcements/{id}`: deletes a draft, takes a published one down.
pub async fn delete(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    require_admin(&user)?;
    let published = sqlx::query_scalar!(
        r#"select published_at is not null as "published!" from announcements where id = $1"#,
        id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound)?;
    if published {
        sqlx::query!(
            "update announcements set archived_at = coalesce(archived_at, now()), updated_at = now() where id = $1",
            id
        )
        .execute(&state.pool)
        .await?;
    } else {
        sqlx::query!("delete from announcements where id = $1", id)
            .execute(&state.pool)
            .await?;
    }
    audit(
        &state,
        &user,
        if published {
            "announcement_archive"
        } else {
            "announcement_delete"
        },
        None,
        None,
        Some(id),
        serde_json::json!({}),
    )
    .await?;
    Ok(StatusCode::NO_CONTENT)
}
