//! Tables and seats (ADR 0057): the map of a ball, a dinner or a graduation. Each table has
//! seats; tickets are seated by number, and the table and seat print on the ticket's band.

use std::collections::{BTreeSet, HashMap};

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use uuid::Uuid;

use super::{MAX_TICKET_NUMBER, authorize_event, one_line};
use crate::api::{
    SeatDto, SeatTicketsBody, TableBody, TableDto, TableShape, TablesBulkBody, TablesLayoutBody,
    UnseatBody,
};
use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult, bad_request};
use crate::state::AppState;

/// Most tables per event.
pub const MAX_TABLES: i64 = 300;
const MAX_NAME: usize = 30;
const MAX_SEATS: i16 = 50;
const MAX_PREFIX: usize = 20;

fn check_seats(seats: i16) -> ApiResult<()> {
    if (1..=MAX_SEATS).contains(&seats) {
        Ok(())
    } else {
        Err(bad_request(
            "invalid_seats",
            format!("a table has 1-{MAX_SEATS} seats"),
        ))
    }
}

fn check_name(name: &str) -> ApiResult<String> {
    let name = name.trim().to_owned();
    if name.is_empty() || name.chars().count() > MAX_NAME {
        return Err(bad_request(
            "invalid_table_name",
            format!("name must have 1-{MAX_NAME} characters"),
        ));
    }
    one_line(&name, "invalid_table_name")?;
    Ok(name)
}

fn clamp(value: f32) -> f32 {
    if value.is_finite() {
        value.clamp(0.0, 1.0)
    } else {
        0.5
    }
}

/// Centre of slot `index` when `total` tables are laid out in a grid wider than tall.
#[expect(
    clippy::cast_precision_loss,
    clippy::cast_possible_truncation,
    reason = "a few hundred tables at most"
)]
fn slot(index: i64, total: i64) -> (f32, f32) {
    let total = total.max(1);
    let cols = ((total as f64 * 1.6).sqrt().ceil() as i64).max(1);
    let rows = (total + cols - 1) / cols;
    let (col, row) = (index % cols, index / cols);
    (
        ((col as f64 + 0.5) / cols as f64) as f32,
        ((row as f64 + 0.5) / rows.max(1) as f64) as f32,
    )
}

fn renamed(error: sqlx::Error) -> ApiError {
    match ApiError::from(error) {
        ApiError::Conflict("duplicate", _) => {
            ApiError::Conflict("table_exists", "a table with this name exists".to_owned())
        }
        other => other,
    }
}

async fn count(state: &AppState, event_id: Uuid) -> ApiResult<i64> {
    Ok(sqlx::query_scalar!(
        r#"select count(*) as "count!" from event_tables where event_id = $1"#,
        event_id
    )
    .fetch_one(&state.pool)
    .await?)
}

/// `GET /api/events/{id}/tables`.
pub async fn list(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
) -> ApiResult<Json<Vec<TableDto>>> {
    authorize_event(&state.pool, &user, event_id).await?;
    let mut guests: HashMap<Uuid, Vec<SeatDto>> = HashMap::new();
    for row in sqlx::query!(
        "select table_id, ticket_number, seat from ticket_seats where event_id = $1 order by seat",
        event_id
    )
    .fetch_all(&state.pool)
    .await?
    {
        guests.entry(row.table_id).or_default().push(SeatDto {
            number: row.ticket_number,
            seat: row.seat,
        });
    }
    let tables = sqlx::query!(
        "select id, name, seats, shape, x, y from event_tables where event_id = $1 order by created_at, name",
        event_id
    )
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(
        tables
            .into_iter()
            .map(|row| TableDto {
                guests: guests.remove(&row.id).unwrap_or_default(),
                id: row.id,
                name: row.name,
                seats: row.seats,
                shape: TableShape::from_db(&row.shape).unwrap_or(TableShape::Round),
                x: row.x,
                y: row.y,
            })
            .collect(),
    ))
}

/// `POST /api/events/{id}/tables`.
pub async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
    Json(body): Json<TableBody>,
) -> ApiResult<(StatusCode, Json<TableDto>)> {
    authorize_event(&state.pool, &user, event_id).await?;
    let name = check_name(&body.name)?;
    check_seats(body.seats)?;
    let existing = count(&state, event_id).await?;
    if existing >= MAX_TABLES {
        return Err(ApiError::Conflict(
            "too_many_tables",
            format!("an event has at most {MAX_TABLES} tables"),
        ));
    }
    let (auto_x, auto_y) = slot(existing, existing + 1);
    let (x, y) = (body.x.map_or(auto_x, clamp), body.y.map_or(auto_y, clamp));
    let id = Uuid::new_v4();
    sqlx::query!(
        "insert into event_tables (id, event_id, name, seats, shape, x, y) values ($1, $2, $3, $4, $5, $6, $7)",
        id,
        event_id,
        name,
        body.seats,
        body.shape.db(),
        x,
        y,
    )
    .execute(&state.pool)
    .await
    .map_err(renamed)?;
    Ok((
        StatusCode::CREATED,
        Json(TableDto {
            id,
            name,
            seats: body.seats,
            shape: body.shape,
            x,
            y,
            guests: Vec::new(),
        }),
    ))
}

