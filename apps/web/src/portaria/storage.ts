/**
 * The door's local database (IndexedDB): this phone's credentials, the last manifest, the scan
 * log and every known entry. Everything the door needs to decide offline survives a reload.
 */
import type {
  DoorCategoryRangeDto,
  DoorCheckpointDto,
  DoorCredentialDto,
  DoorGuestArrivalDto,
  DoorGuestDto,
  DoorGuestUpload,
  DoorRouteDto,
  DoorSeatDto,
  DoorSessionDto,
  DoorEventInfo,
  DoorScanUpload,
  DoorSellerRangeDto,
  DoorVerifierDto,
  DoorVoidDto,
  ExceptionKind,
  ScanOutcome,
  VoidReason,
} from "@ingressoimpresso/api-types";
import type { InvalidReasonDto } from "@ingressoimpresso/ticket-core-wasm";
import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import type { GuestArrival } from "./logic";

/** This phone, as registered. */
export interface StoredDevice {
  deviceId: string;
  deviceName: string;
  secret: string;
  event: DoorEventInfo;
  /** The checkpoint its link reads (ADR 0092); missing or `null`: the entrance. */
  checkpoint?: DoorCheckpointDto | null;
}

/** The last manifest, minus its entries (kept in their own store). */
export interface StoredManifest {
  event: DoorEventInfo;
  verifier: DoorVerifierDto;
  voids: DoorVoidDto[];
  sellers: DoorSellerRangeDto[];
  /** Missing in manifests stored before categories and tables (ADR 0056, 0057). */
  categories?: DoorCategoryRangeDto[];
  seats?: DoorSeatDto[];
  /** Missing in manifests stored before the door features (ADRs 0068, 0070). */
  allowedCategoryIds?: string[];
  doors?: DoorRouteDto[];
  guests?: DoorGuestDto[];
  guestsVersion?: string;
  /** Missing in manifests stored before an event could have several dates (ADR 0077). */
  sessions?: DoorSessionDto[];
  /** The checkpoint this phone reads (ADR 0092); missing in manifests stored before it. */
  checkpoint?: DoorCheckpointDto | null;
  /** The event's credentials (ADR 0111) and their version; missing in manifests stored before. */
  credentials?: DoorCredentialDto[];
  credentialsVersion?: string;
  cursor: string;
  /** Local time of the last successful sync. */
  syncedAt: number;
  /** Server clock minus phone clock. */
  offsetMs: number;
}

/** One scan of this phone. `synced` is 0/1 because booleans cannot be indexed. */
export interface StoredScan {
  id: string;
  number: number | null;
  outcome: ScanOutcome;
  scannedAtMs: number;
  synced: 0 | 1;
  /** Let in at a door that does not take its category (ADR 0068), or anyway (ADRs 0091, 0092). */
  exception?: boolean;
  /** Why it was let in anyway; missing on scans stored before ADR 0091 (the wrong door). */
  exceptionKind?: ExceptionKind;
  /** The event day the phone was on (ADR 0091); missing in an event of one day. */
  day?: number;
  /** The day of the book it was decided in; missing: the whole event. */
  ledgerDay?: number;
  /** The item of a combo at a checkpoint (ADR 0112); missing: the first. */
  slot?: number;
  /**
   * Why it was refused, for this phone's history only (never uploaded): the void or invalid
   * reason. Missing on scans stored by older apps.
   */
  reason?: VoidReason | InvalidReasonDto;
  /** The QR's event tag of a ticket of another event or date (history only). */
  eventTag?: number;
  /** A stricter answer of the online confirmation (history only): the screen said this. */
  verdict?: ScanVerdict;
}

/** What the online confirmation said about a scan admitted on this phone. */
export type ScanVerdict =
  | { kind: "already_entered"; atUnixMs: number; deviceName: string }
  | { kind: "voided"; reason: VoidReason };

/**
 * A guest arrival of any phone (ADR 0070). `own` arrivals were recorded here; `synced` is 0 while
 * an own arrival (or its undo) has not reached the server.
 */
