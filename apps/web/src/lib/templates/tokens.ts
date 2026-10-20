/**
 * Templates of the tokens set, listed in catalog.ts: consumption tokens (fichas, ADR 0084), all
 * TOKEN_W × TOKEN_H with the QR at TOKEN_QR and the category band down the left edge, so the art
 * only matters from x ≈ 5 onwards. The product (`{categoria}`) is the biggest text, on one line.
 */

import type { NumberStyle, TextBlock, TicketDesign } from "@ingressoimpresso/api-types";

import { templates as templatesTexts } from "@/texts/pt-BR/templates";

import { block, design, number, TOKEN_BAND, TOKEN_H, TOKEN_QR, TOKEN_W, type TicketTemplate } from "./kit";
import { canvas, confetti, glow, linear, qrCard, r, random, star } from "./svg";

const c = templatesTexts.content;
const [QX, QY, QS] = TOKEN_QR;

/** A token's design: the QR at TOKEN_QR, no stub and the category band on the left. */
function tokenDesign(bg: string, parts: { number: NumberStyle; texts: TextBlock[] }): TicketDesign {
  return { ...design(TOKEN_W, TOKEN_H, bg, { number: parts.number, qr: TOKEN_QR, stub: null, texts: parts.texts }), band: TOKEN_BAND };
}

/** A rectangle whose corners are cut inwards (quarter circles of radius `n`), like old tickets. */
function notched(x1: number, y1: number, x2: number, y2: number, n: number): string {
  const a = `A${r(n)} ${r(n)} 0 0 0`;
  return `M${r(x1 + n)} ${r(y1)}H${r(x2 - n)}${a} ${r(x2)} ${r(y1 + n)}V${r(y2 - n)}${a} ${r(x2 - n)} ${r(y2)}H${r(x1 + n)}${a} ${r(x1)} ${r(y2 - n)}V${r(y1 + n)}${a} ${r(x1 + n)} ${r(y1)}Z`;
}

/** A neon tube: a wide soft halo, the coloured glass and a bright core along the same path. */
function neon(d: string, color: string): string {
  const stroke = `fill="none" stroke-linecap="round" stroke-linejoin="round"`;
  return (
    `<path d="${d}" ${stroke} stroke="${color}" stroke-width="1.6" opacity="0.18"/>` +
    `<path d="${d}" ${stroke} stroke="${color}" stroke-width="0.8" opacity="0.5"/>` +
    `<path d="${d}" ${stroke} stroke="#ffffff" stroke-width="0.25" opacity="0.9"/>`
  );
}

/** A four-pointed sparkle of radius `size`. */
function sparkle(x: number, y: number, size: number, fill: string, opacity = 1): string {
  const q = `Q${r(x)} ${r(y)}`;
  return `<path d="M${r(x)} ${r(y - size)}${q} ${r(x + size)} ${r(y)}${q} ${r(x)} ${r(y + size)}${q} ${r(x - size)} ${r(y)}${q} ${r(x)} ${r(y - size)}Z" fill="${fill}" opacity="${opacity}"/>`;
}

/** A flame of half-width `w` and height `h` standing on `base`, its tip leaning a little. */
function flame(x: number, base: number, w: number, h: number, fill: string, lean = 0): string {
  const tip = base - h;
  return `<path d="M${r(x - w)} ${r(base)}C${r(x - w * 1.1)} ${r(base - h * 0.55)} ${r(x - w * 0.15 + lean)} ${r(base - h * 0.7)} ${r(x + lean)} ${r(tip)}C${r(x + w * 0.35 + lean)} ${r(base - h * 0.6)} ${r(x + w * 1.1)} ${r(base - h * 0.5)} ${r(x + w)} ${r(base)}Z" fill="${fill}"/>`;
}

/** A curled carnival streamer (serpentina): loops along a gentle wave from `x1` to `x2`. */
function streamer(x1: number, x2: number, y: number, size: number, color: string, phase = 0): string {
  const points: string[] = [];
  const step = size * 0.5;
  for (let t = 0; x1 + step * t - size * Math.sin(t) <= x2; t += 0.4) {
    const x = x1 + step * t - size * Math.sin(t);
    points.push(`${r(x)},${r(y + Math.sin(x / 6 + phase) * 1.1 - size * Math.cos(t))}`);
  }
  return `<polyline points="${points.join(" ")}" fill="none" stroke="${color}" stroke-width="0.45" stroke-linecap="round" stroke-linejoin="round"/>`;
}

