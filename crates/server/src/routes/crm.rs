//! The admins' file on an organization (ADR 0105): internal notes, labels and a timeline of
//! everything that happened to the account, put together from the tables that already record it.

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use serde::Deserialize;
use sqlx::PgPool;
use time::OffsetDateTime;
use uuid::Uuid;

use super::admin::{audit, load_organization, require_admin};
use crate::api::{
    AdminOrganizationDto, AdminTagCountDto, OrganizationNoteBody, OrganizationNoteDto,
    OrganizationTagsBody, TimelineEntryDto, TimelineKind,
};
use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult, bad_request};
use crate::state::AppState;

/// Characters of a note.
const MAX_NOTE: usize = 2000;
/// Labels per organization.
const MAX_TAGS: usize = 10;
/// Characters of a label.
const MAX_TAG: usize = 30;
/// Timeline entries per page.
const TIMELINE_PAGE: i64 = 100;

/// The notes of an organization, pinned first, then newest first.
pub(crate) async fn load_notes(
    pool: &PgPool,
    organization_id: Uuid,
) -> ApiResult<Vec<OrganizationNoteDto>> {
    Ok(sqlx::query_as!(
        OrganizationNoteDto,
        r#"select id, body, pinned, author_email, created_at, updated_at from organization_notes
           where organization_id = $1 order by pinned desc, created_at desc"#,
        organization_id
    )
    .fetch_all(pool)
    .await?)
}

/// The note's text, trimmed and checked.
fn note_body(body: &str) -> ApiResult<String> {
    let body = body.trim();
    if body.is_empty() || body.chars().count() > MAX_NOTE {
        return Err(bad_request(
            "invalid_organization_note",
            "a note must have 1-2000 characters",
        ));
    }
    Ok(body.to_owned())
}

/// `POST /api/admin/organizations/{id}/notes`.
pub async fn create_note(
    State(state): State<AppState>,
    user: AuthUser,
    Path(organization_id): Path<Uuid>,
    Json(body): Json<OrganizationNoteBody>,
) -> ApiResult<(StatusCode, Json<OrganizationNoteDto>)> {
    require_admin(&user)?;
    let text = note_body(&body.body)?;
    let note = sqlx::query_as!(
        OrganizationNoteDto,
        r#"insert into organization_notes (id, organization_id, author_id, author_email, body, pinned)
           select $1, o.id, $3, $4, $5, $6 from organizations o where o.id = $2
           returning id, body, pinned, author_email, created_at, updated_at"#,
        Uuid::new_v4(),
        organization_id,
        user.id,
        user.email,
        text,
        body.pinned.unwrap_or(false),
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound)?;
    audit(
        &state,
        &user,
        "organization_note_create",
        Some(organization_id),
        None,
        Some(note.id),
        serde_json::json!({}),
    )
    .await?;
    Ok((StatusCode::CREATED, Json(note)))
}

/// `PUT /api/admin/organization-notes/{id}`: new text or pin.
pub async fn update_note(
    State(state): State<AppState>,
    user: AuthUser,
    Path(note_id): Path<Uuid>,
    Json(body): Json<OrganizationNoteBody>,
) -> ApiResult<Json<OrganizationNoteDto>> {
    require_admin(&user)?;
    let text = note_body(&body.body)?;
    let row = sqlx::query!(
        r#"update organization_notes
           set body = $2, pinned = coalesce($3, pinned),
               updated_at = case when body = $2 then updated_at else now() end
           where id = $1
           returning id, organization_id, body, pinned, author_email, created_at, updated_at"#,
        note_id,
        text,
        body.pinned,
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound)?;
    audit(
        &state,
        &user,
        "organization_note_update",
        Some(row.organization_id),
        None,
        Some(note_id),
        serde_json::json!({}),
    )
    .await?;
    Ok(Json(OrganizationNoteDto {
        id: row.id,
        body: row.body,
        pinned: row.pinned,
        author_email: row.author_email,
        created_at: row.created_at,
        updated_at: row.updated_at,
    }))
}

