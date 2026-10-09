/**
 * What the panel needs to know about the service (ADR 0037) and the signed-in user's inbox
 * (ADR 0038): maintenance, sign-ups, a running promotion, announcements and notifications.
 */
import type { InboxDto, PlatformStatusDto } from "@ingressoimpresso/api-types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { api, MAINTENANCE_EVENT } from "@/lib/api";

/** Platform status (no login). Refreshed every minute and whenever a request meets maintenance. */
export function usePlatform() {
  const client = useQueryClient();
  useEffect(() => {
    const refresh = () => {
      void client.invalidateQueries({ queryKey: ["platform"] });
    };
    window.addEventListener(MAINTENANCE_EVENT, refresh);
    return () => {
      window.removeEventListener(MAINTENANCE_EVENT, refresh);
    };
  }, [client]);
  return useQuery({
    queryKey: ["platform"],
    queryFn: () => api<PlatformStatusDto>("/api/platform"),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}

/** The bell: announcements running now and the latest notifications. */
export function useInbox(enabled: boolean) {
  return useQuery({
    queryKey: ["inbox"],
    queryFn: () => api<InboxDto>("/api/inbox"),
    enabled,
    staleTime: 30_000,
    refetchInterval: 2 * 60_000,
    refetchIntervalInBackground: false,
  });
}

/** Marks everything in the inbox as seen/read. */
export async function markInboxRead(): Promise<void> {
  await api<undefined>("/api/inbox/read", { method: "POST", body: { announcements: [], notifications: [] } });
}

/** A site path or an https address (what announcements may link to), else `null`. */
export function safeLink(url: string | null): string | null {
  if (url === null) {
    return null;
  }
  if (url.startsWith("/") && !url.startsWith("//")) {
    return url;
  }
  return url.startsWith("https://") ? url : null;
}
