/**
 * Days of an event of several days (ADR 0091): the day the door is on, what a category's rule
 * allows and how a day is named. Mirrors `crates/server/src/event_days.rs`, with the same
 * examples in the tests: the door, the panel and the server agree on the day.
 */

import type { DayRule, EventDayDto } from "@ingressoimpresso/api-types";

import { wallClock } from "@/lib/event-time";
import { eventDays as texts } from "@/texts/pt-BR/event-days";

/** A day as the rules need it. */
export type EventDay = Pick<EventDayDto, "position" | "startsAt" | "endsAt">;

const pad = (value: number) => String(value).padStart(2, "0");

/**
 * The day the door is on at `nowMs` (its position), or `null` for an event of one day. The border
 * between two days is halfway between the end of one and the start of the next (a night that goes
 * past midnight stays on its day); before the first day it is the first, after the last the last.
 */
export function currentDay(days: readonly EventDay[], nowMs: number): number | null {
  if (days.length < 2) {
    return null;
  }
  for (let index = 0; index + 1 < days.length; index += 1) {
    const day = days[index];
    const next = days[index + 1];
    if (day === undefined || next === undefined) {
      break;
    }
    const end = Date.parse(day.endsAt);
    const border = end + (Date.parse(next.startsAt) - end) / 2;
    if (nowMs < border) {
      return day.position;
    }
  }
  return days.at(-1)?.position ?? null;
}

/** Whether a category with `rule` is valid on `day` (always, in an event of one day). */
export function validOn(rule: DayRule, validDays: readonly number[], day: number | null): boolean {
  return day === null || rule !== "days" || validDays.includes(day);
}

/**
 * The book a ticket is checked in on `day` (ADR 0091): the day's own, or `null` for the whole
 * event ("one day of their choice", a checkpoint used once, an event of one day).
 */
export function ledgerDay(rule: DayRule, day: number | null, perDay = true): number | null {
  if (day === null || !perDay || rule === "any_one") {
    return null;
  }
  return day;
}

/** "sábado 21/11", in the event's own wall-clock time. */
export function dayLabel(startsAt: string): string {
  const clock = wallClock(startsAt);
  return texts.day(texts.weekdays[clock.weekday] ?? "", `${pad(clock.day)}/${pad(clock.month)}`);
}

/** "no sábado 21/11" / "na sexta 20/11": the article goes with the weekday. */
export function onDayLabel(startsAt: string): string {
  const clock = wallClock(startsAt);
  const label = dayLabel(startsAt);
  // segunda… sexta are feminine; sábado and domingo masculine.
  return clock.weekday <= 4 ? texts.onDayFeminine(label) : texts.onDay(label);
}

/** The days of `days` a category with `rule` is valid on (every day for `every` and `any_one`). */
export function daysOf(rule: DayRule, validDays: readonly number[], days: readonly EventDay[]): EventDay[] {
  return rule === "days" ? days.filter((day) => validDays.includes(day.position)) : [...days];
}

/**
 * Where a ticket is valid, for the holder (digital ticket, /conferir): "Vale no sábado 21/11 e no
 * domingo 22/11, uma entrada por dia." `null` for an event of one day.
 */
export function validityText(rule: DayRule, validDays: readonly number[], days: readonly EventDay[]): string | null {
  if (days.length < 2) {
    return null;
  }
  const valid = daysOf(rule, validDays, days);
  switch (rule) {
    case "every":
      return texts.validity.every(texts.list(valid.map((day) => dayLabel(day.startsAt))));
    case "any_one":
      return texts.validity.any_one(texts.list(valid.map((day) => dayLabel(day.startsAt))));
    case "days":
      return texts.validity.days(texts.list(valid.map((day) => onDayLabel(day.startsAt))), valid.length);
  }
}

/** A category's rule in a few words, for cards and chips: "Todos os dias", "Só dom 22/11". */
export function ruleShort(rule: DayRule, validDays: readonly number[], days: readonly EventDay[]): string {
  if (rule === "days") {
    return texts.short.days(texts.list(daysOf(rule, validDays, days).map((day) => dayLabel(day.startsAt))));
  }
  return texts.short[rule];
}

// --- The days in the event form (`datetime-local` values, the event's wall-clock time) -------

/** A day as typed in the form. */
export interface DayInput {
  startsAt: string;
  endsAt: string;
}

/** Most days of an event, and longest a day may last (as the server: `event_days.rs`). */
export const MAX_DAYS = 31;
const MAX_DAY_MS = 48 * 3_600_000;

/** Milliseconds of a `datetime-local` value as a plain calendar time (no time zone), or `null`. */
function localMs(local: string): number | null {
  const time = Date.parse(`${local}:00Z`);
  return local === "" || Number.isNaN(time) ? null : time;
}

function localOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16);
}

/** A `datetime-local` value `hours` later, or `""` when it is not a time yet. */
export function laterLocal(local: string, hours: number): string {
  const time = localMs(local);
  return time === null ? "" : localOf(time + hours * 3_600_000);
}

/** The day after `last`, at the same times: what "add a day" suggests. */
export function nextDayInput(last: DayInput | undefined): DayInput {
  return last === undefined ? { startsAt: "", endsAt: "" } : { startsAt: laterLocal(last.startsAt, 24), endsAt: laterLocal(last.endsAt, 24) };
}

/** What is wrong with the days as typed; the first problem, by day (1 for the first). */
export type DaysProblem = { kind: "missing" | "end_before_start" | "too_long" | "overlap"; day: number };

/** The form's check of the days, the same rules as the server's (`invalid_days`). */
export function daysProblem(days: readonly DayInput[]): DaysProblem | null {
  let previousEnd: number | null = null;
  for (const [index, day] of days.entries()) {
    const position = index + 1;
    const start = localMs(day.startsAt);
    const end = localMs(day.endsAt);
    if (start === null || end === null) {
      return { kind: "missing", day: position };
    }
    if (end <= start) {
      return { kind: "end_before_start", day: position };
    }
    if (end - start > MAX_DAY_MS) {
      return { kind: "too_long", day: position };
    }
    if (previousEnd !== null && start < previousEnd) {
      return { kind: "overlap", day: position };
    }
    previousEnd = end;
  }
  return null;
}

/** "sábado 21/11" of a typed day, once its start is a date. */
export function dayInputLabel(day: DayInput): string | null {
  return localMs(day.startsAt) === null ? null : dayLabel(`${day.startsAt}:00Z`);
}
