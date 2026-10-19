import type { DoorGuestDto } from "@ingressoimpresso/api-types";
import { describe, expect, it } from "vitest";

import {
  GUEST_UNDO_MS,
  SAMPLE_QR_TEXT,
  boxOfficePrice,
  boxOfficeTotals,
  canUndoArrival,
  guestState,
  isSampleQr,
  normalizeName,
  canRehearse,
  rehearsalView,
  searchGuests,
  viewOf,
  wrongDoor,
  type DoorContext,
  type GuestArrival,
} from "@/portaria/logic";

const VIP = "11111111-1111-4111-8111-111111111111";
const PISTA = "22222222-2222-4222-8222-222222222222";

const context: DoorContext = {
  digits: 4,
  sellers: [
    { seller: "João", first: 1, last: 50 },
    { seller: "Bilheteria", first: 51, last: 60, boxOffice: true },
  ],
  categories: [
    { id: VIP, name: "VIP", color: "#7c3aed", first: 1, last: 10, priceCents: 8000 },
    { id: PISTA, name: "Pista", color: "#2563eb", first: 11, last: 55, priceCents: null },
    { id: "33333333-3333-4333-8333-333333333333", name: "Cortesia", color: "#16a34a", first: 56, last: 57, priceCents: 0 },
  ],
  seats: [],
  priceCents: 2000,
  allowedCategoryIds: [PISTA],
  doors: [
    { label: "Portão VIP", categoryIds: [VIP] },
    { label: "Portão geral", categoryIds: [] },
  ],
};

describe("rehearsal (ADR 0067)", () => {
  it("recognizes the sample QR of the previews exactly", () => {
    // ticket_render::sample_qr_text: base45 of [0x00, 0xFF × 73], 111 characters.
    expect(SAMPLE_QR_TEXT).toHaveLength(111);
    expect(SAMPLE_QR_TEXT.startsWith("U50FGW")).toBe(true);
    expect(isSampleQr(SAMPLE_QR_TEXT)).toBe(true);
    expect(isSampleQr(` ${SAMPLE_QR_TEXT}\n`)).toBe(true);
    expect(isSampleQr(SAMPLE_QR_TEXT.slice(1))).toBe(false);
    expect(isSampleQr("https://exemplo.com")).toBe(false);
  });

  it("says the camera works on a sample and explains any other code", () => {
    const sample = rehearsalView(SAMPLE_QR_TEXT, { kind: "invalid", reason: "malformed" }, context);
    expect(sample).toMatchObject({ tone: "ok", title: "AMOSTRA LIDA", rehearsal: true, number: null });
    const other = rehearsalView("https://exemplo.com", { kind: "invalid", reason: "malformed" }, context);
    expect(other).toMatchObject({ tone: "warn", title: "NÃO É UM INGRESSO", rehearsal: true });
  });

  it("shows what would happen to a real ticket, without the way around the wrong door", () => {
    // Never the green of real work: the volunteer cannot mistake it for an entry.
    expect(rehearsalView("x", { kind: "admit", number: 20 }, context)).toMatchObject({ tone: "warn", title: "ENTRARIA", rehearsal: true });
    expect(rehearsalView("x", { kind: "admit", number: 3 }, context)).toMatchObject({ tone: "warn", action: null, rehearsal: true });
    expect(rehearsalView("x", { kind: "invalid", reason: "bad_signature" }, context)).toMatchObject({ tone: "bad", rehearsal: true });
  });
});

describe("door by category (ADR 0068)", () => {
  it("lets in the door's categories and numbers without a category", () => {
    expect(wrongDoor(context, 20)).toBeNull();
    expect(wrongDoor(context, 99)).toBeNull();
    expect(wrongDoor({ ...context, allowedCategoryIds: [] }, 3)).toBeNull();
  });

  it("sends another category to the doors that list it, else to the open ones", () => {
    expect(wrongDoor(context, 3)).toEqual({ category: "VIP", doors: ["Portão VIP"] });
    expect(wrongDoor(context, 56)).toEqual({ category: "Cortesia", doors: ["Portão geral"] });
    expect(wrongDoor({ ...context, doors: [] }, 3)).toEqual({ category: "VIP", doors: [] });
  });

  it("never restricts a manifest saved before categories had ids", () => {
    const old = { ...context, categories: context.categories.map(({ name, color, first, last }) => ({ name, color, first, last })) };
    expect(wrongDoor(old, 3)).toBeNull();
  });
});

