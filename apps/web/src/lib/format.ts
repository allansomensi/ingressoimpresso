/** Display formats shared by the panel (pt-BR). */

import { wallClockDate } from "@/lib/event-time";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** `R$ 1.234,50` from centavos. */
export function money(cents: number): string {
  return currency.format(cents / 100);
}

/** `20 de nov. de 2026, 22:00`. */
export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * A date and time in Brasília time, the same on the server and in any browser: for public pages
 * rendered on the server (a promotion's end), where the visitor's time zone would not match.
 */
export function brasiliaDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Sao_Paulo" });
}

/** `20/11/26 22:00` in Brasília time, the same on the server and in any browser (see `brasiliaDateTime`). */
export function brasiliaShortDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
}

/** The start of today in Brasília (no daylight saving since 2019: a fixed -03:00), as a timestamp. */
export function brasiliaMidnight(now = new Date()): number {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return Date.parse(`${day}T00:00:00-03:00`);
}

/** `20/11/2026` in Brasília time. */
export function brasiliaDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

/** `20/11/26 22:00`. */
export function shortDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/** An event's date and time in its own wall-clock time: `20 de nov. de 2026, 22:00`. */
export function eventDateTime(iso: string): string {
  return wallClockDate(iso).toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
}

/** Day of the month, short month and weekday of an event date, in its own wall-clock time. */
export function dateParts(iso: string): { day: string; month: string; weekday: string; time: string } {
  const date = wallClockDate(iso);
  const utc = { timeZone: "UTC" } as const;
  return {
    day: date.toLocaleDateString("pt-BR", { ...utc, day: "2-digit" }),
    month: date.toLocaleDateString("pt-BR", { ...utc, month: "short" }).replace(".", ""),
    weekday: date.toLocaleDateString("pt-BR", { ...utc, weekday: "short" }).replace(".", ""),
    time: date.toLocaleTimeString("pt-BR", { ...utc, hour: "2-digit", minute: "2-digit" }),
  };
}

/** A ticket number padded like the printed ones. */
export function ticketNumber(number: number, digits = 4): string {
  return String(number).padStart(digits, "0");
}

/** Initials for an avatar: "João Silva" → "JS". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter((part) => part !== "");
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

/** A typed amount: `cents` is `null` when left blank; `ok: false` when it cannot be read. */
export type MoneyInput = { ok: true; cents: number | null } | { ok: false };

/**
 * Reads an amount typed in Brazilian or plain form: "30", "30,5", "1.234,56", "1.500" (a dot
 * before exactly three digits groups thousands) or "12.50" (a dot before one or two digits is the
 * decimal separator).
 */
export function parseMoney(text: string): MoneyInput {
  const clean = text.trim().replace(/^R\$/i, "").replace(/\s/g, "");
  if (clean === "") {
    return { ok: true, cents: null };
  }
  let normalized: string;
  if (/^\d{1,3}(\.\d{3})*(,\d{1,2})?$/.test(clean) || /^\d+(,\d{1,2})?$/.test(clean)) {
    normalized = clean.replace(/\./g, "").replace(",", ".");
  } else if (/^\d+(\.\d{1,2})?$/.test(clean)) {
    normalized = clean;
  } else {
    return { ok: false };
  }
  const cents = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(cents) && cents <= 2_147_483_647 ? { ok: true, cents } : { ok: false };
}
