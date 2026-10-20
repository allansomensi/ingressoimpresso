import type { ReportRowDto, ReservationDto, SellerDto, SellerViewDto } from "@ingressoimpresso/api-types";
import { describe, expect, it } from "vitest";

import {
  deadlineFromInput,
  deadlineLabel,
  deadlineProblem,
  isDueSoon,
  reminderMessage,
  shortcutDeadline,
  timeLeft,
} from "@/lib/reservations";
import { goalPercent, goalTotals, rankSellers, shortName } from "@/lib/seller-goals";
import { applyOps, opLabel, pendingNumbers, problemText, queueOp, syncNotices, type QueuedOp } from "@/lib/seller-offline";
import { countCells, numberCells } from "@/lib/seller-page";

// Monday 12 October 2026, 15:00 in Brasília (18:00 UTC).
const NOW = new Date("2026-10-12T18:00:00Z");
const BRT = -180;

function reservation(overrides: Partial<ReservationDto> = {}): ReservationDto {
  return {
    id: "r1",
    sellerId: "s1",
    numbers: [{ first: 3, last: 4 }],
    holderName: "Ana Souza",
    holderPhone: "11 98888-7777",
    expiresAt: "2026-10-13T23:59:00-03:00",
    createdAt: "2026-10-12T10:00:00-03:00",
    active: true,
    byOrganizer: false,
    ...overrides,
  };
}

function view(overrides: Partial<SellerViewDto> = {}): SellerViewDto {
  return {
    event: {
      name: "Show",
      venue: null,
      startsAt: "2026-11-20T22:00:00-03:00",
      endsAt: "2026-11-21T03:00:00-03:00",
      organizer: "Banda",
      ticketPriceCents: 3000,
      address: null,
      change: { postponedFrom: null, postponedAt: null, postponeReason: null, canceledAt: null, cancelReason: null },
      utcOffsetMinutes: BRT,
    },
    organization: { name: "Banda", logoPath: null, brandColor: null, whatsapp: null, email: null, website: null, instagram: null },
    seller: "Maria Souza",
    numberPrefix: "Nº",
    numberDigits: 4,
    ranges: [{ first: 1, last: 10 }],
    voids: [{ first: 10, last: 10, reason: "unsold" }],
    sales: [{ number: 1, buyerName: "Bia", buyerPhone: null, soldAt: "2026-10-12T12:00:00Z", ticketUrl: null }],
    payments: [],
    summary: {
      tickets: 10,
      sold: 1,
      available: 6,
      reserved: 2,
      unsold: 1,
      lost: 0,
      dueTickets: 9,
      amountDueCents: 27000,
      dueLines: [],
      receivedCents: 0,
      balanceCents: 27000,
    },
    receivers: [],
    categories: [],
    canSendTickets: true,
    boxOffice: false,
    reservations: [reservation()],
    goal: 5,
    ranking: null,
    ...overrides,
  } as SellerViewDto;
}