describe("box office (ADR 0069)", () => {
  it("charges the category's price, else the event's; zero is a courtesy", () => {
    expect(boxOfficePrice(context, 20)).toBeUndefined();
    expect(boxOfficePrice(context, 52)).toBe(2000);
    expect(boxOfficePrice(context, 56)).toBe(0);
    expect(boxOfficePrice({ ...context, priceCents: null }, 52)).toBeNull();
    expect(viewOf({ kind: "admit", number: 52 }, context).charge).toBe("Bilheteria · cobrar R$ 20,00");
    expect(viewOf({ kind: "admit", number: 56 }, context).charge).toBe("Bilheteria · cortesia");
    expect(viewOf({ kind: "admit", number: 52 }, { ...context, priceCents: null }).charge).toBe("Bilheteria · cobrar o valor combinado");
    expect(viewOf({ kind: "admit", number: 20 }, context).charge).toBeUndefined();
  });

  it("adds up each number once", () => {
    expect(boxOfficeTotals(context, [52, 52, 53, 56, 20])).toEqual({ count: 3, cents: 4000, unpriced: 0 });
  });
});

describe("guest list (ADR 0070)", () => {
  const guests: DoorGuestDto[] = [
    { id: "g1", name: "Maria Souza", companions: 2, note: "camarim", category: null },
    { id: "g2", name: "José Álvares", companions: 0, note: null, category: null },
    { id: "g3", name: "Ana Maria Lima", companions: 1, note: null, category: null },
  ];

  it("searches without accents or case, by the start of words", () => {
    expect(normalizeName("  JOSÉ   Álvares ")).toBe("jose alvares");
    expect(searchGuests(guests, "jose").map((guest) => guest.id)).toEqual(["g2"]);
    expect(searchGuests(guests, "alv").map((guest) => guest.id)).toEqual(["g2"]);
    // Names that start with the query first.
    expect(searchGuests(guests, "maria").map((guest) => guest.id)).toEqual(["g1", "g3"]);
    expect(searchGuests(guests, "cama").map((guest) => guest.id)).toEqual(["g1"]);
    expect(searchGuests(guests, "aria")).toEqual([]);
    expect(searchGuests(guests, "")).toHaveLength(3);
  });

  const arrival = (id: string, people: number, atUnixMs: number, undoneAtMs: number | null = null): GuestArrival => ({
    id,
    guestId: "g1",
    people,
    atUnixMs,
    deviceName: id.startsWith("a") ? "Porta A" : "Porta B",
    undoneAtMs,
  });

  it("takes the earliest arrival that was not undone, whatever the order they arrived in", () => {
    const arrivals = [arrival("b1", 3, 2_000), arrival("a1", 2, 1_000)];
    const state = guestState(guests[0] as DoorGuestDto, arrivals);
    expect(state.first?.deviceName).toBe("Porta A");
    expect(state.people).toBe(3);
    expect(state.party).toBe(3);
    expect(guestState(guests[0] as DoorGuestDto, [...arrivals].reverse())).toEqual(state);
    const undone = guestState(guests[0] as DoorGuestDto, [arrival("b1", 3, 2_000), arrival("a1", 2, 1_000, 1_500)]);
    expect(undone.first?.deviceName).toBe("Porta B");
    expect(guestState(guests[1] as DoorGuestDto, arrivals)).toMatchObject({ people: 0, first: null, party: 1 });
  });

  it("undoes only this phone's arrival, for two minutes", () => {
    const mine = arrival("a1", 1, 10_000);
    const own = new Set(["a1"]);
    expect(canUndoArrival(mine, own, 10_000 + GUEST_UNDO_MS - 1)).toBe(true);
    expect(canUndoArrival(mine, own, 10_000 + GUEST_UNDO_MS)).toBe(false);
    expect(canUndoArrival(mine, new Set(), 10_001)).toBe(false);
    expect(canUndoArrival(arrival("a1", 1, 10_000, 10_500), own, 10_600)).toBe(false);
  });
});

describe("rehearsal entry (ADR 0067)", () => {
  it("is offered only before the first ticket entered", () => {
    expect(canRehearse(0, false)).toBe(true);
    expect(canRehearse(1, false)).toBe(false);
    // A rehearsal already open can always be finished.
    expect(canRehearse(5, true)).toBe(true);
  });
});
