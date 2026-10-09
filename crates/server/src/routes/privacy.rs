//! The account holder's data rights (LGPD art. 18, ADR 0033): a copy of everything the account
//! holds, and deleting the account.
//!
//! Deleting keeps only what the law requires: batches and payments (fiscal records) stay, tied to
//! an anonymized user and to events renamed "Evento excluído"; art, designs, sellers, voids'
//! notes, digital tickets, door data and files go. An account that never paid for anything is
//! removed entirely.

use axum::extract::State;
use axum::http::StatusCode;
use axum::http::header::{CACHE_CONTROL, CONTENT_DISPOSITION, CONTENT_TYPE};
use axum::response::{IntoResponse, Response};
use serde_json::{Value, json};
use time::OffsetDateTime;
use time::format_description::well_known::Rfc3339;
use uuid::Uuid;

use super::bounds;
use crate::api::DeleteAccountBody;
use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult, bad_request};
use crate::state::AppState;

/// Name kept on an anonymized organization.
const DELETED_ORGANIZATION: &str = "Conta excluída";
/// Name kept on the events of an anonymized organization.
const DELETED_EVENT: &str = "Evento excluído";

fn rfc3339(at: OffsetDateTime) -> Value {
    at.format(&Rfc3339).map_or(Value::Null, Value::String)
}

fn optional_rfc3339(at: Option<OffsetDateTime>) -> Value {
    at.map_or(Value::Null, rfc3339)
}

/// `GET /api/account/export`: a JSON file with the account's data (LGPD art. 18, II and V).
pub async fn export(State(state): State<AppState>, user: AuthUser) -> ApiResult<Response> {
    let account = sqlx::query!(
        r#"select u.email::text as "email!", u.name, u.created_at, u.google_sub is not null as "google!",
                  u.terms_version, u.terms_accepted_at, u.last_login_at,
                  o.id as organization_id, o.name as organization_name, o.created_at as organization_created_at
           from users u
           join memberships m on m.user_id = u.id
           join organizations o on o.id = m.organization_id
           where u.id = $1 order by m.created_at limit 1"#,
        user.id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound)?;
    let events = sqlx::query!(
        r#"select id, name, venue, starts_at, ends_at, ticket_price_cents, status, created_at
           from events where organization_id = $1 order by starts_at"#,
        account.organization_id
    )
    .fetch_all(&state.pool)
    .await?;
    let mut exported = Vec::with_capacity(events.len());
    for event in events {
        exported.push(export_event(&state, event.id).await.map(|details| {
            let mut value = json!({
                "name": event.name,
                "venue": event.venue,
                "startsAt": rfc3339(event.starts_at),
                "endsAt": rfc3339(event.ends_at),
                "ticketPriceCents": event.ticket_price_cents,
                "status": event.status,
                "createdAt": rfc3339(event.created_at),
            });
            if let (Some(target), Value::Object(extra)) = (value.as_object_mut(), details) {
                target.extend(extra);
            }
            value
        })?);
    }
    let document = json!({
        "format": "ingressoimpresso-account-export",
        "version": 1,
        "generatedAt": rfc3339(OffsetDateTime::now_utc()),
        "user": {
            "email": account.email,
            "name": account.name,
            "createdAt": rfc3339(account.created_at),
            "lastLoginAt": optional_rfc3339(account.last_login_at),
            "signsInWithGoogle": account.google,
            "termsVersion": account.terms_version,
            "termsAcceptedAt": optional_rfc3339(account.terms_accepted_at),
        },
        "organization": {
            "name": account.organization_name,
            "createdAt": rfc3339(account.organization_created_at),
        },
        "events": exported,
    });
    let body = serde_json::to_vec_pretty(&document).map_err(anyhow::Error::from)?;
    Ok((
        [
            (CONTENT_TYPE, "application/json; charset=utf-8"),
            (
                CONTENT_DISPOSITION,
                "attachment; filename=\"ingresso-impresso-meus-dados.json\"",
            ),
            (CACHE_CONTROL, "no-store"),
        ],
        body,
    )
        .into_response())
}

