import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { llmsText } from "@/content/llms";
import { eventSeoPages } from "@/content/seo-event-pages";
import { guideWordCount, seoGuides } from "@/content/seo-guides";
import { EVENT_TEMPLATES, relatedTemplatePages, templateImagePath, templateSeoPages } from "@/content/seo-templates";
import { richTextLinks } from "@/lib/rich-text";
import { pageMetadata } from "@/lib/seo";
import { SITE_URL } from "@/lib/site";
import { TEMPLATES } from "@/lib/templates/catalog";
import { about as aboutTexts } from "@/texts/pt-BR/about";
import { changelog as changelogTexts } from "@/texts/pt-BR/changelog";
import { eventPages as eventPagesTexts } from "@/texts/pt-BR/event-pages";
import { guides as guidesTexts } from "@/texts/pt-BR/guides";
import { helpCenter as helpCenterTexts } from "@/texts/pt-BR/help-center";
import { landing as landingTexts } from "@/texts/pt-BR/landing";
import { login as loginTexts } from "@/texts/pt-BR/login";
import { pricingPage as pricingPageTexts } from "@/texts/pt-BR/pricing-page";
import { templateGallery as templateGalleryTexts } from "@/texts/pt-BR/template-gallery";
import { verifyPage as verifyPageTexts } from "@/texts/pt-BR/verify-page";

const PUBLIC = fileURLToPath(new URL("../public", import.meta.url));
const APP = fileURLToPath(new URL("../src/app", import.meta.url));
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The public pages with a fixed address, each with its page.tsx. */
const STATIC_PAGES = [
  "/",
  "/precos",
  "/modelos",
  "/guias",
  "/ingresso-para",
  "/conferir",
  "/entrar",
  "/sobre",
  "/suporte",
  "/novidades",
  "/status",
  "/termos",
  "/privacidade",
  "/reembolso",
] as const;

/** Every public address a content link may point to. */
const PUBLIC_PAGES = new Set<string>([
  ...STATIC_PAGES,
  ...eventSeoPages.map((page) => `/ingresso-para/${page.slug}`),
  ...templateSeoPages.map((page) => `/modelos/${page.slug}`),
  ...seoGuides.map((guide) => `/guias/${guide.slug}`),
]);

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

  it("suggest other templates of the same kind of event first", () => {
    for (const page of templateSeoPages) {
      const related = relatedTemplatePages(page.id);
      expect(related, page.slug).toHaveLength(3);
      expect(unique(related.map((other) => other.id)), page.slug).toBe(true);
      expect(related.some((other) => other.id === page.id), page.slug).toBe(false);
    }
    const main = TEMPLATES.find((template) => template.id === "rock")?.categories[0];
    const rock = relatedTemplatePages("rock").map((other) => TEMPLATES.find((template) => template.id === other.id));
    expect(rock.every((template) => main !== undefined && (template?.categories.includes(main) ?? false))).toBe(true);
  });

  it("have their picture, made by `just template-images`", () => {
    const missing = templateSeoPages.filter((page) => !existsSync(`${PUBLIC}${templateImagePath(page)}`)).map((page) => page.slug);
    expect(missing).toEqual([]);
  });

  it("have the gallery's description within the snippet", () => {
    expect(templateGalleryTexts.metaDescription.length).toBeLessThanOrEqual(160);
    expect(landingTexts.metaTitle.length).toBeLessThanOrEqual(70);
  });
});

describe("event pages: steps and links", () => {
  it("have four steps, enough questions and unique labels", () => {
    expect(unique(eventSeoPages.map((page) => page.label))).toBe(true);
    for (const page of eventSeoPages) {
      expect(page.passos, page.slug).toHaveLength(4);
      expect(page.faq.length, page.slug).toBeGreaterThanOrEqual(3);
      expect(page.dores.length, page.slug).toBeGreaterThanOrEqual(3);
    }
  });

  it("are all linked from the landing's audience or the footer's list", () => {
    const linked = new Set(landingTexts.audience.map((item) => item.slug));
    expect([...linked].every((slug) => eventSeoPages.some((page) => page.slug === slug))).toBe(true);
  });
});

