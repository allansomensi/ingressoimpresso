//! What a batch costs (ADRs 0020, 0024, 0039, 0040). Graduated tiers: the first 100 tickets cost
//! the first tier's unit price, the next ones the second tier's, and so on, so a bigger batch
//! never costs less than a smaller one. Each organization gets its first tickets for free.
//!
//! The table lives in `price_tables` and admins change it from the panel: a new version starts
//! now or on a later date, and batches keep the price of the moment they were created. On top of
//! the table: the best running promotion or a discount code (the larger one), then the
//! organization's credit.

use sqlx::PgExecutor;
use time::OffsetDateTime;
use uuid::Uuid;

use crate::api::{ActivePromotionDto, PriceTableDto, PriceTierDto, PricingDto, UpcomingPricesDto};
use crate::error::{ApiError, ApiResult, bad_request};

/// One tier: tickets up to `up_to` (inclusive, counted from the first ticket of the batch) cost
/// `unit_cents` each.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tier {
    /// Last ticket of the tier.
    pub up_to: i32,
    /// Price per ticket in this tier, in centavos.
    pub unit_cents: i32,
}

/// Largest batch, which the last tier must cover.
pub const LARGEST_BATCH: i32 = 5_000;

/// Most tiers in a table.
const MAX_TIERS: usize = 10;

/// Currency of every charge (ISO 4217, lowercase as Stripe expects).
pub const CURRENCY: &str = "brl";

/// Smallest card or Pix charge Stripe accepts in reais.
pub const STRIPE_MINIMUM_CENTS: i32 = 50;

/// A version of the price table.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PriceTable {
    /// Id.
    pub id: Uuid,
    /// Tiers in increasing order.
    pub tiers: Vec<Tier>,
    /// Smallest charge, so card fees never eat a tiny batch.
    pub minimum_cents: i32,
    /// Tickets every organization gets for free.
    pub free_tickets: i32,
    /// When it starts.
    pub effective_at: OffsetDateTime,
}

impl PriceTable {
    /// Price of a batch of `quantity` tickets, in centavos.
    pub fn quote(&self, quantity: i32) -> i32 {
        let mut total: i64 = 0;
        let mut previous = 0;
        for tier in &self.tiers {
            let in_tier = quantity.min(tier.up_to) - previous;
            if in_tier <= 0 {
                break;
            }
            total += i64::from(in_tier) * i64::from(tier.unit_cents);
            previous = tier.up_to;
        }
        i32::try_from(total)
            .unwrap_or(i32::MAX)
            .max(self.minimum_cents)
    }

    /// Price of a batch of `quantity` tickets when `free` of them are free. Zero when the whole
    /// batch is free.
    pub fn quote_with_free(&self, quantity: i32, free: i32) -> i32 {
        let charged = quantity - free.clamp(0, quantity);
        if charged == 0 { 0 } else { self.quote(charged) }
    }

    /// Tiers as the API shows them.
    pub fn tier_dtos(&self) -> Vec<PriceTierDto> {
        self.tiers
            .iter()
            .map(|tier| PriceTierDto {
                up_to: tier.up_to,
                unit_cents: tier.unit_cents,
            })
            .collect()
    }
}

/// Checks a table typed by an admin: 1–10 tiers, increasing limits ending at
/// [`LARGEST_BATCH`], unit prices that never go up, sane amounts.
///
/// # Errors
///
/// `invalid_prices`.
pub fn validate(tiers: &[Tier], minimum_cents: i32, free_tickets: i32) -> ApiResult<()> {
    let invalid = |reason: &str| bad_request("invalid_prices", reason.to_owned());
    if tiers.is_empty() || tiers.len() > MAX_TIERS {
        return Err(invalid("1 to 10 tiers"));
    }
    if tiers.last().map(|tier| tier.up_to) != Some(LARGEST_BATCH) {
        return Err(invalid("the last tier must end at 5000 tickets"));
    }
    let mut previous = Tier {
        up_to: 0,
        unit_cents: i32::MAX,
    };
    for tier in tiers {
        if tier.up_to <= previous.up_to {
            return Err(invalid("tier limits must increase"));
        }
        if !(1..=100_000).contains(&tier.unit_cents) {
            return Err(invalid("unit prices go from 1 to 100000 centavos"));
        }
        if tier.unit_cents > previous.unit_cents {
            return Err(invalid("a later tier cannot cost more per ticket"));
        }
        previous = *tier;
    }
    if !(0..=100_000).contains(&minimum_cents) {
        return Err(invalid("minimum goes from 0 to 100000 centavos"));
    }
    if !(0..=100_000).contains(&free_tickets) {
        return Err(invalid("free tickets go from 0 to 100000"));
    }
    Ok(())
}

