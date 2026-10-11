import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { eventSeoPages } from "@/content/seo-event-pages";
import { EVENT_TEMPLATES, templateImagePath, templateSeoPages } from "@/content/seo-templates";
import { TEMPLATES } from "@/lib/templates/catalog";
import { texts } from "@/texts/pt-BR";

const PUBLIC = fileURLToPath(new URL("../public", import.meta.url));

/** What search results show without cutting: about 60 characters of title, 160 of description. */
function snippetIssues(page: { slug: string; title: string; description: string }): string[] {
  const issues: string[] = [];
  if (page.title.length > 60) {
    issues.push(`${page.slug}: title has ${String(page.title.length)} characters`);
  }
  if (page.description.length < 70 || page.description.length > 160) {
    issues.push(`${page.slug}: description has ${String(page.description.length)} characters`);
  }
  return issues;
}

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

describe("event pages (/ingresso-para)", () => {
  it("have unique slugs, titles and headings that fit search results", () => {
    expect(unique(eventSeoPages.map((page) => page.slug))).toBe(true);
    expect(unique(eventSeoPages.map((page) => page.title))).toBe(true);
    expect(unique(eventSeoPages.map((page) => page.h1))).toBe(true);
    expect(eventSeoPages.flatMap(snippetIssues)).toEqual([]);
    for (const page of eventSeoPages) {
      expect(page.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(page.faq.length).toBeGreaterThan(0);
    }
  });

  it("each show templates that exist", () => {
    const templates = new Set(templateSeoPages.map((page) => page.id));
    expect(Object.keys(EVENT_TEMPLATES).sort()).toEqual(eventSeoPages.map((page) => page.slug).sort());
    for (const ids of Object.values(EVENT_TEMPLATES)) {
      expect(ids.length).toBeGreaterThan(0);
      expect(ids.every((id) => templates.has(id))).toBe(true);
    }
  });
});

describe("template pages (/modelos)", () => {
  it("cover every template of the catalog, once", () => {
    expect(templateSeoPages.map((page) => page.id).sort()).toEqual(TEMPLATES.map((template) => template.id).sort());
    expect(unique(templateSeoPages.map((page) => page.slug))).toBe(true);
    expect(unique(templateSeoPages.map((page) => page.title))).toBe(true);
    expect(templateSeoPages.flatMap(snippetIssues)).toEqual([]);
  });

  it("have their picture, made by `just template-images`", () => {
    const missing = templateSeoPages.filter((page) => !existsSync(`${PUBLIC}${templateImagePath(page)}`)).map((page) => page.slug);
    expect(missing).toEqual([]);
  });

  it("have the gallery's description within the snippet", () => {
    expect(texts.templateGallery.metaDescription.length).toBeLessThanOrEqual(160);
    expect(texts.landing.metaTitle.length).toBeLessThanOrEqual(70);
  });
});