#[expect(
    clippy::too_many_lines,
    reason = "one query per kind of data, written out so the export is easy to audit"
)]
async fn export_event(state: &AppState, event_id: Uuid) -> ApiResult<Value> {
    let batches = sqlx::query!(
        r#"select numbers, status, price_cents, free_tickets, paid_via, created_at, paid_at, refunded_at
           from ticket_batches where event_id = $1 order by lower(numbers)"#,
        event_id
    )
    .fetch_all(&state.pool)
    .await?;
    let mut batch_list = Vec::with_capacity(batches.len());
    for batch in batches {
        let (first, last) = bounds(&batch.numbers)?;
        batch_list.push(json!({
            "first": first, "last": last, "status": batch.status, "priceCents": batch.price_cents,
            "freeTickets": batch.free_tickets, "paidVia": batch.paid_via,
            "createdAt": rfc3339(batch.created_at), "paidAt": optional_rfc3339(batch.paid_at),
            "refundedAt": optional_rfc3339(batch.refunded_at),
        }));
    }
    let payments = sqlx::query!(
        r#"select p.amount_cents, p.currency, p.status, p.created_at, p.paid_at
           from payments p join ticket_batches b on b.id = p.batch_id
           where b.event_id = $1 order by p.created_at"#,
        event_id
    )
    .fetch_all(&state.pool)
    .await?
    .into_iter()
    .map(|payment| {
        json!({
            "amountCents": payment.amount_cents, "currency": payment.currency, "status": payment.status,
            "createdAt": rfc3339(payment.created_at), "paidAt": optional_rfc3339(payment.paid_at),
        })
    })
    .collect::<Vec<_>>();
    let sellers = sqlx::query!(
        "select id, name, phone, created_at from sellers where event_id = $1 order by name",
        event_id
    )
    .fetch_all(&state.pool)
    .await?;
    let mut seller_list = Vec::with_capacity(sellers.len());
    for seller in sellers {
        let ranges = sqlx::query_scalar!(
            "select numbers from seller_assignments where seller_id = $1 order by lower(numbers)",
            seller.id
        )
        .fetch_all(&state.pool)
        .await?
        .iter()
        .map(|numbers| bounds(numbers).map(|(first, last)| json!({ "first": first, "last": last })))
        .collect::<ApiResult<Vec<_>>>()?;
        seller_list.push(json!({
            "name": seller.name, "phone": seller.phone, "createdAt": rfc3339(seller.created_at),
            "ranges": ranges,
        }));
    }
    let voids = sqlx::query!(
        "select numbers, reason, note, created_at, undone_at from ticket_voids where event_id = $1 order by created_at",
        event_id
    )
    .fetch_all(&state.pool)
    .await?;
    let mut void_list = Vec::with_capacity(voids.len());
    for void in voids {
        let (first, last) = bounds(&void.numbers)?;
        void_list.push(json!({
            "first": first, "last": last, "reason": void.reason, "note": void.note,
            "createdAt": rfc3339(void.created_at), "undoneAt": optional_rfc3339(void.undone_at),
        }));
    }
    let links = sqlx::query!(
        r#"select ticket_number, holder_name, created_at, first_opened_at, revoked_at
           from ticket_links where event_id = $1 order by ticket_number"#,
        event_id
    )
    .fetch_all(&state.pool)
    .await?
    .into_iter()
    .map(|link| {
        json!({
            "number": link.ticket_number, "holderName": link.holder_name,
            "createdAt": rfc3339(link.created_at), "firstOpenedAt": optional_rfc3339(link.first_opened_at),
            "revokedAt": optional_rfc3339(link.revoked_at),
        })
    })
    .collect::<Vec<_>>();
    let devices = sqlx::query!(
        "select name, created_at, last_seen_at from door_devices where event_id = $1 order by created_at",
        event_id
    )
    .fetch_all(&state.pool)
    .await?
    .into_iter()
    .map(|device| {
        json!({
            "name": device.name, "createdAt": rfc3339(device.created_at),
            "lastSeenAt": optional_rfc3339(device.last_seen_at),
        })
    })
    .collect::<Vec<_>>();
    let entries = sqlx::query_scalar!(
        r#"select count(*) as "count!" from entries where event_id = $1"#,
        event_id
    )
    .fetch_one(&state.pool)
    .await?;
    Ok(json!({
        "batches": batch_list,
        "payments": payments,
        "sellers": seller_list,
        "voids": void_list,
        "digitalTickets": links,
        "doorPhones": devices,
        "entries": entries,
    }))
}

