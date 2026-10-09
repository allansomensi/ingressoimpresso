import type { PricingDto } from "@ingressoimpresso/api-types";

/** What a quote needs from a price table (the public one, an announced one, a draft in the admin). */
export type PriceTable = Pick<PricingDto, "tiers" | "minimumCents">;

/** A price after `percent`% off, rounded like the server (ADR 0039). */
export function discounted(cents: number, percent: number): number {
  return cents - Math.round((cents * Math.min(Math.max(percent, 0), 100)) / 100);
}

/**
 * Preview of what a batch will cost, from the table the API publishes (`GET /api/pricing`).
 * Display only: the server fixes the real price when the batch is created (ADR 0020).
 * Graduated tiers: each ticket costs the unit price of the tier its position falls in.
 */
export function quote(pricing: PriceTable, quantity: number, free = 0): number {
  const charged = quantity - Math.min(Math.max(free, 0), quantity);
  if (charged === 0) {
    return 0;
  }
  return graduated(pricing, charged);
}

function graduated(pricing: PriceTable, quantity: number): number {
  let total = 0;
  let previous = 0;
  for (const tier of pricing.tiers) {
    const inTier = Math.min(quantity, tier.upTo) - previous;
    if (inTier <= 0) {
      break;
    }
    total += inTier * tier.unitCents;
    previous = tier.upTo;
  }
  return Math.max(total, pricing.minimumCents);
}
