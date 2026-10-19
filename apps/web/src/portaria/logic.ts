/**
 * Pure rules of the door app: what a decision means, what the screen shows and when an online
 * confirmation is worth waiting for (ADR 0006). No browser APIs here, so it is unit tested.
 */
import type {
  DayRule,
  EventKind,
  DoorCategoryRangeDto,
  DoorCheckpointDto,
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

import { currentDay, daysOf, ledgerDay, onDayLabel, validOn, type EventDay } from "@/lib/event-days";
import { forKind } from "@/lib/event-kind";
import { money } from "@/lib/format";
import { sessionLabel } from "@/lib/series";
import { errors as errorsTexts } from "@/texts/pt-BR/errors";
import { eventDays as dayTexts } from "@/texts/pt-BR/event-days";
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

/** The door's words of an event: a ficha at a stall for consumption tokens (ADRs 0084, 0086). */
export function doorWords(kind: EventKind | undefined): typeof portariaTexts {
  return forKind(portariaTexts, portariaTexts.tokens, kind);
}

/** The result words of an event. */
export function resultWords(kind: EventKind | undefined): typeof portariaTexts.result {
  return doorWords(kind).result;
}

/** Green, red, yellow, and blue for a ticket going out (re-entry, ADR 0083). */
export type Tone = "ok" | "bad" | "warn" | "exit";

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
  /** The category asks for a document (ADR 0082): which one, before letting in. */
  document?: DocumentCheck | null;
  /**
   * What the organizer asks the door to do (ADR 0089), or the checkpoint to hand over (ADR 0092);
   * in a check (ADR 0090), what to look at. The screen waits for a tap.
   */
  instruction?: { label: string; text: string } | null;
  /** The checkpoint this phone reads (ADR 0092), above the title. */
  place?: string | null;
  /**
   * The button of the screen: let in anyway at the wrong door or day (ADRs 0068, 0091), hand
   * over anyway without the right (ADR 0092), or record what a check found missing (ADR 0090).
   */
  action?: { label: string; hint: string } | null;
  /** A last line in small print (a check made without a recent sync). */
  note?: string | null;
  /** Rehearsal (ADR 0067): what would happen; nothing was recorded. */
  rehearsal?: boolean;
  /** Check (ADR 0090): only looked; nothing was recorded. */
  check?: boolean;
  /** The same code seen again while still in front of the camera: shown without a sound. */
  repeat?: boolean;
}

/**
 * The outcome stored and uploaded for a decision. At a checkpoint (ADR 0092) a first use is a
 * benefit handed over, and a second one a benefit already used.
 */
export function outcomeOf(decision: DecisionDto, checkpoint = false): ScanOutcome {
  switch (decision.kind) {
    case "admit":
      return checkpoint ? "benefit_granted" : "admitted";
    case "readmit":
      return "readmitted";
    case "exit":
      return "exited";
    case "already_out":
      return "rejected_already_out";
    case "already_entered":
      return checkpoint ? "rejected_benefit_used" : "rejected_used";
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
  return decision.kind === "other_event" || decision.kind === "invalid" ? null : decision.number;
}

/** Whether the decision lets the ticket in (a first entry or a return, ADR 0083). */
export function isEntry(decision: DecisionDto): decision is Extract<DecisionDto, { kind: "admit" | "readmit" }> {
  return decision.kind === "admit" || decision.kind === "readmit";
}

/** Seller whose range holds `number` (ranges never overlap). */
export function sellerOf(sellers: readonly DoorSeller[], number: number): string | null {
  return sellers.find((range) => range.first <= number && number <= range.last)?.seller ?? null;
}

/** A seller's range as stored: manifests saved by older apps lack `boxOffice`. */
export type DoorSeller = Omit<DoorSellerRangeDto, "boxOffice"> & { boxOffice?: boolean };
/**
 * A category's range as stored: manifests saved by older apps lack `id` and `priceCents`, and
 * those saved before ADR 0082 the document check.
 */
export type DoorCategory = Omit<
  DoorCategoryRangeDto,
  "id" | "priceCents" | "checkDocument" | "documentNote" | "doorInstruction" | "dayRule" | "validDays"
> & {
  id?: string;
  priceCents?: number | null;
  checkDocument?: boolean;
  documentNote?: string | null;
  /** Missing in manifests stored before ADRs 0089 and 0091. */
  doorInstruction?: string | null;
  dayRule?: DayRule;
  validDays?: readonly number[];
};

/** What the doorkeeper asks to see before letting a ticket in (ADR 0082). */
export interface DocumentCheck {
  /** The category that asks for it ("Meia"). */
  category: string;
  /** Which documents count; `null`: any proof of the right. */
  note: string | null;
}

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
  /** A ticket that went out may come back (ADR 0083): "already entered" means "inside now". */
  reentry?: boolean;
  /** Tickets or consumption tokens (ADR 0084): the words of the result. */
  kind?: EventKind;
  /** The days of an event of several days (ADR 0091); empty: one day. */
  days?: readonly EventDay[];
  /** The day the door is on now (its position); `null`: an event of one day. */
  today?: number | null;
  /** The checkpoint this phone reads (ADR 0092); `null`: the entrance. */
  checkpoint?: DoorCheckpointDto | null;
}

