/**
 * The seller's page without internet (ADR 0074). The page keeps on the phone the last view the
 * server sent and a queue of the changes made since (each with an id created here). What the
 * seller sees is the last view with the queue applied on top; when the connection comes back the
 * queue goes to `POST /api/seller/sync`, which does each change once, however many times it is
 * sent, and answers what it could not do. Those answers are explained here in plain words.
 *
 * Nothing here stores the link's token: the storage key is a hash of it, and the token itself
 * stays in the address's fragment.
 */
import type {
  ReservationDto,
  SellerOp,
  SellerOpItem,
  SellerOpProblemDto,
  SellerOpResultDto,
  SellerSaleDto,
  SellerViewDto,
} from "@ingressoimpresso/api-types";

import { countNumbers, formatRanges, mergeRanges, subtract, type NumberRange } from "@/lib/number-list";
import { isActive } from "@/lib/reservations";
import { countCells } from "@/lib/seller-page";
import { texts } from "@/texts/pt-BR";

/** A change waiting to be sent, with when it was made on the phone. */
export type QueuedOp = SellerOpItem & { createdAt: string };

/** Most changes per request (the server's `MAX_OPS`). */
export const SYNC_BATCH = 50;

/** A new id, created on the phone. */
export function newId(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Older browsers on plain http (never in production): RFC 4122 v4 from random bytes.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function queueOp(op: SellerOp, now = new Date(), id = newId()): QueuedOp {
  return { id, op, createdAt: now.toISOString() };
}

// What the seller sees -------------------------------------------------------------------------

function numbersOf(ranges: readonly NumberRange[]): number[] {
  return ranges.flatMap((range) => Array.from({ length: range.last - range.first + 1 }, (_, index) => range.first + index));
}

function within(ranges: readonly NumberRange[], number: number): boolean {
  return ranges.some((range) => number >= range.first && number <= range.last);
}

/** Takes `numbers` out of every reservation (but `except`), dropping the ones left empty. */
function release(reservations: readonly ReservationDto[], numbers: readonly number[], except: string | null): ReservationDto[] {
  const removed = mergeRanges(numbers.map((number) => ({ first: number, last: number })));
  return reservations
    .map((reservation) => (reservation.id === except ? reservation : { ...reservation, numbers: subtract(reservation.numbers, removed) }))
    .filter((reservation) => reservation.numbers.length > 0);
}

/** One change on the view, with the server's rules (what it would leave out is left out here). */
function applyOne(view: SellerViewDto, item: QueuedOp, now: Date): SellerViewDto {
  const usable = (number: number) => within(view.ranges, number) && !within(view.voids, number);
  const saleOf = (number: number) => view.sales.find((sale) => sale.number === number);
  const reservationOf = (number: number) =>
    view.reservations.find((reservation) => isActive(reservation, now) && within(reservation.numbers, number));
  const op = item.op;
  switch (op.kind) {
    case "mark": {
      const sell = numbersOf(op.ranges).filter((number) => {
        const sale = saleOf(number);
        const reservation = reservationOf(number);
        return usable(number) && (sale === undefined ? reservation === undefined || reservation.id === op.reservationId : op.edit);
      });
      if (sell.length === 0) {
        return view;
      }
      const sales = new Map<number, SellerSaleDto>(view.sales.map((sale) => [sale.number, sale]));
      for (const number of sell) {
        sales.set(number, {
          number,
          buyerName: op.buyerName,
          buyerPhone: op.buyerPhone,
          soldAt: sales.get(number)?.soldAt ?? item.createdAt,
          ticketUrl: sales.get(number)?.ticketUrl ?? null,
        });
      }
      return {
        ...view,
        sales: [...sales.values()].sort((a, b) => a.number - b.number),
        reservations: release(view.reservations, sell, null),
      };
    }
    case "unmark":
      return { ...view, sales: view.sales.filter((sale) => sale.number !== op.number) };
    case "reserve": {
      const keep = numbersOf(op.ranges).filter((number) => {
        const reservation = reservationOf(number);
        return usable(number) && saleOf(number) === undefined && (reservation === undefined || reservation.id === op.reservationId);
      });
      if (keep.length === 0 || new Date(op.expiresAt).getTime() <= now.getTime()) {
        return view;
      }
      const others = release(view.reservations, keep, op.reservationId);
      const existing = others.find((reservation) => reservation.id === op.reservationId);
      const numbers = mergeRanges([...(existing?.numbers ?? []), ...keep.map((number) => ({ first: number, last: number }))]);
      const updated: ReservationDto = {
        id: op.reservationId,
        sellerId: existing?.sellerId ?? "",
        numbers,
        holderName: op.holderName,
        holderPhone: op.holderPhone,
        expiresAt: op.expiresAt,
        createdAt: existing?.createdAt ?? item.createdAt,
        active: true,
        byOrganizer: existing?.byOrganizer ?? false,
      };
      return {
        ...view,
        reservations: [...others.filter((reservation) => reservation.id !== op.reservationId), updated].sort(
          (a, b) => Number(isActive(b, now)) - Number(isActive(a, now)) || a.expiresAt.localeCompare(b.expiresAt),
        ),
      };
    }
    case "cancel_reservation":
      return { ...view, reservations: view.reservations.filter((reservation) => reservation.id !== op.reservationId) };
  }
}

/** The view the seller sees: the server's last one with the queued changes on top. */
export function applyOps(view: SellerViewDto, ops: readonly QueuedOp[], now = new Date()): SellerViewDto {
  if (ops.length === 0) {
    return view;
  }
  const next = ops.reduce((current, item) => applyOne(current, item, now), view);
  return { ...next, summary: { ...next.summary, ...countCells(next, now) } };
}

/** Numbers touched by changes still waiting to be sent (marked on the tiles). */
export function pendingNumbers(ops: readonly QueuedOp[], view: Pick<SellerViewDto, "reservations">): Set<number> {
  const pending = new Set<number>();
  for (const { op } of ops) {
    if (op.kind === "unmark") {
      pending.add(op.number);
    } else if (op.kind === "cancel_reservation") {
      const reservation = view.reservations.find((item) => item.id === op.reservationId);
      for (const number of numbersOf(reservation?.numbers ?? [])) {
        pending.add(number);
      }
    } else {
      for (const number of numbersOf(op.ranges)) {
        pending.add(number);
      }
    }
  }
  return pending;
}

// What became of the changes -------------------------------------------------------------------

/** A change that was not done (or only partly), explained. */
export type SyncNotice = { id: string; title: string; lines: string[] };

/** "o 0042" or "os números 0042, 0045–0047". */
function numbersPhrase(ranges: readonly NumberRange[], digits: number): string {
  const c = texts.sellerPage.conflicts;
  return countNumbers(ranges) === 1 ? c.one(formatRanges(ranges, digits)) : c.many(formatRanges(ranges, digits));
}

/** What a change was, in a few words ("Venda do 0042 para Ana"). */
export function opLabel(op: SellerOp, digits: number, reservations: readonly ReservationDto[] = []): string {
  const c = texts.sellerPage.conflicts.ops;
  switch (op.kind) {
    case "mark":
      return op.edit ? c.edit(formatRanges(op.ranges, digits)) : c.mark(formatRanges(op.ranges, digits), op.buyerName);
    case "unmark":
      return c.unmark(formatRanges([{ first: op.number, last: op.number }], digits));
    case "reserve":
      return c.reserve(formatRanges(op.ranges, digits), op.holderName);
    case "cancel_reservation":
      return c.cancel(reservations.find((item) => item.id === op.reservationId)?.holderName ?? null);
  }
}

/** One problem in plain words: what happened and what stayed. */
export function problemText(problem: SellerOpProblemDto, op: SellerOp, digits: number): string {
  const c = texts.sellerPage.conflicts;
  const numbers = numbersPhrase(problem.numbers, digits);
  const plural = countNumbers(problem.numbers) > 1;
  const reserving = op.kind === "reserve";
  switch (problem.reason) {
    case "already_sold":
      return reserving ? c.soldNoReserve(numbers, plural, problem.holder) : c.alreadySold(numbers, plural, problem.holder);
    case "not_held":
      return c.notHeld(numbers, plural);
    case "voided":
      return c.voided(numbers, plural);
    case "reserved":
      return reserving ? c.reservedOther(numbers, plural, problem.holder) : c.reservedNoSale(numbers, plural, problem.holder);
    case "expired":
      return c.expired(op.kind === "reserve" ? op.holderName : null);
    case "event_canceled":
      return c.eventCanceled;
    case "box_office":
      return c.boxOffice;
    case "invalid":
      return c.invalid;
  }
}

/** The changes the server did not (fully) do, explained; empty when everything went through. */
export function syncNotices(
  results: readonly SellerOpResultDto[],
  sent: readonly QueuedOp[],
  digits: number,
  reservations: readonly ReservationDto[] = [],
): SyncNotice[] {
  const byId = new Map(sent.map((item) => [item.id, item]));
  return results.flatMap((result) => {
    const item = byId.get(result.id);
    if (item === undefined || result.outcome === "applied" || result.problems.length === 0) {
      return [];
    }
    return [{ id: result.id, title: opLabel(item.op, digits, reservations), lines: result.problems.map((problem) => problemText(problem, item.op, digits)) }];
  });
}

// On the phone ---------------------------------------------------------------------------------

const PREFIX = "ingressoimpresso.seller.";
/** Links whose last view is kept (a seller of several events); the oldest go first. */
const MAX_LINKS = 5;

/** The storage key of a link: a hash of its token, never the token. */
export async function storageKey(token: string): Promise<string> {
  try {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    return Array.from(new Uint8Array(digest).slice(0, 16), (byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    // No SubtleCrypto (plain http outside localhost): FNV-1a, still not the token.
    let hash = 0x811c9dc5;
    for (const char of token) {
      hash = Math.imul(hash ^ (char.codePointAt(0) ?? 0), 0x01000193) >>> 0;
    }
    return `fnv${hash.toString(16)}`;
  }
}

type Saved = { view: SellerViewDto; savedAt: string };

function read<T>(name: string): T | null {
  try {
    const raw = window.localStorage.getItem(PREFIX + name);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

function write(name: string, value: unknown): void {
  try {
    if (value === null) {
      window.localStorage.removeItem(PREFIX + name);
    } else {
      window.localStorage.setItem(PREFIX + name, JSON.stringify(value));
    }
  } catch {
    // Storage full or blocked: the page still works online, it just will not open offline.
  }
}

/** The last view of a link saved on this phone, if any. */
export function readSaved(key: string): Saved | null {
  const saved = read<Saved>(`view.${key}`);
  return saved !== null && typeof saved.savedAt === "string" && Array.isArray(saved.view.ranges) ? saved : null;
}

/** Keeps the latest view of a link (and forgets the oldest links beyond the limit). */
export function writeSaved(key: string, view: SellerViewDto, savedAt = new Date()): void {
  write(`view.${key}`, { view, savedAt: savedAt.toISOString() });
  const index = (read<Record<string, string>>("index") ?? {}) as Record<string, string>;
  index[key] = savedAt.toISOString();
  const keys = Object.entries(index).sort(([, a], [, b]) => b.localeCompare(a));
  for (const [old] of keys.slice(MAX_LINKS)) {
    // A link with changes still to send keeps its copy.
    if (readQueue(old).length === 0) {
      write(`view.${old}`, null);
      delete index[old];
    }
  }
  write("index", index);
}

export function readQueue(key: string): QueuedOp[] {
  const queue = read<QueuedOp[]>(`queue.${key}`);
  return Array.isArray(queue) ? queue : [];
}

export function writeQueue(key: string, queue: readonly QueuedOp[]): void {
  write(`queue.${key}`, queue.length === 0 ? null : queue);
}

/** Explanations the seller has not dismissed yet (they survive closing the page). */
export function readNotices(key: string): SyncNotice[] {
  const notices = read<SyncNotice[]>(`notices.${key}`);
  return Array.isArray(notices) ? notices : [];
}

export function writeNotices(key: string, notices: readonly SyncNotice[]): void {
  write(`notices.${key}`, notices.length === 0 ? null : notices);
}
