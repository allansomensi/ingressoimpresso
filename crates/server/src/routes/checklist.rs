//! What is missing before the event (ADR 0078): a checklist worked out on the server from what
//! the event already has, in the order the work goes, with the team area that takes care of each
//! item. The facts of any number of events come from one query, so the event list shows "faltam
//! 3" on every card without a request per event.

use std::collections::HashMap;

use axum::Json;
use axum::extract::{Path, State};
use sqlx::PgPool;
use time::OffsetDateTime;
use uuid::Uuid;

use super::{EventRow, event_access};
use crate::api::{
    ChecklistDto, ChecklistHint, ChecklistItemDto, ChecklistKey, ChecklistProgressDto,
    ChecklistState, TeamArea,
};
use crate::auth::AuthUser;
use crate::error::ApiResult;
use crate::state::AppState;

/// What the checklist is made of, for one event.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
#[expect(
    clippy::struct_excessive_bools,
    reason = "one yes or no per thing the event has"
)]
pub(crate) struct Facts {
    pub has_venue: bool,
    pub has_address: bool,
    pub designed: bool,
    /// Images of the latest design (art and sponsors' logos), and how many are flagged or
    /// refused (ADR 0042).
    pub images: i64,
    pub flagged: i64,
    pub rejected: i64,
    pub categories: bool,
    pub paid: bool,
    /// Sellers with numbers; those of them who use a private link (the box office does not,
    /// ADR 0069), and how many of these have an active one.
    pub sellers: i32,
    pub link_sellers: i32,
    pub linked: i32,
    /// Files generated or digital tickets sent.
    pub delivered: bool,
    /// An open door link.
    pub door_link: bool,
    /// Registered phones, and whether one of them rehearsed (ADR 0067).
    pub devices: bool,
    pub rehearsed: bool,
    pub guests: bool,
    pub public_verify: bool,
    /// The organization's profile has a WhatsApp or a contact e-mail (ADR 0064).
    pub contact: bool,
    /// Consumption tokens (ADR 0084): products are needed, a guest list is not.
    pub tokens: bool,
}

/// Whether the checklist applies: the event has not ended and is neither archived nor
/// canceled.
pub(crate) fn applies(event: &EventRow, now: OffsetDateTime) -> bool {
    event.status == "active" && event.canceled_at.is_none() && event.ends_at > now
}

/// The facts of every event of `ids`, in one query.
pub(crate) async fn facts(pool: &PgPool, ids: &[Uuid]) -> ApiResult<HashMap<Uuid, Facts>> {
    if ids.is_empty() {
        return Ok(HashMap::new());
    }
    let rows = sqlx::query!(
        r#"select e.id,
                  e.venue is not null as "has_venue!",
                  e.address is not null as "has_address!",
                  e.public_verify,
                  e.kind = 'tokens' as "tokens!",
                  d.found is not null as "designed!",
                  coalesce(art.images, 0) as "images!",
                  coalesce(art.flagged, 0) as "flagged!",
                  coalesce(art.rejected, 0) as "rejected!",
                  exists(select 1 from ticket_categories c where c.event_id = e.id) as "categories!",
                  exists(select 1 from ticket_batches b where b.event_id = e.id and b.status = 'paid') as "paid!",
                  (select count(distinct a.seller_id) from seller_assignments a
                   where a.event_id = e.id)::int4 as "sellers!",
                  (select count(distinct a.seller_id) from seller_assignments a
                   join sellers s on s.id = a.seller_id and not s.box_office
                   where a.event_id = e.id)::int4 as "link_sellers!",
                  (select count(distinct a.seller_id) from seller_assignments a
                   join sellers s on s.id = a.seller_id and not s.box_office
                   where a.event_id = e.id
                     and exists(select 1 from seller_links l
                                where l.seller_id = a.seller_id and l.revoked_at is null))::int4 as "linked!",
                  (exists(select 1 from exports x where x.event_id = e.id and x.status = 'done')
                   or exists(select 1 from ticket_links l where l.event_id = e.id and l.revoked_at is null)) as "delivered!",
                  exists(select 1 from door_accesses a where a.event_id = e.id
                         and a.revoked_at is null and a.expires_at > now()) as "door_link!",
                  exists(select 1 from door_devices v where v.event_id = e.id and v.revoked_at is null) as "devices!",
                  exists(select 1 from door_devices v where v.event_id = e.id and v.revoked_at is null
                         and v.rehearsed_at is not null) as "rehearsed!",
                  exists(select 1 from guest_list g where g.event_id = e.id) as "guests!",
                  exists(select 1 from organization_profiles p where p.organization_id = e.organization_id
                         and (p.whatsapp is not null or p.contact_email is not null)) as "contact!"
           from events e
           left join lateral (select true as found, t.art_blob_id, t.sponsor_blob_ids
                              from ticket_designs t where t.event_id = e.id
                              order by t.version desc limit 1) d on true
           left join lateral (select count(*) as images,
                                     count(*) filter (where b.moderation_status = 'flagged') as flagged,
                                     count(*) filter (where b.moderation_status = 'rejected') as rejected
                              from blobs b
                              where b.id = d.art_blob_id or b.id = any(d.sponsor_blob_ids)) art on true
           where e.id = any($1)"#,
        ids
    )
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|row| {
            (
                row.id,
                Facts {
                    has_venue: row.has_venue,
                    has_address: row.has_address,
                    designed: row.designed,
                    images: row.images,
                    flagged: row.flagged,
                    rejected: row.rejected,
                    categories: row.categories,
                    paid: row.paid,
                    sellers: row.sellers,
                    link_sellers: row.link_sellers,
                    linked: row.linked,
                    delivered: row.delivered,
                    door_link: row.door_link,
                    devices: row.devices,
                    rehearsed: row.rehearsed,
                    guests: row.guests,
                    public_verify: row.public_verify,
                    contact: row.contact,
                    tokens: row.tokens,
                },
            )
        })
        .collect())
}

