import { describe, expect, it } from "vitest";

import {
  brasiliaMonth,
  heatLevel,
  monthName,
  recentMonths,
  shortMonth,
} from "@/lib/revenue-reports";

describe("months", () => {
  it("are counted in Brasília time", () => {
    // 01/11 01:00 UTC is still 31/10 in Brasília.
    expect(brasiliaMonth(new Date("2026-11-01T01:00:00Z"))).toBe("2026-10");
    expect(brasiliaMonth(new Date("2026-11-01T03:00:00Z"))).toBe("2026-11");
  });
  it("go back across years", () => {
    expect(recentMonths(new Date("2026-02-10T12:00:00Z"), 4)).toEqual([
      "2026-02",
      "2026-01",
      "2025-12",
      "2025-11",
    ]);
  });
  it("read in Portuguese", () => {
    expect(monthName("2026-03")).toBe("março de 2026");
    expect(shortMonth("2026-10")).toBe("out/26");
  });
});

describe("heatLevel", () => {
  it("scales to the largest value", () => {
    expect(heatLevel(0, 100)).toBe(0);
    expect(heatLevel(-5, 100)).toBe(0);
    expect(heatLevel(1, 100)).toBe(1);
    expect(heatLevel(60, 100)).toBe(3);
    expect(heatLevel(100, 100)).toBe(4);
  });
});
