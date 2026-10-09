import { describe, expect, it } from "vitest";

import { passBand, passDate, textOn } from "@/lib/ticket-pass";

describe("digital ticket helpers", () => {
  it("reads the date in the event's own time", () => {
    expect(passDate("2026-11-20T22:00:00-03:00")).toBe("sexta-feira, 20 de novembro de 2026 · 22:00");
  });

  it("keeps dark designs and swaps near-white ones for the brand", () => {
    expect(passBand("#1a1a2e")).toBe("#1a1a2e");
    expect(passBand("#ffffff")).toBe("#5b3df5");
    expect(passBand("#f8f6f0")).toBe("#5b3df5");
    expect(passBand("nope")).toBe("#5b3df5");
  });

  it("picks readable text", () => {
    expect(textOn("#5b3df5")).toBe("#ffffff");
    expect(textOn("#ffd84a")).toBe("#0e0d14");
  });
});
