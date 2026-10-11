import { describe, expect, it } from "vitest";

import { nextAvailable, numberCells, padNumber } from "@/lib/seller-page";

const sale = (number: number, buyerName: string | null = null) => ({ number, buyerName, buyerPhone: null, soldAt: "2026-10-11T12:00:00Z", ticketUrl: null });

describe("seller page", () => {
  it("lists every number with where it stands", () => {
    const cells = numberCells({
      ranges: [
        { first: 1, last: 4 },
        { first: 10, last: 11 },
      ],
      voids: [{ first: 3, last: 3, reason: "unsold" }],
      sales: [sale(2, "Ana"), sale(3), sale(11)],
    });
    expect(cells.map((cell) => [cell.number, cell.state])).toEqual([
      [1, "available"],
      [2, "sold"],
      [3, "unsold"],
      [4, "available"],
      [10, "available"],
      [11, "sold"],
    ]);
    // A voided number is not shown as sold, even if a mark was left behind.
    expect(cells[2]?.sale).toBeNull();
    expect(cells[1]?.sale?.buyerName).toBe("Ana");
  });

  it("suggests the lowest number still with the seller", () => {
    const cells = numberCells({ ranges: [{ first: 5, last: 7 }], voids: [], sales: [sale(5)] });
    expect(nextAvailable(cells)).toBe(6);
    expect(nextAvailable(numberCells({ ranges: [{ first: 5, last: 5 }], voids: [], sales: [sale(5)] }))).toBeNull();
  });

  it("pads like the printed number", () => {
    expect(padNumber(42, 4)).toBe("0042");
    expect(padNumber(12345, 4)).toBe("12345");
  });
});
