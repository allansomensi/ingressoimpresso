/**
 * Tickets or consumption tokens (ADR 0084). A token event works like a ticket one; only the words
 * change (ADR 0086). Each text module lists the token words of a section over the ticket ones, in
 * the same shape, and `forKind` lays them over the ticket words at any depth.
 */
import type { EventKind } from "@ingressoimpresso/api-types";

/** The literal texts of an `as const` module, as the types any other wording may take. */
type Widen<T> = T extends string
  ? string
  : T extends (...args: infer A) => infer R
    ? (...args: A) => Widen<R>
    : T extends readonly (infer U)[]
      ? readonly Widen<U>[]
      : T extends object
        ? { readonly [K in keyof T]: Widen<T[K]> }
        : T;

/** Another wording of `T`: any part of it, the same shape, functions with the same parameters. */
export type Overrides<T> = {
  readonly [K in keyof T]?: T[K] extends string
    ? string
    : T[K] extends (...args: never[]) => unknown
      ? Widen<T[K]>
      : T[K] extends readonly unknown[]
        ? Widen<T[K]>
        : T[K] extends object
          ? Overrides<T[K]>
          : T[K];
};

/** `O` with every key that `T` lacks turned into `never`, at any depth: a misspelled text fails. */
export type Known<O, T> = {
  [K in keyof O]: K extends keyof T
    ? O[K] extends (...args: never[]) => unknown
      ? O[K]
      : O[K] extends readonly unknown[]
        ? O[K]
        : O[K] extends object
          ? Known<O[K], T[K]>
          : O[K]
    : never;
};

function plain(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function merge(base: Record<string, unknown>, over: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(over)) {
    const under = base[key];
    out[key] = plain(under) && plain(value) ? merge(under, value) : value;
  }
  return out;
}

/** Text modules are constants: each pair is merged once. */
const merged = new WeakMap<object, WeakMap<object, object>>();

/** `base` with the consumption-token words of `tokens` over it, for an event of `kind`. */
export function forKind<T extends object>(base: T, tokens: Overrides<T>, kind: EventKind | undefined): T {
  if (kind !== "tokens") {
    return base;
  }
  let byTokens = merged.get(base);
  if (byTokens === undefined) {
    byTokens = new WeakMap();
    merged.set(base, byTokens);
  }
  let words = byTokens.get(tokens);
  if (words === undefined) {
    words = merge(base as Record<string, unknown>, tokens as Record<string, unknown>);
    byTokens.set(tokens, words);
  }
  return words as T;
}
