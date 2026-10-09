/**
 * Ready-made tickets for the most common kinds of event. A template is a design (positions,
 * typefaces, text blocks with fields such as `{evento}`) plus a background drawn as SVG; applying
 * one rasterizes the background at 300 dpi and uploads it as the event's art, so the printed file
 * and every later edit work exactly like with an art of the user's own.
 */

import type { FontChoice, NumberStyle, StubStyle, TextBlock, TicketDesign } from "@ingressoimpresso/api-types";

import { texts } from "@/texts/pt-BR";

import { bokeh, branch, bunting, burst, canvas, confetti, glow, heart, linear, qrCard, r, random, star } from "./svg";

const c = texts.templates.content;

export type TemplateCategory = keyof typeof texts.templates.categories;
export type TemplateId = keyof typeof texts.templates.items;

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
function block(text: string, x: number, y: number, width: number, height: number, style: Partial<TextBlock> = {}): TextBlock {
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

function number(x: number, y: number, width: number, height: number, font: FontChoice, sizePt: number, color: string, align: NumberStyle["align"] = "right"): NumberStyle {
  return { xMm: x, yMm: y, widthMm: width, heightMm: height, font, sizePt, color, align, prefix: "Nº ", digits: 4 };
}

const STUB: StubStyle = { side: "left", widthMm: 40, fields: [...texts.event.design.defaultStubFields] };

function design(
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
  };
}

/** The usual 150 × 55 mm ticket: texts on the left, number above the QR on the right. */
const W = 150;
const H = 55;
const QR: [number, number, number] = [117, 19, 28];

const show: TicketTemplate = {
  id: "show",
  categories: ["music", "party"],
  palettes: [
    { id: "neon", bg: "#0b0b12", ink: "#ffffff", muted: "#a5a5bd", accent: "#ff2e88", extra: ["#22d3ee", "#7c3aed"] },
    { id: "fire", bg: "#120806", ink: "#fff7ed", muted: "#d6b8a8", accent: "#ff6a13", extra: ["#ffd23f", "#e11d48"] },
    { id: "acid", bg: "#0c0f0a", ink: "#f7ffe8", muted: "#b7c2a5", accent: "#b6ff3b", extra: ["#8b5cf6", "#22c55e"] },
  ],
  build: (p) => {
    const [second = p.accent, third = p.accent] = p.extra;
    const defs =
      linear("beam", [[0, p.accent, 0.95], [1, third, 0.55]], 90) + glow("halo", p.accent, 0.35) + glow("halo2", second, 0.3);
    const art = canvas(
      W,
      H,
      p.bg,
      `<ellipse cx="10" cy="0" rx="60" ry="34" fill="url(#halo)"/>` +
        `<ellipse cx="150" cy="58" rx="50" ry="30" fill="url(#halo2)"/>` +
        `<polygon points="94,-3 116,-3 96,58 74,58" fill="url(#beam)" opacity="0.85"/>` +
        `<polygon points="119,-3 125,-3 105,58 99,58" fill="${second}" opacity="0.7"/>` +
        bokeh(7, { x: 0, y: 0, width: 90, height: 55 }, "#ffffff", 10) +
        qrCard(QR[0], QR[1], QR[2]),
      defs,
    );
    return {
      background: art,
      design: design(W, H, p.bg, {
        number: number(108, 4, 38, 10, "display", 24, p.ink),
        qr: QR,
        stub: STUB,
        texts: [
          block(c.live, 8, 6, 70, 4.5, { font: "sans", bold: true, sizePt: 7.5, color: p.accent, uppercase: true, letterSpacing: 0.3 }),
          block("{evento}", 8, 11.5, 92, 22, { font: "condensed", sizePt: 34, color: p.ink, uppercase: true, lines: 2 }),
          block("{data_extenso} · {hora}", 8, 35, 92, 7, { font: "display", sizePt: 17, color: second }),
          block("{local}", 8, 43, 92, 4.5, { sizePt: 9, color: p.muted }),
          block("{preco}", 8, 48.5, 60, 4, { sizePt: 8.5, bold: true, color: p.ink }),
        ],
      }),
    };
  },
};

