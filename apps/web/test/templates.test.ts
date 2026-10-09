import { describe, expect, it } from "vitest";

import { designIssues, fitsA4 } from "@/lib/design-rules";
import { TEMPLATES } from "@/lib/templates/catalog";
import { texts } from "@/texts/pt-BR";

describe("template catalog", () => {
  it("has unique ids, names and categories for every template", () => {
    const ids = TEMPLATES.map((template) => template.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const template of TEMPLATES) {
      expect(texts.templates.items[template.id].name).not.toBe("");
      expect(template.categories.length).toBeGreaterThan(0);
      expect(template.palettes.length).toBeGreaterThan(0);
    }
  });

  it("builds valid designs and backgrounds in every palette", () => {
    for (const template of TEMPLATES) {
      for (const palette of template.palettes) {
        const { design, background } = template.build(palette);
        const label = `${template.id}/${palette.id}`;
        expect(designIssues(design), label).toEqual([]);
        expect(fitsA4(design.widthMm + (design.stub?.widthMm ?? 0), design.heightMm), label).toBe(true);
        expect(texts.templates.palettes[palette.id], label).toBeDefined();
        expect(background.startsWith("<svg "), label).toBe(true);
        expect(background.endsWith("</svg>"), label).toBe(true);
        // Every gradient or pattern used is defined.
        for (const [, id] of background.matchAll(/url\(#([\w-]+)\)/g)) {
          expect(background, `${label} uses #${String(id)}`).toContain(`id="${String(id)}"`);
        }
        expect(background, label).not.toMatch(/NaN|undefined/);
        // Texts print the event's details through fields.
        expect(design.texts.some((block) => block.text.includes("{evento}")), label).toBe(true);
      }
    }
  });
});
