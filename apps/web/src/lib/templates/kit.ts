/**
 * What every template is made of: the palette and template types, the text, number and design
 * builders and the usual formats. The templates themselves live in catalog.ts and in one file per
 * theme (music.ts, celebrations.ts…), all listed by catalog.ts.
 */

import type { FontChoice, NumberStyle, StubStyle, TextBlock, TicketDesign } from "@ingressoimpresso/api-types";

import { ticketCanvas as ticketCanvasTexts } from "@/texts/pt-BR/ticket-canvas";
import { templates as templatesTexts } from "@/texts/pt-BR/templates";

export type TemplateCategory = keyof typeof templatesTexts.categories;
export type TemplateId = keyof typeof templatesTexts.items;

export interface Palette {
  id: string;
  /** Background. */
  bg: string;
  /** Main text. */
  ink: string;
  /** Secondary text. */
  muted: string;
  /** Highlights. */
  accent: string;
  /** Second highlight and decoration colours. */
  extra: readonly string[];
}

export interface TicketTemplate {
  id: TemplateId;
  categories: readonly TemplateCategory[];
  palettes: readonly Palette[];
  build: (palette: Palette) => { design: TicketDesign; background: string };
}

/** A text block with the usual defaults. */
export function block(text: string, x: number, y: number, width: number, height: number, style: Partial<TextBlock> = {}): TextBlock {
  return {
    text,
    xMm: x,
    yMm: y,
    widthMm: width,
    heightMm: height,
    font: "sans",
    sizePt: 10,
    color: "#111111",
    align: "left",
    lines: 1,
    bold: false,
    uppercase: false,
    letterSpacing: 0,
    ...style,
  };
}

export function number(x: number, y: number, width: number, height: number, font: FontChoice, sizePt: number, color: string, align: NumberStyle["align"] = "right"): NumberStyle {
  return { xMm: x, yMm: y, widthMm: width, heightMm: height, font, sizePt, color, align, prefix: "Nº ", digits: 4 };
}

export const STUB: StubStyle = { side: "left", widthMm: 40, fields: [...ticketCanvasTexts.defaultStubFields] };

export function design(
  width: number,
  height: number,
  bg: string,
  parts: { number: NumberStyle; qr: [number, number, number]; stub: StubStyle | null; texts: TextBlock[] },
): TicketDesign {
  const [x, y, size] = parts.qr;
  return {
    version: 1,
    widthMm: width,
    heightMm: height,
    backgroundColor: bg,
    number: parts.number,
    qr: { xMm: x, yMm: y, sizeMm: size },
    stub: parts.stub,
    texts: parts.texts,
    band: null,
    sponsors: null,
  };
}

/** The usual 150 × 55 mm ticket: texts on the left, number above the QR on the right. */
export const W = 150;
export const H = 55;
export const QR: [number, number, number] = [117, 19, 28];

/**
 * Consumption tokens (ADR 0084): 63 × 38 mm, 21 per A4 sheet. The product (`{categoria}`) in
 * large type, its price and the QR the stall reads; the category band runs down the left edge.
 */
export const TOKEN_W = 63;
export const TOKEN_H = 38;
export const TOKEN_QR: [number, number, number] = [37, 7, 22];
export const TOKEN_BAND = { edge: "left", sizeMm: 5 } as const;