const arraia: TicketTemplate = {
  id: "arraia",
  categories: ["school", "church", "party"],
  palettes: [
    { id: "classic", bg: "#fff4dc", ink: "#d62839", muted: "#7a4a2a", accent: "#5c3317", extra: ["#e63946", "#f4a261", "#2a9d8f", "#457b9d", "#e9c46a"] },
    { id: "night", bg: "#1b2045", ink: "#ffd166", muted: "#c9cbe6", accent: "#f1f1f1", extra: ["#ef476f", "#ffd166", "#06d6a0", "#118ab2", "#f78c6b"] },
  ],
  build: (p) => {
    const check = `<pattern id="xadrez" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="2" height="4" fill="${p.ink}" opacity="0.35"/><rect width="4" height="2" fill="${p.ink}" opacity="0.35"/></pattern>`;
    const art = canvas(
      W,
      H,
      p.bg,
      bunting(-3, 153, -1.5, 3, p.extra, p.accent) +
        `<rect x="-3" y="51" width="156" height="7" fill="url(#xadrez)"/>` +
        `<rect x="-3" y="50.6" width="156" height="0.5" fill="${p.ink}" opacity="0.6"/>` +
        qrCard(QR[0], QR[1], QR[2], 2, `stroke="${p.accent}" stroke-width="0.35" stroke-dasharray="1 0.8"`),
      check,
    );
    return {
      background: art,
      design: design(W, H, p.bg, {
        number: number(108, 9.5, 38, 7, "slab", 15, p.muted),
        qr: QR,
        stub: STUB,
        texts: [
          block("{evento}", 8, 11, 96, 18, { font: "slab", sizePt: 28, color: p.ink, lines: 2 }),
          block("{data_extenso}", 8, 31, 96, 5, { sizePt: 10, bold: true, color: p.muted }),
          block(c.fromTime, 8, 37, 96, 4.5, { sizePt: 9, color: p.muted }),
          block("{local}", 8, 42, 96, 4.5, { sizePt: 9, color: p.muted }),
          block("{preco}", 8, 46.5, 60, 4, { font: "slab", sizePt: 9, color: p.ink }),
        ],
      }),
    };
  },
};

const church: TicketTemplate = {
  id: "church",
  categories: ["church", "formal"],
  palettes: [
    { id: "sky", bg: "#f2f7fd", ink: "#1d3557", muted: "#56708f", accent: "#c9a227", extra: ["#cfe3fa"] },
    { id: "lavender", bg: "#f6f2fb", ink: "#3c2a63", muted: "#6f5c93", accent: "#b48a3c", extra: ["#e2d6f3"] },
    { id: "earth", bg: "#fbf6ef", ink: "#4a3426", muted: "#85674f", accent: "#a8763e", extra: ["#efdcc4"] },
  ],
  build: (p) => {
    const [soft = p.bg] = p.extra;
    let rays = "";
    for (let i = 0; i < 9; i += 1) {
      const a = 100 + i * 9;
      const rad = (a * Math.PI) / 180;
      const spread = 0.05;
      rays += `<polygon points="153,-3 ${r(153 + Math.cos(rad - spread) * 200)},${r(-3 + Math.sin(rad - spread) * 200)} ${r(153 + Math.cos(rad + spread) * 200)},${r(-3 + Math.sin(rad + spread) * 200)}" fill="#ffffff" opacity="0.45"/>`;
    }
    const art = canvas(
      W,
      H,
      p.bg,
      `<ellipse cx="150" cy="0" rx="95" ry="60" fill="url(#light)"/>` +
        rays +
        `<circle cx="-6" cy="60" r="26" fill="${soft}" opacity="0.8"/>` +
        `<line x1="8" y1="34.2" x2="34" y2="34.2" stroke="${p.accent}" stroke-width="0.4"/>` +
        qrCard(QR[0], QR[1], QR[2]),
      glow("light", soft, 1),
    );
    return {
      background: art,
      design: design(W, H, p.bg, {
        number: number(108, 4, 38, 9, "sans", 13, p.muted),
        qr: QR,
        stub: STUB,
        texts: [
          block(c.invite, 8, 6, 70, 4.5, { bold: true, sizePt: 7.5, color: p.accent, uppercase: true, letterSpacing: 0.35 }),
          block("{evento}", 8, 11.5, 96, 21, { font: "serif", sizePt: 26, color: p.ink, lines: 2 }),
          block("{data_extenso} · {hora}", 8, 36.5, 96, 5, { sizePt: 9.5, bold: true, color: p.ink }),
          block("{local}", 8, 42, 96, 4.5, { sizePt: 9, color: p.muted }),
          block("{preco}", 8, 47.5, 60, 4, { sizePt: 8.5, color: p.muted }),
        ],
      }),
    };
  },
};

