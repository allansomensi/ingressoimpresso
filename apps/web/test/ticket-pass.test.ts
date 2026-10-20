import { describe, expect, it } from "vitest";

import type { TicketPassDto } from "@ingressoimpresso/api-types";

import { NO_CHANGE } from "@/lib/event-change";
import { sortMyTickets, type MyTicket } from "@/lib/my-tickets";
import { normalizePass, passBand, passDate, textOn } from "@/lib/ticket-pass";

describe("digital ticket helpers", () => {
  it("reads the date in the event's own time", () => {
    expect(passDate("2026-11-20T22:00:00-03:00")).toBe("sexta-feira, 20 de novembro de 2026 · 22:00");
  });

  it("keeps dark designs and swaps near-white ones for the brand", () => {
    expect(passBand("#1a1a2e")).toBe("#1a1a2e");
    expect(passBand("#ffffff")).toBe("#5b3df5");
    expect(passBand("#f8f6f0")).toBe("#5b3df5");
    expect(passBand("nope")).toBe("#5b3df5");
    // The organization's colour replaces the site's (ADR 0064).
    expect(passBand("#ffffff", "#1a7f5a")).toBe("#1a7f5a");
    expect(passBand("#1a1a2e", "#1a7f5a")).toBe("#1a1a2e");
    expect(passBand("#ffffff", "verde")).toBe("#5b3df5");
  });

  it("opens passes saved before the profile, the changes and the room", () => {
    const old = {
      event: { name: "Show", venue: "Bar", startsAt: "2026-11-20T22:00:00-03:00", endsAt: "2026-11-21T03:00:00-03:00", organizer: "Banda" },
      number: 7,
      numberLabel: "0007",
      numberPrefix: "Nº ",
      holderName: null,
      qrText: "QR",
      state: "valid",
      enteredAt: null,
      backgroundColor: "#ffffff",
    } as unknown as TicketPassDto;
    const pass = normalizePass(old);
    expect(pass.organization).toEqual({
      name: "Banda",
      logoPath: null,
      brandColor: null,
      whatsapp: null,
      email: null,
      website: null,
      instagram: null,
    });
    expect(pass.event.change).toEqual(NO_CHANGE);
    expect(pass.event.address).toBeNull();
    expect(pass.event.id).toBe("");
    expect(pass.event.inSeries).toBe(false);
    expect(pass.category).toBeNull();
    expect(pass.seat).toBeNull();
    expect(pass.tableMap).toBeNull();
    expect(pass.qrText).toBe("QR");
  });

  it("picks readable text", () => {
    expect(textOn("#5b3df5")).toBe("#ffffff");
    expect(textOn("#ffd84a")).toBe("#0e0d14");
  });
});

describe("Meus ingressos (ADR 0097)", () => {
  const ticket = (key: string, startsAt: string, endsAt: string, number = 1): MyTicket => ({
    key,
    openable: true,
    pass: { number, event: { startsAt, endsAt } } as unknown as TicketPassDto,
  });

  it("lists the tickets ahead soonest first, then the past ones newest first", () => {
    const now = Date.parse("2026-11-10T12:00:00Z");
    const list = [
      ticket("old", "2026-10-01T22:00:00Z", "2026-10-02T03:00:00Z"),
      ticket("later", "2026-12-01T22:00:00Z", "2026-12-02T03:00:00Z"),
      ticket("today", "2026-11-10T10:00:00Z", "2026-11-10T20:00:00Z"),
      ticket("older", "2026-09-01T22:00:00Z", "2026-09-02T03:00:00Z"),
    ];
    const sorted = sortMyTickets(list, now);
    expect(sorted.upcoming.map((item) => item.key)).toEqual(["today", "later"]);
    expect(sorted.past.map((item) => item.key)).toEqual(["old", "older"]);
  });
});
