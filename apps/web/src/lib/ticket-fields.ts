/**
 * Fields of ticket text blocks (`{evento}`, `{data}`…), as the server prints them
 * (crates/render/src/fields.rs). Used by the live preview; both sides test the same examples.
 */

import type { EventDto } from "@ingressoimpresso/api-types";

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

/** What a ticket can print about its event. */
export type EventFields = Pick<EventDto, "name" | "venue" | "startsAt" | "ticketPriceCents">;

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
