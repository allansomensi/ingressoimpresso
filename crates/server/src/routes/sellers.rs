//! Sellers and the ranges they hold.

use std::collections::HashMap;

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use uuid::Uuid;

use super::{
    EventAccess, authorize_event, bounds, event_access, is_issued, one_line, optional_text, range,
};
use crate::api::{
    AssignRemainingBody, AvailableNumbersDto, CommissionBody, CommissionDto, CommissionKind,
    NumberRangeDto, RangeBody, RangeDto, SellerBody, SellerDto, TeamArea,
};
use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult, bad_request};
use crate::state::AppState;

fn validate(body: &SellerBody) -> ApiResult<(String, Option<String>)> {
    let name = body.name.trim().to_owned();
    if name.is_empty() || name.chars().count() > 60 {
        return Err(bad_request(
            "invalid_name",
            "name must have 1-60 characters",
        ));
    }
    one_line(&name, "invalid_name")?;
    let phone = optional_text(body.phone.clone());
    if phone
        .as_ref()
        .is_some_and(|phone| phone.chars().count() > 30)
    {
        return Err(bad_request(
            "invalid_phone",
            "phone must have up to 30 characters",
        ));
    }
    if let Some(phone) = &phone {
        one_line(phone, "invalid_phone")?;
    }
    Ok((name, phone))
}

/// `GET /api/events/{id}/sellers`. The sellers' links are credentials (ADR 0053: whoever has
/// one marks sales, reserves numbers and sends digital tickets as that seller), so they come
/// back only to who may hand them out: the organization and the team's `delivery` people.
pub async fn list(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
) -> ApiResult<Json<Vec<SellerDto>>> {
    let access = event_access(&state.pool, &user, event_id).await?;
    let sellers = sqlx::query!(
        r#"select id, name, phone, box_office, cashier, goal, pix_key_type, pix_key, pix_name, pix_city,
                  commission_kind, commission_value
           from sellers where event_id = $1 order by name"#,
        event_id
    )
    .fetch_all(&state.pool)
    .await?;
    let assignments = sqlx::query!(
        "select id, seller_id, numbers from seller_assignments where event_id = $1 order by lower(numbers)",
        event_id
    )
    .fetch_all(&state.pool)
    .await?;
    let mut links = if access.can(TeamArea::Delivery) {
        super::seller_links::active_links(&state, event_id).await?
    } else {
        HashMap::new()
    };
    let mut ranges: HashMap<Uuid, Vec<RangeDto>> = HashMap::new();
    for assignment in assignments {
        let (first, last) = bounds(&assignment.numbers)?;
        ranges
            .entry(assignment.seller_id)
            .or_default()
            .push(RangeDto {
                id: assignment.id,
                first,
                last,
            });
    }
    Ok(Json(
        sellers
            .into_iter()
            .map(|seller| SellerDto {
                ranges: ranges.remove(&seller.id).unwrap_or_default(),
                link: links.remove(&seller.id),
                id: seller.id,
                name: seller.name,
                phone: seller.phone,
                box_office: seller.box_office,
                cashier: seller.cashier,
                goal: seller.goal,
                pix: super::pix::account(
                    seller.pix_key_type.as_deref(),
                    seller.pix_key,
                    seller.pix_name,
                    seller.pix_city,
                ),
                commission: super::report::commission(
                    seller.commission_kind.as_deref(),
                    seller.commission_value,
                ),
            })
            .collect(),
    ))
}

/// A box office counts as sold what entered (ADR 0069); a ficha is bought at the cashier and used
/// later, or never, at a stall: consumption tokens have no box office (ADR 0084).
fn no_box_office_for_tokens(event: &super::EventRow) -> ApiResult<()> {
    if event.tokens() {
        return Err(bad_request(
            "box_office_tokens",
            "consumption tokens have no box office",
        ));
    }
    Ok(())
}

/// The token cashier (ADR 0098) sells fichas on the spot; a ticket event has the box office.
fn cashier_only_for_tokens(event: &super::EventRow) -> ApiResult<()> {
    if event.tokens() {
        Ok(())
    } else {
        Err(bad_request(
            "cashier_tickets",
            "only consumption tokens have a cashier",
        ))
    }
}

