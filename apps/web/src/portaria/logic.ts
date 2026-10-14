/**
 * Pure rules of the door app: what a decision means, what the screen shows and when an online
 * confirmation is worth waiting for (ADR 0006). No browser APIs here, so it is unit tested.
 */
import type {
  DoorCategoryRangeDto,
  DoorGuestArrivalDto,
  DoorGuestDto,
  DoorRouteDto,
  DoorSeatDto,
  DoorSellerRangeDto,
  DoorSessionDto,
  ScanOutcome,
  VoidReason,
} from "@ingressoimpresso/api-types";
import type { DecisionDto } from "@ingressoimpresso/ticket-core-wasm";

import { money } from "@/lib/format";
import { sessionLabel } from "@/lib/series";
import { errors as errorsTexts } from "@/texts/pt-BR/errors";
import { portaria as portariaTexts } from "@/texts/pt-BR/portaria";

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
/** A guest arrival can be undone on the phone that recorded it for this long (ADR 0070). */
export const GUEST_UNDO_MS = 120_000;

/**
 * The QR text of every sample ticket (previews, rehearsal sheet): `ticket_render::sample_qr_text`,
 * a payload whose version byte is 0, so it is never a valid ticket (ADR 0067). The Rust test
 * `sample_qr_text_is_the_door_constant` checks both sides agree.
 */
export const SAMPLE_QR_TEXT = `U50${"FGW".repeat(36)}`;

/** Whether a QR text is the sample printed on previews and on the rehearsal sheet. */
export function isSampleQr(text: string): boolean {
  return text.trim() === SAMPLE_QR_TEXT;
}

const t = portariaTexts.result;

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
  /** Category (ADR 0056), shown in its colour. */
  category: { name: string; color: string } | null;
  /** Table and seat (ADR 0057), to point the guest to their table. */
  seat: string | null;
  /** Box office (ADR 0069): what to charge before handing the ticket over. */
  charge?: string | null;
  /** Wrong door (ADR 0068): the doorkeeper may let the guest in anyway. */
  override?: boolean;
  /** Rehearsal (ADR 0067): what would happen; nothing was recorded. */
  rehearsal?: boolean;
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
export function sellerOf(sellers: readonly DoorSeller[], number: number): string | null {
  return sellers.find((range) => range.first <= number && number <= range.last)?.seller ?? null;
}

/** A seller's range as stored: manifests saved by older apps lack `boxOffice`. */
export type DoorSeller = Omit<DoorSellerRangeDto, "boxOffice"> & { boxOffice?: boolean };
/** A category's range as stored: manifests saved by older apps lack `id` and `priceCents`. */
export type DoorCategory = Omit<DoorCategoryRangeDto, "id" | "priceCents"> & { id?: string; priceCents?: number | null };

/** What the door knows about the numbers besides the QR (sent whole by the manifest). */
export interface DoorContext {
  digits: number;
  sellers: readonly DoorSeller[];
  categories: readonly DoorCategory[];
  seats: readonly DoorSeatDto[];
  /** Categories this door admits (ADR 0068); empty: every ticket. */
  allowedCategoryIds?: readonly string[];
  /** The event's other open doors. */
  doors?: readonly DoorRouteDto[];
  /** The event's ticket price, for the box office (ADR 0069). */
  priceCents?: number | null;
  /** The other dates of the event's series (ADR 0077): their tickets are told apart. */
  sessions?: readonly DoorSessionDto[];
}

/** The session of another date of the series a QR tag belongs to, if any (ADR 0077). */
export function otherSession(context: DoorContext, eventTag: number): string | null {
  const session = (context.sessions ?? []).find((item) => item.eventTag === eventTag);
  return session === undefined ? null : sessionLabel(session.startsAt);
}

/** Category range that holds `number`. */
function categoryRangeOf(categories: readonly DoorCategory[], number: number): DoorCategory | null {
  return categories.find((item) => item.first <= number && number <= item.last) ?? null;
}

