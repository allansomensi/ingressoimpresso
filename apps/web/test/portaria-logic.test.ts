import type { DecisionDto } from "@ingressoimpresso/ticket-core-wasm";
import { describe, expect, it } from "vitest";

import {
  CONFIRM_PAUSE_MS,
  ConfirmGate,
  FRESH_SYNC_MS,
  MAX_CONFIRM_TIMEOUTS,
  outcomeOf,
  padNumber,
  sellerOf,
  viewOf,
} from "@/portaria/logic";

const sellers = [
  { seller: "João", first: 1, last: 50 },
  { seller: "Maria", first: 51, last: 100 },
];
const context = {
  digits: 4,
  sellers,
  categories: [{ name: "Meia", color: "#e11d48", first: 40, last: 60 }],
  seats: [{ number: 42, label: "Mesa 5 · Lugar 3" }],
};

describe("decisions", () => {
  const cases: [DecisionDto, string][] = [
    [{ kind: "admit", number: 7 }, "admitted"],
    [{ kind: "already_entered", number: 7, firstEntry: { atUnixMs: 0, deviceName: "Porta 1" } }, "rejected_used"],
    [{ kind: "voided", number: 7, reason: "lost" }, "rejected_void"],
    [{ kind: "other_event", eventTag: 9 }, "rejected_other_event"],
    [{ kind: "invalid", reason: "bad_signature" }, "rejected_invalid"],
  ];

  it.each(cases)("%j is stored as %s", (decision, outcome) => {
    expect(outcomeOf(decision)).toBe(outcome);
  });

  it("shows the padded number and the seller of an admitted ticket", () => {
    expect(viewOf({ kind: "admit", number: 51 }, context)).toEqual({
      tone: "ok",
      title: "PODE ENTRAR",
      number: "Nº 0051",
      detail: null,
      seller: "Vendedor: Maria",
      category: { name: "Meia", color: "#e11d48" },
      seat: null,
    });
  });

  it("tells the category and the table of a ticket", () => {
    expect(viewOf({ kind: "admit", number: 42 }, context)).toMatchObject({ category: { name: "Meia" }, seat: "Mesa 5 · Lugar 3" });
    expect(viewOf({ kind: "admit", number: 7 }, context)).toMatchObject({ category: null, seat: null });
    expect(viewOf({ kind: "invalid", reason: "malformed" }, context)).toMatchObject({ category: null, seat: null });
  });

  it("says where a copy entered first", () => {
    const at = new Date(2026, 10, 20, 21, 3).getTime();
    const view = viewOf({ kind: "already_entered", number: 3, firstEntry: { atUnixMs: at, deviceName: "Porta 2" } }, context);
    expect(view.tone).toBe("bad");
    expect(view.detail).toBe("às 21:03 por Porta 2");
  });

  it("never shows a number for codes that are not our tickets", () => {
    expect(viewOf({ kind: "invalid", reason: "malformed" }, context)).toMatchObject({ tone: "bad", number: null, seller: null });
    expect(viewOf({ kind: "other_event", eventTag: 1 }, context)).toMatchObject({ tone: "warn", number: null });
    // Another date of the same event (ADR 0077) says which; it still does not enter.
    const series = { ...context, sessions: [{ eventTag: 7, startsAt: "2026-11-13T20:00:00-03:00" }] };
    expect(viewOf({ kind: "other_event", eventTag: 7 }, series)).toMatchObject({
      tone: "warn",
      title: "INGRESSO DE OUTRA DATA",
      detail: "Sessão de 13/11 às 20h: só entra nessa data.",
    });
    expect(viewOf({ kind: "other_event", eventTag: 8 }, series)).toMatchObject({ title: "INGRESSO DE OUTRO EVENTO" });
    expect(viewOf({ kind: "voided", number: 120, reason: "unsold" }, context)).toMatchObject({
      tone: "bad",
      number: "Nº 0120",
      detail: "devolvido sem vender",
      seller: null,
    });
  });

  it("finds sellers at range edges only", () => {
    expect(sellerOf(sellers, 50)).toBe("João");
    expect(sellerOf(sellers, 51)).toBe("Maria");
    expect(sellerOf(sellers, 101)).toBeNull();
    expect(padNumber(123_456, 4)).toBe("123456");
  });
});

describe("online confirmation", () => {
  it("needs a fresh sync", () => {
    const gate = new ConfirmGate();
    expect(gate.canConfirm(1_000, null)).toBe(false);
    expect(gate.canConfirm(FRESH_SYNC_MS, 1)).toBe(true);
    expect(gate.canConfirm(FRESH_SYNC_MS + 1, 1)).toBe(false);
  });

  it("pauses after repeated timeouts and recovers", () => {
    const gate = new ConfirmGate();
    for (let index = 0; index < MAX_CONFIRM_TIMEOUTS - 1; index += 1) {
      gate.onTimeout(1_000);
    }
    expect(gate.canConfirm(1_000, 1_000)).toBe(true);
    gate.onTimeout(1_000);
    expect(gate.canConfirm(1_000, 1_000)).toBe(false);
    expect(gate.canConfirm(1_000 + CONFIRM_PAUSE_MS, 1_000 + CONFIRM_PAUSE_MS)).toBe(true);
  });

  it("forgets timeouts after an answer", () => {
    const gate = new ConfirmGate();
    for (let index = 0; index < MAX_CONFIRM_TIMEOUTS - 1; index += 1) {
      gate.onTimeout(0);
    }
    gate.onAnswer();
    gate.onTimeout(0);
    expect(gate.canConfirm(0, 0)).toBe(true);
  });
});
