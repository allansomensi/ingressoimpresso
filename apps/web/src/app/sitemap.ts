import type { MetadataRoute } from "next";

import { LEGAL_DOCUMENTS } from "@/content/legal";
import { EVENT_PAGES_UPDATED_AT, eventSeoPages } from "@/content/seo-event-pages";
import { seoGuides } from "@/content/seo-guides";
import { EVENT_TEMPLATES, TEMPLATE_PAGES_UPDATED_AT, templateImagePath, templateSeoById, templateSeoPages } from "@/content/seo-templates";
import { SITE_URL } from "@/lib/site";

/** The latest of some ISO days. */
function latest(days: readonly string[]): string | undefined {
  return [...days].sort().at(-1);
}

/**
 * Every public page. `lastModified` is set only where the date is true (the content files carry
 * it); search engines ignore a date that changes on every build.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const guidesUpdatedAt = latest(seoGuides.map((guide) => guide.updatedAt));
  return [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/precos`, changeFrequency: "monthly", priority: 0.9 },
    // The kinds of event (ADR 0062) and their hub (ADR 0081).
    { url: `${SITE_URL}/ingresso-para`, lastModified: EVENT_PAGES_UPDATED_AT, changeFrequency: "monthly", priority: 0.8 },
    ...eventSeoPages.map((page) => ({
      url: `${SITE_URL}/ingresso-para/${page.slug}`,
      lastModified: EVENT_PAGES_UPDATED_AT,
      changeFrequency: "monthly" as const,
      priority: 0.8,
      images: (EVENT_TEMPLATES[page.slug] ?? [])
        .map(templateSeoById)
        .filter((template) => template !== undefined)
        .map((template) => `${SITE_URL}${templateImagePath(template)}`),
    })),
    // The template gallery (ADR 0062): each page with its picture, for image search.
    {
      url: `${SITE_URL}/modelos`,
      lastModified: TEMPLATE_PAGES_UPDATED_AT,
      changeFrequency: "monthly",
      priority: 0.8,
      images: templateSeoPages.map((page) => `${SITE_URL}${templateImagePath(page)}`),
    },
    ...templateSeoPages.map((page) => ({
      url: `${SITE_URL}/modelos/${page.slug}`,
      lastModified: TEMPLATE_PAGES_UPDATED_AT,
      changeFrequency: "monthly" as const,
      priority: 0.7,
      images: [`${SITE_URL}${templateImagePath(page)}`],
    })),
    // The guides (ADR 0081).
    {
      url: `${SITE_URL}/guias`,
      ...(guidesUpdatedAt === undefined ? {} : { lastModified: guidesUpdatedAt }),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    ...seoGuides.map((guide) => ({
      url: `${SITE_URL}/guias/${guide.slug}`,
      lastModified: guide.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    // Check a ticket before buying it (ADR 0075).
    { url: `${SITE_URL}/conferir`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/sobre`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/suporte`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${SITE_URL}/novidades`, changeFrequency: "weekly", priority: 0.4 },
    { url: `${SITE_URL}/entrar`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/status`, changeFrequency: "daily", priority: 0.2 },
    ...Object.values(LEGAL_DOCUMENTS).map((document) => ({
      url: `${SITE_URL}/${document.slug}`,
      lastModified: document.updatedAt,
      changeFrequency: "yearly" as const,
      priority: 0.2,
    })),
  ];
}