const tokenBeer: TicketTemplate = {
  id: "tokenBeer",
  categories: ["tokens"],
  palettes: [
    { id: "amber", bg: "#f2a51c", ink: "#3a1904", muted: "#6b3507", accent: "#8a2c03", extra: ["#b45309", "#fff8e6", "#ffcb4f", "#e2780b", "#fff4c7", "#6b3507"] },
    { id: "stout", bg: "#24140c", ink: "#fff3df", muted: "#d8bf9f", accent: "#f2b35a", extra: ["#8b5a2b", "#f0e0c2", "#4a2b18", "#140a05", "#c99a62", "#4a2b18"] },
    { id: "cola", bg: "#b5141f", ink: "#ffffff", muted: "#ffd6d6", accent: "#ffd166", extra: ["#7a0a12", "#fdf1e4", "#dc2430", "#760a13", "#ffffff", "#7a0a12"] },
  ],
  build: (p) => {
    const [, foam = "#ffffff", top = p.bg, bottom = p.bg, bubble = "#ffffff", foamInk = p.muted] = p.extra;
    const next = random(21);
    // The head of foam: a band with a bubbly lower edge, a darker row behind it for depth.
    let head = "";
    let shade = "";
    for (let x = 4; x < 67; x += 2 + next() * 1.3) {
      const radius = 1.1 + next() * 1.1;
      const y = 4.4 + next() * 0.7;
      shade += `<circle cx="${r(x + 0.4)}" cy="${r(y + 0.55)}" r="${r(radius)}" fill="${bottom}" opacity="0.35"/>`;
      head += `<circle cx="${r(x)}" cy="${r(y)}" r="${r(radius)}" fill="${foam}"/>`;
    }
    let pores = "";
    for (let i = 0; i < 14; i += 1) {
      pores += `<circle cx="${r(36 + next() * 30)}" cy="${r(-2 + next() * 6)}" r="${r(0.2 + next() * 0.35)}" fill="${bottom}" opacity="0.12"/>`;
    }
    // Bubbles rising through the drink, away from the texts and the QR.
    let bubbles = "";
    const rise = (box: { x: number; y: number; width: number; height: number }, count: number) => {
      for (let i = 0; i < count; i += 1) {
        const radius = 0.3 + next() * 0.65;
        bubbles += `<circle cx="${r(box.x + next() * box.width)}" cy="${r(box.y + next() * box.height)}" r="${r(radius)}" fill="${bubble}" fill-opacity="0.18" stroke="${bubble}" stroke-width="0.16" stroke-opacity="0.75"/>`;
      }
    };
    rise({ x: 7, y: 28.5, width: 27, height: 9 }, 11);
    rise({ x: 61.6, y: 8, width: 3.6, height: 30 }, 7);
    rise({ x: 37, y: 35.4, width: 23, height: 2.4 }, 5);
    const art = canvas(
      TOKEN_W,
      TOKEN_H,
      p.bg,
      `<rect x="-3" y="-3" width="69" height="44" fill="url(#glass)"/>` +
        `<rect x="6.2" y="7" width="1.1" height="31" fill="#ffffff" opacity="0.12"/>` +
        bubbles +
        shade +
        `<rect x="-3" y="-3" width="69" height="7.6" fill="${foam}"/>` +
        head +
        pores +
        qrCard(QX, QY, QS, 1.5),
      linear("glass", [[0, top], [1, bottom]], 90),
    );
    return {
      background: art,
      design: tokenDesign(p.bg, {
        number: number(35.5, 31.4, 25, 3.6, "mono", 7, p.muted, "center"),
        texts: [
          block("{evento}", 8.5, 0.8, 26, 3.6, { sizePt: 6, bold: true, color: foamInk, uppercase: true, letterSpacing: 0.12 }),
          // One line that shrinks to fit: a product name is never broken in the middle.
          block("{categoria}", 8.5, 8.6, 26, 10.5, { font: "condensed", sizePt: 22, color: p.ink, uppercase: true }),
          block("{preco}", 8.5, 20.6, 26, 5.6, { font: "slab", sizePt: 12, color: p.accent }),
        ],
      }),
    };
  },
};