struct TableRow {
    id: Uuid,
    tiers: serde_json::Value,
    minimum_cents: i32,
    free_tickets: i32,
    effective_at: OffsetDateTime,
}

impl TryFrom<TableRow> for PriceTable {
    type Error = ApiError;

    fn try_from(row: TableRow) -> ApiResult<Self> {
        Ok(Self {
            id: row.id,
            tiers: serde_json::from_value(row.tiers)
                .map_err(|error| ApiError::Internal(error.into()))?,
            minimum_cents: row.minimum_cents,
            free_tickets: row.free_tickets,
            effective_at: row.effective_at,
        })
    }
}

/// The table in force now.
///
/// # Errors
///
/// Database errors (the migration seeds a first table, so there is always one).
pub async fn current<'e, E: PgExecutor<'e>>(executor: E) -> ApiResult<PriceTable> {
    sqlx::query_as!(
        TableRow,
        r#"select id, tiers, minimum_cents, free_tickets, effective_at from price_tables
           where effective_at <= now() order by effective_at desc, created_at desc limit 1"#
    )
    .fetch_one(executor)
    .await?
    .try_into()
}

/// The next announced table, if any.
///
/// # Errors
///
/// Database errors.
pub async fn upcoming<'e, E: PgExecutor<'e>>(executor: E) -> ApiResult<Option<PriceTable>> {
    sqlx::query_as!(
        TableRow,
        r#"select id, tiers, minimum_cents, free_tickets, effective_at from price_tables
           where effective_at > now() order by effective_at, created_at desc limit 1"#
    )
    .fetch_optional(executor)
    .await?
    .map(TryInto::try_into)
    .transpose()
}

/// A promotion running now.
#[derive(Debug, Clone)]
pub struct Promotion {
    /// Id.
    pub id: Uuid,
    /// Public view.
    pub dto: ActivePromotionDto,
}

/// The best promotion running now: the largest discount, then the one ending first.
///
/// # Errors
///
/// Database errors.
pub async fn active_promotion<'e, E: PgExecutor<'e>>(executor: E) -> ApiResult<Option<Promotion>> {
    Ok(sqlx::query!(
        r#"select id, name, headline, discount_percent, ends_at from promotions
           where active and starts_at <= now() and ends_at > now()
           order by discount_percent desc, ends_at limit 1"#
    )
    .fetch_optional(executor)
    .await?
    .map(|row| Promotion {
        id: row.id,
        dto: ActivePromotionDto {
            name: row.name,
            headline: row.headline,
            discount_percent: row.discount_percent,
            ends_at: row.ends_at,
        },
    }))
}

/// A discount code an organization redeemed and has not used yet.
#[derive(Debug, Clone)]
pub struct PendingCode {
    /// Redemption id.
    pub redemption_id: Uuid,
    /// The code.
    pub code: String,
    /// Discount.
    pub percent: i32,
}

/// What a batch costs, step by step.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Breakdown {
    /// Free tickets of the batch.
    pub free_tickets: i32,
    /// Price of the table after free tickets.
    pub list_price_cents: i32,
    /// Promotion applied.
    pub promotion_id: Option<Uuid>,
    /// Discount code applied (its redemption).
    pub code_redemption_id: Option<Uuid>,
    /// Discount in centavos.
    pub discount_cents: i32,
    /// Credit used.
    pub credit_cents: i32,
    /// To pay.
    pub total_cents: i32,
}

