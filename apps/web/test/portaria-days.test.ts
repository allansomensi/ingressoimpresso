import type { DoorCheckpointDto } from "@ingressoimpresso/api-types";
import { describe, expect, it } from "vitest";

import {
  bookKey,
  bookOf,
  checkView,
  dismissPolicy,
  instructionOf,
  notEntitled,
  notEntitledView,
  outcomeOf,
  rehearsalView,
  staleNote,
  viewOf,
  whenText,
  wrongDay,
  wrongDayView,
  type DoorContext,
} from "@/portaria/logic";
import { portaria as texts } from "@/texts/pt-BR/portaria";

const r = texts.result;
const c = texts.check;

const PASS = "11111111-1111-4111-8111-111111111111";
const SUNDAY = "22222222-2222-4222-8222-222222222222";
const ONE_DAY = "33333333-3333-4333-8333-333333333333";
const DINNER = "44444444-4444-4444-8444-444444444444";

/** The weekend of the friend's event: a 2-day pass with dinner, Sunday only, and "1 day". */
const days: DoorContext = {
  digits: 3,
  sellers: [],
  categories: [
    { id: PASS, name: "Passe 2 dias", color: "#7c3aed", first: 1, last: 40, doorInstruction: "Pulseira laranja", dayRule: "every", validDays: [] },
    { id: SUNDAY, name: "Domingo", color: "#2563eb", first: 41, last: 80, doorInstruction: null, dayRule: "days", validDays: [2] },
    { id: ONE_DAY, name: "1 dia", color: "#16a34a", first: 81, last: 120, doorInstruction: "Pulseira verde", dayRule: "any_one", validDays: [] },
  ],
  seats: [],
  days: [
    { position: 1, startsAt: "2026-11-21T18:00:00-03:00", endsAt: "2026-11-22T01:00:00-03:00" },
    { position: 2, startsAt: "2026-11-22T12:00:00-03:00", endsAt: "2026-11-22T20:00:00-03:00" },
  ],
  today: 1,
};
const sunday: DoorContext = { ...days, today: 2 };

const dinner: DoorCheckpointDto = { id: DINNER, name: "Janta", instruction: "Entregar o prato", perDay: true, categoryIds: [PASS] };
const atDinner: DoorContext = { ...days, checkpoint: dinner };

// The door shows the phone's local time (as `portaria-reentry.test.ts`).
const saturday = (time: string) => new Date(`2026-11-21T${time}:00`).getTime();

describe("the door of an event of several days (ADR 0091)", () => {
  it("checks each rule in its own book", () => {
    expect(bookOf(days, 5)).toBe(1);
    expect(bookOf(sunday, 5)).toBe(2);
    expect(bookOf(sunday, 50)).toBe(2);
    // "1 day, their choice": one entry in the whole event.
    expect(bookOf(sunday, 90)).toBeNull();
    expect(bookKey(null)).toBe("");
    expect(bookKey(2)).toBe("d2");
    // An event of one day: always the whole event.
    expect(bookOf({ ...days, days: [], today: null }, 5)).toBeNull();
  });

  it("turns away a ticket on a day it is not valid, saying when it is", () => {
    expect(wrongDay(days, 5)).toBeNull();
    expect(wrongDay(days, 90)).toBeNull();
    const valid = wrongDay(days, 50);
    expect(valid?.map((day) => day.position)).toEqual([2]);
    expect(wrongDay(sunday, 50)).toBeNull();
    const view = wrongDayView(50, valid ?? [], days, true);
    expect(view).toMatchObject({ tone: "warn", title: r.wrongDay, detail: "Este ingresso vale só no domingo 22/11.", number: "Nº 050" });
    expect(view.action?.label).toBe(r.letInAnyway);
    expect(dismissPolicy(view)).toEqual({ auto: false });
    // Never a button in a rehearsal or a check.
    expect(wrongDayView(50, valid ?? [], days, false).action).toBeNull();
  });

  it("says on which day a one-day ticket already came", () => {
    const decision = { kind: "already_entered", number: 90, firstEntry: { atUnixMs: saturday("18:10"), deviceName: "Porta 1" } } as const;
    expect(viewOf(decision, sunday).detail).toBe("no sábado 21/11 às 18:10 por Porta 1");
    expect(viewOf(decision, days).detail).toBe("hoje às 18:10 por Porta 1");
    expect(whenText({ ...days, days: [], today: null }, saturday("18:10"))).toBe("às 18:10");
  });

  it("shows the category's instruction on a first entry and waits for a tap (ADR 0089)", () => {
    const admit = viewOf({ kind: "admit", number: 5 }, days);
    expect(admit.instruction).toEqual({ label: r.instructionLabel, text: "Pulseira laranja" });
    expect(dismissPolicy(admit)).toEqual({ auto: false });
    // A return does not hand the wristband over again.
    const back = viewOf({ kind: "readmit", number: 5, exited: { atUnixMs: saturday("20:00"), deviceName: "Saída" } }, { ...days, reentry: true });
    expect(back.instruction).toBeUndefined();
    // Without an instruction, the green screen leaves by itself as always.
    expect(dismissPolicy(viewOf({ kind: "admit", number: 50 }, sunday))).toMatchObject({ auto: true });
  });
});

