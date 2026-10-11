import type { MetadataRoute } from "next";

import { IS_STAGING, SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  if (IS_STAGING) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    // Rules are prefixes: "/ingresso$" keeps the digital ticket out without hiding /ingresso-para/.
    rules: { userAgent: "*", allow: "/", disallow: ["/painel", "/portaria", "/offline", "/ingresso$"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