const graduation: TicketTemplate = {
  id: "graduation",
  categories: ["school", "formal"],
  palettes: [
    { id: "navy", bg: "#0f1f3d", ink: "#f6f0df", muted: "#b9c2d6", accent: "#d4af37", extra: [] },
    { id: "wine", bg: "#3d0b17", ink: "#f8eee4", muted: "#d3b3ae", accent: "#d9b45a", extra: [] },
    { id: "black", bg: "#111114", ink: "#f2f2f2", muted: "#a8a8b3", accent: "#c7c9d1", extra: [] },
  ],
  build: (p) => {
    const w = 60;
    const h = 120;
    const corner = (x: number, y: number, sx: number, sy: number) =>
      `<path d="M${x} ${r(y + sy * 7)}L${x} ${y}L${r(x + sx * 7)} ${y}" fill="none" stroke="${p.accent}" stroke-width="0.5"/>` +
      `<rect x="${r(x + sx * 1.6 - 0.8)}" y="${r(y + sy * 1.6 - 0.8)}" width="1.6" height="1.6" fill="${p.accent}" transform="rotate(45 ${r(x + sx * 1.6)} ${r(y + sy * 1.6)})"/>`;
    const art = canvas(
      w,
      h,
      p.bg,
      `<ellipse cx="30" cy="0" rx="45" ry="40" fill="url(#shine)"/>` +
        `<rect x="3" y="3" width="54" height="114" fill="none" stroke="${p.accent}" stroke-width="0.25"/>` +
        corner(4.5, 4.5, 1, 1) +
        corner(55.5, 4.5, -1, 1) +
        corner(4.5, 115.5, 1, -1) +
        corner(55.5, 115.5, -1, -1) +
        `<line x1="18" y1="55.5" x2="42" y2="55.5" stroke="${p.accent}" stroke-width="0.35"/>` +
        `<rect x="29.2" y="54.7" width="1.6" height="1.6" fill="${p.accent}" transform="rotate(45 30 55.5)"/>` +
        qrCard(19, 86, 22),
      glow("shine", p.accent, 0.22),
    );
    return {
      background: art,
      design: design(w, h, p.bg, {
        number: number(5, 110.5, 50, 5, "sans", 9, p.accent, "center"),
        qr: [19, 86, 22],
        stub: null,
        texts: [
          block(c.graduation, 5, 12, 50, 16, { font: "script", sizePt: 34, color: p.accent, align: "center" }),
          block("{evento}", 6, 31, 48, 20, { sizePt: 10.5, bold: true, color: p.ink, align: "center", uppercase: true, letterSpacing: 0.12, lines: 3 }),
          block("{dia}", 5, 58.5, 50, 12, { font: "serif", sizePt: 34, color: p.ink, align: "center" }),
          block("{mes} · {ano}", 5, 71, 50, 4.5, { sizePt: 8, bold: true, color: p.accent, align: "center", uppercase: true, letterSpacing: 0.25 }),
          block("{hora}", 5, 76, 50, 4, { sizePt: 8, color: p.muted, align: "center" }),
          block("{local}", 5, 80.3, 50, 3.6, { sizePt: 7, color: p.muted, align: "center" }),
        ],
      }),
    };
  },
};

const wedding: TicketTemplate = {
  id: "wedding",
  categories: ["formal"],
  palettes: [
    { id: "sage", bg: "#fbf8f2", ink: "#34412f", muted: "#7a8574", accent: "#b8975a", extra: ["#9caf88"] },
    { id: "rose", bg: "#fdf6f4", ink: "#5a2e35", muted: "#9a7177", accent: "#c08d6b", extra: ["#e4a9b2"] },
    { id: "ivory", bg: "#fffdf8", ink: "#2b2b2b", muted: "#77736b", accent: "#b8975a", extra: ["#cbb889"] },
  ],
  build: (p) => {
    const [leaf = p.accent] = p.extra;
    const art = canvas(
      W,
      H,
      p.bg,
      `<rect x="2.5" y="2.5" width="145" height="50" fill="none" stroke="${p.accent}" stroke-width="0.3"/>` +
        `<rect x="3.6" y="3.6" width="142.8" height="47.8" fill="none" stroke="${p.accent}" stroke-width="0.15"/>` +
        branch([-2, 14], [24, -2], 0.18, 9, leaf, 2.6) +
        branch([2, 22], [14, 3], -0.12, 5, leaf, 1.8) +
        branch([98, 57], [80, 44], 0.2, 6, leaf, 2.2) +
        qrCard(117, 13, 26, 2, `stroke="${p.accent}" stroke-width="0.25"`),
    );
    return {
      background: art,
      design: design(W, H, p.bg, {
        number: number(113, 43, 34, 5.5, "sans", 9, p.accent, "center"),
        qr: [117, 13, 26],
        stub: null,
        texts: [
          block("{evento}", 12, 7, 92, 22, { font: "script", sizePt: 32, color: p.ink, align: "center", lines: 2 }),
          block("{data_extenso}", 12, 31, 92, 4.5, { sizePt: 7.5, bold: true, color: p.muted, align: "center", uppercase: true, letterSpacing: 0.18 }),
          block(c.atTime, 12, 36.5, 92, 4.5, { font: "serif", sizePt: 10, color: p.accent, align: "center" }),
          block("{local}", 12, 42, 92, 4.5, { sizePt: 8.5, color: p.ink, align: "center" }),
          block("{preco}", 12, 47, 92, 3.8, { sizePt: 7.5, color: p.muted, align: "center" }),
        ],
      }),
    };
  },
};

