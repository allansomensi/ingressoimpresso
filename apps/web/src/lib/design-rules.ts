/**
 * The ticket design rules of crates/render/src/design.rs, checked in the editor as the user types
 * (the server checks them again on save). Messages come from `ticketCanvasTexts.issues`.
 */

import type { BandEdge, BandStyle, EventKind, FontChoice, PhotoLayer, SponsorStrip, TextBlock, TicketDesign } from "@ingressoimpresso/api-types";

import { forKind } from "@/lib/event-kind";
import { ticketCanvas as ticketCanvasTexts } from "@/texts/pt-BR/ticket-canvas";

type IssueTexts = typeof ticketCanvasTexts.issues;

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
export const BAND_SIZE_MM = [4, 20] as const;
/** Thickness of the band placed automatically when the design has none (ADR 0056). */
export const AUTO_BAND_MM = 6;
/** Band colour of a ticket with a seat and no category (render.rs `SEAT_BAND_COLOR`). */
export const SEAT_BAND_COLOR = "#1f1d2b";
/** Smallest sponsor strip and its text (design.rs, ADR 0059). */
export const SPONSORS_MIN_MM = [15, 6] as const;
export const MAX_SPONSOR_LABEL_CHARS = 24;
export const MAX_SPONSORS = 6;
/** Most photos over the art and their smallest side (design.rs, ADR 0121). */
export const MAX_PHOTOS = 4;
export const PHOTO_MIN_MM = 3;
const STUB_BASE_HEIGHT_MM = 15.1;
const STUB_FIELD_HEIGHT_MM = 7.6;
/** Height of the stub's picture and the gap that comes with it (design.rs, ADR 0121). */
export const STUB_IMAGE_HEIGHT_MM = [5, 40] as const;
const STUB_IMAGE_GAP_MM = 1.6;
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
  classic: '"Ticket EB Garamond"',
  roman: '"Ticket Cinzel"',
};

/** Typefaces with a real bold variant. */
export const FONTS_WITH_BOLD: readonly FontChoice[] = ["sans", "mono", "classic", "roman"];

/** Typefaces with a real italic variant. */
export const FONTS_WITH_ITALIC: readonly FontChoice[] = ["classic"];

/** What an issue points at, to highlight it on the canvas. */
export type IssueTarget =
  | { kind: "body" }
  | { kind: "number" }
  | { kind: "qr" }
  | { kind: "stub" }
  | { kind: "sponsors" }
  | { kind: "photo"; index: number }
  | { kind: "text"; index: number };

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

/** Smallest ticket height that leaves room for the stub's fields and picture. */
export function stubMinHeight(design: TicketDesign): number | null {
  if (design.stub === null) {
    return null;
  }
  const image = design.stub.image ?? null;
  const picture = image === null ? 0 : image.heightMm + STUB_IMAGE_GAP_MM;
  return Math.round((STUB_BASE_HEIGHT_MM + STUB_FIELD_HEIGHT_MM * design.stub.fields.length + picture) * 10) / 10;
}

/** Whether `width × height` fits an A4 sheet at least once, upright or turned. */
export function fitsA4(width: number, height: number): boolean {
  const [w, h] = A4_USABLE_MM;
  return (width <= w && height <= h) || (height <= w && width <= h);
}

