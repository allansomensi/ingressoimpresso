/**
 * Guest list rules of the panel (ADR 0070): pasting names one per line, "Nome +2" for
 * companions, importing a spreadsheet (CSV or cells pasted from Excel/Google Sheets) and the
 * filters of the list. The API checks the same limits.
 */
import type { GuestDto } from "@ingressoimpresso/api-types";

import { normalizeName } from "@/portaria/logic";

export const MAX_GUEST_NAME = 80;
export const MAX_COMPANIONS = 20;
export const MAX_GUEST_NOTE = 120;
/** Names sent in one paste (the API takes up to 500). */
export const MAX_PASTE = 500;

export interface ParsedGuest {
  name: string;
  companions: number;
}

/** Bullets and numbering a pasted list may carry: "- ", "• ", "1. ", "2) ". */
const LIST_MARK = /^(?:[-*•–]\s+|\d{1,3}[.)]\s+)/u;
/** "+2", "+ 2" or "(+2)" at the end of a line. */
const COMPANIONS = /\s*\(?\+\s*(\d+)\)?\s*$/u;

/**
 * Lines of a pasted list: blank lines are skipped, bullets dropped, "+N" read as companions.
 * Lines that break a limit are reported by their (1-based) line number.
 */
export function parseGuestLines(text: string): { guests: ParsedGuest[]; errors: number[] } {
  const guests: ParsedGuest[] = [];
  const errors: number[] = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    let line = raw.replace(/\s+/g, " ").trim().replace(LIST_MARK, "");
    if (line === "") {
      return;
    }
    let companions = 0;
    const match = COMPANIONS.exec(line);
    if (match !== null) {
      companions = Number(match[1]);
      line = line.slice(0, match.index).trim();
    }
    if (line === "" || [...line].length > MAX_GUEST_NAME || companions > MAX_COMPANIONS) {
      errors.push(index + 1);
      return;
    }
    guests.push({ name: line, companions });
  });
  return { guests, errors };
}

/** A guest read from a spreadsheet: also the note for the door and the category. */
export interface ImportedGuest extends ParsedGuest {
  note: string | null;
  categoryId: string | null;
}

export interface GuestImport {
  guests: ImportedGuest[];
  /** 1-based lines left out (a limit broken). */
  errors: number[];
  /** Read as a table (columns), not as one name per line. */
  table: boolean;
  /** Category names in the sheet that the event does not have (those guests go without one). */
  unknownCategories: string[];
}

/** Header words of each column (accents and case ignored). */
const HEADERS = {
  name: ["nome", "name", "convidado", "convidada", "nome completo", "participante", "formando", "formanda"],
  companions: ["acompanhantes", "acompanhante", "acomp", "extras", "mais", "+", "qtd acompanhantes"],
  note: ["observacao", "observacoes", "obs", "nota", "anotacao", "recado", "observacao para a porta"],
  category: ["categoria", "tipo", "setor", "category"],
} as const;
type Column = keyof typeof HEADERS;

function plain(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[:.]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Rows of a delimited text, with "quoted ""cells""" and line breaks inside quotes (RFC 4180). */
export function splitDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"' && cell.trim() === "") {
      quoted = true;
      cell = "";
    } else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") {
        index += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/**
 * The delimiter of a sheet, or `null` for a plain list: tabs (cells copied from a spreadsheet),
 * then semicolons (CSV saved by Excel in Portuguese) on most lines; commas only for a file, since
 * a pasted "Silva, Maria" is a name.
 */
function delimiterOf(text: string, file: boolean): string | null {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length === 0) {
    return null;
  }
  const most = (char: string) => lines.filter((line) => line.includes(char)).length * 2 >= lines.length;
  if (most("\t")) {
    return "\t";
  }
  if (most(";")) {
    return ";";
  }
  return file && most(",") ? "," : null;
}

/** The column of each header cell, when the first row is a header. */
function headerColumns(row: readonly string[]): Partial<Record<Column, number>> | null {
  const found: Partial<Record<Column, number>> = {};
  row.forEach((cell, index) => {
    const word = plain(cell);
    for (const column of Object.keys(HEADERS) as Column[]) {
      if (found[column] === undefined && (HEADERS[column] as readonly string[]).includes(word)) {
        found[column] = index;
      }
    }
  });
  return found.name === undefined ? null : found;
}

/** "2", "+2", "2 pessoas" → 2; blank → 0; anything else → NaN. */
function companionsOf(cell: string): number {
  const text = cell.trim();
  if (text === "") {
    return 0;
  }
  const match = /^\+?\s*(\d{1,3})\b/u.exec(text);
  return match === null ? Number.NaN : Number(match[1]);
}