/// `POST /api/events/{id}/tables/bulk`: "Mesa 1" to "Mesa N", numbered after the tables with
/// the same prefix, laid out in a grid.
pub async fn create_bulk(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
    Json(body): Json<TablesBulkBody>,
) -> ApiResult<StatusCode> {
    authorize_event(&state.pool, &user, event_id).await?;
    check_seats(body.seats)?;
    let prefix = body.prefix.trim().to_owned();
    if prefix.is_empty() || prefix.chars().count() > MAX_PREFIX {
        return Err(bad_request(
            "invalid_table_name",
            format!("prefix must have 1-{MAX_PREFIX} characters"),
        ));
    }
    one_line(&prefix, "invalid_table_name")?;
    let existing = count(&state, event_id).await?;
    let wanted = i64::from(body.count);
    if !(1..=200).contains(&wanted) || existing + wanted > MAX_TABLES {
        return Err(ApiError::Conflict(
            "too_many_tables",
            format!("an event has at most {MAX_TABLES} tables"),
        ));
    }
    let mut tx = state.pool.begin().await?;
    let names: BTreeSet<String> = sqlx::query_scalar!(
        "select name from event_tables where event_id = $1",
        event_id
    )
    .fetch_all(&mut *tx)
    .await?
    .into_iter()
    .collect();
    let mut next = 1;
    for index in 0..wanted {
        while names.contains(&format!("{prefix} {next}")) {
            next += 1;
        }
        let (x, y) = slot(existing + index, existing + wanted);
        sqlx::query!(
            "insert into event_tables (id, event_id, name, seats, shape, x, y) values ($1, $2, $3, $4, $5, $6, $7)",
            Uuid::new_v4(),
            event_id,
            format!("{prefix} {next}"),
            body.seats,
            body.shape.db(),
            x,
            y,
        )
        .execute(&mut *tx)
        .await
        .map_err(renamed)?;
        next += 1;
    }
    tx.commit().await?;
    Ok(StatusCode::CREATED)
}

