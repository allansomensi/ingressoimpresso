import { describe, expect, it } from "vitest";

import { eventPhase, sortEvents } from "@/lib/event-list";

const NOW = Date.parse("2026-10-11T15:00:00-03:00");

function event(name: string, startsAt: string, endsAt: string, status: "active" | "closed" = "active") {
  return { name, startsAt, endsAt, status };
}

describe("event list", () => {
  it("tells where each event stands", () => {
    expect(eventPhase(event("a", "2026-10-11T14:00:00-03:00", "2026-10-11T18:00:00-03:00"), NOW)).toBe("happening");
    expect(eventPhase(event("b", "2026-10-11T20:00:00-03:00", "2026-10-11T23:00:00-03:00"), NOW)).toBe("today");
    expect(eventPhase(event("c", "2026-11-01T20:00:00-03:00", "2026-11-01T23:00:00-03:00"), NOW)).toBe("upcoming");
    expect(eventPhase(event("d", "2026-09-01T20:00:00-03:00", "2026-09-01T23:00:00-03:00"), NOW)).toBe("past");
    expect(eventPhase(event("e", "2026-11-01T20:00:00-03:00", "2026-11-01T23:00:00-03:00", "closed"), NOW)).toBe("archived");
  });

  it("puts what needs attention first: now, today, the next ones, then the ones that ended", () => {
    const list = [
      event("ended long ago", "2026-01-10T20:00:00-03:00", "2026-01-10T23:00:00-03:00"),
      event("in December", "2026-12-10T20:00:00-03:00", "2026-12-10T23:00:00-03:00"),
      event("tonight", "2026-10-11T20:00:00-03:00", "2026-10-11T23:00:00-03:00"),
      event("ended last month", "2026-09-10T20:00:00-03:00", "2026-09-10T23:00:00-03:00"),
      event("in November", "2026-11-10T20:00:00-03:00", "2026-11-10T23:00:00-03:00"),
      event("right now", "2026-10-11T14:00:00-03:00", "2026-10-11T18:00:00-03:00"),
    ];
    expect(sortEvents(list, NOW).map((item) => item.name)).toEqual([
      "right now",
      "tonight",
      "in November",
      "in December",
      "ended last month",
      "ended long ago",
    ]);
  });

  it("shows archived events latest first", () => {
    const list = [
      event("old", "2025-06-01T20:00:00-03:00", "2025-06-01T23:00:00-03:00", "closed"),
      event("recent", "2026-06-01T20:00:00-03:00", "2026-06-01T23:00:00-03:00", "closed"),
    ];
    expect(sortEvents(list, NOW).map((item) => item.name)).toEqual(["recent", "old"]);
  });
});
