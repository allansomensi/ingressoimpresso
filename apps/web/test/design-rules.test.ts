import type { TicketDesign } from "@ingressoimpresso/api-types";
import { describe, expect, it } from "vitest";

import { designIssues, fitsA4, stubMinHeight } from "@/lib/design-rules";

// The default design of crates/render/src/design.rs (`default_v1`).
const base: TicketDesign = {
  version: 1,
  widthMm: 150,
  heightMm: 55,
  backgroundColor: "#ffffff",
  number: { xMm: 6, yMm: 4, widthMm: 60, heightMm: 12, font: "display", sizePt: 24, color: "#111111", align: "left", prefix: "Nº ", digits: 4 },
  qr: { xMm: 117, yMm: 14.5, sizeMm: 28 },
  stub: { side: "left", widthMm: 40, fields: ["Nome", "Telefone"] },
  texts: [],
};

describe("design rules (mirror of design.rs)", () => {
  it("accepts the default design", () => {
    expect(designIssues(base)).toEqual([]);
  });

  it("flags a small or misplaced QR", () => {
    const issues = designIssues({ ...base, qr: { xMm: 140, yMm: 14.5, sizeMm: 20 } });
    expect(issues.map((issue) => issue.target.kind)).toEqual(["qr", "qr"]);
  });

  it("needs height for the stub's fields", () => {
    // Two fields need 15.1 + 2 × 7.6 = 30.3 mm.
    expect(stubMinHeight(base)).toBe(30.3);
    const issues = designIssues({ ...base, heightMm: 30, qr: { ...base.qr, yMm: 1 } });
    expect(issues.map((issue) => issue.target.kind)).toEqual(["stub"]);
  });

  it("checks text blocks", () => {
    const block = {
      text: "{evento}",
      xMm: 100,
      yMm: 20,
      widthMm: 100,
      heightMm: 12,
      font: "serif" as const,
      sizePt: 500,
      color: "red",
      align: "left" as const,
      lines: 0,
      bold: false,
      uppercase: false,
      letterSpacing: 0,
    };
    const issues = designIssues({ ...base, texts: [block] });
    expect(issues).toHaveLength(3);
    expect(issues.every((issue) => issue.target.kind === "text")).toBe(true);
  });

  it("knows what fits on A4", () => {
    expect(fitsA4(190, 55)).toBe(true);
    expect(fitsA4(60, 120)).toBe(true);
    expect(fitsA4(300, 200)).toBe(false);
  });
});