/// Required items still missing of each event of `events` the checklist applies to (the event
/// list's "faltam 3"); one query whatever the number of events.
pub(crate) async fn missing_counts(
    pool: &PgPool,
    events: &[&EventRow],
) -> ApiResult<HashMap<Uuid, i32>> {
    let now = OffsetDateTime::now_utc();
    let ids: Vec<Uuid> = events
        .iter()
        .filter(|event| applies(event, now))
        .map(|event| event.id)
        .collect();
    Ok(facts(pool, &ids)
        .await?
        .into_iter()
        .map(|(id, facts)| (id, missing(&items(&facts, |_| false))))
        .collect())
}

/// One item: `area` takes care of it (`None`: the organization's own people).
fn item(
    key: ChecklistKey,
    area: Option<TeamArea>,
    optional: bool,
    state: ChecklistState,
    can: &impl Fn(Option<TeamArea>) -> bool,
) -> ChecklistItemDto {
    ChecklistItemDto {
        key,
        state,
        optional,
        area,
        can_act: can(area),
        progress: None,
        hint: None,
    }
}

fn done_or(done: bool, otherwise: ChecklistState) -> ChecklistState {
    if done {
        ChecklistState::Done
    } else {
        otherwise
    }
}

/// The checklist of one event, in the order the work goes. `can` says whether the user may act
/// on an area (`None`: the organization's own people).
#[expect(
    clippy::too_many_lines,
    reason = "the whole list in order reads better than split"
)]
pub(crate) fn items(
    facts: &Facts,
    can: impl Fn(Option<TeamArea>) -> bool,
) -> Vec<ChecklistItemDto> {
    use ChecklistKey as Key;
    use ChecklistState::{Missing, NotApplicable, Optional};
    let required = |done: bool| done_or(done, Missing);
    let optional = |done: bool| done_or(done, Optional);

    let mut details = item(
        Key::Details,
        Some(TeamArea::Manage),
        false,
        required(facts.has_venue && facts.has_address),
        &can,
    );
    details.hint = match (facts.has_venue, facts.has_address) {
        (false, false) => Some(ChecklistHint::NoVenueNorAddress),
        (false, true) => Some(ChecklistHint::NoVenue),
        (true, false) => Some(ChecklistHint::NoAddress),
        (true, true) => None,
    };
    let mut art = item(
        Key::Art,
        Some(TeamArea::Art),
        false,
        if facts.images == 0 {
            NotApplicable
        } else {
            required(facts.flagged == 0 && facts.rejected == 0)
        },
        &can,
    );
    art.hint = if facts.images == 0 {
        None
    } else if facts.rejected > 0 {
        Some(ChecklistHint::ArtRejected)
    } else if facts.flagged > 0 {
        Some(ChecklistHint::ArtUnderReview)
    } else {
        None
    };
    let mut links = item(
        Key::SellerLinks,
        Some(TeamArea::Delivery),
        false,
        if facts.link_sellers == 0 {
            NotApplicable
        } else {
            required(facts.linked >= facts.link_sellers)
        },
        &can,
    );
    if facts.link_sellers > 0 {
        links.progress = Some(ChecklistProgressDto {
            done: facts.linked.min(facts.link_sellers),
            total: facts.link_sellers,
        });
    }
    // A nice-to-have: the door works without it, so it never counts as missing.
    let mut rehearsal = item(
        Key::Rehearsal,
        Some(TeamArea::Door),
        true,
        optional(facts.rehearsed),
        &can,
    );
    if !facts.rehearsed && !facts.devices {
        rehearsal.hint = Some(ChecklistHint::NoDevices);
    }

    vec![
        details,
        item(
            Key::Design,
            Some(TeamArea::Art),
            false,
            required(facts.designed),
            &can,
        ),
        art,
        // A ficha says which product it buys: a token event needs its products (ADR 0084).
        item(
            Key::Categories,
            Some(TeamArea::Manage),
            !facts.tokens,
            if facts.tokens {
                required(facts.categories)
            } else {
                optional(facts.categories)
            },
            &can,
        ),
        item(
            Key::Batch,
            Some(TeamArea::Manage),
            false,
            required(facts.paid),
            &can,
        ),
        item(
            Key::Sellers,
            Some(TeamArea::Delivery),
            true,
            optional(facts.sellers > 0),
            &can,
        ),
        links,
        item(
            Key::Delivery,
            Some(TeamArea::Delivery),
            false,
            required(facts.delivered),
            &can,
        ),
        item(
            Key::DoorLink,
            Some(TeamArea::Door),
            false,
            required(facts.door_link),
            &can,
        ),
        rehearsal,
        item(
            Key::Guests,
            Some(TeamArea::Door),
            true,
            if facts.tokens {
                NotApplicable
            } else {
                optional(facts.guests)
            },
            &can,
        ),
        item(
            Key::PublicVerify,
            Some(TeamArea::Delivery),
            true,
            optional(facts.public_verify),
            &can,
        ),
        item(
            Key::OrganizationContact,
            None,
            false,
            required(facts.contact),
            &can,
        ),
    ]
}

