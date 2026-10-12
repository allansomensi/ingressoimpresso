/**
 * Refer and earn (ADR 0076): the code a visitor brought from `/i/<code>`, kept in this browser
 * until the account is created, and what the referral card shows.
 */

import type { ReferralDto } from "@ingressoimpresso/api-types";

const KEY = "ingressoimpresso.referral";
/** A code waits this long for the sign-up. */
export const REFERRAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** A code as typed or read from a link: uppercase, 6 to 12 letters and digits; `null` otherwise. */
export function normalizeReferralCode(raw: string | null | undefined): string | null {
  const code = (raw ?? "").trim().toUpperCase();
  return /^[A-Z0-9]{6,12}$/.test(code) ? code : null;
}

/** What is stored for a code. */
export function serializeReferral(code: string, now: number): string {
  return JSON.stringify({ code, savedAt: now });
}

/** The stored code, while it is fresh. */
export function parseReferral(raw: string | null, now: number): string | null {
  if (raw === null) {
    return null;
  }
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null || !("code" in value) || !("savedAt" in value)) {
      return null;
    }
    const { code, savedAt } = value;
    if (typeof code !== "string" || typeof savedAt !== "number" || now - savedAt > REFERRAL_TTL_MS || savedAt > now) {
      return null;
    }
    return normalizeReferralCode(code);
  } catch {
    return null;
  }
}

/** Keeps the code in this browser (nothing happens when storage is blocked: the URL carries it). */
export function saveReferral(code: string): void {
  try {
    window.localStorage.setItem(KEY, serializeReferral(code, Date.now()));
  } catch {
    // Private mode or blocked storage.
  }
}

/** The code kept in this browser, if fresh. */
export function readReferral(): string | null {
  try {
    return parseReferral(window.localStorage.getItem(KEY), Date.now());
  } catch {
    return null;
  }
}

/** Forgets the code once the account exists. */
export function clearReferral(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // See saveReferral.
  }
}

/** The invite link of a code. */
export function referralUrl(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, "")}/i/${code}`;
}

/** How a referral reads on the card: waiting, rewarded, rewarded only for the other side, revoked. */
export type ReferralState = "pending" | "rewarded" | "capped" | "revoked";

export function referralState(referral: Pick<ReferralDto, "status" | "capped">): ReferralState {
  if (referral.status === "rewarded" && referral.capped) {
    return "capped";
  }
  return referral.status;
}
