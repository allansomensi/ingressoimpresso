/**
 * Pure rules of the door app: what a decision means, what the screen shows and when an online
 * confirmation is worth waiting for (ADR 0006). No browser APIs here, so it is unit tested.
 */
import type { DoorSellerRangeDto, ScanOutcome, VoidReason } from "@ingressoimpresso/api-types";
import type { DecisionDto } from "@ingressoimpresso/ticket-core-wasm";

import { texts } from "@/texts/pt-BR";

/** Sync period while the door screen is open. */
export const SYNC_INTERVAL_MS = 3_000;
/** The online confirmation waits at most this long; then the local decision stands. */
export const CONFIRM_BUDGET_MS = 1_200;
/** Confirm only if the last successful sync is this recent ("good signal"). */
export const FRESH_SYNC_MS = 10_000;
/** After this many confirmation timeouts in a row... */
export const MAX_CONFIRM_TIMEOUTS = 3;
/** ...stop confirming for this long, so the queue does not wait on a bad connection. */
export const CONFIRM_PAUSE_MS = 30_000;
/** The same QR read again within this window re-shows the previous result without a new scan. */
export const RESCAN_WINDOW_MS = 5_000;
/** Offline longer than this: warn to use one phone per line. */
export const OFFLINE_WARNING_MS = 120_000;

const t = texts.portaria.result;

export type Tone = "ok" | "bad" | "warn";

/** The full-screen result of a scan. */
export interface ResultView {
  tone: Tone;
  title: string;
  /** e.g. "Nº 0042". */
  number: string | null;
  /** Second line: when and where it entered, why it was voided or rejected. */
  detail: string | null;
  /** Who sold it, when the number is in a seller's range. */
  seller: string | null;
  /** The same code seen again while still in front of the camera: shown without a sound. */
  repeat?: boolean;
}

/** The outcome stored and uploaded for a decision. */
export function outcomeOf(decision: DecisionDto): ScanOutcome {
  switch (decision.kind) {
    case "admit":
      return "admitted";
    case "already_entered":
      return "rejected_used";
    case "voided":
      return "rejected_void";
    case "other_event":
      return "rejected_other_event";
    case "invalid":
      return "rejected_invalid";
  }
}

/** The ticket number of an authentic ticket of this event. */
export function numberOf(decision: DecisionDto): number | null {
  return decision.kind === "admit" || decision.kind === "already_entered" || decision.kind === "voided"
    ? decision.number
    : null;
}

/** Seller whose range holds `number` (ranges never overlap). */
export function sellerOf(sellers: readonly DoorSellerRangeDto[], number: number): string | null {
  return sellers.find((range) => range.first <= number && number <= range.last)?.seller ?? null;
}

/** Printed form of a number: zero padded to the design's digits. */
export function padNumber(number: number, digits: number): string {
  return String(number).padStart(digits, "0");
}

/** Local time `HH:MM` of a Unix millisecond timestamp. */
export function clockTime(unixMs: number): string {
  return new Date(unixMs).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** What the screen shows for a decision. */
export function viewOf(
  decision: DecisionDto,
  context: { digits: number; sellers: readonly DoorSellerRangeDto[] },
): ResultView {
  const number = numberOf(decision);
  const label = number === null ? null : t.number(padNumber(number, context.digits));
  const seller = number === null ? null : sellerOf(context.sellers, number);
  const sellerLine = seller === null ? null : t.seller(seller);
  switch (decision.kind) {
    case "admit":
      return { tone: "ok", title: t.admit, number: label, detail: null, seller: sellerLine };
    case "already_entered":
      return {
        tone: "bad",
        title: t.alreadyEntered,
        number: label,
        detail: t.alreadyEnteredAt(clockTime(decision.firstEntry.atUnixMs), decision.firstEntry.deviceName),
        seller: sellerLine,
      };
    case "voided":
      return { tone: "bad", title: t.voided, number: label, detail: t.voidReasons[decision.reason], seller: sellerLine };
    case "other_event":
      return { tone: "warn", title: t.otherEvent, number: null, detail: null, seller: null };
    case "invalid":
      return { tone: "bad", title: t.invalid, number: null, detail: t.invalidReasons[decision.reason], seller: null };
  }
}

/** Screen after the server found a copy (the first entry was on another phone). */
export function alreadyEnteredView(
  number: number,
  firstEntry: { atUnixMs: number; deviceName: string },
  context: { digits: number; sellers: readonly DoorSellerRangeDto[] },
): ResultView {
  return viewOf({ kind: "already_entered", number, firstEntry }, context);
}

/** Screen after the server found the ticket voided. */
export function voidedView(
  number: number,
  reason: VoidReason,
  context: { digits: number; sellers: readonly DoorSellerRangeDto[] },
): ResultView {
  return viewOf({ kind: "voided", number, reason }, context);
}

/** Screen for an unexpected failure while handling a scan. */
export function errorView(): ResultView {
  return { tone: "bad", title: t.error, number: null, detail: texts.errors.generic, seller: null };
}

/**
 * When an online confirmation is worth its wait: the last sync must be fresh, and after
 * repeated timeouts the door stops confirming for a while (ADR 0006).
 */
export class ConfirmGate {
  #timeouts = 0;
  #pausedUntil = 0;

  canConfirm(now: number, lastSyncOkAt: number | null): boolean {
    return lastSyncOkAt !== null && now - lastSyncOkAt < FRESH_SYNC_MS && now >= this.#pausedUntil;
  }

  onTimeout(now: number): void {
    this.#timeouts += 1;
    if (this.#timeouts >= MAX_CONFIRM_TIMEOUTS) {
      this.#timeouts = 0;
      this.#pausedUntil = now + CONFIRM_PAUSE_MS;
    }
  }

  onAnswer(): void {
    this.#timeouts = 0;
  }
}
