//! What a batch costs (ADR 0020). Graduated tiers: the first 100 tickets cost the first tier's
//! unit price, the next ones the second tier's, and so on, so a bigger batch never costs less
//! than a smaller one. Prices are a business decision: change them here, with a commit.

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
        unit_cents: 40,
    },
    Tier {
        up_to: 500,
        unit_cents: 30,
    },
    Tier {
        up_to: 2_000,
        unit_cents: 20,
    },
    Tier {
        up_to: 5_000,
        unit_cents: 15,
    },
];

/// Smallest charge, so card and Pix fees never exceed the price of a tiny batch.
pub const MINIMUM_CENTS: i32 = 500;

/// Currency of every charge (ISO 4217, lowercase as Stripe expects).
pub const CURRENCY: &str = "brl";

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
pub fn table(online_payment: bool) -> PricingDto {
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
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn graduated_prices() {
        assert_eq!(quote(1), MINIMUM_CENTS);
        assert_eq!(quote(12), MINIMUM_CENTS);
        assert_eq!(quote(13), 520);
        assert_eq!(quote(100), 4_000);
        assert_eq!(quote(101), 4_030);
        assert_eq!(quote(500), 4_000 + 400 * 30);
        assert_eq!(quote(2_000), 16_000 + 1_500 * 20);
        assert_eq!(quote(5_000), 46_000 + 3_000 * 15);
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