const tokenFood: TicketTemplate = {
  id: "tokenFood",
  categories: ["tokens"],
  palettes: [
    { id: "red", bg: "#ffffff", ink: "#2b1a12", muted: "#6b5a50", accent: "#d62828", extra: ["#d62828", "#d62828"] },
    { id: "green", bg: "#ffffff", ink: "#15301c", muted: "#55665a", accent: "#2f8f46", extra: ["#2f8f46", "#2f8f46"] },
    { id: "yellow", bg: "#ffffff", ink: "#3b2905", muted: "#6e5a32", accent: "#e3a008", extra: ["#c98a06", "#a35f00"] },
  ],
  build: (p) => {
    const [, price = p.accent] = p.extra;
    // Gingham tablecloth: two half-transparent stripes, darker where they cross.
    const gingham = `<pattern id="gingham" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="2" height="4" fill="${p.accent}" opacity="0.38"/><rect width="4" height="2" fill="${p.accent}" opacity="0.38"/></pattern>`;
    // A plate between a fork and a knife, under the QR.
    const cutlery =
      `<circle cx="48" cy="34.3" r="2.6" fill="#ffffff"/>` +
      `<circle cx="48" cy="34.3" r="1.7" fill="none" stroke="${p.accent}" stroke-width="0.25"/>` +
      `<path d="M42.15 31.5V33.3M42.95 31.5V33.3M43.75 31.5V33.3" fill="none" stroke="#ffffff" stroke-width="0.34" stroke-linecap="round"/>` +
      `<path d="M41.98 33.1H43.92Q43.92 34.3 43.25 34.6V37.1Q42.95 37.4 42.65 37.1V34.6Q41.98 34.3 41.98 33.1Z" fill="#ffffff"/>` +
      `<path d="M53.4 31.4Q55 32.4 54.6 35H53.4ZM53.1 34.8H53.9V37.1Q53.5 37.4 53.1 37.1Z" fill="#ffffff"/>`;
    const art = canvas(
      TOKEN_W,
      TOKEN_H,
      "#ffffff",
      `<rect x="-3" y="-3" width="69" height="44" fill="url(#gingham)"/>` +
        // The menu card the texts sit on, with a stitched edge.
        `<rect x="7" y="2" width="27.4" height="34" rx="1.6" fill="#ffffff"/>` +
        `<rect x="7.8" y="2.8" width="25.8" height="32.4" rx="1.1" fill="none" stroke="${p.accent}" stroke-width="0.22" stroke-dasharray="0.9 0.6"/>` +
        `<line x1="10.5" y1="20.4" x2="31" y2="20.4" stroke="${p.accent}" stroke-width="0.25" opacity="0.6"/>` +
        cutlery +
        qrCard(QX, QY, QS, 1.5),
      gingham,
    );
    return {
      background: art,
      design: tokenDesign(p.bg, {
        number: number(9, 30.2, 23.4, 3.6, "mono", 7, p.muted, "center"),
        texts: [
          block("{evento}", 9, 4.2, 23.4, 3.6, { sizePt: 6, bold: true, color: p.muted, uppercase: true, letterSpacing: 0.1, align: "center" }),
          block("{categoria}", 9, 8.6, 23.4, 10.5, { font: "condensed", sizePt: 22, color: p.ink, uppercase: true, align: "center" }),
          block("{preco}", 9, 22.2, 23.4, 6, { font: "display", sizePt: 19, color: price, align: "center" }),
        ],
      }),
    };
  },
};

const tokenRetro: TicketTemplate = {
  id: "tokenRetro",
  categories: ["tokens"],
  palettes: [
    { id: "retro", bg: "#f6ecd3", ink: "#b3121f", muted: "#5c3b24", accent: "#e3a21a", extra: ["#b3121f", "#b3121f", "#1f3a5f"] },
    { id: "teal", bg: "#f4ecd8", ink: "#0e6467", muted: "#4b3b2c", accent: "#e76f51", extra: ["#0e6467", "#0e6467", "#c2452d"] },
    { id: "mustard", bg: "#fbf1d6", ink: "#3e2a14", muted: "#5c4528", accent: "#b5381f", extra: ["#d99a1b", "#d99a1b", "#b5381f"] },
  ],
  build: (p) => {
    const [, frame = p.ink, ribbon = p.ink] = p.extra;
    // Punched scallops where the token is cut, along the top, bottom and right edges.
    let holes = "";
    for (let x = 7; x < 62; x += 2.6) {
      holes += `<circle cx="${r(x)}" cy="0" r="0.7" fill="${p.bg}"/><circle cx="${r(x)}" cy="38" r="0.7" fill="${p.bg}"/>`;
    }
    for (let y = 3.2; y < 36; y += 2.6) {
      holes += `<circle cx="63" cy="${r(y)}" r="0.7" fill="${p.bg}"/>`;
    }
    const art = canvas(
      TOKEN_W,
      TOKEN_H,
      frame,
      holes +
        `<path d="${notched(6.3, 1.3, 61.7, 36.7, 2.6)}" fill="${p.bg}"/>` +
        `<path d="${notched(7.2, 2.2, 60.8, 35.8, 3.4)}" fill="none" stroke="${frame}" stroke-width="0.25" stroke-dasharray="0.9 0.6"/>` +
        // A swallowtail ribbon under the price, like a fair poster.
        `<path d="M8.6 20.8H33.4L31.8 23.7L33.4 26.6H8.6L10.2 23.7Z" fill="${ribbon}"/>` +
        star(12, 32.1, 1.35, p.accent) +
        star(29.6, 32.1, 1.35, p.accent) +
        qrCard(QX, QY, QS, 1.5, `stroke="${frame}" stroke-width="0.3"`),
    );
    return {
      background: art,
      design: tokenDesign(p.bg, {
        number: number(14, 30.4, 13.6, 3.6, "mono", 7, p.muted, "center"),
        texts: [
          block("{evento}", 10.8, 4.4, 20, 3.6, { font: "display", sizePt: 9, color: p.muted, uppercase: true, letterSpacing: 0.15, align: "center" }),
          block("{categoria}", 9, 9.2, 23.6, 10.2, { font: "slab", sizePt: 20, color: p.ink, uppercase: true, align: "center" }),
          block("{preco}", 11, 21.1, 19.8, 5.2, { font: "slab", sizePt: 11, color: p.bg, align: "center" }),
          block(c.tokenUnit, 37.5, 31.6, 21, 3.4, { font: "display", sizePt: 8, color: p.muted, uppercase: true, letterSpacing: 0.1, align: "center" }),
        ],
      }),
    };
  },
};

