/**
 * The setup assistant (ADR 0126): how an event sells (one ticket, inteira and meia, sectors,
 * days), the types it has and how many numbers each takes, and the extras (a dinner, a kit) that
 * one door link hands over. The answers become `POST /api/events/{id}/setup`, checked here with
 * the API's rules so the assistant points at a mistake before sending.
 */
import type { DayRule, EventDayDto, EventKind, EventSetupBody } from "@ingressoimpresso/api-types";

import { CATEGORY_COLORS, presetPriceText } from "@/lib/categories";
import { wallClock } from "@/lib/event-time";
import { parseMoney } from "@/lib/format";
import { eventDays as dayTexts } from "@/texts/pt-BR/event-days";

export const MAX_TYPES = 12;
export const MAX_EXTRAS = 10;
export const MAX_QUANTITY = 10_000;
export const MAX_TOTAL = 50_000;
export const MAX_NAME = 30;
export const MAX_NOTE = 80;
export const MAX_INSTRUCTION = 60;
export const MAX_ALLOWANCE = 20;

export type Recipe = "single" | "half" | "vip" | "days" | "products" | "custom";

/** A type of ticket (a category) as the assistant edits it. */
export interface SetupType {
  key: string;
  name: string;
  color: string;
  /** Reais as typed; `""`: the event's price. */
  priceText: string;
  quantityText: string;
  dayRule: DayRule;
  validDays: number[];
  document: boolean;
  documentNote: string;
  instruction: string;
}

/** Something handed over apart (a checkpoint): who has the right, once or once a day. */
export interface SetupExtra {
  key: string;
  name: string;
  instruction: string;
  perDay: boolean;
  allowance: number;
  /** Keys of the entitled types. */
  types: string[];
}

export interface SetupDraft {
  recipe: Recipe | null;
  types: SetupType[];
  extras: SetupExtra[];
}

/** The words a recipe needs: names of the types and the meia's documents. */
export interface RecipeWords {
  single: string;
  full: string;
  half: string;
  pista: string;
  vip: string;
  pass: string;
  products: readonly string[];
  halfNote: string;
}

let counter = 0;
/** A key for a new type or extra (React keys, references from extras). */
export function newKey(prefix: string): string {
  counter += 1;
  return `${prefix}-${String(counter)}`;
}

/** The recipes offered to an event: tokens sell products; days only with several days. */
export function recipesFor(kind: EventKind, days: number): Recipe[] {
  if (kind === "tokens") {
    return ["single", "products", "custom"];
  }
  return days > 1 ? ["single", "half", "vip", "days", "custom"] : ["single", "half", "vip", "custom"];
}

/** "Sábado", "Domingo"… for a day; "Dia 2" when two days share a weekday. */
export function dayName(days: readonly Pick<EventDayDto, "startsAt" | "position">[], position: number): string {
  const weekday = (day: Pick<EventDayDto, "startsAt">) => dayTexts.weekdays[wallClock(day.startsAt).weekday] ?? "";
  const day = days.find((item) => item.position === position);
  if (day === undefined) {
    return `Dia ${String(position)}`;
  }
  const name = weekday(day);
  const repeated = days.filter((item) => weekday(item) === name).length > 1;
  return repeated || name === "" ? `Dia ${String(position)}` : name.charAt(0).toUpperCase() + name.slice(1);
}

function type(name: string, color: string, extra: Partial<SetupType> = {}): SetupType {
  return {
    key: newKey("type"),
    name,
    color,
    priceText: "",
    quantityText: "100",
    dayRule: "every",
    validDays: [],
    document: false,
    documentNote: "",
    instruction: "",
    ...extra,
  };
}

/** The types a recipe starts with. */
export function recipeTypes(recipe: Recipe, words: RecipeWords, eventPrice: number | null, days: readonly Pick<EventDayDto, "startsAt" | "position">[]): SetupType[] {
  const [blue, red, yellow, green, purple, orange, cyan] = CATEGORY_COLORS;
  switch (recipe) {
    case "single":
      return [type(words.single, blue, { quantityText: "200" })];
    case "half":
      return [
        type(words.full, blue, { quantityText: "150" }),
        type(words.half, red, { quantityText: "50", priceText: presetPriceText("half", eventPrice), document: true, documentNote: words.halfNote }),
      ];
    case "vip":
      return [type(words.pista, blue, { quantityText: "200" }), type(words.vip, yellow, { quantityText: "50" })];
    case "days": {
      const palette = [green, purple, orange, cyan, red, yellow];
      return [
        type(words.pass, blue, { quantityText: "100" }),
        ...days.map((day, index) => type(dayName(days, day.position), palette[index % palette.length] ?? blue, { quantityText: "100", dayRule: "days", validDays: [day.position] })),
      ].slice(0, MAX_TYPES);
    }
    case "products":
      return words.products.map((name, index) => type(name, CATEGORY_COLORS[index % CATEGORY_COLORS.length] ?? blue, { quantityText: "200" }));
    case "custom":
      return [type("", blue)];
  }
}

