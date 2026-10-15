//! Ticket categories (ADR 0056): inteira, meia, VIP, cortesia… A category holds ranges of
//! numbers (planned before or after the batches are paid), a band colour printed on the ticket
//! and, optionally, its own price, which replaces the event's in the settlement.

use std::collections::HashMap;

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use sqlx::PgPool;
use uuid::Uuid;

use super::{authorize_event, bounds, one_line, range};
use crate::api::{CategoryBody, CategoryDto, RangeBody, RangeDto};
use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult, bad_request};
use crate::state::AppState;

/// Most categories per event.
pub const MAX_CATEGORIES: i64 = 12;
const MAX_NAME: usize = 30;
const MAX_PRICE_CENTS: i32 = 100_000_000;
/// Longest note on which documents count (ADR 0082): it has to fit the door's screen.
const MAX_DOCUMENT_NOTE: usize = 80;

/// A category's fields, checked.
struct ValidCategory {
    name: String,
    color: String,
    check_document: bool,
    document_note: Option<String>,
}

fn validate(body: &CategoryBody, tokens: bool) -> ApiResult<ValidCategory> {
    let name = body.name.trim().to_owned();
    if name.is_empty() || name.chars().count() > MAX_NAME {
        return Err(bad_request(
            "invalid_category_name",
            format!("name must have 1-{MAX_NAME} characters"),
        ));
    }
    one_line(&name, "invalid_category_name")?;
    let color = body.color.trim().to_ascii_lowercase();
    if color.len() != 7
        || !color.starts_with('#')
        || !color.chars().skip(1).all(|c| c.is_ascii_hexdigit())
    {
        return Err(bad_request("invalid_color", "colour must be #rrggbb"));
    }
    if body
        .price_cents
        .is_some_and(|price| !(0..=MAX_PRICE_CENTS).contains(&price))
    {
        return Err(bad_request("invalid_price", "price out of range"));
    }
    // A ficha is never asked for a document at a stall (ADR 0084).
    let check_document = body.check_document.unwrap_or(false) && !tokens;
    // A note without the check would never show: it is dropped with the check.
    let document_note = super::optional_text(body.document_note.clone()).filter(|_| check_document);
    if let Some(note) = &document_note {
        if note.chars().count() > MAX_DOCUMENT_NOTE {
            return Err(bad_request(
                "invalid_document_note",
                format!("note must have up to {MAX_DOCUMENT_NOTE} characters"),
            ));
        }
        one_line(note, "invalid_document_note")?;
    }
    Ok(ValidCategory {
        name,
        color,
        check_document,
        document_note,
    })
}

fn renamed(error: sqlx::Error) -> ApiError {
    match ApiError::from(error) {
        ApiError::Conflict("duplicate", _) => ApiError::Conflict(
            "category_exists",
            "a category with this name exists".to_owned(),
        ),
        other => other,
    }
}

/// Categories of an event with their ranges, in the order they were created.
pub(crate) async fn load(pool: &PgPool, event_id: Uuid) -> ApiResult<Vec<CategoryDto>> {
    let categories = sqlx::query!(
        r#"select id, name, color, price_cents, check_document, document_note
           from ticket_categories where event_id = $1 order by position, created_at"#,
        event_id
    )
    .fetch_all(pool)
    .await?;
    let mut ranges: HashMap<Uuid, Vec<RangeDto>> = HashMap::new();
    for row in sqlx::query!(
        "select id, category_id, numbers from category_ranges where event_id = $1 order by lower(numbers)",
        event_id
    )
    .fetch_all(pool)
    .await?
    {
        let (first, last) = bounds(&row.numbers)?;
        ranges.entry(row.category_id).or_default().push(RangeDto {
            id: row.id,
            first,
            last,
        });
    }
    Ok(categories
        .into_iter()
        .map(|row| CategoryDto {
            ranges: ranges.remove(&row.id).unwrap_or_default(),
            id: row.id,
            name: row.name,
            color: row.color,
            price_cents: row.price_cents,
            check_document: row.check_document,
            document_note: row.document_note,
        })
        .collect())
}