async fn table_event(state: &AppState, user: &AuthUser, table_id: Uuid) -> ApiResult<Uuid> {
    let event_id = sqlx::query_scalar!("select event_id from event_tables where id = $1", table_id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or(ApiError::NotFound)?;
    authorize_event(&state.pool, user, event_id).await?;
    Ok(event_id)
}

/// `PUT /api/tables/{id}`: fewer seats only if the seats removed are empty.
pub async fn update(
    State(state): State<AppState>,
    user: AuthUser,
    Path(table_id): Path<Uuid>,
    Json(body): Json<TableBody>,
) -> ApiResult<StatusCode> {
    table_event(&state, &user, table_id).await?;
    let name = check_name(&body.name)?;
    check_seats(body.seats)?;
    let highest = sqlx::query_scalar!(
        "select max(seat) from ticket_seats where table_id = $1",
        table_id
    )
    .fetch_one(&state.pool)
    .await?
    .unwrap_or(0);
    if highest > body.seats {
        return Err(ApiError::Conflict(
            "seats_taken",
            "free the last seats before removing them".to_owned(),
        ));
    }
    sqlx::query!(
        r#"update event_tables set name = $2, seats = $3, shape = $4,
                  x = coalesce($5, x), y = coalesce($6, y) where id = $1"#,
        table_id,
        name,
        body.seats,
        body.shape.db(),
        body.x.map(clamp),
        body.y.map(clamp),
    )
    .execute(&state.pool)
    .await
    .map_err(renamed)?;
    Ok(StatusCode::NO_CONTENT)
}

/// `DELETE /api/tables/{id}`: its tickets are no longer seated.
pub async fn delete(
    State(state): State<AppState>,
    user: AuthUser,
    Path(table_id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    table_event(&state, &user, table_id).await?;
    sqlx::query!("delete from event_tables where id = $1", table_id)
        .execute(&state.pool)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// `PUT /api/events/{id}/tables/layout`: positions after dragging tables on the map.
pub async fn layout(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
    Json(body): Json<TablesLayoutBody>,
) -> ApiResult<StatusCode> {
    authorize_event(&state.pool, &user, event_id).await?;
    if body.positions.len() > usize::try_from(MAX_TABLES).unwrap_or(usize::MAX) {
        return Err(bad_request("invalid_layout", "too many positions"));
    }
    let mut tx = state.pool.begin().await?;
    for position in &body.positions {
        sqlx::query!(
            "update event_tables set x = $3, y = $4 where id = $1 and event_id = $2",
            position.id,
            event_id,
            clamp(position.x),
            clamp(position.y),
        )
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

/// `POST /api/tables/{id}/tickets`: seats the numbers in the table's free seats, in order.
/// Numbers already at this table stay where they are; numbers at another table are refused
/// unless `moveSeated`.
pub async fn seat(
    State(state): State<AppState>,
    user: AuthUser,
    Path(table_id): Path<Uuid>,
    Json(body): Json<SeatTicketsBody>,
) -> ApiResult<Json<Vec<SeatDto>>> {
    let event_id = table_event(&state, &user, table_id).await?;
    let mut numbers = BTreeSet::new();
    for item in &body.ranges {
        if item.first < 1 || item.last < item.first || item.last > MAX_TICKET_NUMBER {
            return Err(bad_request("invalid_range", "bad ticket numbers"));
        }
        if i64::from(item.last - item.first) + i64::try_from(numbers.len()).unwrap_or(0)
            >= i64::from(MAX_SEATS)
        {
            return Err(ApiError::Conflict(
                "table_full",
                "more tickets than seats".to_owned(),
            ));
        }
        numbers.extend(item.first..=item.last);
    }
    if numbers.is_empty() {
        return Err(bad_request("invalid_range", "no ticket numbers"));
    }
    let wanted: Vec<i32> = numbers.into_iter().collect();
    let mut tx = state.pool.begin().await?;
    let seats = sqlx::query_scalar!(
        "select seats from event_tables where id = $1 for update",
        table_id
    )
    .fetch_one(&mut *tx)
    .await?;
    let placed = sqlx::query!(
        "select ticket_number, table_id from ticket_seats where event_id = $1 and ticket_number = any($2)",
        event_id,
        &wanted,
    )
    .fetch_all(&mut *tx)
    .await?;
    let elsewhere: Vec<i32> = placed
        .iter()
        .filter(|row| row.table_id != table_id)
        .map(|row| row.ticket_number)
        .collect();
    if !elsewhere.is_empty() {
        if !body.move_seated {
            return Err(ApiError::Conflict(
                "already_seated",
                "some tickets are at another table".to_owned(),
            ));
        }
        sqlx::query!(
            "delete from ticket_seats where event_id = $1 and ticket_number = any($2)",
            event_id,
            &elsewhere,
        )
        .execute(&mut *tx)
        .await?;
    }
    let here: BTreeSet<i32> = placed
        .iter()
        .filter(|row| row.table_id == table_id)
        .map(|row| row.ticket_number)
        .collect();
    let taken: BTreeSet<i16> = sqlx::query_scalar!(
        "select seat from ticket_seats where table_id = $1",
        table_id
    )
    .fetch_all(&mut *tx)
    .await?
    .into_iter()
    .collect();
    let mut free = (1..=seats).filter(|seat| !taken.contains(seat));
    for number in wanted.iter().filter(|number| !here.contains(number)) {
        let seat = free.next().ok_or_else(|| {
            ApiError::Conflict("table_full", "more tickets than seats".to_owned())
        })?;
        sqlx::query!(
            "insert into ticket_seats (event_id, ticket_number, table_id, seat) values ($1, $2, $3, $4)",
            event_id,
            number,
            table_id,
            seat,
        )
        .execute(&mut *tx)
        .await?;
    }
    let guests = sqlx::query_as!(
        SeatDto,
        "select ticket_number as number, seat from ticket_seats where table_id = $1 order by seat",
        table_id
    )
    .fetch_all(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(Json(guests))
}

/// `POST /api/tables/{id}/tickets/remove`: frees a ticket's seat.
pub async fn unseat(
    State(state): State<AppState>,
    user: AuthUser,
    Path(table_id): Path<Uuid>,
    Json(body): Json<UnseatBody>,
) -> ApiResult<StatusCode> {
    table_event(&state, &user, table_id).await?;
    sqlx::query!(
        "delete from ticket_seats where table_id = $1 and ticket_number = $2",
        table_id,
        body.number
    )
    .execute(&state.pool)
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slots_fill_a_grid_inside_the_map() {
        let positions: Vec<_> = (0..20).map(|index| slot(index, 20)).collect();
        assert!(
            positions
                .iter()
                .all(|(x, y)| (0.0..=1.0).contains(x) && (0.0..=1.0).contains(y))
        );
        // 20 tables: 6 columns, 4 rows.
        assert_eq!(positions[0], (1.0 / 12.0, 0.125));
        assert_eq!(positions[6].1, 0.375);
        for (index, a) in positions.iter().enumerate() {
            for b in positions.iter().skip(index + 1) {
                assert!((a.0 - b.0).abs() > 0.01 || (a.1 - b.1).abs() > 0.01);
            }
        }
    }
}
