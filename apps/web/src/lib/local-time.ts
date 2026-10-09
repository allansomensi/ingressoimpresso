/**
 * `datetime-local` fields of the admin forms, in this device's time zone (admins schedule
 * promotions, prices and maintenance in their own clock).
 */

const pad = (value: number) => String(value).padStart(2, "0");

/** `2026-10-09T21:30` for an instant (empty for `null`). */
export function toLocalInput(iso: string | null | undefined): string {
  if (iso === null || iso === undefined || iso === "") {
    return "";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The instant of a `datetime-local` value as RFC 3339 (`null` when empty or invalid). */
export function fromLocalInput(value: string): string | null {
  if (value === "") {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** `datetime-local` value `days` from now, at the given hour. */
export function localInputIn(days: number, hour = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return toLocalInput(date.toISOString());
}
