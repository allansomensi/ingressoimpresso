/**
 * Typed wrapper around the `ticket-core` WebAssembly build used by the door app.
 *
 * The WebAssembly module must be loaded once (`loadTicketCore` in the browser, from a
 * same-origin URL precached by the service worker; `loadTicketCoreSync` in tests) before any
 * `DoorCore` is created.
 */
import init, {
  DoorCore as RawDoorCore,
  formatVersion as rawFormatVersion,
  initSync,
  type InitInput,
  type SyncInitInput,
} from "../pkg/ticket_core.js";
import { parseDecision } from "./decision";
import type { DecisionDto } from "./generated/DecisionDto";
import type { DoorEventDto } from "./generated/DoorEventDto";
import type { EntryDto } from "./generated/EntryDto";
import type { VoidRangeDto } from "./generated/VoidRangeDto";

export type { DecisionDto } from "./generated/DecisionDto";
export type { DirectionDto } from "./generated/DirectionDto";
export type { DoorEventDto } from "./generated/DoorEventDto";
export type { EntryDto } from "./generated/EntryDto";
export type { EventKeyDto } from "./generated/EventKeyDto";
export type { FirstEntryDto } from "./generated/FirstEntryDto";
export type { InvalidReasonDto } from "./generated/InvalidReasonDto";
export type { KeyStatusDto } from "./generated/KeyStatusDto";
export type { VoidRangeDto } from "./generated/VoidRangeDto";
export type { VoidReasonDto } from "./generated/VoidReasonDto";
export { parseDecision } from "./decision";

let loaded = false;
let loading: Promise<void> | undefined;

/**
 * Loads the WebAssembly module asynchronously (browser). Idempotent and safe under concurrent
 * calls: every caller shares the first in-flight load, so the module is instantiated once and
 * existing `DoorCore` instances never see their memory swapped.
 */
export function loadTicketCore(source: InitInput | Promise<InitInput>): Promise<void> {
  loading ??= init({ module_or_path: source }).then(
    () => {
      loaded = true;
    },
    (error: unknown) => {
      loading = undefined;
      throw error;
    },
  );
  return loading;
}

/** Loads the WebAssembly module synchronously from bytes or a compiled module (tests). Idempotent. */
export function loadTicketCoreSync(module: SyncInitInput): void {
  if (loaded) {
    return;
  }
  if (loading !== undefined) {
    throw new Error("ticket-core WebAssembly module is already loading asynchronously");
  }
  initSync({ module });
  loaded = true;
}

function assertLoaded(): void {
  if (!loaded) {
    throw new Error("ticket-core WebAssembly module is not loaded");
  }
}

/** The ticket format version understood by this build. */
export function formatVersion(): number {
  assertLoaded();
  return rawFormatVersion();
}

/**
 * A door device for one event: verifies scans and decides admit / already entered / voided /
 * other event / invalid, entirely offline. With re-entry (ADR 0083) it also decides the exit and
 * the return of a ticket that went out.
 *
 * Call `free()` when discarding an instance to release WebAssembly memory.
 */
export class DoorCore {
  readonly #raw: RawDoorCore;

  /** @throws if the event data is invalid (bad event id, malformed or weak public key, duplicate key ids). */
  constructor(event: DoorEventDto) {
    assertLoaded();
    this.#raw = new RawDoorCore(event);
  }

  /** Replaces every voided range. @throws (keeping the previous voids) if a range is malformed. */
  replaceVoids(voids: readonly VoidRangeDto[]): void {
    this.#raw.replaceVoids(voids);
  }

  /**
   * Records entries known from this or other devices. Order does not matter: the earliest entry
   * of each ticket wins. Returns how many became their ticket's first entry.
   */
  recordEntries(entries: readonly EntryDto[]): number {
    return this.#raw.recordEntries(entries);
  }

  /**
   * Records exits known from this or other devices (re-entry, ADR 0083). Order does not matter:
   * the latest movement of each ticket wins. Returns how many became their ticket's latest one.
   */
  recordExits(exits: readonly EntryDto[]): number {
    return this.#raw.recordExits(exits);
  }

  /** Allows or forbids re-entry, as the event says. Off by default. */
  setReentry(allowed: boolean): void {
    this.#raw.setReentry(allowed);
  }

  /** Evaluates a scan without recording anything. */
  evaluate(qrText: string): DecisionDto {
    return parseDecision(this.#raw.evaluate(qrText));
  }

  /** Evaluates a scan and, if admitted (first entry or return), records the entry in the same step. */
  checkIn(qrText: string, atUnixMs: number, deviceName: string): DecisionDto {
    return parseDecision(this.#raw.checkIn(qrText, atUnixMs, deviceName));
  }

  /** Evaluates a scan at the exit without recording anything. */
  evaluateExit(qrText: string): DecisionDto {
    return parseDecision(this.#raw.evaluateExit(qrText));
  }

  /** Evaluates a scan at the exit and, if it goes out, records the exit in the same step. */
  checkOut(qrText: string, atUnixMs: number, deviceName: string): DecisionDto {
    return parseDecision(this.#raw.checkOut(qrText, atUnixMs, deviceName));
  }

  /** How many distinct tickets have entered. */
  get entryCount(): number {
    return this.#raw.entryCount();
  }

  /** How many tickets are inside now: with re-entry, those that entered and did not go out. */
  get insideCount(): number {
    return this.#raw.insideCount();
  }

  /** Releases the WebAssembly memory held by this instance. */
  free(): void {
    this.#raw.free();
  }
}
