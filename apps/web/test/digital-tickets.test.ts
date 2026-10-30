import type { TicketLinkDto } from "@ingressoimpresso/api-types";
import { describe, expect, it } from "vitest";

import {
  alreadyHas,
  defaultColumns,
  demand,
  distinctAnswers,
  groupRecipients,
  importRows,
  isPending,
  matchCategory,
  matchesQuery,
  normalizePhone,
  readSheet,
  ticketsMessage,
  type MessageWords,
} from "@/lib/digital-tickets";

function link(change: Partial<TicketLinkDto> & { id: string; number: number }): TicketLinkDto {
  return {
    numberLabel: String(change.number).padStart(4, "0"),
    holderName: null,
    url: `https://exemplo.com/ingresso#${change.id}`,
    createdAt: "2026-11-01T10:00:00Z",
    revokedAt: null,
    firstOpenedAt: null,
    lastOpenedAt: null,
    openCount: 0,
    state: "valid",
    enteredAt: null,
    seller: null,
    categoryId: null,
    holderPhone: null,
    note: null,
    sentAt: null,
    ...change,
  };
}

const label = (index: number) => `Coluna ${String(index + 1)}`;

const CATEGORIES = [
  { id: "sab-janta", name: "Sábado com janta" },
  { id: "sab", name: "Sábado sem janta" },
  { id: "dom-janta", name: "Domingo com janta" },
  { id: "dom", name: "Domingo sem janta" },
  { id: "dois-janta", name: "Sábado e domingo com janta" },
  { id: "dois", name: "Sábado e domingo sem janta" },
];

describe("digital tickets for people", () => {
  it("knows who still waits for a ticket", () => {
    expect(isPending(link({ id: "a", number: 1 }))).toBe(true);
    expect(isPending(link({ id: "b", number: 2, sentAt: "2026-11-01T10:05:00Z" }))).toBe(false);
    expect(isPending(link({ id: "c", number: 3, openCount: 1 }))).toBe(false);
    expect(isPending(link({ id: "d", number: 4, revokedAt: "2026-11-01T11:00:00Z" }))).toBe(false);
    // A team member without the delivery part has no link to send.
    expect(isPending(link({ id: "e", number: 5, url: "" }))).toBe(false);
  });

  it("finds a ticket by number, name, phone or note", () => {
    const item = link({ id: "a", number: 12, holderName: "João Araújo", holderPhone: "5511999990000", note: "Pix conferido" });
    expect(matchesQuery(item, "0012")).toBe(true);
    expect(matchesQuery(item, "joao")).toBe(true);
    expect(matchesQuery(item, "99999")).toBe(true);
    expect(matchesQuery(item, "pix")).toBe(true);
    expect(matchesQuery(item, "maria")).toBe(false);
  });

  it("groups one person's tickets in one message", () => {
    const links = [
      link({ id: "a", number: 3, holderName: "Ana", holderPhone: "5511999990000" }),
      link({ id: "b", number: 1, holderName: "Ana", holderPhone: "5511999990000" }),
      link({ id: "c", number: 2, holderName: "Bruno" }),
      link({ id: "d", number: 4, holderName: "Bruno" }),
      link({ id: "e", number: 5, holderName: "Bruno", createdAt: "2026-11-02T10:00:00Z" }),
      link({ id: "f", number: 6 }),
    ];
    const groups = groupRecipients(links);
    expect(groups.map((group) => group.links.map((item) => item.number))).toEqual([[1, 3], [2, 4], [5], [6]]);
    expect(groups[0]?.phone).toBe("5511999990000");
  });

  it("writes the message with each ticket's category", () => {
    const words: MessageWords = {
      hello: (name) => (name === null ? "Olá!" : `Olá, ${name}!`),
      one: (event) => `Seu ingresso para ${event}:`,
      many: (count, event) => `Seus ${String(count)} ingressos para ${event}:`,
      numberLine: (number, category) => (category === null ? `Nº ${number}` : `Nº ${number} (${category})`),
      tip: "Mostre o QR na entrada.",
    };
    const names = (id: string | null) => CATEGORIES.find((category) => category.id === id)?.name ?? null;
    const one = [link({ id: "a", number: 1 })];
    expect(ticketsMessage(words, "Ana", "Festa", one, names)).toBe(
      "Olá, Ana! Seu ingresso para Festa:\nhttps://exemplo.com/ingresso#a\n\nMostre o QR na entrada.",
    );
    const two = [link({ id: "a", number: 1, categoryId: "sab-janta" }), link({ id: "b", number: 2 })];
    expect(ticketsMessage(words, null, "Festa", two, names)).toBe(
      "Olá! Seus 2 ingressos para Festa:\n\nNº 0001 (Sábado com janta)\nhttps://exemplo.com/ingresso#a\n\nNº 0002\nhttps://exemplo.com/ingresso#b\n\nMostre o QR na entrada.",
    );
  });

  it("reads phones like the server", () => {
    expect(normalizePhone("(11) 99999-0000")).toBe("5511999990000");
    expect(normalizePhone("011 3333-4444")).toBe("551133334444");
    expect(normalizePhone("+55 11 99999-0000")).toBe("5511999990000");
    expect(normalizePhone("+351 912 345 678")).toBe("351912345678");
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("99999")).toBe(false);
    expect(normalizePhone("11 99999-0000 (Ana)")).toBe(false);
  });
});

