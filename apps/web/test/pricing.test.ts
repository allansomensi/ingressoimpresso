import type { PricingDto } from "@ingressoimpresso/api-types";
import { describe, expect, it } from "vitest";

import { quote } from "@/lib/pricing";

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