/// Required items not done.
pub(crate) fn missing(items: &[ChecklistItemDto]) -> i32 {
    let count = items
        .iter()
        .filter(|item| !item.optional && item.state == ChecklistState::Missing)
        .count();
    i32::try_from(count).unwrap_or(i32::MAX)
}

/// `GET /api/events/{id}/checklist`: what is missing before the event, read by the whole team;
/// each item says whether the user may act on it.
pub async fn checklist(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
) -> ApiResult<Json<ChecklistDto>> {
    let access = event_access(&state.pool, &user, event_id).await?;
    if !applies(&access.event, OffsetDateTime::now_utc()) {
        return Ok(Json(ChecklistDto {
            applies: false,
            missing: 0,
            required: 0,
            items: Vec::new(),
        }));
    }
    let facts = facts(&state.pool, &[event_id])
        .await?
        .remove(&event_id)
        .unwrap_or_default();
    let items = items(&facts, |area| match area {
        Some(area) => access.can(area),
        // The organization's profile is edited by its own people only (ADR 0064).
        None => access.is_owner(),
    });
    let required = items
        .iter()
        .filter(|item| !item.optional && item.state != ChecklistState::NotApplicable)
        .count();
    Ok(Json(ChecklistDto {
        applies: true,
        missing: missing(&items),
        required: i32::try_from(required).unwrap_or(i32::MAX),
        items,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ready() -> Facts {
        Facts {
            has_venue: true,
            has_address: true,
            designed: true,
            images: 1,
            flagged: 0,
            rejected: 0,
            categories: false,
            paid: true,
            sellers: 2,
            link_sellers: 2,
            linked: 2,
            delivered: true,
            door_link: true,
            devices: true,
            rehearsed: true,
            guests: false,
            public_verify: false,
            contact: true,
            tokens: false,
        }
    }

    #[test]
    fn token_events_need_products_and_no_guest_list() {
        let facts = Facts {
            tokens: true,
            ..ready()
        };
        let list = items(&facts, |_| true);
        assert_eq!(
            state_of(&list, ChecklistKey::Categories),
            ChecklistState::Missing
        );
        assert_eq!(
            state_of(&list, ChecklistKey::Guests),
            ChecklistState::NotApplicable
        );
        assert_eq!(missing(&list), 1);
        assert_eq!(
            state_of(&items(&ready(), |_| true), ChecklistKey::Categories),
            ChecklistState::Optional
        );
    }

    fn state_of(items: &[ChecklistItemDto], key: ChecklistKey) -> ChecklistState {
        items
            .iter()
            .find(|item| item.key == key)
            .map_or(ChecklistState::NotApplicable, |item| item.state)
    }

    #[test]
    fn a_ready_event_misses_nothing_and_optional_items_never_count() {
        let items = items(&ready(), |_| true);
        assert_eq!(missing(&items), 0);
        assert_eq!(
            state_of(&items, ChecklistKey::Categories),
            ChecklistState::Optional
        );
        assert_eq!(
            state_of(&items, ChecklistKey::Guests),
            ChecklistState::Optional
        );
        assert_eq!(
            state_of(&items, ChecklistKey::PublicVerify),
            ChecklistState::Optional
        );
    }

    #[test]
    fn a_new_event_misses_the_required_items() {
        let items = items(&Facts::default(), |_| true);
        // Details, design, batch, delivery, door link and the contact (the rehearsal is
        // optional); no images and no sellers: art and links do not apply.
        assert_eq!(missing(&items), 6);
        assert_eq!(
            state_of(&items, ChecklistKey::Rehearsal),
            ChecklistState::Optional
        );
        assert_eq!(
            state_of(&items, ChecklistKey::Art),
            ChecklistState::NotApplicable
        );
        assert_eq!(
            state_of(&items, ChecklistKey::SellerLinks),
            ChecklistState::NotApplicable
        );
        let details = items.iter().find(|item| item.key == ChecklistKey::Details);
        assert_eq!(
            details.and_then(|item| item.hint),
            Some(ChecklistHint::NoVenueNorAddress)
        );
        let rehearsal = items
            .iter()
            .find(|item| item.key == ChecklistKey::Rehearsal);
        assert_eq!(
            rehearsal.and_then(|item| item.hint),
            Some(ChecklistHint::NoDevices)
        );
    }

    #[test]
    fn a_box_office_needs_no_link() {
        let facts = Facts {
            sellers: 1,
            link_sellers: 0,
            linked: 0,
            ..ready()
        };
        let items = items(&facts, |_| true);
        let links = items
            .iter()
            .find(|item| item.key == ChecklistKey::SellerLinks)
            .map(|item| item.state);
        assert_eq!(links, Some(ChecklistState::NotApplicable));
    }

    #[test]
    fn art_under_review_and_sellers_without_links_are_missing() {
        let facts = Facts {
            flagged: 1,
            linked: 1,
            ..ready()
        };
        let items = items(&facts, |_| true);
        assert_eq!(missing(&items), 2);
        let art = items.iter().find(|item| item.key == ChecklistKey::Art);
        assert_eq!(
            art.and_then(|item| item.hint),
            Some(ChecklistHint::ArtUnderReview)
        );
        let links = items
            .iter()
            .find(|item| item.key == ChecklistKey::SellerLinks);
        assert_eq!(
            links.and_then(|item| item.progress.clone()),
            Some(ChecklistProgressDto { done: 1, total: 2 })
        );
    }

    #[test]
    fn a_team_member_acts_only_on_their_areas() {
        let items = items(&Facts::default(), |area| area == Some(TeamArea::Door));
        for item in &items {
            assert_eq!(
                item.can_act,
                item.area == Some(TeamArea::Door),
                "{:?}",
                item.key
            );
        }
        // The profile belongs to the organization.
        let contact = items
            .iter()
            .find(|item| item.key == ChecklistKey::OrganizationContact);
        assert_eq!(contact.map(|item| item.area), Some(None));
    }
}
