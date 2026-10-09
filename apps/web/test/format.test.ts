import { describe, expect, it } from "vitest";

import { initials, parseMoney, ticketNumber } from "@/lib/format";

describe("format", () => {
  it("parses Brazilian amounts into centavos", () => {
    expect(parseMoney("30")).toEqual({ ok: true, cents: 3000 });
    expect(parseMoney("30,50")).toEqual({ ok: true, cents: 3050 });
    expect(parseMoney("30,5")).toEqual({ ok: true, cents: 3050 });
    expect(parseMoney("R$ 1.234,56")).toEqual({ ok: true, cents: 123456 });
    expect(parseMoney("1.500")).toEqual({ ok: true, cents: 150000 });
    expect(parseMoney("12.5")).toEqual({ ok: true, cents: 1250 });
    expect(parseMoney("  ")).toEqual({ ok: true, cents: null });
  });

  it("refuses what it cannot read instead of guessing", () => {
    for (const text of ["abc", "-3", "30 reais", "3o,00", "1,234,56", "1.23.4", "12,345"]) {
      expect(parseMoney(text), text).toEqual({ ok: false });
    }
  });

  it("pads numbers and builds initials", () => {
    expect(ticketNumber(42)).toBe("0042");
    expect(initials("João da Silva")).toBe("JS");
    expect(initials("  ana ")).toBe("A");
  });
});