/// Prices a batch: table → the larger of promotion and code (the promotion wins a tie, so the
/// code waits for a later batch) → credit. A remainder Stripe cannot charge (under R$ 0,50) is
/// left on the credit when there is enough of it, and forgiven otherwise.
pub fn price(
    table: &PriceTable,
    quantity: i32,
    free_left: i32,
    promotion: Option<(Uuid, i32)>,
    code: Option<&PendingCode>,
    credit_balance: i32,
) -> Breakdown {
    let free_tickets = free_left.clamp(0, quantity);
    let list_price_cents = table.quote_with_free(quantity, free_tickets);
    let promotion_percent = promotion.map_or(0, |(_, percent)| percent);
    let code_percent = code.map_or(0, |code| code.percent);
    let (promotion_id, code_redemption_id, percent) = if list_price_cents == 0 {
        (None, None, 0)
    } else if code_percent > promotion_percent {
        (None, code.map(|code| code.redemption_id), code_percent)
    } else if promotion_percent > 0 {
        (promotion.map(|(id, _)| id), None, promotion_percent)
    } else {
        (None, None, 0)
    };
    let mut discount_cents = percent_of(list_price_cents, percent);
    let discounted = list_price_cents - discount_cents;
    let mut credit_cents = credit_balance.clamp(0, discounted);
    let mut total_cents = discounted - credit_cents;
    if total_cents > 0 && total_cents < STRIPE_MINIMUM_CENTS {
        if credit_cents > 0 && discounted >= STRIPE_MINIMUM_CENTS {
            credit_cents = discounted - STRIPE_MINIMUM_CENTS;
            total_cents = STRIPE_MINIMUM_CENTS;
        } else if credit_cents + total_cents <= credit_balance {
            credit_cents += total_cents;
            total_cents = 0;
        } else {
            discount_cents += total_cents;
            total_cents = 0;
        }
    }
    Breakdown {
        free_tickets,
        list_price_cents,
        promotion_id,
        code_redemption_id,
        discount_cents,
        credit_cents,
        total_cents,
    }
}

/// `percent`% of `cents`, rounded to the nearest centavo.
fn percent_of(cents: i32, percent: i32) -> i32 {
    let value = (i64::from(cents) * i64::from(percent.clamp(0, 100)) + 50) / 100;
    i32::try_from(value).unwrap_or(cents)
}

/// The public price table (the server stays the only one that computes a charge).
pub fn table_dto(
    table: &PriceTable,
    online_payment: bool,
    promotion: Option<ActivePromotionDto>,
    upcoming: Option<&PriceTable>,
) -> PricingDto {
    PricingDto {
        currency: CURRENCY.to_owned(),
        minimum_cents: table.minimum_cents,
        tiers: table.tier_dtos(),
        online_payment,
        free_tickets: table.free_tickets,
        promotion,
        upcoming: upcoming.map(upcoming_dto),
    }
}

/// An announced table, for the public.
pub fn upcoming_dto(table: &PriceTable) -> UpcomingPricesDto {
    UpcomingPricesDto {
        effective_at: table.effective_at,
        minimum_cents: table.minimum_cents,
        tiers: table.tier_dtos(),
        free_tickets: table.free_tickets,
    }
}

