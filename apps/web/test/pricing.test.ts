import type { PricingDto } from "@ingressoimpresso/api-types";
import { describe, expect, it } from "vitest";

import { quote } from "@/lib/pricing";

// Same table and expectations as `crates/server/src/pricing.rs`.
const pricing: PricingDto = {
  currency: "brl",
  minimumCents: 500,
  onlinePayment: true,
  tiers: [
    { upTo: 100, unitCents: 40 },
    { upTo: 500, unitCents: 30 },
    { upTo: 2000, unitCents: 20 },
    { upTo: 5000, unitCents: 15 },
  ],
};

describe("quote", () => {
  it("matches the server's graduated prices", () => {
    expect(quote(pricing, 1)).toBe(500);
    expect(quote(pricing, 13)).toBe(520);
    expect(quote(pricing, 100)).toBe(4_000);
    expect(quote(pricing, 101)).toBe(4_030);
    expect(quote(pricing, 500)).toBe(4_000 + 400 * 30);
    expect(quote(pricing, 2_000)).toBe(16_000 + 1_500 * 20);
    expect(quote(pricing, 5_000)).toBe(46_000 + 3_000 * 15);
  });
});
