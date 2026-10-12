/**
 * Guest list rules of the panel (ADR 0070): pasting names one per line, "Nome +2" for
 * companions, and the filters of the list. The API checks the same limits.
 */
import type { GuestDto } from "@ingressoimpresso/api-types";

import { normalizeName } from "@/portaria/logic";

export const MAX_GUEST_NAME = 80;
export const MAX_COMPANIONS = 20;
export const MAX_GUEST_NOTE = 120;
/** Names sent in one paste (the API takes up to 500). */
export const MAX_PASTE = 500;

export interface ParsedGuest {
  name: string;
  companions: number;
}

/** Bullets and numbering a pasted list may carry: "- ", "• ", "1. ", "2) ". */
const LIST_MARK = /^(?:[-*•–]\s+|\d{1,3}[.)]\s+)/u;
/** "+2", "+ 2" or "(+2)" at the end of a line. */
const COMPANIONS = /\s*\(?\+\s*(\d+)\)?\s*$/u;

/**
 * Lines of a pasted list: blank lines are skipped, bullets dropped, "+N" read as companions.
 * Lines that break a limit are reported by their (1-based) line number.
 */
export function parseGuestLines(text: string): { guests: ParsedGuest[]; errors: number[] } {
  const guests: ParsedGuest[] = [];
  const errors: number[] = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    let line = raw.replace(/\s+/g, " ").trim().replace(LIST_MARK, "");
    if (line === "") {
      return;
    }
    let companions = 0;
    const match = COMPANIONS.exec(line);
    if (match !== null) {
      companions = Number(match[1]);
      line = line.slice(0, match.index).trim();
    }
    if (line === "" || [...line].length > MAX_GUEST_NAME || companions > MAX_COMPANIONS) {
      errors.push(index + 1);
      return;
    }
    guests.push({ name: line, companions });
  });
  return { guests, errors };
}

export type GuestFilter = "all" | "arrived" | "missing";

/** Guests matching the search (accents and case ignored) and the filter. */
export function filterGuests(guests: readonly GuestDto[], query: string, filter: GuestFilter): GuestDto[] {
  const words = normalizeName(query).split(" ").filter((word) => word !== "");
  return guests.filter((guest) => {
    if (filter === "arrived" && guest.arrival === null) {
      return false;
    }
    if (filter === "missing" && guest.arrival !== null) {
      return false;
    }
    const text = normalizeName(`${guest.name} ${guest.note ?? ""}`);
    return words.every((word) => text.includes(word));
  });
}

/** People on the list and people in. */
export function guestTotals(guests: readonly GuestDto[]): { names: number; people: number; arrivedNames: number; arrivedPeople: number } {
  return guests.reduce(
    (totals, guest) => ({
      names: totals.names + 1,
      people: totals.people + guest.companions + 1,
      arrivedNames: totals.arrivedNames + (guest.arrival === null ? 0 : 1),
      arrivedPeople: totals.arrivedPeople + (guest.arrival?.people ?? 0),
    }),
    { names: 0, people: 0, arrivedNames: 0, arrivedPeople: 0 },
  );
}
