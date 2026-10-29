import { describe, expect, it } from "vitest";

import { initials, parseMoney, phoneLabel, ticketNumber } from "@/lib/format";

describe("format", () => {
  it("shows Brazilian phones as people read them", () => {
    expect(phoneLabel("11999990000")).toBe("(11) 99999-0000");
    expect(phoneLabel("+55 (11) 3333-4444")).toBe("(11) 3333-4444");
    expect(phoneLabel("+351 912 345 678")).toBe("+351 912 345 678");
    expect(phoneLabel("ramal 12")).toBe("ramal 12");
  });

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
