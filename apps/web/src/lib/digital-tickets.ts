/**
 * Digital tickets for people (ADR 0123): who still waits for theirs, one WhatsApp per person, and
 * the answers of a form (Google Forms, a spreadsheet) turned into orders by category.
 */

import type { TicketLinkDto } from "@ingressoimpresso/api-types";

import { delimiterOf, plain, splitDelimited } from "@/lib/guest-list";

/** Tickets one person may get in one order (`MAX_ORDER_QUANTITY` in tickets.rs). */
export const MAX_ORDER_QUANTITY = 50;
/** Tickets issued in one request (`MAX_BULK` in tickets.rs). */
export const MAX_ISSUE = 500;

// The list --------------------------------------------------------------------------------------

/** A link that still works: not revoked, not voided, and visible to this user (a URL). */
export function isUsable(link: TicketLinkDto): boolean {
  return link.revokedAt === null && link.state !== "voided" && link.url !== "";
}

/** Waiting to be sent: usable, valid, never sent from the panel nor opened by anyone. */
export function isPending(link: TicketLinkDto): boolean {
  return isUsable(link) && link.state === "valid" && link.sentAt === null && link.openCount === 0;
}

export type LinkFilter = "all" | "pending" | "opened" | "entered" | "inactive";
export const LINK_FILTERS: readonly LinkFilter[] = ["all", "pending", "opened", "entered", "inactive"];

export function matchesFilter(link: TicketLinkDto, filter: LinkFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "pending":
      return isPending(link);
    case "opened":
      return isUsable(link) && link.state === "valid" && link.openCount > 0;
    case "entered":
      return link.state === "entered";
    case "inactive":
      return link.revokedAt !== null || link.state === "voided";
  }
}

/** Number, name, phone digits or note containing `query` (already trimmed and lower case). */
export function matchesQuery(link: TicketLinkDto, query: string): boolean {
  if (query === "") {
    return true;
  }
  const digits = query.replace(/\D/g, "");
  return (
    link.numberLabel.includes(query) ||
    String(link.number) === query ||
    plain(link.holderName ?? "").includes(plain(query)) ||
    plain(link.note ?? "").includes(plain(query)) ||
    (digits.length >= 4 && (link.holderPhone ?? "").includes(digits))
  );
}

/** One person's tickets: what goes in one WhatsApp message. */
export interface Recipient {
  key: string;
  name: string | null;
  phone: string | null;
  links: TicketLinkDto[];
}

/**
 * The links grouped by who receives them: the same WhatsApp, or the same name in the same minute
 * (one order without a phone); anything else stands alone. Groups keep the order of `links`, and
 * each group's links go by number.
 */
export function groupRecipients(links: readonly TicketLinkDto[]): Recipient[] {
  const groups = new Map<string, Recipient>();
  for (const link of links) {
    const key =
      link.holderPhone !== null
        ? `phone:${link.holderPhone}`
        : link.holderName !== null
          ? `name:${plain(link.holderName)}|${link.createdAt.slice(0, 16)}`
          : `link:${link.id}`;
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, { key, name: link.holderName, phone: link.holderPhone, links: [link] });
    } else {
      group.links.push(link);
    }
  }
  return [...groups.values()].map((group) => ({ ...group, links: [...group.links].sort((a, b) => a.number - b.number) }));
}

/** The words of a ticket message: the event's kind decides them (ADR 0086). */
export interface MessageWords {
  hello: (name: string | null) => string;
  one: (event: string) => string;
  many: (count: number, event: string) => string;
  numberLine: (number: string, category: string | null) => string;
  tip: string;
}

/**
 * The WhatsApp message of `links`: one link alone, or one line per ticket with its number and
 * category, so a family knows whose is whose.
 */
export function ticketsMessage(
  words: MessageWords,
  name: string | null,
  event: string,
  links: readonly Pick<TicketLinkDto, "numberLabel" | "url" | "categoryId">[],
  categoryName: (id: string | null) => string | null,
): string {
  const first = links[0];
  if (links.length === 1 && first !== undefined) {
    return `${words.hello(name)} ${words.one(event)}\n${first.url}\n\n${words.tip}`;
  }
  const lines = links.map((link) => `${words.numberLine(link.numberLabel, categoryName(link.categoryId))}\n${link.url}`);
  return `${words.hello(name)} ${words.many(links.length, event)}\n\n${lines.join("\n\n")}\n\n${words.tip}`;
}

// Phones ----------------------------------------------------------------------------------------

/**
 * A WhatsApp number as typed, to digits with the country code, by the server's rule
 * (`normalize_whatsapp` in organization.rs): `null` when blank, `false` when it cannot be one.
 */
