//! The account holder's data rights (LGPD art. 18, ADR 0033): a copy of everything the account
//! holds, and deleting the account.
//!
//! Deleting keeps only what the law requires: batches and payments (fiscal records) stay, tied to
//! an anonymized user and to events renamed "Evento excluído"; the organization's profile and
//! logo, art, designs, sellers (with the money they handed over, their links and the buyers they
//! wrote down), voids' notes, digital tickets, door data, guest lists and files go. An account
//! that never paid for anything is removed entirely.

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

pub(crate) fn rfc3339(at: OffsetDateTime) -> Value {
    at.format(&Rfc3339).map_or(Value::Null, Value::String)
}

pub(crate) fn optional_rfc3339(at: Option<OffsetDateTime>) -> Value {
    at.map_or(Value::Null, rfc3339)
}

/// Account exports one person may ask for per hour: each one walks every event of the account.
const EXPORTS_PER_HOUR: usize = 5;

/// `GET /api/account/export`: a JSON file with the account's data (LGPD art. 18, II and V).
pub async fn export(State(state): State<AppState>, user: AuthUser) -> ApiResult<Response> {
    if !state
        .attempt(
            &format!("account-export:{}", user.id),
            EXPORTS_PER_HOUR,
            std::time::Duration::from_hours(1),
        )
        .await
    {
        return Err(ApiError::TooManyRequests);
    }
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
        r#"select id, name, venue, starts_at, ends_at, ticket_price_cents, status, created_at,
                  address, postponed_from_starts_at, postpone_reason, canceled_at, cancel_reason,
                  (select s.name from event_series s where s.id = series_id) as series
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
                "address": event.address,
                "postponedFromStartsAt": optional_rfc3339(event.postponed_from_starts_at),
                "postponeReason": event.postpone_reason,
                "canceledAt": optional_rfc3339(event.canceled_at),
                "cancelReason": event.cancel_reason,
                // The series of dates it is one of (ADR 0077).
                "series": event.series,
            });
            if let (Some(target), Value::Object(extra)) = (value.as_object_mut(), details) {
                target.extend(extra);
            }
            value
        })?);
    }
    let teams = team_memberships(&state, user.id).await?;
    let profile = profile(&state, account.organization_id).await?;
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
            "profile": profile,
            "referrals": super::referrals::export(&state.pool, account.organization_id).await?,
        },
        "events": exported,
        "teams": teams,
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

