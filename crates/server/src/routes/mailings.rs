//! Announcements by e-mail (ADR 0107): the admins choose an audience and send; each account can
//! stop them in Minha conta or by the link of the e-mail, with no session.

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use uuid::Uuid;

use super::admin::{audit, require_admin};
use super::announcements::load_one;
use crate::api::{
    AdminAnnouncementDto, AnnouncementAudience, AnnouncementAudienceDto, AnnouncementEmailBody,
    UnsubscribeBody, UnsubscribeDto,
};
use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult, bad_request};
use crate::mailings;
use crate::ratelimit;
use crate::state::AppState;

/// The audience's label, checked and kept like the admins' labels.
pub(crate) fn audience_tag(body: &AnnouncementEmailBody) -> ApiResult<Option<String>> {
    match body.audience {
        AnnouncementAudience::Tagged => {
            let tag = body
                .tag
                .as_deref()
                .map(|tag| {
                    tag.split_whitespace()
                        .collect::<Vec<_>>()
                        .join(" ")
                        .to_lowercase()
                })
                .filter(|tag| !tag.is_empty() && tag.chars().count() <= 30)
                .ok_or_else(|| bad_request("invalid_tag", "choose a label"))?;
            Ok(Some(tag))
        }
        _ => Ok(None),
    }
}

/// The announcement, which must be published and still up.
async fn sendable(state: &AppState, id: Uuid) -> ApiResult<()> {
    let live = sqlx::query_scalar!(
        r#"select published_at is not null and archived_at is null as "live!"
           from announcements where id = $1"#,
        id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound)?;
    if live {
        Ok(())
    } else {
        Err(ApiError::Conflict(
            "announcement_not_published",
            "publish the announcement before e-mailing it".to_owned(),
        ))
    }
}

/// `GET /api/admin/announcements/{id}/email?audience=&tag=`: how many it would reach.
pub async fn preview(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Query(body): Query<AnnouncementEmailBody>,
) -> ApiResult<Json<AnnouncementAudienceDto>> {
    require_admin(&user)?;
    let tag = audience_tag(&body)?;
    let (recipients, opted_out, already) =
        mailings::audience_counts(&state, id, body.audience, tag.as_deref()).await?;
    Ok(Json(AnnouncementAudienceDto {
        recipients,
        opted_out,
        already,
        daily_budget: mailings::daily_budget(&state),
    }))
}

/// `POST /api/admin/announcements/{id}/email`: queues it for the audience; whoever already got
/// it or stopped these e-mails is left out.
pub async fn send(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<AnnouncementEmailBody>,
) -> ApiResult<Json<AdminAnnouncementDto>> {
    require_admin(&user)?;
    let tag = audience_tag(&body)?;
    sendable(&state, id).await?;
    let running = sqlx::query_scalar!(
        r#"select exists(select 1 from announcement_mailings
                         where announcement_id = $1 and finished_at is null and canceled_at is null) as "running!""#,
        id
    )
    .fetch_one(&state.pool)
    .await?;
    if running {
        return Err(ApiError::Conflict(
            "mailing_in_progress",
            "this announcement is still being sent".to_owned(),
        ));
    }
    let mailing = mailings::queue(&state, id, body.audience, tag.as_deref(), Some(user.id))
        .await?
        .ok_or_else(|| bad_request("no_recipients", "nobody left to receive it"))?;
    audit(
        &state,
        &user,
        "announcement_email",
        None,
        None,
        Some(id),
        serde_json::json!({ "mailing": mailing, "audience": body.audience.db(), "tag": tag }),
    )
    .await?;
    Ok(Json(load_one(&state, id).await?))
}

/// `POST /api/admin/announcements/{id}/email/test`: the e-mail to the admin alone, outside the
/// queue and the audience.
pub async fn test(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    require_admin(&user)?;
    let row = sqlx::query!(
        "select title, body, cta_label, cta_url from announcements where id = $1",
        id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound)?;
    let mut email = mailings::message(
        &state,
        user.id,
        &row.title,
        &row.body,
        row.cta_label.as_deref().zip(row.cta_url.as_deref()),
    );
    email.subject = format!("[Teste] {}", email.subject);
    state
        .send_mail(crate::mail::MailKind::Test, &user.email, &email)
        .await
        .map_err(|error| error.api_error())?;
    Ok(StatusCode::NO_CONTENT)
}

/// `POST /api/admin/mailings/{id}/cancel`: stops a sending; what went out stays out.
pub async fn cancel(
    State(state): State<AppState>,
    user: AuthUser,
    Path(mailing_id): Path<Uuid>,
) -> ApiResult<Json<AdminAnnouncementDto>> {
    require_admin(&user)?;
    let announcement = sqlx::query_scalar!(
        r#"update announcement_mailings set canceled_at = now()
           where id = $1 and finished_at is null and canceled_at is null
           returning announcement_id"#,
        mailing_id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound)?;
    sqlx::query!(
        "update announcement_mail_recipients set status = 'skipped' where mailing_id = $1 and status = 'pending'",
        mailing_id
    )
    .execute(&state.pool)
    .await?;
    audit(
        &state,
        &user,
        "announcement_email_cancel",
        None,
        None,
        Some(announcement),
        serde_json::json!({ "mailing": mailing_id }),
    )
    .await?;
    Ok(Json(load_one(&state, announcement).await?))
}

/// Turns an account's announcement e-mails on or off.
async fn set_subscribed(state: &AppState, user_id: Uuid, on: bool) -> ApiResult<Option<String>> {
    Ok(sqlx::query_scalar!(
        r#"update users set announcement_emails = $2 where id = $1 returning email::text as "email!""#,
        user_id,
        on,
    )
    .fetch_optional(&state.pool)
    .await?)
}

/// `POST /api/email/unsubscribe`: the page of the e-mail's link stops (or, asked, restarts)
/// announcement e-mails, with no session; the token only does this.
pub async fn unsubscribe(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<UnsubscribeBody>,
) -> ApiResult<Json<UnsubscribeDto>> {
    ratelimit::by_ip(&state, &headers, ratelimit::UNSUBSCRIBE).await?;
    let user_id =
        mailings::user_of(&state.config.master_key, &body.token).ok_or(ApiError::NotFound)?;
    let subscribed = body.subscribed.unwrap_or(false);
    let email = set_subscribed(&state, user_id, subscribed)
        .await?
        .ok_or(ApiError::NotFound)?;
    Ok(Json(UnsubscribeDto {
        email: mailings::mask_email(&email),
        subscribed,
    }))
}

/// `POST /api/email/unsubscribe/{token}`: the mail client's one-click button (RFC 8058).
pub async fn one_click(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(token): Path<String>,
) -> ApiResult<StatusCode> {
    ratelimit::by_ip(&state, &headers, ratelimit::UNSUBSCRIBE).await?;
    let user_id = mailings::user_of(&state.config.master_key, &token).ok_or(ApiError::NotFound)?;
    set_subscribed(&state, user_id, false)
        .await?
        .ok_or(ApiError::NotFound)?;
    Ok(StatusCode::OK)
}
