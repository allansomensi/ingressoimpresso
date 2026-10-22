import { describe, expect, it } from "vitest";

import { TOUR_STEPS, placeCard } from "@/lib/tour";

const phone = { width: 390, height: 844 };
const desktop = { width: 1280, height: 800 };
const card = { width: 340, height: 220 };

describe("welcome tour (ADR 0116)", () => {
  it("opens and closes in the middle, and points at four places", () => {
    expect(TOUR_STEPS[0]?.anchor).toBeNull();
    expect(TOUR_STEPS.at(-1)?.anchor).toBeNull();
    expect(TOUR_STEPS.filter((step) => step.anchor !== null)).toHaveLength(4);
    expect(placeCard(null, card, desktop)).toEqual({ top: 290, left: 470, side: "center" });
  });

  it("goes below an element at the top, inside the screen", () => {
    // The bell in the top right corner.
    const placed = placeCard({ top: 14, left: 1180, width: 36, height: 36 }, card, desktop);
    expect(placed.side).toBe("below");
    expect(placed.top).toBe(64);
    expect(placed.left + card.width).toBeLessThanOrEqual(desktop.width - 16);
  });

  it("goes above the phone's bottom bar", () => {
    const placed = placeCard({ top: 780, left: 100, width: 97, height: 64 }, { width: 358, height: 220 }, phone);
    expect(placed.side).toBe("above");
    expect(placed.top).toBe(780 - 14 - 220);
    expect(placed.left).toBe(16);
  });

  it("keeps a card taller than the room against the bottom edge", () => {
    const placed = placeCard({ top: 100, left: 16, width: 358, height: 600 }, { width: 358, height: 300 }, phone);
    expect(placed).toEqual({ top: 844 - 300 - 16, left: 16, side: "center" });
  });
});