describe("importing a form's answers", () => {
  const forms = [
    "Carimbo de data/hora,Nome completo,WhatsApp,Qual ingresso?,Quantidade de ingressos,Comprovante de pagamento",
    '01/11/2026 10:00:00,Ana Lima,(11) 99999-0000,Sábado com janta - R$ 80,2,https://drive.google.com/open?id=1',
    '01/11/2026 10:05:00,"Bruno, o Primo",11 98888,Sábado + Domingo c/ janta,,https://drive.google.com/open?id=2',
    "01/11/2026 10:07:00,,,,,",
    "01/11/2026 10:09:00,Carla,,Domingo s/ janta,muitos,",
  ].join("\n");

  it("guesses the columns of a Google Forms download", () => {
    const sheet = readSheet(forms, true, label);
    expect(sheet?.header).toBe(true);
    expect(sheet === null ? null : defaultColumns(sheet)).toEqual({ name: 1, phone: 2, category: 3, quantity: 4, note: 5 });
  });

  it("reads every answer with what is wrong in it", () => {
    const sheet = readSheet(forms, true, label);
    if (sheet === null) {
      throw new Error("no sheet");
    }
    const rows = importRows(sheet, defaultColumns(sheet));
    expect(rows).toEqual([
      {
        line: 2,
        name: "Ana Lima",
        phone: "5511999990000",
        phoneInvalid: false,
        quantity: 2,
        quantityInvalid: false,
        answer: "Sábado com janta - R$ 80",
        note: "https://drive.google.com/open?id=1",
      },
      {
        line: 3,
        name: "Bruno, o Primo",
        phone: null,
        phoneInvalid: true,
        quantity: 1,
        quantityInvalid: false,
        answer: "Sábado + Domingo c/ janta",
        note: "https://drive.google.com/open?id=2",
      },
      { line: 5, name: "Carla", phone: null, phoneInvalid: false, quantity: 1, quantityInvalid: true, answer: "Domingo s/ janta", note: null },
    ]);
    expect(distinctAnswers(rows)).toEqual(["Sábado com janta - R$ 80", "Sábado + Domingo c/ janta", "Domingo s/ janta"]);
  });

  it("reads cells pasted from a sheet without a header", () => {
    const sheet = readSheet("Ana\t11999990000\tSábado com janta\nBruno\t\tDomingo sem janta", false, label);
    expect(sheet?.header).toBe(false);
    expect(sheet?.columns).toEqual(["Coluna 1", "Coluna 2", "Coluna 3"]);
    expect(sheet === null ? null : importRows(sheet, defaultColumns(sheet)).map((row) => [row.name, row.phone, row.answer])).toEqual([
      ["Ana", "5511999990000", "Sábado com janta"],
      ["Bruno", null, "Domingo sem janta"],
    ]);
  });

  it("matches answers to categories without mixing up dinner and none", () => {
    const id = (answer: string) => matchCategory(answer, CATEGORIES)?.id ?? null;
    expect(id("Sábado com janta")).toBe("sab-janta");
    expect(id("sabado com janta - R$ 80,00")).toBe("sab-janta");
    expect(id("Sábado s/ janta")).toBe("sab");
    expect(id("Sábado + Domingo c/ janta")).toBe("dois-janta");
    expect(id("Sábado e Domingo (sem janta)")).toBe("dois");
    expect(id("Domingo com janta")).toBe("dom-janta");
    expect(id("Camiseta")).toBeNull();
    expect(id("")).toBeNull();
  });

  it("spots who already has a ticket and adds up what is asked", () => {
    const links = [link({ id: "a", number: 1, holderName: "Ana Lima", holderPhone: "5511999990000" })];
    expect(alreadyHas({ name: "ANA LIMA", phone: null }, links)).toBe(true);
    expect(alreadyHas({ name: "Outra", phone: "5511999990000" }, links)).toBe(true);
    expect(alreadyHas({ name: "Bruno", phone: null }, links)).toBe(false);
    expect([...demand([{ categoryId: "a", quantity: 2 }, { categoryId: null, quantity: 1 }, { categoryId: "a", quantity: 3 }])]).toEqual([
      ["a", 5],
      [null, 1],
    ]);
  });
});
