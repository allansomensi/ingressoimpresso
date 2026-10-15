/**
 * The door engine: local decisions with `DoorCore`, the scan log in IndexedDB, the sync loop and
 * the online confirmation (ADR 0006). React reads its state through `useSyncExternalStore`.
 *
 * Invariant 6: a scan is decided locally and persisted before its result is shown; the network
 * can only make a result stricter (a copy or a void found online), within a 1.2 s budget.
 */
import type { DoorManifest, DoorScanResult, DoorVerifierDto } from "@ingressoimpresso/api-types";
import { DoorCore, loadTicketCore, type EntryDto } from "@ingressoimpresso/ticket-core-wasm";

import { CORE_WASM_URL } from "./assets";
import { DoorApiError, fetchManifest, registerDevice, reportRehearsal, uploadArrivals, uploadScans } from "./client";
import {
  CONFIRM_BUDGET_MS,
  ConfirmGate,
  canReplaceResult,
  errorView,
  RESCAN_WINDOW_MS,
  SYNC_INTERVAL_MS,
  alreadyEnteredView,
  boxOfficeTotals,
  canUndoArrival,
  guestState,
  isEntry,
  numberOf,
  outcomeOf,
  rehearsalView,
  viewOf,
  voidedView,
  wrongDoor,
  wrongDoorView,
  type DoorContext,
  type ResultView,
} from "./logic";
import { RECENT_LIMIT, recentScans, recentSummary, type RecentScan, type RecentSummary } from "./recent";
import * as storage from "./storage";

const UPLOAD_BATCH = 500;

export type Phase = "loading" | "unregistered" | "ready" | "revoked" | "failed";

/** Box office sales counted on this phone and across every phone (ADR 0069). */
export interface BoxOfficeCount {
  mine: { count: number; cents: number; unpriced: number };
  all: { count: number; cents: number; unpriced: number };
}

export interface DoorState {
  phase: Phase;
  device: storage.StoredDevice | null;
  manifest: storage.StoredManifest | null;
  /** Scans of this phone not yet received by the server. */
  pending: number;
  /** Tickets known to have entered (all phones). */
  entryCount: number;
  /** Tickets inside now (ADR 0083): with re-entry, those that entered and did not go out. */
  insideCount: number;
  /** This phone reads the exit (re-entry, ADR 0083); only while the event allows it. */
  exitMode: boolean;
  /** The organizer turned re-entry off while this phone read the exit: it reads entries again. */
  exitEnded: boolean;
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
  /** Rehearsal mode (ADR 0067): reads show what would happen, nothing is recorded. */
  rehearsing: boolean;
  /** A rehearsal was finished on this phone (since it registered). */
  rehearsed: boolean;
  /** A code was read in the current rehearsal. */
  rehearsalRead: boolean;
  /** Box office sales, when a seller is the box office (ADR 0069). */
  boxOffice: BoxOfficeCount | null;
  /** Guest arrivals of every phone (ADR 0070); the list itself is in the manifest. */
  arrivals: storage.StoredArrival[];
  /** Arrivals recorded on this phone (they may be undone for a while). */
  ownArrivalIds: ReadonlySet<string>;
}

const INITIAL: DoorState = {
  phase: "loading",
  device: null,
  manifest: null,
  pending: 0,
  entryCount: 0,
  insideCount: 0,
  exitMode: false,
  exitEnded: false,
  lastSyncOkAt: null,
  offlineSince: null,
  result: null,
  checking: false,
  testScanDone: false,
  storageFailed: false,
  rehearsing: false,
  rehearsed: false,
  rehearsalRead: false,
  boxOffice: null,
  arrivals: [],
  ownArrivalIds: new Set(),
};

function toEntryDto(entry: storage.StoredEntry): EntryDto {
  return { number: entry.number, atUnixMs: entry.atUnixMs, deviceName: entry.deviceName };
}

/** Hands stored movements to the core: entries (first ones and returns), then exits (ADR 0083). */
function recordMovements(core: DoorCore, movements: readonly storage.StoredEntry[]): void {
  core.recordEntries(movements.filter((item) => item.exit !== true).map(toEntryDto));
  core.recordExits(movements.filter((item) => item.exit === true).map(toEntryDto));
}