/// A version of the table for the admin panel.
pub fn admin_dto(
    table: &PriceTable,
    note: Option<String>,
    created_by: Option<String>,
    created_at: OffsetDateTime,
) -> PriceTableDto {
    PriceTableDto {
        id: table.id,
        tiers: table.tier_dtos(),
        minimum_cents: table.minimum_cents,
        free_tickets: table.free_tickets,
        effective_at: table.effective_at,
        note,
        created_by,
        created_at,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn launch() -> PriceTable {
        PriceTable {
            id: Uuid::nil(),
            tiers: vec![
                Tier {
                    up_to: 100,
                    unit_cents: 15,
                },
                Tier {
                    up_to: 500,
                    unit_cents: 10,
                },
                Tier {
                    up_to: 2_000,
                    unit_cents: 7,
                },
                Tier {
                    up_to: 5_000,
                    unit_cents: 5,
                },
            ],
            minimum_cents: 290,
            free_tickets: 30,
            effective_at: OffsetDateTime::UNIX_EPOCH,
        }
    }

    #[test]
    fn graduated_prices() {
        let table = launch();
        assert_eq!(table.quote(1), 290);
        assert_eq!(table.quote(19), 290);
        assert_eq!(table.quote(20), 300);
        assert_eq!(table.quote(100), 1_500);
        assert_eq!(table.quote(101), 1_510);
        assert_eq!(table.quote(500), 1_500 + 400 * 10);
        assert_eq!(table.quote(2_000), 5_500 + 1_500 * 7);
        assert_eq!(table.quote(5_000), 16_000 + 3_000 * 5);
    }

    #[test]
    fn free_tickets_come_off_the_batch() {
        let table = launch();
        assert_eq!(table.quote_with_free(30, 30), 0);
        assert_eq!(table.quote_with_free(10, 30), 0);
        assert_eq!(table.quote_with_free(130, 30), table.quote(100));
        assert_eq!(table.quote_with_free(50, 0), table.quote(50));
        assert_eq!(table.quote_with_free(50, -5), table.quote(50));
    }

    #[test]
    fn a_bigger_batch_never_costs_less() {
        let table = launch();
        let mut last = 0;
        for quantity in 1..=LARGEST_BATCH {
            let price = table.quote(quantity);
            assert!(price >= last, "{quantity}");
            last = price;
        }
    }

    #[test]
    fn tables_are_validated() {
        let table = launch();
        assert!(validate(&table.tiers, 290, 30).is_ok());
        let tier = |up_to, unit_cents| Tier { up_to, unit_cents };
        assert!(validate(&[], 290, 30).is_err());
        assert!(validate(&[tier(100, 15)], 290, 30).is_err());
        assert!(validate(&[tier(100, 10), tier(5_000, 15)], 290, 30).is_err());
        assert!(validate(&[tier(100, 10), tier(100, 5), tier(5_000, 5)], 290, 30).is_err());
        assert!(validate(&[tier(5_000, 0)], 290, 30).is_err());
        assert!(validate(&[tier(5_000, 10)], -1, 30).is_err());
        assert!(validate(&[tier(5_000, 10)], 0, 0).is_ok());
    }

    #[test]
    fn promotions_codes_and_credit_stack_in_order() {
        let table = launch();
        let code = PendingCode {
            redemption_id: Uuid::from_u128(7),
            code: "ROCK".to_owned(),
            percent: 20,
        };
        // 200 tickets, 30 free: table price of 170 = 1500 + 70 * 10 = 2200.
        let plain = price(&table, 200, 30, None, None, 0);
        assert_eq!(plain.list_price_cents, 2_200);
        assert_eq!(plain.total_cents, 2_200);
        // The larger discount wins; the promotion wins a tie.
        let promo = price(
            &table,
            200,
            30,
            Some((Uuid::from_u128(1), 10)),
            Some(&code),
            0,
        );
        assert_eq!(
            (promo.code_redemption_id, promo.discount_cents),
            (Some(code.redemption_id), 440)
        );
        let tie = price(
            &table,
            200,
            30,
            Some((Uuid::from_u128(1), 20)),
            Some(&code),
            0,
        );
        assert_eq!(
            (tie.promotion_id, tie.code_redemption_id),
            (Some(Uuid::from_u128(1)), None)
        );
        // Credit comes last.
        let credit = price(&table, 200, 30, None, Some(&code), 1_000);
        assert_eq!((credit.credit_cents, credit.total_cents), (1_000, 760));
        // A whole batch on credit.
        let covered = price(&table, 200, 30, None, None, 5_000);
        assert_eq!((covered.credit_cents, covered.total_cents), (2_200, 0));
        // Nothing to discount on a free batch: the code stays.
        let free = price(&table, 20, 30, None, Some(&code), 500);
        assert_eq!(
            free,
            Breakdown {
                free_tickets: 20,
                list_price_cents: 0,
                promotion_id: None,
                code_redemption_id: None,
                discount_cents: 0,
                credit_cents: 0,
                total_cents: 0,
            }
        );
    }

    #[test]
    fn stripe_never_gets_a_charge_under_its_minimum() {
        let table = launch();
        // 290 with 270 of credit would leave 20: pay 50, use 240.
        let rest = price(&table, 1, 0, None, None, 270);
        assert_eq!((rest.credit_cents, rest.total_cents), (240, 50));
        // A 90% promotion leaves 29: forgiven.
        let tiny = price(&table, 1, 0, Some((Uuid::nil(), 90)), None, 0);
        assert_eq!((tiny.discount_cents, tiny.total_cents), (290, 0));
        // 100% off.
        let gift = price(&table, 100, 0, Some((Uuid::nil(), 100)), None, 300);
        assert_eq!(
            (gift.discount_cents, gift.credit_cents, gift.total_cents),
            (1_500, 0, 0)
        );
    }
}