describe("reservation deadlines", () => {
  it("end at 23:59 of the chosen day, in the event's time", () => {
    expect(shortcutDeadline("tomorrow", NOW, BRT)).toBe("2026-10-13T23:59:00-03:00");
    expect(shortcutDeadline("three_days", NOW, BRT)).toBe("2026-10-15T23:59:00-03:00");
    expect(shortcutDeadline("friday", NOW, BRT)).toBe("2026-10-16T23:59:00-03:00");
    // On a Friday, "sexta" is the next one; late at night UTC is still the event's Friday.
    expect(shortcutDeadline("friday", new Date("2026-10-17T01:00:00Z"), BRT)).toBe("2026-10-23T23:59:00-03:00");
    // An event in Manaus (−4 h): its own "amanhã".
    expect(shortcutDeadline("tomorrow", NOW, -240)).toBe("2026-10-13T23:59:00-04:00");
    expect(deadlineFromInput("2026-10-20T18:30", BRT)).toBe("2026-10-20T18:30:00-03:00");
    expect(deadlineFromInput("20/10", BRT)).toBeNull();
  });

  it("must be in the future and before the event ends", () => {
    const ends = "2026-11-21T03:00:00-03:00";
    expect(deadlineProblem("2026-10-12T14:00:00-03:00", NOW, ends)).toBe("past");
    expect(deadlineProblem("2026-11-21T03:01:00-03:00", NOW, ends)).toBe("after_event");
    expect(deadlineProblem("2026-10-13T23:59:00-03:00", NOW, ends)).toBeNull();
  });

  it("read like people say them", () => {
    expect(deadlineLabel("2026-10-12T23:59:00-03:00", NOW)).toBe("hoje, 23:59");
    expect(deadlineLabel("2026-10-13T18:00:00-03:00", NOW)).toBe("amanhã, 18:00");
    expect(deadlineLabel("2026-10-16T23:59:00-03:00", NOW)).toBe("sex., 16/10, 23:59");
    expect(timeLeft("2026-10-12T15:20:00-03:00", NOW)).toBe("faltam 20 min");
    expect(timeLeft("2026-10-13T23:59:00-03:00", NOW)).toBe("faltam 32 h");
    expect(timeLeft("2026-10-20T23:59:00-03:00", NOW)).toBe("faltam 8 dias");
    expect(timeLeft("2026-10-12T14:00:00-03:00", NOW)).toBe("venceu");
  });

  it("highlights what ends within a day, with a ready reminder", () => {
    expect(isDueSoon(reservation({ expiresAt: "2026-10-13T14:59:00-03:00" }), NOW)).toBe(true);
    expect(isDueSoon(reservation({ expiresAt: "2026-10-13T15:01:00-03:00" }), NOW)).toBe(false);
    expect(isDueSoon(reservation({ expiresAt: "2026-10-12T14:00:00-03:00", active: false }), NOW)).toBe(false);
    const message = reminderMessage({ reservation: reservation(), eventName: "Show", seller: "Maria Souza", digits: 4, now: NOW });
    expect(message).toContain("Oi, Ana! Aqui é Maria.");
    expect(message).toContain("os números 0003–0004 do *Show* para você até amanhã, 23:59");
    const one = reminderMessage({ reservation: reservation({ numbers: [{ first: 7, last: 7 }] }), eventName: "Show", seller: "Maria", digits: 4, now: NOW });
    expect(one).toContain("o número 0007");
    expect(one).toContain("ele volta");
  });
});

describe("goals and ranking", () => {
  const seller = (id: string, name: string, goal: number | null, boxOffice = false, ranges = [{ id: "x", first: 1, last: 5 }]): SellerDto => ({
    id,
    name,
    phone: null,
    ranges,
    link: null,
    commission: null,
    boxOffice,
    goal,
    pix: null,
  });
  const rows = (sold: Record<string, number>) => new Map(Object.entries(sold).map(([id, markedSold]) => [id, { markedSold } as ReportRowDto]));

  it("ranks by sales with shared positions, leaving box offices and empty sellers out", () => {
    const ranked = rankSellers(
      [
        seller("a", "Caio Lima", 10),
        seller("b", "Bia Rocha", 4),
        seller("c", "Ana Souza", null),
        seller("d", "Duda", 5),
        seller("e", "Bilheteria", null, true),
        seller("f", "Sem Números", 5, false, []),
      ],
      rows({ a: 3, b: 7, c: 3, d: 0, e: 40 }),
    );
    expect(ranked.map((entry) => [entry.seller.id, entry.position, entry.percent])).toEqual([
      ["b", 1, 100],
      ["c", 2, null],
      ["a", 2, 30],
      ["d", null, 0],
    ]);
    expect(goalTotals(ranked)).toEqual({ withGoal: 3, reached: 1, sold: 7, goal: 19 });
  });

  it("shows other sellers by first name and initial", () => {
    expect(shortName("Ana Paula souza")).toBe("Ana S.");
    expect(shortName(" João ")).toBe("João");
    expect(shortName("")).toBe("");
    expect(goalPercent(30, 20)).toBe(100);
    expect(goalPercent(3, null)).toBeNull();
  });
});

