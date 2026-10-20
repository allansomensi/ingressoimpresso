import type { SellerSaleDto, SellerViewDto } from "@ingressoimpresso/api-types";
import { describe, expect, it } from "vitest";

import { cartRanges, cartTotal, cashierProducts, changeDue, openShift } from "@/lib/cashier";
import { numberCells } from "@/lib/seller-page";

const sale = (number: number, method: SellerSaleDto["method"], closed = false): SellerSaleDto => ({
  number,
  buyerName: null,
  buyerPhone: null,
  soldAt: "2026-06-13T22:00:00Z",
  ticketUrl: null,
  pixReceipt: null,
  method,
  closed,
});

type View = Pick<SellerViewDto, "ranges" | "voids" | "sales" | "categories" | "event" | "reservations">;

function view(sales: SellerSaleDto[], categories: SellerViewDto["categories"] = []): View {
  return {
    ranges: [{ first: 1, last: 10 }],
    voids: [{ first: 10, last: 10, reason: "lost" }],
    sales,
    reservations: [],
    categories,
    event: { ticketPriceCents: 500 } as SellerViewDto["event"],
  };
}

const BEER = { name: "Cerveja", color: "#d4a017", priceCents: 800, ranges: [{ first: 1, last: 5 }] };

describe("token cashier", () => {
  it("offers each product with the lowest numbers still free", () => {
    const current = view([sale(1, "cash")], [BEER]);
    const products = cashierProducts(current, numberCells(current));
    expect(products.map((product) => [product.name, product.priceCents, product.available])).toEqual([
      ["Cerveja", 800, [2, 3, 4, 5]],
      // Numbers outside every category are sold at the event's price.
      [null, 500, [6, 7, 8, 9]],
    ]);
    const cart = new Map([
      [0, 2],
      [1, 1],
    ]);
    expect(cartTotal(cart, products)).toBe(2100);
    expect(cartRanges(cart, products)).toEqual([
      { first: 2, last: 3 },
      { first: 6, last: 6 },
    ]);
    // More than what is left: nothing is picked.
    expect(cartRanges(new Map([[0, 5]]), products)).toBeNull();
  });

  it("sells every ficha at the event's price without categories", () => {
    const current = view([]);
    const products = cashierProducts(current, numberCells(current));
    expect(products).toEqual([{ name: null, color: null, priceCents: 500, available: [1, 2, 3, 4, 5, 6, 7, 8, 9] }]);
  });

  it("counts the open shift by how it was paid, as the server does", () => {
    const shift = openShift(view([sale(1, "cash"), sale(2, "pix"), sale(3, "cash", true), sale(6, "card"), sale(7, null), sale(10, "cash")], [BEER]));
    // 3 was closed already; 10 is voided.
    expect(shift).toEqual({ tokens: 4, cashCents: 800, pixCents: 800, cardCents: 500, otherCents: 500 });
  });

  it("gives the change only once the money covers the total", () => {
    expect(changeDue(2100, 5000)).toBe(2900);
    expect(changeDue(2100, 2100)).toBe(0);
    expect(changeDue(2100, 2000)).toBeNull();
  });
});
