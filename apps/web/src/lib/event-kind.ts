/**
 * Tickets or consumption tokens (ADR 0084). A token event works like a ticket one; only some
 * words change, and the token texts list just those, over the ticket ones.
 */
import type { EventKind } from "@ingressoimpresso/api-types";

/** `base` with the consumption-token words of `tokens` over it, for an event of `kind`. */
export function forKind<T extends object>(base: T, tokens: Partial<Record<keyof T, unknown>>, kind: EventKind | undefined): T {
  return kind === "tokens" ? ({ ...base, ...tokens } as T) : base;
}
