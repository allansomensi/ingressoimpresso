/**
 * Building blocks of the template backgrounds: SVG drawn in millimetres, with the origin at the
 * top-left corner of the ticket body and 3 mm of bleed around it (the art always covers it).
 */

import { BLEED_MM } from "@/lib/design-rules";

/** Rounds to 0.01 mm: short, stable markup. */
export const r = (value: number) => Math.round(value * 100) / 100;

/** A whole background: `<svg>` covering body + bleed, `inner` drawn over `fill`. */
export function canvas(width: number, height: number, fill: string, inner: string, defs = ""): string {
  const b = BLEED_MM;
  const w = width + 2 * b;
  const h = height + 2 * b;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r(-b)} ${r(-b)} ${r(w)} ${r(h)}" width="${r(w)}mm" height="${r(h)}mm">` +
    (defs === "" ? "" : `<defs>${defs}</defs>`) +
    `<rect x="${r(-b)}" y="${r(-b)}" width="${r(w)}" height="${r(h)}" fill="${fill}"/>` +
    inner +
    `</svg>`
  );
}

/** Deterministic pseudo-random numbers (mulberry32): the same template always looks the same. */
export function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** A linear gradient definition; `angle` in degrees (0 = left to right). */
export function linear(id: string, stops: readonly (readonly [number, string, number?])[], angle = 0): string {
  const rad = (angle * Math.PI) / 180;
  const x = Math.cos(rad) / 2;
  const y = Math.sin(rad) / 2;
  return (
    `<linearGradient id="${id}" x1="${r(0.5 - x)}" y1="${r(0.5 - y)}" x2="${r(0.5 + x)}" y2="${r(0.5 + y)}">` +
    stops.map(([offset, color, opacity = 1]) => `<stop offset="${offset}" stop-color="${color}" stop-opacity="${opacity}"/>`).join("") +
    `</linearGradient>`
  );
}

/** A radial gradient definition fading `color` from `opacity` to transparent. */
export function glow(id: string, color: string, opacity: number): string {
  return `<radialGradient id="${id}"><stop offset="0" stop-color="${color}" stop-opacity="${opacity}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`;
}

/** A white rounded card behind the QR code (its quiet zone is white anyway). */
export function qrCard(x: number, y: number, size: number, pad = 2, extra = ""): string {
  return `<rect x="${r(x - pad)}" y="${r(y - pad)}" width="${r(size + 2 * pad)}" height="${r(size + 2 * pad)}" rx="${r(pad + 0.5)}" fill="#ffffff" ${extra}/>`;
}

/** Scattered confetti: small rotated rectangles and dots inside a box. */
export function confetti(
  seed: number,
  box: { x: number; y: number; width: number; height: number },
  colors: readonly string[],
  count: number,
  opacity = 1,
): string {
  const next = random(seed);
  let out = "";
  for (let i = 0; i < count; i += 1) {
    const x = box.x + next() * box.width;
    const y = box.y + next() * box.height;
    const color = colors[Math.floor(next() * colors.length)] ?? "#ffffff";
    if (next() < 0.4) {
      out += `<circle cx="${r(x)}" cy="${r(y)}" r="${r(0.4 + next() * 0.6)}" fill="${color}" opacity="${opacity}"/>`;
    } else {
      const w = 0.6 + next() * 1.4;
      out += `<rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(w * 0.45)}" fill="${color}" opacity="${opacity}" transform="rotate(${Math.round(next() * 180)} ${r(x)} ${r(y)})"/>`;
    }
  }
  return out;
}

/** Soft out-of-focus circles. */
export function bokeh(seed: number, box: { x: number; y: number; width: number; height: number }, color: string, count: number): string {
  const next = random(seed);
  let out = "";
  for (let i = 0; i < count; i += 1) {
    out += `<circle cx="${r(box.x + next() * box.width)}" cy="${r(box.y + next() * box.height)}" r="${r(1.5 + next() * 7)}" fill="${color}" opacity="${r(0.05 + next() * 0.14)}"/>`;
  }
  return out;
}

