"use client";

import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { usePathname } from "next/navigation";

/**
 * Sends only the path: queries carry batch ids, and the door, digital ticket and seller links
 * carry their token in the hash. Both scripts hand their events here before sending them.
 */
function scrub<T extends { url: string }>(event: T): T {
  const url = new URL(event.url);
  return { ...event, url: `${url.origin}${url.pathname}` };
}

/**
 * Vercel Web Analytics (ADR 0021) and Speed Insights (Core Web Vitals measured on the visitors'
 * own phones, grouped by route without the ids), outside the door: the door must work offline and its page resources are all
 * cached for that (ADR 0018), so it loads no third script.
 */
export function SiteAnalytics() {
  const pathname = usePathname();
  if (pathname.startsWith("/portaria")) {
    return null;
  }
  return (
    <>
      <Analytics beforeSend={scrub} />
      <SpeedInsights beforeSend={scrub} />
    </>
  );
}