const theater: TicketTemplate = {
  id: "theater",
  categories: ["culture", "school"],
  palettes: [
    { id: "red", bg: "#1a080c", ink: "#fff4e6", muted: "#d9bfa0", accent: "#e0b04a", extra: ["#9b1b30", "#5e0f1d"] },
    { id: "royal", bg: "#070b1f", ink: "#f2f4ff", muted: "#b8bfdc", accent: "#e8c15c", extra: ["#233a8f", "#121f52"] },
    { id: "emerald", bg: "#04140f", ink: "#effaf5", muted: "#a9cbbd", accent: "#e3b65a", extra: ["#0f6b4b", "#063826"] },
  ],
  build: (p) => {
    const [light = p.accent, dark = p.bg] = p.extra;
    let drape = "";
    for (let i = 0; i < 6; i += 1) {
      const x = -3 + i * 3;
      drape += `<path d="M${x} -3 L${x + 3} -3 Q${r(x + 2 - i * 0.4)} 30 ${r(x + 4 - i * 0.9)} 58 L${r(x + 1 - i * 0.9)} 58 Q${r(x - 1 - i * 0.4)} 30 ${x} -3Z" fill="${i % 2 === 0 ? light : dark}"/>`;
    }
    let valance = `<rect x="-3" y="-3" width="156" height="5" fill="${light}"/>`;
    for (let x = -3; x < 153; x += 6) {
      valance += `<path d="M${x} 2 Q${x + 3} 6.5 ${x + 6} 2Z" fill="${light}"/>`;
    }
    const art = canvas(
      W,
      H,
      p.bg,
      `<ellipse cx="60" cy="30" rx="55" ry="32" fill="url(#spot)"/>` +
        drape +
        valance +
        `<line x1="-3" y1="2.2" x2="153" y2="2.2" stroke="${p.accent}" stroke-width="0.35"/>` +
        qrCard(QR[0], 16, QR[2]),
      glow("spot", p.accent, 0.22),
    );
    return {
      background: art,
      design: design(W, H, p.bg, {
        number: number(110, 47, 36, 6, "serif", 11, p.accent),
        qr: [QR[0], 16, QR[2]],
        stub: STUB,
        texts: [
          block("{data} · {hora}", 22, 11, 84, 4.5, { bold: true, sizePt: 7.5, color: p.accent, uppercase: true, letterSpacing: 0.3 }),
          block("{evento}", 22, 16.5, 86, 20, { font: "serif", sizePt: 27, color: p.ink, lines: 2 }),
          block("{local}", 22, 39, 86, 4.5, { sizePt: 9, color: p.muted }),
          block("{preco}", 22, 45, 60, 4, { sizePt: 8.5, bold: true, color: p.accent }),
        ],
      }),
    };
  },
};

const party: TicketTemplate = {
  id: "party",
  categories: ["party", "music"],
  palettes: [
    { id: "sunset", bg: "#7b2ff7", ink: "#ffffff", muted: "#f6e8ff", accent: "#ffe66d", extra: ["#7b2ff7", "#f107a3", "#ff8c37"] },
    { id: "neon", bg: "#0f172a", ink: "#ffffff", muted: "#d4f7ff", accent: "#39ff88", extra: ["#06b6d4", "#3b82f6", "#a855f7"] },
    { id: "tropical", bg: "#00a896", ink: "#ffffff", muted: "#e6fff9", accent: "#ffe66d", extra: ["#028090", "#00a896", "#f9c74f"] },
  ],
  build: (p) => {
    const [a = p.bg, b = p.bg, cc = p.bg] = p.extra;
    const art = canvas(
      W,
      H,
      p.bg,
      `<rect x="-3" y="-3" width="156" height="61" fill="url(#sky)"/>` +
        bokeh(21, { x: -3, y: -3, width: 156, height: 61 }, "#ffffff", 22) +
        `<circle cx="98" cy="10" r="26" fill="none" stroke="#ffffff" stroke-opacity="0.25" stroke-width="0.6"/>` +
        `<circle cx="98" cy="10" r="31" fill="none" stroke="#ffffff" stroke-opacity="0.12" stroke-width="0.4"/>` +
        qrCard(QR[0], QR[1], QR[2]),
      linear("sky", [[0, a], [0.55, b], [1, cc]], 25),
    );
    return {
      background: art,
      design: design(W, H, p.bg, {
        number: number(108, 4, 38, 10, "display", 22, p.ink),
        qr: QR,
        stub: null,
        texts: [
          block("{semana} · {hora}", 8, 5.5, 90, 6, { font: "display", sizePt: 15, color: p.accent, uppercase: true, letterSpacing: 0.08 }),
          block("{evento}", 8, 12, 98, 24, { font: "display", sizePt: 46, color: p.ink, uppercase: true, lines: 2 }),
          block("{data}", 8, 38, 60, 5, { sizePt: 10, bold: true, color: p.ink }),
          block("{local}", 8, 43.5, 98, 4.5, { sizePt: 9, color: p.muted }),
          block("{preco}", 8, 49, 60, 4, { sizePt: 8.5, bold: true, color: p.accent }),
        ],
      }),
    };
  },
};

