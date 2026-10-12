/**
 * Reservations of a seller (ADR 0072): numbers held for a person until a deadline. Deadlines are
 * in the event's own time (`utc_offset_minutes`), wherever the phone is, like every event date
 * (ADR 0025): "amanhã" is the end of tomorrow where the event happens.
 */
import type { ReservationDto } from "@ingressoimpresso/api-types";

import { offsetMinutes, wallClock, withOffset } from "@/lib/event-time";
import { formatRanges } from "@/lib/number-list";
import { texts } from "@/texts/pt-BR";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** A reservation that ends within this much time is highlighted, with the reminder at hand. */
export const DUE_SOON_MS = DAY;

/** The quick deadlines of the reservation sheet. */
export const SHORTCUTS = ["tomorrow", "three_days", "friday"] as const;
export type DeadlineShortcut = (typeof SHORTCUTS)[number];

/** `YYYY-MM-DD` of the event's calendar day `days` after today. */
function eventDay(now: Date, offset: number, days: number): string {
  const shifted = new Date(now.getTime() + offset * MINUTE + days * DAY);
  return shifted.toISOString().slice(0, 10);
}

/** 0 = Monday … 6 = Sunday, today in the event's time. */
function eventWeekday(now: Date, offset: number): number {
  return (new Date(now.getTime() + offset * MINUTE).getUTCDay() + 6) % 7;
}

/** The deadline of a shortcut: the end of that day (23:59) in the event's time. */
export function shortcutDeadline(shortcut: DeadlineShortcut, now: Date, offset: number): string {
  let days: number;
  switch (shortcut) {
    case "tomorrow":
      days = 1;
      break;
    case "three_days":
      days = 3;
      break;
    case "friday": {
      // The next Friday: on a Friday, the one of next week.
      const ahead = (4 - eventWeekday(now, offset) + 7) % 7;
      days = ahead === 0 ? 7 : ahead;
      break;
    }
  }
  return withOffset(`${eventDay(now, offset, days)}T23:59`, offset);
}

/** A deadline typed in the sheet (`YYYY-MM-DDTHH:MM`, the event's time), as the API takes it. */
export function deadlineFromInput(local: string, offset: number): string | null {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local) ? withOffset(local, offset) : null;
}

/** Now in the event's wall-clock time, as a `datetime-local` value (the input's minimum). */
export function eventNowInput(now: Date, offset: number): string {
  return new Date(now.getTime() + offset * MINUTE).toISOString().slice(0, 16);
}

/** The value of the date input for a deadline (the event's wall-clock time). */
export function deadlineInput(iso: string): string {
  return iso.slice(0, 16);
}

/** Why a deadline cannot be used, or `null`: it must be in the future and before the event ends. */
export function deadlineProblem(iso: string, now: Date, endsAt: string): "past" | "after_event" | null {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time) || time <= now.getTime()) {
    return "past";
  }
  return time > new Date(endsAt).getTime() ? "after_event" : null;
}

/** Whether an active reservation ends within a day: the seller should remind the person. */
export function isDueSoon(reservation: Pick<ReservationDto, "expiresAt" | "active">, now: Date): boolean {
  const left = new Date(reservation.expiresAt).getTime() - now.getTime();
  return reservation.active && left > 0 && left <= DUE_SOON_MS;
}

/** Whether a reservation still holds its numbers at `now` (the server said so when it answered). */
export function isActive(reservation: Pick<ReservationDto, "expiresAt" | "active">, now: Date): boolean {
  return reservation.active && new Date(reservation.expiresAt).getTime() > now.getTime();
}

/**
 * "hoje, 23:59", "amanhã, 18:00" or "sex., 17/10, 23:59": the deadline in the event's time, from
 * the point of view of the event's today.
 */
export function deadlineLabel(iso: string, now: Date): string {
  const r = texts.reservations;
  const offset = offsetMinutes(iso);
  const clock = wallClock(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  const time = `${pad(clock.hour)}:${pad(clock.minute)}`;
  const day = iso.slice(0, 10);
  if (day === eventDay(now, offset, 0)) {
    return r.today(time);
  }
  if (day === eventDay(now, offset, 1)) {
    return r.tomorrow(time);
  }
  return r.onDay(r.weekdays[clock.weekday] ?? "", `${pad(clock.day)}/${pad(clock.month)}`, time);
}

/** "faltam 3 h", "faltam 25 min" or "venceu": how long the person still has. */
export function timeLeft(iso: string, now: Date): string {
  const r = texts.reservations;
  const left = new Date(iso).getTime() - now.getTime();
  if (left <= 0) {
    return r.expired;
  }
  if (left < HOUR) {
    return r.minutesLeft(Math.max(1, Math.floor(left / MINUTE)));
  }
  if (left < 2 * DAY) {
    return r.hoursLeft(Math.floor(left / HOUR));
  }
  return r.daysLeft(Math.floor(left / DAY));
}

/** The reminder sent to the person by WhatsApp, ready to go. */
export function reminderMessage({
  reservation,
  eventName,
  seller,
  digits,
  now,
}: {
  reservation: Pick<ReservationDto, "holderName" | "numbers" | "expiresAt">;
  eventName: string;
  seller: string;
  digits: number;
  now: Date;
}): string {
  const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;
  const count = reservation.numbers.reduce((sum, range) => sum + range.last - range.first + 1, 0);
  return texts.reservations.reminder({
    holder: firstName(reservation.holderName),
    seller: firstName(seller),
    eventName,
    numbers: formatRanges(reservation.numbers, digits),
    plural: count > 1,
    deadline: deadlineLabel(reservation.expiresAt, now),
  });
}
