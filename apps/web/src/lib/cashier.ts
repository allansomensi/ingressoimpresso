/**
 * The token cashier (ADR 0098): a seller of a token event who sells fichas on the spot. The cashier
 * taps products, the page picks the lowest numbers still with them and marks the sale with how it
 * was paid; it goes through the same offline queue as any other sale (ADR 0074). The open shift is
 * counted here from the sales, so it includes what is still waiting to be sent.
 */

import type { SaleMethod, SellerViewDto } from "@ingressoimpresso/api-types";

import { categoryOf } from "@/lib/categories";
import { mergeRanges, type NumberRange } from "@/lib/number-list";
import type { NumberCell } from "@/lib/seller-page";

export const SALE_METHODS: readonly SaleMethod[] = ["cash", "pix", "card"];

/** Something the cashier sells: a category of fichas, or every ficha when there are none. */
export type CashierProduct = {
  /** The category's name, or `null` for an event without categories. */
  name: string | null;
  color: string | null;
  /** Price of one ficha in cents; `null` when neither the category nor the event has one. */
  priceCents: number | null;
  /** Numbers still with the cashier, lowest first. */
  available: number[];
};

type ViewPart = Pick<SellerViewDto, "categories" | "event">;

/** The products of the cashier's numbers, in the event's order of categories. */
export function cashierProducts(view: ViewPart, cells: readonly NumberCell[]): CashierProduct[] {
  const free = cells.filter((cell) => cell.state === "available").map((cell) => cell.number);
  if (view.categories.length === 0) {
    return free.length === 0 && cells.length === 0
      ? []
      : [{ name: null, color: null, priceCents: view.event.ticketPriceCents, available: free }];
  }
  const held = new Set(cells.map((cell) => cell.number));
  const products: CashierProduct[] = view.categories
    .filter((category) => category.ranges.some((range) => [...held].some((number) => range.first <= number && number <= range.last)))
    .map((category) => ({ name: category.name, color: category.color, priceCents: category.priceCents, available: [] }));
  const loose: number[] = [];
  for (const number of free) {
    const category = categoryOf(view.categories, number);
    const product = category === null ? undefined : products.find((item) => item.name === category.name);
    if (product === undefined) {
      loose.push(number);
    } else {
      product.available.push(number);
    }
  }
  if (loose.length > 0) {
    products.push({ name: null, color: null, priceCents: view.event.ticketPriceCents, available: loose });
  }
  return products;
}

/** How many of each product (by index in the product list) the buyer takes. */
export type Cart = ReadonlyMap<number, number>;

export function cartCount(cart: Cart): number {
  let count = 0;
  for (const quantity of cart.values()) {
    count += quantity;
  }
  return count;
}

/** What the cart costs; products without a price count as zero. */
export function cartTotal(cart: Cart, products: readonly CashierProduct[]): number {
  let total = 0;
  for (const [index, quantity] of cart) {
    total += quantity * (products[index]?.priceCents ?? 0);
  }
  return total;
}

/** The numbers the cart takes (the lowest of each product), as ranges; `null` when one runs out. */
export function cartRanges(cart: Cart, products: readonly CashierProduct[]): NumberRange[] | null {
  const numbers: number[] = [];
  for (const [index, quantity] of cart) {
    const product = products[index];
    if (product === undefined || quantity > product.available.length) {
      return null;
    }
    numbers.push(...product.available.slice(0, quantity));
  }
  return mergeRanges(numbers.map((number) => ({ first: number, last: number })));
}

/** The change for a cash payment; `null` while the buyer gave less than the total. */
export function changeDue(totalCents: number, receivedCents: number): number | null {
  return receivedCents >= totalCents ? receivedCents - totalCents : null;
}

/** What the open shift adds up to: the sales not closed yet, by how they were paid. */
export type ShiftTotals = { tokens: number; cashCents: number; pixCents: number; cardCents: number; otherCents: number };

/** The open shift counted from the page's sales (queued ones included), priced as the server does. */
export function openShift(view: Pick<SellerViewDto, "sales" | "voids" | "categories" | "event">): ShiftTotals {
  const totals: ShiftTotals = { tokens: 0, cashCents: 0, pixCents: 0, cardCents: 0, otherCents: 0 };
  for (const sale of view.sales) {
    if (sale.closed || view.voids.some((item) => item.first <= sale.number && sale.number <= item.last)) {
      continue;
    }
    const price = categoryOf(view.categories, sale.number)?.priceCents ?? view.event.ticketPriceCents ?? 0;
    totals.tokens += 1;
    switch (sale.method) {
      case "cash":
        totals.cashCents += price;
        break;
      case "pix":
        totals.pixCents += price;
        break;
      case "card":
        totals.cardCents += price;
        break;
      case null:
        totals.otherCents += price;
        break;
    }
  }
  return totals;
}