describe("the page offline", () => {
  it("draws reserved numbers apart and counts them", () => {
    const cells = numberCells(view(), NOW);
    expect(cells.slice(0, 5).map((cell) => cell.state)).toEqual(["sold", "available", "reserved", "reserved", "available"]);
    expect(cells[2]?.reservation?.holderName).toBe("Ana Souza");
    expect(countCells(view(), NOW)).toEqual({ tickets: 10, sold: 1, available: 6, reserved: 2 });
    // An expired reservation frees its numbers by itself.
    const later = new Date("2026-10-14T12:00:00Z");
    expect(countCells(view(), later)).toEqual({ tickets: 10, sold: 1, available: 8, reserved: 0 });
  });

  it("applies queued changes the way the server will", () => {
    const sell: QueuedOp = queueOp(
      { kind: "mark", ranges: [{ first: 2, last: 3 }], buyerName: "Caio", buyerPhone: null, edit: false, reservationId: null },
      NOW,
      "op1",
    );
    // 3 is reserved for Ana: only 2 is sold.
    let next = applyOps(view(), [sell], NOW);
    expect(next.sales.map((sale) => sale.number)).toEqual([1, 2]);
    expect(next.summary).toMatchObject({ sold: 2, available: 5, reserved: 2 });
    // Selling the reservation takes 3 out of it.
    const paid = queueOp({ kind: "mark", ranges: [{ first: 3, last: 3 }], buyerName: "Ana Souza", buyerPhone: null, edit: false, reservationId: "r1" }, NOW, "op2");
    next = applyOps(view(), [paid], NOW);
    expect(next.reservations[0]?.numbers).toEqual([{ first: 4, last: 4 }]);
    // A new reservation, then giving up Ana's; undoing a sale.
    const reserve = queueOp(
      { kind: "reserve", reservationId: "r2", ranges: [{ first: 5, last: 6 }], holderName: "Duda", holderPhone: null, expiresAt: "2026-10-16T23:59:00-03:00" },
      NOW,
      "op3",
    );
    const cancel = queueOp({ kind: "cancel_reservation", reservationId: "r1" }, NOW, "op4");
    const undo = queueOp({ kind: "unmark", number: 1 }, NOW, "op5");
    next = applyOps(view(), [reserve, cancel, undo], NOW);
    expect(next.reservations.map((item) => [item.id, item.numbers])).toEqual([["r2", [{ first: 5, last: 6 }]]]);
    expect(next.summary).toMatchObject({ sold: 0, available: 7, reserved: 2 });
    expect([...pendingNumbers([reserve, cancel, undo], view())].sort((a, b) => a - b)).toEqual([1, 3, 4, 5, 6]);
    // Nothing on a returned number, nor a reservation already past its deadline.
    const late = queueOp({ ...reserve.op, expiresAt: "2026-10-12T14:00:00-03:00" } as QueuedOp["op"], NOW, "op6");
    const returned = queueOp({ kind: "mark", ranges: [{ first: 10, last: 10 }], buyerName: null, buyerPhone: null, edit: false, reservationId: null }, NOW, "op7");
    expect(applyOps(view(), [late, returned], NOW).summary).toMatchObject({ sold: 1, reserved: 2 });
  });

  it("explains what the server could not do, in plain words", () => {
    const sell = queueOp({ kind: "mark", ranges: [{ first: 42, last: 42 }], buyerName: "Ana", buyerPhone: null, edit: false, reservationId: null }, NOW, "op1");
    const done = queueOp({ kind: "unmark", number: 7 }, NOW, "op2");
    const notices = syncNotices(
      [
        { id: "op1", outcome: "rejected", problems: [{ reason: "already_sold", numbers: [{ first: 42, last: 42 }], holder: "Bia" }] },
        { id: "op2", outcome: "applied", problems: [] },
      ],
      [sell, done],
      4,
    );
    expect(notices).toEqual([
      { id: "op1", title: "Venda do 0042 para Ana", lines: ["O 0042 já tinha sido marcado como vendido em outro aparelho (para Bia). Ficou como estava."] },
    ]);
    const reserve = queueOp(
      { kind: "reserve", reservationId: "r9", ranges: [{ first: 5, last: 6 }], holderName: "Duda", holderPhone: null, expiresAt: "2026-10-13T23:59:00-03:00" },
      NOW,
    );
    expect(problemText({ reason: "reserved", numbers: [{ first: 5, last: 6 }], holder: "Ana" }, reserve.op, 4)).toBe(
      "Os números 0005–0006 já estão reservados para Ana.",
    );
    expect(problemText({ reason: "not_held", numbers: [{ first: 5, last: 5 }], holder: null }, sell.op, 4)).toBe(
      "O 0005 não está mais com você: o organizador tirou ele da sua lista.",
    );
    expect(problemText({ reason: "expired", numbers: [], holder: null }, reserve.op, 4)).toContain("reserva de Duda");
    expect(opLabel({ kind: "cancel_reservation", reservationId: "r1" }, 4, [reservation()])).toBe("Cancelar a reserva de Ana Souza");
  });
});
