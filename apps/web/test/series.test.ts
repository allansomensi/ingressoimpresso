import { describe, expect, it } from "vitest";

import { addDays, hourLabel, nextDateStart, positionLabel, sessionLabel } from "@/lib/series";

describe("several dates of an event (ADR 0077)", () => {
  it("names a session in the event's own wall-clock time", () => {
    expect(sessionLabel("2026-11-12T20:00:00-03:00")).toBe("Sessão de 12/11 às 20h");
    expect(sessionLabel("2026-03-05T21:30:00-04:00")).toBe("Sessão de 05/03 às 21h30");
    expect(hourLabel("2026-11-12T09:05:00-03:00")).toBe("9h05");
    expect(positionLabel({ position: 2, dates: 3 })).toBe("Data 2 de 3");
  });

  it("offers the day after the latest date as the next one", () => {
    expect(addDays("2026-12-31T20:00", 1)).toBe("2027-01-01T20:00");
    expect(nextDateStart([], "2026-11-12T20:00:00-03:00")).toBe("2026-11-13T20:00");
    expect(nextDateStart(["2026-11-13T20:00:00-03:00", "2026-11-15T19:00:00-03:00"], "2026-11-12T20:00:00-03:00")).toBe("2026-11-16T19:00");
  });
});