/// `POST /api/events/{id}/sellers`.
pub async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
    Json(body): Json<SellerBody>,
) -> ApiResult<(StatusCode, Json<SellerDto>)> {
    let access = event_access(&state.pool, &user, event_id).await?;
    let (name, phone) = validate(&body)?;
    let box_office = body.box_office.unwrap_or(false);
    if box_office {
        need_money(&access)?;
        no_box_office_for_tokens(&access.event)?;
    }
    let cashier = body.cashier.unwrap_or(false);
    if cashier {
        need_money(&access)?;
        cashier_only_for_tokens(&access.event)?;
    }
    let id = Uuid::new_v4();
    sqlx::query!(
        "insert into sellers (id, event_id, name, phone, box_office, cashier) values ($1, $2, $3, $4, $5, $6)",
        id,
        event_id,
        name,
        phone,
        box_office,
        cashier,
    )
    .execute(&state.pool)
    .await
    .map_err(|error| match ApiError::from(error) {
        ApiError::Conflict(..) => {
            ApiError::Conflict("seller_exists", "a seller with this name exists".to_owned())
        }
        other => other,
    })?;
    Ok((
        StatusCode::CREATED,
        Json(SellerDto {
            id,
            name,
            phone,
            ranges: Vec::new(),
            link: None,
            box_office,
            goal: None,
            pix: None,
            commission: None,
            cashier,
        }),
    ))
}

/// The box office (ADR 0069) changes what a seller owes, so choosing it is the money part's call
/// on the team, beyond the delivery part that edits sellers.
fn need_money(access: &EventAccess) -> ApiResult<()> {
    if access.can(TeamArea::Money) {
        Ok(())
    } else {
        Err(ApiError::Refused(
            "not_your_area",
            "another person of the team takes care of this".to_owned(),
        ))
    }
}

