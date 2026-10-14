import type { MetadataRoute } from "next";

import { IS_STAGING, SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  if (IS_STAGING) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    // Only the apps behind a login or an access link stay out of the crawl: nothing there is
    // public. The private links that people share (the digital ticket, the seller's page and the
    // referral links, ADRs 0030, 0053 and 0076) can be crawled on purpose: their `noindex` only
    // works if the crawler is allowed to read it, and the token is in the fragment, which never
    // reaches a server (ADR 0081).
    rules: { userAgent: "*", allow: "/", disallow: ["/painel", "/portaria", "/offline"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
