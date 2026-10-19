import { describe, expect, it } from "vitest";

import { currentDay, dayLabel, ledgerDay, onDayLabel, ruleShort, validOn, validityText, type EventDay } from "@/lib/event-days";

// The same weekend as `event_days.rs`: the party of Saturday goes past midnight.
const weekend: EventDay[] = [
  { position: 1, startsAt: "2026-11-21T18:00:00-03:00", endsAt: "2026-11-22T01:00:00-03:00" },
  { position: 2, startsAt: "2026-11-22T12:00:00-03:00", endsAt: "2026-11-22T20:00:00-03:00" },
];
const at = (iso: string) => Date.parse(iso);

describe("event days (ADR 0091)", () => {
  it("puts the border halfway between days, like the server", () => {
    expect(currentDay(weekend, at("2026-11-20T10:00:00-03:00"))).toBe(1);
    expect(currentDay(weekend, at("2026-11-22T00:30:00-03:00"))).toBe(1);
    expect(currentDay(weekend, at("2026-11-22T06:29:00-03:00"))).toBe(1);
    expect(currentDay(weekend, at("2026-11-22T06:30:00-03:00"))).toBe(2);
    expect(currentDay(weekend, at("2026-11-23T10:00:00-03:00"))).toBe(2);
    expect(currentDay(weekend.slice(0, 1), at("2026-11-22T10:00:00-03:00"))).toBeNull();
  });

  it("knows which days a rule allows", () => {
    expect(validOn("days", [2], 2)).toBe(true);
    expect(validOn("days", [2], 1)).toBe(false);
    expect(validOn("every", [], 1)).toBe(true);
    expect(validOn("any_one", [], 2)).toBe(true);
    // An event of one day: every category is valid.
    expect(validOn("days", [2], null)).toBe(true);
  });

  it("chooses the book: the day's, or the whole event's", () => {
    expect(ledgerDay("every", 2)).toBe(2);
    expect(ledgerDay("days", 1)).toBe(1);
    expect(ledgerDay("any_one", 2)).toBeNull();
    expect(ledgerDay("every", null)).toBeNull();
    // A checkpoint used once in the whole event (the kit).
    expect(ledgerDay("every", 2, false)).toBeNull();
  });

  it("names the days with the right article", () => {
    expect(dayLabel(weekend[0]?.startsAt ?? "")).toBe("sábado 21/11");
    expect(onDayLabel(weekend[1]?.startsAt ?? "")).toBe("no domingo 22/11");
    expect(onDayLabel("2026-11-20T18:00:00-03:00")).toBe("na sexta 20/11");
  });

  it("tells the holder where the ticket is valid", () => {
    expect(validityText("every", [], weekend)).toBe("Vale em todos os dias (sábado 21/11 e domingo 22/11), uma entrada por dia.");
    expect(validityText("days", [2], weekend)).toBe("Vale só no domingo 22/11.");
    expect(validityText("any_one", [], weekend)).toBe("Vale um dia, à escolha (sábado 21/11 e domingo 22/11): uma entrada só.");
    expect(validityText("every", [], weekend.slice(0, 1))).toBeNull();
    expect(ruleShort("days", [1], weekend)).toBe("Só sábado 21/11");
    expect(ruleShort("any_one", [], weekend)).toBe("1 dia, à escolha");
  });
});
