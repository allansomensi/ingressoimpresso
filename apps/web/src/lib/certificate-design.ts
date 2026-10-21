/**
 * Certificate design rules (ADR 0114), mirrored from `crates/render/src/certificate_design.rs`
 * for the editor: page sizes, limits, the problems the server would refuse, and the geometry of
 * each kind of element. Change both sides together; `test/certificate-design.test.ts` and the
 * Rust tests use the same examples.
 */

import type {
  CertificateDesign,
  CertificateElement,
  CertificatePage,
  FontChoice,
  PageOrientation,
} from "@ingressoimpresso/api-types";

import type { Box } from "@/lib/design-selection";
import { MM_PER_PT } from "@/lib/design-rules";
import { certificateEditor as texts } from "@/texts/pt-BR/certificate-editor";

export const CERTIFICATE_DESIGN_VERSION = 1;
export const MAX_PAGE_ELEMENTS = 40;
export const MAX_CERTIFICATE_IMAGES = 8;
export const MIN_CERTIFICATE_QR_MM = 18;
export const MAX_TITLE_CHARS = 60;
export const MAX_TEXT_CHARS = 1500;
export const TEXT_SIZE_PT = [4, 120] as const;
export const LINE_HEIGHT = [1, 3] as const;
export const LETTER_SPACING_EM = [-0.1, 1] as const;
export const MIN_BOX_MM = 1;
export const MAX_SIGNER_NAME_CHARS = 60;
export const MAX_SIGNER_ROLE_CHARS = 80;
export const SIGNATURE_SIZE_PT = [5, 40] as const;
export const SEAL_SIZE_MM = [15, 90] as const;
export const MAX_SEAL_TEXT_CHARS = 40;
export const MAX_SEAL_CENTER_CHARS = 16;
export const LINE_THICKNESS_MM = [0.1, 5] as const;
export const SHAPE_RADIUS_MM = [0, 100] as const;
export const OPACITY = [0.05, 1] as const;
export const FRAME_MARGIN_MM = [0, 40] as const;
export const FRAME_THICKNESS_MM = [0.1, 30] as const;
const EPSILON = 1e-6;

export type CertificateSide = "front" | "back";

/** Width and height of the pages. */
export function pageSize(orientation: PageOrientation): { width: number; height: number } {
  return orientation === "landscape" ? { width: 297, height: 210 } : { width: 210, height: 297 };
}

/** The page of one side, or null for a back that does not exist. */
export function pageOf(design: CertificateDesign, side: CertificateSide): CertificatePage | null {
  return side === "front" ? design.front : (design.back ?? null);
}

/** The design with one side replaced. */
export function withPage(design: CertificateDesign, side: CertificateSide, page: CertificatePage): CertificateDesign {
  return side === "front" ? { ...design, front: page } : { ...design, back: page };
}

/** QR codes and seals are squares: their size is the box's width. */
export function isSquare(element: CertificateElement): boolean {
  return element.kind === "qr" || element.kind === "seal";
}

export function elementBox(element: CertificateElement): Box {
  if (element.kind === "qr" || element.kind === "seal") {
    return { x: element.xMm, y: element.yMm, width: element.sizeMm, height: element.sizeMm };
  }
  return { x: element.xMm, y: element.yMm, width: element.widthMm, height: element.heightMm };
}

export function withBox(element: CertificateElement, box: Box): CertificateElement {
  if (element.kind === "qr" || element.kind === "seal") {
    return { ...element, xMm: box.x, yMm: box.y, sizeMm: box.width };
  }
  return { ...element, xMm: box.x, yMm: box.y, widthMm: box.width, heightMm: box.height };
}

/** Smallest box of a signature: the name and the role under the line, and room to sign. */
export function signatureMinHeight(sizePt: number): number {
  return sizePt * (1.3 + 0.8 * 1.3) * MM_PER_PT + 4;
}

/** The smallest width and height an element may be resized to. */
export function minSize(element: CertificateElement): { width: number; height: number } {
  switch (element.kind) {
    case "qr":
      return { width: MIN_CERTIFICATE_QR_MM, height: MIN_CERTIFICATE_QR_MM };
    case "seal":
      return { width: SEAL_SIZE_MM[0], height: SEAL_SIZE_MM[0] };
    case "signature":
      return { width: 10, height: signatureMinHeight(element.sizePt) };
    default:
      return { width: 2, height: 2 };
  }
}

/** The indexes of the uploaded images the design uses, in order, without repeats. */
export function usedImages(design: CertificateDesign): number[] {
  const used = new Set<number>();
  for (const page of [design.front, design.back ?? null]) {
    if (page === null) {
      continue;
    }
    if (page.backgroundImage != null) {
      used.add(page.backgroundImage);
    }
    for (const element of page.elements) {
      if (element.kind === "image" && element.source.from === "upload") {
        used.add(element.source.index);
      }
      if (element.kind === "signature" && element.image != null) {
        used.add(element.image);
      }
    }
  }
  return [...used].sort((a, b) => a - b);
}

/**
 * The design without the uploaded image `index`: images showing it go, signatures and backgrounds
 * lose it, and later indexes move down by one (the list of images loses that entry).
 */
