import { describe, expect, it } from "vitest";

import {
  RESULT_AUTO_MS,
  dismissPolicy,
  documentOf,
  isEntry,
  numberOf,
  outcomeOf,
  rehearsalView,
  viewOf,
  type DoorContext,
} from "@/portaria/logic";
import { money } from "@/lib/format";
import { recentScans, recentSummary } from "@/portaria/recent";
import type { StoredEntry, StoredScan } from "@/portaria/storage";
import { portaria as portariaTexts } from "@/texts/pt-BR/portaria";

const r = portariaTexts.result;
const at = (time: string): number => new Date(`2026-11-12T${time}:00`).getTime();

const context: DoorContext = {
  digits: 4,
  sellers: [{ seller: "Bilheteria", first: 1, last: 10, boxOffice: true }],
  categories: [
    { name: "Meia", color: "#e11d48", first: 1, last: 5, priceCents: 1000, checkDocument: true, documentNote: "Carteira de estudante" },
    { name: "Idoso", color: "#ca8a04", first: 6, last: 8, checkDocument: true, documentNote: null },
    // Saved by an app before ADR 0082: no document fields at all.
    { name: "Inteira", color: "#2563eb", first: 9, last: 20 },
  ],
  seats: [],
  priceCents: 2000,
};

describe("document at the door (ADR 0082)", () => {
  it("tells which document a category asks for", () => {
    expect(documentOf(context.categories, 3)).toEqual({ category: "Meia", note: "Carteira de estudante" });
    expect(documentOf(context.categories, 7)).toEqual({ category: "Idoso", note: null });
    expect(documentOf(context.categories, 12)).toBeNull();
    expect(documentOf(context.categories, 99)).toBeNull();
  });

  it("puts the document on the green screen and waits for a tap", () => {
    const view = viewOf({ kind: "admit", number: 3 }, context);
    expect(view.tone).toBe("ok");
    expect(view.document).toEqual({ category: "Meia", note: "Carteira de estudante" });
    // The box office charge stays alongside.
    expect(view.charge).toBe(r.boxOfficeCharge(money(1000)));
    expect(dismissPolicy(view)).toEqual({ auto: false });
    const plain = viewOf({ kind: "admit", number: 12 }, context);
    expect(plain.document).toBeUndefined();
  });

  it("does not ask again on a return", () => {
    const view = viewOf({ kind: "readmit", number: 3, exited: { atUnixMs: at("22:10"), deviceName: "Saída" } }, { ...context, reentry: true });
    expect(view.document).toBeUndefined();
    expect(view.charge).toBeUndefined();
    expect(dismissPolicy(view)).toEqual({ auto: true, ms: RESULT_AUTO_MS });
  });
});

describe("exit and return (ADR 0083)", () => {
  const reentry: DoorContext = { ...context, reentry: true };

  it("maps every decision to the outcome it uploads", () => {
    expect(outcomeOf({ kind: "readmit", number: 4, exited: { atUnixMs: 0, deviceName: "Saída" } })).toBe("readmitted");
    expect(outcomeOf({ kind: "exit", number: 4 })).toBe("exited");
    expect(outcomeOf({ kind: "already_out", number: 4, exited: { atUnixMs: 0, deviceName: "Saída" } })).toBe("rejected_already_out");
    expect(numberOf({ kind: "exit", number: 4 })).toBe(4);
    expect(numberOf({ kind: "other_event", eventTag: 9 })).toBeNull();
    expect(isEntry({ kind: "readmit", number: 4, exited: { atUnixMs: 0, deviceName: "Saída" } })).toBe(true);
    expect(isEntry({ kind: "exit", number: 4 })).toBe(false);
  });

  it("shows the exit in blue, leaving by itself", () => {
    const view = viewOf({ kind: "exit", number: 4 }, reentry);
    expect(view).toMatchObject({ tone: "exit", title: r.exit, number: "Nº 0004", detail: r.exitDetail, seller: null });
    expect(dismissPolicy(view)).toEqual({ auto: true, ms: RESULT_AUTO_MS });
  });

  it("explains a ticket read twice on the way out", () => {
    const view = viewOf({ kind: "already_out", number: 4, exited: { atUnixMs: at("22:10"), deviceName: "Saída 1" } }, reentry);
    expect(view.tone).toBe("warn");
    expect(view.title).toBe(r.alreadyOut);
    expect(view.detail).toBe(r.alreadyOutAt("22:10", "Saída 1"));
    expect(dismissPolicy(view)).toEqual({ auto: false });
  });

  it("lets a return in green, saying where it went out", () => {
    const view = viewOf({ kind: "readmit", number: 12, exited: { atUnixMs: at("22:10"), deviceName: "Saída 1" } }, reentry);
    expect(view).toMatchObject({ tone: "ok", title: r.admit, detail: r.returning("22:10", "Saída 1") });
  });

  it("says who is inside instead of who entered", () => {
    const decision = { kind: "already_entered", number: 12, firstEntry: { atUnixMs: at("23:00"), deviceName: "Porta 2" } } as const;
    expect(viewOf(decision, reentry)).toMatchObject({ title: r.inside, detail: r.insideSince("23:00", "Porta 2") });
    expect(viewOf(decision, context)).toMatchObject({ title: r.alreadyEntered, detail: r.alreadyEnteredAt("23:00", "Porta 2") });
  });

  it("never shows a rehearsal exit as the real thing", () => {
    const view = rehearsalView("QR", { kind: "exit", number: 4 }, reentry);
    expect(view).toMatchObject({ tone: "warn", title: portariaTexts.rehearsal.wouldExit, rehearsal: true });
  });

  it("lists exits and returns in the phone's history", () => {
    const scans: StoredScan[] = [
      { id: "a", number: 12, outcome: "admitted", scannedAtMs: at("21:00"), synced: 1 },
      { id: "b", number: 12, outcome: "exited", scannedAtMs: at("22:00"), synced: 1 },
      { id: "c", number: 12, outcome: "rejected_already_out", scannedAtMs: at("22:01"), synced: 0 },
      { id: "d", number: 12, outcome: "readmitted", scannedAtMs: at("23:00"), synced: 0 },
    ];
    const entries: StoredEntry[] = [
      { scanId: "a", number: 12, atUnixMs: at("21:00"), deviceName: "Porta 1" },
      { scanId: "b", number: 12, atUnixMs: at("22:00"), deviceName: "Saída 1", exit: true },
      { scanId: "d", number: 12, atUnixMs: at("23:00"), deviceName: "Porta 1" },
    ];
    const recent = recentScans(scans, entries, reentry);
    expect(recent.map((scan) => [scan.label, scan.tone])).toEqual([
      [portariaTexts.history.outcomes.readmitted, "ok"],
      [portariaTexts.history.outcomes.rejected_already_out, "warn"],
      [portariaTexts.history.outcomes.exited, "exit"],
      [portariaTexts.history.outcomes.admitted, "ok"],
    ]);
    expect(recent[0]?.detail).toBe(portariaTexts.history.exitedAt("22:00", "Saída 1"));
    // An exit is never mistaken for an earlier entry of a copy.
    expect(recent[3]?.detail).toBeNull();
    expect(recentSummary(scans)).toEqual({ admitted: 2, exits: 1, refused: 1, pending: 2 });
  });
});