const tokenNeon: TicketTemplate = {
  id: "tokenNeon",
  categories: ["tokens"],
  palettes: [
    { id: "pink", bg: "#0c0816", ink: "#ffffff", muted: "#bdb6d6", accent: "#ff2ea6", extra: ["#e11d8a", "#22e4ff"] },
    { id: "cyan", bg: "#06111a", ink: "#ffffff", muted: "#a9c6d3", accent: "#22e4ff", extra: ["#0891b2", "#ff4fd8"] },
    { id: "lime", bg: "#0a0e08", ink: "#ffffff", muted: "#bcc7ae", accent: "#b6ff3b", extra: ["#65a30d", "#c084fc"] },
  ],
  build: (p) => {
    const [, second = p.accent] = p.extra;
    let wave = "M9.4 20.4";
    for (let x = 9.4; x < 30; x += 3) {
      wave += `q0.75 -1 1.5 0t1.5 0`;
    }
    // A cocktail glass drawn in one neon line.
    const glass = "M27.4 29.6H32.4L29.9 32.3ZM29.9 32.3V35.2M28.4 35.2H31.4M29.4 30.6L31.6 27.9";
    const art = canvas(
      TOKEN_W,
      TOKEN_H,
      p.bg,
      `<ellipse cx="8" cy="2" rx="30" ry="18" fill="url(#halo)"/>` +
        `<ellipse cx="60" cy="38" rx="30" ry="16" fill="url(#halo2)"/>` +
        neon(wave, second) +
        neon(glass, p.accent) +
        neon(`M${r(QX - 2.7)} ${r(QY - 0.2)}V${r(QY - 2.7)}H${r(QX - 0.2)}M${r(QX + QS + 0.2)} ${r(QY + QS + 2.7)}H${r(QX + QS + 2.7)}V${r(QY + QS + 0.2)}`, second) +
        `<rect x="${r(QX - 1.5)}" y="${r(QY - 1.5)}" width="${r(QS + 3)}" height="${r(QS + 3)}" rx="2" fill="none" stroke="${p.accent}" stroke-width="1.4" opacity="0.35"/>` +
        qrCard(QX, QY, QS, 1.5),
      glow("halo", p.accent, 0.3) + glow("halo2", second, 0.22),
    );
    return {
      background: art,
      design: tokenDesign(p.bg, {
        number: number(8.5, 30.5, 18, 3.6, "mono", 7, p.muted, "left"),
        texts: [
          block("{evento}", 8.5, 3, 26, 3.6, { sizePt: 6, bold: true, color: p.muted, uppercase: true, letterSpacing: 0.15 }),
          block("{categoria}", 8.5, 8.2, 26, 10.5, { font: "display", sizePt: 26, color: p.ink, uppercase: true, letterSpacing: 0.04 }),
          block("{preco}", 8.5, 22.2, 26, 5.6, { font: "display", sizePt: 17, color: p.accent, letterSpacing: 0.04 }),
          block(c.tokenUnit, 35.5, 32.2, 25, 3.4, { sizePt: 5.5, color: p.muted, align: "center" }),
        ],
      }),
    };
  },
};

