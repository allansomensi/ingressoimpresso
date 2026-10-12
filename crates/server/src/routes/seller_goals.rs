//! Goals and ranking of sellers (ADR 0073): how many tickets each seller aims to sell, set one by
//! one or for everyone at once, and, when the organizer turns it on, each seller's position among
//! the others on their page. Box offices sell at the door (ADR 0069): no goal, no ranking.

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use sqlx::PgPool;
use uuid::Uuid;

use super::authorize_event;
use crate::api::{
    SellerGoalBody, SellerGoalsBody, SellerGoalsDto, SellerRankingDto, SellerRankingEntryDto,
};
use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult, bad_request};
use crate::state::AppState;

/// Largest goal (the column's check).
const MAX_GOAL: i32 = 100_000;
/// Lines of the ranking a seller sees.
const TOP: usize = 5;

fn valid_goal(goal: Option<i32>) -> ApiResult<Option<i32>> {
    match goal {
        Some(value) if !(1..=MAX_GOAL).contains(&value) => Err(bad_request(
            "invalid_goal",
            format!("a goal goes from 1 to {MAX_GOAL} tickets"),
        )),
        other => Ok(other),
    }
}

/// `PUT /api/sellers/{id}/goal`.
pub async fn set(
    State(state): State<AppState>,
    user: AuthUser,
    Path(seller_id): Path<Uuid>,
    Json(body): Json<SellerGoalBody>,
) -> ApiResult<StatusCode> {
    let goal = valid_goal(body.goal)?;
    let seller = sqlx::query!(
        "select event_id, box_office from sellers where id = $1",
        seller_id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound)?;
    authorize_event(&state.pool, &user, seller.event_id).await?;
    if seller.box_office && goal.is_some() {
        return Err(ApiError::Conflict(
            "box_office_seller",
            "a box office sells at the door".to_owned(),
        ));
    }
    sqlx::query!(
        "update sellers set goal = $2 where id = $1",
        seller_id,
        goal
    )
    .execute(&state.pool)
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// `POST /api/events/{id}/sellers/goals`: the same goal for every seller (box offices aside), or
/// only for those without one.
pub async fn set_all(
    State(state): State<AppState>,
    user: AuthUser,
    Path(event_id): Path<Uuid>,
    Json(body): Json<SellerGoalsBody>,
) -> ApiResult<Json<SellerGoalsDto>> {
    let goal = valid_goal(body.goal)?;
    authorize_event(&state.pool, &user, event_id).await?;
    let updated = sqlx::query!(
        r#"update sellers set goal = $2
           where event_id = $1 and not box_office and ($3 = false or goal is null)
             and goal is distinct from $2"#,
        event_id,
        goal,
        body.only_missing,
    )
    .execute(&state.pool)
    .await?
    .rows_affected();
    Ok(Json(SellerGoalsDto {
        updated: i32::try_from(updated).unwrap_or(i32::MAX),
    }))
}

/// A seller's sales, for the ranking.
#[derive(Debug, Clone)]
pub(crate) struct Standing {
    pub seller_id: Uuid,
    pub name: String,
    pub sold: i32,
}

/// The event's sellers in the ranking: not box offices, holding at least one paid number; sold =
/// the numbers they marked that still count (not voided).
pub(crate) async fn standings(pool: &PgPool, event_id: Uuid) -> ApiResult<Vec<Standing>> {
    Ok(sqlx::query!(
        r#"with held as (
               select a.seller_id, n
               from seller_assignments a
               join sellers s on s.id = a.seller_id and not s.box_office
               join ticket_batches b on b.event_id = a.event_id and b.status = 'paid' and b.numbers && a.numbers,
                    generate_series(lower(a.numbers * b.numbers), upper(a.numbers * b.numbers) - 1) as n
               where a.event_id = $1
           )
           select s.id, s.name,
                  (count(ts.ticket_number) filter (
                       where not exists (select 1 from ticket_voids v
                                         where v.event_id = $1 and v.undone_at is null and v.numbers @> h.n)
                  ))::int as "sold!"
           from held h
           join sellers s on s.id = h.seller_id
           left join ticket_sales ts on ts.event_id = $1 and ts.ticket_number = h.n and ts.seller_id = h.seller_id
           group by s.id, s.name"#,
        event_id
    )
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(|row| Standing {
        seller_id: row.id,
        name: row.name,
        sold: row.sold,
    })
    .collect())
}

