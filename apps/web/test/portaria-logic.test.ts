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
const context = { digits: 4, sellers };

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
    });
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