const tokenCandy: TicketTemplate = {
  id: "tokenCandy",
  categories: ["tokens"],
  palettes: [
    { id: "pink", bg: "#ffe4ef", ink: "#8c1c4f", muted: "#a14f78", accent: "#e2457f", extra: ["#e2457f", "#ff9cc2", "#5ccfb0"] },
    { id: "mint", bg: "#ddf6ec", ink: "#0f5a44", muted: "#3f7a67", accent: "#1d9a70", extra: ["#1d9a70", "#7fdcb6", "#ff8fb6"] },
    { id: "lavender", bg: "#eee6ff", ink: "#45247e", muted: "#6a529b", accent: "#7a4bd6", extra: ["#7a4bd6", "#b9a1f5", "#ffc25c"] },
  ],
  build: (p) => {
    const [, stripe = p.accent, second = p.accent] = p.extra;
    const stripes = `<pattern id="candy" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="3" height="3" fill="#ffffff"/><rect width="1.5" height="3" fill="${stripe}"/></pattern>`;
    // Candy-wrapper bands along the top and bottom, with scalloped inner edges.
    let top = `<rect x="-3" y="-3" width="69" height="5.6"/>`;
    let bottom = `<rect x="-3" y="35.9" width="69" height="5.1"/>`;
    for (let x = 4.6; x < 67; x += 2.4) {
      top += `<circle cx="${r(x)}" cy="2.6" r="1.2"/>`;
      bottom += `<circle cx="${r(x)}" cy="35.9" r="1.2"/>`;
    }
    // A lollipop: stick, then a swirl of the second colour.
    const lollipop =
      `<line x1="31.4" y1="31.2" x2="31.4" y2="36" stroke="${p.muted}" stroke-width="0.55" stroke-linecap="round"/>` +
      `<circle cx="31.4" cy="30" r="2.3" fill="#ffffff"/>` +
      `<path d="M31.4 30m-0.4 0a0.4 0.4 0 1 1 0.8 0a0.9 0.9 0 1 1 -1.8 0a1.4 1.4 0 1 1 2.8 0a1.9 1.9 0 1 1 -3.8 0" fill="none" stroke="${second}" stroke-width="0.55" stroke-linecap="round"/>`;
    const art = canvas(
      TOKEN_W,
      TOKEN_H,
      p.bg,
      `<g fill="url(#candy)">${top}${bottom}</g>` +
        // The price sits on a rounded pill.
        `<rect x="8.6" y="21" width="20.4" height="6" rx="3" fill="${p.accent}"/>` +
        lollipop +
        qrCard(QX, QY, QS, 1.5, `stroke="${stripe}" stroke-width="0.35"`),
      stripes,
    );
    return {
      background: art,
      design: tokenDesign(p.bg, {
        number: number(8.6, 29.1, 20.4, 3.6, "mono", 7, p.muted, "left"),
        texts: [
          block("{evento}", 8.6, 5, 26, 3.6, { sizePt: 6.5, bold: true, color: p.muted }),
          block("{categoria}", 8.6, 8.9, 26, 11, { font: "casual", sizePt: 18, color: p.ink }),
          block("{preco}", 9.8, 21.2, 18, 5.6, { sizePt: 11, bold: true, color: "#ffffff", align: "center" }),
          block(c.tokenUnit, 35.5, 31.2, 25, 3.4, { sizePt: 5.5, bold: true, color: p.muted, align: "center" }),
        ],
      }),
    };
  },
};