/// `GET /api/events/{id}/categories`.
pub async fn list(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
) -> ApiResult<Json<Vec<CategoryDto>>> {
    authorize_event(&state.pool, &user, event_id).await?;
    Ok(Json(load(&state.pool, event_id).await?))
}

/// `POST /api/events/{id}/categories`.
pub async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
    Json(body): Json<CategoryBody>,
) -> ApiResult<(StatusCode, Json<CategoryDto>)> {
    let event = authorize_event(&state.pool, &user, event_id).await?;
    let valid = validate(&body, event.tokens())?;
    let count = sqlx::query_scalar!(
        r#"select count(*) as "count!" from ticket_categories where event_id = $1"#,
        event_id
    )
    .fetch_one(&state.pool)
    .await?;
    if count >= MAX_CATEGORIES {
        return Err(ApiError::Conflict(
            "too_many_categories",
            format!("an event has at most {MAX_CATEGORIES} categories"),
        ));
    }
    let id = Uuid::new_v4();
    sqlx::query!(
        r#"insert into ticket_categories (id, event_id, name, color, price_cents, position,
                                         check_document, document_note)
           values ($1, $2, $3, $4, $5, $6, $7, $8)"#,
        id,
        event_id,
        valid.name,
        valid.color,
        body.price_cents,
        i16::try_from(count).unwrap_or(i16::MAX),
        valid.check_document,
        valid.document_note,
    )
    .execute(&state.pool)
    .await
    .map_err(renamed)?;
    Ok((
        StatusCode::CREATED,
        Json(CategoryDto {
            id,
            name: valid.name,
            color: valid.color,
            price_cents: body.price_cents,
            check_document: valid.check_document,
            document_note: valid.document_note,
            ranges: Vec::new(),
        }),
    ))
}

async fn category_event(state: &AppState, user: &AuthUser, category_id: Uuid) -> ApiResult<Uuid> {
    let event_id = sqlx::query_scalar!(
        "select event_id from ticket_categories where id = $1",
        category_id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound)?;
    authorize_event(&state.pool, user, event_id).await?;
    Ok(event_id)
}

/// `PUT /api/categories/{id}`.
pub async fn update(
    State(state): State<AppState>,
    user: AuthUser,
    Path(category_id): Path<Uuid>,
    Json(body): Json<CategoryBody>,
) -> ApiResult<StatusCode> {
    let event_id = category_event(&state, &user, category_id).await?;
    let tokens = sqlx::query_scalar!(
        r#"select kind = 'tokens' as "tokens!" from events where id = $1"#,
        event_id
    )
    .fetch_one(&state.pool)
    .await?;
    let valid = validate(&body, tokens)?;
    sqlx::query!(
        r#"update ticket_categories
           set name = $2, color = $3, price_cents = $4, check_document = $5, document_note = $6
           where id = $1"#,
        category_id,
        valid.name,
        valid.color,
        body.price_cents,
        valid.check_document,
        valid.document_note,
    )
    .execute(&state.pool)
    .await
    .map_err(renamed)?;
    Ok(StatusCode::NO_CONTENT)
}