describe("guides (/guias)", () => {
  it("have unique slugs, titles and headings that fit search results", () => {
    expect(unique(seoGuides.map((guide) => guide.slug))).toBe(true);
    expect(unique(seoGuides.map((guide) => guide.title))).toBe(true);
    expect(unique(seoGuides.map((guide) => guide.h1))).toBe(true);
    expect(unique(seoGuides.map((guide) => guide.label))).toBe(true);
    expect(seoGuides.flatMap(snippetIssues)).toEqual([]);
  });

  it("are real articles: dated, with sections, questions and enough words", () => {
    for (const guide of seoGuides) {
      expect(guide.slug).toMatch(SLUG);
      expect(guide.publishedAt).toMatch(DAY);
      expect(guide.updatedAt).toMatch(DAY);
      expect(guide.updatedAt >= guide.publishedAt, guide.slug).toBe(true);
      expect(guide.sections.length, guide.slug).toBeGreaterThanOrEqual(4);
      expect(unique(guide.sections.map((section) => section.id)), guide.slug).toBe(true);
      for (const section of guide.sections) {
        expect(section.id).toMatch(SLUG);
        expect(section.blocks.length, `${guide.slug}#${section.id}`).toBeGreaterThan(0);
      }
      expect(guide.faq.length, guide.slug).toBeGreaterThanOrEqual(3);
      expect(guideWordCount(guide), guide.slug).toBeGreaterThanOrEqual(500);
    }
  });

  it("point to templates and event pages that exist", () => {
    const templates = new Set(templateSeoPages.map((page) => page.id));
    const events = new Set(eventSeoPages.map((page) => page.slug));
    for (const guide of seoGuides) {
      expect(guide.templates.length, guide.slug).toBeGreaterThan(0);
      expect(guide.templates.every((id) => templates.has(id)), guide.slug).toBe(true);
      expect(guide.events.length, guide.slug).toBeGreaterThan(0);
      expect(guide.events.every((slug) => events.has(slug)), guide.slug).toBe(true);
    }
  });

  it("link only to public pages that exist, never to themselves", () => {
    const broken: string[] = [];
    for (const guide of seoGuides) {
      const texts = guide.sections.flatMap((section) =>
        section.blocks.flatMap((block) => (block.kind === "ul" || block.kind === "ol" ? block.items : [block.text])),
      );
      for (const href of texts.flatMap(richTextLinks)) {
        if (!PUBLIC_PAGES.has(href) || href === `/guias/${guide.slug}`) {
          broken.push(`${guide.slug} → ${href}`);
        }
      }
    }
    expect(broken).toEqual([]);
  });
});