async fn seller_event(state: &AppState, user: &AuthUser, seller_id: Uuid) -> ApiResult<Uuid> {
    let event_id = sqlx::query_scalar!("select event_id from sellers where id = $1", seller_id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or(ApiError::NotFound)?;
    authorize_event(&state.pool, user, event_id).await?;
    Ok(event_id)
}

/// `PUT /api/sellers/{id}`.
pub async fn update(
    State(state): State<AppState>,
    user: AuthUser,
    Path(seller_id): Path<Uuid>,
    Json(body): Json<SellerBody>,
) -> ApiResult<StatusCode> {
    let event_id = sqlx::query_scalar!("select event_id from sellers where id = $1", seller_id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or(ApiError::NotFound)?;
    let access = event_access(&state.pool, &user, event_id).await?;
    let (name, phone) = validate(&body)?;
    // A missing `boxOffice` keeps the current choice (ADR 0069). A box office has no goal and no
    // reservations (ADRs 0072, 0073): turning it on drops them.
    let mut tx = state.pool.begin().await?;
    // Turning the box office on or off changes what the seller owes (their entries instead of the
    // numbers they kept): money matters, beyond the delivery part that edits the seller.
    if body.box_office == Some(true) {
        no_box_office_for_tokens(&access.event)?;
    }
    if let Some(wanted) = body.box_office {
        let current = sqlx::query_scalar!(
            "select box_office from sellers where id = $1 for update",
            seller_id
        )
        .fetch_one(&mut *tx)
        .await?;
        if wanted != current {
            need_money(&access)?;
        }
    }
    // The cashier (ADR 0098) closes a drawer of the organization's money: the money part's call.
    if body.cashier == Some(true) {
        cashier_only_for_tokens(&access.event)?;
    }
    if let Some(wanted) = body.cashier {
        let current = sqlx::query_scalar!("select cashier from sellers where id = $1", seller_id)
            .fetch_one(&mut *tx)
            .await?;
        if wanted != current {
            need_money(&access)?;
        }
    }
    let box_office = sqlx::query_scalar!(
        r#"update sellers set name = $2, phone = $3, box_office = coalesce($4, box_office),
                              cashier = coalesce($5, cashier),
                              goal = case when coalesce($4, box_office) then null else goal end,
                              commission_kind = case when coalesce($4, box_office) then null else commission_kind end,
                              commission_value = case when coalesce($4, box_office) then null else commission_value end
           where id = $1 returning box_office"#,
        seller_id,
        name,
        phone,
        body.box_office,
        body.cashier,
    )
    .fetch_one(&mut *tx)
    .await?;
    if box_office {
        sqlx::query!(
            "delete from ticket_reservations where seller_id = $1",
            seller_id
        )
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

/// A commission within its limits (ADR 0096): 0.01–100% or R$ 0,01–10.000,00 per ticket.
fn check_commission(commission: Option<&CommissionDto>) -> ApiResult<()> {
    let Some(commission) = commission else {
        return Ok(());
    };
    let limit = match commission.kind {
        CommissionKind::Percent => 10_000,
        CommissionKind::PerTicket => 1_000_000,
    };
    if !(1..=limit).contains(&commission.value) {
        return Err(bad_request(
            "invalid_commission",
            format!("the commission must be 1–{limit}"),
        ));
    }
    Ok(())
}

/// `PUT /api/sellers/{id}/commission` (ADR 0096): what the seller keeps of what they sold; a
/// box office keeps nothing.
pub async fn set_commission(
    State(state): State<AppState>,
    user: AuthUser,
    Path(seller_id): Path<Uuid>,
    Json(body): Json<CommissionBody>,
) -> ApiResult<StatusCode> {
    seller_event(&state, &user, seller_id).await?;
    check_commission(body.commission.as_ref())?;
    let box_office = sqlx::query_scalar!("select box_office from sellers where id = $1", seller_id)
        .fetch_one(&state.pool)
        .await?;
    if box_office && body.commission.is_some() {
        return Err(bad_request(
            "commission_box_office",
            "a box office has no commission",
        ));
    }
    sqlx::query!(
        "update sellers set commission_kind = $2, commission_value = $3 where id = $1",
        seller_id,
        body.commission.as_ref().map(|c| c.kind.db()),
        body.commission.as_ref().map(|c| c.value),
    )
    .execute(&state.pool)
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// `POST /api/events/{id}/sellers/commission` (ADR 0096): the same commission for every seller
/// but the box office. Answers how many sellers changed.
pub async fn set_commission_all(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
    Json(body): Json<CommissionBody>,
) -> ApiResult<Json<u64>> {
    authorize_event(&state.pool, &user, event_id).await?;
    check_commission(body.commission.as_ref())?;
    let changed = sqlx::query!(
        "update sellers set commission_kind = $2, commission_value = $3 where event_id = $1 and not box_office",
        event_id,
        body.commission.as_ref().map(|c| c.kind.db()),
        body.commission.as_ref().map(|c| c.value),
    )
    .execute(&state.pool)
    .await?
    .rows_affected();
    Ok(Json(changed))
}

/// `DELETE /api/sellers/{id}` (also removes their ranges).
pub async fn delete(
    State(state): State<AppState>,
    user: AuthUser,
    Path(seller_id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    seller_event(&state, &user, seller_id).await?;
    sqlx::query!("delete from sellers where id = $1", seller_id)
        .execute(&state.pool)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// `POST /api/sellers/{id}/ranges`: the range must be issued and free (exclusion constraint).
pub async fn assign(
    State(state): State<AppState>,
    user: AuthUser,
    Path(seller_id): Path<Uuid>,
    Json(body): Json<RangeBody>,
) -> ApiResult<(StatusCode, Json<RangeDto>)> {
    let event_id = seller_event(&state, &user, seller_id).await?;
    let numbers = range(body.first, body.last)?;
    if !is_issued(&state.pool, event_id, &numbers).await? {
        return Err(bad_request(
            "range_not_issued",
            "every number must belong to a batch",
        ));
    }
    let id = Uuid::new_v4();
    sqlx::query!(
        "insert into seller_assignments (id, event_id, seller_id, numbers) values ($1, $2, $3, $4)",
        id,
        event_id,
        seller_id,
        numbers
    )
    .execute(&state.pool)
    .await?;
    Ok((
        StatusCode::CREATED,
        Json(RangeDto {
            id,
            first: body.first,
            last: body.last,
        }),
    ))
}

/// Most ranges one "the rest" assignment creates: a very scattered rest is split by hand.
const MAX_REMAINING_RANGES: usize = 500;

/// Issued numbers that are still free: in a batch that was not canceled, held by no seller, not
/// cancelled (an active void) and not sent by the organization as a digital ticket. With
/// `category`, only its numbers (ADR 0056). In order, as inclusive bounds.
async fn free_numbers(
    executor: impl sqlx::PgExecutor<'_>,
    event_id: Uuid,
    category: Option<Uuid>,
) -> ApiResult<Vec<(i32, i32)>> {
    // Multiranges (Postgres 14+) do the set arithmetic without walking every number.
    let rows = sqlx::query_scalar!(
        r#"with
             issued as (select coalesce(range_agg(numbers), '{}') as m from ticket_batches
                        where event_id = $1 and status <> 'canceled'),
             held as (select coalesce(range_agg(numbers), '{}') as m from seller_assignments
                      where event_id = $1),
             voided as (select coalesce(range_agg(numbers), '{}') as m from ticket_voids
                        where event_id = $1 and undone_at is null),
             sent as (select coalesce(range_agg(int4range(ticket_number, ticket_number + 1)), '{}') as m
                      from ticket_links where event_id = $1 and revoked_at is null),
             scope as (select case when $2::uuid is null then '{(,)}'::int4multirange
                              else coalesce((select range_agg(numbers) from category_ranges
                                             where event_id = $1 and category_id = $2), '{}')
                              end as m)
           select free as "free!" from unnest(
             ((select m from issued) - (select m from held) - (select m from voided)
              - (select m from sent)) * (select m from scope)
           ) as free"#,
        event_id,
        category,
    )
    .fetch_all(executor)
    .await?;
    rows.iter().map(bounds).collect()
}

#[derive(Debug, serde::Deserialize)]
pub struct AvailableQuery {
    category: Option<Uuid>,
}

/// `GET /api/events/{id}/available-numbers[?category=]`: what "the rest" would give a seller.
pub async fn available(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
    Query(query): Query<AvailableQuery>,
) -> ApiResult<Json<AvailableNumbersDto>> {
    authorize_event(&state.pool, &user, event_id).await?;
    let ranges = free_numbers(&state.pool, event_id, query.category).await?;
    let count = ranges.iter().map(|(first, last)| last - first + 1).sum();
    Ok(Json(AvailableNumbersDto {
        ranges: ranges
            .into_iter()
            .map(|(first, last)| NumberRangeDto { first, last })
            .collect(),
        count,
    }))
}

/// `POST /api/sellers/{id}/ranges/remaining`: every free number (of a category, optionally)
/// goes to the seller in one go, typically the box office (ADR 0069) taking what the sellers
/// did not. The exclusion constraint still guards against a concurrent assignment.
pub async fn assign_remaining(
    State(state): State<AppState>,
    user: AuthUser,
    Path(seller_id): Path<Uuid>,
    Json(body): Json<AssignRemainingBody>,
) -> ApiResult<(StatusCode, Json<Vec<RangeDto>>)> {
    let event_id = seller_event(&state, &user, seller_id).await?;
    if let Some(category) = body.category_id {
        sqlx::query_scalar!(
            "select id from ticket_categories where id = $1 and event_id = $2",
            category,
            event_id
        )
        .fetch_optional(&state.pool)
        .await?
        .ok_or_else(|| bad_request("unknown_category", "unknown category"))?;
    }
    let mut tx = state.pool.begin().await?;
    let free = free_numbers(&mut *tx, event_id, body.category_id).await?;
    if free.is_empty() {
        return Err(ApiError::Conflict(
            "no_free_numbers",
            "every issued number already has a destination".to_owned(),
        ));
    }
    if free.len() > MAX_REMAINING_RANGES {
        return Err(ApiError::Conflict(
            "too_scattered",
            format!("the free numbers form more than {MAX_REMAINING_RANGES} ranges"),
        ));
    }
    let mut created = Vec::with_capacity(free.len());
    for (first, last) in free {
        let id = Uuid::new_v4();
        sqlx::query!(
            "insert into seller_assignments (id, event_id, seller_id, numbers) values ($1, $2, $3, $4)",
            id,
            event_id,
            seller_id,
            range(first, last)?,
        )
        .execute(&mut *tx)
        .await?;
        created.push(RangeDto { id, first, last });
    }
    tx.commit().await?;
    Ok((StatusCode::CREATED, Json(created)))
}

/// `DELETE /api/ranges/{id}`.
pub async fn unassign(
    State(state): State<AppState>,
    user: AuthUser,
    Path(range_id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    let row = sqlx::query!(
        "select event_id, numbers from seller_assignments where id = $1",
        range_id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound)?;
    authorize_event(&state.pool, &user, row.event_id).await?;
    let mut tx = state.pool.begin().await?;
    sqlx::query!("delete from seller_assignments where id = $1", range_id)
        .execute(&mut *tx)
        .await?;
    // Sales marked on numbers the seller no longer holds would count for nobody.
    super::seller_links::clear_marks(&mut tx, row.event_id, &row.numbers).await?;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}
