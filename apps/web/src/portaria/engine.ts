/**
 * The door engine: local decisions with `DoorCore`, the scan log in IndexedDB, the sync loop and
 * the online confirmation (ADR 0006). React reads its state through `useSyncExternalStore`.
 *
 * Invariant 6: a scan is decided locally and persisted before its result is shown; the network
 * can only make a result stricter (a copy or a void found online), within a 1.2 s budget.
 *
 * Books (ADRs 0091, 0092): the engine keeps one `DoorCore` per book, each with the same keys and
 * voids and only the movements of its book: the whole event's, or one day's in an event of several
 * days. A checkpoint's phone only knows the checkpoint's uses, so its books are the checkpoint's.
 * Inside a book the core decides exactly as always; the rules choose the book.
 */
import type {
  DoorCheckpointDto,
  DoorEventInfo,
  DoorManifest,
  DoorScanResult,
  DoorVerifierDto,
  DoorVoidDto,
  EventDayDto,
  ExceptionKind,
} from "@ingressoimpresso/api-types";
import { DoorCore, loadTicketCore, type EntryDto } from "@ingressoimpresso/ticket-core-wasm";

import { currentDay } from "@/lib/event-days";

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
  bookKey,
  bookOf,
  boxOfficeTotals,
  canUndoArrival,
  checkView,
  guestState,
  isEntry,
  notEntitled,
  notEntitledView,
  numberOf,
  outcomeOf,
  rehearsalView,
  staleNote,
  todayOf,
  viewOf,
  voidedView,
  wrongDay,
  wrongDayView,
  wrongDoor,
  wrongDoorView,
  type DoorContext,
  type ResultView,
} from "./logic";
import { RECENT_LIMIT, endSummary, recentScans, recentSummary, type EndSummary, type RecentScan, type RecentSummary } from "./recent";
import * as storage from "./storage";

const UPLOAD_BATCH = 500;

export type Phase = "loading" | "unregistered" | "ready" | "revoked" | "failed";

/**
 * What a read does: let in (or hand over, at a checkpoint), let out (re-entry, ADR 0083), or only
 * look (check, ADR 0090).
 */
export type DoorMode = "entrance" | "exit" | "check";

/** What the button of the result on screen does (ADRs 0068, 0090–0092). */
type PendingAction = { text: string; kind: ExceptionKind | "register" };

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
  /** Tickets known to have entered (all phones); at a checkpoint, its uses (ADR 0092). */
  entryCount: number;
  /** Of those, today's, in an event of several days (ADR 0091); `null` for one day. */
  todayCount: number | null;
  /** Tickets inside now (ADR 0083): with re-entry, those that entered and did not go out. */
  insideCount: number;
  /** This phone reads the exit (re-entry, ADR 0083); only while the event allows it. */
  exitMode: boolean;
  /** The organizer turned re-entry off while this phone read the exit: it reads entries again. */
  exitEnded: boolean;
  /** This phone only checks (ADR 0090): nothing is recorded. */
  checkMode: boolean;
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
  todayCount: null,
  insideCount: 0,
  exitMode: false,
  exitEnded: false,
  checkMode: false,
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

/** The book a movement counts in (stored before ADR 0091: the whole event). */
function bookKeyOf(movement: storage.StoredEntry): string {
  return bookKey(movement.ledgerDay ?? null);
}

/** The days of the event (manifests stored before ADR 0091 lack them). */
function daysOf(event: DoorEventInfo | undefined): readonly EventDayDto[] {
  return (event?.days as EventDayDto[] | undefined) ?? [];
}

/** The day a movement happened on: the phone's, else by its time. */
function dayOfMovement(movement: storage.StoredEntry, days: readonly EventDayDto[]): number | null {
  return movement.day ?? currentDay(days, movement.atUnixMs);
}

