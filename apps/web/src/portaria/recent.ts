/**
 * This phone's recent scans, as the door shows them (the entries counter opens them). Pure: the
 * engine reads the scans and entries from IndexedDB and hands them here, so it works offline.
 */
import type { DoorVoidDto } from "@ingressoimpresso/api-types";

import type { StoredEntry, StoredScan } from "./storage";
import { categoryOf, clockTime, otherSession, padNumber, sellerOf, seatOf, type DoorContext, type Tone } from "./logic";
import { portaria as portariaTexts } from "@/texts/pt-BR/portaria";

const t = portariaTexts.history;
const r = portariaTexts.result;

/** How many scans the history shows. */
export const RECENT_LIMIT = 50;

/** One scan of this phone, ready to show. */
export interface RecentScan {
  id: string;
  /** Corrected clock, Unix milliseconds. */
  atMs: number;
  tone: Tone;
  /** "Entrou", "Já tinha entrado"… */
  label: string;
  /** "Nº 0042", or `null` when the QR was not one of ours. */
  number: string | null;
  /** The why: first entry, void or invalid reason, the other date, the copy found later. */
  detail: string | null;
  category: { name: string; color: string } | null;
  seat: string | null;
  seller: string | null;
  /** Received by the server. */
  synced: boolean;
}

/** What this phone did: who it let in, who went out (ADR 0083) and who it turned away. */
export interface RecentSummary {
  admitted: number;
  exits: number;
  refused: number;
  pending: number;
}

/** The first entry of `number` other than `scanId`'s own, if it came before `at` (exits aside). */
function earlierEntry(entries: readonly StoredEntry[], number: number, scanId: string, at: number): StoredEntry | null {
  let first: StoredEntry | null = null;
  for (const entry of entries) {
    if (entry.exit === true || entry.number !== number || entry.scanId === scanId || entry.atUnixMs > at) {
      continue;
    }
    if (first === null || entry.atUnixMs < first.atUnixMs) {
      first = entry;
    }
  }
  return first;
}

/** The latest exit of `number` before `at` (ADR 0083): where a return came from. */
function exitBefore(entries: readonly StoredEntry[], number: number, at: number): StoredEntry | null {
  let latest: StoredEntry | null = null;
  for (const entry of entries) {
    if (entry.exit !== true || entry.number !== number || entry.atUnixMs > at) {
      continue;
    }
    if (latest === null || entry.atUnixMs > latest.atUnixMs) {
      latest = entry;
    }
  }
  return latest;
}

function voidReasonOf(scan: StoredScan, voids: readonly DoorVoidDto[]): string | null {
  const reasons: Readonly<Record<string, string>> = r.voidReasons;
  const stored = scan.reason === undefined ? undefined : reasons[scan.reason];
  if (stored !== undefined) {
    return stored;
  }
  const number = scan.number;
  const range = number === null ? undefined : voids.find((item) => item.first <= number && number <= item.last);
  return range === undefined ? null : r.voidReasons[range.reason];
}

/** How one stored scan reads in the history. */
export function recentScanOf(
  scan: StoredScan,
  entries: readonly StoredEntry[],
  context: DoorContext,
  voids: readonly DoorVoidDto[] = [],
): RecentScan {
  const number = scan.number;
  const base = {
    id: scan.id,
    atMs: scan.scannedAtMs,
    number: number === null ? null : r.number(padNumber(number, context.digits)),
    category: number === null ? null : categoryOf(context.categories, number),
    seat: number === null ? null : seatOf(context.seats, number),
    seller: number === null ? null : sellerOf(context.sellers, number),
    synced: scan.synced === 1,
  };
  const first = (entry: { atUnixMs: number; deviceName: string } | null) =>
    entry === null ? null : t.firstEntry(clockTime(entry.atUnixMs), entry.deviceName);

  // The online confirmation was stricter than the local decision: the screen said this.
  if (scan.verdict?.kind === "already_entered") {
    return { ...base, tone: "bad", label: t.outcomes.rejected_used, detail: first(scan.verdict) };
  }
  if (scan.verdict?.kind === "voided") {
    return { ...base, tone: "bad", label: t.outcomes.rejected_void, detail: r.voidReasons[scan.verdict.reason] };
  }

  switch (scan.outcome) {
    case "admitted": {
      // Another phone let the same number in earlier, offline: a copy found after the fact.
      const earlier = number === null ? null : earlierEntry(entries, number, scan.id, scan.scannedAtMs);
      return {
        ...base,
        tone: "ok",
        label: scan.exception === true ? t.outcomes.exception : t.outcomes.admitted,
        detail: earlier === null ? null : t.copyOf(clockTime(earlier.atUnixMs), earlier.deviceName),
      };
    }
    case "readmitted": {
      const exited = number === null ? null : exitBefore(entries, number, scan.scannedAtMs);
      return {
        ...base,
        tone: "ok",
        label: scan.exception === true ? t.outcomes.exception : t.outcomes.readmitted,
        detail: exited === null ? null : t.exitedAt(clockTime(exited.atUnixMs), exited.deviceName),
      };
    }
    case "exited":
      return { ...base, tone: "exit", label: t.outcomes.exited, detail: null };
    case "rejected_already_out":
      return { ...base, tone: "warn", label: t.outcomes.rejected_already_out, detail: null };
    case "rejected_used":
      return {
        ...base,
        tone: "bad",
        label: t.outcomes.rejected_used,
        detail: first(number === null ? null : earlierEntry(entries, number, scan.id, scan.scannedAtMs)),
      };
    case "rejected_void":
      return { ...base, tone: "bad", label: t.outcomes.rejected_void, detail: voidReasonOf(scan, voids) };
    case "rejected_wrong_door":
      return { ...base, tone: "warn", label: t.outcomes.rejected_wrong_door, detail: null };
    case "rejected_other_event": {
      const session = scan.eventTag === undefined ? null : otherSession(context, scan.eventTag);
      return session === null
        ? { ...base, tone: "warn", label: t.outcomes.rejected_other_event, detail: null }
        : { ...base, tone: "warn", label: t.outcomes.otherSession, detail: session };
    }
    case "rejected_invalid": {
      const reasons: Readonly<Record<string, string>> = r.invalidReasons;
      return { ...base, tone: "bad", label: t.outcomes.rejected_invalid, detail: scan.reason === undefined ? null : (reasons[scan.reason] ?? null) };
    }
  }
}

/** The latest `limit` scans of this phone, newest first. */
export function recentScans(
  scans: readonly StoredScan[],
  entries: readonly StoredEntry[],
  context: DoorContext,
  voids: readonly DoorVoidDto[] = [],
  limit = RECENT_LIMIT,
): RecentScan[] {
  return [...scans]
    .sort((a, b) => b.scannedAtMs - a.scannedAtMs || b.id.localeCompare(a.id))
    .slice(0, limit)
    .map((scan) => recentScanOf(scan, entries, context, voids));
}

/** Counts over every scan of this phone (not only the ones shown). */
export function recentSummary(scans: readonly StoredScan[]): RecentSummary {
  const summary = { admitted: 0, exits: 0, refused: 0, pending: 0 };
  for (const scan of scans) {
    if ((scan.outcome === "admitted" || scan.outcome === "readmitted") && scan.verdict === undefined) {
      summary.admitted += 1;
    } else if (scan.outcome === "exited") {
      summary.exits += 1;
    } else {
      summary.refused += 1;
    }
    if (scan.synced === 0) {
      summary.pending += 1;
    }
  }
  return summary;
}

/** Date and time with seconds, for the details of one scan. */
export function scanTime(unixMs: number): string {
  return new Date(unixMs).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