/// The organization's public profile and the defaults of new events (ADR 0064); the logo is an
/// image the account already has.
async fn profile(state: &AppState, organization_id: Uuid) -> ApiResult<Value> {
    let public = super::organization::public_organization(&state.pool, organization_id).await?;
    let defaults = sqlx::query!(
        r#"select default_venue, default_address, default_ticket_price_cents,
                  logo_blob_id is not null as "logo!", pix_key_type, pix_key, pix_name, pix_city
           from organization_profiles where organization_id = $1"#,
        organization_id
    )
    .fetch_optional(&state.pool)
    .await?;
    Ok(json!({
        "hasLogo": defaults.as_ref().is_some_and(|row| row.logo),
        "brandColor": public.brand_color,
        "whatsapp": public.whatsapp,
        "contactEmail": public.email,
        "website": public.website,
        "instagram": public.instagram,
        "defaultVenue": defaults.as_ref().and_then(|row| row.default_venue.clone()),
        "defaultAddress": defaults.as_ref().and_then(|row| row.default_address.clone()),
        "defaultTicketPriceCents": defaults.as_ref().and_then(|row| row.default_ticket_price_cents),
        // The Pix key (ADR 0085) may be a CPF: it is the account holder's data too.
        "pix": defaults.and_then(|row| super::pix::account(
            row.pix_key_type.as_deref(), row.pix_key, row.pix_name, row.pix_city,
        )),
    }))
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
        r#"select id, name, phone, box_office, goal, created_at, pix_key_type, pix_key, pix_name, pix_city
           from sellers where event_id = $1 order by name"#,
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
        let received = sqlx::query!(
            r#"select amount_cents, method, received_on, note, created_at from seller_payments
               where seller_id = $1 order by received_on, created_at"#,
            seller.id
        )
        .fetch_all(&state.pool)
        .await?
        .into_iter()
        .map(|payment| {
            json!({
                "amountCents": payment.amount_cents, "method": payment.method,
                "receivedOn": payment.received_on.to_string(), "note": payment.note,
                "createdAt": rfc3339(payment.created_at),
            })
        })
        .collect::<Vec<_>>();
        let sales = sqlx::query!(
            r#"select ticket_number, buyer_name, buyer_phone, sold_at from ticket_sales
               where seller_id = $1 order by ticket_number"#,
            seller.id
        )
        .fetch_all(&state.pool)
        .await?
        .into_iter()
        .map(|sale| {
            json!({
                "number": sale.ticket_number, "buyerName": sale.buyer_name,
                "buyerPhone": sale.buyer_phone, "soldAt": rfc3339(sale.sold_at),
            })
        })
        .collect::<Vec<_>>();
        // Reservations (ADR 0072) hold names and phones of people too.
        let reservations = sqlx::query!(
            r#"select ticket_number, holder_name, holder_phone, expires_at, created_at
               from ticket_reservations where seller_id = $1 order by ticket_number"#,
            seller.id
        )
        .fetch_all(&state.pool)
        .await?
        .into_iter()
        .map(|reservation| {
            json!({
                "number": reservation.ticket_number, "holderName": reservation.holder_name,
                "holderPhone": reservation.holder_phone,
                "expiresAt": rfc3339(reservation.expires_at),
                "createdAt": rfc3339(reservation.created_at),
            })
        })
        .collect::<Vec<_>>();
        seller_list.push(json!({
            "name": seller.name, "phone": seller.phone, "createdAt": rfc3339(seller.created_at),
            "boxOffice": seller.box_office, "goal": seller.goal, "ranges": ranges,
            "received": received, "sales": sales, "reservations": reservations,
            "pix": super::pix::account(seller.pix_key_type.as_deref(), seller.pix_key, seller.pix_name, seller.pix_city),
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
    let team = sqlx::query!(
        r#"select email::text as "email!", name, areas, joined_at, created_at from event_team
           where event_id = $1 order by created_at"#,
        event_id
    )
    .fetch_all(&state.pool)
    .await?
    .into_iter()
    .map(|member| {
        json!({
            "email": member.email,
            "name": member.name,
            "areas": member.areas,
            "joinedAt": optional_rfc3339(member.joined_at),
            "addedAt": rfc3339(member.created_at),
        })
    })
    .collect::<Vec<_>>();
    let categories = super::categories::load(&state.pool, event_id)
        .await?
        .into_iter()
        .map(|category| {
            json!({
                "name": category.name,
                "color": category.color,
                "priceCents": category.price_cents,
                "ranges": category.ranges.iter().map(|range| json!({ "first": range.first, "last": range.last })).collect::<Vec<_>>(),
            })
        })
        .collect::<Vec<_>>();
    let tables = sqlx::query!(
        r#"select t.name, t.seats,
                  coalesce(array_agg(s.ticket_number order by s.seat) filter (where s.ticket_number is not null), '{}') as "guests!"
           from event_tables t left join ticket_seats s on s.table_id = t.id
           where t.event_id = $1 group by t.id order by t.name"#,
        event_id
    )
    .fetch_all(&state.pool)
    .await?
    .into_iter()
    .map(|table| json!({ "name": table.name, "seats": table.seats, "tickets": table.guests }))
    .collect::<Vec<_>>();
    let entries = sqlx::query_scalar!(
        r#"select count(*) as "count!" from entries where event_id = $1"#,
        event_id
    )
    .fetch_one(&state.pool)
    .await?;
    // The guest list (ADR 0070), with when each name arrived.
    let guests = sqlx::query!(
        r#"select g.name, g.companions, g.note, g.created_at,
                  (select min(a.arrived_at) from guest_arrivals a
                   where a.guest_id = g.id and a.undone_at is null) as arrived_at
           from guest_list g where g.event_id = $1 order by g.name"#,
        event_id
    )
    .fetch_all(&state.pool)
    .await?
    .into_iter()
    .map(|guest| {
        json!({
            "name": guest.name, "companions": guest.companions, "note": guest.note,
            "createdAt": rfc3339(guest.created_at), "arrivedAt": optional_rfc3339(guest.arrived_at),
        })
    })
    .collect::<Vec<_>>();
    // Pix the buyers paid (ADR 0085), number by number.
    let pix_receipts = sqlx::query!(
        r#"select ticket_number, amount_cents, received_by, confirmed_at
           from ticket_payments where event_id = $1 order by ticket_number"#,
        event_id
    )
    .fetch_all(&state.pool)
    .await?
    .into_iter()
    .map(|receipt| {
        json!({
            "number": receipt.ticket_number, "amountCents": receipt.amount_cents,
            "receivedBy": receipt.received_by, "confirmedAt": rfc3339(receipt.confirmed_at),
        })
    })
    .collect::<Vec<_>>();
    Ok(json!({
        "batches": batch_list,
        "payments": payments,
        "sellers": seller_list,
        "voids": void_list,
        "digitalTickets": links,
        "doorPhones": devices,
        "team": team,
        "categories": categories,
        "tables": tables,
        "entries": entries,
        "guestList": guests,
        "pixReceipts": pix_receipts,
    }))
}

/// Events of other organizations whose team the user is on (ADR 0055).
async fn team_memberships(state: &AppState, user_id: Uuid) -> ApiResult<Vec<Value>> {
    Ok(sqlx::query!(
        r#"select e.name as event, o.name as organization, t.areas, t.joined_at
           from event_team t join events e on e.id = t.event_id
           join organizations o on o.id = e.organization_id
           where t.user_id = $1 order by t.created_at"#,
        user_id
    )
    .fetch_all(&state.pool)
    .await?
    .into_iter()
    .map(|row| {
        json!({
            "event": row.event,
            "organization": row.organization,
            "areas": row.areas,
            "joinedAt": optional_rfc3339(row.joined_at),
        })
    })
    .collect())
}

/// `DELETE /api/account` with `{ "email": "<the account's e-mail>" }` as confirmation.
#[expect(
    clippy::too_many_lines,
    reason = "one statement per kind of data, written out so the deletion is easy to audit"
)]
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
    // A stolen session token must not be enough to erase an organization: the second step is
    // asked for whenever the account has one (ADR 0045).
    crate::two_factor::check(&state, &mut tx, user.id, body.two_factor_code.as_deref()).await?;
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
        // A referral row outlives the referred account only for its keyed e-mail hash (one
        // e-mail counts once, ADR 0076); the hint the referrer saw goes with the account.
        sqlx::query!(
            "update referrals set referred_email_hint = '' where referred_organization_id = $1",
            organization_id
        )
        .execute(&mut *tx)
        .await?;
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
               team as (delete from event_team where event_id in (select id from events)),
               links as (delete from ticket_links where event_id in (select id from events)),
               doors as (delete from door_accesses where event_id in (select id from events)),
               guests as (delete from guest_list where event_id in (select id from events)),
               files as (delete from exports where event_id in (select id from events)),
               notes as (update ticket_voids set note = null where event_id in (select id from events))
               update events set name = $2, venue = null, address = null, postpone_reason = null,
                             cancel_reason = null
               where organization_id = $1"#,
            organization_id,
            DELETED_EVENT,
        )
        .execute(&mut *tx)
        .await?;
        // Series names go with the event names (ADR 0077); the dates stay apart.
        sqlx::query!(
            "delete from event_series where organization_id = $1",
            organization_id
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
        // The public profile and the logo are personal too (ADR 0064); a refused logo stays
        // refused by its hash (`rejected_art`).
        sqlx::query!(
            "delete from organization_profiles where organization_id = $1",
            organization_id
        )
        .execute(&mut *tx)
        .await?;
        sqlx::query!(
            "delete from blobs where organization_id = $1",
            organization_id
        )
        .execute(&mut *tx)
        .await?;
        // A deleted organization refers nobody any more: its link stops working, and the people
        // it invited who have not paid yet earn alone, as when the organization is removed whole
        // (the foreign key sets the referrer to null).
        sqlx::query!(
            r#"update referrals set referrer_organization_id = null
               where referrer_organization_id = $1 and status = 'pending'"#,
            organization_id
        )
        .execute(&mut *tx)
        .await?;
        sqlx::query!(
            r#"update organizations set name = $2, bonus_free_tickets = 0, suspended_at = null,
                      suspended_reason = null, referral_code = null where id = $1"#,
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
    // The history of other organizations' events (ADR 0099) keeps the action, not the person.
    sqlx::query!(
        "update event_activity set actor_email = 'conta excluída', actor_name = null where user_id = $1",
        user.id
    )
    .execute(&mut *tx)
    .await?;
    // Nothing of the person stays on the row: no second-factor secret, no recovery codes, no
    // notifications, no memberships beyond the anonymized organizations' owner row.
    // Off every event team, including invites still waiting for this e-mail (ADR 0055).
    sqlx::query!(
        "delete from event_team where user_id = $1 or email = $2",
        user.id,
        user.email
    )
    .execute(&mut *tx)
    .await?;
    sqlx::query!("delete from recovery_codes where user_id = $1", user.id)
        .execute(&mut *tx)
        .await?;
    sqlx::query!("delete from notifications where user_id = $1", user.id)
        .execute(&mut *tx)
        .await?;
    sqlx::query!(
        "delete from announcement_receipts where user_id = $1",
        user.id
    )
    .execute(&mut *tx)
    .await?;
    sqlx::query!(
        r#"delete from memberships m where m.user_id = $1
           and not exists (select 1 from organizations o where o.id = m.organization_id and o.name = $2)"#,
        user.id,
        DELETED_ORGANIZATION,
    )
    .execute(&mut *tx)
    .await?;
    sqlx::query!(
        r#"update users set email = $2, name = null, google_sub = null, terms_version = null,
                  terms_accepted_at = null, last_login_at = null,
                  totp_secret = null, totp_enabled_at = null, totp_last_step = null
           where id = $1"#,
        user.id,
        placeholder,
    )
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    tracing::info!(user_id = %user.id, "account deleted at the holder's request");
    Ok(StatusCode::NO_CONTENT)
}
