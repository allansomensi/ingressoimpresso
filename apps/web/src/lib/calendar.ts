/**
 * "Adicionar à agenda" and "Como chegar" on the digital ticket (ADR 0066). Everything is built in
 * the browser, so the calendar file also works without internet at the door.
 */

/** What goes into the calendar entry. */
export interface CalendarEntry {
  /** Stable across postponements: re-importing updates the entry instead of adding another. */
  uid: string;
  title: string;
  /** RFC 3339 instants. */
  startsAt: string;
  endsAt: string;
  location: string | null;
  description: string;
  /** Grows with every postponement (RFC 5545 `SEQUENCE`). */
  sequence: number;
  /** Reminder before the start, in minutes (none when `null`). */
  alarmMinutes: number | null;
  alarmText: string;
}

/** `20261120T220000Z` from an RFC 3339 instant. */
export function icsDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** A TEXT value of RFC 5545: backslash, semicolon, comma and line breaks escaped. */
export function icsText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

const encoder = new TextEncoder();

/** Folds a content line at 75 octets (RFC 5545 §3.1), never inside a UTF-8 character. */
export function foldLine(line: string): string {
  const parts: string[] = [];
  let current = "";
  let size = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    // The first line takes 75 octets; the next ones 74 plus the leading space.
    const limit = parts.length === 0 ? 75 : 74;
    if (size + bytes > limit) {
      parts.push(current);
      current = "";
      size = 0;
    }
    current += char;
    size += bytes;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

/** A calendar file with one event (`text/calendar`, CRLF line ends). */
export function icsFile(entry: CalendarEntry, now: Date = new Date()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Ingresso Impresso//Ingresso digital//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${entry.uid}`,
    `DTSTAMP:${icsDate(now.toISOString())}`,
    `SEQUENCE:${String(Math.max(0, Math.trunc(entry.sequence)))}`,
    `DTSTART:${icsDate(entry.startsAt)}`,
    `DTEND:${icsDate(entry.endsAt)}`,
    `SUMMARY:${icsText(entry.title)}`,
    ...(entry.location === null || entry.location.trim() === "" ? [] : [`LOCATION:${icsText(entry.location)}`]),
    `DESCRIPTION:${icsText(entry.description)}`,
    "STATUS:CONFIRMED",
    ...(entry.alarmMinutes === null
      ? []
      : ["BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsText(entry.alarmText)}`, `TRIGGER:-PT${String(entry.alarmMinutes)}M`, "END:VALARM"]),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

/** Minutes since 2026 of the last postponement: a `SEQUENCE` that only grows. */
export function calendarSequence(postponedAt: string | null): number {
  if (postponedAt === null) {
    return 0;
  }
  const at = Date.parse(postponedAt);
  return Number.isNaN(at) ? 0 : Math.max(0, Math.floor((at - Date.UTC(2026, 0, 1)) / 60_000));
}

/** The "Google Agenda" link with the event filled in (needs internet). */
export function googleCalendarUrl(entry: Pick<CalendarEntry, "title" | "startsAt" | "endsAt" | "location" | "description">): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: entry.title,
    dates: `${icsDate(entry.startsAt)}/${icsDate(entry.endsAt)}`,
    details: entry.description,
  });
  if (entry.location !== null && entry.location.trim() !== "") {
    params.set("location", entry.location);
  }
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Venue and address on one line (`null` when there is neither). */
export function placeLine(venue: string | null, address: string | null): string | null {
  const parts = [venue, address].map((part) => part?.trim() ?? "").filter((part) => part !== "");
  return parts.length === 0 ? null : parts.join(", ");
}

/** Whether the phone is an iPhone or iPad (Apple Maps opens there; Google Maps elsewhere). */
export function isApplePhone(userAgent: string, maxTouchPoints = 0): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

/** Directions to `place`: Apple Maps on iPhone, Google Maps (app or site) elsewhere. */
export function mapsUrl(place: string, apple: boolean): string {
  const query = encodeURIComponent(place);
  return apple ? `https://maps.apple.com/?q=${query}` : `https://www.google.com/maps/search/?api=1&query=${query}`;
}

/** `show-de-lancamento.ics` from the event's name (`fallback` when nothing is left). */
export function icsFileName(eventName: string, fallback: string): string {
  const base = eventName
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return `${base === "" ? fallback : base}.ics`;
}

/** Saves the calendar file: on phones, opening it offers "Adicionar à agenda". */
export function downloadIcs(content: string, fileName: string): void {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 10_000);
}
