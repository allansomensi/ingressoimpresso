import type { PricingDto } from "@ingressoimpresso/api-types";

import { API_URL } from "@/lib/api";

/** How long the server keeps the price table before asking the API again, in seconds. */
const PRICING_REVALIDATE = 600;
/** The page never waits longer than this for the API: past it, the browser loads the prices. */
const PRICING_TIMEOUT_MS = 2_500;

/**
 * The price table for the public pages, read on the server: the prices are in the HTML search
 * engines read, and the simulator shows up without a placeholder that shifts the page. Cached for
 * a few minutes (the Next.js data cache), so most visits never reach the API. `null` when the API
 * is slow or down: the page renders and the browser loads the table, as before.
 */
export async function fetchPricing(): Promise<PricingDto | null> {
  try {
    const response = await fetch(`${API_URL}/api/pricing`, {
      next: { revalidate: PRICING_REVALIDATE },
      signal: AbortSignal.timeout(PRICING_TIMEOUT_MS),
    });
    if (!response.ok) {
      return null;
    }
    const body: unknown = await response.json();
    return isPricing(body) ? body : null;
  } catch {
    return null;
  }
}

function isPricing(value: unknown): value is PricingDto {
  return (
    typeof value === "object" &&
    value !== null &&
    "tiers" in value &&
    Array.isArray(value.tiers) &&
    "freeTickets" in value &&
    typeof value.freeTickets === "number" &&
    "minimumCents" in value &&
    typeof value.minimumCents === "number"
  );
}
