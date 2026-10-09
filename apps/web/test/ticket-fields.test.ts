import { describe, expect, it } from "vitest";

import { offsetMinutes, wallClock, wallClockInput, withOffset } from "@/lib/event-time";
import { blockValue, resolveFields, type EventFields } from "@/lib/ticket-fields";

// The same examples as crates/render/src/fields.rs.
const event: EventFields = {
  name: " Arraiá da Escola ",
  venue: "Ginásio Municipal",
  startsAt: "2026-03-14T21:00:00-03:00",
  ticketPriceCents: 2_500,
};

describe("resolveFields", () => {
  it("replaces every field", () => {
    const cases: [string, string][] = [
      ["{evento}", "Arraiá da Escola"],
      ["{local}", "Ginásio Municipal"],
      ["{data}", "14/03/2026"],
      ["{data_extenso}", "sábado, 14 de março de 2026"],
      ["{semana}", "sábado"],
      ["{dia}", "14"],
      ["{mes}", "março"],
      ["{mes_curto}", "mar"],
      ["{ano}", "2026"],
      ["{hora}", "21h"],
      ["{preco}", "R$ 25,00"],
      ["{dia}/{mes_curto} · {hora}", "14/mar · 21h"],
    ];
    for (const [text, expected] of cases) {
      expect(resolveFields(text, event)).toBe(expected);
    }
  });

  it("formats minutes, days and prices", () => {
    const other = { ...event, venue: null, startsAt: "2026-01-05T09:30:00Z", ticketPriceCents: 123_456_789 };
    expect(resolveFields("{hora}", other)).toBe("9h30");
    expect(resolveFields("{dia}", other)).toBe("05");
    expect(resolveFields("{data_extenso}", other)).toBe("segunda-feira, 5 de janeiro de 2026");
    expect(resolveFields("{preco}", other)).toBe("R$ 1.234.567,89");
    expect(resolveFields("{preco}", { ...other, ticketPriceCents: 0 })).toBe("Gratuito");
  });

  it("hides texts with empty fields", () => {
    const empty = { ...event, venue: null, ticketPriceCents: null };
    expect(resolveFields("Local: {local}", empty)).toBeNull();
    expect(resolveFields("{preco}", empty)).toBeNull();
    expect(resolveFields("Entrada individual", empty)).toBe("Entrada individual");
  });

  it("keeps unknown or broken braces", () => {
    expect(resolveFields("{nome} {evento} { {evento", { ...event, name: "Show" })).toBe("{nome} Show { {evento");
    expect(resolveFields("}{", event)).toBe("}{");
  });

  it("prints capitals and hides blank blocks", () => {
    expect(blockValue({ text: " {mes} ", uppercase: true }, event)).toBe("MARÇO");
    expect(blockValue({ text: "  ", uppercase: false }, event)).toBeNull();
  });
});

describe("event time", () => {
  it("reads the wall clock of the event, whatever the browser's time zone", () => {
    expect(wallClockInput("2026-06-27T20:30:00-04:00")).toBe("2026-06-27T20:30");
    expect(wallClock("2026-06-27T20:30:00-04:00")).toEqual({ year: 2026, month: 6, day: 27, hour: 20, minute: 30, weekday: 5 });
    expect(offsetMinutes("2026-06-27T20:30:00-04:00")).toBe(-240);
    expect(offsetMinutes("2026-06-27T20:30:00+05:30")).toBe(330);
    expect(offsetMinutes("2026-06-27T20:30:00Z")).toBe(0);
  });

  it("writes local times with an offset", () => {
    expect(withOffset("2026-03-14T21:00", -180)).toBe("2026-03-14T21:00:00-03:00");
    expect(withOffset("2026-03-14T21:00", 330)).toBe("2026-03-14T21:00:00+05:30");
    expect(withOffset("2026-03-14T21:00", 0)).toBe("2026-03-14T21:00:00+00:00");
  });
});
