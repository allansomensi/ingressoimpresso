/** Templates of the celebrations set, listed in catalog.ts. */

import { templates as templatesTexts } from "@/texts/pt-BR/templates";

import { block, design, H, number, QR, STUB, W, type TicketTemplate } from "./kit";
import { branch, canvas, confetti, glow, linear, qrCard, r, random, star } from "./svg";

const c = templatesTexts.content;

/** A four-pointed sparkle of radius `size`. */
function sparkle(x: number, y: number, size: number, fill: string, opacity = 1): string {
  const k = size * 0.16;
  return `<path d="M${r(x)} ${r(y - size)}Q${r(x + k)} ${r(y - k)} ${r(x + size)} ${r(y)}Q${r(x + k)} ${r(y + k)} ${r(x)} ${r(y + size)}Q${r(x - k)} ${r(y + k)} ${r(x - size)} ${r(y)}Q${r(x - k)} ${r(y - k)} ${r(x)} ${r(y - size)}Z" fill="${fill}" opacity="${opacity}"/>`;
}

/** A curly party ribbon: loops (a prolate cycloid) along `length` mm from (x, y), at `angle` degrees. */
function curl(x: number, y: number, angle: number, length: number, color: string, loop = 1.3, pitch = 0.5, width = 0.5): string {
  const rad = (angle * Math.PI) / 180;
  const [ux, uy] = [Math.cos(rad), Math.sin(rad)];
  const end = length / pitch;
  let d = "";
  for (let t = 0; t <= end; t += 0.32) {
    const along = pitch * t - loop * Math.sin(t) * Math.min(1, t / 3);
    const across = loop * (Math.cos(t) - 1) * Math.min(1, t / 3);
    d += `${d === "" ? "M" : "L"}${r(x + ux * along - uy * across)} ${r(y + uy * along + ux * across)}`;
  }
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

/** A wrapped present with a bow, `w` wide and `h` tall from its top-left corner (bow above it). */
function gift(x: number, y: number, w: number, h: number, box: string, ribbon: string): string {
  const lid = h * 0.26;
  const band = w * 0.17;
  const cx = x + w / 2;
  const loop = (side: number) =>
    `<path d="M${r(cx)} ${r(y)}C${r(cx + side * w * 0.55)} ${r(y - w * 0.5)} ${r(cx + side * w * 0.6)} ${r(y + w * 0.04)} ${r(cx)} ${r(y)}Z" fill="${ribbon}"/>`;
  return (
    `<rect x="${r(x)}" y="${r(y + lid)}" width="${r(w)}" height="${r(h - lid)}" fill="${box}"/>` +
    `<rect x="${r(x)}" y="${r(y + lid)}" width="${r(w)}" height="${r(h * 0.08)}" fill="#000000" opacity="0.15"/>` +
    `<rect x="${r(x - 0.9)}" y="${r(y)}" width="${r(w + 1.8)}" height="${r(lid)}" rx="0.3" fill="${box}"/>` +
    `<rect x="${r(cx - band / 2)}" y="${r(y)}" width="${r(band)}" height="${r(h)}" fill="${ribbon}"/>` +
    loop(-1) +
    loop(1) +
    `<path d="M${r(cx)} ${r(y)}l${r(-w * 0.22)} ${r(lid * 1.6)}l${r(w * 0.06)} ${r(-lid * 0.25)}l${r(w * 0.04)} ${r(lid * 0.3)}Z" fill="${ribbon}"/>` +
    `<circle cx="${r(cx)}" cy="${r(y)}" r="${r(band * 0.62)}" fill="${ribbon}"/>` +
    `<circle cx="${r(cx)}" cy="${r(y)}" r="${r(band * 0.62)}" fill="#000000" opacity="0.12"/>`
  );
}

/** A bat silhouette `size` mm wide centred on (x, y). */
function bat(x: number, y: number, size: number, fill: string, rotate = 0): string {
  const d =
    "M0 -0.05L0.08 -0.22L0.12 -0.09Q0.35 -0.3 0.6 -0.25Q0.8 -0.22 1 -0.36Q0.9 -0.1 0.92 0.1Q0.8 0 0.68 0.08Q0.6 -0.02 0.48 0.1Q0.4 0 0.3 0.12Q0.18 0.02 0.1 0.18L0 0.26L-0.1 0.18Q-0.18 0.02 -0.3 0.12Q-0.4 0 -0.48 0.1Q-0.6 -0.02 -0.68 0.08Q-0.8 0 -0.92 0.1Q-0.9 -0.1 -1 -0.36Q-0.8 -0.22 -0.6 -0.25Q-0.35 -0.3 -0.12 -0.09L-0.08 -0.22Z";
  return `<path d="${d}" fill="${fill}" transform="translate(${r(x)} ${r(y)}) rotate(${rotate}) scale(${r(size / 2)})"/>`;
}

/** A bare, crooked tree growing up from (x, y). */
function spookyTree(seed: number, x: number, y: number, height: number, color: string): string {
  const next = random(seed);
  let out = "";
  const grow = (x1: number, y1: number, angle: number, length: number, width: number, depth: number) => {
    const bend = (next() - 0.5) * length * 0.5;
    const x2 = x1 + Math.cos(angle) * length;
    const y2 = y1 + Math.sin(angle) * length;
    const mx = (x1 + x2) / 2 - Math.sin(angle) * bend;
    const my = (y1 + y2) / 2 + Math.cos(angle) * bend;
    out += `<path d="M${r(x1)} ${r(y1)}Q${r(mx)} ${r(my)} ${r(x2)} ${r(y2)}" fill="none" stroke="${color}" stroke-width="${r(width)}" stroke-linecap="round"/>`;
    if (depth === 0) {
      return;
    }
    const count = depth > 3 ? 2 : 2 + (next() < 0.35 ? 1 : 0);
    for (let k = 0; k < count; k += 1) {
      const spread = (k - (count - 1) / 2) * 0.75 + (next() - 0.5) * 0.45;
      grow(x2, y2, angle + spread, length * (0.66 + next() * 0.14), width * 0.6, depth - 1);
    }
  };
  grow(x, y, -Math.PI / 2 - 0.08, height * 0.36, 2.6, 5);
  return out;
}

/** A palm frond: a curved rib with drooping leaflets, from (x, y) towards `angle` degrees. */
function frond(x: number, y: number, angle: number, length: number, bend: number, color: string, leaflets = 15): string {
  const rad = (angle * Math.PI) / 180;
  const tx = x + Math.cos(rad) * length;
  const ty = y + Math.sin(rad) * length;
  const cx = (x + tx) / 2 - Math.sin(rad) * bend * length;
  const cy = (y + ty) / 2 + Math.cos(rad) * bend * length;
  const at = (t: number) => [(1 - t) ** 2 * x + 2 * (1 - t) * t * cx + t ** 2 * tx, (1 - t) ** 2 * y + 2 * (1 - t) * t * cy + t ** 2 * ty] as const;
  let d = "";
  for (let i = 1; i <= leaflets; i += 1) {
    const t = i / (leaflets + 1);
    const [px, py] = at(t);
    const [nx, ny] = at(t + 0.01);
    const dir = Math.atan2(ny - py, nx - px);
    const size = length * 0.36 * Math.sin(Math.PI * (0.15 + t * 0.85)) + 0.6;
    for (const side of [-1, 1]) {
      const a = dir + side * 0.95;
      const ex = px + Math.cos(a) * size;
      const ey = py + Math.sin(a) * size + size * 0.28;
      const back = 0.45;
      d += `M${r(px - Math.cos(dir) * back)} ${r(py - Math.sin(dir) * back)}Q${r((px + ex) / 2 + side * 0.4)} ${r((py + ey) / 2 - 0.5)} ${r(ex)} ${r(ey)}L${r(px + Math.cos(dir) * back)} ${r(py + Math.sin(dir) * back)}Z`;
    }
  }
  return (
    `<path d="M${r(x)} ${r(y)}Q${r(cx)} ${r(cy)} ${r(tx)} ${r(ty)}" fill="none" stroke="${color}" stroke-width="0.6" stroke-linecap="round"/>` +
    `<path d="${d}" fill="${color}"/>`
  );
}

/** A tapering, slightly curved palm trunk from (x1, y1) at the base to (x2, y2) at the top. */
function trunk(x1: number, y1: number, x2: number, y2: number, bend: number, base: number, top: number, color: string): string {
  const cx = (x1 + x2) / 2 + bend;
  const cy = (y1 + y2) / 2;
  const left: string[] = [];
  const right: string[] = [];
  let rings = "";
  for (let i = 0; i <= 12; i += 1) {
    const t = i / 12;
    const px = (1 - t) ** 2 * x1 + 2 * (1 - t) * t * cx + t ** 2 * x2;
    const py = (1 - t) ** 2 * y1 + 2 * (1 - t) * t * cy + t ** 2 * y2;
    const half = (base + (top - base) * t) / 2;
    left.push(`${r(px - half)},${r(py)}`);
    right.unshift(`${r(px + half)},${r(py)}`);
    if (i > 0 && i < 12) {
      rings += `M${r(px - half)} ${r(py)}Q${r(px)} ${r(py + 0.9)} ${r(px + half)} ${r(py)}`;
    }
  }
  return `<polygon points="${[...left, ...right].join(" ")}" fill="${color}"/><path d="${rings}" fill="none" stroke="#000000" stroke-opacity="0.25" stroke-width="0.25"/>`;
}

/** A Venetian mask in line art, with a feather plume, centred on (x, y) and `scale` times 36 mm wide. */
function veneziana(x: number, y: number, scale: number, color: string): string {
  const half =
    `<path d="M0 -2.5C3 -5.2 8 -6.6 12 -6.4C14.5 -6.3 16.6 -7.2 18 -8.6C18.6 -4 17.6 0.6 13.6 3.6C10.6 5.9 6.2 6.5 3.4 4.2C2.3 3.3 1.2 3 0 3.2"/>` +
    `<path d="M3.4 -0.4C5 -3 9.6 -3.4 12.2 -1C9.8 1.8 5.2 1.8 3.4 -0.4Z"/>` +
    `<path d="M4.4 -4.4C7.4 -6 10.8 -5.9 13 -4.3"/>` +
    `<path d="M18 -8.6C19.6 -9.8 19.5 -12 17.7 -12.1C16.3 -12.1 15.9 -10.5 16.9 -9.9"/>` +
    `<path d="M5 4.8C6.6 5.4 8.6 5.4 10.4 4.6"/>` +
    `<circle cx="15.4" cy="-3.4" r="0.45" fill="${color}" stroke="none"/>` +
    `<circle cx="14.6" cy="0.2" r="0.35" fill="${color}" stroke="none"/>`;
  const feather = (bx: number, by: number, tx: number, ty: number, wide: number) => {
    const dx = tx - bx;
    const dy = ty - by;
    const len = Math.hypot(dx, dy);
    const [nx, ny] = [-dy / len, dx / len];
    const [mx, my] = [bx + dx * 0.55, by + dy * 0.55];
    let barbs = "";
    for (let i = 1; i <= 4; i += 1) {
      const t = 0.3 + i * 0.13;
      const [px, py] = [bx + dx * t, by + dy * t];
      for (const side of [-1, 1]) {
        barbs += `M${r(px)} ${r(py)}l${r(side * nx * wide * 0.7 + dx * 0.06)} ${r(side * ny * wide * 0.7 + dy * 0.06)}`;
      }
    }
    return (
      `<path d="M${r(bx)} ${r(by)}Q${r(mx + nx * wide)} ${r(my + ny * wide)} ${r(tx)} ${r(ty)}Q${r(mx - nx * wide)} ${r(my - ny * wide)} ${r(bx)} ${r(by)}Z"/>` +
      `<path d="M${r(bx)} ${r(by)}L${r(tx)} ${r(ty)}${barbs}" stroke-width="0.4"/>`
    );
  };
  return (
    `<g transform="translate(${r(x)} ${r(y)}) scale(${r(scale)})" fill="none" stroke="${color}" stroke-width="${r(0.7)}" stroke-linecap="round" stroke-linejoin="round">` +
    half +
    `<g transform="scale(-1 1)">${half}</g>` +
    `<path d="M0 -6.6L1 -5.1L0 -3.6L-1 -5.1Z" fill="${color}"/>` +
    feather(-16.4, -9.4, -21, -18.6, 2) +
    feather(-15.2, -9.8, -15.6, -19.6, 1.8) +
    feather(-17.4, -8.6, -25, -14.6, 1.7) +
    `</g>`
  );
}

/** A baroque scroll: an S-curve with a curl at its end, from (x, y) towards `dir` (1 right, −1 left). */
function scroll(x: number, y: number, length: number, dir: 1 | -1, color: string): string {
  const s = (v: number) => r(v * dir);
  return (
    `<path d="M${r(x)} ${r(y)}c${s(length * 0.3)} -2.2 ${s(length * 0.62)} 2.2 ${s(length)} 0c${s(1.7)} -1.3 ${s(0.7)} -3.4 ${s(-1)} -2.6c${s(-1.1)} 0.6 ${s(-0.5)} 2 ${s(0.4)} 1.5` +
    `M${r(x + length * 0.42 * dir)} ${r(y + 0.1)}c${s(1.2)} -2.2 ${s(3.4)} -2.6 ${s(4.6)} -1.6" fill="none" stroke="${color}" stroke-width="0.35" stroke-linecap="round"/>` +
    `<circle cx="${r(x)}" cy="${r(y)}" r="0.55" fill="${color}"/>`
  );
}

/** A six-armed snowflake of radius `size`. */
function snowflake(x: number, y: number, size: number, color: string, opacity: number): string {
  let d = "";
  for (let k = 0; k < 6; k += 1) {
    const a = (k * Math.PI) / 3 - Math.PI / 2;
    d += `M${r(x)} ${r(y)}L${r(x + Math.cos(a) * size)} ${r(y + Math.sin(a) * size)}`;
    const [bx, by] = [x + Math.cos(a) * size * 0.55, y + Math.sin(a) * size * 0.55];
    for (const side of [-0.75, 0.75]) {
      d += `M${r(bx)} ${r(by)}L${r(bx + Math.cos(a + side) * size * 0.32)} ${r(by + Math.sin(a + side) * size * 0.32)}`;
    }
  }
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${r(Math.max(0.18, size * 0.09))}" stroke-linecap="round" opacity="${opacity}"/>`;
}

/** A Christmas bauble hanging from the top edge on a string `drop` mm long. */
function bauble(x: number, drop: number, radius: number, color: string, string: string, cap: string): string {
  const cy = drop + 1.1 + radius * 0.96;
  return (
    `<line x1="${r(x)}" y1="-3" x2="${r(x)}" y2="${r(drop)}" stroke="${string}" stroke-width="0.2"/>` +
    `<circle cx="${r(x)}" cy="${r(cy)}" r="${r(radius)}" fill="${color}"/>` +
    `<ellipse cx="${r(x)}" cy="${r(cy)}" rx="${r(radius)}" ry="${r(radius * 0.26)}" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="0.25"/>` +
    `<ellipse cx="${r(x - radius * 0.38)}" cy="${r(cy - radius * 0.4)}" rx="${r(radius * 0.26)}" ry="${r(radius * 0.15)}" fill="#ffffff" opacity="0.55" transform="rotate(-35 ${r(x - radius * 0.38)} ${r(cy - radius * 0.4)})"/>` +
    `<rect x="${r(x - 0.9)}" y="${r(drop)}" width="1.8" height="1.3" rx="0.2" fill="${cap}"/>`
  );
}

/** An art deco fan: a half disc opening upwards with rays and an inner arc. */
function fan(cx: number, cy: number, radius: number, stroke: string, fill: string): string {
  let rays = "";
  for (let k = 1; k < 6; k += 1) {
    const a = Math.PI + (k * Math.PI) / 6;
    rays += `M${r(cx + Math.cos(a) * radius * 0.45)} ${r(cy + Math.sin(a) * radius * 0.45)}L${r(cx + Math.cos(a) * radius)} ${r(cy + Math.sin(a) * radius)}`;
  }
  return (
    `<path d="M${r(cx - radius)} ${r(cy)}A${r(radius)} ${r(radius)} 0 0 1 ${r(cx + radius)} ${r(cy)}Z" fill="${fill}" stroke="${stroke}" stroke-width="0.3"/>` +
    `<path d="M${r(cx - radius * 0.45)} ${r(cy)}A${r(radius * 0.45)} ${r(radius * 0.45)} 0 0 1 ${r(cx + radius * 0.45)} ${r(cy)}${rays}" fill="none" stroke="${stroke}" stroke-width="0.25"/>`
  );
}

/** A rectangle with stepped (art deco) corners. */
function stepped(x: number, y: number, w: number, h: number, step: number): string {
  const s = step;
  const [x2, y2] = [x + w, y + h];
  const pts = [
    [x + 2 * s, y], [x2 - 2 * s, y], [x2 - 2 * s, y + s], [x2 - s, y + s], [x2 - s, y + 2 * s], [x2, y + 2 * s],
    [x2, y2 - 2 * s], [x2 - s, y2 - 2 * s], [x2 - s, y2 - s], [x2 - 2 * s, y2 - s], [x2 - 2 * s, y2],
    [x + 2 * s, y2], [x + 2 * s, y2 - s], [x + s, y2 - s], [x + s, y2 - 2 * s], [x, y2 - 2 * s],
    [x, y + 2 * s], [x + s, y + 2 * s], [x + s, y + s], [x + 2 * s, y + s],
  ];
  return `M${pts.map(([px = 0, py = 0]) => `${r(px)} ${r(py)}`).join("L")}Z`;
}

/**
 * A watercolour bloom: two rings of translucent petals around a darker heart. `wash` and `edge`
 * are radial gradients (pale in the middle, pigment pooled at the rim) of the petal colours.
 */
function bloom(x: number, y: number, size: number, wash: string, edge: string, heart: string, rotate = 0, petals = 6): string {
  let out = "";
  for (let k = 0; k < petals; k += 1) {
    const a = rotate + (k * 360) / petals;
    out += `<ellipse cx="${r(x)}" cy="${r(y)}" rx="${r(size * 0.5)}" ry="${r(size * 0.36)}" fill="url(#${wash})" transform="rotate(${Math.round(a)} ${r(x)} ${r(y)}) translate(${r(size * 0.47)} 0)"/>`;
  }
  for (let k = 0; k < petals; k += 1) {
    const a = rotate + ((k + 0.5) * 360) / petals;
    out += `<ellipse cx="${r(x)}" cy="${r(y)}" rx="${r(size * 0.34)}" ry="${r(size * 0.22)}" fill="url(#${edge})" transform="rotate(${Math.round(a)} ${r(x)} ${r(y)}) translate(${r(size * 0.27)} 0)"/>`;
  }
  let stamens = "";
  for (let k = 0; k < 7; k += 1) {
    const a = ((rotate + k * 51) * Math.PI) / 180;
    stamens += `<circle cx="${r(x + Math.cos(a) * size * 0.2)}" cy="${r(y + Math.sin(a) * size * 0.2)}" r="${r(size * 0.03)}" fill="${heart}" opacity="0.6"/>`;
  }
  return out + `<circle cx="${r(x)}" cy="${r(y)}" r="${r(size * 0.12)}" fill="${heart}" opacity="0.65"/>` + stamens;
}

/** A petal gradient: almost clear in the middle, the pigment pooled at the rim. */
function petalWash(id: string, color: string): string {
  return `<radialGradient id="${id}"><stop offset="0" stop-color="${color}" stop-opacity="0.25"/><stop offset="0.7" stop-color="${color}" stop-opacity="0.55"/><stop offset="1" stop-color="${color}" stop-opacity="0.85"/></radialGradient>`;
}

/** A pointed leaf `length` mm long from (x, y) towards `angle` degrees. */
function leaf(x: number, y: number, length: number, angle: number, color: string, opacity = 0.6): string {
  const w = length * 0.3;
  return `<path d="M0 0Q${r(length / 2)} ${r(-w)} ${r(length)} 0Q${r(length / 2)} ${r(w)} 0 0Z" fill="${color}" opacity="${opacity}" transform="translate(${r(x)} ${r(y)}) rotate(${Math.round(angle)})"/>`;
}

/** A puffy cloud `w` mm wide sitting on (x, y), with a soft shadow under it. */
function cloud(x: number, y: number, w: number, fill: string, shade: string): string {
  const shape = (dy: number, color: string) =>
    `<g fill="${color}">` +
    `<rect x="${r(x)}" y="${r(y - w * 0.2 + dy)}" width="${r(w)}" height="${r(w * 0.2)}" rx="${r(w * 0.1)}"/>` +
    `<circle cx="${r(x + w * 0.27)}" cy="${r(y - w * 0.2 + dy)}" r="${r(w * 0.17)}"/>` +
    `<circle cx="${r(x + w * 0.52)}" cy="${r(y - w * 0.27 + dy)}" r="${r(w * 0.23)}"/>` +
    `<circle cx="${r(x + w * 0.76)}" cy="${r(y - w * 0.17 + dy)}" r="${r(w * 0.15)}"/>` +
    `</g>`;
  return shape(0.7, shade) + shape(0, fill);
}

/** A laurel wreath of radius `radius` around (cx, cy): two branches meeting at the bottom. */
function laurel(cx: number, cy: number, radius: number, color: string, leaves = 9): string {
  let side = `<path d="M${r(cx + Math.cos(1.75) * radius)} ${r(cy + Math.sin(1.75) * radius)}A${r(radius)} ${r(radius)} 0 0 0 ${r(cx + Math.cos(-1.22) * radius)} ${r(cy + Math.sin(-1.22) * radius)}" fill="none" stroke="${color}" stroke-width="0.35"/>`;
  for (let i = 0; i < leaves; i += 1) {
    const theta = 1.6 - (i * 2.75) / (leaves - 1);
    const [px, py] = [cx + Math.cos(theta) * radius, cy + Math.sin(theta) * radius];
    const tangent = (Math.atan2(-Math.cos(theta), Math.sin(theta)) * 180) / Math.PI;
    const size = radius * (0.42 - i * 0.012);
    side += leaf(px, py, size, tangent - 32, color, 1) + leaf(px, py, size * 0.9, tangent + 34, color, 1);
  }
  return side + `<g transform="translate(${r(2 * cx)} 0) scale(-1 1)">${side}</g>`;
}

/** A graduation cap (mortarboard) `size` mm wide centred on (x, y). */
function mortarboard(x: number, y: number, size: number, fill: string, tassel: string): string {
  const s = size / 2;
  return (
    `<path d="M${r(x - s * 0.56)} ${r(y + s * 0.12)}L${r(x - s * 0.56)} ${r(y + s * 0.6)}Q${r(x)} ${r(y + s * 0.88)} ${r(x + s * 0.56)} ${r(y + s * 0.6)}L${r(x + s * 0.56)} ${r(y + s * 0.12)}Z" fill="${fill}"/>` +
    `<path d="M${r(x - s)} ${r(y)}L${r(x)} ${r(y - s * 0.45)}L${r(x + s)} ${r(y)}L${r(x)} ${r(y + s * 0.45)}Z" fill="${fill}"/>` +
    `<path d="M${r(x)} ${r(y)}L${r(x + s * 0.72)} ${r(y + s * 0.1)}L${r(x + s * 0.72)} ${r(y + s * 0.78)}" fill="none" stroke="${tassel}" stroke-width="0.3"/>` +
    `<rect x="${r(x + s * 0.62)}" y="${r(y + s * 0.74)}" width="${r(s * 0.2)}" height="${r(s * 0.3)}" fill="${tassel}"/>` +
    `<circle cx="${r(x)}" cy="${r(y)}" r="${r(s * 0.07)}" fill="${tassel}"/>`
  );
}

/** Kraft paper: tiny dark and light specks and fibres. */
function speckles(seed: number, width: number, height: number, dark: string, light: string): string {
  const next = random(seed);
  let dots = ["", ""];
  let fibres = "";
  for (let i = 0; i < 260; i += 1) {
    const x = -3 + next() * (width + 6);
    const y = -3 + next() * (height + 6);
    const k = next() < 0.55 ? 0 : 1;
    dots[k] += `M${r(x)} ${r(y)}h0.01`;
  }
  for (let i = 0; i < 40; i += 1) {
    const x = -3 + next() * (width + 6);
    const y = -3 + next() * (height + 6);
    const a = next() * Math.PI;
    const len = 0.6 + next() * 1.4;
    fibres += `M${r(x)} ${r(y)}l${r(Math.cos(a) * len)} ${r(Math.sin(a) * len)}`;
  }
  dots = dots.map((d, k) => `<path d="${d}" stroke="${k === 0 ? dark : light}" stroke-width="${k === 0 ? 0.32 : 0.4}" stroke-linecap="round" opacity="0.55"/>`);
  return dots.join("") + `<path d="${fibres}" stroke="${dark}" stroke-width="0.1" stroke-linecap="round" opacity="0.45" fill="none"/>`;
}

/** A twisted twine string from x1 to x2 at height y. */
function twine(x1: number, x2: number, y: number, light: string, dark: string): string {
  let hatch = "";
  for (let x = x1; x < x2; x += 0.7) {
    hatch += `M${r(x - 0.25)} ${r(y + 0.4)}L${r(x + 0.25)} ${r(y - 0.4)}`;
  }
  return (
    `<line x1="${r(x1)}" y1="${r(y)}" x2="${r(x2)}" y2="${r(y)}" stroke="${light}" stroke-width="0.9"/>` +
    `<path d="${hatch}" stroke="${dark}" stroke-width="0.16" opacity="0.8"/>`
  );
}

/** A twine bow tied at (x, y). */
function twineBow(x: number, y: number, light: string, dark: string): string {
  const loop = (side: number) =>
    `<path d="M${r(x)} ${r(y)}C${r(x + side * 5)} ${r(y - 4.2)} ${r(x + side * 6.4)} ${r(y + 2.4)} ${r(x)} ${r(y)}" fill="none" stroke="${light}" stroke-width="0.8"/>` +
    `<path d="M${r(x)} ${r(y)}C${r(x + side * 5)} ${r(y - 4.2)} ${r(x + side * 6.4)} ${r(y + 2.4)} ${r(x)} ${r(y)}" fill="none" stroke="${dark}" stroke-width="0.14" stroke-dasharray="0.3 0.4"/>`;
  return (
    loop(-1) +
    loop(1) +
    `<path d="M${r(x)} ${r(y)}q-1.6 3 -3.4 5.4M${r(x)} ${r(y)}q1.2 3.2 2.6 5.8" fill="none" stroke="${light}" stroke-width="0.8" stroke-linecap="round"/>` +
    `<circle cx="${r(x)}" cy="${r(y)}" r="0.9" fill="${light}" stroke="${dark}" stroke-width="0.15"/>`
  );
}

/** An airplane seen from above, pointing right, about `size` mm long. */
function plane(x: number, y: number, size: number, fill: string, rotate = 90): string {
  const d = "M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z";
  return `<path d="${d}" fill="${fill}" transform="translate(${r(x)} ${r(y)}) scale(${r(size / 24)}) rotate(${rotate} 12 12)"/>`;
}

/** A row of barcode bars inside a box. */
function barcode(seed: number, x: number, y: number, width: number, height: number, color: string): string {
  const next = random(seed);
  let d = "";
  let at = x;
  while (at < x + width) {
    const bar = 0.2 + Math.floor(next() * 4) * 0.2;
    if (at + bar > x + width) {
      break;
    }
    d += `M${r(at)} ${r(y)}h${r(bar)}v${r(height)}h${r(-bar)}Z`;
    at += bar + 0.25 + Math.floor(next() * 3) * 0.2;
  }
  return `<path d="${d}" fill="${color}"/>`;
}

const birthday: TicketTemplate = {
  id: "birthday",
  categories: ["birthday", "party", "kids"],
  palettes: [
    { id: "festive", bg: "#ff4f79", ink: "#ffffff", muted: "#ffe4ea", accent: "#ffe14d", extra: ["#ffe14d", "#45c8ff", "#7cf29a", "#ffffff", "#b388ff"] },
    { id: "pastel", bg: "#fff4f8", ink: "#6e2a55", muted: "#93627f", accent: "#d9467a", extra: ["#ff9fbe", "#8ccaf5", "#9ce3b4", "#ffd36b", "#c6a8f5"] },
    { id: "gold", bg: "#16132e", ink: "#fff6dc", muted: "#c9c2e3", accent: "#f0c75e", extra: ["#f0c75e", "#7f6bd1", "#e9e3ff", "#c99a3a", "#ffffff"] },
  ],
  build: (p) => {
    const [first = p.accent, second = p.accent, third = p.accent, fourth = p.accent, fifth = p.accent] = p.extra;
    const art = canvas(
      W,
      H,
      p.bg,
      confetti(31, { x: 84, y: -3, width: 30, height: 40 }, p.extra, 26, 0.85) +
        confetti(32, { x: -3, y: 52.5, width: 116, height: 5 }, p.extra, 26, 0.85) +
        confetti(33, { x: 148, y: -3, width: 5, height: 61 }, p.extra, 8, 0.85) +
        curl(-3, 2, 0, 86, first, 1.1, 0.62, 0.45) +
        curl(87, -3, 82, 30, second, 1.3, 0.48) +
        curl(97.5, -3, 96, 22, third, 1.1, 0.44) +
        curl(106, -3, 88, 14, fifth, 1.0, 0.42) +
        curl(112, 53.5, -8, 42, fourth, 1.1, 0.6, 0.45) +
        gift(91, 39, 15, 12, second, first) +
        qrCard(QR[0], QR[1], QR[2]),
    );
    return {
      background: art,
      design: design(W, H, p.bg, {
        number: number(108, 4, 38, 10, "display", 22, p.ink),
        qr: QR,
        stub: STUB,
        texts: [
          block(c.birthdayCall, 8, 4.5, 74, 7.5, { font: "casual", sizePt: 13, color: p.accent }),
          block("{evento}", 8, 13, 80, 22, { font: "condensed", sizePt: 30, color: p.ink, uppercase: true, lines: 2 }),
          block("{data_extenso} · {hora}", 8, 37, 80, 5, { sizePt: 9.5, bold: true, color: p.ink }),
          block("{local}", 8, 42.5, 80, 4.5, { sizePt: 9, color: p.muted }),
          block("{preco}", 8, 47.5, 60, 4, { sizePt: 8.5, bold: true, color: p.accent }),
        ],
      }),
    };
  },
};

const fifteen: TicketTemplate = {
  id: "fifteen",
  categories: ["birthday", "formal", "party"],
  palettes: [
    { id: "pink", bg: "#fdf0f4", ink: "#6b1f45", muted: "#98667e", accent: "#c25480", extra: ["#c8963c", "#f6d2df"] },
    { id: "lilac", bg: "#f5f0fc", ink: "#44266d", muted: "#76649c", accent: "#8a5fc8", extra: ["#bf9644", "#e3d6f6"] },
    { id: "tiffany", bg: "#e8f7f6", ink: "#154e4b", muted: "#4b7c79", accent: "#23968f", extra: ["#b38d42", "#c3eae7"] },
  ],
  build: (p) => {
    const w = 65;
    const h = 120;
    const [gold = p.accent, soft = p.bg] = p.extra;
    const cx = w / 2;
    // The tiara: five peaks with curved sides over a smiling band, a jewel on every tip.
    const peaks = [
      [-12.5, 17.2],
      [-6.6, 13.4],
      [0, 8.6],
      [6.6, 13.4],
      [12.5, 17.2],
    ] as const;
    let crown = `M${r(cx - 14.5)} 21.6`;
    let prev: readonly [number, number] = [-14.5, 21.6];
    for (const [i, [px, py]] of peaks.entries()) {
      const valley: readonly [number, number] = i === 0 ? prev : [(prev[0] + px) / 2, Math.max(prev[1], py) + 2.6];
      if (i > 0) {
        crown += `Q${r(cx + (prev[0] + valley[0]) / 2)} ${r(valley[1])} ${r(cx + valley[0])} ${r(valley[1])}`;
      }
      crown += `Q${r(cx + (valley[0] + px) / 2)} ${r(valley[1])} ${r(cx + px)} ${r(py)}`;
      prev = [px, py];
    }
    crown += `Q${r(cx + 13.8)} 19.6 ${r(cx + 14.5)} 21.6Q${r(cx)} 25 ${r(cx - 14.5)} 21.6Z`;
    let jewels = "";
    for (const [px, py] of peaks) {
      jewels += `<circle cx="${r(cx + px)}" cy="${r(py - 0.9)}" r="${px === 0 ? 1 : 0.7}" fill="${gold}"/>`;
    }
    for (let i = -4; i <= 4; i += 1) {
      jewels += `<circle cx="${r(cx + i * 2.9)}" cy="${r(21.4 + 1.6 * (1 - (i / 5) ** 2) * 0.9)}" r="0.32" fill="${gold}"/>`;
    }
    const next = random(15);
    let glitter = "";
    for (let i = 0; i < 26; i += 1) {
      const gx = 7 + next() * 51;
      const gy = 5 + next() * 20;
      glitter += `<circle cx="${r(gx)}" cy="${r(gy)}" r="${r(0.12 + next() * 0.22)}" fill="${gold}" opacity="${r(0.35 + next() * 0.5)}"/>`;
    }
    const arch = (inset: number) =>
      `M${r(5 + inset)} ${r(116 - inset)}L${r(5 + inset)} 31A${r(27.5 - inset)} ${r(27.5 - inset)} 0 0 1 ${r(60 - inset)} 31L${r(60 - inset)} ${r(116 - inset)}Z`;
    const art = canvas(
      w,
      h,
      p.bg,
      `<path d="${arch(0)}" fill="${soft}" opacity="0.55"/>` +
        `<ellipse cx="32.5" cy="16" rx="30" ry="22" fill="url(#shine)"/>` +
        `<path d="${arch(0)}" fill="none" stroke="${p.accent}" stroke-width="0.35"/>` +
        `<path d="${arch(1.3)}" fill="none" stroke="${p.accent}" stroke-width="0.15"/>` +
        glitter +
        `<path d="${crown}" fill="none" stroke="${gold}" stroke-width="0.45" stroke-linejoin="round"/>` +
        `<path d="M${r(cx - 13.6)} 20.2Q${r(cx)} 23.4 ${r(cx + 13.6)} 20.2" fill="none" stroke="${gold}" stroke-width="0.25"/>` +
        `<path d="M${r(cx)} 13.6L${r(cx + 1.4)} 15.8L${r(cx)} 18L${r(cx - 1.4)} 15.8Z" fill="${gold}"/>` +
        jewels +
        sparkle(13, 12, 2.2, gold, 0.9) +
        sparkle(52.5, 9.5, 1.7, gold, 0.8) +
        sparkle(50, 22.5, 1.1, gold, 0.7) +
        sparkle(15.5, 22, 0.9, gold, 0.7) +
        sparkle(10.5, 104, 1.6, gold, 0.6) +
        sparkle(54.5, 100, 1.2, gold, 0.6) +
        `<line x1="20" y1="60.4" x2="29.5" y2="60.4" stroke="${p.accent}" stroke-width="0.3"/>` +
        `<line x1="35.5" y1="60.4" x2="45" y2="60.4" stroke="${p.accent}" stroke-width="0.3"/>` +
        sparkle(cx, 60.4, 1.6, gold) +
        qrCard(21.5, 85.5, 22),
      glow("shine", "#ffffff", 0.75),
    );
    return {
      background: art,
      design: design(w, h, p.bg, {
        number: number(8, 110.3, 49, 4.6, "sans", 8.5, p.accent, "center"),
        qr: [21.5, 85.5, 22],
        stub: null,
        texts: [
          block(c.fifteenNight, 9, 25.5, 47, 11, { font: "script", sizePt: 26, color: p.accent, align: "center" }),
          block("{evento}", 8, 37.5, 49, 15, { font: "serif", sizePt: 17, color: p.ink, align: "center", lines: 2 }),
          block("{data_extenso}", 7, 54, 51, 4.4, { sizePt: 7, bold: true, color: p.muted, align: "center", uppercase: true, letterSpacing: 0.16 }),
          block(c.atTime, 7, 63, 51, 6, { font: "serif", sizePt: 12, color: p.ink, align: "center" }),
          block("{local}", 8, 70, 49, 7.2, { sizePt: 7.5, color: p.muted, align: "center", lines: 2 }),
          block("{preco}", 8, 78, 49, 4, { sizePt: 7.5, bold: true, color: p.accent, align: "center" }),
        ],
      }),
    };
  },
};

const halloween: TicketTemplate = {
  id: "halloween",
  categories: ["party"],
  palettes: [
    { id: "purple", bg: "#1d0f37", ink: "#ffffff", muted: "#cdbbe9", accent: "#ff8a1f", extra: ["#fff0b8", "#0b0617", "#3d1c6b"] },
    { id: "pumpkin", bg: "#f47b1d", ink: "#1c0d02", muted: "#4a2306", accent: "#3e0f5c", extra: ["#fff3cc", "#1c0d02", "#d95a0a"] },
    { id: "slime", bg: "#0b1b0e", ink: "#ecffe0", muted: "#a9d19b", accent: "#8cff3f", extra: ["#e6ffc9", "#030a04", "#173d1a"] },
  ],
  build: (p) => {
    const [moon = "#ffffff", shadow = "#000000", deep = p.bg] = p.extra;
    const next = random(13);
    let stars = "";
    for (let i = 0; i < 22; i += 1) {
      stars += `<circle cx="${r(80 + next() * 72)}" cy="${r(-2 + next() * 18)}" r="${r(0.12 + next() * 0.22)}" fill="${moon}" opacity="${r(0.3 + next() * 0.5)}"/>`;
    }
    const art = canvas(
      W,
      H,
      p.bg,
      `<rect x="-3" y="-3" width="156" height="61" fill="url(#dusk)"/>` +
        stars +
        `<circle cx="99" cy="17" r="21" fill="url(#moonGlow)"/>` +
        `<circle cx="99" cy="17" r="10.5" fill="${moon}"/>` +
        `<circle cx="95.5" cy="13.5" r="2.4" fill="${shadow}" opacity="0.07"/>` +
        `<circle cx="103" cy="20.5" r="3.1" fill="${shadow}" opacity="0.07"/>` +
        `<circle cx="101.5" cy="11.5" r="1.2" fill="${shadow}" opacity="0.07"/>` +
        `<circle cx="94" cy="21" r="1.4" fill="${shadow}" opacity="0.07"/>` +
        spookyTree(6, 101, 57, 30, shadow) +
        `<path d="M58 58Q80 50.5 100 51.5T153 50.2L153 58Z" fill="${shadow}"/>` +
        `<path d="M76 52.4v-2.6a2 2 0 0 1 4 0v2.2Z" fill="${shadow}"/>` +
        bat(85, 5.5, 5.2, shadow, -12) +
        bat(91.5, 2.2, 3, shadow, 10) +
        bat(110.5, 6.5, 3.6, shadow, 6) +
        bat(106, 33.5, 2.8, shadow, -8) +
        qrCard(QR[0], QR[1], QR[2]),
      linear("dusk", [[0, p.bg], [1, deep]], 90) + glow("moonGlow", moon, 0.45),
    );
    return {
      background: art,
      design: design(W, H, p.bg, {
        number: number(108, 4, 38, 10, "condensed", 17, p.ink),
        qr: QR,
        stub: STUB,
        texts: [
          block(c.halloweenDare, 8, 4.5, 72, 7.5, { font: "casual", sizePt: 12, color: p.accent }),
          block("{evento}", 8, 13, 78, 22, { font: "condensed", sizePt: 34, color: p.ink, uppercase: true, lines: 2 }),
          block("{data_extenso} · {hora}", 8, 37, 80, 5, { sizePt: 9.5, bold: true, color: p.ink }),
          block("{local}", 8, 42.5, 80, 4.5, { sizePt: 9, color: p.muted }),
          block("{preco}", 8, 48, 50, 4, { sizePt: 8.5, bold: true, color: p.accent }),
        ],
      }),
    };
  },
};

const luau: TicketTemplate = {
  id: "luau",
  categories: ["party", "music"],
  palettes: [
    { id: "sunset", bg: "#3b1c5e", ink: "#ffffff", muted: "#ffe1cc", accent: "#ffd166", extra: ["#3b1c5e", "#c43f6c", "#ff9a4d", "#ffe08a", "#2a1648", "#160a26"] },
    { id: "moonlight", bg: "#0b1633", ink: "#ffffff", muted: "#cfdcf3", accent: "#9fd3ff", extra: ["#070f26", "#16295a", "#36558f", "#f4f1e1", "#0a1636", "#030816"] },
    { id: "tropical", bg: "#5fc8ee", ink: "#0d3549", muted: "#1c5468", accent: "#d9472b", extra: ["#4fbfea", "#a6e3f5", "#eefaf9", "#ffd23f", "#62cfd8", "#1e6e45"] },
  ],
  build: (p) => {
    const [top = p.bg, middle = p.bg, horizon = p.bg, sun = p.accent, sea = p.bg, palm = "#000000"] = p.extra;
    let shimmer = "";
    for (let i = 0; i < 6; i += 1) {
      const y = 48 + i * 1.6;
      const half = 9 - i * 1.2;
      shimmer += `<rect x="${r(95 - half)}" y="${r(y)}" width="${r(half * 2)}" height="0.5" rx="0.25" fill="${sun}" opacity="${r(0.75 - i * 0.09)}"/>`;
    }
    let waves = "";
    for (let i = 0; i < 4; i += 1) {
      const y = 49 + i * 2.2;
      waves += `<path d="M-3 ${r(y)}q4 -0.8 8 0t8 0t8 0t8 0t8 0t8 0t8 0t8 0t8 0t8 0" fill="none" stroke="#ffffff" stroke-opacity="0.16" stroke-width="0.25"/>`;
    }
    const art = canvas(
      W,
      H,
      p.bg,
      `<rect x="-3" y="-3" width="156" height="51" fill="url(#sky)"/>` +
        `<circle cx="95" cy="46.5" r="22" fill="url(#sunGlow)"/>` +
        `<circle cx="95" cy="46.5" r="12" fill="${sun}"/>` +
        `<rect x="-3" y="46.5" width="156" height="11.5" fill="${sea}"/>` +
        waves +
        shimmer +
        trunk(112, 58, 103, 5, 6, 2.6, 1.5, palm) +
        frond(103, 4.5, 195, 17, -0.18, palm) +
        frond(103, 4.5, 160, 15, -0.2, palm, 13) +
        frond(103, 4.5, 225, 11, -0.15, palm, 10) +
        frond(103, 4.5, -10, 15, 0.2, palm, 13) +
        frond(103, 4.5, -45, 10, 0.12, palm, 9) +
        frond(103, 4.5, 125, 12, -0.15, palm, 11) +
        frond(-6, -6, 30, 16, 0.18, palm, 13) +
        frond(-6, -6, 62, 15, -0.16, palm, 12) +
        frond(-6, 63, -40, 15, -0.16, palm, 12) +
        qrCard(117, 12, 28),
      linear("sky", [[0, top], [0.55, middle], [1, horizon]], 90) + glow("sunGlow", sun, 0.55),
    );
    return {
      background: art,
      design: design(W, H, p.bg, {
        number: number(108, 43.5, 38, 7, "casual", 11, p.ink),
        qr: [117, 12, 28],
        stub: null,
        texts: [
          block(c.luauBarefoot, 12, 4.5, 70, 7, { font: "casual", sizePt: 12, color: p.accent }),
          block("{evento}", 12, 12, 76, 21, { font: "casual", sizePt: 24, color: p.ink, lines: 2 }),
          block("{data_extenso} · {hora}", 12, 34.5, 74, 5, { sizePt: 9.5, bold: true, color: p.ink }),
          block("{local}", 12, 40, 70, 4.5, { sizePt: 9, color: p.muted }),
          block("{preco}", 12, 48.5, 60, 4, { sizePt: 8.5, bold: true, color: p.accent }),
        ],
      }),
    };
  },
};

const masquerade: TicketTemplate = {
  id: "masquerade",
  categories: ["party", "formal"],
  palettes: [
    { id: "gold", bg: "#0e0c0b", ink: "#f7efe0", muted: "#b9ab93", accent: "#d6b25e", extra: ["#3a2c14"] },
    { id: "silver", bg: "#0c1430", ink: "#f1f4fb", muted: "#aab4cf", accent: "#c9d1e0", extra: ["#25366e"] },
    { id: "wine", bg: "#360915", ink: "#fbeee6", muted: "#d9b4ae", accent: "#dcb563", extra: ["#6a1a2e"] },
  ],
  build: (p) => {
    const [halo = p.bg] = p.extra;
    const corner = (x: number, y: number, sx: number, sy: number) =>
      `<path d="M${r(x)} ${r(y + sy * 9)}C${r(x)} ${r(y + sy * 3)} ${r(x + sx * 3)} ${r(y)} ${r(x + sx * 9)} ${r(y)}M${r(x + sx * 2.2)} ${r(y + sy * 2.2)}c${r(sx * 1.6)} ${r(sy * -0.4)} ${r(sx * 2.4)} ${r(sy * 0.8)} ${r(sx * 1.2)} ${r(sy * 1.8)}c${r(sx * -0.9)} ${r(sy * 0.7)} ${r(sx * -1.8)} ${r(sy * -0.4)} ${r(sx * -1.2)} ${r(sy * -1.8)}" fill="none" stroke="${p.accent}" stroke-width="0.3"/>`;
    const art = canvas(
      W,
      H,
      p.bg,
      `<ellipse cx="57" cy="20" rx="58" ry="30" fill="url(#halo)"/>` +
        `<rect x="2.5" y="2.5" width="145" height="50" fill="none" stroke="${p.accent}" stroke-width="0.35"/>` +
        `<rect x="3.7" y="3.7" width="142.6" height="47.6" fill="none" stroke="${p.accent}" stroke-width="0.15"/>` +
        corner(5, 5, 1, 1) +
        corner(145, 5, -1, 1) +
        corner(5, 50, 1, -1) +
        corner(145, 50, -1, -1) +
        veneziana(57, 13.6, 0.58, p.accent) +
        scroll(40, 13, 20, -1, p.accent) +
        scroll(74, 13, 20, 1, p.accent) +
        `<line x1="111" y1="9" x2="111" y2="46" stroke="${p.accent}" stroke-width="0.2" stroke-dasharray="0.6 0.9"/>` +
        qrCard(117, 11.5, 27, 2, `stroke="${p.accent}" stroke-width="0.4"`),
      glow("halo", halo, 0.9),
    );
    return {
      background: art,
      design: design(W, H, p.bg, {
        number: number(113, 42.5, 35, 6, "serif", 11, p.accent, "center"),
        qr: [117, 11.5, 27],
        stub: null,
        texts: [
          block("{evento}", 9, 19, 96, 13.5, { font: "script", sizePt: 30, color: p.ink, align: "center" }),
          block(c.masqueradeNight, 9, 32.6, 96, 4, { sizePt: 6.5, bold: true, color: p.accent, align: "center", uppercase: true, letterSpacing: 0.35 }),
          block("{data_extenso} · {hora}", 9, 37.2, 96, 5, { font: "serif", sizePt: 10, color: p.ink, align: "center" }),
          block("{local}", 9, 42.6, 96, 4.4, { sizePt: 8.5, color: p.muted, align: "center" }),
          block("{preco}", 9, 47, 96, 3.8, { sizePt: 7.5, bold: true, color: p.accent, align: "center" }),
        ],
      }),
    };
  },
};

const christmas: TicketTemplate = {
  id: "christmas",
  categories: ["church", "school", "party"],
  palettes: [
    { id: "red", bg: "#a3161f", ink: "#fff8ef", muted: "#f6d3cc", accent: "#f2c14e", extra: ["#f2c14e", "#ffffff", "#1f7a4a", "#7e0f17"] },
    { id: "green", bg: "#0f4b31", ink: "#fffaf0", muted: "#cfe5d6", accent: "#e8c15c", extra: ["#d62839", "#e8c15c", "#ffffff", "#0a3824"] },
    { id: "night", bg: "#0d1b3d", ink: "#ffffff", muted: "#c9d5ea", accent: "#c9d6ea", extra: ["#c9d6ea", "#6f9ad6", "#ffffff", "#07112a"] },
  ],
  build: (p) => {
    const [b1 = p.accent, b2 = p.accent, b3 = p.accent, deep = p.bg] = p.extra;
    const next = random(25);
    let flakes = "";
    for (let i = 0; i < 16; i += 1) {
      const x = -2 + next() * 115;
      const y = -2 + next() * 58;
      const edge = x > 84 || y > 51 || y < 3;
      flakes += snowflake(x, y, edge ? 1.6 + next() * 1.8 : 1 + next() * 1.2, "#ffffff", edge ? 0.45 : 0.14);
    }
    const art = canvas(
      W,
      H,
      p.bg,
      `<rect x="-3" y="-3" width="156" height="61" fill="url(#deep)"/>` +
        flakes +
        snowflake(150, 51, 3, "#ffffff", 0.35) +
        snowflake(112, 52, 1.8, "#ffffff", 0.35) +
        bauble(92, 9, 3.6, b1, p.muted, p.accent) +
        bauble(101, 19, 4.2, b2, p.muted, p.accent) +
        bauble(109.5, 4, 2.6, b3, p.muted, p.accent) +
        bauble(124, 1.5, 2.3, b2, p.muted, p.accent) +
        bauble(135.5, 3.5, 2.6, b1, p.muted, p.accent) +
        bauble(145.5, 0.5, 2.1, b3, p.muted, p.accent) +
        star(96.5, 33, 1.6, p.accent, 0.9) +
        star(88.5, 22, 1.1, p.accent, 0.8) +
        star(106, 42, 1.2, p.accent, 0.8) +
        `<path d="M-3 58L-3 54.2Q8 52.6 20 54Q36 55.6 52 53.8Q70 52 88 54Q104 55.6 120 53.6Q136 51.8 153 53.8L153 58Z" fill="#ffffff" opacity="0.92"/>` +
        qrCard(QR[0], 15, QR[2]),
      linear("deep", [[0, p.bg], [1, deep]], 90),
    );
    return {
      background: art,
      design: design(W, H, p.bg, {
        number: number(108, 45.5, 38, 6.5, "serif", 11, p.accent),
        qr: [QR[0], 15, QR[2]],
        stub: STUB,
        texts: [
          block(c.merryChristmas, 8, 3.5, 78, 10, { font: "script", sizePt: 21, color: p.accent }),
          block("{evento}", 8, 13.5, 80, 20, { font: "serif", sizePt: 26, color: p.ink, lines: 2 }),
          block("{data_extenso} · {hora}", 8, 35.5, 80, 5, { sizePt: 9.5, bold: true, color: p.ink }),
          block("{local}", 8, 41, 80, 4.5, { sizePt: 9, color: p.muted }),
          block("{preco}", 8, 46.5, 60, 4, { sizePt: 8.5, bold: true, color: p.accent }),
        ],
      }),
    };
  },
};

const gala: TicketTemplate = {
  id: "gala",
  categories: ["formal", "business"],
  palettes: [
    { id: "black", bg: "#0b0b0c", ink: "#f6ecd2", muted: "#b8ab8c", accent: "#d4af55", extra: ["#18150e"] },
    { id: "emerald", bg: "#062b22", ink: "#f3ecd6", muted: "#a9c4b6", accent: "#d9b35f", extra: ["#0a3a2e"] },
    { id: "navy", bg: "#0c1932", ink: "#f5ead6", muted: "#b0bbd1", accent: "#e3c99a", extra: ["#13254a"] },
  ],
  build: (p) => {
    const [panel = p.bg] = p.extra;
    // Rows of overlapping fans (a deco "scale" pattern), each row drawn over the one above it.
    let fans = "";
    for (let row = 0; row < 15; row += 1) {
      const y = 6 + row * 3.4;
      for (let col = -1; col < 4; col += 1) {
        fans += fan(4 + col * 8 + (row % 2) * 4, y, 4, p.accent, panel);
      }
    }
    let rays = "";
    for (let k = 0; k <= 12; k += 1) {
      const a = Math.PI + (k * Math.PI) / 12;
      rays += `M${r(130 + Math.cos(a) * 2.2)} ${r(50.6 + Math.sin(a) * 2.2)}L${r(130 + Math.cos(a) * 5.6)} ${r(50.6 + Math.sin(a) * 5.6)}`;
    }
    const art = canvas(
      W,
      H,
      p.bg,
      `<clipPath id="panel"><rect x="4.4" y="4.4" width="18.6" height="46.2"/></clipPath>` +
        `<g clip-path="url(#panel)"><rect x="4.4" y="4.4" width="18.6" height="46.2" fill="${panel}"/>${fans}</g>` +
        `<path d="${stepped(2.5, 2.5, 145, 50, 1.6)}" fill="none" stroke="${p.accent}" stroke-width="0.45"/>` +
        `<path d="${stepped(4.4, 4.4, 141.2, 46.2, 1.2)}" fill="none" stroke="${p.accent}" stroke-width="0.18"/>` +
        `<line x1="23" y1="4.4" x2="23" y2="50.6" stroke="${p.accent}" stroke-width="0.45"/>` +
        `<line x1="24.2" y1="4.4" x2="24.2" y2="50.6" stroke="${p.accent}" stroke-width="0.18"/>` +
        `<line x1="111" y1="8" x2="111" y2="47" stroke="${p.accent}" stroke-width="0.25"/>` +
        `<path d="M111 25.5L112.6 27.5L111 29.5L109.4 27.5Z" fill="${p.accent}"/>` +
        `<path d="${rays}" stroke="${p.accent}" stroke-width="0.25" opacity="0.6"/>` +
        `<line x1="30" y1="35" x2="52" y2="35" stroke="${p.accent}" stroke-width="0.3"/>` +
        `<path d="M54 35L55.4 33.6L56.8 35L55.4 36.4Z" fill="${p.accent}"/>` +
        qrCard(117, 11, 26, 2, `stroke="${p.accent}" stroke-width="0.4"`),
    );
    return {
      background: art,
      design: design(W, H, p.bg, {
        number: number(113, 39.6, 34, 5.6, "display", 13, p.accent, "center"),
        qr: [117, 11, 26],
        stub: null,
        texts: [
          block(c.invite, 30, 7.5, 70, 4, { sizePt: 7, bold: true, color: p.accent, uppercase: true, letterSpacing: 0.45 }),
          block("{evento}", 30, 12.5, 78, 22, { font: "display", sizePt: 32, color: p.ink, uppercase: true, letterSpacing: 0.06, lines: 2 }),
          block("{data_extenso} · {hora}", 30, 37, 78, 4.5, { sizePt: 8, bold: true, color: p.accent, uppercase: true, letterSpacing: 0.12 }),
          block("{local}", 30, 41.8, 78, 4.5, { sizePt: 8.5, color: p.ink }),
          block(c.galaDressCode, 30, 46.4, 50, 3.4, { sizePt: 6, color: p.muted, uppercase: true, letterSpacing: 0.2 }),
          block("{preco}", 78, 46.2, 30, 3.6, { sizePt: 7.5, bold: true, color: p.ink, align: "right" }),
        ],
      }),
    };
  },
};

const floral: TicketTemplate = {
  id: "floral",
  categories: ["formal", "birthday"],
  palettes: [
    { id: "blush", bg: "#fffaf7", ink: "#5b2f3a", muted: "#8f6b72", accent: "#b9576d", extra: ["#f4a9b8", "#e57d93", "#93b38a", "#f8cdb0"] },
    { id: "lavender", bg: "#fbf9fd", ink: "#3d2d5c", muted: "#776a8f", accent: "#7f5fb8", extra: ["#c9b5ec", "#9d80d6", "#98b39d", "#ead8f6"] },
    { id: "sunflower", bg: "#fffdf4", ink: "#4a3510", muted: "#7d6a45", accent: "#b57a0c", extra: ["#ffd25e", "#f2a81d", "#8cab68", "#ffeaa6"] },
  ],
  build: (p) => {
    const [petal = p.accent, deep = p.accent, green = p.accent, wash = p.bg] = p.extra;
    const heart = p.ink;
    const next = random(19);
    let drops = "";
    for (const [bx, by] of [[14, 14], [108, 47], [143, 50]] as const) {
      for (let i = 0; i < 6; i += 1) {
        drops += `<circle cx="${r(bx + (next() - 0.5) * 16)}" cy="${r(by + (next() - 0.5) * 12)}" r="${r(0.2 + next() * 0.5)}" fill="${deep}" opacity="${r(0.25 + next() * 0.3)}"/>`;
      }
    }
    const corner =
      `<ellipse cx="9" cy="8" rx="17" ry="13" fill="${wash}" opacity="0.7"/>` +
      leaf(13, 13, 10, 35, green) +
      leaf(7, 15, 9, 85, green) +
      leaf(19, 6, 8, 5, green, 0.45) +
      leaf(3, 20, 6, 110, green, 0.45) +
      bloom(8, 7, 12, "pa", "pb", heart, 10) +
      bloom(21, 2, 7, "pb", "pa", heart, 30, 5) +
      bloom(2, 19, 6.5, "pa", "pb", heart, 0, 5);
    const bottom =
      `<ellipse cx="106" cy="52" rx="13" ry="8" fill="${wash}" opacity="0.7"/>` +
      leaf(102, 51, 9, 195, green) +
      leaf(109, 49, 8, -55, green) +
      leaf(96, 54, 6, 160, green, 0.45) +
      bloom(105, 52, 9.5, "pa", "pb", heart, 15) +
      bloom(95, 56, 5.5, "pb", "pa", heart, 40, 5);
    const right =
      `<ellipse cx="148" cy="53" rx="10" ry="8" fill="${wash}" opacity="0.7"/>` +
      leaf(144, 52, 8, 200, green) +
      leaf(147, 48.5, 6, 255, green, 0.45) +
      bloom(149, 53, 8.5, "pa", "pb", heart, 20) +
      leaf(144, 3, 6, 165, green, 0.45) +
      bloom(149.5, 2, 6, "pb", "pa", heart, 10, 5);
    const art = canvas(
      W,
      H,
      p.bg,
      `<rect x="3" y="3" width="144" height="49" fill="none" stroke="${p.accent}" stroke-opacity="0.45" stroke-width="0.25"/>` +
        `<g filter="url(#wet)">${corner}${bottom}${right}</g>` +
        drops +
        qrCard(117, 13, 26, 2, `stroke="${p.accent}" stroke-opacity="0.5" stroke-width="0.25"`),
      `<filter id="wet" x="-0.1" y="-0.1" width="1.2" height="1.2"><feGaussianBlur stdDeviation="0.16"/></filter>` + petalWash("pa", petal) + petalWash("pb", deep),
    );
    return {
      background: art,
      design: design(W, H, p.bg, {
        number: number(113, 42.5, 34, 5.5, "sans", 9, p.accent, "center"),
        qr: [117, 13, 26],
        stub: null,
        texts: [
          block(c.floralCelebrate, 22, 6, 82, 4, { sizePt: 6.5, bold: true, color: p.accent, align: "center", uppercase: true, letterSpacing: 0.35 }),
          block("{evento}", 22, 10.5, 82, 20, { font: "script", sizePt: 32, color: p.ink, align: "center", lines: 2 }),
          block("{data_extenso}", 22, 31.5, 82, 4.5, { sizePt: 7.5, bold: true, color: p.muted, align: "center", uppercase: true, letterSpacing: 0.18 }),
          block(c.atTime, 22, 37, 82, 5, { font: "serif", sizePt: 10, color: p.accent, align: "center" }),
          block("{local}", 22, 42.4, 82, 4.5, { sizePt: 8.5, color: p.ink, align: "center" }),
          block("{preco}", 22, 47.2, 82, 3.8, { sizePt: 7.5, color: p.muted, align: "center" }),
        ],
      }),
    };
  },
};

const babyShower: TicketTemplate = {
  id: "babyShower",
  categories: ["party", "kids"],
  palettes: [
    { id: "blue", bg: "#e5f1fb", ink: "#2a4a72", muted: "#587596", accent: "#3f86c9", extra: ["#ffffff", "#f5cf62", "#cde2f4", "#9cc5ea"] },
    { id: "pink", bg: "#fdedf3", ink: "#7a3557", muted: "#9b6681", accent: "#d4628d", extra: ["#ffffff", "#f3c35e", "#f7d5e2", "#f2a7c3"] },
    { id: "mint", bg: "#e9f6ef", ink: "#2c5545", muted: "#5b7d6f", accent: "#3f9e7b", extra: ["#ffffff", "#f1c94f", "#d0eadc", "#a8dcc2"] },
  ],
  build: (p) => {
    const [white = "#ffffff", gold = p.accent, shade = p.bg, soft = p.accent] = p.extra;
    const next = random(41);
    let dots = "";
    for (let i = 0; i < 18; i += 1) {
      dots += `<circle cx="${r(84 + next() * 30)}" cy="${r(2 + next() * 46)}" r="${r(0.25 + next() * 0.35)}" fill="${soft}" opacity="0.8"/>`;
    }
    const hang = (x: number, drop: number) => `<line x1="${r(x)}" y1="-3" x2="${r(x)}" y2="${r(drop)}" stroke="${p.muted}" stroke-width="0.18" opacity="0.7"/>`;
    const art = canvas(
      W,
      H,
      p.bg,
      `<mask id="crescent"><rect x="80" y="0" width="30" height="40" fill="#ffffff"/><circle cx="101.5" cy="17.2" r="7.4" fill="#000000"/></mask>` +
        dots +
        hang(97, 10.5) +
        `<circle cx="97" cy="20" r="9" fill="${gold}" mask="url(#crescent)"/>` +
        hang(88.5, 26) +
        star(88.5, 28.5, 2.6, gold) +
        hang(107, 18) +
        star(107, 20.5, 2.2, gold) +
        hang(112, 7) +
        star(112, 9, 1.5, gold) +
        star(150, 3, 1.6, white) +
        star(4, 2.5, 1.2, soft, 0.8) +
        cloud(86, 51.5, 26, white, shade) +
        cloud(-5, 61, 24, white, shade) +
        cloud(54, 58.5, 26, white, shade) +
        cloud(132, 58, 26, white, shade) +
        cloud(102, 59, 20, white, shade) +
        qrCard(QR[0], QR[1], QR[2]),
    );
    return {
      background: art,
      design: design(W, H, p.bg, {
        number: number(108, 4, 38, 9, "casual", 12, p.ink),
        qr: QR,
        stub: null,
        texts: [
          block(c.babyOnTheWay, 8, 4.5, 74, 7.5, { font: "casual", sizePt: 12, color: p.accent }),
          block("{evento}", 8, 12.5, 76, 21, { font: "casual", sizePt: 21, color: p.ink, lines: 2 }),
          block("{data_extenso} · {hora}", 8, 35, 78, 5, { sizePt: 9.5, bold: true, color: p.ink }),
          block("{local}", 8, 40.5, 78, 4.5, { sizePt: 9, color: p.muted }),
          block("{preco}", 8, 45.5, 60, 4, { sizePt: 8.5, bold: true, color: p.accent }),
        ],
      }),
    };
  },
};

const diploma: TicketTemplate = {
  id: "diploma",
  categories: ["school", "formal"],
  palettes: [
    { id: "navy", bg: "#fbf8ef", ink: "#14264d", muted: "#55627f", accent: "#a8832f", extra: ["#14264d", "#f1e9d2"] },
    { id: "wine", bg: "#fcf6f1", ink: "#5c1426", muted: "#86606a", accent: "#a8832f", extra: ["#5c1426", "#f3e4d8"] },
    { id: "emerald", bg: "#f6f8f1", ink: "#183d2b", muted: "#5a6e62", accent: "#a08532", extra: ["#183d2b", "#e4ebda"] },
  ],
  build: (p) => {
    const [emblem = p.ink, soft = p.bg] = p.extra;
    const corner = (x: number, y: number) =>
      `<rect x="${r(x - 0.9)}" y="${r(y - 0.9)}" width="1.8" height="1.8" fill="${p.accent}" transform="rotate(45 ${r(x)} ${r(y)})"/>`;
    const art = canvas(
      W,
      H,
      p.bg,
      `<circle cx="18.5" cy="27.5" r="15" fill="${soft}"/>` +
        `<rect x="2.3" y="2.3" width="145.4" height="50.4" fill="none" stroke="${p.ink}" stroke-width="0.55"/>` +
        `<rect x="3.6" y="3.6" width="142.8" height="47.8" fill="none" stroke="${p.accent}" stroke-width="0.25"/>` +
        corner(3.6, 3.6) +
        corner(146.4, 3.6) +
        corner(3.6, 51.4) +
        corner(146.4, 51.4) +
        laurel(18.5, 27.5, 11, p.accent) +
        mortarboard(18.5, 26, 11, emblem, p.accent) +
        `<line x1="35" y1="35.3" x2="62" y2="35.3" stroke="${p.accent}" stroke-width="0.35"/>` +
        `<line x1="110.5" y1="9" x2="110.5" y2="46" stroke="${p.accent}" stroke-width="0.25"/>` +
        qrCard(QR[0], QR[1], QR[2], 2, `stroke="${p.accent}" stroke-width="0.3"`),
    );
    return {
      background: art,
      design: design(W, H, p.bg, {
        number: number(106, 5, 38, 9, "serif", 13, p.accent),
        qr: QR,
        stub: STUB,
        texts: [
          block(c.diplomaCeremony, 35, 7.5, 70, 4.5, { sizePt: 7.5, bold: true, color: p.accent, uppercase: true, letterSpacing: 0.3 }),
          block("{evento}", 35, 13, 72, 20.5, { font: "serif", sizePt: 21, color: p.ink, lines: 2 }),
          block("{data_extenso} · {hora}", 35, 37.2, 72, 5, { sizePt: 9, bold: true, color: p.ink }),
          block("{local}", 35, 42.5, 72, 4.5, { sizePt: 8.5, color: p.muted }),
          block("{preco}", 35, 47, 50, 4, { sizePt: 8, bold: true, color: p.accent }),
        ],
      }),
    };
  },
};

const kraft: TicketTemplate = {
  id: "kraft",
  categories: ["formal", "party"],
  palettes: [
    { id: "kraft", bg: "#c9a37a", ink: "#38251a", muted: "#5b412c", accent: "#9e3326", extra: ["#efdcbc", "#8a6847", "#4c6a37", "#8f6d4b", "#e2c8a3"] },
    { id: "linen", bg: "#f3eee3", ink: "#3b3328", muted: "#6e6556", accent: "#2f5b8a", extra: ["#d7c3a0", "#9c8160", "#6b8a5a", "#b8ab95", "#ffffff"] },
    { id: "chalkboard", bg: "#2b3530", ink: "#f3f1e8", muted: "#c6cbc1", accent: "#f2d47c", extra: ["#e1d2b0", "#8f7d5a", "#a8c79a", "#1f2723", "#56635c"] },
  ],
  build: (p) => {
    const [light = p.bg, dark = p.ink, green = p.ink, speckDark = p.ink, speckLight = p.bg] = p.extra;
    let ticks = "";
    for (let k = 0; k < 24; k += 1) {
      const a = (k * Math.PI) / 12;
      ticks += `M${r(91 + Math.cos(a) * 9.1)} ${r(31.5 + Math.sin(a) * 9.1)}L${r(91 + Math.cos(a) * 9.9)} ${r(31.5 + Math.sin(a) * 9.9)}`;
    }
    const stamp =
      `<g opacity="0.88" transform="rotate(-8 91 31.5)">` +
      `<circle cx="91" cy="31.5" r="11.2" fill="none" stroke="${p.accent}" stroke-width="0.7" stroke-dasharray="6 0.4 3 0.3 9 0.5 4 0.3"/>` +
      `<circle cx="91" cy="31.5" r="8.4" fill="none" stroke="${p.accent}" stroke-width="0.3"/>` +
      `<path d="${ticks}" stroke="${p.accent}" stroke-width="0.3"/>` +
      `</g>`;
    const art = canvas(
      W,
      H,
      p.bg,
      speckles(8, W, H, speckDark, speckLight) +
        twine(-3, 153, 3, light, dark) +
        twineBow(100, 3, light, dark) +
        stamp +
        star(91, 22.4, 0.8, p.accent, 0.85) +
        branch([77, 52], [101, 45.5], 0.16, 7, green, 1.8) +
        branch([102.5, 25], [107, 15], 0.18, 4, green, 1.5) +
        qrCard(QR[0], QR[1], QR[2], 2, `stroke="${dark}" stroke-width="0.3" stroke-dasharray="1 0.7"`),
    );
    return {
      background: art,
      design: design(W, H, p.bg, {
        number: number(108, 7, 38, 8, "slab", 12, p.ink),
        qr: QR,
        stub: null,
        texts: [
          block(c.kraftSaveDate, 8, 9, 64, 4.5, { sizePt: 7, bold: true, color: p.muted, uppercase: true, letterSpacing: 0.35 }),
          // One line: the script's swashes are never cut by a line box.
          block("{evento}", 8, 15, 68, 16, { font: "script", sizePt: 32, color: p.ink }),
          block("{dia}", 82, 24, 18, 10, { font: "slab", sizePt: 22, color: p.accent, align: "center" }),
          block("{mes_curto} {ano}", 82, 34.4, 18, 3.6, { sizePt: 6, bold: true, color: p.accent, align: "center", uppercase: true, letterSpacing: 0.1 }),
          block("{data_extenso} · {hora}", 8, 35.5, 70, 5, { sizePt: 9.5, bold: true, color: p.ink }),
          block("{local}", 8, 41, 70, 4.5, { sizePt: 9, color: p.muted }),
          block("{preco}", 8, 46.5, 60, 4.5, { font: "slab", sizePt: 10, color: p.ink }),
        ],
      }),
    };
  },
};

const boarding: TicketTemplate = {
  id: "boarding",
  categories: ["party", "school"],
  palettes: [
    { id: "sky", bg: "#f6f9fd", ink: "#0f2747", muted: "#5a6f8c", accent: "#1f6fd1", extra: ["#ffffff", "#e3edf9", "#0f2747"] },
    { id: "coral", bg: "#fff8f5", ink: "#3a1410", muted: "#8a5d55", accent: "#e0483a", extra: ["#ffffff", "#fde4dc", "#3a1410"] },
    { id: "night", bg: "#111827", ink: "#f9fafb", muted: "#9ca3af", accent: "#38bdf8", extra: ["#0b1220", "#1c2636", "#e5e7eb"] },
  ],
  build: (p) => {
    const [head = "#ffffff", tint = p.bg, bars = p.ink] = p.extra;
    let holes = "";
    for (let y = 11; y < 55; y += 2.2) {
      holes += `<circle cx="108.5" cy="${r(y)}" r="0.4" fill="${p.muted}" opacity="0.7"/>`;
    }
    const art = canvas(
      W,
      H,
      p.bg,
      `<rect x="108.5" y="9" width="44.5" height="49" fill="${tint}"/>` +
        `<rect x="-3" y="-3" width="156" height="12" fill="${p.accent}"/>` +
        `<rect x="-3" y="9" width="156" height="0.6" fill="${bars}" opacity="0.15"/>` +
        plane(6, 0.8, 6.4, head) +
        holes +
        `<circle cx="108.5" cy="9" r="1.6" fill="${p.bg}"/>` +
        `<circle cx="108.5" cy="55" r="1.6" fill="${p.bg}"/>` +
        `<path d="M58 14.3Q76 10.6 94 14.3" fill="none" stroke="${p.accent}" stroke-width="0.3" stroke-dasharray="0.8 0.8"/>` +
        `<circle cx="58" cy="14.3" r="0.8" fill="${p.accent}"/>` +
        plane(94, 11.6, 5, p.accent, 102) +
        `<line x1="8" y1="29" x2="104" y2="29" stroke="${p.muted}" stroke-width="0.2" opacity="0.6"/>` +
        barcode(4, 8, 46, 48, 6.5, bars) +
        qrCard(117, 18.5, 28),
    );
    const label = { sizePt: 5.5, bold: true, color: p.muted, uppercase: true, letterSpacing: 0.3 } as const;
    return {
      background: art,
      design: design(W, H, p.bg, {
        number: number(108, 1.8, 40, 5.5, "mono", 9.5, head),
        qr: [117, 18.5, 28],
        stub: null,
        texts: [
          block(c.boardingTitle, 15, 1.9, 80, 5.2, { sizePt: 8.5, bold: true, color: head, uppercase: true, letterSpacing: 0.25 }),
          block(c.boardingDestination, 8, 12.4, 46, 3.5, label),
          block("{evento}", 8, 15.6, 98, 12, { font: "display", sizePt: 32, color: p.ink, uppercase: true }),
          block(c.boardingTime, 8, 31, 44, 3.5, label),
          block("{data} · {hora}", 8, 34.5, 46, 5.5, { font: "mono", sizePt: 9.5, bold: true, color: p.ink }),
          block(c.boardingGate, 56, 31, 46, 3.5, label),
          block("{local}", 56, 34.5, 50, 5.5, { sizePt: 9, bold: true, color: p.ink }),
          block("{preco}", 112, 49.6, 38, 4, { font: "mono", sizePt: 8, bold: true, color: p.ink, align: "center" }),
        ],
      }),
    };
  },
};

export const CELEBRATIONS_TEMPLATES: readonly TicketTemplate[] = [
  birthday,
  fifteen,
  halloween,
  luau,
  masquerade,
  christmas,
  gala,
  floral,
  babyShower,
  diploma,
  kraft,
  boarding,
];