const tokenCoin: TicketTemplate = {
  id: "tokenCoin",
  categories: ["tokens"],
  palettes: [
    { id: "gold", bg: "#1f3f94", ink: "#4a2c00", muted: "#7a5410", accent: "#ffffff", extra: ["#f2b705", "#ffd84d", "#e3a300", "#b07a00", "#fff4b8"] },
    { id: "silver", bg: "#3b1f5e", ink: "#262b36", muted: "#4f5869", accent: "#ffffff", extra: ["#9aa3b2", "#eef1f5", "#c5cbd5", "#858fa0", "#ffffff"] },
    { id: "bronze", bg: "#0d7f86", ink: "#3f1d08", muted: "#6b3716", accent: "#ffffff", extra: ["#c26a2b", "#f0ac6d", "#d6853f", "#9a5222", "#ffdcb5"] },
  ],
  build: (p) => {
    const [, face = "#ffd84d", rim = "#e3a300", deep = "#b07a00", shine = "#ffffff"] = p.extra;
    const [cx, cy, radius] = [19.9, 18.9, 14.7];
    // Sunburst behind the coin.
    let rays = "";
    for (let i = 0; i < 28; i += 2) {
      const a1 = (i / 28) * Math.PI * 2;
      const a2 = ((i + 1) / 28) * Math.PI * 2;
      rays += `<polygon points="${r(cx)},${r(cy)} ${r(cx + Math.cos(a1) * 80)},${r(cy + Math.sin(a1) * 80)} ${r(cx + Math.cos(a2) * 80)},${r(cy + Math.sin(a2) * 80)}" fill="#ffffff" opacity="0.07"/>`;
    }
    // The ridged rim: short radial ticks all around.
    let ridges = "";
    for (let i = 0; i < 90; i += 1) {
      const a = (i / 90) * Math.PI * 2;
      const [cos, sin] = [Math.cos(a), Math.sin(a)];
      ridges += `<line x1="${r(cx + cos * (radius - 1.3))}" y1="${r(cy + sin * (radius - 1.3))}" x2="${r(cx + cos * (radius - 0.15))}" y2="${r(cy + sin * (radius - 0.15))}" stroke="${deep}" stroke-width="0.2"/>`;
    }
    let dots = "";
    for (let i = 0; i < 48; i += 1) {
      const a = (i / 48) * Math.PI * 2;
      dots += `<circle cx="${r(cx + Math.cos(a) * (radius - 2.6))}" cy="${r(cy + Math.sin(a) * (radius - 2.6))}" r="0.2" fill="${deep}" opacity="0.6"/>`;
    }
    const inner = radius - 1.4;
    const coin =
      `<circle cx="${r(cx + 0.7)}" cy="${r(cy + 0.9)}" r="${r(radius)}" fill="#000000" opacity="0.25"/>` +
      `<circle cx="${r(cx)}" cy="${r(cy)}" r="${r(radius)}" fill="${rim}"/>` +
      ridges +
      `<circle cx="${r(cx)}" cy="${r(cy)}" r="${r(inner)}" fill="url(#face)" stroke="${deep}" stroke-width="0.3"/>` +
      dots +
      `<path d="M${r(cx - inner * 0.8)} ${r(cy - inner * 0.35)}A${r(inner - 0.9)} ${r(inner - 0.9)} 0 0 1 ${r(cx - inner * 0.2)} ${r(cy - inner * 0.88)}" fill="none" stroke="${shine}" stroke-width="0.6" stroke-linecap="round" opacity="0.8"/>` +
      star(cx, cy - 8.6, 1.3, deep);
    const art = canvas(
      TOKEN_W,
      TOKEN_H,
      p.bg,
      rays +
        coin +
        sparkle(9, 35.6, 1.3, "#ffffff", 0.8) +
        sparkle(32.6, 2.4, 1, "#ffffff", 0.7) +
        sparkle(62.2, 2.6, 1.1, rim) +
        qrCard(QX, QY, QS, 1.5),
      linear("face", [[0, shine], [0.45, face], [1, rim]], 60),
    );
    return {
      background: art,
      design: tokenDesign(p.bg, {
        number: number(13.4, 26.4, 13, 3.2, "mono", 6.5, p.muted, "center"),
        texts: [
          block("{categoria}", 9.4, 11.4, 21, 8.4, { font: "display", sizePt: 22, color: p.ink, uppercase: true, align: "center" }),
          block("{preco}", 10.4, 20.2, 19, 5.4, { font: "slab", sizePt: 10.5, color: p.muted, align: "center" }),
          block("{evento}", 35.5, 31.8, 25, 3.6, { sizePt: 6, bold: true, color: p.accent, uppercase: true, letterSpacing: 0.08, align: "center" }),
        ],
      }),
    };
  },
};

const tokenMinimal: TicketTemplate = {
  id: "tokenMinimal",
  categories: ["tokens"],
  palettes: [
    { id: "black", bg: "#ffffff", ink: "#111111", muted: "#555555", accent: "#111111", extra: ["#111111"] },
    { id: "blue", bg: "#ffffff", ink: "#0b2a6b", muted: "#4a5f80", accent: "#0b2a6b", extra: ["#0b2a6b"] },
  ],
  build: (p) => {
    // Only corner marks and one hairline: almost no ink on a home printer.
    const mark = (x: number, y: number, dx: number, dy: number) =>
      `<path d="M${r(x + dx * 2.6)} ${r(y)}H${r(x)}V${r(y + dy * 2.6)}" fill="none" stroke="${p.accent}" stroke-width="0.25"/>`;
    const art = canvas(
      TOKEN_W,
      TOKEN_H,
      p.bg,
      mark(6.6, 1.6, 1, 1) +
        mark(61.4, 1.6, -1, 1) +
        mark(6.6, 36.4, 1, -1) +
        mark(61.4, 36.4, -1, -1) +
        `<line x1="8.6" y1="23.4" x2="33" y2="23.4" stroke="${p.accent}" stroke-width="0.2"/>`,
    );
    return {
      background: art,
      design: tokenDesign(p.bg, {
        number: number(8.6, 31.6, 20, 3.4, "mono", 6.5, p.muted, "left"),
        texts: [
          block("{evento}", 8.6, 3.4, 26, 3.4, { sizePt: 6, color: p.muted, uppercase: true, letterSpacing: 0.2 }),
          block("{categoria}", 8.6, 8, 26, 14, { font: "display", sizePt: 36, color: p.ink, uppercase: true }),
          block("{preco}", 8.6, 24.8, 26, 5.4, { sizePt: 12, bold: true, color: p.ink }),
          block(c.tokenUnit, 35.5, 31.8, 25, 3.4, { sizePt: 5.5, color: p.muted, align: "center" }),
        ],
      }),
    };
  },
};

