import type { PricingDto } from "@ingressoimpresso/api-types";
import { describe, expect, it } from "vitest";

import { quote, quoteBreakdown, sliderPosition, sliderQuantity } from "@/lib/pricing";

// Same table and expectations as `crates/server/src/pricing.rs`.
const pricing: PricingDto = {
  currency: "brl",
  minimumCents: 290,
  onlinePayment: true,
  freeTickets: 30,
  tiers: [
    { upTo: 100, unitCents: 15 },
    { upTo: 500, unitCents: 10 },
    { upTo: 2000, unitCents: 7 },
    { upTo: 5000, unitCents: 5 },
  ],
  promotion: null,
  upcoming: null,
};

describe("quote", () => {
  it("matches the server's graduated prices", () => {
    expect(quote(pricing, 1)).toBe(290);
    expect(quote(pricing, 19)).toBe(290);
    expect(quote(pricing, 20)).toBe(300);
    expect(quote(pricing, 100)).toBe(1_500);
    expect(quote(pricing, 101)).toBe(1_510);
    expect(quote(pricing, 500)).toBe(1_500 + 400 * 10);
    expect(quote(pricing, 2_000)).toBe(5_500 + 1_500 * 7);
    expect(quote(pricing, 5_000)).toBe(16_000 + 3_000 * 5);
  });

  it("takes free tickets off the batch", () => {
    expect(quote(pricing, 30, 30)).toBe(0);
    expect(quote(pricing, 130, 30)).toBe(quote(pricing, 100));
    expect(quote(pricing, 50, -1)).toBe(quote(pricing, 50));
  });
});

describe("quoteBreakdown", () => {
  it("itemizes the same total as quote", () => {
    for (const [quantity, free] of [
      [1, 0],
      [200, 30],
      [200, 0],
      [5_000, 30],
      [20, 30],
    ] as const) {
      expect(quoteBreakdown(pricing, quantity, free).totalCents, `${String(quantity)}/${String(free)}`).toBe(quote(pricing, quantity, free));
    }
  });

  it("lists free tickets, tiers and the minimum", () => {
    expect(quoteBreakdown(pricing, 200, 30)).toEqual({
      free: 30,
      lines: [
        { count: 100, unitCents: 15, totalCents: 1_500 },
        { count: 70, unitCents: 10, totalCents: 700 },
      ],
      subtotalCents: 2_200,
      minimumApplied: false,
      totalCents: 2_200,
    });
    expect(quoteBreakdown(pricing, 10, 0)).toMatchObject({ subtotalCents: 150, minimumApplied: true, totalCents: 290 });
    expect(quoteBreakdown(pricing, 20, 30)).toMatchObject({ free: 20, lines: [], minimumApplied: false, totalCents: 0 });
  });
});

describe("simulator slider", () => {
  it("covers 10 to 5.000 tickets with round numbers", () => {
    expect(sliderQuantity(0)).toBe(10);
    expect(sliderQuantity(1000)).toBe(5_000);
    for (const position of [100, 250, 500, 750, 900]) {
      const quantity = sliderQuantity(position);
      expect(quantity % 5).toBe(0);
      expect(Math.abs(sliderPosition(quantity) - position)).toBeLessThan(15);
    }
    expect(sliderPosition(200)).toBeGreaterThan(sliderPosition(100));
  });
});