/** Whether the event lets a ticket that went out come back (manifests stored before lack it). */
function reentryOf(manifest: storage.StoredManifest | null | undefined): boolean {
  return manifest?.event.reentry === true;
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
  /**
   * The last scanned QR and when it was last seen by the camera. `dismissed`: the doorkeeper
   * tapped its result away, so the same code still in view does not bring it back.
   */
  #last: { text: string; seenAt: number; view: ResultView; dismissed?: boolean } | null = null;
  /** When the result on screen appeared. */
  #shownAt = 0;
  readonly #gate = new ConfirmGate();
  /** The ticket on the "wrong door" screen, which may be let in anyway (ADR 0068). */
  #wrongDoor: { text: string; number: number } | null = null;
  /** Numbers known to have entered (all phones) and let in by this phone, for the box office. */
  #entered = new Set<number>();
  #admittedHere = new Set<number>();
  #uploadingArrivals = false;

  // --- React binding -------------------------------------------------------------------

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  readonly getSnapshot = (): DoorState => this.#state;

  #set(patch: Partial<DoorState>): void {
    if (patch.result !== undefined && patch.result !== null && patch.result !== this.#state.result) {
      this.#shownAt = Date.now();
    }
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
      // The core (a fetch) and the local database (a disk read) load side by side.
      const [, device, manifest] = await Promise.all([loadTicketCore(CORE_WASM_URL), storage.loadDevice(), storage.loadManifest()]);
      if (device === undefined) {
        this.#set({ phase: "unregistered" });
        return;
      }
      if (manifest !== undefined) {
        await this.#rebuildCore(manifest.verifier, manifest);
      }
      const [arrivals, admitted, entries, rehearsalPending, exitMode] = await Promise.all([
        storage.allArrivals(),
        storage.ownAdmittedNumbers(),
        storage.allEntries(),
        storage.readFlag("rehearsalPending"),
        storage.readFlag("exitMode"),
      ]);
      this.#entered = new Set(entries.filter((entry) => entry.exit !== true).map((entry) => entry.number));
      this.#admittedHere = new Set(admitted);
      this.#set({
        phase: "ready",
        device,
        manifest: manifest ?? null,
        lastSyncOkAt: null,
        pending: await this.#pendingTotal(),
        rehearsed: rehearsalPending,
        exitMode,
        ...this.#arrivalState(arrivals),
      });
      this.#countBoxOffice();
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
    this.#wrongDoor = null;
    this.#entered = new Set();
    this.#admittedHere = new Set();
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

  /** Whether reads go to the exit now: the phone is set to it and the event allows re-entry. */
  get readingExits(): boolean {
    return this.#state.exitMode && reentryOf(this.#state.manifest);
  }

  /** Sets this phone to read the entrance or the exit (ADR 0083); kept across reloads. */
  async setExitMode(exit: boolean): Promise<void> {
    if (exit === this.#state.exitMode) {
      return;
    }
    this.#last = null;
    this.#wrongDoor = null;
    this.#set({ exitMode: exit, result: null });
    try {
      await storage.writeFlag("exitMode", exit);
    } catch {
      // Kept for this session at least.
    }
  }

  /**
   * Handles the texts of one camera frame. Ignored while a scan is being processed or a result
   * is on screen, except a green one seen for a moment, which a different ticket replaces (a busy
   * door does not wait). Among several codes, the first that is one of our tickets wins.
   */
  async scan(texts: readonly string[]): Promise<void> {
    const core = this.#core;
    const device = this.#state.device;
    if (core === null || device === null || texts.length === 0 || this.#scanning) {
      return;
    }
    const exit = this.readingExits;
    const text = texts.find((candidate) => (exit ? core.evaluateExit(candidate) : core.evaluate(candidate)).kind !== "invalid") ?? texts[0];
    if (text === undefined) {
      return;
    }
    const now = Date.now();
    const same = this.#last !== null && this.#last.text === text && now - this.#last.seenAt < RESCAN_WINDOW_MS;
    const shown = this.#state.result;
    if (shown !== null) {
      if (same && this.#last !== null) {
        // The code is still in view: keep the window sliding.
        this.#last = { ...this.#last, seenAt: now };
        return;
      }
      if (!canReplaceResult(shown, now - this.#shownAt)) {
        return;
      }
      // A new ticket: its own screen (or "checking") takes over.
      this.#set({ result: null });
    }
    if (same && this.#last !== null) {
      // Still in front of the camera: the same answer again, silently, and no new scan. The
      // window slides while the code stays in view. Once tapped away, it stays away.
      this.#last = { ...this.#last, seenAt: now };
      if (this.#last.dismissed !== true) {
        this.#set({ result: { ...this.#last.view, repeat: true } });
      }
      return;
    }
    this.#scanning = true;
    try {
      if (this.#state.rehearsing) {
        // Rehearsal: what would happen, never recorded nor sent (ADR 0067).
        const view = rehearsalView(text, exit ? core.evaluateExit(text) : core.evaluate(text), this.#context());
        this.#last = { text, seenAt: Date.now(), view };
        this.#set({ result: view, testScanDone: true, rehearsalRead: true });
        return;
      }
      // DoorCore takes integer milliseconds.
      const at = Math.round(now + (this.#state.manifest?.offsetMs ?? 0));
      const context = this.#context();
      if (exit) {
        const view = await this.#checkOut(core, text, at, device.deviceName);
        this.#last = { text, seenAt: Date.now(), view };
        this.#set({ result: view, testScanDone: true, ...this.#counts(core) });
        return;
      }
      // A door limited to some categories looks before letting in (ADR 0068): a valid ticket of
      // another category is refused without an entry, and the refusal is logged like any scan.
      if ((context.allowedCategoryIds ?? []).length > 0) {
        const preview = core.evaluate(text);
        const wrong = isEntry(preview) ? wrongDoor(context, preview.number) : null;
        if (isEntry(preview) && wrong !== null) {
          await this.#persist(
            { id: crypto.randomUUID(), number: preview.number, outcome: "rejected_wrong_door", scannedAtMs: at, synced: 0 },
            null,
          );
          const view = wrongDoorView(preview.number, wrong, context);
          this.#wrongDoor = { text, number: preview.number };
          this.#last = { text, seenAt: Date.now(), view: { ...view, override: false } };
          this.#set({ result: view, testScanDone: true });
          return;
        }
      }
      const view = await this.#checkIn(core, text, at, device.deviceName, false);
      this.#last = { text, seenAt: Date.now(), view };
      this.#set({ result: view, checking: false, testScanDone: true, ...this.#counts(core) });
    } catch {
      // A bug, never a decision: say so instead of showing nothing.
      this.#set({ result: errorView(), checking: false });
    } finally {
      this.#scanning = false;
    }
  }

  /** "Let in anyway" on the wrong-door screen: a normal check-in, marked as an exception. */
  async admitAnyway(): Promise<void> {
    const core = this.#core;
    const device = this.#state.device;
    const pending = this.#wrongDoor;
    if (core === null || device === null || pending === null || this.#scanning) {
      return;
    }
    this.#wrongDoor = null;
    this.#scanning = true;
    this.#set({ result: null });
    try {
      const at = Math.round(Date.now() + (this.#state.manifest?.offsetMs ?? 0));
      const view = await this.#checkIn(core, pending.text, at, device.deviceName, true);
      this.#last = { text: pending.text, seenAt: Date.now(), view };
      this.#set({ result: view, checking: false, ...this.#counts(core) });
    } catch {
      this.#set({ result: errorView(), checking: false });
    } finally {
      this.#scanning = false;
    }
  }

  /** Decides, persists (invariant 6) and, with a fresh sync, confirms online. */
  async #checkIn(core: DoorCore, text: string, at: number, deviceName: string, exception: boolean): Promise<ResultView> {
    const decision = core.checkIn(text, at, deviceName);
    const number = numberOf(decision);
    const scan = await this.#persist(
      {
        id: crypto.randomUUID(),
        number,
        outcome: outcomeOf(decision),
        scannedAtMs: at,
        synced: 0,
        ...(exception && isEntry(decision) ? { exception: true } : {}),
        // For this phone's history only (never uploaded).
        ...(decision.kind === "voided" || decision.kind === "invalid" ? { reason: decision.reason } : {}),
        ...(decision.kind === "other_event" ? { eventTag: decision.eventTag } : {}),
      },
      isEntry(decision) ? { number: decision.number, atUnixMs: at, deviceName } : null,
    );
    let view = viewOf(decision, this.#context());
    if (decision.kind === "admit") {
      this.#entered.add(decision.number);
      this.#admittedHere.add(decision.number);
      this.#countBoxOffice();
    }
    // A return is confirmed like a first entry: a copy may have come back first elsewhere.
    if (isEntry(decision) && scan !== null && this.#gate.canConfirm(Date.now(), this.#state.lastSyncOkAt)) {
      this.#set({ checking: true, testScanDone: true });
      view = (await this.#confirm(scan, decision.number)) ?? view;
    }
    return view;
  }

  /**
   * The exit (ADR 0083): decided and persisted like an entry (invariant 6), never confirmed
   * online (an exit can only make the door more permissive later, and the server keeps it).
   */
  async #checkOut(core: DoorCore, text: string, at: number, deviceName: string): Promise<ResultView> {
    const decision = core.checkOut(text, at, deviceName);
    await this.#persist(
      {
        id: crypto.randomUUID(),
        number: numberOf(decision),
        outcome: outcomeOf(decision),
        scannedAtMs: at,
        synced: 0,
        ...(decision.kind === "voided" || decision.kind === "invalid" ? { reason: decision.reason } : {}),
        ...(decision.kind === "other_event" ? { eventTag: decision.eventTag } : {}),
      },
      decision.kind === "exit" ? { number: decision.number, atUnixMs: at, deviceName, exit: true } : null,
    );
    return viewOf(decision, this.#context());
  }

  #counts(core: DoorCore): Pick<DoorState, "entryCount" | "insideCount"> {
    return { entryCount: core.entryCount, insideCount: core.insideCount };
  }

  /**
   * Takes the result off the screen. `byUser`: tapped away, so the same code still in front of
   * the camera does not bring it back; a green screen that left by itself may come back silently.
   */
  dismissResult(byUser = true): void {
    this.#wrongDoor = null;
    if (byUser && this.#last !== null) {
      this.#last = { ...this.#last, dismissed: true };
    }
    this.#set({ result: null });
  }

  /** This phone's latest scans and its totals, from the local database (works offline). */
  async recent(limit = RECENT_LIMIT): Promise<{ scans: RecentScan[]; summary: RecentSummary }> {
    const [scans, entries] = await Promise.all([storage.allScans(), storage.allEntries()]);
    return {
      scans: recentScans(scans, entries, this.#context(), this.#state.manifest?.voids ?? [], limit),
      summary: recentSummary(scans),
    };
  }

  // --- Rehearsal (ADR 0067) ------------------------------------------------------------

  startRehearsal(): void {
    this.#last = null;
    this.#wrongDoor = null;
    this.#set({ rehearsing: true, rehearsalRead: false, result: null });
  }

  /** Ends the rehearsal; the panel hears of it now or on the next sync. */
  async finishRehearsal(done: boolean): Promise<void> {
    this.#last = null;
    this.#set({ rehearsing: false, result: null });
    if (!done) {
      return;
    }
    this.#set({ rehearsed: true });
    try {
      await storage.writeFlag("rehearsalPending", true);
    } catch {
      // Told on the next sync attempt of this session at worst.
    }
    void this.#sendRehearsal();
  }

  async #sendRehearsal(): Promise<void> {
    const device = this.#state.device;
    if (device === null || !(await storage.readFlag("rehearsalPending").catch(() => this.#state.rehearsed))) {
      return;
    }
    try {
      await reportRehearsal(device.secret);
      await storage.writeFlag("rehearsalPending", false);
    } catch {
      // Offline: tried again on the next sync.
    }
  }

  // --- Guest list (ADR 0070) -----------------------------------------------------------

  /** Records that `people` of a guest's party came in: persisted before the screen shows it. */
  async arrive(guestId: string, people: number): Promise<storage.StoredArrival | null> {
    const device = this.#state.device;
    const guest = this.#state.manifest?.guests?.find((item) => item.id === guestId);
    if (device === null || guest === undefined) {
      return null;
    }
    const state = guestState(guest, this.#state.arrivals);
    const count = Math.min(Math.max(1, Math.round(people)), state.party - state.people);
    if (count < 1) {
      return null;
    }
    const arrival = {
      id: crypto.randomUUID(),
      guestId,
      people: count,
      atUnixMs: Math.round(Date.now() + (this.#state.manifest?.offsetMs ?? 0)),
      deviceName: device.deviceName,
      undoneAtMs: null,
    };
    try {
      await storage.recordArrival(arrival);
    } catch {
      this.#set({ storageFailed: true });
      return null;
    }
    const stored: storage.StoredArrival = { ...arrival, own: 1, synced: 0 };
    this.#set({
      storageFailed: false,
      pending: this.#state.pending + 1,
      ...this.#arrivalState([...this.#state.arrivals, stored]),
    });
    void this.#uploadArrivals();
    return stored;
  }

  /** Undoes an arrival recorded here by mistake (within 2 minutes). */
  async undoArrival(id: string): Promise<boolean> {
    const offset = this.#state.manifest?.offsetMs ?? 0;
    const now = Math.round(Date.now() + offset);
    const arrival = this.#state.arrivals.find((item) => item.id === id);
    if (arrival === undefined || !canUndoArrival(arrival, this.#state.ownArrivalIds, now)) {
      return false;
    }
    const undone = await storage.undoArrival(id, now).catch(() => undefined);
    if (undone === undefined) {
      return false;
    }
    this.#set({
      pending: arrival.synced === 1 ? this.#state.pending + 1 : this.#state.pending,
      ...this.#arrivalState(this.#state.arrivals.map((item) => (item.id === id ? undone : item))),
    });
    void this.#uploadArrivals();
    return true;
  }

  #arrivalState(arrivals: storage.StoredArrival[]): Pick<DoorState, "arrivals" | "ownArrivalIds"> {
    return {
      arrivals,
      ownArrivalIds: new Set(arrivals.filter((arrival) => arrival.own === 1).map((arrival) => arrival.id)),
    };
  }

  /** Sends pending arrivals and undos right away (the sync loop retries what fails). */
  async #uploadArrivals(): Promise<void> {
    const device = this.#state.device;
    if (device === null || this.#uploadingArrivals) {
      return;
    }
    this.#uploadingArrivals = true;
    try {
      for (;;) {
        const pending = await storage.pendingArrivals(UPLOAD_BATCH);
        if (pending.length === 0) {
          break;
        }
        const uploads = pending.map(storage.toArrivalUpload);
        await uploadArrivals(device.secret, uploads);
        await storage.markArrivalsSynced(uploads);
        if (pending.length < UPLOAD_BATCH) {
          break;
        }
      }
      const arrivals = await storage.allArrivals();
      this.#set({ pending: await this.#pendingTotal(), ...this.#arrivalState(arrivals) });
    } catch (error) {
      if (error instanceof DoorApiError && error.revoked) {
        this.#set({ phase: "revoked" });
      }
    } finally {
      this.#uploadingArrivals = false;
    }
  }

  async #pendingTotal(): Promise<number> {
    const [scans, arrivals] = await Promise.all([storage.pendingCount(), storage.pendingArrivalCount()]);
    return scans + arrivals;
  }

  // --- Box office (ADR 0069) -----------------------------------------------------------

  #countBoxOffice(): void {
    const context = this.#context();
    if (!context.sellers.some((seller) => seller.boxOffice === true)) {
      if (this.#state.boxOffice !== null) {
        this.#set({ boxOffice: null });
      }
      return;
    }
    this.#set({
      boxOffice: {
        mine: boxOfficeTotals(context, this.#admittedHere),
        all: boxOfficeTotals(context, this.#entered),
      },
    });
  }

  #context(): DoorContext {
    const manifest = this.#state.manifest;
    return {
      digits: manifest?.event.numberDigits ?? this.#state.device?.event.numberDigits ?? 4,
      sellers: manifest?.sellers ?? [],
      categories: manifest?.categories ?? [],
      seats: manifest?.seats ?? [],
      allowedCategoryIds: manifest?.allowedCategoryIds ?? [],
      doors: manifest?.doors ?? [],
      priceCents: manifest?.event.ticketPriceCents ?? null,
      sessions: manifest?.sessions ?? [],
      reentry: reentryOf(manifest),
      kind: manifest?.event.kind ?? this.#state.device?.event.kind ?? "tickets",
    };
  }

  /** Persists a scan, and its entry when admitted, before any result shows (invariant 6). */
  async #persist(
    scan: storage.StoredScan,
    entry: Omit<storage.StoredEntry, "scanId"> | null,
  ): Promise<storage.StoredScan | null> {
    try {
      await storage.recordScan(scan, entry === null ? null : { scanId: scan.id, ...entry });
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
      void storage.saveVerdict(scan.id, { kind: "already_entered", ...result.firstEntry }).catch(() => undefined);
      return alreadyEnteredView(number, result.firstEntry, this.#context());
    }
    if (result?.class === "void_entry" && result.voidReason !== null) {
      void storage.saveVerdict(scan.id, { kind: "voided", reason: result.voidReason }).catch(() => undefined);
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
      await this.#uploadArrivals();
      const sentAt = Date.now();
      const manifest = await fetchManifest(device.secret, this.#state.manifest?.cursor ?? null, {
        pending: await this.#pendingTotal(),
        guests: this.#state.manifest?.guestsVersion ?? "",
      });
      const receivedAt = Date.now();
      await this.#apply(manifest, receivedAt, Math.round(manifest.serverTimeMs - (sentAt + receivedAt) / 2));
      this.#set({ lastSyncOkAt: receivedAt, offlineSince: null, pending: await this.#pendingTotal() });
      void this.#sendRehearsal();
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
    const previous = this.#state.manifest;
    const stored: storage.StoredManifest = {
      event: manifest.event,
      verifier: manifest.verifier,
      voids: manifest.voids,
      sellers: manifest.sellers,
      categories: manifest.categories,
      seats: manifest.seats,
      cursor: manifest.cursor,
      syncedAt,
      offsetMs,
      allowedCategoryIds: manifest.allowedCategoryIds,
      doors: manifest.doors,
      sessions: manifest.sessions,
      // The list comes only when it changed (ADR 0070).
      guests: manifest.guests ?? previous?.guests ?? [],
      guestsVersion: manifest.guests === null ? (previous?.guestsVersion ?? "") : manifest.guestsVersion,
    };
    if (await storage.mergeArrivals(manifest.guestArrivals)) {
      this.#set(this.#arrivalState(await storage.allArrivals()));
    }
    const added = await storage.addEntries([
      ...manifest.entries.map((entry) => ({
        scanId: entry.scanId,
        number: entry.number,
        atUnixMs: entry.atUnixMs,
        deviceName: entry.deviceName,
      })),
      // Exits of re-entry (ADR 0083); servers before it send none.
      ...((manifest.exits as DoorManifest["exits"] | undefined) ?? []).map((exit) => ({
        scanId: exit.scanId,
        number: exit.number,
        atUnixMs: exit.atUnixMs,
        deviceName: exit.deviceName,
        exit: true as const,
      })),
    ]);
    if (this.#core === null || JSON.stringify(manifest.verifier) !== this.#verifierJson) {
      await this.#rebuildCore(manifest.verifier, stored);
    } else {
      this.#core.replaceVoids(manifest.voids);
      this.#core.setReentry(reentryOf(stored));
      recordMovements(this.#core, added);
    }
    await storage.saveManifest(stored);
    for (const entry of added) {
      if (entry.exit !== true) {
        this.#entered.add(entry.number);
      }
    }
    this.#set({ manifest: stored, ...(this.#core === null ? { entryCount: 0, insideCount: 0 } : this.#counts(this.#core)) });
    this.#countBoxOffice();
    // Re-entry turned off while this phone read the exit: it would let the people leaving "in".
    if (this.#state.exitMode && !reentryOf(stored)) {
      await this.setExitMode(false);
      this.#set({ exitEnded: true });
    }
  }

  /** The doorkeeper saw that this phone reads entries again. */
  dismissExitEnded(): void {
    this.#set({ exitEnded: false });
  }

  /** A fresh core for new keys: verifier, voids, re-entry and every known movement. */
  async #rebuildCore(verifier: DoorVerifierDto, manifest: storage.StoredManifest): Promise<void> {
    const core = new DoorCore(verifier);
    core.replaceVoids(manifest.voids);
    core.setReentry(reentryOf(manifest));
    recordMovements(core, await storage.allEntries());
    this.#core?.free();
    this.#core = core;
    this.#verifierJson = JSON.stringify(verifier);
    this.#set(this.#counts(core));
  }
}
