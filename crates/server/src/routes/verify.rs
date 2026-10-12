//! Check a ticket before buying it (ADR 0075). Anyone with a ticket in hand (or a photo of it)
//! asks whether its QR is one we issued: the server reads the event from the QR's tag, checks the
//! signature with the event's public keys (the same `ticket-core` as the door) and answers with
//! the event, the printed number and its category.
//!
//! What it never says: whether the ticket already entered (that would tell a scalper which copies
//! still work) nor who has it. An authentic QR can still be a copy: the page says so. The event's
//! details only come back for a valid signature, so the endpoint lists nothing to someone without
//! a real ticket; it is limited per address, and the organizer may turn it off per event.

use axum::Json;
use axum::extract::{Path, State};
use axum::http::HeaderMap;
use ticket_core::{
    EventId, EventKey, EventPublicKey, EventTag, EventVerifier, KeyId, SignedTicket,
};
use time::OffsetDateTime;
use uuid::Uuid;

use super::{EventRow, authorize_event};
use crate::api::{
    DoorCategoryTagDto, VerifiedEventDto, VerifiedTicketDto, VerifyResultDto, VerifySettingsDto,
    VerifyTicketBody, VerifyVerdict,
};
use crate::auth::AuthUser;
use crate::error::ApiResult;
use crate::ratelimit;
use crate::state::AppState;

/// Longest text looked at (a v1 QR has about 111 characters).
const MAX_TEXT: usize = 512;

fn answer(verdict: VerifyVerdict) -> Json<VerifyResultDto> {
    Json(VerifyResultDto {
        verdict,
        ticket: None,
    })
}

fn core_status(status: &str) -> Option<ticket_core::KeyStatus> {
    match status {
        "active" => Some(ticket_core::KeyStatus::Active),
        "retired" => Some(ticket_core::KeyStatus::Retired),
        "revoked" => Some(ticket_core::KeyStatus::Revoked),
        _ => None,
    }
}

/// The event's verifier, from its public keys.
async fn verifier(state: &AppState, event_id: Uuid, tag: u32) -> ApiResult<Option<EventVerifier>> {
    let keys = sqlx::query!(
        "select key_id, public_key, status from event_signing_keys where event_id = $1",
        event_id
    )
    .fetch_all(&state.pool)
    .await?
    .into_iter()
    .filter_map(|row| {
        let bytes: [u8; 32] = row.public_key.try_into().ok()?;
        Some(EventKey {
            key_id: KeyId::new(u8::try_from(row.key_id).ok()?),
            public_key: EventPublicKey::from_bytes(&bytes).ok()?,
            status: core_status(&row.status)?,
        })
    })
    .collect();
    Ok(EventVerifier::new(EventId::from(event_id), EventTag::new(tag), keys).ok())
}

/// What an authentic ticket of an event is now, most important first.
pub(crate) fn verdict(
    event_canceled: bool,
    ticket_canceled: bool,
    ends_at: OffsetDateTime,
    postponed: bool,
    now: OffsetDateTime,
) -> VerifyVerdict {
    if event_canceled {
        VerifyVerdict::EventCanceled
    } else if ticket_canceled {
        VerifyVerdict::TicketCanceled
    } else if ends_at <= now {
        VerifyVerdict::EventOver
    } else if postponed {
        VerifyVerdict::EventPostponed
    } else {
        VerifyVerdict::Valid
    }
}

