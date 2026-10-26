/**
 * Templates in the organization's own colours (ADR 0100): a template's palette redrawn from one
 * or two brand colours (the organization's, or the ones taken from a flyer), keeping the
 * template's light or dark character and readable text, and the organization's logo laid on a
 * free corner of the art.
 */

import type { TicketDesign } from "@ingressoimpresso/api-types";

import type { Palette } from "@/lib/templates/catalog";

type Rgb = readonly [number, number, number];

const HEX = /^#([0-9a-f]{6})$/i;

export function isHex(value: string): boolean {
  return HEX.test(value);
}

function rgbOf(hex: string): Rgb {
  const value = Number.parseInt(HEX.exec(hex)?.[1] ?? "000000", 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function hexOf([red, green, blue]: Rgb): string {
  const part = (channel: number) =>
    Math.round(Math.min(255, Math.max(0, channel)))
      .toString(16)
      .padStart(2, "0");
  return `#${part(red)}${part(green)}${part(blue)}`;
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const linear = (channel: number) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [red, green, blue] = rgbOf(hex);
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
}

/** WCAG contrast ratio between two colours (1 to 21). */
export function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

/** `a` moved towards `b` by `amount` (0 to 1). */
export function mix(a: string, b: string, amount: number): string {
  const from = rgbOf(a);
  const to = rgbOf(b);
  return hexOf([from[0] + (to[0] - from[0]) * amount, from[1] + (to[1] - from[1]) * amount, from[2] + (to[2] - from[2]) * amount]);
}

/** `color` darkened (towards black) or lightened (towards white) until it reads on `background`. */
export function readableOn(color: string, background: string, ratio: number): string {
  const towards = luminance(background) > 0.4 ? "#000000" : "#ffffff";
  for (let step = 0; step <= 20; step += 1) {
    const candidate = mix(color, towards, step / 20);
    if (contrast(candidate, background) >= ratio) {
      return candidate;
    }
  }
  return towards;
}

/** How colourful a colour is, 0 (grey) to 1. */
function saturation(hex: string): number {
  const [red, green, blue] = rgbOf(hex);
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  return max === 0 ? 0 : (max - min) / max;
}

/**
 * The template's palette redrawn in `colors` (the first is the main one). A dark template stays
 * dark (a deep shade of the colour behind light text), a light one stays light (a soft tint
 * behind dark text); the highlights keep the brand colours, adjusted only as much as needed to
 * read.
 */
export function brandPalette(base: Palette, colors: readonly string[], id: string): Palette {
  const [primary = base.accent, ...rest] = colors.filter(isHex);
  const secondary = rest[0] ?? mix(primary, luminance(primary) > 0.4 ? "#000000" : "#ffffff", 0.35);
  const dark = luminance(base.bg) < 0.25;
  const bg = dark ? mix(primary, "#07070b", 0.82) : mix(primary, "#ffffff", 0.9);
  const ink = dark ? mix(primary, "#ffffff", 0.92) : readableOn(mix(primary, "#0b0b12", 0.55), bg, 7);
  const muted = readableOn(mix(ink, bg, 0.35), bg, 4.5);
  // Highlights are often small labels ("AO VIVO"): they read like text.
  const accent = readableOn(primary, bg, 4.5);
  const extra = [secondary, ...rest.slice(1), ...base.extra.slice(1 + rest.length)].map((color, index) =>
    // Decorations repeat the brand colours; the first is a highlight too, so it must read.
    index === 0 ? readableOn(color, bg, 3) : color,
  );
  return { id, bg, ink, muted, accent, extra: extra.length === 0 ? [secondary] : extra };
}

/**
 * The main colours of a picture (a flyer), most present first: pixels are grouped in buckets of
 * similar colour, greys and near-white or near-black count less, and colours too close to one
 * already chosen are skipped. `pixels` is RGBA, as `ImageData.data`.
 */
export function dominantColors(pixels: Uint8ClampedArray, count = 4): string[] {
  const buckets = new Map<number, { weight: number; red: number; green: number; blue: number }>();
  for (let index = 0; index + 3 < pixels.length; index += 4) {
    const alpha = pixels[index + 3] ?? 0;
    if (alpha < 128) {
      continue;
    }
    const red = pixels[index] ?? 0;
    const green = pixels[index + 1] ?? 0;
    const blue = pixels[index + 2] ?? 0;
    const key = ((red >> 4) << 8) | ((green >> 4) << 4) | (blue >> 4);
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const chroma = max === 0 ? 0 : (max - min) / max;
    // A flyer's paper and its black text are everywhere: they count, but much less.
    const weight = 0.15 + chroma * (max < 40 || min > 225 ? 0.2 : 1);
    const bucket = buckets.get(key) ?? { weight: 0, red: 0, green: 0, blue: 0 };
    bucket.weight += weight;
    bucket.red += red * weight;
    bucket.green += green * weight;
    bucket.blue += blue * weight;
    buckets.set(key, bucket);
  }
  const ranked = [...buckets.values()]
    .sort((a, b) => b.weight - a.weight)
    .map((bucket) => hexOf([bucket.red / bucket.weight, bucket.green / bucket.weight, bucket.blue / bucket.weight]));
  const chosen: string[] = [];
  for (const color of ranked) {
    if (chosen.every((other) => distance(color, other) > 60)) {
      chosen.push(color);
    }
    if (chosen.length === count) {
      break;
    }
  }
  // The most colourful first: it makes the best main colour for a template.
  return chosen.sort((a, b) => Number(saturation(b) > 0.25) - Number(saturation(a) > 0.25));
}

/** A rough perceptual distance between two colours ("redmean"). */
function distance(a: string, b: string): number {
  const [r1, g1, b1] = rgbOf(a);
  const [r2, g2, b2] = rgbOf(b);
  const mean = (r1 + r2) / 2;
  return Math.sqrt((2 + mean / 256) * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2 + (2 + (255 - mean) / 256) * (b1 - b2) ** 2);
}

/** Reads the main colours of an image file, scaled down first (it never leaves the device). */
export async function flyerColors(file: Blob): Promise<string[]> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 160 / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (context === null) {
    bitmap.close();
    throw new Error("canvas 2d unavailable");
  }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return dominantColors(context.getImageData(0, 0, width, height).data);
}

type Box = { x: number; y: number; width: number; height: number };

function clash(a: Box, b: Box, gap: number): boolean {
  return a.x < b.x + b.width + gap && b.x < a.x + a.width + gap && a.y < b.y + b.height + gap && b.y < a.y + a.height + gap;
}

/** Everything printed on the ticket body: photos, texts, number, QR, the category band and sponsors. */
function taken(design: TicketDesign): Box[] {
  const boxes: Box[] = [
    ...design.photos.map((photo) => ({ x: photo.xMm, y: photo.yMm, width: photo.widthMm, height: photo.heightMm })),
    ...design.texts.map((text) => ({ x: text.xMm, y: text.yMm, width: text.widthMm, height: text.heightMm })),
    { x: design.number.xMm, y: design.number.yMm, width: design.number.widthMm, height: design.number.heightMm },
    // The QR's white card goes a little beyond the code.
    { x: design.qr.xMm - 2, y: design.qr.yMm - 2, width: design.qr.sizeMm + 4, height: design.qr.sizeMm + 4 },
  ];
  const band = design.band;
  if (band !== null) {
    const { widthMm: w, heightMm: h } = design;
    const size = band.sizeMm;
    boxes.push(
      band.edge === "left"
        ? { x: 0, y: 0, width: size, height: h }
        : band.edge === "right"
          ? { x: w - size, y: 0, width: size, height: h }
          : band.edge === "top"
            ? { x: 0, y: 0, width: w, height: size }
            : { x: 0, y: h - size, width: w, height: size },
    );
  }
  if (design.sponsors !== null) {
    const strip = design.sponsors;
    boxes.push({ x: strip.xMm, y: strip.yMm, width: strip.widthMm, height: strip.heightMm });
  }
  return boxes;
}

/**
 * A square free of everything printed, for the organization's logo: a corner when one is free,
 * else the free spot nearest to a corner; smaller when nothing fits; `null` when no spot is free.
 */
export function logoSpot(design: TicketDesign): Box | null {
  const { widthMm: width, heightMm: height } = design;
  const boxes = taken(design);
  const margin = 3;
  const largest = Math.min(12, Math.max(7, Math.round(height * 0.22)));
  for (let size = largest; size >= 6; size -= 1) {
    const spots: Box[] = [];
    for (let y = margin; y + size <= height - margin; y += 0.5) {
      for (let x = margin; x + size <= width - margin; x += 0.5) {
        spots.push({ x, y, width: size, height: size });
      }
    }
    const corner = (spot: Box) =>
      Math.min(
        Math.hypot(spot.x - margin, spot.y - margin),
        Math.hypot(width - margin - spot.x - size, spot.y - margin),
        Math.hypot(spot.x - margin, height - margin - spot.y - size),
        Math.hypot(width - margin - spot.x - size, height - margin - spot.y - size),
      );
    const free = spots.filter((spot) => boxes.every((box) => !clash(spot, box, 1.5)));
    if (free.length > 0) {
      return free.reduce((best, spot) => (corner(spot) < corner(best) ? spot : best));
    }
  }
  return null;
}

/** The art with the logo on a white rounded tile at `spot` (any background reads it). */
export function withLogo(svg: string, spot: Box, logo: string): string {
  const pad = spot.width * 0.1;
  const tile =
    `<rect x="${spot.x}" y="${spot.y}" width="${spot.width}" height="${spot.height}" rx="${spot.width * 0.18}" fill="#ffffff"/>` +
    `<image href="${logo.replace(/"/g, "%22")}" x="${spot.x + pad}" y="${spot.y + pad}" width="${spot.width - 2 * pad}" height="${spot.height - 2 * pad}" preserveAspectRatio="xMidYMid meet"/>`;
  return svg.replace(/<\/svg>$/, `${tile}</svg>`);
}

/** The art of a template with the organization's logo on a free corner, when it fits. */
export function artWithLogo(background: string, design: TicketDesign, logo: string | null): string {
  if (logo === null) {
    return background;
  }
  const spot = logoSpot(design);
  return spot === null ? background : withLogo(background, spot, logo);
}
