/**
 * The door engine: local decisions with `DoorCore`, the scan log in IndexedDB, the sync loop and
 * the online confirmation (ADR 0006). React reads its state through `useSyncExternalStore`.
 *
 * Invariant 6: a scan is decided locally and persisted before its result is shown; the network
 * can only make a result stricter (a copy or a void found online), within a 1.2 s budget.
 */
import type { DoorManifest, DoorScanResult, DoorVerifierDto } from "@ingressoimpresso/api-types";
import { DoorCore, loadTicketCore, type DecisionDto, type EntryDto } from "@ingressoimpresso/ticket-core-wasm";

import { CORE_WASM_URL } from "./assets";
import { DoorApiError, fetchManifest, registerDevice, uploadScans } from "./client";
import {
  CONFIRM_BUDGET_MS,
  ConfirmGate,
  errorView,
  RESCAN_WINDOW_MS,
  SYNC_INTERVAL_MS,
  alreadyEnteredView,
  numberOf,
  outcomeOf,
  viewOf,
  voidedView,
  type ResultView,
} from "./logic";
import * as storage from "./storage";

const UPLOAD_BATCH = 500;

export type Phase = "loading" | "unregistered" | "ready" | "revoked" | "failed";

export interface DoorState {
  phase: Phase;
  device: storage.StoredDevice | null;
  manifest: storage.StoredManifest | null;
  /** Scans of this phone not yet received by the server. */
  pending: number;
  /** Tickets known to have entered (all phones). */
  entryCount: number;
  lastSyncOkAt: number | null;
  /** Since when sync has been failing (null while it works). */
  offlineSince: number | null;
  /** The result on screen. */
  result: ResultView | null;
  /** Waiting for the online confirmation of the scan just read. */
  checking: boolean;
  /** Any QR was read since the app opened (readiness checklist). */
  testScanDone: boolean;
  /** A scan could not be persisted. */
  storageFailed: boolean;
}

const INITIAL: DoorState = {
  phase: "loading",
  device: null,
  manifest: null,
  pending: 0,
  entryCount: 0,
  lastSyncOkAt: null,
  offlineSince: null,
  result: null,
  checking: false,
  testScanDone: false,
  storageFailed: false,
};

function toEntryDto(entry: storage.StoredEntry): EntryDto {
  return { number: entry.number, atUnixMs: entry.atUnixMs, deviceName: entry.deviceName };
}

export class DoorEngine {
  #state: DoorState = INITIAL;
  readonly #listeners = new Set<() => void>();
  #core: DoorCore | null = null;
  #verifierJson = "";
  #timer: ReturnType<typeof setTimeout> | undefined;
  #syncing = false;
  #scanning = false;
  /** Bumped by `start` and `stop`: a sync loop of an older generation ends by itself. */
  #generation = 0;
  /** The last scanned QR and when it was last seen by the camera. */
  #last: { text: string; seenAt: number; view: ResultView } | null = null;
  readonly #gate = new ConfirmGate();

  // --- React binding -------------------------------------------------------------------

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  readonly getSnapshot = (): DoorState => this.#state;

