/**
 * The ticket design rules of crates/render/src/design.rs, checked in the editor as the user types
 * (the server checks them again on save). Messages come from `texts.event.design.issues`.
 */

import type { FontChoice, TextBlock, TicketDesign } from "@ingressoimpresso/api-types";

import { texts } from "@/texts/pt-BR";

export const BLEED_MM = 3;
export const MIN_QR_SIZE_MM = 22;
export const BODY_WIDTH_MM = [40, 300] as const;
export const BODY_HEIGHT_MM = [20, 200] as const;
export const STUB_WIDTH_MM = [20, 120] as const;
export const NUMBER_SIZE_PT = [4, 300] as const;
export const TEXT_SIZE_PT = [3, 200] as const;
export const LETTER_SPACING_EM = [-0.1, 1] as const;
export const MAX_TEXT_BLOCKS = 8;
export const MAX_TEXT_CHARS = 200;
export const MAX_TEXT_LINES = 4;
export const MAX_DIGITS = 10;
export const MAX_PREFIX_CHARS = 12;
export const MAX_STUB_FIELDS = 4;
export const MAX_STUB_FIELD_CHARS = 24;
const STUB_BASE_HEIGHT_MM = 15.1;
const STUB_FIELD_HEIGHT_MM = 7.6;
/** Usable A4 area for home printing (crates/render/src/layout.rs). */
const A4_USABLE_MM = [190, 277] as const;
/** Millimetres per typographic point. */
export const MM_PER_PT = 25.4 / 72;

/** CSS families of the ticket typefaces (globals.css). */
export const FONT_FAMILIES: Record<FontChoice, string> = {
  display: '"Ticket Bebas Neue"',
  mono: '"Ticket Space Mono"',
  sans: '"Ticket Lato"',
  condensed: '"Ticket Anton"',
  serif: '"Ticket Abril Fatface"',
  script: '"Ticket Great Vibes"',
  casual: '"Ticket Pacifico"',
  slab: '"Ticket Alfa Slab One"',
};

/** Typefaces with a real bold variant. */
export const FONTS_WITH_BOLD: readonly FontChoice[] = ["sans", "mono"];

/** What an issue points at, to highlight it on the canvas. */
export type IssueTarget = { kind: "body" } | { kind: "number" } | { kind: "qr" } | { kind: "stub" } | { kind: "text"; index: number };

export interface DesignIssue {
  message: string;
  target: IssueTarget;
}

const within = (value: number, [min, max]: readonly [number, number]) => Number.isFinite(value) && value >= min && value <= max;
const isHexColor = (value: string) => /^#[0-9a-fA-F]{6}$/.test(value);

/** Whether a box lies entirely inside the body. */
export function insideBody(design: TicketDesign, x: number, y: number, width: number, height: number): boolean {
  return (
    [x, y, width, height].every(Number.isFinite) &&
    x >= 0 &&
    y >= 0 &&
    width > 0 &&
    height > 0 &&
    x + width <= design.widthMm + 1e-9 &&
    y + height <= design.heightMm + 1e-9
  );
}

/** Smallest ticket height that leaves room for the stub's fields. */
export function stubMinHeight(design: TicketDesign): number | null {
  if (design.stub === null) {
    return null;
  }
  return Math.round((STUB_BASE_HEIGHT_MM + STUB_FIELD_HEIGHT_MM * design.stub.fields.length) * 10) / 10;
}

/** Whether `width × height` fits an A4 sheet at least once, upright or turned. */
export function fitsA4(width: number, height: number): boolean {
  const [w, h] = A4_USABLE_MM;
  return (width <= w && height <= h) || (height <= w && width <= h);
}