export function withoutImage(design: CertificateDesign, index: number): CertificateDesign {
  const shift = (value: number) => (value > index ? value - 1 : value);
  const page = (side: CertificatePage): CertificatePage => ({
    ...side,
    backgroundImage: side.backgroundImage == null || side.backgroundImage === index ? null : shift(side.backgroundImage),
    elements: side.elements.flatMap((element): CertificateElement[] => {
      if (element.kind === "image" && element.source.from === "upload") {
        return element.source.index === index ? [] : [{ ...element, source: { from: "upload", index: shift(element.source.index) } }];
      }
      if (element.kind === "signature" && element.image != null) {
        return [{ ...element, image: element.image === index ? null : shift(element.image) }];
      }
      return [element];
    }),
  });
  return { ...design, front: page(design.front), back: design.back == null ? null : page(design.back) };
}

/**
 * The design on pages of another orientation: every box scaled to the new page, fonts and squares
 * by the smaller factor, then pulled inside the page.
 */
export function reorient(design: CertificateDesign, orientation: PageOrientation): CertificateDesign {
  if (design.orientation === orientation) {
    return design;
  }
  const from = pageSize(design.orientation);
  const to = pageSize(orientation);
  const sx = to.width / from.width;
  const sy = to.height / from.height;
  const s = Math.min(sx, sy);
  const round = (value: number) => Math.round(value * 10) / 10;
  const fitIn = (element: CertificateElement): CertificateElement => {
    const box = elementBox(element);
    const min = minSize(element);
    const width = Math.max(min.width, Math.min(to.width, round(isSquare(element) ? box.width * s : box.width * sx)));
    const height = isSquare(element) ? width : Math.max(min.height, Math.min(to.height, round(box.height * sy)));
    const x = Math.min(Math.max(0, round(box.x * sx)), to.width - width);
    const y = Math.min(Math.max(0, round(box.y * sy)), to.height - height);
    const placed = withBox(element, { x, y, width, height });
    if (placed.kind === "text") {
      return { ...placed, sizePt: Math.max(TEXT_SIZE_PT[0], round(placed.sizePt * s)) };
    }
    if (placed.kind === "signature") {
      const sizePt = Math.max(SIGNATURE_SIZE_PT[0], round(placed.sizePt * s));
      return { ...placed, sizePt, heightMm: Math.max(placed.heightMm, Math.min(to.height - placed.yMm, signatureMinHeight(sizePt))) };
    }
    return placed;
  };
  const page = (side: CertificatePage): CertificatePage => ({ ...side, elements: side.elements.map(fitIn) });
  return { ...design, orientation, front: page(design.front), back: design.back == null ? null : page(design.back) };
}

/** A problem with the design; `side` and `index` point at what to outline. */
export interface CertificateIssue {
  side: CertificateSide | null;
  index: number | null;
  message: string;
}

const within = (value: number, [min, max]: readonly [number, number]) => Number.isFinite(value) && value >= min && value <= max;
const isHexColor = (value: string) => /^#[0-9a-fA-F]{6}$/.test(value);
const hasControl = (value: string) => /[\u0000-\u001f\u007f-\u009f]/.test(value);
const chars = (value: string) => Array.from(value).length;

function inside(box: Box, page: { width: number; height: number }): boolean {
  return (
    [box.x, box.y, box.width, box.height].every(Number.isFinite) &&
    box.x >= -EPSILON &&
    box.y >= -EPSILON &&
    box.width >= MIN_BOX_MM &&
    box.height >= MIN_BOX_MM &&
    box.x + box.width <= page.width + EPSILON &&
    box.y + box.height <= page.height + EPSILON
  );
}

function elementIssues(element: CertificateElement, images: number, page: { width: number; height: number }): string[] {
  const m = texts.issues;
  const found: string[] = [];
  if (!inside(elementBox(element), page)) {
    found.push(m.outOfBounds);
  }
  const color = (value: string) => {
    if (!isHexColor(value)) {
      found.push(m.color);
    }
  };
  const image = (index: number | null | undefined) => {
    if (index != null && index >= images) {
      found.push(m.missingImage);
    }
  };
  switch (element.kind) {
    case "text":
      color(element.color);
      if (
        chars(element.text) > MAX_TEXT_CHARS ||
        !within(element.sizePt, TEXT_SIZE_PT) ||
        !within(element.lineHeight, LINE_HEIGHT) ||
        !within(element.letterSpacing, LETTER_SPACING_EM)
      ) {
        found.push(m.text(MAX_TEXT_CHARS, TEXT_SIZE_PT[0], TEXT_SIZE_PT[1]));
      }
      break;
    case "image":
      if (element.source.from === "upload") {
        image(element.source.index);
      }
      break;
    case "signature":
      color(element.color);
      color(element.lineColor);
      image(element.image);
      if (
        chars(element.name) > MAX_SIGNER_NAME_CHARS ||
        chars(element.role) > MAX_SIGNER_ROLE_CHARS ||
        hasControl(element.name + element.role) ||
        !within(element.sizePt, SIGNATURE_SIZE_PT) ||
        element.heightMm < signatureMinHeight(element.sizePt)
      ) {
        found.push(m.signature(MAX_SIGNER_NAME_CHARS, MAX_SIGNER_ROLE_CHARS));
      }
      break;
    case "qr":
      if (Number.isNaN(element.sizeMm) || element.sizeMm < MIN_CERTIFICATE_QR_MM) {
        found.push(m.qrTooSmall(MIN_CERTIFICATE_QR_MM));
      }
      break;
    case "line":
      color(element.color);
      if (!within(element.thicknessMm, LINE_THICKNESS_MM)) {
        found.push(m.shape);
      }
      break;
    case "shape":
      color(element.color);
      if (!within(element.opacity, OPACITY) || !within(element.radiusMm, SHAPE_RADIUS_MM)) {
        found.push(m.shape);
      }
      break;
    case "seal":
      color(element.color);
      color(element.textColor);
      if (
        !within(element.sizeMm, SEAL_SIZE_MM) ||
        chars(element.text) > MAX_SEAL_TEXT_CHARS ||
        chars(element.center) > MAX_SEAL_CENTER_CHARS ||
        hasControl(element.text + element.center)
      ) {
        found.push(m.seal(SEAL_SIZE_MM[0], SEAL_SIZE_MM[1]));
      }
      break;
  }
  return found;
}