/** Festa junina bunting: flags hanging from a sagging string between `x1` and `x2`. */
export function bunting(x1: number, x2: number, y: number, sag: number, colors: readonly string[], string: string): string {
  const point = (t: number) => {
    // Quadratic Bézier with the control point in the middle, `sag` below.
    const cx = (x1 + x2) / 2;
    const cy = y + 2 * sag;
    const x = (1 - t) ** 2 * x1 + 2 * (1 - t) * t * cx + t ** 2 * x2;
    const py = (1 - t) ** 2 * y + 2 * (1 - t) * t * cy + t ** 2 * y;
    return [x, py] as const;
  };
  let flags = "";
  const count = Math.max(4, Math.round((x2 - x1) / 6.5));
  for (let i = 0; i < count; i += 1) {
    const [x, py] = point((i + 0.5) / count);
    const color = colors[i % colors.length] ?? "#ffffff";
    flags += `<path d="M${r(x - 2.5)} ${r(py)}L${r(x + 2.5)} ${r(py)}L${r(x)} ${r(py + 5.2)}Z" fill="${color}"/>`;
  }
  return `<path d="M${r(x1)} ${r(y)}Q${r((x1 + x2) / 2)} ${r(y + 2 * sag)} ${r(x2)} ${r(y)}" fill="none" stroke="${string}" stroke-width="0.35"/>${flags}`;
}

/** Leaves along a gentle curve, for wedding and gala branches. */
export function branch(
  from: readonly [number, number],
  to: readonly [number, number],
  bend: number,
  leaves: number,
  color: string,
  size = 2.4,
): string {
  const [x1, y1] = from;
  const [x2, y2] = to;
  const cx = (x1 + x2) / 2 - (y2 - y1) * bend;
  const cy = (y1 + y2) / 2 + (x2 - x1) * bend;
  const at = (t: number) =>
    [(1 - t) ** 2 * x1 + 2 * (1 - t) * t * cx + t ** 2 * x2, (1 - t) ** 2 * y1 + 2 * (1 - t) * t * cy + t ** 2 * y2] as const;
  let out = `<path d="M${r(x1)} ${r(y1)}Q${r(cx)} ${r(cy)} ${r(x2)} ${r(y2)}" fill="none" stroke="${color}" stroke-width="0.35" stroke-linecap="round"/>`;
  for (let i = 1; i <= leaves; i += 1) {
    const t = i / (leaves + 1);
    const [x, y] = at(t);
    const [nx, ny] = at(Math.min(1, t + 0.01));
    const angle = (Math.atan2(ny - y, nx - x) * 180) / Math.PI;
    const side = i % 2 === 0 ? 45 : -45;
    const s = size * (1 - t * 0.45);
    out += `<ellipse cx="${r(x)}" cy="${r(y)}" rx="${r(s)}" ry="${r(s * 0.42)}" fill="${color}" transform="rotate(${Math.round(angle + side)} ${r(x)} ${r(y)}) translate(${r(s * 0.9)} 0)"/>`;
  }
  return out;
}

/** A heart of width `size` centred on (x, y). */
export function heart(x: number, y: number, size: number, fill: string, opacity = 1, rotate = 0): string {
  const s = size / 2;
  return `<path d="M0 ${r(s * 0.35)}C0 ${r(-s * 0.25)} ${r(-s)} ${r(-s * 0.35)} ${r(-s)} ${r(s * 0.15)}C${r(-s)} ${r(s * 0.6)} ${r(-s * 0.3)} ${r(s * 0.85)} 0 ${r(s * 1.1)}C${r(s * 0.3)} ${r(s * 0.85)} ${r(s)} ${r(s * 0.6)} ${r(s)} ${r(s * 0.15)}C${r(s)} ${r(-s * 0.35)} 0 ${r(-s * 0.25)} 0 ${r(s * 0.35)}Z" fill="${fill}" opacity="${opacity}" transform="translate(${r(x)} ${r(y)}) rotate(${rotate})"/>`;
}

/** A firework burst: rays and sparks around (x, y). */
export function burst(x: number, y: number, radius: number, color: string, rays = 14): string {
  let out = "";
  for (let i = 0; i < rays; i += 1) {
    const angle = (i / rays) * Math.PI * 2;
    const inner = radius * 0.35;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    out += `<line x1="${r(x + cos * inner)}" y1="${r(y + sin * inner)}" x2="${r(x + cos * radius)}" y2="${r(y + sin * radius)}" stroke="${color}" stroke-width="0.3" stroke-linecap="round"/>`;
    out += `<circle cx="${r(x + cos * radius * 1.15)}" cy="${r(y + sin * radius * 1.15)}" r="0.35" fill="${color}"/>`;
  }
  return out;
}

/** A five-pointed star of outer radius `size`. */
export function star(x: number, y: number, size: number, fill: string, opacity = 1): string {
  const points: string[] = [];
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? size : size * 0.45;
    const angle = (i / 10) * Math.PI * 2 - Math.PI / 2;
    points.push(`${r(x + Math.cos(angle) * radius)},${r(y + Math.sin(angle) * radius)}`);
  }
  return `<polygon points="${points.join(" ")}" fill="${fill}" opacity="${opacity}"/>`;
}