function textIssues(design: TicketDesign, block: TextBlock, index: number): DesignIssue[] {
  const m = texts.event.design.issues;
  const target: IssueTarget = { kind: "text", index };
  const issues: DesignIssue[] = [];
  if ([...block.text].length > MAX_TEXT_CHARS) {
    issues.push({ message: m.textTooLong(index + 1, MAX_TEXT_CHARS), target });
  }
  if (!insideBody(design, block.xMm, block.yMm, block.widthMm, block.heightMm)) {
    issues.push({ message: m.textOutside(index + 1), target });
  }
  if (
    !within(block.sizePt, TEXT_SIZE_PT) ||
    !Number.isInteger(block.lines) ||
    block.lines < 1 ||
    block.lines > MAX_TEXT_LINES ||
    !within(block.letterSpacing, LETTER_SPACING_EM)
  ) {
    issues.push({ message: m.textStyle(index + 1), target });
  }
  if (!isHexColor(block.color)) {
    issues.push({ message: m.color, target });
  }
  return issues;
}

/** Every rule the design breaks, in the editor's order. */
export function designIssues(design: TicketDesign): DesignIssue[] {
  const m = texts.event.design.issues;
  const issues: DesignIssue[] = [];
  const body: IssueTarget = { kind: "body" };
  if (!within(design.widthMm, BODY_WIDTH_MM) || !within(design.heightMm, BODY_HEIGHT_MM)) {
    issues.push({ message: m.bodySize(BODY_WIDTH_MM, BODY_HEIGHT_MM), target: body });
  } else if (!fitsA4(design.widthMm + (design.stub?.widthMm ?? 0), design.heightMm)) {
    issues.push({ message: m.a4, target: body });
  }
  if (!isHexColor(design.backgroundColor)) {
    issues.push({ message: m.color, target: body });
  }
  const n = design.number;
  const number: IssueTarget = { kind: "number" };
  if (!insideBody(design, n.xMm, n.yMm, n.widthMm, n.heightMm)) {
    issues.push({ message: m.numberOutside, target: number });
  }
  if (!within(n.sizePt, NUMBER_SIZE_PT)) {
    issues.push({ message: m.numberSize(NUMBER_SIZE_PT), target: number });
  }
  if (!Number.isInteger(n.digits) || n.digits < 1 || n.digits > MAX_DIGITS) {
    issues.push({ message: m.digits(MAX_DIGITS), target: number });
  }
  if ([...n.prefix].length > MAX_PREFIX_CHARS) {
    issues.push({ message: m.prefix(MAX_PREFIX_CHARS), target: number });
  }
  if (!isHexColor(n.color)) {
    issues.push({ message: m.color, target: number });
  }
  const q = design.qr;
  if (!(q.sizeMm >= MIN_QR_SIZE_MM)) {
    issues.push({ message: m.qrSmall(MIN_QR_SIZE_MM), target: { kind: "qr" } });
  }
  if (!insideBody(design, q.xMm, q.yMm, q.sizeMm, q.sizeMm)) {
    issues.push({ message: m.qrOutside, target: { kind: "qr" } });
  }
  const stub = design.stub;
  if (stub !== null) {
    const target: IssueTarget = { kind: "stub" };
    if (!within(stub.widthMm, STUB_WIDTH_MM)) {
      issues.push({ message: m.stubWidth(STUB_WIDTH_MM), target });
    }
    if (stub.fields.length > MAX_STUB_FIELDS || stub.fields.some((field) => [...field].length > MAX_STUB_FIELD_CHARS)) {
      issues.push({ message: m.stubFields(MAX_STUB_FIELDS, MAX_STUB_FIELD_CHARS), target });
    }
    const minHeight = stubMinHeight(design);
    if (minHeight !== null && design.heightMm < minHeight) {
      issues.push({ message: m.stubTooShort(minHeight), target });
    }
  }
  if (design.texts.length > MAX_TEXT_BLOCKS) {
    issues.push({ message: m.tooManyTexts(MAX_TEXT_BLOCKS), target: body });
  }
  design.texts.forEach((block, index) => {
    issues.push(...textIssues(design, block, index));
  });
  return issues;
}