/** A new type with a colour not used yet. */
export function blankType(types: readonly SetupType[]): SetupType {
  const color = CATEGORY_COLORS.find((item) => !types.some((existing) => existing.color === item)) ?? CATEGORY_COLORS[0];
  return type("", color);
}

export function blankExtra(name: string, types: readonly SetupType[]): SetupExtra {
  return { key: newKey("extra"), name, instruction: "", perDay: true, allowance: 1, types: types.map((item) => item.key) };
}

/** A whole number from what was typed, or `null`. */
export function quantityOf(text: string): number | null {
  const clean = text.trim().replace(/\./g, "");
  return /^\d+$/.test(clean) ? Number(clean) : null;
}

/** The numbers each type takes: in a row from 1, in the order of the list. */
export function numberPlan(types: readonly SetupType[]): { key: string; first: number; last: number }[] {
  let next = 1;
  return types.map((item) => {
    const quantity = Math.max(quantityOf(item.quantityText) ?? 0, 0);
    const plan = { key: item.key, first: next, last: next + quantity - 1 };
    next += quantity;
    return plan;
  });
}

export type TypeIssue = "name" | "duplicate" | "price" | "quantity" | "days" | "note" | "instruction";
export type ExtraIssue = "name" | "duplicate" | "who" | "allowance" | "instruction";

export interface SetupIssues {
  types: Map<string, TypeIssue[]>;
  extras: Map<string, ExtraIssue[]>;
  /** More numbers than the API takes in all. */
  total: boolean;
}

/** What the API would refuse, by type and extra (`severalDays`: the day rule matters). */
export function setupIssues(draft: SetupDraft, severalDays: boolean): SetupIssues {
  const issues: SetupIssues = { types: new Map(), extras: new Map(), total: false };
  const names = (list: readonly { name: string }[]) => list.map((item) => item.name.trim().toLocaleLowerCase("pt-BR"));
  const typeNames = names(draft.types);
  let total = 0;
  draft.types.forEach((item, index) => {
    const found: TypeIssue[] = [];
    const name = item.name.trim();
    if (name === "" || name.length > MAX_NAME) {
      found.push("name");
    } else if (typeNames.indexOf(typeNames[index] ?? "") !== index) {
      found.push("duplicate");
    }
    const price = parseMoney(item.priceText);
    if (!price.ok || (price.cents !== null && price.cents > 100_000_000)) {
      found.push("price");
    }
    const quantity = quantityOf(item.quantityText);
    if (quantity === null || quantity < 1 || quantity > MAX_QUANTITY) {
      found.push("quantity");
    }
    total += quantity ?? 0;
    if (severalDays && item.dayRule === "days" && item.validDays.length === 0) {
      found.push("days");
    }
    if (item.document && item.documentNote.trim().length > MAX_NOTE) {
      found.push("note");
    }
    if (item.instruction.trim().length > MAX_INSTRUCTION) {
      found.push("instruction");
    }
    if (found.length > 0) {
      issues.types.set(item.key, found);
    }
  });
  issues.total = total > MAX_TOTAL;
  const extraNames = names(draft.extras);
  const keys = new Set(draft.types.map((item) => item.key));
  draft.extras.forEach((extra, index) => {
    const found: ExtraIssue[] = [];
    const name = extra.name.trim();
    if (name === "" || name.length > MAX_NAME) {
      found.push("name");
    } else if (extraNames.indexOf(extraNames[index] ?? "") !== index) {
      found.push("duplicate");
    }
    if (!extra.types.some((key) => keys.has(key))) {
      found.push("who");
    }
    if (!Number.isInteger(extra.allowance) || extra.allowance < 1 || extra.allowance > MAX_ALLOWANCE) {
      found.push("allowance");
    }
    if (extra.instruction.trim().length > MAX_INSTRUCTION) {
      found.push("instruction");
    }
    if (found.length > 0) {
      issues.extras.set(extra.key, found);
    }
  });
  return issues;
}

export function typesReady(issues: SetupIssues): boolean {
  return issues.types.size === 0 && !issues.total;
}

/** The request: the types in order, the extras pointing at them by place. */
export function setupBody(draft: SetupDraft, severalDays: boolean): EventSetupBody {
  const blank = (text: string) => (text.trim() === "" ? null : text.trim());
  return {
    categories: draft.types.map((item) => {
      const price = parseMoney(item.priceText);
      return {
        quantity: quantityOf(item.quantityText) ?? 0,
        category: {
          name: item.name.trim(),
          color: item.color,
          priceCents: price.ok ? price.cents : null,
          checkDocument: item.document,
          documentNote: item.document ? blank(item.documentNote) : null,
          doorInstruction: blank(item.instruction),
          ...(severalDays ? { dayRule: item.dayRule, validDays: item.dayRule === "days" ? [...item.validDays].sort((a, b) => a - b) : [] } : {}),
        },
      };
    }),
    checkpoints: draft.extras.map((extra) => ({
      name: extra.name.trim(),
      instruction: blank(extra.instruction),
      perDay: severalDays && extra.perDay,
      allowance: extra.allowance,
      categories: draft.types.flatMap((item, index) => (extra.types.includes(item.key) ? [index] : [])),
    })),
  };
}
