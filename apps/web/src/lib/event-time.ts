/**
 * Event dates in the event's own wall-clock time (ADR 0025). The API answers with the offset the
 * event was saved with (`2026-06-27T20:30:00-04:00`), so the first 16 characters are the local
 * date and time wherever the panel is opened.
 */

export interface WallClock {
  year: number;
  /** 1–12. */
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** 0 = Monday … 6 = Sunday. */
  weekday: number;
}

/** `YYYY-MM-DDTHH:MM` of an RFC 3339 instant, as typed in a `datetime-local` input. */
export function wallClockInput(iso: string): string {
  return iso.slice(0, 16);
}

/** UTC offset in minutes of an RFC 3339 string (`Z` → 0). */
export function offsetMinutes(iso: string): number {
  const match = /([+-])(\d{2}):(\d{2})$/.exec(iso);
  if (match === null) {
    return 0;
  }
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "-" ? -minutes : minutes;
}

/** The browser's UTC offset at a local `datetime-local` value (for new events). */
export function browserOffset(local: string): number {
  return -new Date(local).getTimezoneOffset();
}

/** `2026-03-14T21:00` and −180 → `2026-03-14T21:00:00-03:00`. */
export function withOffset(local: string, minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${local.slice(0, 16)}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** Calendar parts of the wall-clock time of an event instant. */
export function wallClock(iso: string): WallClock {
  const [year = 0, month = 1, day = 1] = iso.slice(0, 10).split("-").map(Number);
  const [hour = 0, minute = 0] = iso.slice(11, 16).split(":").map(Number);
  // Date.UTC treats the parts as a plain calendar date: no time zone gets in the way.
  const weekday = (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
  return { year, month, day, hour, minute, weekday };
}

/** A `Date` whose UTC fields are the wall-clock time, to format with `timeZone: "UTC"`. */
export function wallClockDate(iso: string): Date {
  const clock = wallClock(iso);
  return new Date(Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute));
}