export function normalizePhone(text: string): string | null | false {
  const value = text.trim();
  if (value === "") {
    return null;
  }
  if ([...value].some((char) => !/[0-9 ()\-.+]/.test(char))) {
    return false;
  }
  const international = value.startsWith("+");
  let digits = value.replace(/\D/g, "");
  if (!international) {
    digits = digits.replace(/^0+/, "");
    if (digits.length === 10 || digits.length === 11) {
      digits = `55${digits}`;
    }
  }
  const brazilian = digits.startsWith("55") && digits.length >= 12 && digits.length <= 13;
  return brazilian || (international && digits.length >= 10 && digits.length <= 15) ? digits : false;
}

// Importing a form's answers --------------------------------------------------------------------

export type ImportField = "name" | "phone" | "category" | "quantity" | "note";
export const IMPORT_FIELDS: readonly ImportField[] = ["name", "phone", "category", "quantity", "note"];

/**
 * Words of a header cell for each field, tried in this order: "Quantidade de ingressos" is a
 * quantity and "Comprovante do ingresso" a note before either is a category. A word matches the
 * start of a word of the cell.
 */
const FIELD_WORDS: readonly (readonly [ImportField, readonly string[]])[] = [
  ["quantity", ["quantidade", "qtd", "qtde", "quantos", "quantas"]],
  ["phone", ["whatsapp", "whats", "zap", "telefone", "celular", "fone", "contato", "phone"]],
  ["note", ["observ", "obs", "comprovante", "pagamento", "pix", "nota"]],
  ["name", ["nome", "name", "comprador", "compradora", "participante", "responsavel"]],
  ["category", ["ingresso", "ingressos", "categoria", "tipo", "opcao", "dia", "dias", "pacote", "modalidade", "setor", "ficha", "produto"]],
];

/** A sheet read from a pasted text or a file. */
export interface Sheet {
  /** The header's cells, or `Coluna 1`, `Coluna 2`… without one. */
  columns: string[];
  rows: string[][];
  /** The first line was a header. */
  header: boolean;
}

export type ColumnMap = Partial<Record<ImportField, number>>;

/** The columns each field is guessed to be in, from the header's words. */
export function guessColumns(header: readonly string[]): ColumnMap {
  const found: ColumnMap = {};
  const taken = new Set<number>();
  for (const [field, words] of FIELD_WORDS) {
    const index = header.findIndex((cell, at) => {
      if (taken.has(at)) {
        return false;
      }
      const tokens = plain(cell).split(/[^a-z0-9]+/);
      return tokens.some((token) => words.some((word) => token.startsWith(word)));
    });
    if (index !== -1) {
      found[field] = index;
      taken.add(index);
    }
  }
  return found;
}

/**
 * A pasted text (cells copied from Google Sheets come with tabs) or a CSV file (Google Forms
 * downloads commas; Excel in Portuguese, semicolons). `null` when there is nothing to read.
 */
export function readSheet(text: string, file: boolean, columnLabel: (index: number) => string): Sheet | null {
  const delimiter = delimiterOf(text, file) ?? (file ? "," : "\t");
  const rows = splitDelimited(text, delimiter)
    .map((row) => row.map((cell) => cell.replace(/\s+/g, " ").trim()))
    .filter((row) => row.some((cell) => cell !== ""));
  const first = rows[0];
  if (first === undefined) {
    return null;
  }
  const width = Math.max(...rows.map((row) => row.length));
  const guessed = guessColumns(first);
  const header = guessed.name !== undefined || Object.keys(guessed).length >= 2;
  const columns = Array.from({ length: width }, (_, index) => (header ? first[index] || columnLabel(index) : columnLabel(index)));
  return { columns, rows: header ? rows.slice(1) : rows, header };
}

/** Columns of a sheet without a header: name, then WhatsApp, then the ticket. */
export function defaultColumns(sheet: Sheet): ColumnMap {
  if (sheet.header) {
    return guessColumns(sheet.columns);
  }
  const map: ColumnMap = { name: 0 };
  if (sheet.columns.length > 1) {
    map.phone = 1;
  }
  if (sheet.columns.length > 2) {
    map.category = 2;
  }
  return map;
}

/** Words that do not tell categories apart. */
const FILLER = new Set(["de", "do", "da", "dos", "das", "e", "o", "a", "r", "rs", "r$", "para", "por"]);