/** The day the door is on at `serverNowMs` (ADR 0091): `null` for an event of one day. */
export function todayOf(days: readonly EventDay[], serverNowMs: number): number | null {
  return currentDay(days, serverNowMs);
}

/** The day rule of `number`'s category; a number without a category is valid every day. */
export function ruleOf(context: DoorContext, number: number): { rule: DayRule; validDays: readonly number[] } {
  const range = categoryRangeOf(context.categories, number);
  return { rule: range?.dayRule ?? "every", validDays: range?.validDays ?? [] };
}

/**
 * The book `number` is checked in now (ADR 0091): today's (its position), or `null` for the
 * whole event ("one day of their choice", a checkpoint used once, an event of one day).
 */
export function bookOf(context: DoorContext, number: number): number | null {
  return ledgerDay(ruleOf(context, number).rule, context.today ?? null, context.checkpoint?.perDay ?? true);
}

/** The engine's key of a book. */
export function bookKey(book: number | null): string {
  return book === null ? "" : `d${String(book)}`;
}

/**
 * The days `number` is valid on, when its category is not valid today (ADR 0091); `null` when
 * it is (always, in an event of one day).
 */
export function wrongDay(context: DoorContext, number: number): EventDay[] | null {
  const { rule, validDays } = ruleOf(context, number);
  return validOn(rule, validDays, context.today ?? null) ? null : daysOf(rule, validDays, context.days ?? []);
}

/**
 * At a checkpoint that only some categories have a right to (ADR 0092), the category of a
 * `number` without it (`null` name: a number without a category); `null` when it has the right.
 */
export function notEntitled(context: DoorContext, number: number): { category: string | null } | null {
  const checkpoint = context.checkpoint;
  if (checkpoint === undefined || checkpoint === null || checkpoint.categoryIds.length === 0) {
    return null;
  }
  const range = categoryRangeOf(context.categories, number);
  return range?.id !== undefined && checkpoint.categoryIds.includes(range.id) ? null : { category: range?.name ?? null };
}

/** What to do for `number` (ADR 0089): its category's instruction, or the checkpoint's. */
export function instructionOf(context: DoorContext, number: number): string | null {
  if (context.checkpoint !== undefined && context.checkpoint !== null) {
    return context.checkpoint.instruction;
  }
  return categoryRangeOf(context.categories, number)?.doorInstruction ?? null;
}

/**
 * When a movement happened, as the door says it: "às 18:10", or in an event of several days
 * "hoje às 18:10" and "no sábado 21/11 às 18:10".
 */
export function whenText(context: DoorContext, atUnixMs: number): string {
  const time = clockTime(atUnixMs);
  const days = context.days ?? [];
  const day = currentDay(days, atUnixMs);
  if (day === null) {
    return t.at(time);
  }
  if (day === (context.today ?? null)) {
    return t.todayAt(time);
  }
  const item = days.find((candidate) => candidate.position === day);
  return item === undefined ? t.at(time) : t.onDayAt(onDayLabel(item.startsAt), time);
}

