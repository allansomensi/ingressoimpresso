"use client";

import type { EventDto } from "@ingressoimpresso/api-types";
import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { api } from "@/lib/api";
import { livePollingInterval } from "@/lib/event-list";

/**
 * A `refetchInterval` for data the door phones write: every `ms` while the event is today or
 * happening, off otherwise (`livePollingInterval`). Reads the event the page already fetched.
 */
export function useLivePolling(eventId: string, ms: number): () => number | false {
  const event = useQuery({ queryKey: ["event", eventId], queryFn: () => api<EventDto>(`/api/events/${eventId}`) });
  const data = event.data;
  return useCallback(() => livePollingInterval(data, Date.now(), ms), [data, ms]);
}
