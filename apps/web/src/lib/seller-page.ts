/**
 * The seller's page (ADR 0053): every number the seller holds and where it stands.
 */

import type { SellerSaleDto, SellerViewDto, VoidReason } from "@ingressoimpresso/api-types";

/** Where one number stands, from the seller's point of view. */
export type NumberState = "available" | "sold" | VoidReason;

export type NumberCell = { number: number; state: NumberState; sale: SellerSaleDto | null };

/** Most numbers drawn as tiles; beyond that the page lists only what matters (sold, still held). */
export const MAX_CELLS = 2_000;

/** Every number of the seller's ranges with its state, in order. */
export function numberCells(view: Pick<SellerViewDto, "ranges" | "voids" | "sales">): NumberCell[] {
  const sales = new Map(view.sales.map((sale) => [sale.number, sale]));
  const voided = (number: number): VoidReason | null =>
    view.voids.find((item) => number >= item.first && number <= item.last)?.reason ?? null;
  const cells: NumberCell[] = [];
  for (const range of view.ranges) {
    for (let number = range.first; number <= range.last && cells.length < MAX_CELLS; number += 1) {
      const reason = voided(number);
      const sale = sales.get(number) ?? null;
      cells.push({ number, state: reason ?? (sale === null ? "available" : "sold"), sale: reason === null ? sale : null });
    }
  }
  return cells;
}

/** The lowest number still with the seller, or `null` when every one is sold or returned. */
export function nextAvailable(cells: readonly NumberCell[]): number | null {
  return cells.find((cell) => cell.state === "available")?.number ?? null;
}

/** The printed form of a number: `0042` (with the design's zero padding). */
export function padNumber(number: number, digits: number): string {
  return String(number).padStart(digits, "0");
}