/**
 * A pasted text or a CSV file as guests. A table is read by its header (Nome, Acompanhantes,
 * Observação, Categoria, in any order) or, without one, as name, companions and note; anything
 * else is the plain list of [`parseGuestLines`]. Categories are matched by name.
 */
export function parseGuestImport(
  text: string,
  categories: readonly { id: string; name: string }[] = [],
  file = false,
): GuestImport {
  const delimiter = delimiterOf(text, file);
  if (delimiter === null) {
    const lines = parseGuestLines(text);
    return { guests: lines.guests.map((guest) => ({ ...guest, note: null, categoryId: null })), errors: lines.errors, table: false, unknownCategories: [] };
  }
  const rows = splitDelimited(text, delimiter);
  const header = rows[0] === undefined ? null : headerColumns(rows[0]);
  const columns: Partial<Record<Column, number>> = header ?? { name: 0, companions: 1, note: 2 };
  const categoryByName = new Map(categories.map((category) => [plain(category.name), category.id]));
  const guests: ImportedGuest[] = [];
  const errors: number[] = [];
  const unknown = new Set<string>();
  // Line numbers as the person sees them in the sheet (the header is line 1).
  rows.forEach((row, index) => {
    if (header !== null && index === 0) {
      return;
    }
    const cell = (column: Column) => {
      const at = columns[column];
      return at === undefined ? "" : (row[at] ?? "").replace(/\s+/g, " ").trim();
    };
    let name = cell("name").replace(LIST_MARK, "");
    if (row.every((value) => value.trim() === "")) {
      return;
    }
    let companions = companionsOf(cell("companions"));
    // "Maria +2" in the name column, as in a plain list.
    const inline = COMPANIONS.exec(name);
    if (inline !== null && (companions === 0 || Number.isNaN(companions))) {
      companions = Number(inline[1]);
      name = name.slice(0, inline.index).trim();
    }
    // Without a header, a second column that is not a number is the note.
    let note = cell("note");
    if (header === null && Number.isNaN(companions)) {
      note = [cell("companions"), note].filter((part) => part !== "").join(" · ");
      companions = 0;
    }
    if (name === "" || [...name].length > MAX_GUEST_NAME || Number.isNaN(companions) || companions > MAX_COMPANIONS) {
      errors.push(index + 1);
      return;
    }
    const categoryName = cell("category");
    let categoryId: string | null = null;
    if (categoryName !== "") {
      categoryId = categoryByName.get(plain(categoryName)) ?? null;
      if (categoryId === null) {
        unknown.add(categoryName);
      }
    }
    guests.push({ name, companions, note: note === "" ? null : [...note].slice(0, MAX_GUEST_NOTE).join(""), categoryId });
  });
  return { guests, errors, table: true, unknownCategories: [...unknown] };
}

/**
 * The text of a CSV file: UTF-8, or Windows-1252 when it is not valid UTF-8 (what Excel saves
 * in Portuguese as "CSV (separado por vírgulas)").
 */
export async function readSheetFile(file: Blob): Promise<string> {
  const bytes = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** A sheet to fill in, with the columns the import reads (semicolons and a BOM, for Excel). */
export function guestSheetTemplate(rows: readonly (readonly string[])[]): Blob {
  const escape = (cell: string) => (/[;"\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell);
  const text = rows.map((row) => row.map(escape).join(";")).join("\r\n");
  return new Blob([`\uFEFF${text}\r\n`], { type: "text/csv;charset=utf-8" });
}

export type GuestFilter = "all" | "arrived" | "missing";

/** Guests matching the search (accents and case ignored) and the filter. */
export function filterGuests(guests: readonly GuestDto[], query: string, filter: GuestFilter): GuestDto[] {
  const words = normalizeName(query).split(" ").filter((word) => word !== "");
  return guests.filter((guest) => {
    if (filter === "arrived" && guest.arrival === null) {
      return false;
    }
    if (filter === "missing" && guest.arrival !== null) {
      return false;
    }
    const text = normalizeName(`${guest.name} ${guest.note ?? ""}`);
    return words.every((word) => text.includes(word));
  });
}

/** People on the list and people in. */
export function guestTotals(guests: readonly GuestDto[]): { names: number; people: number; arrivedNames: number; arrivedPeople: number } {
  return guests.reduce(
    (totals, guest) => ({
      names: totals.names + 1,
      people: totals.people + guest.companions + 1,
      arrivedNames: totals.arrivedNames + (guest.arrival === null ? 0 : 1),
      arrivedPeople: totals.arrivedPeople + (guest.arrival?.people ?? 0),
    }),
    { names: 0, people: 0, arrivedNames: 0, arrivedPeople: 0 },
  );
}
