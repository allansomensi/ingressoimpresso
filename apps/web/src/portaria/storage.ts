/**
 * The door's local database (IndexedDB): this phone's credentials, the last manifest, the scan
 * log and every known entry. Everything the door needs to decide offline survives a reload.
 */
import type {
  DoorCategoryRangeDto,
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
  /** Let in at a door that does not take its category (ADR 0068). */
  exception?: boolean;
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

/** An admitted scan of any phone: what `DoorCore.recordEntries` needs, plus its scan id. */
export interface StoredEntry {
  scanId: string;
  number: number;
  atUnixMs: number;
  deviceName: string;
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

export async function pendingScans(limit: number): Promise<StoredScan[]> {
  return (await db()).getAllFromIndex("scans", "synced", 0, limit);
}

export async function pendingCount(): Promise<number> {
  return (await db()).countFromIndex("scans", "synced", 0);
}

export async function markSynced(ids: readonly string[]): Promise<void> {
  const tx = (await db()).transaction("scans", "readwrite");
  const store = tx.objectStore("scans");
  for (const id of ids) {
    const scan = await store.get(id);
    if (scan !== undefined && scan.synced === 0) {
      await store.put({ ...scan, synced: 1 });
    }
  }
  await tx.done;
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

/** Numbers this phone let in (box office counter, ADR 0069). */
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
  const added: StoredEntry[] = [];
  for (const entry of entries) {
    if ((await store.getKey(entry.scanId)) === undefined) {
      await store.put(entry);
      added.push(entry);
    }
  }
  await tx.done;
  return added;
}

/** The upload form of a stored scan. */
export function toUpload(scan: StoredScan): DoorScanUpload {
  const upload: DoorScanUpload = { id: scan.id, number: scan.number, keyId: null, outcome: scan.outcome, scannedAtMs: scan.scannedAtMs };
  return scan.exception === true ? { ...upload, exception: true } : upload;
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
  const tx = (await db()).transaction("arrivals", "readwrite");
  for (const upload of sent) {
    const arrival = await tx.store.get(upload.id);
    if (arrival !== undefined && arrival.synced === 0 && arrival.undoneAtMs === upload.undoneAtMs) {
      await tx.store.put({ ...arrival, synced: 1 });
    }
  }
  await tx.done;
}

/** Stores arrivals heard from the server: new ones, and undos of known ones. */
export async function mergeArrivals(arrivals: readonly DoorGuestArrivalDto[]): Promise<boolean> {
  if (arrivals.length === 0) {
    return false;
  }
  const tx = (await db()).transaction("arrivals", "readwrite");
  let changed = false;
  for (const arrival of arrivals) {
    const known = await tx.store.get(arrival.id);
    if (known === undefined) {
      await tx.store.put({
        id: arrival.id,
        guestId: arrival.guestId,
        people: arrival.people,
        atUnixMs: arrival.atUnixMs,
        deviceName: arrival.deviceName,
        // The server does not say when: any time marks it as undone.
        undoneAtMs: arrival.undone ? arrival.atUnixMs : null,
        own: 0,
        synced: 1,
      });
      changed = true;
    } else if (arrival.undone && known.undoneAtMs === null) {
      await tx.store.put({ ...known, undoneAtMs: arrival.atUnixMs });
      changed = true;
    }
  }
  await tx.done;
  return changed;
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

export async function readFlag(key: "rehearsalPending"): Promise<boolean> {
  return (await (await db()).get("meta", key)) ?? false;
}

export async function writeFlag(key: "rehearsalPending", value: boolean): Promise<void> {
  await (await db()).put("meta", value, key);
}