const sports: TicketTemplate = {
  id: "sports",
  categories: ["sports", "school"],
  palettes: [
    { id: "field", bg: "#0e5d2f", ink: "#ffffff", muted: "#d7f0de", accent: "#ffd60a", extra: ["#13703a"] },
    { id: "court", bg: "#b5521b", ink: "#ffffff", muted: "#ffe3cf", accent: "#1d1d1d", extra: ["#c45f22"] },
    { id: "volley", bg: "#123e7a", ink: "#ffffff", muted: "#d5e4fb", accent: "#ffc93c", extra: ["#174a91"] },
  ],
  build: (p) => {
    const [stripe = p.bg] = p.extra;
    let stripes = "";
    for (let x = -3; x < 153; x += 24) {
      stripes += `<rect x="${x}" y="-3" width="12" height="61" fill="${stripe}"/>`;
    }
    const art = canvas(
      W,
      H,
      p.bg,
      stripes +
        `<rect x="2" y="2" width="146" height="51" fill="none" stroke="#ffffff" stroke-opacity="0.45" stroke-width="0.45"/>` +
        `<line x1="75" y1="2" x2="75" y2="53" stroke="#ffffff" stroke-opacity="0.45" stroke-width="0.45"/>` +
        `<circle cx="75" cy="27.5" r="10" fill="none" stroke="#ffffff" stroke-opacity="0.45" stroke-width="0.45"/>` +
        `<polygon points="-3,-3 30,-3 14,58 -3,58" fill="${p.accent}" opacity="0.18"/>` +
        `<polygon points="34,-3 38,-3 22,58 18,58" fill="${p.accent}" opacity="0.5"/>` +
        qrCard(QR[0], QR[1], QR[2]),
    );
    return {
      background: art,
      design: design(W, H, p.bg, {
        number: number(108, 4, 38, 10, "condensed", 18, p.ink),
        qr: QR,
        stub: STUB,
        texts: [
          block("{data} · {hora}", 8, 5.5, 90, 6, { font: "condensed", sizePt: 12, color: p.accent, uppercase: true, letterSpacing: 0.05 }),
          block("{evento}", 8, 12.5, 98, 22, { font: "condensed", sizePt: 32, color: p.ink, uppercase: true, lines: 2 }),
          block("{local}", 8, 37, 98, 5, { sizePt: 9.5, bold: true, color: p.muted }),
          block("{preco}", 8, 43.5, 60, 4.5, { font: "condensed", sizePt: 11, color: p.accent }),
        ],
      }),
    };
  },
};

const raffle: TicketTemplate = {
  id: "raffle",
  categories: ["charity", "school", "church"],
  palettes: [
    { id: "yellow", bg: "#fff6cc", ink: "#3b2f00", muted: "#6e5d1c", accent: "#e85d04", extra: ["#ffd23f", "#f48c06"] },
    { id: "green", bg: "#e9f8ee", ink: "#0f3d22", muted: "#3d6b4f", accent: "#16a34a", extra: ["#86efac", "#22c55e"] },
    { id: "blue", bg: "#e8f1ff", ink: "#102a52", muted: "#3c5785", accent: "#2563eb", extra: ["#93c5fd", "#3b82f6"] },
  ],
  build: (p) => {
    const w = 70;
    const h = 45;
    const [soft = p.bg, mid = p.accent] = p.extra;
    const art = canvas(
      w,
      h,
      p.bg,
      `<rect x="-3" y="-3" width="76" height="17" fill="${soft}"/>` +
        `<path d="M-3 14 Q35 19 73 14 L73 15.2 Q35 20.2 -3 15.2Z" fill="${mid}" opacity="0.5"/>` +
        star(62, 4, 2.4, p.accent, 0.6) +
        star(56.5, 9, 1.4, p.accent, 0.45) +
        star(3, 40, 1.6, mid, 0.35) +
        qrCard(45, 20, 22, 1.5),
    );
    return {
      background: art,
      design: design(w, h, p.bg, {
        number: number(4, 2.5, 48, 10.5, "slab", 26, p.ink, "left"),
        qr: [45, 20, 22],
        stub: { side: "left", widthMm: 25, fields: [...texts.event.design.defaultStubFields] },
        texts: [
          block("{evento}", 4, 17, 38, 10, { sizePt: 9.5, bold: true, color: p.ink, lines: 2 }),
          block(c.drawDate, 4, 28.5, 38, 4, { sizePt: 7, color: p.muted }),
          block("{preco}", 4, 34, 38, 6.5, { font: "slab", sizePt: 13, color: p.accent }),
        ],
      }),
    };
  },
};

const charity: TicketTemplate = {
  id: "charity",
  categories: ["charity", "church"],
  palettes: [
    { id: "coral", bg: "#fff3ee", ink: "#7a2e1f", muted: "#9c5b4c", accent: "#ff6f59", extra: ["#ffb4a2"] },
    { id: "teal", bg: "#ecfaf8", ink: "#134e4a", muted: "#3f7a74", accent: "#14b8a6", extra: ["#99f6e4"] },
  ],
  build: (p) => {
    const [soft = p.accent] = p.extra;
    const next = random(5);
    let hearts = "";
    for (let i = 0; i < 14; i += 1) {
      hearts += heart(4 + next() * 100, 2 + next() * 52, 2 + next() * 3, soft, 0.35 + next() * 0.3, Math.round(next() * 40 - 20));
    }
    const art = canvas(
      W,
      H,
      p.bg,
      hearts + heart(131, 33, 52, soft, 0.35, -8) + `<rect x="7.5" y="5" width="44" height="7.5" rx="3.75" fill="#ffffff" opacity="0.85"/>` + qrCard(QR[0], QR[1], QR[2]),
    );
    return {
      background: art,
      design: design(W, H, p.bg, {
        number: number(108, 4, 38, 9, "sans", 13, p.ink),
        qr: QR,
        stub: STUB,
        texts: [
          block(c.solidarity, 9.5, 5.6, 40, 6.3, { font: "casual", sizePt: 12, color: p.accent, align: "center" }),
          block("{evento}", 8, 15, 98, 18, { sizePt: 22, bold: true, color: p.ink, lines: 2 }),
          block("{data_extenso} · {hora}", 8, 35, 98, 5, { sizePt: 9.5, bold: true, color: p.muted }),
          block("{local}", 8, 41, 98, 4.5, { sizePt: 9, color: p.muted }),
          block(c.contribution, 8, 46.5, 80, 4.5, { sizePt: 9, bold: true, color: p.accent }),
        ],
      }),
    };
  },
};