const tokenCarnival: TicketTemplate = {
  id: "tokenCarnival",
  categories: ["tokens"],
  palettes: [
    { id: "folia", bg: "#4a148c", ink: "#ffffff", muted: "#eadcff", accent: "#ffd60a", extra: ["#ff4d6d", "#ffd60a", "#4cc9f0", "#80ed99", "#ff9f1c"] },
    { id: "frevo", bg: "#0b3d91", ink: "#ffffff", muted: "#dbe7ff", accent: "#ffd23f", extra: ["#ee4266", "#ffd23f", "#3bceac", "#ffffff", "#f78c6b"] },
  ],
  build: (p) => {
    const [first = p.accent, second = p.accent] = p.extra;
    const art = canvas(
      TOKEN_W,
      TOKEN_H,
      p.bg,
      `<ellipse cx="22" cy="18" rx="24" ry="16" fill="url(#spot)"/>` +
        confetti(41, { x: 5, y: -3, width: 61, height: 4.6 }, p.extra, 26) +
        confetti(42, { x: 5, y: 33.6, width: 61, height: 7.4 }, p.extra, 30) +
        confetti(43, { x: 61.4, y: 2, width: 4.6, height: 32 }, p.extra, 12) +
        confetti(44, { x: 7, y: 27.6, width: 27, height: 5 }, p.extra, 9, 0.7) +
        streamer(3, 68, 0.9, 1.25, first) +
        streamer(3, 68, 37, 1.25, second, 2) +
        qrCard(QX, QY, QS, 1.5),
      glow("spot", "#ffffff", 0.12),
    );
    return {
      background: art,
      design: tokenDesign(p.bg, {
        number: number(35.5, 31.3, 25, 3.4, "mono", 7, p.muted, "center"),
        texts: [
          block("{evento}", 8.5, 3.4, 26, 4.6, { font: "casual", sizePt: 8, color: p.accent }),
          block("{categoria}", 8.5, 9, 26, 10.5, { font: "condensed", sizePt: 22, color: p.ink, uppercase: true }),
          block("{preco}", 8.5, 20.8, 26, 6, { font: "display", sizePt: 18, color: p.accent, letterSpacing: 0.04 }),
        ],
      }),
    };
  },
};