/** Category whose range holds `number`. */
export function categoryOf(categories: readonly DoorCategory[], number: number): { name: string; color: string } | null {
  const range = categoryRangeOf(categories, number);
  return range === null ? null : { name: range.name, color: range.color };
}

/**
 * Whether this door turns `number` away (ADR 0068): it admits only some categories and the
 * number is in another one. A number without a category is never turned away. Returns the
 * category and the doors that take it (those that list it, else those that take everything).
 */
export function wrongDoor(context: DoorContext, number: number): { category: string; doors: string[] } | null {
  const allowed = context.allowedCategoryIds ?? [];
  const range = categoryRangeOf(context.categories, number);
  if (allowed.length === 0 || range?.id === undefined || allowed.includes(range.id)) {
    return null;
  }
  const id = range.id;
  const doors = context.doors ?? [];
  const listing = doors.filter((door) => door.categoryIds.includes(id));
  const open = doors.filter((door) => door.categoryIds.length === 0);
  return { category: range.name, doors: (listing.length > 0 ? listing : open).map((door) => door.label) };
}

/**
 * The price of a box office number (ADR 0069): `undefined` when the number is not the box
 * office's, `null` when there is no price, 0 for a courtesy.
 */
export function boxOfficePrice(context: DoorContext, number: number): number | null | undefined {
  const seller = context.sellers.find((range) => range.first <= number && number <= range.last);
  if (seller?.boxOffice !== true) {
    return undefined;
  }
  const category = categoryRangeOf(context.categories, number);
  return category?.priceCents ?? context.priceCents ?? null;
}

/** What the result screen says the box office charges. */
export function chargeLine(price: number | null): string {
  if (price === null) {
    return t.boxOfficeNoPrice;
  }
  return price === 0 ? t.boxOfficeCourtesy : t.boxOfficeCharge(money(price));
}

/** Box office sales among entered `numbers` (distinct): how many and how much. */
export function boxOfficeTotals(
  context: DoorContext,
  numbers: Iterable<number>,
): { count: number; cents: number; unpriced: number } {
  const totals = { count: 0, cents: 0, unpriced: 0 };
  for (const number of new Set(numbers)) {
    const price = boxOfficePrice(context, number);
    if (price === undefined) {
      continue;
    }
    totals.count += 1;
    if (price === null) {
      totals.unpriced += 1;
    } else {
      totals.cents += price;
    }
  }
  return totals;
}

/** Table and seat of `number`. */
export function seatOf(seats: readonly DoorSeatDto[], number: number): string | null {
  return seats.find((item) => item.number === number)?.label ?? null;
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
  context: DoorContext,
): ResultView {
  const number = numberOf(decision);
  const label = number === null ? null : t.number(padNumber(number, context.digits));
  const seller = number === null ? null : sellerOf(context.sellers, number);
  const sellerLine = seller === null ? null : t.seller(seller);
  const tags = {
    category: number === null ? null : categoryOf(context.categories, number),
    seat: number === null ? null : seatOf(context.seats, number),
  };
  const none = { category: null, seat: null };
  switch (decision.kind) {
    case "admit": {
      const price = boxOfficePrice(context, decision.number);
      return {
        tone: "ok",
        title: t.admit,
        number: label,
        detail: null,
        seller: sellerLine,
        ...tags,
        ...(price === undefined ? {} : { charge: chargeLine(price) }),
      };
    }
    case "already_entered":
      return {
        tone: "bad",
        title: t.alreadyEntered,
        number: label,
        detail: t.alreadyEnteredAt(clockTime(decision.firstEntry.atUnixMs), decision.firstEntry.deviceName),
        seller: sellerLine,
        ...tags,
      };
    case "voided":
      return { tone: "bad", title: t.voided, number: label, detail: t.voidReasons[decision.reason], seller: sellerLine, ...tags };
    case "other_event": {
      // A ticket of another date of the same event never enters here, but the door says which.
      const session = otherSession(context, decision.eventTag);
      return session === null
        ? { tone: "warn", title: t.otherEvent, number: null, detail: null, seller: null, ...none }
        : { tone: "warn", title: t.otherSession, number: null, detail: t.otherSessionDetail(session), seller: null, ...none };
    }
    case "invalid":
      return { tone: "bad", title: t.invalid, number: null, detail: t.invalidReasons[decision.reason], seller: null, ...none };
  }
}