/// `DELETE /api/account` with `{ "email": "<the account's e-mail>" }` as confirmation.
pub async fn delete(
    State(state): State<AppState>,
    user: AuthUser,
    axum::Json(body): axum::Json<DeleteAccountBody>,
) -> ApiResult<StatusCode> {
    if !body.email.trim().eq_ignore_ascii_case(&user.email) {
        return Err(bad_request(
            "confirmation_mismatch",
            "type the account's e-mail to confirm",
        ));
    }
    let mut tx = state.pool.begin().await?;
    let organizations = sqlx::query_scalar!(
        r#"select m.organization_id from memberships m
           where m.user_id = $1 and m.role = 'owner'
             and not exists (select 1 from memberships other
                             where other.organization_id = m.organization_id
                               and other.user_id <> m.user_id and other.role = 'owner')"#,
        user.id
    )
    .fetch_all(&mut *tx)
    .await?;
    for organization_id in organizations {
        let keeps_records = sqlx::query_scalar!(
            r#"select exists(select 1 from ticket_batches b join events e on e.id = b.event_id
                             where e.organization_id = $1
                               and (b.status in ('paid', 'refunded')
                                    or exists (select 1 from payments p where p.batch_id = b.id))) as "keeps!""#,
            organization_id
        )
        .fetch_one(&mut *tx)
        .await?;
        if !keeps_records {
            sqlx::query!("delete from organizations where id = $1", organization_id)
                .execute(&mut *tx)
                .await?;
            continue;
        }
        // Fiscal records stay; everything personal or creative goes.
        sqlx::query!(
            r#"with events as (select id from events where organization_id = $1),
               designs as (delete from ticket_designs where event_id in (select id from events)),
               sellers as (delete from sellers where event_id in (select id from events)),
               links as (delete from ticket_links where event_id in (select id from events)),
               doors as (delete from door_accesses where event_id in (select id from events)),
               files as (delete from exports where event_id in (select id from events)),
               notes as (update ticket_voids set note = null where event_id in (select id from events))
               update events set name = $2, venue = null where organization_id = $1"#,
            organization_id,
            DELETED_EVENT,
        )
        .execute(&mut *tx)
        .await?;
        // Art goes after the designs that point at it.
        sqlx::query!(
            "delete from blobs where event_id in (select id from events where organization_id = $1)",
            organization_id
        )
        .execute(&mut *tx)
        .await?;
        sqlx::query!(
            r#"update organizations set name = $2, bonus_free_tickets = 0, suspended_at = null,
                      suspended_reason = null where id = $1"#,
            organization_id,
            DELETED_ORGANIZATION,
        )
        .execute(&mut *tx)
        .await?;
    }
    let placeholder = format!("excluido-{}@conta-excluida.invalid", user.id.simple());
    sqlx::query!("delete from login_codes where email = $1", user.email)
        .execute(&mut *tx)
        .await?;
    // The mail log keeps no address of a deleted account (ADR 0041).
    sqlx::query!(
        "update mail_sends set to_email = null where to_email = $1",
        user.email
    )
    .execute(&mut *tx)
    .await?;
    sqlx::query!("delete from sessions where user_id = $1", user.id)
        .execute(&mut *tx)
        .await?;
    sqlx::query!(
        r#"update users set email = $2, name = null, google_sub = null, terms_version = null,
                  terms_accepted_at = null, last_login_at = null where id = $1"#,
        user.id,
        placeholder,
    )
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    tracing::info!(user_id = %user.id, "account deleted at the holder's request");
    Ok(StatusCode::NO_CONTENT)
}
