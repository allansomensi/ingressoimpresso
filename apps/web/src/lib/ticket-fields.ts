/**
 * Fields of ticket text blocks (`{evento}`, `{data}`…), as the server prints them
 * (crates/render/src/fields.rs). Used by the live preview; both sides test the same examples.
 */

import type { EventDayDto, EventDto } from "@ingressoimpresso/api-types";

import { wallClock } from "@/lib/event-time";

export const FIELDS = [
  "evento",
  "local",
  "data",
  "data_extenso",
  "semana",
  "dia",
  "mes",
  "mes_curto",
  "ano",
  "hora",
  "preco",
  "organizacao",
  "categoria",
  "dias",
] as const;

export type Field = (typeof FIELDS)[number];

const MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
] as const;
const WEEKDAYS = ["segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado", "domingo"] as const;
const FREE_PRICE = "Gratuito";

/**
 * What a ticket can print about its event (and who runs it, `{organizacao}`, ADR 0064), plus its
 * category (`{categoria}`, ADR 0084), known per ticket: previews pass a sample one.
 */
export type EventFields = Pick<EventDto, "name" | "venue" | "startsAt" | "ticketPriceCents"> & {
  organizationName?: string | null | undefined;
  categoryName?: string | null | undefined;
  /** The days of an event of several days (`{dias}`, ADR 0091). */
  days?: readonly Pick<EventDayDto, "startsAt">[] | undefined;
};

function isField(name: string): name is Field {
  return (FIELDS as readonly string[]).includes(name);
}

const pad = (value: number) => String(value).padStart(2, "0");

/** `R$ 1.234,50`; zero is "Gratuito". */
function money(cents: number): string {
  if (cents === 0) {
    return FREE_PRICE;
  }
  const reais = String(Math.trunc(Math.abs(cents) / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${cents < 0 ? "-" : ""}R$ ${reais},${pad(Math.abs(cents) % 100)}`;
}

/** "a, b e c": a list as written in Portuguese. */
function joinList(items: readonly string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} e ${items.at(-1) ?? ""}`;
}

/**
 * The days of an event: "21 e 22 de novembro de 2026", "30 de novembro e 1 de dezembro de 2026",
 * "31 de dezembro de 2026 e 1 de janeiro de 2027". Days in order; repeats print once.
 */
function daysText(starts: readonly string[]): string {
  const dates = [...new Set(starts.map((start) => start.slice(0, 10)))].sort().map((date) => wallClock(date));
  const years: { year: number; months: { month: number; days: number[] }[] }[] = [];
  for (const date of dates) {
    const year = years.at(-1);
    if (year?.year !== date.year) {
      years.push({ year: date.year, months: [{ month: date.month, days: [date.day] }] });
      continue;
    }
    const month = year.months.at(-1);
    if (month?.month === date.month) {
      month.days.push(date.day);
    } else {
      year.months.push({ month: date.month, days: [date.day] });
    }
  }
  return joinList(
    years.map(({ year, months }) =>
      `${joinList(months.map(({ month, days }) => `${joinList(days.map(String))} de ${MONTHS[month - 1] ?? ""}`))} de ${String(year)}`,
    ),
  );
}

function value(field: Field, event: EventFields): string {
  if (field === "evento") {
    return event.name.trim();
  }
  if (field === "local") {
    return (event.venue ?? "").trim();
  }
  if (field === "preco") {
    return event.ticketPriceCents === null ? "" : money(event.ticketPriceCents);
  }
  if (field === "organizacao") {
    return (event.organizationName ?? "").trim();
  }
  if (field === "categoria") {
    return (event.categoryName ?? "").trim();
  }
  if (field === "dias") {
    // An event of one day prints its date.
    const days = event.days ?? [];
    return daysText(days.length === 0 ? [event.startsAt] : days.map((day) => day.startsAt));
  }
  const d = wallClock(event.startsAt);
  const month = MONTHS[d.month - 1] ?? "";
  const weekday = WEEKDAYS[d.weekday] ?? "";
  switch (field) {
    case "data":
      return `${pad(d.day)}/${pad(d.month)}/${d.year}`;
    case "data_extenso":
      return `${weekday}, ${d.day} de ${month} de ${d.year}`;
    case "semana":
      return weekday;
    case "dia":
      return pad(d.day);
    case "mes":
      return month;
    case "mes_curto":
      return month.slice(0, 3);
    case "ano":
      return String(d.year);
    case "hora":
      return d.minute === 0 ? `${d.hour}h` : `${d.hour}h${pad(d.minute)}`;
  }
}

/**
 * `text` with its fields replaced; `null` when a field it uses is empty, so the block is not
 * printed. Unknown names in braces stay as typed.
 */
export function resolveFields(text: string, event: EventFields): string | null {
  let failed = false;
  const out = text.replace(/\{([a-z_]+)\}/g, (match, name: string) => {
    if (!isField(name)) {
      return match;
    }
    const resolved = value(name, event);
    if (resolved === "") {
      failed = true;
    }
    return resolved;
  });
  return failed ? null : out;
}

/** The printed value of a text block: fields replaced, trimmed, capitals if asked; `null` hides it. */
export function blockValue(block: { text: string; uppercase: boolean }, event: EventFields): string | null {
  const resolved = resolveFields(block.text, event)?.trim() ?? "";
  if (resolved === "") {
    return null;
  }
  return block.uppercase ? resolved.toUpperCase() : resolved;
}
