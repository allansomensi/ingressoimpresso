import type { ReportRowDto } from "@ingressoimpresso/api-types";
import { describe, expect, it } from "vitest";

import { firstOutside, firstShared, formatRanges, intersect, parseNumberList, subtract } from "@/lib/number-list";
import { receivedPercent, settlementMessage, settlementState, settlementTotals, shortDay, todayIso, whatsappLink } from "@/lib/settlement";

function row(overrides: Partial<ReportRowDto>): ReportRowDto {
  return {
    sellerId: "s",
    seller: "Maria Souza",
    tickets: 40,
    unsold: 5,
    lost: 1,
    revoked: 0,
    declaredSold: 34,
    entries: 0,
    offlineDuplicates: 0,
    blockedCopies: 0,
    voidEntries: 0,
    amountDueCents: 68000,
    receivedCents: 50000,
    balanceCents: 18000,
    markedSold: 0,
    reserved: 0,
    boxOffice: false,
    ...overrides,
  };
}

describe("number lists", () => {
  it("reads numbers the way people type them", () => {
    expect(parseNumberList("12, 15, 40-50")).toEqual({
      ok: true,
      ranges: [
        { first: 12, last: 12 },
        { first: 15, last: 15 },
        { first: 40, last: 50 },
      ],
      count: 13,
    });
    expect(parseNumberList("40 a 50; nº 7")).toEqual({
      ok: true,
      ranges: [
        { first: 7, last: 7 },
        { first: 40, last: 50 },
      ],
      count: 12,
    });
    expect(parseNumberList("0040 – 0042\n1.500")).toMatchObject({
      ok: true,
      ranges: [
        { first: 40, last: 42 },
        { first: 1500, last: 1500 },
      ],
    });
  });

  it("takes a dot between numbers as a separator, but keeps 1.500 as one thousand five hundred", () => {
    expect(parseNumberList("12.15.16")).toEqual({
      ok: true,
      ranges: [
        { first: 12, last: 12 },
        { first: 15, last: 16 },
      ],
      count: 3,
    });
    expect(parseNumberList("1.500")).toEqual({ ok: true, ranges: [{ first: 1500, last: 1500 }], count: 1 });
  });

  it("merges repeats, overlaps and neighbours instead of failing", () => {
    expect(parseNumberList("12 12 13, 10-14")).toEqual({ ok: true, ranges: [{ first: 10, last: 14 }], count: 5 });
  });

  it("points at what it cannot read", () => {
    expect(parseNumberList("   ")).toEqual({ ok: false, error: "empty" });
    expect(parseNumberList("12, abc")).toEqual({ ok: false, error: "invalid", token: "abc" });
    expect(parseNumberList("50-40")).toEqual({ ok: false, error: "invalid", token: "50-40" });
    expect(parseNumberList("0")).toEqual({ ok: false, error: "invalid", token: "0" });
    expect(parseNumberList(Array.from({ length: 101 }, (_, index) => String(index * 2 + 1)).join(","))).toEqual({
      ok: false,
      error: "too_many",
    });
  });

  it("checks numbers against what a seller holds", () => {
    const held = [
      { first: 1, last: 10 },
      { first: 11, last: 20 },
      { first: 41, last: 50 },
    ];
    expect(firstOutside([{ first: 5, last: 15 }], held)).toBeNull();
    expect(firstOutside([{ first: 18, last: 42 }], held)).toBe(21);
    expect(firstOutside([{ first: 60, last: 60 }], held)).toBe(60);
    expect(firstShared([{ first: 1, last: 9 }], [{ first: 7, last: 30 }])).toBe(7);
    expect(firstShared([{ first: 1, last: 5 }], [{ first: 7, last: 30 }])).toBeNull();
    expect(intersect([{ first: 8, last: 45 }], held)).toEqual([
      { first: 8, last: 20 },
      { first: 41, last: 45 },
    ]);
  });

  it("formats like the printed numbers", () => {
    expect(
      formatRanges([
        { first: 12, last: 12 },
        { first: 40, last: 50 },
      ]),
    ).toBe("0012, 0040–0050");
  });
});