export interface StoredArrival extends GuestArrival {
  own: 0 | 1;
  synced: 0 | 1;
}

/**
 * A movement of any phone: an admitted scan (first entry or return), or an exit of re-entry
 * (ADR 0083), what `DoorCore.recordEntries`/`recordExits` need plus its scan id. Exits share the
 * store, so no new database version is needed; entries stored by older apps have no `exit`, nor
 * a day (ADR 0091): they count in the whole event's book, as on the server.
 */
export interface StoredEntry {
  scanId: string;
  number: number;
  atUnixMs: number;
  deviceName: string;
  exit?: true;
  /** The event day it was read on. */
  day?: number | null;
  /** The day of its book; missing or `null`: the whole event. */
  ledgerDay?: number | null;
  /** The item of a combo at a checkpoint (ADR 0112); missing or `null`: the first. */
  slot?: number | null;
}

interface DoorDb extends DBSchema {
  device: { key: "self"; value: StoredDevice };
  manifest: { key: "self"; value: StoredManifest };
  scans: { key: string; value: StoredScan; indexes: { synced: number } };
  entries: { key: string; value: StoredEntry };
  arrivals: { key: string; value: StoredArrival; indexes: { synced: number } };
  /** Small flags, e.g. a finished rehearsal not yet told to the server. */
  meta: { key: string; value: boolean };
}

const DB_NAME = "ingressoimpresso-portaria";

let opening: Promise<IDBPDatabase<DoorDb>> | undefined;

function db(): Promise<IDBPDatabase<DoorDb>> {
  opening ??= openDB<DoorDb>(DB_NAME, 2, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1) {
        database.createObjectStore("device");
        database.createObjectStore("manifest");
        database.createObjectStore("scans", { keyPath: "id" }).createIndex("synced", "synced");
        database.createObjectStore("entries", { keyPath: "scanId" });
      }
      // Version 2 (ADRs 0067, 0070): guest arrivals and flags; scans and entries stay.
      if (oldVersion < 2) {
        database.createObjectStore("arrivals", { keyPath: "id" }).createIndex("synced", "synced");
        database.createObjectStore("meta");
      }
    },
  });
  return opening;
}

export async function loadDevice(): Promise<StoredDevice | undefined> {
  return (await db()).get("device", "self");
}

/** Saves a new registration, dropping every trace of a previous one. */
export async function saveNewDevice(device: StoredDevice): Promise<void> {
  const tx = (await db()).transaction(["device", "manifest", "scans", "entries", "arrivals", "meta"], "readwrite");
  await Promise.all([
    tx.objectStore("manifest").clear(),
    tx.objectStore("scans").clear(),
    tx.objectStore("entries").clear(),
    tx.objectStore("arrivals").clear(),
    tx.objectStore("meta").clear(),
    tx.objectStore("device").put(device, "self"),
    tx.done,
  ]);
}

export async function forgetEverything(): Promise<void> {
  const tx = (await db()).transaction(["device", "manifest", "scans", "entries", "arrivals", "meta"], "readwrite");
  await Promise.all([
    tx.objectStore("device").clear(),
    tx.objectStore("manifest").clear(),
    tx.objectStore("scans").clear(),
    tx.objectStore("entries").clear(),
    tx.objectStore("arrivals").clear(),
    tx.objectStore("meta").clear(),
    tx.done,
  ]);
}

export async function loadManifest(): Promise<StoredManifest | undefined> {
  return (await db()).get("manifest", "self");
}

export async function saveManifest(manifest: StoredManifest): Promise<void> {
  await (await db()).put("manifest", manifest, "self");
}

/** Persists a scan, and its entry when admitted, in one transaction (before any result shows). */
export async function recordScan(scan: StoredScan, entry: StoredEntry | null): Promise<void> {
  const tx = (await db()).transaction(["scans", "entries"], "readwrite");
  const writes: Promise<unknown>[] = [tx.objectStore("scans").put(scan)];
  if (entry !== null) {
    writes.push(tx.objectStore("entries").put(entry));
  }
  await Promise.all([...writes, tx.done]);
}

