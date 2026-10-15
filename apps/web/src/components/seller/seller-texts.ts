import type { EventKind } from "@ingressoimpresso/api-types";
import { createContext, useContext } from "react";

import { forKind } from "@/lib/event-kind";
import { sellerPage as sellerPageTexts } from "@/texts/pt-BR/seller-page";

/** The kind of the seller's event, shared by the page with its sheets. */
export const SellerKind = createContext<EventKind | undefined>(undefined);

/** The seller page's texts in the words of the event: "ficha" for consumption tokens (ADR 0086). */
export function useSellerTexts(): typeof sellerPageTexts {
  return forKind(sellerPageTexts, sellerPageTexts.tokens, useContext(SellerKind));
}
