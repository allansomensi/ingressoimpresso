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

/** One tier's share of a batch, for the landing simulator. */
export type QuoteLine = { count: number; unitCents: number; totalCents: number };

/** The parts of a quote: free tickets, each tier's tickets, and whether the minimum applied. */
export type QuoteBreakdown = {
  free: number;
  lines: QuoteLine[];
  /** Before the minimum. */
  subtotalCents: number;
  /** The minimum raised the price. */
  minimumApplied: boolean;
  /** What {@link quote} returns. */
  totalCents: number;
};

/** {@link quote}, itemized: the same graduated rule, line by line. */
export function quoteBreakdown(pricing: PriceTable, quantity: number, free = 0): QuoteBreakdown {
  const freeUsed = Math.min(Math.max(free, 0), quantity);
  const charged = quantity - freeUsed;
  const lines: QuoteLine[] = [];
  let previous = 0;
  for (const tier of pricing.tiers) {
    const count = Math.min(charged, tier.upTo) - previous;
    if (count <= 0) {
      break;
    }
    lines.push({ count, unitCents: tier.unitCents, totalCents: count * tier.unitCents });
    previous = tier.upTo;
  }
  const subtotalCents = lines.reduce((sum, line) => sum + line.totalCents, 0);
  const minimumApplied = charged > 0 && subtotalCents < pricing.minimumCents;
  return {
    free: freeUsed,
    lines,
    subtotalCents,
    minimumApplied,
    totalCents: quote(pricing, quantity, freeUsed),
  };
}

/** Largest batch the API accepts (`MAX_BATCH`). */
export const LARGEST_BATCH = 5_000;

const SLIDER_MIN = 10;

/** Slider position (0–1000) → a round ticket count, on a log scale: fine steps for small events. */
export function sliderQuantity(position: number): number {
  const raw = SLIDER_MIN * (LARGEST_BATCH / SLIDER_MIN) ** (Math.min(Math.max(position, 0), 1000) / 1000);
  const step = raw < 100 ? 5 : raw < 500 ? 10 : raw < 2000 ? 50 : 100;
  return Math.min(LARGEST_BATCH, Math.max(SLIDER_MIN, Math.round(raw / step) * step));
}

/** Ticket count → slider position (the inverse of {@link sliderQuantity}). */
export function sliderPosition(quantity: number): number {
  const clamped = Math.min(Math.max(quantity, SLIDER_MIN), LARGEST_BATCH);
  return Math.round((Math.log(clamped / SLIDER_MIN) / Math.log(LARGEST_BATCH / SLIDER_MIN)) * 1000);
}