/// "Ana S." from "Ana Paula Souza": the first name and the initial of the last one, so the other
/// sellers are recognizable without their full names.
pub(crate) fn short_name(name: &str) -> String {
    let mut words = name.split_whitespace();
    let Some(first) = words.next() else {
        return String::new();
    };
    match words.last().and_then(|last| last.chars().next()) {
        Some(initial) => format!("{first} {}.", initial.to_uppercase()),
        None => first.to_owned(),
    }
}

/// The ranking as `viewer` sees it: most sales first, ties share a position ("1, 2, 2, 4") and
/// are listed by name; only sellers with a sale are ranked.
pub(crate) fn ranking(mut standings: Vec<Standing>, viewer: Uuid) -> SellerRankingDto {
    let participants = i32::try_from(standings.len()).unwrap_or(i32::MAX);
    standings.sort_by(|a, b| {
        b.sold
            .cmp(&a.sold)
            .then_with(|| short_name(&a.name).cmp(&short_name(&b.name)))
            .then_with(|| a.seller_id.cmp(&b.seller_id))
    });
    let mut position = 0;
    let mut previous = None;
    let mut ranked = Vec::new();
    for (index, standing) in standings.iter().enumerate() {
        if standing.sold == 0 {
            break;
        }
        if previous != Some(standing.sold) {
            position = i32::try_from(index).unwrap_or(i32::MAX - 1) + 1;
            previous = Some(standing.sold);
        }
        ranked.push((position, standing));
    }
    SellerRankingDto {
        position: ranked
            .iter()
            .find(|(_, standing)| standing.seller_id == viewer)
            .map(|(position, _)| *position),
        participants,
        top: ranked
            .iter()
            .take(TOP)
            .map(|(position, standing)| SellerRankingEntryDto {
                position: *position,
                name: short_name(&standing.name),
                sold: standing.sold,
                you: standing.seller_id == viewer,
            })
            .collect(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn standing(id: u128, name: &str, sold: i32) -> Standing {
        Standing {
            seller_id: Uuid::from_u128(id),
            name: name.to_owned(),
            sold,
        }
    }

    #[test]
    fn names_keep_the_first_name_and_an_initial() {
        assert_eq!(short_name("Ana Paula souza"), "Ana S.");
        assert_eq!(short_name("  João  "), "João");
        assert_eq!(short_name("Érica Ávila"), "Érica Á.");
        assert_eq!(short_name(""), "");
    }

    #[test]
    fn ties_share_a_position_and_sellers_without_sales_are_not_ranked() {
        let all = vec![
            standing(1, "Caio Lima", 3),
            standing(2, "Bia Rocha", 7),
            standing(3, "Ana Souza", 3),
            standing(4, "Duda Reis", 1),
            standing(5, "Edu Nunes", 0),
            standing(6, "Fábio Dias", 1),
            standing(7, "Gil Melo", 1),
        ];
        let seen = ranking(all.clone(), Uuid::from_u128(3));
        assert_eq!(seen.participants, 7);
        assert_eq!(seen.position, Some(2));
        let top: Vec<(i32, &str, bool)> = seen
            .top
            .iter()
            .map(|entry| (entry.position, entry.name.as_str(), entry.you))
            .collect();
        assert_eq!(
            top,
            [
                (1, "Bia R.", false),
                (2, "Ana S.", true),
                (2, "Caio L.", false),
                (4, "Duda R.", false),
                (4, "Fábio D.", false),
            ]
        );
        // Without a sale, no position yet.
        assert_eq!(ranking(all, Uuid::from_u128(5)).position, None);
        // Nobody sold: an empty ranking.
        let quiet = ranking(vec![standing(1, "Ana", 0)], Uuid::from_u128(1));
        assert_eq!(quiet.top.len(), 0);
        assert_eq!(quiet.participants, 1);
    }

    #[test]
    fn goals_are_validated() {
        assert_eq!(valid_goal(None).unwrap(), None);
        assert_eq!(valid_goal(Some(20)).unwrap(), Some(20));
        assert!(valid_goal(Some(0)).is_err());
        assert!(valid_goal(Some(100_001)).is_err());
    }
}
