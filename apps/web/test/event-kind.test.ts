import { describe, expect, it } from "vitest";

import { tabHint, tabLabel, tabsOf } from "@/components/event/tabs";
import { forKind } from "@/lib/event-kind";
import { doorWords, viewOf, wrongDoorView, type DoorContext } from "@/portaria/logic";
import { recentScans } from "@/portaria/recent";
import { event as eventTexts } from "@/texts/pt-BR/event";
import { portaria as portariaTexts } from "@/texts/pt-BR/portaria";

const tokens: DoorContext = {
  digits: 4,
  sellers: [],
  categories: [{ name: "Pastel", color: "#e11d48", first: 1, last: 50 }],
  seats: [],
  kind: "tokens",
};

describe("consumption tokens (ADR 0084)", () => {
  it("lay the words of tokens over the ticket ones", () => {
    const base = { title: "Ingressos", hint: "Para a portaria", count: (n: number) => `${String(n)} ingressos` };
    const words = forKind(base, { title: "Fichas" }, "tokens");
    expect(words).toMatchObject({ title: "Fichas", hint: "Para a portaria" });
    expect(words.count(2)).toBe("2 ingressos");
    expect(forKind(base, { title: "Fichas" }, "tickets")).toBe(base);
    expect(forKind(base, { title: "Fichas" }, undefined)).toBe(base);
  });

  it("lay nested words at any depth, replace lists whole and merge once", () => {
    const base = { a: { b: "ingresso", c: "porta" }, list: ["um", "dois"], n: 1 };
    const tokens = { a: { b: "ficha" }, list: ["três"] };
    const words = forKind(base, tokens, "tokens");
    expect(words).toEqual({ a: { b: "ficha", c: "porta" }, list: ["três"], n: 1 });
    expect(forKind(base, tokens, "tokens")).toBe(words);
    expect(base.a.b).toBe("ingresso");
  });

  it("speak of fichas on every tab of a token event (ADR 0086)", () => {
    const words = forKind(eventTexts, eventTexts.tokens, "tokens");
    expect(words.priceLabel("R$ 5,00")).toBe("R$ 5,00 a ficha");
    expect(words.batches.quantity).toBe(eventTexts.tokens.batches.quantity);
    expect(words.batches.newBatch).toBe(eventTexts.batches.newBatch);
    expect(words.sellers.ticketsCount(2)).toBe("2 fichas");
    expect(words.files.tickets(1)).toBe("1 ficha");
    expect(words.live.byDoor).toBe("Por barraca");
    expect(words.report.categories.title).toBe("Por produto");
    // No token word may still name a ticket or a door.
    const leftovers = JSON.stringify(eventTexts.tokens, (_key, value: unknown) => (typeof value === "function" ? String(value) : value));
    expect(/ingresso|portaria|\bporta\b/i.exec(leftovers)?.[0]).toBeUndefined();
  });

  it("show no guest list and name the tabs for a stall", () => {
    expect(tabsOf("tokens")).not.toContain("guests");
    expect(tabsOf("tickets")).toContain("guests");
    expect(tabsOf(undefined)).toContain("guests");
    expect(tabLabel("categories", "tokens")).toBe(eventTexts.tokens.tabs.categories);
    expect(tabLabel("door", "tokens")).toBe(eventTexts.tokens.tabs.door);
    expect(tabLabel("door", "tickets")).toBe(eventTexts.tabs.door);
    expect(tabLabel("overview", "tokens")).toBe(eventTexts.tabs.overview);
    expect(tabHint("live", "tokens")).toBe(eventTexts.tokens.sections.hints.live);
    expect(tabHint("team", "tokens")).toBe(eventTexts.sections.hints.team);
  });

  it("speak of fichas at the stall", () => {
    const r = portariaTexts.tokens.result;
    expect(viewOf({ kind: "admit", number: 3 }, tokens)).toMatchObject({
      tone: "ok",
      title: r.admit,
      category: { name: "Pastel", color: "#e11d48" },
    });
    expect(viewOf({ kind: "already_entered", number: 3, firstEntry: { atUnixMs: 0, deviceName: "Barraca 2" } }, tokens).title).toBe(r.alreadyEntered);
    expect(viewOf({ kind: "voided", number: 3, reason: "lost" }, tokens).title).toBe(r.voided);
    expect(viewOf({ kind: "invalid", reason: "bad_signature" }, tokens).title).toBe(r.invalid);
    expect(wrongDoorView(3, { category: "Pastel", doors: ["Barraca 1"] }, tokens)).toMatchObject({
      title: r.wrongDoor,
      detail: r.wrongDoorGo("Pastel", ["Barraca 1"]),
    });
    // Tickets keep their words.
    expect(viewOf({ kind: "admit", number: 3 }, { ...tokens, kind: "tickets" }).title).toBe(portariaTexts.result.admit);
  });

  it("keep every other door word when only some change", () => {
    const words = doorWords("tokens");
    expect(words.scanHint).toBe(portariaTexts.tokens.scanHint);
    expect(words.entries(2)).toBe(portariaTexts.tokens.entries(2));
    expect(words.history.title).toBe(portariaTexts.tokens.history.title);
    expect(words.history.close).toBe(portariaTexts.history.close);
    expect(words.rehearsal.wouldAdmit).toBe(portariaTexts.tokens.rehearsal.wouldAdmit);
    expect(words.rehearsal.finish).toBe(portariaTexts.rehearsal.finish);
    expect(doorWords("tickets")).toBe(portariaTexts);
  });

  it("list the stall's history as used fichas", () => {
    const recent = recentScans([{ id: "a", number: 3, outcome: "admitted", scannedAtMs: 0, synced: 1 }], [], tokens);
    expect(recent[0]?.label).toBe(portariaTexts.tokens.history.outcomes.admitted);
  });
});
