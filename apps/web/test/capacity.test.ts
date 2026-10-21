import { describe, expect, it } from "vitest";

import { capacityState, doorOccupied } from "@/lib/capacity";

describe("capacityState", () => {
  it("follows the warning and the limit like the server", () => {
    expect(capacityState(0, 100, 90)).toEqual({ left: 100, ratio: 0, level: "ok" });
    expect(capacityState(89, 100, 90).level).toBe("ok");
    expect(capacityState(90, 100, 90)).toEqual({ left: 10, ratio: 0.9, level: "near" });
    expect(capacityState(100, 100, 90)).toEqual({ left: 0, ratio: 1, level: "full" });
    expect(capacityState(130, 100, 90)).toEqual({ left: 0, ratio: 1, level: "full" });
  });
});

describe("doorOccupied", () => {
  const counts = { reentry: false, entryCount: 30, todayCount: null, insideCount: 0 };
  const arrival = (people: number, atUnixMs: number, undoneAtMs: number | null = null) => ({ people, atUnixMs, undoneAtMs });

  it("counts tickets in and guests who arrived", () => {
    expect(doorOccupied(counts, [arrival(3, 0), arrival(2, 0, 10)], [], 0)).toBe(33);
  });

  it("counts only who is inside with exit and return", () => {
    expect(doorOccupied({ ...counts, reentry: true, insideCount: 12 }, [], [], 0)).toBe(12);
  });

  it("counts today's in an event of several days", () => {
    const day = (position: number, start: string, end: string) => ({ position, startsAt: start, endsAt: end });
    const days = [day(1, "2030-01-01T20:00:00Z", "2030-01-02T04:00:00Z"), day(2, "2030-01-02T20:00:00Z", "2030-01-03T04:00:00Z")];
    const second = Date.parse("2030-01-02T21:00:00Z");
    const first = Date.parse("2030-01-01T21:00:00Z");
    expect(doorOccupied({ ...counts, todayCount: 5 }, [arrival(4, first), arrival(1, second)], days, second)).toBe(6);
  });
});