/// `DELETE /api/admin/organization-notes/{id}`.
pub async fn delete_note(
    State(state): State<AppState>,
    user: AuthUser,
    Path(note_id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    require_admin(&user)?;
    let organization_id = sqlx::query_scalar!(
        "delete from organization_notes where id = $1 returning organization_id",
        note_id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound)?;
    audit(
        &state,
        &user,
        "organization_note_delete",
        Some(organization_id),
        None,
        Some(note_id),
        serde_json::json!({}),
    )
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// The labels as kept: trimmed, lowercase, single spaces, no repeats, in the order given.
fn normalize_tags(tags: &[String]) -> ApiResult<Vec<String>> {
    let mut clean: Vec<String> = Vec::new();
    for tag in tags {
        let tag = tag
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
            .to_lowercase();
        if tag.is_empty() {
            continue;
        }
        if tag.chars().count() > MAX_TAG {
            return Err(bad_request(
                "invalid_tag",
                "a label must have 1-30 characters",
            ));
        }
        super::one_line(&tag, "invalid_tag")?;
        if !clean.contains(&tag) {
            clean.push(tag);
        }
    }
    if clean.len() > MAX_TAGS {
        return Err(bad_request("too_many_tags", "at most 10 labels"));
    }
    Ok(clean)
}

/// `PUT /api/admin/organizations/{id}/tags`.
pub async fn set_tags(
    State(state): State<AppState>,
    user: AuthUser,
    Path(organization_id): Path<Uuid>,
    Json(body): Json<OrganizationTagsBody>,
) -> ApiResult<Json<AdminOrganizationDto>> {
    require_admin(&user)?;
    let tags = normalize_tags(&body.tags)?;
    let previous = sqlx::query_scalar!(
        r#"update organizations o set admin_tags = $2 from organizations old
           where o.id = $1 and old.id = o.id returning old.admin_tags"#,
        organization_id,
        &tags,
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound)?;
    if previous != tags {
        audit(
            &state,
            &user,
            "organization_tags",
            Some(organization_id),
            None,
            None,
            serde_json::json!({ "from": previous, "to": tags }),
        )
        .await?;
    }
    Ok(Json(load_organization(&state, organization_id).await?))
}

/// `GET /api/admin/organizations/tags`: the labels in use, most used first.
pub async fn tags(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<Vec<AdminTagCountDto>>> {
    require_admin(&user)?;
    Ok(Json(
        sqlx::query_as!(
            AdminTagCountDto,
            r#"select tag as "tag!", count(*) as "count!"
               from organizations, unnest(admin_tags) tag
               group by tag order by count(*) desc, tag"#
        )
        .fetch_all(&state.pool)
        .await?,
    ))
}

/// Page of `GET /api/admin/organizations/{id}/timeline`.
#[derive(Debug, Deserialize)]
pub struct TimelineQuery {
    /// Only what happened before this moment (the last entry of the previous page).
    #[serde(default, with = "time::serde::rfc3339::option")]
    before: Option<OffsetDateTime>,
}

/// `GET /api/admin/organizations/{id}/timeline?before=`: newest first, 100 at a time.
pub async fn timeline(
    State(state): State<AppState>,
    user: AuthUser,
    Path(organization_id): Path<Uuid>,
    Query(query): Query<TimelineQuery>,
) -> ApiResult<Json<Vec<TimelineEntryDto>>> {
    require_admin(&user)?;
    sqlx::query_scalar!(
        "select id from organizations where id = $1",
        organization_id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound)?;
    // Sign-in codes are left out: the sign-ins themselves are here. Notes have their own
    // entries, so the audit lines of writing them are left out too.
    let rows = sqlx::query!(
        r#"select at as "at!", kind as "kind!", code, detail, amount_cents, count, actor,
                  event_id, event_name
           from (
             select o.created_at as at, 'signup' as kind, null::text as code, o.name as detail,
                    null::bigint as amount_cents, null::bigint as count, null::text as actor,
                    null::uuid as event_id, null::text as event_name
             from organizations o where o.id = $1
             union all
             select m.created_at, 'member_joined', m.role, null, null, null, u.email::text, null, null
             from memberships m join users u on u.id = m.user_id where m.organization_id = $1
             union all
             select s.created_at, 'login', null, null, null, null, u.email::text, null, null
             from sessions s join memberships m on m.user_id = s.user_id join users u on u.id = s.user_id
             where m.organization_id = $1
             union all
             select e.created_at, 'event_created', null, null, null, null, null, e.id, e.name
             from events e where e.organization_id = $1
             union all
             select b.created_at, 'batch_created', b.status, null, b.price_cents::bigint,
                    (upper(b.numbers) - lower(b.numbers))::bigint, null, e.id, e.name
             from ticket_batches b join events e on e.id = b.event_id where e.organization_id = $1
             union all
             select b.paid_at, 'batch_paid', b.paid_via, null, b.price_cents::bigint,
                    (upper(b.numbers) - lower(b.numbers))::bigint, null, e.id, e.name
             from ticket_batches b join events e on e.id = b.event_id
             where e.organization_id = $1 and b.paid_at is not null
             union all
             select b.refunded_at, 'batch_refunded', null, null, b.price_cents::bigint,
                    (upper(b.numbers) - lower(b.numbers))::bigint, null, e.id, e.name
             from ticket_batches b join events e on e.id = b.event_id
             where e.organization_id = $1 and b.refunded_at is not null
             union all
             select d.opened_at, 'dispute', d.status, d.reason, d.amount_cents::bigint, null, null, e.id, e.name
             from payment_disputes d join ticket_batches b on b.id = d.batch_id
             join events e on e.id = b.event_id where e.organization_id = $1
             union all
             select ms.created_at, 'email', ms.status, ms.subject, null, null, ms.to_email::text, null, null
             from mail_sends ms
             where ms.kind not in ('login_code', 'signup_code')
               and ms.to_email in (select u.email from memberships m join users u on u.id = m.user_id
                                   where m.organization_id = $1)
             union all
             select c.created_at, 'credit', c.reason, c.note, c.amount_cents::bigint, null, null, null, null
             from credit_ledger c where c.organization_id = $1
             union all
             select r.redeemed_at, 'coupon', p.kind, p.code, null, null, u.email::text, null, null
             from promo_redemptions r join promo_codes p on p.id = r.promo_code_id
             left join users u on u.id = r.redeemed_by where r.organization_id = $1
             union all
             select a.created_at, 'admin', a.action, null, null, null, a.actor_email, e.id, e.name
             from audit_log a left join events e on e.id = a.event_id
             where a.organization_id = $1 and a.action not like 'organization\_note\_%'
             union all
             select n.created_at, 'note', null, n.body, null, null, n.author_email, null, null
             from organization_notes n where n.organization_id = $1
           ) entries
           where $2::timestamptz is null or at <= $2
           order by at desc
           limit $3"#,
        organization_id,
        query.before,
        TIMELINE_PAGE,
    )
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(
        rows.into_iter()
            .filter_map(|row| {
                Some(TimelineEntryDto {
                    at: row.at,
                    kind: TimelineKind::from_db(&row.kind)?,
                    code: row.code,
                    detail: row.detail,
                    amount_cents: row.amount_cents,
                    count: row.count,
                    actor: row.actor,
                    event_id: row.event_id,
                    event_name: row.event_name,
                })
            })
            .collect(),
    ))
}

#[cfg(test)]
mod tests {
    use super::normalize_tags;

    #[test]
    fn labels_are_kept_lowercase_and_once() {
        let tags = ["  Igreja ", "VIP", "igreja", "", "grande   cliente"]
            .map(str::to_owned)
            .to_vec();
        assert_eq!(
            normalize_tags(&tags).ok(),
            Some(vec![
                "igreja".to_owned(),
                "vip".to_owned(),
                "grande cliente".to_owned()
            ])
        );
        assert!(normalize_tags(&["x".repeat(31)]).is_err());
        let many: Vec<String> = (0..11).map(|n| format!("t{n}")).collect();
        assert!(normalize_tags(&many).is_err());
    }
}