function tokens(text: string): Set<string> {
  // "c/" is "com" and "s/" is "sem": the difference between dinner and none.
  const words = plain(text)
    .replace(/\bc\//g, "com ")
    .replace(/\bs\//g, "sem ")
    .replace(/\+/g, " e ")
    .split(/[^a-z0-9]+/)
    .filter((word) => word !== "" && !FILLER.has(word) && !/^\d+([.,]\d+)?$/.test(word));
  return new Set(words);
}

/**
 * The category an answer means: the same name, or the one sharing most words (at least half of
 * both, and only one such). "Sábado com janta - R$ 80" finds "Sábado com janta" and never
 * "Sábado sem janta".
 */
export function matchCategory<T extends { id: string; name: string }>(answer: string, categories: readonly T[]): T | null {
  const value = plain(answer);
  if (value === "") {
    return null;
  }
  const exact = categories.find((category) => plain(category.name) === value);
  if (exact !== undefined) {
    return exact;
  }
  const words = tokens(answer);
  let best: T | null = null;
  let bestScore = 0;
  let tie = false;
  for (const category of categories) {
    const own = tokens(category.name);
    if (own.size === 0) {
      continue;
    }
    const shared = [...own].filter((word) => words.has(word)).length;
    // Every word of the category in the answer, or most words of both.
    const score = shared === own.size ? 1 + shared / Math.max(words.size, 1) : shared / Math.max(own.size, words.size);
    if (score > bestScore) {
      best = category;
      bestScore = score;
      tie = false;
    } else if (score === bestScore) {
      tie = true;
    }
  }
  return best !== null && !tie && bestScore >= 0.5 ? best : null;
}

/** One answer of the form, read. */
export interface ImportRow {
  /** Line in the sheet as people count them (the header is line 1). */
  line: number;
  name: string | null;
  /** Digits with the country code; `null` when blank or unreadable (see `phoneInvalid`). */
  phone: string | null;
  phoneInvalid: boolean;
  quantity: number;
  quantityInvalid: boolean;
  /** The answer in the category column, as typed. */
  answer: string;
  note: string | null;
}

/** "2", "2 ingressos", blank → 1; anything else is invalid. */
function quantityOf(cell: string): number | null {
  const text = cell.trim();
  if (text === "") {
    return 1;
  }
  const match = /^(\d{1,3})\b/.exec(text);
  const value = match === null ? Number.NaN : Number(match[1]);
  return Number.isInteger(value) && value >= 1 && value <= MAX_ORDER_QUANTITY ? value : null;
}

const MAX_NAME = 80;
const MAX_NOTE = 200;

function cut(text: string, max: number): string | null {
  const value = [...text.trim()].slice(0, max).join("").trim();
  return value === "" ? null : value;
}

/** Each answer of `sheet` with the columns of `map`; rows without a name nor a phone are skipped. */
export function importRows(sheet: Sheet, map: ColumnMap): ImportRow[] {
  const cell = (row: readonly string[], field: ImportField) => {
    const at = map[field];
    return at === undefined ? "" : (row[at] ?? "");
  };
  const offset = sheet.header ? 2 : 1;
  const rows: ImportRow[] = [];
  sheet.rows.forEach((row, index) => {
    const name = cut(cell(row, "name"), MAX_NAME);
    const phoneText = cell(row, "phone");
    const phone = normalizePhone(phoneText);
    if (name === null && phone === null) {
      return;
    }
    const quantity = quantityOf(cell(row, "quantity"));
    rows.push({
      line: index + offset,
      name,
      phone: phone === false ? null : phone,
      phoneInvalid: phone === false,
      quantity: quantity ?? 1,
      quantityInvalid: quantity === null,
      answer: cell(row, "category").trim(),
      note: cut(cell(row, "note"), MAX_NOTE),
    });
  });
  return rows;
}

/** The answers of the category column, each once, in the order they first appear. */
export function distinctAnswers(rows: readonly ImportRow[]): string[] {
  const seen = new Map<string, string>();
  for (const row of rows) {
    const key = plain(row.answer);
    if (!seen.has(key)) {
      seen.set(key, row.answer);
    }
  }
  return [...seen.values()];
}

/** Whether `row` looks like someone who already has a ticket: the same WhatsApp or name. */
export function alreadyHas(row: Pick<ImportRow, "name" | "phone">, links: readonly TicketLinkDto[]): boolean {
  const name = row.name === null ? null : plain(row.name);
  return links.some(
    (link) =>
      link.revokedAt === null &&
      ((row.phone !== null && link.holderPhone === row.phone) || (name !== null && link.holderName !== null && plain(link.holderName) === name)),
  );
}

/** Tickets asked per category (`null`: outside every category), to compare with what is free. */
export function demand(orders: readonly { categoryId: string | null; quantity: number }[]): Map<string | null, number> {
  const totals = new Map<string | null, number>();
  for (const order of orders) {
    totals.set(order.categoryId, (totals.get(order.categoryId) ?? 0) + order.quantity);
  }
  return totals;
}
