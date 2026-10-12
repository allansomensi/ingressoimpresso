import { describe, expect, it } from "vitest";

import {
  calendarSequence,
  foldLine,
  googleCalendarUrl,
  icsDate,
  icsFile,
  icsFileName,
  icsText,
  isApplePhone,
  mapsUrl,
  placeLine,
  type CalendarEntry,
} from "@/lib/calendar";

const entry: CalendarEntry = {
  uid: "8f1c2d9e-0000-4000-8000-000000000001-42@ingressoimpresso.com.br",
  title: "Show de Lançamento; ao vivo, com convidados",
  startsAt: "2026-11-20T22:00:00-03:00",
  endsAt: "2026-11-21T03:00:00-03:00",
  location: "Bar do Zé, Rua das Flores, 123",
  description: "Ingresso nº 0042\nOrganizado por Banda Os Vizinhos",
  sequence: 0,
  alarmMinutes: 120,
  alarmText: "Show: separe o seu ingresso.",
};

describe("calendar file (RFC 5545)", () => {
  it("writes instants in UTC", () => {
    expect(icsDate("2026-11-20T22:00:00-03:00")).toBe("20261121T010000Z");
    expect(icsDate("2026-03-14T21:30:00Z")).toBe("20260314T213000Z");
  });

  it("escapes text values", () => {
    expect(icsText(String.raw`a\b; c, d` + "\r\ne\nf")).toBe(String.raw`a\\b\; c\, d\ne\nf`);
  });

  it("folds long lines at 75 octets without splitting characters", () => {
    const line = `SUMMARY:${"á".repeat(60)}`;
    const folded = foldLine(line);
    const parts = folded.split("\r\n");
    expect(parts.length).toBeGreaterThan(1);
    const encoder = new TextEncoder();
    for (const [index, part] of parts.entries()) {
      expect(encoder.encode(part).length).toBeLessThanOrEqual(75);
      if (index > 0) {
        expect(part.startsWith(" ")).toBe(true);
      }
    }
    expect(parts.map((part, index) => (index === 0 ? part : part.slice(1))).join("")).toBe(line);
    expect(foldLine("SHORT:1")).toBe("SHORT:1");
  });

  it("builds one event with a stable uid, CRLF line ends and a reminder", () => {
    const file = icsFile(entry, new Date("2026-10-12T12:00:00Z"));
    expect(file.endsWith("\r\n")).toBe(true);
    expect(file.split("\r\n").every((line) => !line.includes("\n"))).toBe(true);
    const lines = file.replace(/\r\n /g, "").split("\r\n");
    expect(lines.slice(0, 6)).toEqual([
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Ingresso Impresso//Ingresso digital//PT-BR",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
    ]);
    expect(lines).toContain(`UID:${entry.uid}`);
    expect(lines).toContain("DTSTAMP:20261012T120000Z");
    expect(lines).toContain("SEQUENCE:0");
    expect(lines).toContain("DTSTART:20261121T010000Z");
    expect(lines).toContain("DTEND:20261121T060000Z");
    expect(lines).toContain(String.raw`SUMMARY:Show de Lançamento\; ao vivo\, com convidados`);
    expect(lines).toContain(String.raw`LOCATION:Bar do Zé\, Rua das Flores\, 123`);
    expect(lines).toContain(String.raw`DESCRIPTION:Ingresso nº 0042\nOrganizado por Banda Os Vizinhos`);
    expect(lines).toContain("TRIGGER:-PT120M");
    expect(lines.at(-2)).toBe("END:VCALENDAR");
  });

  it("leaves out an empty place and the reminder when asked", () => {
    const file = icsFile({ ...entry, location: null, alarmMinutes: null });
    expect(file).not.toContain("LOCATION:");
    expect(file).not.toContain("VALARM");
  });

  it("raises the sequence with each postponement", () => {
    expect(calendarSequence(null)).toBe(0);
    const first = calendarSequence("2026-10-12T12:00:00Z");
    const second = calendarSequence("2026-10-13T12:00:00Z");
    expect(first).toBeGreaterThan(0);
    expect(second).toBeGreaterThan(first);
    expect(calendarSequence("nope")).toBe(0);
  });

  it("names the file after the event", () => {
    expect(icsFileName("Show de Lançamento!", "evento")).toBe("show-de-lancamento.ics");
    expect(icsFileName("¡¡¡", "evento")).toBe("evento.ics");
  });
});

describe("calendar and maps links", () => {
  it("fills Google Calendar", () => {
    const url = new URL(googleCalendarUrl(entry));
    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("text")).toBe(entry.title);
    expect(url.searchParams.get("dates")).toBe("20261121T010000Z/20261121T060000Z");
    expect(url.searchParams.get("location")).toBe(entry.location);
    expect(new URL(googleCalendarUrl({ ...entry, location: null })).searchParams.has("location")).toBe(false);
  });

  it("joins venue and address", () => {
    expect(placeLine("Bar do Zé", "Rua das Flores, 123")).toBe("Bar do Zé, Rua das Flores, 123");
    expect(placeLine(" Bar do Zé ", null)).toBe("Bar do Zé");
    expect(placeLine(null, "  ")).toBeNull();
  });

  it("opens Apple Maps on iPhones and Google Maps elsewhere", () => {
    expect(mapsUrl("Bar do Zé, Rua 1", true)).toBe("https://maps.apple.com/?q=Bar%20do%20Z%C3%A9%2C%20Rua%201");
    expect(mapsUrl("Bar do Zé, Rua 1", false)).toBe("https://www.google.com/maps/search/?api=1&query=Bar%20do%20Z%C3%A9%2C%20Rua%201");
    expect(isApplePhone("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe(true);
    expect(isApplePhone("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5)).toBe(true);
    expect(isApplePhone("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0)).toBe(false);
    expect(isApplePhone("Mozilla/5.0 (Linux; Android 15; Pixel 9)")).toBe(false);
  });
});