/** Yellow screen of a valid ticket of a category this door does not take (ADR 0068). */
export function wrongDoorView(number: number, wrong: { category: string; doors: string[] }, context: DoorContext): ResultView {
  return {
    tone: "warn",
    title: t.wrongDoor,
    number: t.number(padNumber(number, context.digits)),
    detail: wrong.doors.length === 0 ? t.wrongDoorNone(wrong.category) : t.wrongDoorGo(wrong.category, wrong.doors),
    seller: null,
    category: categoryOf(context.categories, number),
    seat: seatOf(context.seats, number),
    override: true,
  };
}

/**
 * What a read shows in rehearsal (ADR 0067): the sample of the previews says the camera works;
 * a ticket of this event shows what would happen at the door (nothing is recorded); any other
 * code is explained.
 */
export function rehearsalView(text: string, decision: DecisionDto, context: DoorContext): ResultView {
  const r = portariaTexts.rehearsal;
  const base = { seller: null, category: null, seat: null, number: null, rehearsal: true } as const;
  if (isSampleQr(text)) {
    return { ...base, tone: "ok", title: r.sampleTitle, detail: r.sampleDetail };
  }
  if (decision.kind === "invalid" && decision.reason === "malformed") {
    return { ...base, tone: "warn", title: r.otherQrTitle, detail: r.otherQrDetail };
  }
  if (decision.kind === "admit") {
    const wrong = wrongDoor(context, decision.number);
    if (wrong !== null) {
      return { ...wrongDoorView(decision.number, wrong, context), override: false, rehearsal: true };
    }
    // Never the green "PODE ENTRAR" of real work: a volunteer who forgot the rehearsal on could
    // let people in without an entry.
    return { ...viewOf(decision, context), tone: "warn", title: r.wouldAdmit, rehearsal: true };
  }
  return { ...viewOf(decision, context), rehearsal: true };
}

/**
 * Whether the ⋮ menu offers a rehearsal (ADR 0067): only before the first ticket entered, on any
 * phone. Once the work begins, the door shows nothing but the work.
 */
export function canRehearse(entryCount: number, rehearsing: boolean): boolean {
  return rehearsing || entryCount === 0;
}

// --- Result screen timing ---------------------------------------------------------------

/** A green "enter" goes back to the camera by itself after this long (unless held). */
export const RESULT_AUTO_MS = 2_000;
/** The green rehearsal sample stays a little longer: there is no queue yet. */
export const REHEARSAL_AUTO_MS = 3_000;
/** A press this long on the result screen keeps it until the next tap. */
export const HOLD_MS = 450;
/** A green screen stays at least this long before another ticket may replace it. */
export const MIN_RESULT_MS = 900;

/** How a result leaves the screen: by itself after `ms`, or only when tapped. */
export type DismissPolicy = { auto: true; ms: number } | { auto: false };

/**
 * Only a plain "enter" leaves by itself, so the queue keeps moving. Anything to read or act on
 * (a refusal, a warning, a box office charge, a wrong door) stays until the doorkeeper taps.
 */
export function dismissPolicy(view: ResultView): DismissPolicy {
  if (view.tone !== "ok" || view.override === true || (view.charge !== undefined && view.charge !== null)) {
    return { auto: false };
  }
  return { auto: true, ms: view.rehearsal === true ? REHEARSAL_AUTO_MS : RESULT_AUTO_MS };
}

