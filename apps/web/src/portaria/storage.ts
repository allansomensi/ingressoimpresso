/**
 * The door's local database (IndexedDB): this phone's credentials, the last manifest, the scan
 * log and every known entry. Everything the door needs to decide offline survives a reload.
 */
import type {
  DoorEventInfo,
  DoorScanUpload,
  DoorSellerRangeDto,
  DoorVerifierDto,
  DoorVoidDto,
  ScanOutcome,
} from "@ingressoimpresso/api-types";
import { openDB, type DBSchema, type IDBPDatabase } from "idb";

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
}

const DB_NAME = "ingressoimpresso-portaria";

let opening: Promise<IDBPDatabase<DoorDb>> | undefined;

function db(): Promise<IDBPDatabase<DoorDb>> {
  opening ??= openDB<DoorDb>(DB_NAME, 1, {
    upgrade(database) {
      database.createObjectStore("device");
      database.createObjectStore("manifest");
      database.createObjectStore("scans", { keyPath: "id" }).createIndex("synced", "synced");
      database.createObjectStore("entries", { keyPath: "scanId" });
    },
  });
  return opening;
}

export async function loadDevice(): Promise<StoredDevice | undefined> {
  return (await db()).get("device", "self");
}

/** Saves a new registration, dropping every trace of a previous one. */
export async function saveNewDevice(device: StoredDevice): Promise<void> {
  const tx = (await db()).transaction(["device", "manifest", "scans", "entries"], "readwrite");
  await Promise.all([
    tx.objectStore("manifest").clear(),
    tx.objectStore("scans").clear(),
    tx.objectStore("entries").clear(),
    tx.objectStore("device").put(device, "self"),
    tx.done,
  ]);
}

export async function forgetEverything(): Promise<void> {
  const tx = (await db()).transaction(["device", "manifest", "scans", "entries"], "readwrite");
  await Promise.all([
    tx.objectStore("device").clear(),
    tx.objectStore("manifest").clear(),
    tx.objectStore("scans").clear(),
    tx.objectStore("entries").clear(),
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
  return { id: scan.id, number: scan.number, keyId: null, outcome: scan.outcome, scannedAtMs: scan.scannedAtMs };
}
