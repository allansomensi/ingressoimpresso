import { describe, expect, it } from "vitest";

import { eventPhase, groupSeries, sortEvents } from "@/lib/event-list";

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

  it("puts a canceled event with the ones that ended (ADR 0065)", () => {
    const canceled = { ...event("canceled", "2026-11-01T20:00:00-03:00", "2026-11-01T23:00:00-03:00"), change: { canceledAt: "2026-10-01T12:00:00Z" } };
    expect(eventPhase(canceled, NOW)).toBe("canceled");
    expect(eventPhase({ ...canceled, status: "closed" }, NOW)).toBe("archived");
    expect(eventPhase({ ...canceled, change: { canceledAt: null } }, NOW)).toBe("upcoming");
    const list = [canceled, event("ended", "2026-09-10T20:00:00-03:00", "2026-09-10T23:00:00-03:00"), event("next", "2026-12-10T20:00:00-03:00", "2026-12-10T23:00:00-03:00")];
    expect(sortEvents(list, NOW).map((item) => item.name)).toEqual(["next", "canceled", "ended"]);
  });

  it("keeps the dates of a series together, in the place of the one that needs attention first (ADR 0077)", () => {
    const series = { id: "s1", name: "Peça" };
    const dated = (name: string, startsAt: string, inSeries: boolean, missing: number | null = null) => ({
      ...event(name, startsAt, startsAt.replace("T20", "T23")),
      id: name,
      series: inSeries ? series : null,
      checklistMissing: missing,
    });
    const list = sortEvents(
      [
        dated("peça 2", "2026-11-14T20:00:00-03:00", true, 2),
        dated("show", "2026-10-20T20:00:00-03:00", false),
        dated("peça 1", "2026-10-11T20:00:00-03:00", true, 1),
        dated("feira", "2026-12-01T20:00:00-03:00", false),
      ],
      NOW,
    );
    const entries = groupSeries(list);
    expect(entries.map((entry) => (entry.kind === "event" ? entry.event.name : entry.name))).toEqual(["Peça", "show", "feira"]);
    const group = entries[0];
    expect(group?.kind).toBe("series");
    if (group?.kind === "series") {
      expect(group.lead.name).toBe("peça 1");
      expect(group.dates.map((date) => date.name)).toEqual(["peça 1", "peça 2"]);
      expect(group.missing).toBe(3);
    }
    // A series with one date in the list (the others archived) is a plain event.
    expect(groupSeries([dated("peça 2", "2026-11-14T20:00:00-03:00", true)])[0]?.kind).toBe("event");
    // No checklist on any date (all ended): nothing missing to show.
    const ended = groupSeries([dated("a", "2026-01-10T20:00:00-03:00", true), dated("b", "2026-01-11T20:00:00-03:00", true)]);
    expect(ended[0]?.kind === "series" ? ended[0].missing : undefined).toBeNull();
  });
});
