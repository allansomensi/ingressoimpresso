/**
 * Ticket numbers typed the way people say them: "12, 15, 40-50", "40 a 50", "nº 7". Used by the
 * seller returns (ADR 0050), where a seller gives back scattered numbers.
 */

import { ticketNumber } from "@/lib/format";

/** An inclusive range of ticket numbers. */
export type NumberRange = { first: number; last: number };

export type NumberListResult =
  | { ok: true; ranges: NumberRange[]; count: number }
  | { ok: false; error: "empty" | "invalid" | "too_many"; token?: string };

/** Most ranges in one return (the API's limit). */
export const MAX_RANGES = 100;

const MAX_NUMBER = 9_999_999;

/**
 * Reads a list of numbers and ranges into sorted ranges. Repeated, overlapping and adjacent
 * numbers are merged ("12, 12, 13" is 12–13), so a slip never becomes an error.
 */
export function parseNumberList(text: string): NumberListResult {
  const normalized = text
    .toLowerCase()
    .replace(/n[º°o]\.?|#/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/\s+(?:a|até|ate)\s+/g, "-")
    .replace(/\s*-\s*/g, "-")
    // "1.500" is one thousand five hundred, as Brazilians write it.
    .replace(/(\d)\.(?=\d{3}(?!\d))/g, "$1")
    .trim();
  if (normalized === "") {
    return { ok: false, error: "empty" };
  }
  const ranges: NumberRange[] = [];
  for (const token of normalized.split(/[\s,;]+/).filter((part) => part !== "")) {
    const match = /^(\d+)(?:-(\d+))?$/.exec(token);
    const first = Number(match?.[1]);
    const last = match?.[2] === undefined ? first : Number(match[2]);
    if (match === null || first < 1 || last < first || last > MAX_NUMBER) {
      return { ok: false, error: "invalid", token };
    }
    ranges.push({ first, last });
  }
  const merged = mergeRanges(ranges);
  if (merged.length > MAX_RANGES) {
    return { ok: false, error: "too_many" };
  }
  return { ok: true, ranges: merged, count: countNumbers(merged) };
}

/** Sorted, with overlapping and adjacent ranges joined. */
export function mergeRanges(ranges: readonly NumberRange[]): NumberRange[] {
  const sorted = [...ranges].sort((a, b) => a.first - b.first);
  const merged: NumberRange[] = [];
  for (const range of sorted) {
    const previous = merged.at(-1);
    if (previous !== undefined && range.first <= previous.last + 1) {
      previous.last = Math.max(previous.last, range.last);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

/** How many numbers the ranges hold. */
export function countNumbers(ranges: readonly NumberRange[]): number {
  return ranges.reduce((sum, range) => sum + range.last - range.first + 1, 0);
}

/** The parts of `ranges` inside `within`, merged. */
export function intersect(ranges: readonly NumberRange[], within: readonly NumberRange[]): NumberRange[] {
  const parts: NumberRange[] = [];
  for (const range of ranges) {
    for (const other of within) {
      const first = Math.max(range.first, other.first);
      const last = Math.min(range.last, other.last);
      if (first <= last) {
        parts.push({ first, last });
      }
    }
  }
  return mergeRanges(parts);
}

/** `ranges` without the numbers in `removed`. */
export function subtract(ranges: readonly NumberRange[], removed: readonly NumberRange[]): NumberRange[] {
  const cuts = mergeRanges(removed);
  const parts: NumberRange[] = [];
  for (const range of mergeRanges(ranges)) {
    let next = range.first;
    for (const cut of cuts) {
      if (cut.last < next || cut.first > range.last) {
        continue;
      }
      if (cut.first > next) {
        parts.push({ first: next, last: cut.first - 1 });
      }
      next = Math.max(next, cut.last + 1);
    }
    if (next <= range.last) {
      parts.push({ first: next, last: range.last });
    }
  }
  return parts;
}

/** The first number of `ranges` outside `within`, or `null` when all are inside. */
export function firstOutside(ranges: readonly NumberRange[], within: readonly NumberRange[]): number | null {
  const covered = mergeRanges(within);
  for (const range of mergeRanges(ranges)) {
    let next = range.first;
    for (const other of covered) {
      if (other.last < next) {
        continue;
      }
      if (other.first > next) {
        break;
      }
      next = other.last + 1;
      if (next > range.last) {
        break;
      }
    }
    if (next <= range.last) {
      return next;
    }
  }
  return null;
}

/** The first number shared by both lists, or `null`. */
export function firstShared(ranges: readonly NumberRange[], others: readonly NumberRange[]): number | null {
  return intersect(ranges, others)[0]?.first ?? null;
}

/** "0012, 0015, 0040–0050", like the printed numbers. */
export function formatRanges(ranges: readonly NumberRange[], digits = 4): string {
  return ranges
    .map((range) =>
      range.first === range.last ? ticketNumber(range.first, digits) : `${ticketNumber(range.first, digits)}–${ticketNumber(range.last, digits)}`,
    )
    .join(", ");
}