describe("settlement", () => {
  it("says where a seller stands", () => {
    expect(settlementState(row({}))).toEqual({ kind: "owing", cents: 18000 });
    expect(settlementState(row({ balanceCents: 0 }))).toEqual({ kind: "settled" });
    expect(settlementState(row({ balanceCents: -2000 }))).toEqual({ kind: "overpaid", cents: 2000 });
    expect(settlementState(row({ balanceCents: null, amountDueCents: null }))).toEqual({ kind: "no_price" });
    expect(settlementState(row({ tickets: 0, receivedCents: 0, balanceCents: 0 }))).toEqual({ kind: "empty" });
  });

  it("measures progress and sums only sellers who hold tickets", () => {
    expect(receivedPercent(row({}))).toBe(74);
    expect(receivedPercent(row({ receivedCents: 90000 }))).toBe(100);
    expect(receivedPercent(row({ amountDueCents: 0, receivedCents: 0 }))).toBe(0);
    expect(
      settlementTotals([
        row({}),
        row({ sellerId: "b", balanceCents: 0, receivedCents: 68000 }),
        row({ sellerId: "c", balanceCents: -1000, receivedCents: 69000 }),
        row({ sellerId: "d", tickets: 0, declaredSold: 0, amountDueCents: 0, receivedCents: 0, balanceCents: 0 }),
      ]),
    ).toEqual({ dueCents: 204000, receivedCents: 187000, outstandingCents: 18000, overpaidCents: 1000, settled: 2, active: 3 });
  });

  it("writes the WhatsApp summary", () => {
    const message = settlementMessage({
      seller: "Maria Souza",
      eventName: "Show da Banda",
      ranges: [{ first: 1, last: 40 }],
      row: row({}),
      priceCents: 2000,
    });
    expect(message.replaceAll("\u00a0", " ").split("\n")).toEqual([
      "Oi, Maria! Seu acerto do *Show da Banda*:",
      "",
      "🎟️ Levou 40 ingressos (0001–0040)",
      "↩️ Devolveu 5 · perdeu 1",
      "🧾 A acertar: 34 × R$ 20,00 = R$ 680,00",
      "💰 Já recebido: R$ 500,00",
      "",
      "👉 Falta: *R$ 180,00*",
    ]);
  });

  it("links to the seller's WhatsApp with the country code", () => {
    expect(whatsappLink("(11) 98888-7777", "oi")).toBe("https://wa.me/5511988887777?text=oi");
    expect(whatsappLink("011 3333-4444", "oi")).toBe("https://wa.me/551133334444?text=oi");
    expect(whatsappLink("+55 21 99999-0000", "a b")).toBe("https://wa.me/5521999990000?text=a%20b");
    expect(whatsappLink("9999-0000", "oi")).toBe("https://wa.me/?text=oi");
    expect(whatsappLink(null, "oi")).toBe("https://wa.me/?text=oi");
  });

  it("formats days", () => {
    const now = new Date(2026, 9, 11, 23, 30);
    expect(todayIso(now)).toBe("2026-10-11");
    expect(shortDay("2026-10-02", now)).toBe("02/10");
    expect(shortDay("2025-12-31", now)).toBe("31/12/25");
  });
});

describe("what a seller still holds", () => {
  it("subtracts returned numbers from the seller's ranges", () => {
    expect(
      subtract(
        [{ first: 1, last: 40 }],
        [
          { first: 12, last: 12 },
          { first: 36, last: 45 },
        ],
      ),
    ).toEqual([
      { first: 1, last: 11 },
      { first: 13, last: 35 },
    ]);
    expect(subtract([{ first: 1, last: 10 }], [{ first: 1, last: 10 }])).toEqual([]);
    expect(subtract([{ first: 5, last: 9 }], [{ first: 20, last: 30 }])).toEqual([{ first: 5, last: 9 }]);
  });
});