const tokenChurrasco: TicketTemplate = {
  id: "tokenChurrasco",
  categories: ["tokens"],
  palettes: [
    { id: "fire", bg: "#3a2215", ink: "#fff3e0", muted: "#e3c7a4", accent: "#ffb21e", extra: ["#e4572e", "#e63912", "#ff8c1a", "#ffd23f", "#4a2c1b", "#24140b"] },
    { id: "charcoal", bg: "#1f1f1f", ink: "#f5f5f5", muted: "#c4c4c4", accent: "#ff8a3d", extra: ["#c2410c", "#b91c1c", "#ea580c", "#fbbf24", "#2b2b2b", "#111111"] },
  ],
  build: (p) => {
    const [, outer = p.accent, middle = p.accent, core = p.accent, plank = p.bg, grain = "#000000"] = p.extra;
    const next = random(31);
    // Wood planks with wavy grain.
    let wood = `<rect x="-3" y="12.4" width="69" height="12.8" fill="${plank}"/>`;
    for (const y of [12.4, 25.2]) {
      wood += `<rect x="-3" y="${r(y - 0.2)}" width="69" height="0.4" fill="${grain}" opacity="0.8"/>`;
    }
    const wobble = () => (next() - 0.5) * 1.6;
    for (let i = 0; i < 11; i += 1) {
      const y = 0.4 + i * 3.4 + next() * 1.2;
      const d = `M-3 ${r(y)}C14 ${r(y + wobble())} 24 ${r(y + wobble())} 36 ${r(y + wobble())}S56 ${r(y + wobble())} 66 ${r(y + wobble())}`;
      wood += `<path d="${d}" fill="none" stroke="${grain}" stroke-width="${r(0.15 + next() * 0.2)}" opacity="${r(0.3 + next() * 0.3)}"/>`;
    }
    // A knot in the wood, between the price and the flames.
    wood += `<ellipse cx="22" cy="29.4" rx="1.8" ry="0.6" fill="none" stroke="${grain}" stroke-width="0.2" opacity="0.6"/><ellipse cx="22" cy="29.4" rx="0.8" ry="0.25" fill="${grain}" opacity="0.6"/>`;
    // Flames along the bottom, three layers from red to yellow.
    let fire = "";
    for (const [fill, w, h, spread, seed] of [
      [outer, 2.6, 7.4, 3, 1],
      [middle, 1.9, 5.2, 2.6, 2],
      [core, 1.1, 3, 2.3, 3],
    ] as const) {
      const jitter = random(40 + seed);
      for (let x = 4.4; x < 67; x += spread) {
        const height = h * (0.7 + jitter() * 0.55);
        fire += flame(x + jitter() * 0.8, 40.6, w, height, fill, (jitter() - 0.5) * 1.6);
      }
    }
    const art = canvas(
      TOKEN_W,
      TOKEN_H,
      p.bg,
      wood + `<rect x="-3" y="22" width="69" height="19" fill="url(#heat)"/>` + fire + qrCard(QX, QY, QS, 1.5),
      linear("heat", [[0, middle, 0], [1, outer, 0.55]], 90),
    );
    return {
      background: art,
      design: tokenDesign(p.bg, {
        number: number(35.5, 1.6, 25, 3.4, "mono", 7, p.muted, "center"),
        texts: [
          block("{evento}", 8.5, 3, 26, 3.6, { sizePt: 6, bold: true, color: p.muted, uppercase: true, letterSpacing: 0.12 }),
          block("{categoria}", 8.5, 8.4, 26, 10.5, { font: "condensed", sizePt: 22, color: p.ink, uppercase: true }),
          block("{preco}", 8.5, 20.4, 26, 5.8, { font: "slab", sizePt: 12, color: p.accent }),
        ],
      }),
    };
  },
};

const tokenBold: TicketTemplate = {
  id: "tokenBold",
  categories: ["tokens"],
  palettes: [
    { id: "red", bg: "#d7263d", ink: "#ffffff", muted: "#ffdce1", accent: "#ffffff", extra: ["#7f0e1f", "#b81d32"] },
    { id: "blue", bg: "#1d4ed8", ink: "#ffffff", muted: "#dbe6ff", accent: "#ffffff", extra: ["#0f2a7a", "#1840b8"] },
    { id: "green", bg: "#15803d", ink: "#ffffff", muted: "#d6f5e0", accent: "#ffffff", extra: ["#0a4521", "#106832"] },
    { id: "orange", bg: "#e0590e", ink: "#ffffff", muted: "#ffe6d6", accent: "#ffffff", extra: ["#7f3004", "#c24c0a"] },
  ],
  build: (p) => {
    const [, shade = p.bg] = p.extra;
    const art = canvas(
      TOKEN_W,
      TOKEN_H,
      p.bg,
      `<circle cx="13" cy="44" r="17" fill="${shade}"/>` +
        `<circle cx="64.5" cy="-1" r="5.5" fill="none" stroke="#ffffff" stroke-width="0.6" opacity="0.35"/>` +
        `<rect x="8.5" y="7.4" width="6" height="0.7" fill="#ffffff"/>` +
        qrCard(QX, QY, QS, 1.5),
    );
    return {
      background: art,
      design: tokenDesign(p.bg, {
        number: number(8.5, 31.2, 22, 3.6, "mono", 7, p.muted, "left"),
        texts: [
          block("{evento}", 8.5, 2.8, 26, 3.6, { sizePt: 6, bold: true, color: p.muted, uppercase: true, letterSpacing: 0.12 }),
          block("{categoria}", 8.5, 9, 26, 11, { font: "condensed", sizePt: 24, color: p.ink, uppercase: true }),
          block("{preco}", 8.5, 21.4, 26, 6, { sizePt: 14, bold: true, color: p.accent }),
          block(c.tokenUnit, 35.5, 32, 25, 3.4, { sizePt: 5.5, bold: true, color: p.muted, align: "center" }),
        ],
      }),
    };
  },
};

export const TOKENS_TEMPLATES: readonly TicketTemplate[] = [
  tokenBeer,
  tokenFood,
  tokenRetro,
  tokenNeon,
  tokenCandy,
  tokenCoin,
  tokenMinimal,
  tokenCarnival,
  tokenChurrasco,
  tokenBold,
];
