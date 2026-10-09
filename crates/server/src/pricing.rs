//! What a batch costs (ADRs 0020, 0024). Graduated tiers: the first 100 tickets cost the first
//! tier's unit price, the next ones the second tier's, and so on, so a bigger batch never costs
//! less than a smaller one. Each organization gets its first tickets for free (`FREE_TICKETS`,
//! default [`DEFAULT_FREE_TICKETS`]).
//! Prices are a business decision: change them here, with a commit.

use crate::api::{PriceTierDto, PricingDto};

/// One tier: tickets up to `up_to` (inclusive, counted from the first ticket of the batch) cost
/// `unit_cents` each.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Tier {
    /// Last ticket of the tier.
    pub up_to: i32,
    /// Price per ticket in this tier, in centavos.
    pub unit_cents: i32,
}

/// Tiers in increasing order; the last one covers the largest batch (5,000 tickets).
pub const TIERS: [Tier; 4] = [
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
];

/// Smallest charge, so card fees (a fixed part plus a percentage) never eat a tiny batch.
pub const MINIMUM_CENTS: i32 = 290;

/// Tickets every organization gets for free, to try the whole flow (print and door) at no cost.
pub const DEFAULT_FREE_TICKETS: i32 = 30;

/// Currency of every charge (ISO 4217, lowercase as Stripe expects).
pub const CURRENCY: &str = "brl";

/// Price of a batch of `quantity` tickets when `free` of them are free (the organization's
/// remaining free tickets), in centavos. Zero when the whole batch is free.
pub fn quote_with_free(quantity: i32, free: i32) -> i32 {
    let charged = quantity - free.clamp(0, quantity);
    if charged == 0 { 0 } else { quote(charged) }
}

/// Price of a batch of `quantity` tickets, in centavos.
pub fn quote(quantity: i32) -> i32 {
    let mut total: i64 = 0;
    let mut previous = 0;
    for tier in TIERS {
        let in_tier = quantity.min(tier.up_to) - previous;
        if in_tier <= 0 {
            break;
        }
        total += i64::from(in_tier) * i64::from(tier.unit_cents);
        previous = tier.up_to;
    }
    // Quantities are validated (1–5,000), so the total stays far below i32::MAX.
    i32::try_from(total).unwrap_or(i32::MAX).max(MINIMUM_CENTS)
}

/// The price table, for the web app (the server stays the only one that computes a charge).
pub fn table(online_payment: bool, free_tickets: i32) -> PricingDto {
    PricingDto {
        currency: CURRENCY.to_owned(),
        minimum_cents: MINIMUM_CENTS,
        tiers: TIERS
            .iter()
            .map(|tier| PriceTierDto {
                up_to: tier.up_to,
                unit_cents: tier.unit_cents,
            })
            .collect(),
        online_payment,
        free_tickets,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn graduated_prices() {
        assert_eq!(quote(1), MINIMUM_CENTS);
        assert_eq!(quote(19), MINIMUM_CENTS);
        assert_eq!(quote(20), 300);
        assert_eq!(quote(100), 1_500);
        assert_eq!(quote(101), 1_510);
        assert_eq!(quote(500), 1_500 + 400 * 10);
        assert_eq!(quote(2_000), 5_500 + 1_500 * 7);
        assert_eq!(quote(5_000), 16_000 + 3_000 * 5);
    }

    #[test]
    fn free_tickets_come_off_the_batch() {
        assert_eq!(quote_with_free(30, 30), 0);
        assert_eq!(quote_with_free(10, 30), 0);
        assert_eq!(quote_with_free(130, 30), quote(100));
        assert_eq!(quote_with_free(50, 0), quote(50));
        assert_eq!(quote_with_free(50, -5), quote(50));
    }

    #[test]
    fn a_bigger_batch_never_costs_less() {
        let mut last = 0;
        for quantity in 1..=5_000 {
            let price = quote(quantity);
            assert!(price >= last, "{quantity}");
            last = price;
        }
    }

    #[test]
    fn tiers_cover_the_largest_batch() {
        assert!(TIERS.windows(2).all(|pair| match pair {
            [a, b] => a.up_to < b.up_to && a.unit_cents >= b.unit_cents,
            _ => false,
        }));
        assert_eq!(TIERS.last().map(|tier| tier.up_to), Some(5_000));
    }
}
