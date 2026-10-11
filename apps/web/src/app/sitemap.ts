import type { MetadataRoute } from "next";

import { LEGAL_DOCUMENTS } from "@/content/legal";
import { EVENT_TEMPLATES, templateImagePath, templateSeoById, templateSeoPages } from "@/content/seo-templates";
import { eventSeoPages } from "@/content/seo-event-pages";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE_URL}/sobre`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/novidades`, changeFrequency: "weekly", priority: 0.5 },
    { url: `${SITE_URL}/status`, changeFrequency: "daily", priority: 0.3 },
    { url: `${SITE_URL}/entrar`, changeFrequency: "yearly", priority: 0.3 },
    ...eventSeoPages.map((page) => ({
      url: `${SITE_URL}/ingresso-para/${page.slug}`,
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
      changeFrequency: "monthly",
      priority: 0.8,
      images: templateSeoPages.map((page) => `${SITE_URL}${templateImagePath(page)}`),
    },
    ...templateSeoPages.map((page) => ({
      url: `${SITE_URL}/modelos/${page.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.7,
      images: [`${SITE_URL}${templateImagePath(page)}`],
    })),
    ...Object.values(LEGAL_DOCUMENTS).map((document) => ({
      url: `${SITE_URL}/${document.slug}`,
      lastModified: document.updatedAt,
      changeFrequency: "yearly" as const,
      priority: 0.2,
    })),
  ];
}
