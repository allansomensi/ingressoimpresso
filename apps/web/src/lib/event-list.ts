/** Where an event stands, and the order of the event list (what needs attention first). */

import type { EventChangeDto, EventDto, EventSeriesRefDto } from "@ingressoimpresso/api-types";

export type EventPhase = "happening" | "today" | "upcoming" | "past" | "canceled" | "archived";

type Timed = Pick<EventDto, "status" | "startsAt" | "endsAt"> & { change?: Pick<EventChangeDto, "canceledAt"> };

export function eventPhase(event: Timed, now: number): EventPhase {
  if (event.status === "closed") {
    return "archived";
  }
  // A canceled event (ADR 0065) goes with the ones that ended: nothing will happen there.
  if (event.change !== undefined && event.change.canceledAt !== null) {
    return "canceled";
  }
  const start = Date.parse(event.startsAt);
  const end = Date.parse(event.endsAt);
  if (now > end) {
    return "past";
  }
  if (now >= start) {
    return "happening";
  }
  if (new Date(start).toDateString() === new Date(now).toDateString()) {
    return "today";
  }
  return "upcoming";
}

const RANK: Record<EventPhase, number> = { happening: 0, today: 1, upcoming: 2, past: 3, canceled: 3, archived: 4 };

/**
 * The event list as an organizer reads it: what is happening now, then today's, then the next
 * ones (soonest first), then the ones that already ended (latest first).
 */
export function sortEvents<T extends Timed>(events: readonly T[], now: number): T[] {
  return events
    .map((event) => ({ event, phase: eventPhase(event, now), start: Date.parse(event.startsAt) }))
    .sort((a, b) => {
      const byPhase = RANK[a.phase] - RANK[b.phase];
      if (byPhase !== 0) {
        return byPhase;
      }
      const latestFirst = RANK[a.phase] >= RANK.past;
      return latestFirst ? b.start - a.start : a.start - b.start;
    })
    .map(({ event }) => event);
}

/** An event of the list with the series of dates it is one of (ADR 0077). */
type InSeries = Pick<EventDto, "id" | "startsAt" | "checklistMissing"> & { series: Pick<EventSeriesRefDto, "id" | "name"> | null };

/** One entry of the list: an event, or the dates of a series shown together. */
export type ListEntry<T> =
  | { kind: "event"; event: T }
  | {
      kind: "series";
      id: string;
      name: string;
      /** The date that needs attention first: the entry takes its place in the list. */
      lead: T;
      /** Every date of the series in the list, earliest first. */
      dates: T[];
      /** Required checklist items missing across the dates (ADR 0078); `null` when none applies. */
      missing: number | null;
    };

/**
 * Groups the dates of a series in an already sorted list (`sortEvents`): the series takes the
 * place of its first date in the list, so the order of attention holds; a series with a single
 * date in the list (the others archived, say) stays a plain event.
 */
export function groupSeries<T extends InSeries>(sorted: readonly T[]): ListEntry<T>[] {
  const bySeries = new Map<string, T[]>();
  for (const event of sorted) {
    if (event.series !== null) {
      bySeries.set(event.series.id, [...(bySeries.get(event.series.id) ?? []), event]);
    }
  }
  const placed = new Set<string>();
  const entries: ListEntry<T>[] = [];
  for (const event of sorted) {
    const dates = event.series === null ? undefined : bySeries.get(event.series.id);
    if (event.series === null || dates === undefined || dates.length < 2) {
      entries.push({ kind: "event", event });
      continue;
    }
    if (placed.has(event.series.id)) {
      continue;
    }
    placed.add(event.series.id);
    const counts = dates.map((date) => date.checklistMissing).filter((count): count is number => count !== null);
    entries.push({
      kind: "series",
      id: event.series.id,
      name: event.series.name,
      lead: event,
      dates: [...dates].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)),
      missing: counts.length === 0 ? null : counts.reduce((sum, count) => sum + count, 0),
    });
  }
  return entries;
}
