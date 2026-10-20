import { describe, expect, it } from "vitest";

import { artWithLogo, brandPalette, contrast, dominantColors, logoSpot, luminance } from "@/lib/brand-palette";
import { designIssues } from "@/lib/design-rules";
import { TEMPLATES } from "@/lib/templates/catalog";

const BRANDS = [["#e11d48"], ["#facc15", "#1d4ed8"], ["#0b0b0b"], ["#ffffff", "#16a34a"]];
const LOGO = "data:image/png;base64,iVBORw0KGgo=";

describe("templates in the organization's colours", () => {
  it("keeps every template valid and readable in any brand colour", () => {
    for (const template of TEMPLATES) {
      for (const base of template.palettes) {
        for (const colors of BRANDS) {
          const palette = brandPalette(base, colors, "brand");
          const label = `${template.id}/${base.id}/${colors.join("+")}`;
          // A dark template stays dark, a light one light.
          expect(luminance(palette.bg) < 0.25, label).toBe(luminance(base.bg) < 0.25);
          expect(contrast(palette.ink, palette.bg), label).toBeGreaterThanOrEqual(4.5);
          expect(contrast(palette.muted, palette.bg), label).toBeGreaterThanOrEqual(4.5);
          expect(contrast(palette.accent, palette.bg), label).toBeGreaterThanOrEqual(4.5);
          const { design, background } = template.build(palette);
          expect(designIssues(design), label).toEqual([]);
          expect(background, label).not.toMatch(/NaN|undefined/);
        }
      }
    }
  });

  it("lays the logo on a free spot, clear of every printed element", () => {
    let placed = 0;
    for (const template of TEMPLATES) {
      const base = template.palettes[0];
      if (base === undefined) {
        continue;
      }
      const { design, background } = template.build(base);
      const spot = logoSpot(design);
      if (spot === null) {
        expect(artWithLogo(background, design, LOGO)).toBe(background);
        continue;
      }
      placed += 1;
      expect(spot.x).toBeGreaterThanOrEqual(3);
      expect(spot.y).toBeGreaterThanOrEqual(3);
      expect(spot.x + spot.width).toBeLessThanOrEqual(design.widthMm - 3);
      expect(spot.y + spot.height).toBeLessThanOrEqual(design.heightMm - 3);
      const boxes = [
        ...design.texts.map((text) => [text.xMm, text.yMm, text.widthMm, text.heightMm] as const),
        [design.number.xMm, design.number.yMm, design.number.widthMm, design.number.heightMm] as const,
        [design.qr.xMm, design.qr.yMm, design.qr.sizeMm, design.qr.sizeMm] as const,
      ];
      for (const [x, y, width, height] of boxes) {
        const apart = spot.x >= x + width || x >= spot.x + spot.width || spot.y >= y + height || y >= spot.y + spot.height;
        expect(apart, template.id).toBe(true);
      }
      const art = artWithLogo(background, design, LOGO);
      expect(art.endsWith("</svg>")).toBe(true);
      expect(art).toContain(`<image href="${LOGO}"`);
    }
    // Most templates have room for it.
    expect(placed).toBeGreaterThan(TEMPLATES.length / 2);
  });

  it("reads a flyer's main colours, the most colourful first", () => {
    const pixels: number[] = [];
    const paint = (count: number, rgb: [number, number, number]) => {
      for (let index = 0; index < count; index += 1) {
        pixels.push(...rgb, 255);
      }
    };
    paint(5000, [255, 255, 255]); // the paper
    paint(1500, [10, 10, 10]); // the text
    paint(1200, [220, 30, 60]); // red
    paint(600, [30, 80, 220]); // blue
    paint(80, [222, 32, 58]); // almost the same red
    const colors = dominantColors(new Uint8ClampedArray(pixels));
    expect(colors[0]).toMatch(/^#d[c-f]1[c-f]3[a-d]$/);
    expect(colors[1]).toMatch(/^#1[c-f]5[0-2]d[a-d]$/);
    // White and black are there, after the colours; the second red is not repeated.
    expect(colors).toHaveLength(4);
    expect(new Set(colors).size).toBe(4);
  });
});
