/**
 * An event with several dates (ADR 0077): how a date is named where the holder, the seller, the
 * door or a buyer needs to know which session a ticket is for, and the default of a new date.
 */

import type { EventSeriesRefDto } from "@ingressoimpresso/api-types";

import { wallClock, wallClockInput } from "@/lib/event-time";
import { series as seriesTexts } from "@/texts/pt-BR/series";

const pad = (value: number) => String(value).padStart(2, "0");

/** `20h` or `20h30`, in the event's own wall-clock time. */
export function hourLabel(iso: string): string {
  const clock = wallClock(iso);
  return clock.minute === 0 ? `${String(clock.hour)}h` : `${String(clock.hour)}h${pad(clock.minute)}`;
}

/** `12/11`, in the event's own wall-clock time. */
export function dayLabel(iso: string): string {
  const clock = wallClock(iso);
  return `${pad(clock.day)}/${pad(clock.month)}`;
}

/** "Sessão de 12/11 às 20h". */
export function sessionLabel(startsAt: string): string {
  return seriesTexts.session(dayLabel(startsAt), hourLabel(startsAt));
}

/** "Data 2 de 3". */
export function positionLabel(series: Pick<EventSeriesRefDto, "dates" | "position">): string {
  return seriesTexts.position(series.position, series.dates);
}

/** A `datetime-local` value `days` later (plain calendar arithmetic, no time zone). */
export function addDays(local: string, days: number): string | null {
  const time = Date.parse(`${local}:00Z`);
  return Number.isNaN(time) ? null : new Date(time + days * 86_400_000).toISOString().slice(0, 16);
}

/**
 * Where a new date starts by default: a day after the latest date known (same time), so it never
 * lands on a date the series already has.
 */
export function nextDateStart(starts: readonly string[], fallback: string): string {
  const latest = [fallback, ...starts].map(wallClockInput).sort().at(-1) ?? wallClockInput(fallback);
  return addDays(latest, 1) ?? latest;
}