function textIssues(m: IssueTexts, design: TicketDesign, block: TextBlock, index: number): DesignIssue[] {
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

/** Every rule the design breaks, in the editor's order ("ficha" for consumption tokens). */
export function designIssues(design: TicketDesign, kind?: EventKind): DesignIssue[] {
  const m = forKind(ticketCanvasTexts, ticketCanvasTexts.tokens, kind).issues;
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
    const image = stub.image ?? null;
    if (image !== null && !within(image.heightMm, STUB_IMAGE_HEIGHT_MM)) {
      issues.push({ message: m.stubImage(STUB_IMAGE_HEIGHT_MM), target });
    } else if (minHeight !== null && design.heightMm < minHeight) {
      issues.push({ message: m.stubTooShort(minHeight), target });
    }
  }
  const strip = design.sponsors ?? null;
  if (strip !== null) {
    const target: IssueTarget = { kind: "sponsors" };
    if (!insideBody(design, strip.xMm, strip.yMm, strip.widthMm, strip.heightMm)) {
      issues.push({ message: m.sponsorsOutside, target });
    }
    if (
      strip.widthMm < SPONSORS_MIN_MM[0] ||
      strip.heightMm < SPONSORS_MIN_MM[1] ||
      [...strip.label].length > MAX_SPONSOR_LABEL_CHARS ||
      overlaps(rectOf(strip), { x: q.xMm, y: q.yMm, width: q.sizeMm, height: q.sizeMm })
    ) {
      issues.push({ message: m.sponsors(SPONSORS_MIN_MM, MAX_SPONSOR_LABEL_CHARS), target });
    }
    if (!isHexColor(strip.labelColor)) {
      issues.push({ message: m.color, target });
    }
  }
  const band = design.band ?? null;
  if (band !== null) {
    if (!within(band.sizeMm, BAND_SIZE_MM)) {
      issues.push({ message: m.bandSize(BAND_SIZE_MM), target: body });
    } else if (bandCoversQr(design, band.edge, band.sizeMm)) {
      issues.push({ message: m.bandOverQr, target: { kind: "qr" } });
    }
  }
  if (design.photos.length > MAX_PHOTOS) {
    issues.push({ message: m.photos(MAX_PHOTOS, PHOTO_MIN_MM), target: body });
  }
  design.photos.forEach((photo, index) => {
    const target: IssueTarget = { kind: "photo", index };
    if (!insideBody(design, photo.xMm, photo.yMm, photo.widthMm, photo.heightMm)) {
      issues.push({ message: m.photoOutside(index + 1), target });
    }
    if (photo.widthMm < PHOTO_MIN_MM || photo.heightMm < PHOTO_MIN_MM) {
      issues.push({ message: m.photos(MAX_PHOTOS, PHOTO_MIN_MM), target });
    }
  });
  if (design.texts.length > MAX_TEXT_BLOCKS) {
    issues.push({ message: m.tooManyTexts(MAX_TEXT_BLOCKS), target: body });
  }
  design.texts.forEach((block, index) => {
    issues.push(...textIssues(m, design, block, index));
  });
  return issues;
}

/** The rectangle of a band of `sizeMm` along `edge` (design.rs `band_rect`). */
export function bandRect(design: TicketDesign, edge: BandEdge, sizeMm: number): { x: number; y: number; width: number; height: number } {
  switch (edge) {
    case "top":
      return { x: 0, y: 0, width: design.widthMm, height: sizeMm };
    case "bottom":
      return { x: 0, y: design.heightMm - sizeMm, width: design.widthMm, height: sizeMm };
    case "left":
      return { x: 0, y: 0, width: sizeMm, height: design.heightMm };
    case "right":
      return { x: design.widthMm - sizeMm, y: 0, width: sizeMm, height: design.heightMm };
  }
}

type Rect = { x: number; y: number; width: number; height: number };

function rectOf(box: { xMm: number; yMm: number; widthMm: number; heightMm: number }): Rect {
  return { x: box.xMm, y: box.yMm, width: box.widthMm, height: box.heightMm };
}

/** Whether two rectangles share any area (design.rs `overlaps`). */
function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** Whether a band would touch the QR (design.rs `band_covers_qr`). */
export function bandCoversQr(design: TicketDesign, edge: BandEdge, sizeMm: number): boolean {
  const q = design.qr;
  return overlaps(bandRect(design, edge, sizeMm), { x: q.xMm, y: q.yMm, width: q.sizeMm, height: q.sizeMm });
}

function bandCoversSponsors(design: TicketDesign, edge: BandEdge, sizeMm: number): boolean {
  const strip = design.sponsors ?? null;
  return strip !== null && overlaps(bandRect(design, edge, sizeMm), rectOf(strip));
}

/** The band printed on tickets with a category or a seat (design.rs `effective_band`). */
export function effectiveBand(design: TicketDesign): BandStyle | null {
  const band = design.band ?? null;
  if (band !== null) {
    return band;
  }
  const edges = ["bottom", "top", "right", "left"] as const;
  // Clear of the QR, and of the sponsors when an edge allows.
  const edge =
    edges.find((item) => !bandCoversQr(design, item, AUTO_BAND_MM) && !bandCoversSponsors(design, item, AUTO_BAND_MM)) ??
    edges.find((item) => !bandCoversQr(design, item, AUTO_BAND_MM));
  return edge === undefined ? null : { edge, sizeMm: AUTO_BAND_MM };
}

/** Radius of a photo's corners, from its shape and shorter side (design.rs `corner_radius_mm`). */
export function photoRadius(photo: PhotoLayer): number {
  const short = Math.min(photo.widthMm, photo.heightMm);
  switch (photo.shape) {
    case "square":
      return 0;
    case "rounded":
      return short * 0.15;
    case "round":
      return short / 2;
  }
}

