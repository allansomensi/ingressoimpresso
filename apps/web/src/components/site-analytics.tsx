"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";
import { usePathname } from "next/navigation";

/** Sends only the path: queries carry batch ids and the door link carries a token in the hash. */
function scrub(event: BeforeSendEvent): BeforeSendEvent {
  const url = new URL(event.url);
  return { ...event, url: `${url.origin}${url.pathname}` };
}

/**
 * Vercel Web Analytics (ADR 0021), outside the door: the door must work offline and its page
 * resources are all cached for that (ADR 0018), so it loads no third script.
 */
export function SiteAnalytics() {
  const pathname = usePathname();
  if (pathname.startsWith("/portaria")) {
    return null;
  }
  return <Analytics beforeSend={scrub} />;
}
