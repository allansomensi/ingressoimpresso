import type { MetadataRoute } from "next";

import { LEGAL_DOCUMENTS } from "@/content/legal";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE_URL}/novidades`, changeFrequency: "weekly", priority: 0.5 },
    { url: `${SITE_URL}/status`, changeFrequency: "daily", priority: 0.3 },
    { url: `${SITE_URL}/entrar`, changeFrequency: "yearly", priority: 0.3 },
    ...Object.values(LEGAL_DOCUMENTS).map((document) => ({
      url: `${SITE_URL}/${document.slug}`,
      lastModified: document.updatedAt,
      changeFrequency: "yearly" as const,
      priority: 0.2,
    })),
  ];
}