/** Scans not yet uploaded, in the order they were read (the server classifies each one against the ones before it). */
export async function pendingScans(limit: number): Promise<StoredScan[]> {
  const scans = await (await db()).getAllFromIndex("scans", "synced", 0, limit);
  return scans.sort((a, b) => a.scannedAtMs - b.scannedAtMs);
}

export async function pendingCount(): Promise<number> {
  return (await db()).countFromIndex("scans", "synced", 0);
}

/** Marks uploaded scans as synced (only those still pending). One round trip per batch, not per row. */
export async function markSynced(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  const tx = (await db()).transaction("scans", "readwrite");
  const store = tx.objectStore("scans");
  const scans = await Promise.all(ids.map((id) => store.get(id)));
  const writes: Promise<unknown>[] = [];
  for (const scan of scans) {
    if (scan !== undefined && scan.synced === 0) {
      writes.push(store.put({ ...scan, synced: 1 }));
    }
  }
  await Promise.all([...writes, tx.done]);
}

/** Every scan of this phone (its history); the caller sorts and trims. */
export async function allScans(): Promise<StoredScan[]> {
  return (await db()).getAll("scans");
}

/** Keeps what the online confirmation said with the scan, for this phone's history. */
export async function saveVerdict(id: string, verdict: ScanVerdict): Promise<void> {
  const tx = (await db()).transaction("scans", "readwrite");
  const scan = await tx.store.get(id);
  if (scan !== undefined) {
    await tx.store.put({ ...scan, verdict });
  }
  await tx.done;
}

/** Numbers this phone let in for the first time (box office counter, ADR 0069). */
export async function ownAdmittedNumbers(): Promise<number[]> {
  const scans = await (await db()).getAll("scans");
  return scans.flatMap((scan) => (scan.outcome === "admitted" && scan.number !== null ? [scan.number] : []));
}

export async function allEntries(): Promise<StoredEntry[]> {
  return (await db()).getAll("entries");
}

/** Stores entries received from the server; returns those not known before. */
export async function addEntries(entries: readonly StoredEntry[]): Promise<StoredEntry[]> {
  if (entries.length === 0) {
    return [];
  }
  const tx = (await db()).transaction("entries", "readwrite");
  const store = tx.objectStore("entries");
  // The keys once, then every write at once: a first manifest brings thousands of entries.
  const known = new Set<string>(await store.getAllKeys());
  const added: StoredEntry[] = [];
  const writes: Promise<unknown>[] = [];
  for (const entry of entries) {
    if (!known.has(entry.scanId)) {
      known.add(entry.scanId);
      writes.push(store.put(entry));
      added.push(entry);
    }
  }
  await Promise.all([...writes, tx.done]);
  return added;
}

/** The upload form of a stored scan. */
export function toUpload(scan: StoredScan): DoorScanUpload {
  return {
    id: scan.id,
    number: scan.number,
    keyId: null,
    outcome: scan.outcome,
    scannedAtMs: scan.scannedAtMs,
    ...(scan.exception === true ? { exception: true } : {}),
    ...(scan.exception === true && scan.exceptionKind !== undefined ? { exceptionKind: scan.exceptionKind } : {}),
    ...(scan.day === undefined ? {} : { day: scan.day }),
    ...(scan.ledgerDay === undefined ? {} : { ledgerDay: scan.ledgerDay }),
    ...(scan.slot === undefined ? {} : { slot: scan.slot }),
  };
}

// --- Guest arrivals (ADR 0070) ----------------------------------------------------------

export async function allArrivals(): Promise<StoredArrival[]> {
  return (await db()).getAll("arrivals");
}

/** Persists an arrival recorded here (before the screen confirms it). */
export async function recordArrival(arrival: GuestArrival): Promise<void> {
  await (await db()).put("arrivals", { ...arrival, own: 1, synced: 0 });
}

