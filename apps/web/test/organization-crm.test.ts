import type { TimelineEntryDto } from "@ingressoimpresso/api-types";
import { describe, expect, it } from "vitest";

import {
  filterTimeline,
  isCooling,
  mergeTimeline,
  normalizeTag,
} from "@/lib/organization-crm";

const entry = (
  kind: TimelineEntryDto["kind"],
  at = "2026-10-01T12:00:00Z",
): TimelineEntryDto => ({
  at,
  kind,
  code: null,
  detail: null,
  amountCents: null,
  count: null,
  actor: null,
  eventId: null,
  eventName: null,
});

describe("isCooling", () => {
  const now = new Date("2026-10-20T12:00:00Z");
  it("is a paying organization idle for more than 60 days", () => {
    expect(
      isCooling(
        { paidTickets: 100, lastActivityAt: "2026-08-01T12:00:00Z" },
        now,
      ),
    ).toBe(true);
    expect(
      isCooling(
        { paidTickets: 100, lastActivityAt: "2026-09-01T12:00:00Z" },
        now,
      ),
    ).toBe(false);
  });
  it("never flags an account that never paid or never signed in", () => {
    expect(
      isCooling(
        { paidTickets: 0, lastActivityAt: "2026-01-01T12:00:00Z" },
        now,
      ),
    ).toBe(false);
    expect(isCooling({ paidTickets: 10, lastActivityAt: null }, now)).toBe(
      false,
    );
  });
});

describe("timeline", () => {
  it("filters by group", () => {
    const entries = [
      entry("login"),
      entry("batch_paid"),
      entry("email"),
      entry("note"),
      entry("credit"),
    ];
    expect(filterTimeline(entries, "money").map((item) => item.kind)).toEqual([
      "batch_paid",
      "credit",
    ]);
    expect(filterTimeline(entries, "admin").map((item) => item.kind)).toEqual([
      "note",
    ]);
    expect(filterTimeline(entries, "all")).toHaveLength(5);
  });
  it("merges pages without repeats", () => {
    const shared = entry("login", "2026-10-01T10:00:00Z");
    expect(
      mergeTimeline([
        [entry("signup"), shared],
        [shared, entry("email", "2026-09-01T10:00:00Z")],
      ]),
    ).toHaveLength(3);
  });
});

describe("normalizeTag", () => {
  it("keeps labels as the server does", () => {
    expect(normalizeTag("  Grande   Cliente ")).toBe("grande cliente");
  });
});