/** Every problem the server would refuse (`CertificateDesign::validate`), for `images` uploads. */
export function certificateIssues(design: CertificateDesign, images: number): CertificateIssue[] {
  const m = texts.issues;
  const issues: CertificateIssue[] = [];
  const title = chars(design.title.trim());
  if (title === 0 || title > MAX_TITLE_CHARS || hasControl(design.title)) {
    issues.push({ side: null, index: null, message: m.title(MAX_TITLE_CHARS) });
  }
  const size = pageSize(design.orientation);
  let qrs = 0;
  const sides: [CertificateSide, CertificatePage | null][] = [
    ["front", design.front],
    ["back", design.back ?? null],
  ];
  for (const [side, page] of sides) {
    if (page === null) {
      continue;
    }
    if (!isHexColor(page.backgroundColor)) {
      issues.push({ side, index: null, message: m.color });
    }
    if (page.backgroundImage != null && page.backgroundImage >= images) {
      issues.push({ side, index: null, message: m.missingImage });
    }
    if (page.frame != null) {
      if (!isHexColor(page.frame.color) || !isHexColor(page.frame.accent)) {
        issues.push({ side, index: null, message: m.color });
      }
      if (!within(page.frame.marginMm, FRAME_MARGIN_MM) || !within(page.frame.thicknessMm, FRAME_THICKNESS_MM)) {
        issues.push({ side, index: null, message: m.frame });
      }
    }
    if (page.elements.length > MAX_PAGE_ELEMENTS) {
      issues.push({ side, index: null, message: m.tooMany(MAX_PAGE_ELEMENTS) });
    }
    page.elements.forEach((element, index) => {
      for (const message of elementIssues(element, images, size)) {
        issues.push({ side, index, message });
      }
      if (element.kind === "qr") {
        qrs += 1;
      }
    });
  }
  if (qrs === 0) {
    issues.push({ side: null, index: null, message: m.missingQr });
  }
  return issues;
}

/** A fresh element of each kind, centred on a page of `size`. */
export function newElement(
  kind: CertificateElement["kind"],
  size: { width: number; height: number },
  options: { color: string; font: FontChoice; image?: number },
): CertificateElement {
  const centred = (width: number, height: number) => ({
    xMm: Math.round((size.width - width) / 2),
    yMm: Math.round((size.height - height) / 2),
  });
  switch (kind) {
    case "text":
      return {
        kind,
        text: texts.newText,
        ...centred(140, 14),
        widthMm: 140,
        heightMm: 14,
        font: options.font,
        sizePt: 18,
        color: options.color,
        align: "center",
        valign: "middle",
        bold: false,
        italic: false,
        uppercase: false,
        letterSpacing: 0,
        lineHeight: 1.4,
        boldName: true,
      };
    case "image":
      return {
        kind,
        source: options.image === undefined ? { from: "organization" } : { from: "upload", index: options.image },
        ...centred(40, 20),
        widthMm: 40,
        heightMm: 20,
      };
    case "signature":
      return {
        kind,
        ...centred(70, 30),
        widthMm: 70,
        heightMm: 30,
        name: "",
        role: "",
        image: options.image ?? null,
        font: options.font,
        sizePt: 12,
        color: "#1b1a24",
        lineColor: "#1b1a24",
      };
    case "qr":
      return { kind, ...centred(22, 22), sizeMm: 22 };
    case "line":
      return { kind, ...centred(80, 3), widthMm: 80, heightMm: 3, style: "solid", color: options.color, thicknessMm: 0.4 };
    case "shape":
      return { kind, ...centred(80, 40), widthMm: 80, heightMm: 40, color: options.color, opacity: 0.15, radiusMm: 2 };
    case "seal":
      return { kind, ...centred(34, 34), sizeMm: 34, color: options.color, textColor: "#ffffff", text: "{organizacao}", center: "" };
  }
}
