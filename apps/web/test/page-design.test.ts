import { describe, expect, it } from "vitest";

import {
  PAGE_ACCENTS,
  PAGE_SECTIONS,
  defaultPageDesign,
  designBody,
  everySection,
  hasIssues,
  heroLook,
  moveSection,
  normalizeLink,
  pageAccent,
  pageDesignIssues,
  shownSections,
} from "@/lib/page-design";
import { textOn } from "@/lib/ticket-pass";

describe("the page's accent", () => {
  it("prefers the chosen colour, then a readable organization colour, then the product's", () => {
    const design = defaultPageDesign();
    expect(pageAccent({ accent: "#BE123C" }, { brandColor: "#2563eb" })).toBe("#be123c");
    expect(pageAccent(design, { brandColor: "#2563eb" })).toBe("#2563eb");
    // White text does not read on yellow: the product's colour instead.
    expect(pageAccent(design, { brandColor: "#fde047" })).toBeNull();
    expect(pageAccent(design, { brandColor: null })).toBeNull();
  });

  it("offers swatches white text reads on", () => {
    for (const color of PAGE_ACCENTS) {
      expect(textOn(color)).toBe("#ffffff");
    }
  });
});

describe("the top of the page", () => {
  it("writes in white on a cover and falls back to the colour without one", () => {
    expect(heroLook({ hero: "cover" }, "#fde047", "blob:x").ink).toBe("#ffffff");
    expect(heroLook({ hero: "cover" }, "#fde047", "blob:x").background).toContain('url("blob:x")');
    expect(heroLook({ hero: "cover" }, "#2563eb", null)).toEqual({ background: "#2563eb", ink: "#ffffff" });
    expect(heroLook({ hero: "gradient" }, "#fde047", null).ink).toBe("#0e0d14");
  });
});

describe("the parts of the page", () => {
  it("shows the visible ones in order and appends the ones a saved design lacks", () => {
    expect(shownSections({ sections: [{ kind: "about", visible: true }, { kind: "prices", visible: false }] })).toEqual([
      "about",
      ...PAGE_SECTIONS.filter((kind) => kind !== "about" && kind !== "prices"),
    ]);
    expect(everySection([{ kind: "faq", visible: false }, { kind: "faq", visible: true }])).toHaveLength(PAGE_SECTIONS.length);
  });

  it("moves a part and ignores a move out of the list", () => {
    const sections = defaultPageDesign().sections;
    expect(moveSection(sections, 1, -1).map((section) => section.kind).slice(0, 2)).toEqual(["waitlist", "prices"]);
    expect(moveSection(sections, 0, -1)).toEqual(sections);
  });
});

describe("links and texts", () => {
  it("normalizes links like the API", () => {
    expect(normalizeLink("forms.gle/abc")).toBe("https://forms.gle/abc");
    expect(normalizeLink("http://exemplo.com.br")).toBe("http://exemplo.com.br");
    expect(normalizeLink("ftp://exemplo.com")).toBeNull();
    expect(normalizeLink("sem ponto")).toBeNull();
    expect(normalizeLink("localhost")).toBeNull();
  });

  it("flags what the API would refuse, by place", () => {
    const design = {
      ...defaultPageDesign(),
      cta: { label: "Comprar", url: "forms.gle/x" },
      links: [{ label: "", url: "instagram.com/x" }],
      schedule: [{ time: "21h", title: " ", detail: null }],
      faq: [{ question: "Pode criança?", answer: "Pode." }],
    };
    const issues = pageDesignIssues(design);
    expect(issues.cta).toBe(false);
    expect([...issues.links]).toEqual([0]);
    expect([...issues.schedule]).toEqual([0]);
    expect(issues.faq.size).toBe(0);
    expect(hasIssues(issues)).toBe(true);
    expect(hasIssues(pageDesignIssues(defaultPageDesign()))).toBe(false);
  });

  it("sends trimmed texts with full addresses", () => {
    const body = designBody({
      ...defaultPageDesign(),
      accent: "#ABCDEF",
      cta: { label: " Comprar ", url: "forms.gle/x" },
      schedule: [{ time: " 21h ", title: " Show ", detail: "  " }],
    });
    expect(body.accent).toBe("#abcdef");
    expect(body.cta).toEqual({ label: "Comprar", url: "https://forms.gle/x" });
    expect(body.schedule).toEqual([{ time: "21h", title: "Show", detail: null }]);
  });
});