/** Total order of a ticket's movements, as the core's (time, phone, an exit after an entry). */
function laterMovement(a: storage.StoredEntry, b: storage.StoredEntry): boolean {
  if (a.atUnixMs !== b.atUnixMs) {
    return a.atUnixMs > b.atUnixMs;
  }
  if (a.deviceName !== b.deviceName) {
    return a.deviceName > b.deviceName;
  }
  return a.exit === true && b.exit !== true;
}

/**
 * Tickets of the whole event's book inside now that came in `today` (ADR 0091, with re-entry):
 * "one day of their choice" tickets of other days are not inside any more.
 */
function insideToday(movements: readonly storage.StoredEntry[], days: readonly EventDayDto[], today: number): number {
  const last = new Map<number, storage.StoredEntry>();
  for (const movement of movements) {
    const known = last.get(movement.number);
    if (known === undefined || laterMovement(movement, known)) {
      last.set(movement.number, movement);
    }
  }
  let inside = 0;
  for (const movement of last.values()) {
    if (movement.exit !== true && dayOfMovement(movement, days) === today) {
      inside += 1;
    }
  }
  return inside;
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
  /** One core per book (ADR 0091): "" is the whole event's, `d2` the second day's. */
  #cores = new Map<string, DoorCore>();
  #verifier: DoorVerifierDto | null = null;
  #verifierJson = "";
  #voids: DoorVoidDto[] = [];
  /** Every known movement of this phone's books (entries, returns, exits or uses). */
  #movements: storage.StoredEntry[] = [];
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
  /** The ticket on a screen with a button (wrong door or day, no right, a check), and what it does. */
  #pending: PendingAction | null = null;
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
      const [arrivals, admitted, entries, rehearsalPending, exitMode, checkMode] = await Promise.all([
        storage.allArrivals(),
        storage.ownAdmittedNumbers(),
        storage.allEntries(),
        storage.readFlag("rehearsalPending"),
        storage.readFlag("exitMode"),
        storage.readFlag("checkMode"),
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
        checkMode,
        ...this.#arrivalState(arrivals),
      });
      this.#set(this.#counts());
      this.#countBoxOffice();
      this.#loop(generation);
    } catch {
      this.#set({ phase: "failed" });
    }
  }

  stop(): void {
    this.#generation += 1;
    clearTimeout(this.#timer);
    this.#freeCores();
  }

  #freeCores(): void {
    for (const core of this.#cores.values()) {
      core.free();
    }
    this.#cores = new Map();
  }

  /** The whole event's core: it reads every QR the same way the others do (same keys and voids). */
  get #base(): DoorCore | null {
    return this.#cores.get("") ?? null;
  }

  /** Trades an access token for this phone's credentials and downloads the event. */
  async register(accessToken: string, deviceName: string): Promise<void> {
    const registration = await registerDevice(accessToken, deviceName);
    const device: storage.StoredDevice = {
      deviceId: registration.deviceId,
      deviceName: registration.deviceName,
      secret: registration.deviceSecret,
      event: registration.event,
      // Servers before ADR 0092 send none: the entrance.
      checkpoint: (registration.checkpoint as DoorCheckpointDto | null | undefined) ?? null,
    };
    await storage.saveNewDevice(device);
    this.#freeCores();
    this.#verifier = null;
    this.#verifierJson = "";
    this.#movements = [];
    this.#last = null;
    this.#pending = null;
    this.#entered = new Set();
    this.#admittedHere = new Set();
    this.#set({ ...INITIAL, phase: "ready", device });
    clearTimeout(this.#timer);
    this.#loop(this.#generation);
  }

  async forget(): Promise<void> {
    clearTimeout(this.#timer);
    await storage.forgetEverything();
    this.#freeCores();
    this.#verifier = null;
    this.#verifierJson = "";
    this.#movements = [];
    this.#set({ ...INITIAL, phase: "unregistered" });
  }

  // --- Scanning ------------------------------------------------------------------------

  /** Whether the door can decide (it has the event's keys). */
  get canScan(): boolean {
    return this.#base !== null && this.#state.phase === "ready";
  }

  /** The checkpoint this phone reads (ADR 0092); `null`: the entrance. */
  get checkpoint(): DoorCheckpointDto | null {
    const stored = this.#state.manifest?.checkpoint;
    return stored === undefined ? (this.#state.device?.checkpoint ?? null) : stored;
  }

  /** Whether this phone may only check (ADR 0090): not for consumption tokens. */
  get canCheck(): boolean {
    return (this.#state.manifest?.event.kind ?? this.#state.device?.event.kind) !== "tokens";
  }

  /** Whether reads go to the exit now: the phone is set to it and the event allows re-entry. */
  get readingExits(): boolean {
    return this.#state.exitMode && !this.checking && this.#reentry();
  }

  /** Whether reads only check now (ADR 0090). */
  get checking(): boolean {
    return this.#state.checkMode && this.canCheck;
  }

  /** What a read does now. */
  get mode(): DoorMode {
    return this.checking ? "check" : this.readingExits ? "exit" : "entrance";
  }

  /** Sets what this phone reads (ADRs 0083, 0090); kept across reloads. */
  async setMode(mode: DoorMode): Promise<void> {
    const exit = mode === "exit";
    const check = mode === "check";
    if (exit === this.#state.exitMode && check === this.#state.checkMode) {
      return;
    }
    this.#last = null;
    this.#pending = null;
    this.#set({ exitMode: exit, checkMode: check, result: null });
    try {
      await Promise.all([storage.writeFlag("exitMode", exit), storage.writeFlag("checkMode", check)]);
    } catch {
      // Kept for this session at least.
    }
  }

  /** The event lets a ticket that went out come back, at the entrance (never at a checkpoint). */
  #reentry(): boolean {
    return reentryOf(this.#state.manifest) && this.checkpoint === null;
  }

  /** The core of a book, made when first needed from the movements of that book. */
  #coreFor(book: number | null): DoorCore | null {
    const key = bookKey(book);
    const known = this.#cores.get(key);
    if (known !== undefined || this.#verifier === null) {
      return known ?? null;
    }
    const core = new DoorCore(this.#verifier);
    core.replaceVoids(this.#voids);
    core.setReentry(this.#reentry());
    recordMovements(
      core,
      this.#movements.filter((movement) => bookKeyOf(movement) === key),
    );
    this.#cores.set(key, core);
    return core;
  }

  /**
   * Handles the texts of one camera frame. Ignored while a scan is being processed or a result
   * is on screen, except a green one seen for a moment, which a different ticket replaces (a busy
   * door does not wait). Among several codes, the first that is one of our tickets wins.
   */
  async scan(texts: readonly string[]): Promise<void> {
    const base = this.#base;
    const device = this.#state.device;
    if (base === null || device === null || texts.length === 0 || this.#scanning) {
      return;
    }
    const mode = this.mode;
    const exit = mode === "exit";
    const text = texts.find((candidate) => (exit ? base.evaluateExit(candidate) : base.evaluate(candidate)).kind !== "invalid") ?? texts[0];
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
      const context = this.#context();
      // The book the ticket is checked in now (ADR 0091): the number tells its category.
      const number = numberOf(base.evaluate(text));
      const book = number === null ? null : bookOf(context, number);
      const core = this.#coreFor(book) ?? base;
      if (this.#state.rehearsing) {
        // Rehearsal: what would happen, never recorded nor sent (ADR 0067).
        const view = rehearsalView(text, exit ? core.evaluateExit(text) : core.evaluate(text), context);
        this.#last = { text, seenAt: Date.now(), view };
        this.#set({ result: view, testScanDone: true, rehearsalRead: true });
        return;
      }
      if (mode === "check") {
        // Check (ADR 0090): only looks, never recorded nor sent.
        const view = this.#check(core, text, number, context);
        this.#remember(text, view);
        this.#set({ result: view, testScanDone: true });
        return;
      }
      // DoorCore takes integer milliseconds.
      const at = Math.round(now + (this.#state.manifest?.offsetMs ?? 0));
      const view = exit
        ? await this.#checkOut(core, text, book, at, device.deviceName, context)
        : await this.#enter(core, text, number, book, at, device.deviceName, context);
      this.#remember(text, view);
      this.#set({ result: view, checking: false, testScanDone: true, ...this.#counts() });
    } catch {
      // A bug, never a decision: say so instead of showing nothing.
      this.#set({ result: errorView(), checking: false });
    } finally {
      this.#scanning = false;
    }
  }

  /** The last result, for the same code still in view: shown again without its button. */
  #remember(text: string, view: ResultView): void {
    this.#last = { text, seenAt: Date.now(), view: view.action === undefined || view.action === null ? view : { ...view, action: null } };
  }

  /**
   * An entry, or a use at a checkpoint. Before letting in, the door looks (ADRs 0068, 0091,
   * 0092): a valid ticket of a day its category is not valid on, of a category this door does
   * not take, or without the right to the checkpoint is turned away without an entry; the refusal
   * is logged like any scan, and the screen may let it in anyway.
   */
  async #enter(
    core: DoorCore,
    text: string,
    number: number | null,
    book: number | null,
    at: number,
    deviceName: string,
    context: DoorContext,
  ): Promise<ResultView> {
    const preview = number === null ? null : core.evaluate(text);
    if (preview !== null && isEntry(preview)) {
      const refusal = this.#refusal(preview.number, context);
      if (refusal !== null) {
        await this.#persist(
          {
            id: crypto.randomUUID(),
            number: preview.number,
            outcome: refusal.outcome,
            scannedAtMs: at,
            synced: 0,
            ...this.#dayFields(book, context),
          },
          null,
        );
        this.#pending = { text, kind: refusal.kind };
        return refusal.view;
      }
    }
    return this.#checkIn(core, text, book, at, deviceName, null, context);
  }

  /** Why a valid ticket is turned away here, the first reason first; `null`: it may go in. */
  #refusal(
    number: number,
    context: DoorContext,
  ): { kind: ExceptionKind; outcome: "rejected_wrong_day" | "rejected_wrong_door" | "rejected_not_entitled"; view: ResultView } | null {
    const valid = wrongDay(context, number);
    if (valid !== null) {
      return { kind: "wrong_day", outcome: "rejected_wrong_day", view: wrongDayView(number, valid, context, true) };
    }
    if (context.checkpoint !== undefined && context.checkpoint !== null) {
      const missing = notEntitled(context, number);
      return missing === null
        ? null
        : { kind: "not_entitled", outcome: "rejected_not_entitled", view: notEntitledView(number, missing.category, context, true) };
    }
    const wrong = wrongDoor(context, number);
    return wrong === null ? null : { kind: "wrong_door", outcome: "rejected_wrong_door", view: wrongDoorView(number, wrong, context) };
  }

  /** A check (ADR 0090): the screen of the book the ticket would be checked in, nothing recorded. */
  #check(core: DoorCore, text: string, number: number | null, context: DoorContext): ResultView {
    const decision = core.evaluate(text);
    if (number !== null && isEntry(decision)) {
      const valid = wrongDay(context, number);
      if (valid !== null) {
        return { ...wrongDayView(number, valid, context, false), check: true };
      }
      const missing = notEntitled(context, number);
      if (missing !== null) {
        return { ...notEntitledView(number, missing.category, context, false), check: true };
      }
    }
    const view = checkView(decision, context, staleNote(this.#state.lastSyncOkAt ?? this.#state.manifest?.syncedAt ?? null, Date.now()));
    if (view.action !== undefined && view.action !== null) {
      this.#pending = { text, kind: "register" };
    }
    return view;
  }

  /**
   * The button of the screen: "let in anyway" (wrong door or day, no right: a normal check-in,
   * marked as an exception of that kind), or "record it now" after a check (the whole entrance,
   * with its own refusals and instruction).
   */
  async act(): Promise<void> {
    const base = this.#base;
    const device = this.#state.device;
    const pending = this.#pending;
    if (base === null || device === null || pending === null || this.#scanning) {
      return;
    }
    this.#pending = null;
    this.#scanning = true;
    this.#set({ result: null });
    try {
      const context = this.#context();
      const at = Math.round(Date.now() + (this.#state.manifest?.offsetMs ?? 0));
      const number = numberOf(base.evaluate(pending.text));
      const book = number === null ? null : bookOf(context, number);
      const core = this.#coreFor(book) ?? base;
      const view =
        pending.kind === "register"
          ? await this.#enter(core, pending.text, number, book, at, device.deviceName, context)
          : await this.#checkIn(core, pending.text, book, at, device.deviceName, pending.kind, context);
      this.#remember(pending.text, view);
      this.#set({ result: view, checking: false, ...this.#counts() });
    } catch {
      this.#set({ result: errorView(), checking: false });
    } finally {
      this.#scanning = false;
    }
  }

  /** The day fields of a scan (ADR 0091): the day the door is on and the book, if any. */
  #dayFields(book: number | null, context: DoorContext): Pick<storage.StoredScan, "day" | "ledgerDay"> {
    const day = context.today ?? null;
    if (day === null) {
      return {};
    }
    return book === null ? { day } : { day, ledgerDay: book };
  }

  /** Decides, persists (invariant 6) and, with a fresh sync, confirms online. */
  async #checkIn(
    core: DoorCore,
    text: string,
    book: number | null,
    at: number,
    deviceName: string,
    exception: ExceptionKind | null,
    context: DoorContext,
  ): Promise<ResultView> {
    const decision = core.checkIn(text, at, deviceName);
    const number = numberOf(decision);
    const checkpoint = context.checkpoint !== undefined && context.checkpoint !== null;
    const id = crypto.randomUUID();
    const movement = isEntry(decision)
      ? { scanId: id, number: decision.number, atUnixMs: at, deviceName, day: context.today ?? null, ledgerDay: book }
      : null;
    if (movement !== null) {
      this.#movements.push(movement);
    }
    const scan = await this.#persist(
      {
        id,
        number,
        outcome: outcomeOf(decision, checkpoint),
        scannedAtMs: at,
        synced: 0,
        ...(number === null ? {} : this.#dayFields(book, context)),
        ...(exception !== null && isEntry(decision) ? { exception: true, exceptionKind: exception } : {}),
        // For this phone's history only (never uploaded).
        ...(decision.kind === "voided" || decision.kind === "invalid" ? { reason: decision.reason } : {}),
        ...(decision.kind === "other_event" ? { eventTag: decision.eventTag } : {}),
      },
      movement,
    );
    let view = viewOf(decision, context);
    if (decision.kind === "admit" && !checkpoint) {
      this.#entered.add(decision.number);
      this.#admittedHere.add(decision.number);
      this.#countBoxOffice();
    }
    // A return is confirmed like a first entry: a copy may have come back first elsewhere.
    if (isEntry(decision) && scan !== null && this.#gate.canConfirm(Date.now(), this.#state.lastSyncOkAt)) {
      this.#set({ checking: true, testScanDone: true });
      view = (await this.#confirm(scan, decision.number, core, book)) ?? view;
    }
    return view;
  }

  /**
   * The exit (ADR 0083): decided and persisted like an entry (invariant 6), never confirmed
   * online (an exit can only make the door more permissive later, and the server keeps it).
   */
  async #checkOut(core: DoorCore, text: string, book: number | null, at: number, deviceName: string, context: DoorContext): Promise<ResultView> {
    const decision = core.checkOut(text, at, deviceName);
    const id = crypto.randomUUID();
    const number = numberOf(decision);
    const movement =
      decision.kind === "exit"
        ? { scanId: id, number: decision.number, atUnixMs: at, deviceName, exit: true as const, day: context.today ?? null, ledgerDay: book }
        : null;
    if (movement !== null) {
      this.#movements.push(movement);
    }
    await this.#persist(
      {
        id,
        number,
        outcome: outcomeOf(decision),
        scannedAtMs: at,
        synced: 0,
        ...(number === null ? {} : this.#dayFields(book, context)),
        ...(decision.kind === "voided" || decision.kind === "invalid" ? { reason: decision.reason } : {}),
        ...(decision.kind === "other_event" ? { eventTag: decision.eventTag } : {}),
      },
      movement,
    );
    return viewOf(decision, this.#context());
  }

  /**
   * The counters: tickets that entered (or uses of the checkpoint), today's in an event of
   * several days, and who is inside now with re-entry.
   */
  #counts(): Pick<DoorState, "entryCount" | "todayCount" | "insideCount"> {
    const context = this.#context();
    const days = context.days ?? [];
    const today = context.today ?? null;
    const ins = this.#movements.filter((movement) => movement.exit !== true);
    const todays = today === null ? null : ins.filter((movement) => dayOfMovement(movement, days) === today);
    if (context.checkpoint !== undefined && context.checkpoint !== null) {
      // A use counts once per ticket and book.
      const uses = (items: readonly storage.StoredEntry[]) => new Set(items.map((item) => `${bookKeyOf(item)}:${String(item.number)}`)).size;
      return { entryCount: uses(ins), todayCount: todays === null ? null : uses(todays), insideCount: 0 };
    }
    const numbers = (items: readonly storage.StoredEntry[]) => new Set(items.map((item) => item.number)).size;
    let insideCount = 0;
    if (context.reentry === true) {
      insideCount =
        today === null
          ? (this.#base?.insideCount ?? 0)
          : (this.#coreFor(today)?.insideCount ?? 0) +
            insideToday(
              this.#movements.filter((movement) => bookKeyOf(movement) === ""),
              days,
              today,
            );
    }
    return { entryCount: numbers(ins), todayCount: todays === null ? null : numbers(todays), insideCount };
  }

  /**
   * Takes the result off the screen. `byUser`: tapped away, so the same code still in front of
   * the camera does not bring it back; a green screen that left by itself may come back silently.
   */
  dismissResult(byUser = true): void {
    this.#pending = null;
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

  /** This phone's totals for the "Fim do evento" sheet (ADR 0101), from the local database. */
  async endSummary(): Promise<EndSummary> {
    return endSummary(await storage.allScans());
  }

  // --- Rehearsal (ADR 0067) ------------------------------------------------------------

  startRehearsal(): void {
    this.#last = null;
    this.#pending = null;
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
    // A checkpoint sells nothing (ADR 0092).
    if (this.checkpoint !== null || !context.sellers.some((seller) => seller.boxOffice === true)) {
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
    const days = daysOf(manifest?.event ?? this.#state.device?.event);
    const checkpoint = this.checkpoint;
    return {
      digits: manifest?.event.numberDigits ?? this.#state.device?.event.numberDigits ?? 4,
      sellers: manifest?.sellers ?? [],
      categories: manifest?.categories ?? [],
      seats: manifest?.seats ?? [],
      allowedCategoryIds: manifest?.allowedCategoryIds ?? [],
      doors: manifest?.doors ?? [],
      priceCents: manifest?.event.ticketPriceCents ?? null,
      sessions: manifest?.sessions ?? [],
      reentry: reentryOf(manifest) && checkpoint === null,
      kind: manifest?.event.kind ?? this.#state.device?.event.kind ?? "tickets",
      days,
      // The day by the server's clock (ADR 0091): it works offline too.
      today: todayOf(days, Date.now() + (manifest?.offsetMs ?? 0)),
      checkpoint,
    };
  }

  /** Persists a scan, and its movement when there is one, before any result shows (invariant 6). */
  async #persist(scan: storage.StoredScan, movement: storage.StoredEntry | null): Promise<storage.StoredScan | null> {
    try {
      await storage.recordScan(scan, movement);
      this.#set({ pending: this.#state.pending + 1, storageFailed: false });
      return scan;
    } catch {
      this.#set({ storageFailed: true });
      return null;
    }
  }

  /** Online confirmation within the budget; returns a stricter result, if any. */
  async #confirm(scan: storage.StoredScan, number: number, core: DoorCore, book: number | null): Promise<ResultView | null> {
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
      // The copy entered elsewhere first (in the same book): remember that entry so later scans
      // agree. The manifest brings it for good on the next sync.
      core.recordEntries([{ number, ...result.firstEntry }]);
      this.#movements.push({ scanId: `confirmed:${scan.id}`, number, ...result.firstEntry, day: null, ledgerDay: book });
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
      // Servers before ADR 0092 send none: the entrance.
      checkpoint: (manifest.checkpoint as DoorCheckpointDto | null | undefined) ?? null,
      // The list comes only when it changed (ADR 0070).
      guests: manifest.guests ?? previous?.guests ?? [],
      guestsVersion: manifest.guests === null ? (previous?.guestsVersion ?? "") : manifest.guestsVersion,
    };
    if (await storage.mergeArrivals(manifest.guestArrivals)) {
      this.#set(this.#arrivalState(await storage.allArrivals()));
    }
    // Each movement says its day and book (ADR 0091); servers before it send neither.
    const added = await storage.addEntries([
      ...manifest.entries.map((entry) => ({
        scanId: entry.scanId,
        number: entry.number,
        atUnixMs: entry.atUnixMs,
        deviceName: entry.deviceName,
        day: entry.day,
        ledgerDay: entry.ledgerDay,
      })),
      // Exits of re-entry (ADR 0083); servers before it send none.
      ...((manifest.exits as DoorManifest["exits"] | undefined) ?? []).map((exit) => ({
        scanId: exit.scanId,
        number: exit.number,
        atUnixMs: exit.atUnixMs,
        deviceName: exit.deviceName,
        exit: true as const,
        day: exit.day,
        ledgerDay: exit.ledgerDay,
      })),
    ]);
    if (this.#base === null || JSON.stringify(manifest.verifier) !== this.#verifierJson) {
      this.#state = { ...this.#state, manifest: stored };
      await this.#rebuildCore(manifest.verifier, stored);
    } else {
      this.#voids = manifest.voids;
      this.#movements.push(...added);
      const reentry = reentryOf(stored) && (stored.checkpoint ?? null) === null;
      for (const [key, core] of this.#cores) {
        core.replaceVoids(manifest.voids);
        core.setReentry(reentry);
        recordMovements(
          core,
          added.filter((movement) => bookKeyOf(movement) === key),
        );
      }
    }
    await storage.saveManifest(stored);
    for (const entry of added) {
      if (entry.exit !== true) {
        this.#entered.add(entry.number);
      }
    }
    this.#set({ manifest: stored });
    this.#set(this.#counts());
    this.#countBoxOffice();
    // Re-entry turned off while this phone read the exit: it would let the people leaving "in".
    if (this.#state.exitMode && !reentryOf(stored)) {
      await this.setMode(this.#state.checkMode ? "check" : "entrance");
      this.#set({ exitEnded: true });
    }
  }

  /** The doorkeeper saw that this phone reads entries again. */
  dismissExitEnded(): void {
    this.#set({ exitEnded: false });
  }

  /**
   * Fresh cores for new keys: verifier, voids, re-entry and every known movement. The whole
   * event's core is made now; each day's when first needed.
   */
  async #rebuildCore(verifier: DoorVerifierDto, manifest: storage.StoredManifest): Promise<void> {
    const movements = await storage.allEntries();
    this.#freeCores();
    this.#verifier = verifier;
    this.#verifierJson = JSON.stringify(verifier);
    this.#voids = manifest.voids;
    this.#movements = movements;
    this.#coreFor(null);
    this.#set(this.#counts());
  }
}
