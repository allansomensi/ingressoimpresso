import { describe, expect, it } from "vitest";

import { parseDecision } from "../src/decision";

describe("parseDecision", () => {
  it("accepts every well-formed kind", () => {
    const decisions = [
      { kind: "admit", number: 1 },
      { kind: "already_entered", number: 2, firstEntry: { atUnixMs: 3, deviceName: "Porta 1" } },
      { kind: "voided", number: 4, reason: "unsold" },
      { kind: "other_event", eventTag: 5 },
      { kind: "invalid", reason: "bad_signature" },
    ] as const;
    for (const decision of decisions) {
      expect(parseDecision(decision)).toEqual(decision);
    }
  });

  it.each([
    null,
    "admit",
    [],
    { kind: "admit" },
    { kind: "admit", number: "1" },
    { kind: "admit", number: 1.5 },
    { kind: "voided", number: 1, reason: "stolen" },
    { kind: "already_entered", number: 1 },
    { kind: "invalid", reason: "forged" },
    { kind: "party" },
  ])("rejects %j", (value) => {
    expect(() => parseDecision(value)).toThrow(TypeError);
  });
});