/**
 * Whether a newly read, different ticket may replace the result on screen: only a green screen
 * that leaves by itself, and only after it was seen for a moment (a busy door does not wait).
 */
export function canReplaceResult(view: ResultView, shownForMs: number): boolean {
  return dismissPolicy(view).auto && shownForMs >= MIN_RESULT_MS;
}

/** Screen after the server found a copy (the first entry was on another phone). */
export function alreadyEnteredView(
  number: number,
  firstEntry: { atUnixMs: number; deviceName: string },
  context: DoorContext,
): ResultView {
  return viewOf({ kind: "already_entered", number, firstEntry }, context);
}

/** Screen after the server found the ticket voided. */
export function voidedView(
  number: number,
  reason: VoidReason,
  context: DoorContext,
): ResultView {
  return viewOf({ kind: "voided", number, reason }, context);
}

/** Screen for an unexpected failure while handling a scan. */
export function errorView(): ResultView {
  return { tone: "bad", title: t.error, number: null, detail: errorsTexts.generic, seller: null, category: null, seat: null };
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

// --- Guest list (ADR 0070) ------------------------------------------------------------------

/** A name as searched: no accents, lower case, single spaces. */
export function normalizeName(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Guests matching `query`: every word of the query starts a word of the name (or of the note),
 * accents and case ignored. Names that start with the query come first, then by name.
 */
export function searchGuests<T extends Pick<DoorGuestDto, "name" | "note">>(guests: readonly T[], query: string): T[] {
  const words = normalizeName(query).split(" ").filter((word) => word !== "");
  const indexed = guests.map((guest) => ({ guest, name: normalizeName(guest.name), note: normalizeName(guest.note ?? "") }));
  const matches = indexed.filter(({ name, note }) => {
    const parts = `${name} ${note}`.split(" ");
    return words.every((word) => parts.some((part) => part.startsWith(word)));
  });
  const head = words.join(" ");
  return matches
    .sort((a, b) => {
      const aStarts = head !== "" && a.name.startsWith(head) ? 0 : 1;
      const bStarts = head !== "" && b.name.startsWith(head) ? 0 : 1;
      return aStarts - bStarts || a.name.localeCompare(b.name, "pt-BR");
    })
    .map(({ guest }) => guest);
}

/** An arrival as the phone keeps it: from any phone, with its undo. */
export type GuestArrival = Pick<DoorGuestArrivalDto, "id" | "guestId" | "people" | "atUnixMs" | "deviceName"> & {
  undoneAtMs: number | null;
};

/** Where a guest stands: who came in, when the first did, how many may still come. */
export interface GuestState {
  /** People in (at most the party: the guest and companions). */
  people: number;
  /** Size of the party. */
  party: number;
  /** The first arrival that was not undone. */
  first: GuestArrival | null;
  /** The arrivals that count, oldest first. */
  arrivals: GuestArrival[];
}

/**
 * A guest's state from every known arrival. Every phone computes the same from the same set
 * (G-Set): the first arrival is the earliest by the corrected clock (ties by id), undone ones
 * do not count, and the people add up to the size of the party.
 */
export function guestState(guest: Pick<DoorGuestDto, "id" | "companions">, arrivals: readonly GuestArrival[]): GuestState {
  const party = guest.companions + 1;
  const counted = arrivals
    .filter((arrival) => arrival.guestId === guest.id && arrival.undoneAtMs === null)
    .sort((a, b) => a.atUnixMs - b.atUnixMs || a.id.localeCompare(b.id));
  const people = Math.min(
    party,
    counted.reduce((sum, arrival) => sum + arrival.people, 0),
  );
  return { people, party, first: counted[0] ?? null, arrivals: counted };
}

/** Whether this phone may still undo its own arrival. */
export function canUndoArrival(arrival: GuestArrival, ownIds: ReadonlySet<string>, now: number): boolean {
  return arrival.undoneAtMs === null && ownIds.has(arrival.id) && now - arrival.atUnixMs < GUEST_UNDO_MS;
}