/**
 * A new photo of `aspect` (width ÷ height): half the ticket's height, centred, kept inside the
 * body. A picture wider than the ticket allows is narrowed and keeps its shape.
 */
export function newPhoto(design: TicketDesign, aspect: number): PhotoLayer {
  const ratio = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  let height = Math.max(PHOTO_MIN_MM, Math.round(design.heightMm * 0.6 * 2) / 2);
  let width = height * ratio;
  const room = design.widthMm * 0.6;
  if (width > room) {
    width = room;
    height = Math.max(PHOTO_MIN_MM, width / ratio);
  }
  width = Math.max(PHOTO_MIN_MM, Math.round(width * 2) / 2);
  height = Math.min(design.heightMm, Math.round(height * 2) / 2);
  return {
    xMm: Math.round(((design.widthMm - width) / 2) * 2) / 2,
    yMm: Math.round(((design.heightMm - height) / 2) * 2) / 2,
    widthMm: width,
    heightMm: height,
    fit: "cover",
    shape: "rounded",
  };
}

/** `photo` reshaped to `aspect` (width ÷ height) inside the same box, centred on it. */
export function photoToAspect(photo: PhotoLayer, aspect: number): PhotoLayer {
  if (!(Number.isFinite(aspect) && aspect > 0)) {
    return photo;
  }
  const round = (value: number) => Math.round(value * 100) / 100;
  const fitsWidth = photo.widthMm / photo.heightMm <= aspect;
  const width = fitsWidth ? photo.widthMm : photo.heightMm * aspect;
  const height = fitsWidth ? photo.widthMm / aspect : photo.heightMm;
  return {
    ...photo,
    xMm: round(photo.xMm + (photo.widthMm - width) / 2),
    yMm: round(photo.yMm + (photo.heightMm - height) / 2),
    widthMm: round(width),
    heightMm: round(height),
  };
}

/** Photos kept inside a body of another size (a template applied): shrunk if needed, pulled in. */
export function photosInside(photos: readonly PhotoLayer[], design: TicketDesign): PhotoLayer[] {
  return photos.map((photo) => {
    const scale = Math.min(1, design.widthMm / photo.widthMm, design.heightMm / photo.heightMm);
    const widthMm = Math.max(PHOTO_MIN_MM, Math.floor(photo.widthMm * scale * 100) / 100);
    const heightMm = Math.max(PHOTO_MIN_MM, Math.floor(photo.heightMm * scale * 100) / 100);
    return {
      ...photo,
      widthMm,
      heightMm,
      xMm: Math.min(Math.max(0, photo.xMm), Math.max(0, design.widthMm - widthMm)),
      yMm: Math.min(Math.max(0, photo.yMm), Math.max(0, design.heightMm - heightMm)),
    };
  });
}

/** Black or white, whichever reads better on `color` (render.rs `ink_for`). */
export function inkFor(color: string): string {
  const channel = (start: number) => (Number.parseInt(color.slice(start, start + 2), 16) || 0) / 255;
  const luminance = 0.2126 * channel(1) ** 2.2 + 0.7152 * channel(3) ** 2.2 + 0.0722 * channel(5) ** 2.2;
  // The ink with the higher WCAG contrast ratio: white wins while (L + 0.05)² < 1.05 × 0.05, that
  // is, up to a luminance near 0.18 (an orange or a mid green already read better in black).
  return luminance > 0.18 ? "#111111" : "#ffffff";
}

/** A sponsor strip that fits the design: beside the QR along the bottom, else along the top. */
export function defaultSponsorStrip(design: TicketDesign, label: string): SponsorStrip {
  const q = design.qr;
  const height = Math.max(SPONSORS_MIN_MM[1], Math.min(12, Math.round(design.heightMm * 0.22)));
  const qrOnRight = q.xMm + q.sizeMm / 2 > design.widthMm / 2;
  const x = qrOnRight ? 5 : Math.min(design.widthMm - SPONSORS_MIN_MM[0] - 5, q.xMm + q.sizeMm + 4);
  const width = Math.max(SPONSORS_MIN_MM[0], qrOnRight ? q.xMm - 4 - x : design.widthMm - 5 - x);
  const bottom = { xMm: x, yMm: design.heightMm - height - 3, widthMm: width, heightMm: height };
  const clearOfQr = !overlaps(rectOf(bottom), { x: q.xMm, y: q.yMm, width: q.sizeMm, height: q.sizeMm });
  const placed = clearOfQr ? bottom : { ...bottom, yMm: 3 };
  return { ...placed, label, labelColor: "#555555", panel: false };
}
