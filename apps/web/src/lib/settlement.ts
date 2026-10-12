/**
 * Settling with sellers (ADR 0050): where each one stands, and the summary sent by WhatsApp.
 */

import type { ReportRowDto } from "@ingressoimpresso/api-types";

import { money } from "@/lib/format";
import { formatRanges, type NumberRange } from "@/lib/number-list";
import { texts } from "@/texts/pt-BR";

/** Where a seller stands. */
export type SettlementState =
  /** Holds no tickets. */
  | { kind: "empty" }
  /** The event has no ticket price: only what was received is known. */
  | { kind: "no_price" }
  /** Owes nothing more. */
  | { kind: "settled" }
  /** Still owes `cents`. */
  | { kind: "owing"; cents: number }
  /** Paid `cents` more than owed. */
  | { kind: "overpaid"; cents: number };

export function settlementState(row: Pick<ReportRowDto, "tickets" | "balanceCents" | "receivedCents">): SettlementState {
  if (row.tickets === 0 && row.receivedCents === 0) {
    return { kind: "empty" };
  }
  if (row.balanceCents === null) {
    return { kind: "no_price" };
  }
  if (row.balanceCents > 0) {
    return { kind: "owing", cents: row.balanceCents };
  }
  if (row.balanceCents < 0) {
    return { kind: "overpaid", cents: -row.balanceCents };
  }
  return { kind: "settled" };
}

/** Share of the amount due already received, 0–100. */
export function receivedPercent(row: Pick<ReportRowDto, "amountDueCents" | "receivedCents">): number {
  const due = row.amountDueCents ?? 0;
  if (due <= 0) {
    return row.receivedCents > 0 ? 100 : 0;
  }
  return Math.min(100, Math.round((row.receivedCents / due) * 100));
}

/**
 * Totals over the sellers (the unassigned line owes nothing). What is still to collect and what was
 * paid beyond are kept apart: one seller's extra does not settle another seller's debt.
 */
export function settlementTotals(rows: readonly ReportRowDto[]): {
  dueCents: number;
  receivedCents: number;
  outstandingCents: number;
  overpaidCents: number;
  settled: number;
  active: number;
} {
  let dueCents = 0;
  let receivedCents = 0;
  let outstandingCents = 0;
  let overpaidCents = 0;
  let settled = 0;
  let active = 0;
  for (const row of rows) {
    dueCents += row.amountDueCents ?? 0;
    receivedCents += row.receivedCents;
    const state = settlementState(row);
    if (state.kind === "empty") {
      continue;
    }
    active += 1;
    if (state.kind === "owing") {
      outstandingCents += state.cents;
    } else if (state.kind === "settled" || state.kind === "overpaid") {
      settled += 1;
      if (state.kind === "overpaid") {
        overpaidCents += state.cents;
      }
    }
  }
  return { dueCents, receivedCents, outstandingCents, overpaidCents, settled, active };
}

/**
 * A `wa.me` link to the seller's phone (Brazilian numbers get the 55 country code), or to the
 * contact picker when there is no usable phone.
 */
export function whatsappLink(phone: string | null, message: string): string {
  const text = `text=${encodeURIComponent(message)}`;
  let digits = (phone ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (digits.length === 10 || digits.length === 11) {
    digits = `55${digits}`;
  }
  return digits.length >= 12 && digits.length <= 15 ? `https://wa.me/${digits}?${text}` : `https://wa.me/?${text}`;
}

/** The settlement summary a seller receives, one fact per line. */
export function settlementMessage({
  seller,
  eventName,
  ranges,
  row,
  priceCents,
}: {
  seller: string;
  eventName: string;
  ranges: readonly NumberRange[];
  row: ReportRowDto;
  priceCents: number | null;
}): string {
  const w = texts.event.sellers.whatsapp;
  const firstName = seller.trim().split(/\s+/)[0] ?? seller;
  const lines = [w.greeting(firstName, eventName), "", w.took(row.tickets, formatRanges(ranges))];
  if (row.boxOffice) {
    // A box office sells what enters at the door (ADR 0069): returns do not count.
    lines.push(w.boxOffice(row.declaredSold));
  } else if (row.unsold > 0 || row.lost > 0) {
    lines.push(w.gaveBack(row.unsold, row.lost));
  }
  if (priceCents !== null && row.amountDueCents !== null) {
    lines.push(w.due(row.declaredSold, money(priceCents), money(row.amountDueCents)));
  }
  lines.push(w.received(money(row.receivedCents)));
  const state = settlementState(row);
  if (state.kind === "owing") {
    lines.push("", w.owing(money(state.cents)));
  } else if (state.kind === "settled") {
    lines.push("", w.settled);
  } else if (state.kind === "overpaid") {
    lines.push("", w.overpaid(money(state.cents)));
  }
  return lines.join("\n");
}

/** Today in the browser's time zone, `YYYY-MM-DD` (the default day of a payment). */
export function todayIso(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** `12/10` from `2026-10-12` (or `12/10/25` in another year). */
export function shortDay(iso: string, now = new Date()): string {
  const [year, month, day] = iso.split("-");
  if (year === undefined || month === undefined || day === undefined) {
    return iso;
  }
  return Number(year) === now.getFullYear() ? `${day}/${month}` : `${day}/${month}/${year.slice(2)}`;
}