describe("page titles and descriptions", () => {
  it("fit search results", () => {
    const pages = [
      { slug: "/", title: landingTexts.metaTitle, description: landingTexts.metaDescription },
      { slug: "/precos", title: pricingPageTexts.metaTitle, description: pricingPageTexts.metaDescription },
      { slug: "/guias", title: guidesTexts.metaTitle, description: guidesTexts.metaDescription },
      { slug: "/ingresso-para", title: eventPagesTexts.hubMetaTitle, description: eventPagesTexts.hubMetaDescription },
      { slug: "/conferir", title: verifyPageTexts.metaTitle, description: verifyPageTexts.metaDescription },
      { slug: "/sobre", title: aboutTexts.metaTitle, description: aboutTexts.metaDescription },
      { slug: "/suporte", title: helpCenterTexts.metaTitle, description: helpCenterTexts.metaDescription },
      { slug: "/novidades", title: changelogTexts.metaTitle, description: changelogTexts.metaDescription },
      { slug: "/entrar", title: loginTexts.metaTitle, description: loginTexts.metaDescription },
      { slug: "/modelos", title: templateGalleryTexts.metaTitle, description: templateGalleryTexts.metaDescription },
    ];
    // The landing's title ends with the brand, which may be cut.
    expect(pages.filter((page) => page.slug !== "/").flatMap(snippetIssues)).toEqual([]);
    expect(landingTexts.metaDescription.length).toBeLessThanOrEqual(160);
    expect(unique(pages.map((page) => page.title))).toBe(true);
  });

  it("have a page file for every fixed public address", () => {
    const missing = STATIC_PAGES.filter((path) => !existsSync(`${APP}${path === "/" ? "" : path}/page.tsx`));
    expect(missing).toEqual([]);
  });

  it("each have their own share image", () => {
    // A page that sets `openGraph` (pageMetadata) loses the root's image, so each brings its own.
    const dirs = [...STATIC_PAGES.map((path) => (path === "/" ? "" : path)), "/ingresso-para/[slug]", "/modelos/[slug]", "/guias/[slug]", "/e/[slug]"];
    const missing = dirs.filter((dir) => !existsSync(`${APP}${dir}/opengraph-image.tsx`) && !existsSync(`${APP}${dir}/opengraph-image.png`));
    expect(missing).toEqual([]);
  });
});

describe("pageMetadata", () => {
  it("says the same thing to search results and to link previews", () => {
    const metadata = pageMetadata({ title: "Título", description: "Descrição", path: "/precos" });
    expect(metadata.title).toEqual({ absolute: "Título" });
    expect(metadata.alternates?.canonical).toBe("/precos");
    expect(metadata.openGraph).toMatchObject({ type: "website", url: "/precos", title: "Título", description: "Descrição", locale: "pt_BR" });
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image", title: "Título", description: "Descrição" });
  });

  it("marks guides as articles with their dates", () => {
    const metadata = pageMetadata({
      title: "Guia",
      shareTitle: "Guia para compartilhar",
      description: "Descrição",
      path: "/guias/x",
      article: { publishedAt: "2026-10-14", updatedAt: "2026-10-15" },
    });
    expect(metadata.openGraph).toMatchObject({ type: "article", title: "Guia para compartilhar", publishedTime: "2026-10-14", modifiedTime: "2026-10-15" });
  });
});

describe("sitemap and robots", () => {
  const urls = sitemap().map((entry) => entry.url);
  const blocked = robots().rules;
  const disallow = (Array.isArray(blocked) ? blocked : [blocked]).flatMap((rule) =>
    rule.disallow === undefined ? [] : Array.isArray(rule.disallow) ? rule.disallow : [rule.disallow],
  );

  it("lists every public page once", () => {
    expect(unique(urls)).toBe(true);
    for (const path of PUBLIC_PAGES) {
      expect(urls, path).toContain(path === "/" ? SITE_URL : `${SITE_URL}${path}`);
    }
  });

  it("never lists a page that robots.txt keeps out", () => {
    const listedButBlocked = urls.filter((url) => {
      const path = url.slice(SITE_URL.length) || "/";
      return disallow.some((prefix) => path.startsWith(prefix));
    });
    expect(listedButBlocked).toEqual([]);
  });

  it("keeps the private apps out and lets the shared links be read (their noindex)", () => {
    expect(disallow).toEqual(expect.arrayContaining(["/painel", "/portaria"]));
    for (const path of ["/ingresso", "/vendedor", "/i/abc"]) {
      expect(disallow.some((prefix) => path.startsWith(prefix)), path).toBe(false);
    }
  });
});

describe("/llms.txt", () => {
  it("summarizes the product and lists every public page with its address", () => {
    const text = llmsText();
    expect(text.startsWith("# Ingresso Impresso\n")).toBe(true);
    for (const path of PUBLIC_PAGES) {
      expect(text, path).toContain(`(${path === "/" ? SITE_URL : `${SITE_URL}${path}`})`);
    }
  });
});