/// `POST /api/verify` (no login): what a QR is. The text goes in the body, out of access logs.
pub async fn verify(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<VerifyTicketBody>,
) -> ApiResult<Json<VerifyResultDto>> {
    ratelimit::by_ip(&state, &headers, ratelimit::VERIFY).await?;
    let text = body.text.trim();
    if text.len() > MAX_TEXT {
        return Ok(answer(VerifyVerdict::NotOurs));
    }
    let Ok(ticket) = SignedTicket::from_qr_text(text) else {
        return Ok(answer(VerifyVerdict::NotOurs));
    };
    let tag = ticket.header().event_tag.get();
    let Some(event) = sqlx::query_as!(
        EventRow,
        r#"select id, name, venue, starts_at, ends_at, ticket_price_cents, status, qr_tag,
                  utc_offset_minutes, address, postponed_from_starts_at, postponed_at,
                  postpone_reason, canceled_at, cancel_reason
           from events where qr_tag = $1"#,
        i64::from(tag)
    )
    .fetch_optional(&state.pool)
    .await?
    else {
        return Ok(answer(VerifyVerdict::NotOurs));
    };
    let Some(verified) = verifier(&state, event.id, tag)
        .await?
        .and_then(|verifier| verifier.verify(&ticket).ok())
    else {
        return Ok(answer(VerifyVerdict::NotOurs));
    };
    let Ok(number) = i32::try_from(verified.number().get()) else {
        return Ok(answer(VerifyVerdict::NotOurs));
    };
    let row = sqlx::query!(
        r#"select e.public_verify, e.organization_id,
                  exists(select 1 from ticket_voids v where v.event_id = e.id and v.undone_at is null
                         and v.numbers @> $2::int4) as "voided!"
           from events e where e.id = $1"#,
        event.id,
        number
    )
    .fetch_one(&state.pool)
    .await?;
    if !row.public_verify {
        return Ok(answer(VerifyVerdict::Private));
    }
    let (prefix, digits) = super::tickets::number_style(&state, event.id).await?;
    let tags = super::categories::NumberTags::load(&state.pool, event.id).await?;
    let offset = event.offset();
    let result = VerifyResultDto {
        verdict: verdict(
            event.canceled_at.is_some(),
            row.voided,
            event.ends_at,
            event.postponed_from_starts_at.is_some(),
            OffsetDateTime::now_utc(),
        ),
        ticket: Some(VerifiedTicketDto {
            organization: super::organization::public_organization(
                &state.pool,
                row.organization_id,
            )
            .await?,
            number,
            number_label: format!("{number:0width$}", width = usize::from(digits)),
            number_prefix: prefix,
            category: tags.category(number).map(|category| DoorCategoryTagDto {
                name: category.name,
                color: category.color,
            }),
            event: VerifiedEventDto {
                change: event.change(),
                name: event.name,
                venue: event.venue,
                address: event.address,
                starts_at: event.starts_at.to_offset(offset),
                ends_at: event.ends_at.to_offset(offset),
            },
        }),
    };
    Ok(Json(result))
}

/// `GET /api/events/{id}/verify-settings`.
pub async fn settings(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
) -> ApiResult<Json<VerifySettingsDto>> {
    authorize_event(&state.pool, &user, event_id).await?;
    let public_verify =
        sqlx::query_scalar!("select public_verify from events where id = $1", event_id)
            .fetch_one(&state.pool)
            .await?;
    Ok(Json(VerifySettingsDto { public_verify }))
}

/// `PUT /api/events/{id}/verify-settings` (delivery, like the digital tickets).
pub async fn update_settings(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
    Json(body): Json<VerifySettingsDto>,
) -> ApiResult<Json<VerifySettingsDto>> {
    authorize_event(&state.pool, &user, event_id).await?;
    sqlx::query!(
        "update events set public_verify = $2 where id = $1",
        event_id,
        body.public_verify
    )
    .execute(&state.pool)
    .await?;
    Ok(Json(body))
}

#[cfg(test)]
mod tests {
    use time::Duration;

    use super::*;

    #[test]
    fn the_most_important_state_wins() {
        let now = OffsetDateTime::UNIX_EPOCH + Duration::days(1_000);
        let later = now + Duration::days(3);
        let before = now - Duration::hours(1);
        assert_eq!(
            verdict(false, false, later, false, now),
            VerifyVerdict::Valid
        );
        assert_eq!(
            verdict(false, false, later, true, now),
            VerifyVerdict::EventPostponed
        );
        assert_eq!(
            verdict(false, false, before, true, now),
            VerifyVerdict::EventOver
        );
        assert_eq!(
            verdict(false, true, before, true, now),
            VerifyVerdict::TicketCanceled
        );
        assert_eq!(
            verdict(true, true, later, false, now),
            VerifyVerdict::EventCanceled
        );
    }
}