/// `DELETE /api/categories/{id}`: its numbers go back to no category.
pub async fn delete(
    State(state): State<AppState>,
    user: AuthUser,
    Path(category_id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    category_event(&state, &user, category_id).await?;
    sqlx::query!("delete from ticket_categories where id = $1", category_id)
        .execute(&state.pool)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// `POST /api/categories/{id}/ranges`: numbers into the category (free of other categories).
pub async fn assign(
    State(state): State<AppState>,
    user: AuthUser,
    Path(category_id): Path<Uuid>,
    Json(body): Json<RangeBody>,
) -> ApiResult<(StatusCode, Json<RangeDto>)> {
    let event_id = category_event(&state, &user, category_id).await?;
    let numbers = range(body.first, body.last)?;
    let id = Uuid::new_v4();
    sqlx::query!(
        "insert into category_ranges (id, event_id, category_id, numbers) values ($1, $2, $3, $4)",
        id,
        event_id,
        category_id,
        numbers
    )
    .execute(&state.pool)
    .await
    .map_err(|error| match ApiError::from(error) {
        ApiError::Conflict("range_overlap", _) => ApiError::Conflict(
            "category_overlap",
            "some numbers already have a category".to_owned(),
        ),
        other => other,
    })?;
    Ok((
        StatusCode::CREATED,
        Json(RangeDto {
            id,
            first: body.first,
            last: body.last,
        }),
    ))
}

/// `DELETE /api/category-ranges/{id}`.
pub async fn unassign(
    State(state): State<AppState>,
    user: AuthUser,
    Path(range_id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    let event_id = sqlx::query_scalar!(
        "select event_id from category_ranges where id = $1",
        range_id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound)?;
    authorize_event(&state.pool, &user, event_id).await?;
    sqlx::query!("delete from category_ranges where id = $1", range_id)
        .execute(&state.pool)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// A category range as the files and the public pages need it.
#[derive(Debug, Clone)]
struct TaggedRange {
    first: i32,
    last: i32,
    category: ticket_render::TicketCategory,
    check_document: bool,
    document_note: Option<String>,
}

/// What each number prints and costs: category ranges with name, colour and price.
#[derive(Debug, Clone, Default)]
pub(crate) struct NumberTags {
    categories: Vec<TaggedRange>,
    seats: HashMap<i32, String>,
}

impl NumberTags {
    /// The category and seat of every number of an event.
    pub(crate) async fn load(pool: &PgPool, event_id: Uuid) -> ApiResult<Self> {
        let mut categories = Vec::new();
        for row in sqlx::query!(
            r#"select r.numbers, c.name, c.color, c.price_cents, c.check_document, c.document_note
               from category_ranges r
               join ticket_categories c on c.id = r.category_id where r.event_id = $1"#,
            event_id
        )
        .fetch_all(pool)
        .await?
        {
            let (first, last) = bounds(&row.numbers)?;
            categories.push(TaggedRange {
                first,
                last,
                category: ticket_render::TicketCategory {
                    name: row.name,
                    color: row.color,
                    price_cents: row.price_cents.map(i64::from),
                },
                check_document: row.check_document,
                document_note: row.document_note,
            });
        }
        let seats = sqlx::query!(
            r#"select s.ticket_number, s.seat, t.name from ticket_seats s
               join event_tables t on t.id = s.table_id
               where s.event_id = $1
                 -- A ficha has no seat (ADR 0084), even if the event once had tables.
                 and exists(select 1 from events e where e.id = $1 and e.kind = 'tickets')"#,
            event_id
        )
        .fetch_all(pool)
        .await?
        .into_iter()
        .map(|row| {
            (
                row.ticket_number,
                crate::texts::seat_label(&row.name, row.seat),
            )
        })
        .collect();
        Ok(Self { categories, seats })
    }

    fn range(&self, number: i32) -> Option<&TaggedRange> {
        self.categories
            .iter()
            .find(|range| range.first <= number && number <= range.last)
    }

    /// The category of `number`.
    pub(crate) fn category(&self, number: i32) -> Option<ticket_render::TicketCategory> {
        self.range(number).map(|range| range.category.clone())
    }

    /// The category of `number` as the public pages show it: name, colour and the document the
    /// door asks for (ADR 0082).
    pub(crate) fn tag(&self, number: i32) -> Option<crate::api::DoorCategoryTagDto> {
        self.range(number)
            .map(|range| crate::api::DoorCategoryTagDto {
                name: range.category.name.clone(),
                color: range.category.color.clone(),
                check_document: range.check_document,
                document_note: range.document_note.clone(),
            })
    }

    /// The table and seat of `number`, e.g. `"Mesa 5 · Lugar 3"`.
    pub(crate) fn seat(&self, number: i32) -> Option<String> {
        self.seats.get(&number).cloned()
    }
}