const talk: TicketTemplate = {
  id: "talk",
  categories: ["business", "school"],
  palettes: [
    { id: "blue", bg: "#ffffff", ink: "#0f172a", muted: "#475569", accent: "#2563eb", extra: ["#93c5fd", "#dbeafe"] },
    { id: "graphite", bg: "#ffffff", ink: "#111827", muted: "#4b5563", accent: "#111827", extra: ["#9ca3af", "#f3f4f6"] },
    { id: "teal", bg: "#ffffff", ink: "#042f2e", muted: "#3f6260", accent: "#0d9488", extra: ["#5eead4", "#ccfbf1"] },
  ],
  build: (p) => {
    const [light = p.accent, pale = p.bg] = p.extra;
    let dots = "";
    for (let x = 60; x < 112; x += 3) {
      for (let y = 30; y < 54; y += 3) {
        dots += `<circle cx="${x}" cy="${y}" r="0.28" fill="${p.muted}" opacity="0.25"/>`;
      }
    }
    const art = canvas(
      W,
      H,
      p.bg,
      `<rect x="-3" y="-3" width="7" height="61" fill="${p.accent}"/>` +
        `<rect x="4" y="-3" width="1.4" height="61" fill="${light}"/>` +
        `<polygon points="100,58 153,6 153,58" fill="${pale}"/>` +
        `<polygon points="128,58 153,33 153,58" fill="${light}" opacity="0.7"/>` +
        dots +
        qrCard(QR[0], QR[1], QR[2], 2, `stroke="${pale}" stroke-width="0.4"`),
    );
    return {
      background: art,
      design: design(W, H, p.bg, {
        number: number(108, 4, 38, 9, "mono", 11, p.muted),
        qr: QR,
        stub: null,
        texts: [
          block("{data_extenso}", 11, 6, 90, 4.5, { bold: true, sizePt: 7.5, color: p.accent, uppercase: true, letterSpacing: 0.2 }),
          block("{evento}", 11, 12, 94, 20, { sizePt: 22, bold: true, color: p.ink, lines: 2 }),
          block(c.startsAt, 11, 35, 94, 4.5, { sizePt: 9, color: p.muted }),
          block("{local}", 11, 40.5, 94, 4.5, { sizePt: 9, color: p.muted }),
          block("{preco}", 11, 46.5, 60, 4, { sizePt: 8.5, bold: true, color: p.ink }),
        ],
      }),
    };
  },
};

const kids: TicketTemplate = {
  id: "kids",
  categories: ["kids", "party", "school"],
  palettes: [
    { id: "rainbow", bg: "#fff9f0", ink: "#4c2a85", muted: "#6c5ba7", accent: "#ff6b6b", extra: ["#ff6b6b", "#ffd93d", "#6bcb77", "#4d96ff", "#c77dff"] },
    { id: "pastel", bg: "#f6fbff", ink: "#3d5a80", muted: "#6b84a3", accent: "#f28482", extra: ["#f7cad0", "#bde0fe", "#cdeac0", "#ffe5a5", "#d8bbff"] },
  ],
  build: (p) => {
    const balloon = (x: number, y: number, color: string) =>
      `<path d="M${x} ${y + 7.5} q-1.2 4 1 8 q1.5 3 -0.5 7" fill="none" stroke="${p.muted}" stroke-width="0.25" opacity="0.6"/>` +
      `<ellipse cx="${x}" cy="${y}" rx="5" ry="6.2" fill="${color}"/>` +
      `<ellipse cx="${r(x - 1.6)}" cy="${r(y - 2.2)}" rx="1.1" ry="1.7" fill="#ffffff" opacity="0.55"/>` +
      `<path d="M${r(x - 0.9)} ${r(y + 6.6)}L${r(x + 0.9)} ${r(y + 6.6)}L${x} ${r(y + 5.6)}Z" fill="${color}"/>`;
    const [b1 = p.accent, b2 = p.accent, b3 = p.accent] = p.extra;
    const art = canvas(
      W,
      H,
      p.bg,
      confetti(11, { x: -3, y: -3, width: 156, height: 61 }, p.extra, 70, 0.75) +
        balloon(100, 33, b1) +
        balloon(108.5, 39, b2) +
        balloon(93, 42, b3) +
        qrCard(QR[0], QR[1], QR[2]),
    );
    return {
      background: art,
      design: design(W, H, p.bg, {
        number: number(108, 4, 38, 9, "casual", 13, p.ink),
        qr: QR,
        stub: STUB,
        texts: [
          block("{evento}", 8, 6, 82, 22, { font: "casual", sizePt: 24, color: p.ink, lines: 2 }),
          block("{data_extenso}", 8, 31, 80, 5, { sizePt: 9.5, bold: true, color: p.accent }),
          block(c.fromTime, 8, 37, 80, 4.5, { sizePt: 9, color: p.muted }),
          block("{local}", 8, 42, 80, 4.5, { sizePt: 9, color: p.muted }),
          block("{preco}", 8, 47.5, 60, 4, { sizePt: 8.5, bold: true, color: p.ink }),
        ],
      }),
    };
  },
};

