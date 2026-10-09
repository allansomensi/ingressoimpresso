import { describe, expect, it } from "vitest";

import { initials, parseMoney, ticketNumber } from "@/lib/format";

describe("format", () => {
  it("parses Brazilian amounts into centavos", () => {
    expect(parseMoney("30")).toBe(3000);
    expect(parseMoney("30,50")).toBe(3050);
    expect(parseMoney("R$ 1.234,56")).toBe(123456);
    expect(parseMoney("12.5")).toBe(1250);
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("-3")).toBeNull();
  });

  it("pads numbers and builds initials", () => {
    expect(ticketNumber(42)).toBe("0042");
    expect(initials("João da Silva")).toBe("JS");
    expect(initials("  ana ")).toBe("A");
  });
});