/** Marks an own arrival as undone; returns it, or `undefined` if it is not ours. */
export async function undoArrival(id: string, at: number): Promise<StoredArrival | undefined> {
  const tx = (await db()).transaction("arrivals", "readwrite");
  const arrival = await tx.store.get(id);
  if (arrival?.own !== 1 || arrival.undoneAtMs !== null) {
    await tx.done;
    return undefined;
  }
  const undone: StoredArrival = { ...arrival, undoneAtMs: at, synced: 0 };
  await tx.store.put(undone);
  await tx.done;
  return undone;
}

export async function pendingArrivals(limit: number): Promise<StoredArrival[]> {
  return (await db()).getAllFromIndex("arrivals", "synced", 0, limit);
}

export async function pendingArrivalCount(): Promise<number> {
  return (await db()).countFromIndex("arrivals", "synced", 0);
}

/** Marks uploaded arrivals as synced, unless they were undone while the upload was on its way. */
export async function markArrivalsSynced(sent: readonly DoorGuestUpload[]): Promise<void> {
  if (sent.length === 0) {
    return;
  }
  const tx = (await db()).transaction("arrivals", "readwrite");
  const arrivals = await Promise.all(sent.map((upload) => tx.store.get(upload.id)));
  const writes: Promise<unknown>[] = [];
  sent.forEach((upload, index) => {
    const arrival = arrivals[index];
    if (arrival !== undefined && arrival.synced === 0 && arrival.undoneAtMs === upload.undoneAtMs) {
      writes.push(tx.store.put({ ...arrival, synced: 1 }));
    }
  });
  await Promise.all([...writes, tx.done]);
}

/** Stores arrivals heard from the server: new ones, and undos of known ones. */
export async function mergeArrivals(arrivals: readonly DoorGuestArrivalDto[]): Promise<boolean> {
  if (arrivals.length === 0) {
    return false;
  }
  const tx = (await db()).transaction("arrivals", "readwrite");
  // Everything known once (the list is the size of the guest list), then every write at once.
  const known = new Map((await tx.store.getAll()).map((item) => [item.id, item]));
  const writes: Promise<unknown>[] = [];
  for (const arrival of arrivals) {
    const stored = known.get(arrival.id);
    let next: StoredArrival | undefined;
    if (stored === undefined) {
      next = {
        id: arrival.id,
        guestId: arrival.guestId,
        people: arrival.people,
        atUnixMs: arrival.atUnixMs,
        deviceName: arrival.deviceName,
        // The server does not say when: any time marks it as undone.
        undoneAtMs: arrival.undone ? arrival.atUnixMs : null,
        own: 0,
        synced: 1,
      };
    } else if (arrival.undone && stored.undoneAtMs === null) {
      next = { ...stored, undoneAtMs: arrival.atUnixMs };
    }
    if (next !== undefined) {
      known.set(next.id, next);
      writes.push(tx.store.put(next));
    }
  }
  await Promise.all([...writes, tx.done]);
  return writes.length > 0;
}

/** The upload form of an arrival. */
export function toArrivalUpload(arrival: StoredArrival): DoorGuestUpload {
  return {
    id: arrival.id,
    guestId: arrival.guestId,
    people: arrival.people,
    arrivedAtMs: arrival.atUnixMs,
    undoneAtMs: arrival.undoneAtMs,
  };
}

// --- Flags -------------------------------------------------------------------------------

/**
 * `rehearsalPending`: a finished rehearsal not yet told; `exitMode`: this phone reads exits;
 * `checkMode`: this phone only checks (ADR 0090).
 */
export type Flag = "rehearsalPending" | "exitMode" | "checkMode";

export async function readFlag(key: Flag): Promise<boolean> {
  return (await (await db()).get("meta", key)) ?? false;
}

export async function writeFlag(key: Flag, value: boolean): Promise<void> {
  await (await db()).put("meta", value, key);
}
