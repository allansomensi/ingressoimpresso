/**
 * The seller's page (ADR 0053): every number the seller holds and where it stands.
 */

import type { ReservationDto, SellerSaleDto, SellerSummaryDto, SellerViewDto, VoidReason } from "@ingressoimpresso/api-types";

import { isActive } from "@/lib/reservations";

/** Where one number stands, from the seller's point of view. */
export type NumberState = "available" | "sold" | "reserved" | VoidReason;

export type NumberCell = {
  number: number;
  state: NumberState;
  sale: SellerSaleDto | null;
  /** The active reservation holding the number (ADR 0072). */
  reservation: ReservationDto | null;
};

/** Most numbers drawn as tiles; beyond that the page lists only what matters (sold, still held). */
export const MAX_CELLS = 2_000;

type CellSource = Pick<SellerViewDto, "ranges" | "voids" | "sales"> & Partial<Pick<SellerViewDto, "reservations">>;

/** Where `number` stands. */
function cellOf(
  number: number,
  view: CellSource,
  sales: ReadonlyMap<number, SellerSaleDto>,
  reserved: ReadonlyMap<number, ReservationDto>,
): NumberCell {
  const reason = view.voids.find((item) => number >= item.first && number <= item.last)?.reason ?? null;
  if (reason !== null) {
    return { number, state: reason, sale: null, reservation: null };
  }
  const sale = sales.get(number) ?? null;
  if (sale !== null) {
    return { number, state: "sold", sale, reservation: null };
  }
  const reservation = reserved.get(number) ?? null;
  return { number, state: reservation === null ? "available" : "reserved", sale: null, reservation };
}

/** The active reservation of each number. */
function reservedNumbers(reservations: readonly ReservationDto[] | undefined, now: Date): Map<number, ReservationDto> {
  const reserved = new Map<number, ReservationDto>();
  for (const reservation of reservations ?? []) {
    if (!isActive(reservation, now)) {
      continue;
    }
    for (const range of reservation.numbers) {
      for (let number = range.first; number <= range.last; number += 1) {
        reserved.set(number, reservation);
      }
    }
  }
  return reserved;
}

/** Every number of the seller's ranges with its state, in order (up to `limit`). */
export function numberCells(view: CellSource, now = new Date(), limit = MAX_CELLS): NumberCell[] {
  const sales = new Map(view.sales.map((sale) => [sale.number, sale]));
  const reserved = reservedNumbers(view.reservations, now);
  const cells: NumberCell[] = [];
  for (const range of view.ranges) {
    for (let number = range.first; number <= range.last && cells.length < limit; number += 1) {
      cells.push(cellOf(number, view, sales, reserved));
    }
  }
  return cells;
}

/** The counts of the page's summary, recomputed from the numbers (after changes made offline). */
export function countCells(view: CellSource, now = new Date()): Pick<SellerSummaryDto, "tickets" | "sold" | "available" | "reserved"> {
  const counts = { tickets: 0, sold: 0, available: 0, reserved: 0 };
  for (const cell of numberCells(view, now, Number.POSITIVE_INFINITY)) {
    counts.tickets += 1;
    if (cell.state === "sold" || cell.state === "available" || cell.state === "reserved") {
      counts[cell.state] += 1;
    }
  }
  return counts;
}

/** The lowest number still with the seller, or `null` when every one is sold or returned. */
export function nextAvailable(cells: readonly NumberCell[]): number | null {
  return cells.find((cell) => cell.state === "available")?.number ?? null;
}

/** The printed form of a number: `0042` (with the design's zero padding). */
export function padNumber(number: number, digits: number): string {
  return String(number).padStart(digits, "0");
}