describe("a checkpoint (ADR 0092)", () => {
  it("records uses, never entries", () => {
    expect(outcomeOf({ kind: "admit", number: 5 }, true)).toBe("benefit_granted");
    expect(outcomeOf({ kind: "already_entered", number: 5, firstEntry: { atUnixMs: 0, deviceName: "x" } }, true)).toBe("rejected_benefit_used");
    expect(outcomeOf({ kind: "admit", number: 5 })).toBe("admitted");
  });

  it("hands over once a day, or once in the whole event", () => {
    expect(bookOf(atDinner, 5)).toBe(1);
    expect(bookOf({ ...atDinner, checkpoint: { ...dinner, perDay: false } }, 5)).toBeNull();
    // "1 day" dines once.
    expect(bookOf(atDinner, 90)).toBeNull();
  });

  it("knows who has the right", () => {
    expect(notEntitled(atDinner, 5)).toBeNull();
    expect(notEntitled(atDinner, 90)).toEqual({ category: "1 dia" });
    expect(notEntitled(atDinner, 500)).toEqual({ category: null });
    expect(notEntitled({ ...atDinner, checkpoint: { ...dinner, categoryIds: [] } }, 90)).toBeNull();
    expect(notEntitled(days, 90)).toBeNull();
    const view = notEntitledView(90, "1 dia", atDinner, true);
    expect(view).toMatchObject({ title: r.notEntitled, place: "Janta", detail: "A categoria 1 dia não dá direito a “Janta”." });
    expect(view.action?.label).toBe(r.grantAnyway);
  });

  it("speaks of the checkpoint on its screens", () => {
    const granted = viewOf({ kind: "admit", number: 5 }, atDinner);
    expect(granted).toMatchObject({ tone: "ok", title: r.granted, place: "Janta", instruction: { text: "Entregar o prato" } });
    expect(granted.charge).toBeUndefined();
    const used = viewOf({ kind: "already_entered", number: 5, firstEntry: { atUnixMs: saturday("20:15"), deviceName: "Balcão 1" } }, atDinner);
    expect(used).toMatchObject({ tone: "bad", title: r.used, detail: "hoje às 20:15 em Balcão 1" });
    expect(instructionOf(atDinner, 90)).toBe("Entregar o prato");
    expect(rehearsalView("x", { kind: "admit", number: 5 }, atDinner)).toMatchObject({ tone: "warn", title: texts.rehearsal.wouldGrant });
    expect(rehearsalView("x", { kind: "admit", number: 90 }, atDinner)).toMatchObject({ title: r.notEntitled, action: null });
  });
});

describe("a check (ADR 0090)", () => {
  it("says green when the ticket passed, with what to look at", () => {
    const view = checkView({ kind: "already_entered", number: 5, firstEntry: { atUnixMs: saturday("18:10"), deviceName: "Porta 1" } }, days, null);
    expect(view).toMatchObject({ tone: "ok", title: c.passed, detail: "Entrou hoje às 18:10 por Porta 1", check: true });
    expect(view.instruction).toEqual({ label: c.instructionLabel, text: "Pulseira laranja" });
    expect(view.action).toBeUndefined();
    // A check waits for a tap: nobody queues in a round.
    expect(dismissPolicy(view)).toEqual({ auto: false });
  });

  it("offers to record what is missing", () => {
    const view = checkView({ kind: "admit", number: 5 }, days, null);
    expect(view).toMatchObject({ tone: "warn", title: c.notPassed, detail: c.notPassedToday, action: { label: c.register } });
    expect(checkView({ kind: "admit", number: 5 }, { ...days, days: [], today: null }, null).detail).toBe(c.notPassedEver);
    const out = checkView({ kind: "readmit", number: 5, exited: { atUnixMs: saturday("21:00"), deviceName: "Saída" } }, days, null);
    expect(out).toMatchObject({ title: c.outside, action: { label: c.registerReturn } });
    const notUsed = checkView({ kind: "admit", number: 5 }, atDinner, null);
    expect(notUsed).toMatchObject({ title: c.notUsed, detail: c.notUsedToday("Janta"), action: { label: c.registerUse } });
  });

  it("shows the door's refusals as they are, marked as a check", () => {
    expect(checkView({ kind: "voided", number: 5, reason: "lost" }, days, null)).toMatchObject({ title: r.voided, check: true });
    expect(checkView({ kind: "invalid", reason: "bad_signature" }, days, null)).toMatchObject({ title: r.invalid, check: true });
  });

  it("warns when the phone has not synced for a while", () => {
    const now = saturday("20:00");
    expect(staleNote(now - 30_000, now)).toBeNull();
    expect(staleNote(now - 5 * 60_000, now)).toBe(c.stale(5));
    expect(staleNote(null, now)).toBe(c.neverSynced);
    expect(checkView({ kind: "admit", number: 5 }, days, c.stale(5)).note).toBe(c.stale(5));
  });
});