const carnival: TicketTemplate = {
  id: "carnival",
  categories: ["party", "music"],
  palettes: [
    { id: "folia", bg: "#4a148c", ink: "#ffffff", muted: "#eadcff", accent: "#ffd60a", extra: ["#ffd60a", "#ff4d6d", "#4cc9f0", "#80ed99", "#ff9f1c"] },
    { id: "frevo", bg: "#0b3d91", ink: "#ffffff", muted: "#dbe7ff", accent: "#ffd23f", extra: ["#ffd23f", "#ee4266", "#3bceac", "#ffffff", "#f78c6b"] },
  ],
  build: (p) => {
    const next = random(3);
    let streamers = "";
    for (let i = 0; i < 6; i += 1) {
      const y = 2 + next() * 50;
      const color = p.extra[i % p.extra.length] ?? p.accent;
      let d = `M-3 ${r(y)}`;
      for (let x = -3; x < 153; x += 8) {
        d += ` q2 ${r(-3 - next() * 2)} 4 0 t4 0`;
      }
      streamers += `<path d="${d}" fill="none" stroke="${color}" stroke-width="0.5" opacity="0.4"/>`;
    }
    const art = canvas(
      W,
      H,
      p.bg,
      streamers + confetti(17, { x: -3, y: -3, width: 156, height: 61 }, p.extra, 90, 0.9) + qrCard(QR[0], QR[1], QR[2]),
    );
    return {
      background: art,
      design: design(W, H, p.bg, {
        number: number(108, 4, 38, 10, "condensed", 17, p.ink),
        qr: QR,
        stub: STUB,
        texts: [
          block("{data} · {hora}", 8, 5.5, 90, 6, { font: "casual", sizePt: 12, color: p.accent }),
          block("{evento}", 8, 13, 98, 22, { font: "condensed", sizePt: 34, color: p.ink, uppercase: true, lines: 2 }),
          block("{local}", 8, 38, 98, 5, { sizePt: 9.5, bold: true, color: p.muted }),
          block("{preco}", 8, 44.5, 60, 4.5, { sizePt: 9, bold: true, color: p.accent }),
        ],
      }),
    };
  },
};

const cinema: TicketTemplate = {
  id: "cinema",
  categories: ["culture"],
  palettes: [
    { id: "classic", bg: "#141414", ink: "#ffffff", muted: "#b3b3b3", accent: "#f5c518", extra: ["#262626"] },
    { id: "retro", bg: "#f4ead5", ink: "#7a1f1f", muted: "#8a6a4f", accent: "#c0392b", extra: ["#2b1d14"] },
  ],
  build: (p) => {
    const [strip = "#262626"] = p.extra;
    let holes = "";
    for (let x = -2; x < 153; x += 5) {
      holes += `<rect x="${x}" y="-1.6" width="2.6" height="2" rx="0.4" fill="${p.bg}"/>`;
      holes += `<rect x="${x}" y="53.6" width="2.6" height="2" rx="0.4" fill="${p.bg}"/>`;
    }
    const art = canvas(
      W,
      H,
      p.bg,
      `<rect x="-3" y="-3" width="156" height="6" fill="${strip}"/>` +
        `<rect x="-3" y="52" width="156" height="6" fill="${strip}"/>` +
        holes +
        `<ellipse cx="40" cy="28" rx="60" ry="22" fill="url(#beam)"/>` +
        qrCard(QR[0], 17, 27),
      glow("beam", p.accent, 0.12),
    );
    return {
      background: art,
      design: design(W, H, p.bg, {
        number: number(108, 6.5, 38, 8, "display", 18, p.accent),
        qr: [QR[0], 17, 27],
        stub: STUB,
        texts: [
          block(c.session, 8, 7, 90, 6, { font: "display", sizePt: 15, color: p.accent, letterSpacing: 0.06 }),
          block("{evento}", 8, 14, 98, 21, { font: "display", sizePt: 40, color: p.ink, uppercase: true, lines: 2 }),
          block("{data_extenso}", 8, 37, 98, 5, { sizePt: 9.5, bold: true, color: p.ink }),
          block("{local}", 8, 42.5, 70, 4.5, { sizePt: 9, color: p.muted }),
          block("{preco}", 80, 42.5, 26, 4.5, { sizePt: 9, bold: true, color: p.accent, align: "right" }),
        ],
      }),
    };
  },
};