  #set(patch: Partial<DoorState>): void {
    this.#state = { ...this.#state, ...patch };
    for (const listener of this.#listeners) {
      listener();
    }
  }

  // --- Lifecycle -----------------------------------------------------------------------

  /** Loads the WebAssembly core and the local database, then starts syncing. */
  async start(): Promise<void> {
    this.#generation += 1;
    const generation = this.#generation;
    try {
      await loadTicketCore(CORE_WASM_URL);
      const [device, manifest] = await Promise.all([storage.loadDevice(), storage.loadManifest()]);
      if (device === undefined) {
        this.#set({ phase: "unregistered" });
        return;
      }
      if (manifest !== undefined) {
        await this.#rebuildCore(manifest.verifier, manifest);
      }
      this.#set({
        phase: "ready",
        device,
        manifest: manifest ?? null,
        lastSyncOkAt: null,
        pending: await storage.pendingCount(),
      });
      this.#loop(generation);
    } catch {
      this.#set({ phase: "failed" });
    }
  }

  stop(): void {
    this.#generation += 1;
    clearTimeout(this.#timer);
    this.#core?.free();
    this.#core = null;
  }

  /** Trades an access token for this phone's credentials and downloads the event. */
  async register(accessToken: string, deviceName: string): Promise<void> {
    const registration = await registerDevice(accessToken, deviceName);
    const device: storage.StoredDevice = {
      deviceId: registration.deviceId,
      deviceName: registration.deviceName,
      secret: registration.deviceSecret,
      event: registration.event,
    };
    await storage.saveNewDevice(device);
    this.#core?.free();
    this.#core = null;
    this.#verifierJson = "";
    this.#last = null;
    this.#set({ ...INITIAL, phase: "ready", device });
    clearTimeout(this.#timer);
    this.#loop(this.#generation);
  }

  async forget(): Promise<void> {
    clearTimeout(this.#timer);
    await storage.forgetEverything();
    this.#core?.free();
    this.#core = null;
    this.#verifierJson = "";
    this.#set({ ...INITIAL, phase: "unregistered" });
  }

  // --- Scanning ------------------------------------------------------------------------

  /** Whether the door can decide (it has the event's keys). */
  get canScan(): boolean {
    return this.#core !== null && this.#state.phase === "ready";
  }

  /**
   * Handles the texts of one camera frame. Ignored while a result is on screen or a scan is
   * being processed. Among several codes, the first that is one of our tickets wins.
   */
  async scan(texts: readonly string[]): Promise<void> {
    const core = this.#core;
    const device = this.#state.device;
    if (core === null || device === null || texts.length === 0 || this.#scanning || this.#state.result !== null) {
      return;
    }
    const text = texts.find((candidate) => core.evaluate(candidate).kind !== "invalid") ?? texts[0];
    if (text === undefined) {
      return;
    }
    const now = Date.now();
    if (this.#last !== null && this.#last.text === text && now - this.#last.seenAt < RESCAN_WINDOW_MS) {
      // Still in front of the camera: the same answer again, silently, and no new scan. The
      // window slides while the code stays in view.
      this.#last = { ...this.#last, seenAt: now };
      this.#set({ result: { ...this.#last.view, repeat: true } });
      return;
    }
    this.#scanning = true;
    try {
      // DoorCore takes integer milliseconds.
      const at = Math.round(now + (this.#state.manifest?.offsetMs ?? 0));
      const decision = core.checkIn(text, at, device.deviceName);
      const scan = await this.#persist(decision, at, device.deviceName);
      let view = viewOf(decision, this.#context());
      if (decision.kind === "admit" && scan !== null && this.#gate.canConfirm(Date.now(), this.#state.lastSyncOkAt)) {
        this.#set({ checking: true, testScanDone: true });
        view = (await this.#confirm(scan, decision.number)) ?? view;
      }
      this.#last = { text, seenAt: Date.now(), view };
      this.#set({ result: view, checking: false, testScanDone: true, entryCount: core.entryCount });
    } catch {
      // A bug, never a decision: say so instead of showing nothing.
      this.#set({ result: errorView(), checking: false });
    } finally {
      this.#scanning = false;
    }
  }

  dismissResult(): void {
    this.#set({ result: null });
  }

  #context(): { digits: number; sellers: storage.StoredManifest["sellers"] } {
    const manifest = this.#state.manifest;
    return {
      digits: manifest?.event.numberDigits ?? this.#state.device?.event.numberDigits ?? 4,
      sellers: manifest?.sellers ?? [],
    };
  }

  async #persist(decision: DecisionDto, at: number, deviceName: string): Promise<storage.StoredScan | null> {
    const number = numberOf(decision);
    const scan: storage.StoredScan = {
      id: crypto.randomUUID(),
      number,
      outcome: outcomeOf(decision),
      scannedAtMs: at,
      synced: 0,
    };
    const entry =
      decision.kind === "admit" ? { scanId: scan.id, number: decision.number, atUnixMs: at, deviceName } : null;
    try {
      await storage.recordScan(scan, entry);
      this.#set({ pending: this.#state.pending + 1, storageFailed: false });
      return scan;
    } catch {
      this.#set({ storageFailed: true });
      return null;
    }
  }

  /** Online confirmation within the budget; returns a stricter result, if any. */
  async #confirm(scan: storage.StoredScan, number: number): Promise<ResultView | null> {
    const device = this.#state.device;
    if (device === null) {
      return null;
    }
    let result: DoorScanResult | undefined;
    try {
      const response = await uploadScans(device.secret, [storage.toUpload(scan)], true, CONFIRM_BUDGET_MS);
      result = response.results[0];
      this.#gate.onAnswer();
      await storage.markSynced([scan.id]);
      this.#set({ pending: Math.max(0, this.#state.pending - 1) });
    } catch (error) {
      if (error instanceof DoorApiError && error.revoked) {
        this.#set({ phase: "revoked" });
      } else {
        this.#gate.onTimeout(Date.now());
      }
      return null;
    }
    if (result?.class === "duplicate_entry" && result.firstEntry !== null) {
      // The copy entered elsewhere first: remember that entry so later scans agree.
      this.#core?.recordEntries([{ number, ...result.firstEntry }]);
      return alreadyEnteredView(number, result.firstEntry, this.#context());
    }
    if (result?.class === "void_entry" && result.voidReason !== null) {
      return voidedView(number, result.voidReason, this.#context());
    }
    return null;
  }

  // --- Sync ----------------------------------------------------------------------------

  #loop(generation: number): void {
    if (generation !== this.#generation) {
      return;
    }
    void this.syncNow().finally(() => {
      if (generation === this.#generation && this.#state.phase === "ready") {
        clearTimeout(this.#timer);
        this.#timer = setTimeout(() => {
          this.#loop(generation);
        }, SYNC_INTERVAL_MS);
      }
    });
  }

  /** Uploads pending scans, then downloads what changed. Never throws. */
  async syncNow(): Promise<void> {
    const device = this.#state.device;
    if (this.#syncing || device === null || this.#state.phase !== "ready") {
      return;
    }
    this.#syncing = true;
    try {
      for (;;) {
        const pending = await storage.pendingScans(UPLOAD_BATCH);
        if (pending.length === 0) {
          break;
        }
        await uploadScans(device.secret, pending.map(storage.toUpload), false);
        await storage.markSynced(pending.map((scan) => scan.id));
        if (pending.length < UPLOAD_BATCH) {
          break;
        }
      }
      const sentAt = Date.now();
      const manifest = await fetchManifest(device.secret, this.#state.manifest?.cursor ?? null);
      const receivedAt = Date.now();
      await this.#apply(manifest, receivedAt, Math.round(manifest.serverTimeMs - (sentAt + receivedAt) / 2));
      this.#set({ lastSyncOkAt: receivedAt, offlineSince: null, pending: await storage.pendingCount() });
    } catch (error) {
      if (error instanceof DoorApiError && error.revoked) {
        this.#set({ phase: "revoked" });
      } else {
        this.#set({ offlineSince: this.#state.offlineSince ?? Date.now() });
      }
    } finally {
      this.#syncing = false;
    }
  }

  async #apply(manifest: DoorManifest, syncedAt: number, offsetMs: number): Promise<void> {
    const stored: storage.StoredManifest = {
      event: manifest.event,
      verifier: manifest.verifier,
      voids: manifest.voids,
      sellers: manifest.sellers,
      cursor: manifest.cursor,
      syncedAt,
      offsetMs,
    };
    const added = await storage.addEntries(
      manifest.entries.map((entry) => ({
        scanId: entry.scanId,
        number: entry.number,
        atUnixMs: entry.atUnixMs,
        deviceName: entry.deviceName,
      })),
    );
    if (this.#core === null || JSON.stringify(manifest.verifier) !== this.#verifierJson) {
      await this.#rebuildCore(manifest.verifier, stored);
    } else {
      this.#core.replaceVoids(manifest.voids);
      this.#core.recordEntries(added.map(toEntryDto));
    }
    await storage.saveManifest(stored);
    this.#set({ manifest: stored, entryCount: this.#core?.entryCount ?? 0 });
  }

  /** A fresh core for new keys: verifier, voids and every known entry. */
  async #rebuildCore(verifier: DoorVerifierDto, manifest: storage.StoredManifest): Promise<void> {
    const core = new DoorCore(verifier);
    core.replaceVoids(manifest.voids);
    core.recordEntries((await storage.allEntries()).map(toEntryDto));
    this.#core?.free();
    this.#core = core;
    this.#verifierJson = JSON.stringify(verifier);
    this.#set({ entryCount: core.entryCount });
  }
}
