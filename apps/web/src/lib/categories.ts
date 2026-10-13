/**
 * Ticket categories (ADR 0056) and tables (ADR 0057): which number is meia, VIP… and where it
 * sits. The same rules print the band on paper (crates/render) and show it on screens.
 */

import type { NumberRange } from "@/lib/number-list";

/** Band colours offered in the editor: distinct from far away, readable in black or white. */
export const CATEGORY_COLORS = ["#2563eb", "#e11d48", "#ca8a04", "#16a34a", "#7c3aed", "#ea580c", "#0891b2", "#1f1d2b"] as const;

/** Anything with a name, a colour and number ranges. */
export type CategoryLike = { name: string; color: string; ranges: readonly NumberRange[] };

/** The category holding `number` (ranges of different categories never overlap). */
export function categoryOf<T extends CategoryLike>(categories: readonly T[], number: number): T | null {
  return categories.find((category) => category.ranges.some((range) => range.first <= number && number <= range.last)) ?? null;
}

/** The colour not used yet by any category, else the first. */
export function nextColor(categories: readonly { color: string }[]): string {
  return CATEGORY_COLORS.find((color) => !categories.some((category) => category.color === color)) ?? CATEGORY_COLORS[0];
}

/** Paid numbers without a category: `paid` minus every category range. */
export function uncategorized(paid: readonly NumberRange[], categories: readonly CategoryLike[]): number {
  let count = 0;
  for (const range of paid) {
    for (let number = range.first; number <= range.last; number += 1) {
      if (categoryOf(categories, number) === null) {
        count += 1;
      }
    }
  }
  return count;
}

/** How a suggested category is priced: the event's price, half of it, or free. */
export type PresetPrice = "event" | "half" | "free";

/**
 * The price field of a suggested category, in reais (`""` means the event's price): half of the
 * event's for meia, zero for courtesy. Without an event price, meia starts blank too.
 */
export function presetPriceText(price: PresetPrice, eventPrice: number | null): string {
  if (price === "free") {
    return "0,00";
  }
  if (price === "half" && eventPrice !== null) {
    return (Math.round(eventPrice / 2) / 100).toFixed(2).replace(".", ",");
  }
  return "";
}

/** The text printed on a ticket's band: `Meia · Mesa 5 · Lugar 3` (render.rs `band_tag`). */
export function bandText(category: string | null, seat: string | null): string | null {
  const parts = [category, seat].map((part) => part?.trim() ?? "").filter((part) => part !== "");
  return parts.length === 0 ? null : parts.join(" · ");
}

/** `Mesa 5 · Lugar 3` (texts.rs `seat_label`). */
export function seatLabel(table: string, seat: number): string {
  const suffix = ` · Lugar ${String(seat)}`;
  return `${[...table.trim()].slice(0, 40 - suffix.length).join("").trimEnd()}${suffix}`;
}

/** Where `number` sits, if anywhere. */
export function findSeat<T extends { guests: readonly { number: number; seat: number }[] }>(
  tables: readonly T[],
  number: number,
): { table: T; seat: number } | null {
  for (const table of tables) {
    const guest = table.guests.find((item) => item.number === number);
    if (guest !== undefined) {
      return { table, seat: guest.seat };
    }
  }
  return null;
}

/** Natural order of table names: "Mesa 2" before "Mesa 10". */
export function compareTables(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, "pt-BR", { numeric: true, sensitivity: "base" });
}

/** A position on the map, kept inside it (0–1). */
export function clampPosition(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.5;
}