/** The checkpoint's name for the screen, if this phone reads one. */
function placeOf(context: DoorContext): { place: string } | Record<string, never> {
  return context.checkpoint === undefined || context.checkpoint === null ? {} : { place: context.checkpoint.name };
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

/** The document `number` must show at the door, when its category asks for one (ADR 0082). */
export function documentOf(categories: readonly DoorCategory[], number: number): DocumentCheck | null {
  const range = categoryRangeOf(categories, number);
  return range?.checkDocument === true ? { category: range.name, note: range.documentNote ?? null } : null;
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
  const w = resultWords(context.kind);
  const number = numberOf(decision);
  const label = number === null ? null : t.number(padNumber(number, context.digits));
  const seller = number === null ? null : sellerOf(context.sellers, number);
  const sellerLine = seller === null ? null : t.seller(seller);
  const tags = {
    category: number === null ? null : categoryOf(context.categories, number),
    seat: number === null ? null : seatOf(context.seats, number),
  };
  const none = { category: null, seat: null };
  const checkpoint = context.checkpoint !== undefined && context.checkpoint !== null;
  switch (decision.kind) {
    case "admit": {
      const instruction = instructionOf(context, decision.number);
      const todo = instruction === null ? {} : { instruction: { label: t.instructionLabel, text: instruction } };
      // A checkpoint hands over what it is for (ADR 0092): no charge, no document.
      if (checkpoint) {
        return { tone: "ok", title: t.granted, number: label, detail: null, seller: sellerLine, ...tags, ...placeOf(context), ...todo };
      }
      const price = boxOfficePrice(context, decision.number);
      const document = documentOf(context.categories, decision.number);
      return {
        tone: "ok",
        title: w.admit,
        number: label,
        detail: null,
        seller: sellerLine,
        ...tags,
        ...(price === undefined ? {} : { charge: chargeLine(price) }),
        ...(document === null ? {} : { document }),
        ...todo,
      };
    }
    case "already_entered": {
      const when = whenText(context, decision.firstEntry.atUnixMs);
      if (checkpoint) {
        return {
          tone: "bad",
          title: t.used,
          number: label,
          detail: t.usedAt(when, decision.firstEntry.deviceName),
          seller: sellerLine,
          ...tags,
          ...placeOf(context),
        };
      }
      return {
        tone: "bad",
        title: context.reentry === true ? w.inside : w.alreadyEntered,
        number: label,
        detail: (context.reentry === true ? w.insideSince : w.alreadyEnteredAt)(when, decision.firstEntry.deviceName),
        seller: sellerLine,
        ...tags,
      };
    }
    // Re-entry (ADR 0083): a return was checked on the way in; no document, no charge again.
    case "readmit":
      return {
        tone: "ok",
        title: w.admit,
        number: label,
        detail: t.returning(clockTime(decision.exited.atUnixMs), decision.exited.deviceName),
        seller: sellerLine,
        ...tags,
      };
    case "exit":
      return { tone: "exit", title: t.exit, number: label, detail: t.exitDetail, seller: null, ...tags };
    case "already_out":
      return {
        tone: "warn",
        title: t.alreadyOut,
        number: label,
        detail: t.alreadyOutAt(clockTime(decision.exited.atUnixMs), decision.exited.deviceName),
        seller: null,
        ...tags,
      };
    case "voided":
      return { tone: "bad", title: w.voided, number: label, detail: t.voidReasons[decision.reason], seller: sellerLine, ...tags, ...placeOf(context) };
    case "other_event": {
      // A ticket of another date of the same event never enters here, but the door says which.
      const session = otherSession(context, decision.eventTag);
      return session === null
        ? { tone: "warn", title: w.otherEvent, number: null, detail: null, seller: null, ...none }
        : { tone: "warn", title: w.otherSession, number: null, detail: t.otherSessionDetail(session), seller: null, ...none };
    }
    case "invalid":
      return { tone: "bad", title: w.invalid, number: null, detail: t.invalidReasons[decision.reason], seller: null, ...none };
  }
}

/** Yellow screen of a valid ticket of a category this door does not take (ADR 0068). */
export function wrongDoorView(number: number, wrong: { category: string; doors: string[] }, context: DoorContext): ResultView {
  const w = resultWords(context.kind);
  return {
    tone: "warn",
    title: w.wrongDoor,
    number: t.number(padNumber(number, context.digits)),
    detail: wrong.doors.length === 0 ? w.wrongDoorNone(wrong.category) : w.wrongDoorGo(wrong.category, wrong.doors),
    seller: null,
    category: categoryOf(context.categories, number),
    seat: seatOf(context.seats, number),
    action: { label: w.letInAnyway, hint: t.letInAnywayHint },
  };
}

/**
 * Yellow screen of a ticket whose category is not valid today (ADR 0091), with the days it is
 * valid on. `action`: the door may let it in anyway (never in a rehearsal or a check).
 */
export function wrongDayView(number: number, valid: readonly EventDay[], context: DoorContext, action: boolean): ResultView {
  const w = resultWords(context.kind);
  const checkpoint = context.checkpoint !== undefined && context.checkpoint !== null;
  return {
    tone: "warn",
    title: t.wrongDay,
    number: t.number(padNumber(number, context.digits)),
    detail: valid.length === 0 ? t.wrongDayNone : t.wrongDayOn(dayTexts.list(valid.map((day) => onDayLabel(day.startsAt)))),
    seller: null,
    category: categoryOf(context.categories, number),
    seat: seatOf(context.seats, number),
    ...placeOf(context),
    action: action ? { label: checkpoint ? t.grantAnyway : w.letInAnyway, hint: t.letInAnywayDay } : null,
  };
}

/**
 * Yellow screen of a ticket without the right to the checkpoint (ADR 0092). `action`: it may be
 * handed over anyway, as an exception.
 */
export function notEntitledView(number: number, category: string | null, context: DoorContext, action: boolean): ResultView {
  const place = context.checkpoint?.name ?? "";
  return {
    tone: "warn",
    title: t.notEntitled,
    number: t.number(padNumber(number, context.digits)),
    detail: category === null ? t.notEntitledNone(place) : t.notEntitledCategory(category, place),
    seller: null,
    category: categoryOf(context.categories, number),
    seat: seatOf(context.seats, number),
    ...placeOf(context),
    action: action ? { label: t.grantAnyway, hint: t.letInAnywayHint } : null,
  };
}

/** Words of a check (ADR 0090). */
const c = portariaTexts.check;

/**
 * What a check shows (ADR 0090), from the decision of the book the ticket would be checked in
 * now (nothing is recorded): it passed the entrance (or used the checkpoint), it did not (with a
 * button that records it now), it is outside, or the same refusal as the door. `stale`: the note
 * of a phone that has not synced for a while (entries of other phones may be missing).
 */
export function checkView(decision: DecisionDto, context: DoorContext, stale: string | null): ResultView {
  const note = stale === null ? {} : { note: stale };
  const checkpoint = context.checkpoint !== undefined && context.checkpoint !== null;
  const place = context.checkpoint?.name ?? "";
  const today = (context.today ?? null) !== null;
  const number = numberOf(decision);
  const base = {
    number: number === null ? null : t.number(padNumber(number, context.digits)),
    seller: number === null ? null : (sellerOf(context.sellers, number) === null ? null : t.seller(sellerOf(context.sellers, number) ?? "")),
    category: number === null ? null : categoryOf(context.categories, number),
    seat: number === null ? null : seatOf(context.seats, number),
    check: true,
    ...placeOf(context),
  };
  switch (decision.kind) {
    case "already_entered": {
      const when = whenText(context, decision.firstEntry.atUnixMs);
      if (checkpoint) {
        return { ...base, tone: "bad", title: c.used, detail: t.usedAt(when, decision.firstEntry.deviceName), ...note };
      }
      const instruction = instructionOf(context, decision.number);
      return {
        ...base,
        tone: "ok",
        title: c.passed,
        detail: c.passedAt(when, decision.firstEntry.deviceName),
        ...(instruction === null ? {} : { instruction: { label: c.instructionLabel, text: instruction } }),
        ...note,
      };
    }
    case "admit":
      return checkpoint
        ? {
            ...base,
            tone: "warn",
            title: c.notUsed,
            detail: today ? c.notUsedToday(place) : c.notUsedEver(place),
            action: { label: c.registerUse, hint: c.registerUseHint },
            ...note,
          }
        : {
            ...base,
            tone: "warn",
            title: c.notPassed,
            detail: today ? c.notPassedToday : c.notPassedEver,
            action: { label: c.register, hint: c.registerHint },
            ...note,
          };
    case "readmit":
      return {
        ...base,
        tone: "warn",
        title: c.outside,
        detail: c.outsideAt(whenText(context, decision.exited.atUnixMs), decision.exited.deviceName),
        action: { label: c.registerReturn, hint: c.registerHint },
        ...note,
      };
    default:
      return { ...viewOf(decision, context), check: true };
  }
}

/**
 * What a read shows in rehearsal (ADR 0067): the sample of the previews says the camera works;
 * a ticket of this event shows what would happen at the door (nothing is recorded); any other
 * code is explained.
 */
export function rehearsalView(text: string, decision: DecisionDto, context: DoorContext): ResultView {
  const r = doorWords(context.kind).rehearsal;
  const base = { seller: null, category: null, seat: null, number: null, rehearsal: true } as const;
  if (isSampleQr(text)) {
    return { ...base, tone: "ok", title: r.sampleTitle, detail: r.sampleDetail };
  }
  if (decision.kind === "invalid" && decision.reason === "malformed") {
    return { ...base, tone: "warn", title: r.otherQrTitle, detail: r.otherQrDetail };
  }
  if (isEntry(decision)) {
    const valid = wrongDay(context, decision.number);
    if (valid !== null) {
      return { ...wrongDayView(decision.number, valid, context, false), rehearsal: true };
    }
    const missing = notEntitled(context, decision.number);
    if (missing !== null) {
      return { ...notEntitledView(decision.number, missing.category, context, false), rehearsal: true };
    }
    const wrong = context.checkpoint === undefined || context.checkpoint === null ? wrongDoor(context, decision.number) : null;
    if (wrong !== null) {
      return { ...wrongDoorView(decision.number, wrong, context), action: null, rehearsal: true };
    }
    // Never the green "PODE ENTRAR" of real work: a volunteer who forgot the rehearsal on could
    // let people in without an entry.
    const title = context.checkpoint === undefined || context.checkpoint === null ? r.wouldAdmit : portariaTexts.rehearsal.wouldGrant;
    return { ...viewOf(decision, context), tone: "warn", title, rehearsal: true };
  }
  if (decision.kind === "exit") {
    return { ...viewOf(decision, context), tone: "warn", title: r.wouldExit, rehearsal: true };
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
 * (a refusal, a warning, a box office charge, a wrong door, a document to check, an instruction,
 * a check) stays until the doorkeeper taps.
 */
export function dismissPolicy(view: ResultView): DismissPolicy {
  if (
    (view.tone !== "ok" && view.tone !== "exit") ||
    (view.action !== undefined && view.action !== null) ||
    (view.charge !== undefined && view.charge !== null) ||
    (view.document !== undefined && view.document !== null) ||
    (view.instruction !== undefined && view.instruction !== null) ||
    view.check === true
  ) {
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

/** Screen after the server found a copy (the first entry, or the return, was on another phone). */
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

/**
 * The note of a check made on a phone that has not synced for a while (ADR 0090): entries of
 * other phones after `syncedAt` may be missing. `null` when the data is recent.
 */
export function staleNote(syncedAt: number | null, now: number): string | null {
  if (syncedAt === null) {
    return portariaTexts.check.neverSynced;
  }
  const age = now - syncedAt;
  return age > OFFLINE_WARNING_MS ? portariaTexts.check.stale(Math.floor(age / 60_000)) : null;
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