const newYear: TicketTemplate = {
  id: "newYear",
  categories: ["party", "formal"],
  palettes: [
    { id: "gold", bg: "#0b1026", ink: "#ffffff", muted: "#c8cde6", accent: "#e9c46a", extra: ["#1a2350", "#f4a261"] },
    { id: "silver", bg: "#0d0d0f", ink: "#ffffff", muted: "#c4c4cc", accent: "#d9dce3", extra: ["#25252d", "#9aa5b8"] },
  ],
  build: (p) => {
    const [deep = p.bg, second = p.accent] = p.extra;
    const next = random(9);
    let stars = "";
    for (let i = 0; i < 40; i += 1) {
      stars += `<circle cx="${r(next() * 150)}" cy="${r(next() * 55)}" r="${r(0.15 + next() * 0.3)}" fill="#ffffff" opacity="${r(0.3 + next() * 0.6)}"/>`;
    }
    const art = canvas(
      W,
      H,
      p.bg,
      `<rect x="-3" y="-3" width="156" height="61" fill="url(#night)"/>` +
        stars +
        burst(96, 12, 11, p.accent, 18) +
        burst(84, 30, 6, second, 12) +
        burst(108, 46, 7, p.accent, 14) +
        qrCard(QR[0], QR[1], QR[2]),
      linear("night", [[0, p.bg], [1, deep]], 90),
    );
    return {
      background: art,
      design: design(W, H, p.bg, {
        number: number(108, 4, 38, 9, "serif", 13, p.accent),
        qr: QR,
        stub: null,
        texts: [
          block("{data_extenso}", 8, 6, 80, 4.5, { bold: true, sizePt: 7.5, color: p.accent, uppercase: true, letterSpacing: 0.25 }),
          block("{evento}", 8, 12, 100, 22, { font: "serif", sizePt: 26, color: p.ink, lines: 2 }),
          block(c.fromTime, 8, 37, 90, 4.5, { sizePt: 9.5, bold: true, color: p.ink }),
          block("{local}", 8, 42.5, 90, 4.5, { sizePt: 9, color: p.muted }),
          block("{preco}", 8, 48, 60, 4, { sizePt: 8.5, bold: true, color: p.accent }),
        ],
      }),
    };
  },
};

const classic: TicketTemplate = {
  id: "classic",
  categories: ["business", "culture", "music", "school", "church", "party", "sports", "formal", "charity", "kids"],
  palettes: [
    { id: "black", bg: "#ffffff", ink: "#111111", muted: "#555555", accent: "#111111", extra: [] },
    { id: "blue", bg: "#ffffff", ink: "#0b2a5b", muted: "#4a5f80", accent: "#1d4ed8", extra: [] },
    { id: "green", bg: "#ffffff", ink: "#0f3b2a", muted: "#4b6b5e", accent: "#15803d", extra: [] },
  ],
  build: (p) => {
    const art = canvas(
      W,
      H,
      p.bg,
      `<rect x="2.5" y="2.5" width="145" height="50" rx="1.5" fill="none" stroke="${p.accent}" stroke-width="0.4"/>` +
        `<rect x="3.6" y="3.6" width="142.8" height="47.8" rx="1" fill="none" stroke="${p.accent}" stroke-width="0.15"/>` +
        `<line x1="110" y1="8" x2="110" y2="47" stroke="${p.accent}" stroke-width="0.25" stroke-dasharray="1 1"/>`,
    );
    return {
      background: art,
      design: design(W, H, p.bg, {
        number: number(114, 7, 32, 8, "mono", 12, p.ink, "center"),
        qr: [116, 17.5, 28],
        stub: STUB,
        texts: [
          block(c.ticket, 9, 8, 60, 4.5, { bold: true, sizePt: 7.5, color: p.accent, uppercase: true, letterSpacing: 0.4 }),
          block("{evento}", 9, 14, 96, 18, { sizePt: 22, bold: true, color: p.ink, lines: 2 }),
          block("{data_extenso} · {hora}", 9, 34.5, 96, 5, { sizePt: 9.5, color: p.ink }),
          block("{local}", 9, 40.5, 96, 4.5, { sizePt: 9, color: p.muted }),
          block("{preco}", 9, 45.5, 60, 4, { sizePt: 8.5, bold: true, color: p.ink }),
        ],
      }),
    };
  },
};

/** Every template, in the gallery's order. */
export const TEMPLATES: readonly TicketTemplate[] = [
  show,
  party,
  arraia,
  graduation,
  church,
  wedding,
  theater,
  sports,
  raffle,
  charity,
  kids,
  carnival,
  talk,
  cinema,
  newYear,
  classic,
];

export function templateById(id: string): TicketTemplate | undefined {
  return TEMPLATES.find((template) => template.id === id);
}
