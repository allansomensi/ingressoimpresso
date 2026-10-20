/** Templates of the music set, listed in catalog.ts. */

import { templates as templatesTexts } from "@/texts/pt-BR/templates";

import { block, design, H, number, QR, STUB, W, type TicketTemplate } from "./kit";
import { canvas, glow, linear, qrCard, r, random } from "./svg";

const c = templatesTexts.content;

/** A colour between `from` and `to` (`#rrggbb`), `t` from 0 to 1. */
function mix(from: string, to: string, t: number): string {
  const channel = (hex: string, i: number) => Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  let out = "#";
  for (let i = 0; i < 3; i += 1) {
    const value = Math.round(channel(from, i) + (channel(to, i) - channel(from, i)) * Math.min(1, Math.max(0, t)));
    out += value.toString(16).padStart(2, "0");
  }
  return out;
}

/** A closed polygon from points. */
function polygon(points: readonly (readonly [number, number])[], fill: string, extra = ""): string {
  return `<polygon points="${points.map(([x, y]) => `${r(x)},${r(y)}`).join(" ")}" fill="${fill}" ${extra}/>`;
}

const rock: TicketTemplate = {
  id: "rock",
  categories: ["music", "party"],
  palettes: [
    { id: "blood", bg: "#0a0a0a", ink: "#f5f5f5", muted: "#a8a8a8", accent: "#e10600", extra: ["#6e0000"] },
    { id: "steel", bg: "#0d0f12", ink: "#f1f5f9", muted: "#9aa4b2", accent: "#cbd5e1", extra: ["#475569"] },
    { id: "toxic", bg: "#090b07", ink: "#f4ffe6", muted: "#a9b89a", accent: "#a3ff12", extra: ["#3f6212"] },
  ],
  build: (p) => {
    const [shadow = p.bg] = p.extra;
    const next = random(13);
    // Scratches: short, almost horizontal strokes all over, like a worn poster.
    let scratches = "";
    for (let i = 0; i < 46; i += 1) {
      const x = -3 + next() * 115;
      const y = -3 + next() * 61;
      const length = 3 + next() * 12;
      const angle = ((next() * 14 - 7) * Math.PI) / 180;
      scratches += `<line x1="${r(x)}" y1="${r(y)}" x2="${r(x + Math.cos(angle) * length)}" y2="${r(y + Math.sin(angle) * length)}" stroke="${p.ink}" stroke-width="${r(0.12 + next() * 0.25)}" opacity="${r(0.05 + next() * 0.1)}"/>`;
    }
    // A rough bar: straight in spirit, chipped at the edges.
    const roughBar = (x1: number, x2: number, y1: number, y2: number, seed: number) => {
      const jitter = random(seed);
      const top: [number, number][] = [];
      const bottom: [number, number][] = [];
      for (let x = x1; x <= x2; x += 1.6) {
        top.push([x, y1 + (jitter() - 0.5) * 0.7]);
        bottom.push([x + 0.8, y2 + (jitter() - 0.5) * 0.7]);
      }
      top.push([x2 + 1.2, y1 + 0.2]);
      bottom.push([x2 + 0.4, y2]);
      return polygon([...top, ...bottom.reverse()], p.accent);
    };
    // The lightning bolt cutting the ticket from the top to the bottom.
    const bolt: [number, number][] = [
      [99, -3], [110, -3], [102, 17], [109, 17], [97, 36], [103, 36], [83, 58], [90, 39], [84, 39], [92, 21], [86, 21],
    ];
    const shifted = bolt.map(([x, y]) => [x + 1.6, y + 1.2] as [number, number]);
    const art = canvas(
      W,
      H,
      p.bg,
      `<ellipse cx="96" cy="27" rx="28" ry="38" fill="url(#charge)"/>` +
        scratches +
        polygon(shifted, shadow) +
        polygon(bolt, p.accent) +
        `<polyline points="99.8,-3 92.6,15.4" stroke="#ffffff" stroke-width="0.35" opacity="0.5"/>` +
        roughBar(6, 47, 4.6, 11.2, 3) +
        roughBar(8, 62, 35, 36.1, 4) +
        qrCard(QR[0], QR[1], QR[2]),
      glow("charge", p.accent, 0.3),
    );
    return {
      background: art,
      design: design(W, H, p.bg, {
        number: number(108, 4, 38, 10, "condensed", 19, p.ink),
        qr: QR,
        stub: STUB,
        texts: [
          block("{data} · {hora}", 8.5, 5.4, 38, 5.6, { font: "condensed", sizePt: 12, color: p.bg, uppercase: true, letterSpacing: 0.05 }),
          block("{evento}", 8, 12.5, 76, 22, { font: "condensed", sizePt: 34, color: p.ink, uppercase: true, lines: 2 }),
          block("{local}", 8, 38, 76, 5, { sizePt: 10, bold: true, color: p.muted, uppercase: true, letterSpacing: 0.08 }),
          block("{preco}", 8, 44.5, 50, 6, { font: "condensed", sizePt: 14, color: p.accent }),
        ],
      }),
    };
  },
};

const sertanejo: TicketTemplate = {
  id: "sertanejo",
  categories: ["music", "party"],
  palettes: [
    { id: "leather", bg: "#5a3520", ink: "#fbeedd", muted: "#e2c4a4", accent: "#e8b04f", extra: ["#d2ad74", "#2e1a0e"] },
    { id: "denim", bg: "#1f3a5f", ink: "#f3f6fb", muted: "#c3d0e2", accent: "#e0a458", extra: ["#d8c39a", "#0f1f35"] },
    { id: "rodeo", bg: "#17110d", ink: "#fff3e0", muted: "#cdb8a0", accent: "#f0b429", extra: ["#b08954", "#000000"] },
  ],
  build: (p) => {
    const [rope = p.accent, dark = p.bg] = p.extra;
    const qr: [number, number, number] = [113, 18, 28];
    // Grain of the leather or the wood: a few slow waves.
    let grain = "";
    for (let i = 0; i < 9; i += 1) {
      const y = 2 + i * 6.2;
      grain += `<path d="M-3 ${r(y)}Q40 ${r(y + 3 - (i % 3) * 2)} 80 ${r(y)}T156 ${r(y + 1)}" fill="none" stroke="${dark}" stroke-width="${r(0.3 + (i % 2) * 0.35)}" opacity="0.22"/>`;
    }
    // The rope: four strips filled with slanted twists.
    const strand = (x: number, y: number, w: number, h: number) =>
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="0.7" fill="url(#rope)" stroke="${dark}" stroke-width="0.15"/>`;
    // A sheriff star: six points with a ball on each tip.
    const sheriff = (x: number, y: number, size: number) => {
      const points: [number, number][] = [];
      let balls = "";
      for (let i = 0; i < 12; i += 1) {
        const radius = i % 2 === 0 ? size : size * 0.52;
        const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
        points.push([x + Math.cos(angle) * radius, y + Math.sin(angle) * radius]);
        if (i % 2 === 0) {
          balls += `<circle cx="${r(x + Math.cos(angle) * size)}" cy="${r(y + Math.sin(angle) * size)}" r="${r(size * 0.14)}" fill="${p.accent}"/>`;
        }
      }
      return (
        polygon(points, p.accent) +
        balls +
        `<circle cx="${x}" cy="${y}" r="${r(size * 0.36)}" fill="none" stroke="${dark}" stroke-width="0.35" opacity="0.7"/>` +
        `<circle cx="${x}" cy="${y}" r="${r(size * 0.12)}" fill="${dark}" opacity="0.7"/>`
      );
    };
    // A horseshoe, open side up (for luck), with its nail holes.
    const horseshoe = (x: number, y: number) =>
      `<path d="M${r(x - 1.9)} ${r(y - 2)}L${r(x - 1.9)} ${y}A1.9 1.9 0 0 0 ${r(x + 1.9)} ${y}L${r(x + 1.9)} ${r(y - 2)}" fill="none" stroke="${p.accent}" stroke-width="1.1"/>` +
      [-1, 1].map((side) => `<circle cx="${r(x + side * 1.9)}" cy="${r(y - 0.9)}" r="0.2" fill="${p.bg}"/><circle cx="${r(x + side * 1.35)}" cy="${r(y + 1.35)}" r="0.2" fill="${p.bg}"/>`).join("");
    const art = canvas(
      W,
      H,
      p.bg,
      grain +
        `<ellipse cx="45" cy="26" rx="60" ry="30" fill="url(#lamp)"/>` +
        `<rect x="5.2" y="5.2" width="139.6" height="44.6" rx="1.5" fill="none" stroke="${p.accent}" stroke-width="0.28" stroke-dasharray="1.3 0.9" opacity="0.75"/>` +
        strand(1.8, 1.8, 146.4, 1.6) +
        strand(1.8, 51.6, 146.4, 1.6) +
        strand(1.8, 1.8, 1.6, 51.4) +
        strand(146.6, 1.8, 1.6, 51.4) +
        sheriff(96, 40, 8) +
        horseshoe(10.4, 8.6) +
        qrCard(qr[0], qr[1], qr[2], 2, `stroke="${dark}" stroke-width="0.3"`),
      `<pattern id="rope" width="1.3" height="1.3" patternUnits="userSpaceOnUse" patternTransform="rotate(38)"><rect width="1.3" height="1.3" fill="${rope}"/><rect width="0.42" height="1.3" fill="${dark}" opacity="0.5"/></pattern>` +
        glow("lamp", p.accent, 0.12),
    );
    return {
      background: art,
      design: design(W, H, p.bg, {
        number: number(104, 7, 39, 8, "slab", 12, p.accent),
        qr,
        stub: STUB,
        texts: [
          block(c.fromTime, 14, 6.6, 70, 4.5, { bold: true, sizePt: 7.5, color: p.accent, uppercase: true, letterSpacing: 0.25 }),
          block("{evento}", 8, 12.5, 82, 20, { font: "slab", sizePt: 25, color: p.ink, lines: 2 }),
          block("{data_extenso}", 8, 34.5, 76, 5, { sizePt: 9.5, bold: true, color: p.ink }),
          block("{local}", 8, 40, 76, 4.5, { sizePt: 9, color: p.muted }),
          block("{preco}", 8, 45, 60, 5, { font: "slab", sizePt: 10.5, color: p.accent }),
        ],
      }),
    };
  },
};

const samba: TicketTemplate = {
  id: "samba",
  categories: ["music", "party"],
  palettes: [
    { id: "calcadao", bg: "#c2410c", ink: "#ffffff", muted: "#ffe1cc", accent: "#ffd43b", extra: ["#111111", "#fbf4e4"] },
    { id: "greenPink", bg: "#0b6e4f", ink: "#ffffff", muted: "#d5f5e6", accent: "#ff9fcd", extra: ["#e8559a", "#fdf3f8"] },
    { id: "blueWhite", bg: "#0a3a7e", ink: "#ffffff", muted: "#d6e4fb", accent: "#ffd23f", extra: ["#2f7fe0", "#f5f9ff"] },
  ],
  build: (p) => {
    const [dark = p.ink, light = p.bg] = p.extra;
    // The Copacabana sidewalk: bands that sway, the same wave for every edge.
    const amplitude = 2.6;
    const wave = (x0: number, y: number) => x0 + amplitude * Math.sin((2 * Math.PI * y) / 14);
    const edge = (x0: number, down: boolean) => {
      const out: string[] = [];
      for (let i = 0; i <= 61; i += 1) {
        const y = down ? -3 + i : 58 - i;
        out.push(`${r(wave(x0, y))},${y}`);
      }
      return out;
    };
    const band = (x0: number, width: number, fill: string) => `<polygon points="${[...edge(x0, true), ...edge(x0 + width, false)].join(" ")}" fill="${fill}"/>`;
    let sidewalk = `<polygon points="-3,-3 ${edge(29, true).join(" ")} -3,58" fill="${light}"/>`;
    for (const x0 of [-7, 3, 13, 23]) {
      sidewalk += band(x0, 5, dark);
    }
    const art = canvas(
      W,
      H,
      p.bg,
      `<ellipse cx="80" cy="24" rx="55" ry="34" fill="url(#sun)"/>` +
        sidewalk +
        `<polyline points="${edge(31.4, true).join(" ")}" fill="none" stroke="${p.accent}" stroke-width="0.6"/>` +
        qrCard(QR[0], QR[1], QR[2]),
      glow("sun", p.accent, 0.2),
    );
    return {
      background: art,
      design: design(W, H, p.bg, {
        number: number(108, 4, 38, 10, "display", 22, p.ink),
        qr: QR,
        stub: null,
        texts: [
          block("{semana} · {hora}", 38, 5.5, 70, 6, { font: "display", sizePt: 15, color: p.accent, uppercase: true, letterSpacing: 0.08 }),
          block("{evento}", 38, 12, 72, 23, { font: "casual", sizePt: 21, color: p.ink, lines: 2 }),
          block("{data_extenso}", 38, 36.5, 72, 5, { sizePt: 9.5, bold: true, color: p.ink }),
          block("{local}", 38, 42, 72, 4.5, { sizePt: 9, color: p.muted }),
          block("{preco}", 38, 47.5, 60, 4, { sizePt: 9, bold: true, color: p.accent }),
        ],
      }),
    };
  },
};

const forro: TicketTemplate = {
  id: "forro",
  categories: ["music", "party", "culture"],
  palettes: [
    { id: "paper", bg: "#f3e8cf", ink: "#1b1712", muted: "#4a4036", accent: "#1b1712", extra: [] },
    { id: "red", bg: "#f4e6cc", ink: "#8e1b1b", muted: "#6b3a2a", accent: "#8e1b1b", extra: [] },
    { id: "yellow", bg: "#f6d860", ink: "#1b1712", muted: "#3f3520", accent: "#1b1712", extra: [] },
  ],
  build: (p) => {
    const w = 70;
    const h = 110;
    // The woodcut is printed in one ink and the paper shows through the carved lines.
    const ink = p.accent;
    const paper = p.bg;
    let rays = "";
    const [sx, sy] = [47, 38.5];
    for (let i = 0; i < 16; i += 1) {
      const a = (i / 16) * Math.PI * 2;
      const long = i % 2 === 0 ? 11.5 : 9.2;
      rays += polygon(
        [
          [sx + Math.cos(a - 0.11) * 6.4, sy + Math.sin(a - 0.11) * 6.4],
          [sx + Math.cos(a) * long, sy + Math.sin(a) * long],
          [sx + Math.cos(a + 0.11) * 6.4, sy + Math.sin(a + 0.11) * 6.4],
        ],
        ink,
      );
    }
    const sun =
      rays +
      `<circle cx="${sx}" cy="${sy}" r="5.4" fill="${ink}"/>` +
      `<circle cx="${sx}" cy="${sy}" r="4.3" fill="none" stroke="${paper}" stroke-width="0.3"/>` +
      `<circle cx="${r(sx - 1.4)}" cy="${r(sy - 0.9)}" r="0.5" fill="${paper}"/><circle cx="${r(sx + 1.4)}" cy="${r(sy - 0.9)}" r="0.5" fill="${paper}"/>` +
      `<path d="M${r(sx - 1.8)} ${r(sy + 1.1)}Q${sx} ${r(sy + 2.7)} ${r(sx + 1.8)} ${r(sy + 1.1)}" fill="none" stroke="${paper}" stroke-width="0.4" stroke-linecap="round"/>`;
    const carve = (d: string, width = 0.3) => `<path d="${d}" fill="none" stroke="${paper}" stroke-width="${width}" stroke-linecap="round"/>`;
    const hills =
      `<path d="M7 51 Q20 41 34 49 Q47 42 63 47 L63 62 L7 62Z" fill="${ink}"/>` +
      carve("M10 52.5 Q20 45 32 51.5") +
      carve("M12 55 Q21 49 30 54") +
      carve("M38 50.5 Q48 45.5 60 49") +
      carve("M41 53 Q49 49 58 51.5");
    // Mandacaru: a trunk and two arms with carved ribs and spines, cut out of the hills by a paper outline.
    const limbs: [string, number][] = [
      ["M19 60 L19 33.5", 3.8],
      ["M19 46 L14.9 46 Q13.5 46 13.5 44.6 L13.5 38.5", 2.6],
      ["M19 42 L23 42 Q24.4 42 24.4 40.6 L24.4 35.5", 2.6],
    ];
    const outline = limbs.map(([d, width]) => `<path d="${d}" fill="none" stroke="${paper}" stroke-width="${r(width + 1.3)}" stroke-linecap="round" stroke-linejoin="round"/>`).join("");
    const body = limbs.map(([d, width]) => `<path d="${d}" fill="none" stroke="${ink}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`).join("");
    let spines = "";
    for (let y = 34.5; y < 45; y += 2.4) {
      spines += `<path d="M16.4 ${r(y + 1.2)}l-0.8 -0.5M21.6 ${r(y)}l0.8 -0.5" stroke="${ink}" stroke-width="0.22"/>`;
    }
    const cactus =
      outline +
      body +
      carve("M18.3 35 L18.3 58", 0.25) +
      carve("M19.7 35 L19.7 58", 0.25) +
      carve("M13.5 39.5 L13.5 44.5", 0.22) +
      carve("M24.4 36.5 L24.4 40.5", 0.22) +
      spines;
    const ground =
      `<path d="M7 57 Q35 53.5 63 57.5 L63 62 L7 62Z" fill="${ink}"/>` +
      carve("M10 58.6 l2 0 M16 59.6 l2.5 0 M24 58.3 l2 0 M31 59.4 l3 0 M39 58.2 l2 0 M46 59.5 l2.5 0 M54 58.6 l2 0", 0.35);
    const sky =
      `<path d="M8.5 30.4 h5 M10 32 h5.5 M28 34.5 l1.2 -0.9 l1.2 0.9 l1.2 -0.9 l1.2 0.9 M32.5 31 l1 -0.7 l1 0.7 l1 -0.7 l1 0.7" fill="none" stroke="${ink}" stroke-width="0.35" stroke-linecap="round"/>`;
    const art = canvas(
      w,
      h,
      p.bg,
      `<rect x="2.5" y="2.5" width="65" height="105" fill="none" stroke="${ink}" stroke-width="0.9"/>` +
        `<rect x="4" y="4" width="62" height="102" fill="none" stroke="${ink}" stroke-width="0.25"/>` +
        `<g clip-path="url(#woodcut)">${sky}${sun}${hills}${cactus}${ground}</g>` +
        `<rect x="7" y="27" width="56" height="34" fill="none" stroke="${ink}" stroke-width="0.7"/>` +
        `<line x1="10" y1="78.5" x2="60" y2="78.5" stroke="${ink}" stroke-width="0.3"/>` +
        `<rect x="34.2" y="77.7" width="1.6" height="1.6" fill="${ink}" transform="rotate(45 35 78.5)"/>` +
        `<rect x="7" y="92" width="26" height="5.6" fill="${ink}"/>` +
        qrCard(39, 81.5, 23, 1.5),
      `<clipPath id="woodcut"><rect x="7" y="27" width="56" height="34"/></clipPath>`,
    );
    return {
      background: art,
      design: design(w, h, p.bg, {
        number: number(7, 99.5, 26, 5, "slab", 9, p.muted, "left"),
        qr: [39, 81.5, 23],
        stub: null,
        texts: [
          block("{evento}", 6, 6.5, 58, 19, { font: "slab", sizePt: 19, color: p.ink, align: "center", lines: 2 }),
          block("{data_extenso}", 6, 63.5, 58, 4.5, { sizePt: 8, bold: true, color: p.ink, align: "center" }),
          block(c.fromTime, 6, 68, 58, 4, { sizePt: 7.5, color: p.muted, align: "center" }),
          block("{local}", 6, 72, 58, 4, { sizePt: 7.5, color: p.muted, align: "center" }),
          block("{preco}", 7, 83, 26, 7, { font: "slab", sizePt: 13, color: p.ink }),
          block(c.ticket, 7, 92.8, 26, 4, { sizePt: 7, bold: true, color: p.bg, align: "center", uppercase: true, letterSpacing: 0.3 }),
        ],
      }),
    };
  },
};

const electronic: TicketTemplate = {
  id: "electronic",
  categories: ["music", "party"],
  palettes: [
    { id: "synthwave", bg: "#0d0221", ink: "#ffffff", muted: "#cbb8ff", accent: "#ff2a6d", extra: ["#05d9e8", "#ffd319", "#3d0f6b"] },
    { id: "cyber", bg: "#03070d", ink: "#f0fff4", muted: "#9fc0b0", accent: "#39ff14", extra: ["#00e5ff", "#eaff00", "#0b3340"] },
    { id: "ice", bg: "#050b1f", ink: "#ffffff", muted: "#b9c7e6", accent: "#7dd3fc", extra: ["#a78bfa", "#ffffff", "#1e3a8a"] },
  ],
  build: (p) => {
    const [line = p.accent, sunTop = p.accent, horizonSky = p.bg] = p.extra;
    const horizon = 35;
    const [vx, sunR] = [88, 16];
    // Stripes cut out of the lower half of the sun, thicker towards the horizon.
    let cuts = "";
    for (const [y, height] of [[24.2, 0.6], [27, 0.9], [29.6, 1.2], [32.1, 1.5]] as const) {
      cuts += `<rect x="${vx - sunR - 1}" y="${y}" width="${sunR * 2 + 2}" height="${height}" fill="#000000"/>`;
    }
    // The floor: lines from the vanishing point and rows that get farther apart.
    let grid = "";
    for (let k = -11; k <= 11; k += 1) {
      grid += `<line x1="${r(vx + k * 1.4)}" y1="${horizon}" x2="${r(vx + k * 15)}" y2="58" stroke="${p.accent}" stroke-width="0.3"/>`;
    }
    for (const d of [0.7, 1.7, 3.1, 5, 7.6, 11, 15.4, 21]) {
      grid += `<line x1="-3" y1="${r(horizon + d)}" x2="153" y2="${r(horizon + d)}" stroke="${p.accent}" stroke-width="${r(0.18 + d * 0.012)}"/>`;
    }
    const art = canvas(
      W,
      H,
      p.bg,
      `<rect x="-3" y="-3" width="156" height="${horizon + 3}" fill="url(#sky)"/>` +
        `<ellipse cx="${vx}" cy="${horizon}" rx="45" ry="18" fill="url(#haze)"/>` +
        `<circle cx="${vx}" cy="${horizon}" r="${sunR}" fill="url(#sunfill)" mask="url(#slits)"/>` +
        `<rect x="-3" y="${horizon}" width="156" height="23" fill="${p.bg}"/>` +
        grid +
        `<line x1="-3" y1="${horizon}" x2="153" y2="${horizon}" stroke="${line}" stroke-width="0.45"/>` +
        `<rect x="-3" y="-3" width="156" height="61" fill="url(#fade)"/>` +
        qrCard(QR[0], QR[1], QR[2], 2, `stroke="${line}" stroke-width="0.5"`),
      linear("sky", [[0, p.bg], [1, horizonSky]], 90) +
        linear("sunfill", [[0, sunTop], [1, p.accent]], 90) +
        linear("fade", [[0, p.bg, 1], [0.3, p.bg, 0.88], [0.5, p.bg, 0]], 0) +
        glow("haze", p.accent, 0.45) +
        `<mask id="slits"><rect x="-3" y="-3" width="156" height="61" fill="#ffffff"/>${cuts}</mask>`,
    );
    return {
      background: art,
      design: design(W, H, p.bg, {
        number: number(108, 4, 38, 10, "display", 22, p.ink),
        qr: QR,
        stub: null,
        texts: [
          block("{semana} · {hora}", 8, 5.5, 70, 5, { font: "mono", sizePt: 8, color: line, uppercase: true, letterSpacing: 0.15 }),
          block("{evento}", 8, 11, 70, 24, { font: "display", sizePt: 40, color: p.ink, uppercase: true, lines: 2 }),
          block("{data_extenso}", 8, 37, 66, 5, { sizePt: 9.5, bold: true, color: p.ink }),
          block("{local}", 8, 42.5, 66, 4.5, { sizePt: 9, color: p.muted }),
          block("{preco}", 8, 48, 50, 4, { font: "mono", sizePt: 8.5, color: p.accent }),
        ],
      }),
    };
  },
};

const jazz: TicketTemplate = {
  id: "jazz",
  categories: ["music", "culture", "formal"],
  palettes: [
    { id: "navy", bg: "#0b1430", ink: "#f7f1e1", muted: "#b7bfd6", accent: "#d4af37", extra: ["#f7f1e1", "#05070f"] },
    { id: "cream", bg: "#f6efe0", ink: "#1d1a16", muted: "#5e554a", accent: "#a8742a", extra: ["#fffdf7", "#1d1a16"] },
    { id: "wine", bg: "#2a0b14", ink: "#fbefe4", muted: "#d6b4ad", accent: "#d9b45a", extra: ["#fbefe4", "#0e0306"] },
  ],
  build: (p) => {
    const [white = "#ffffff", black = "#000000"] = p.extra;
    // The keyboard runs down the left edge: white keys across, black keys from the edge.
    const pitch = 5.2;
    let keys = `<rect x="-3" y="-3" width="14" height="61" fill="${white}"/>`;
    for (let k = 1; -3 + k * pitch < 58; k += 1) {
      const y = -3 + k * pitch;
      keys += `<line x1="-3" y1="${r(y)}" x2="11" y2="${r(y)}" stroke="${black}" stroke-width="0.2" opacity="0.55"/>`;
      if ([1, 2, 4, 5, 6].includes(k % 7)) {
        keys += `<rect x="-3" y="${r(y - 1.55)}" width="8.6" height="3.1" rx="0.4" fill="${black}"/>`;
      }
    }
    const rule = (y: number) =>
      `<line x1="18" y1="${y}" x2="148" y2="${y}" stroke="${p.accent}" stroke-width="0.35"/>` +
      `<line x1="18" y1="${r(y + 0.8)}" x2="148" y2="${r(y + 0.8)}" stroke="${p.accent}" stroke-width="0.12"/>`;
    const art = canvas(
      W,
      H,
      p.bg,
      `<ellipse cx="70" cy="22" rx="60" ry="30" fill="url(#smoke)"/>` +
        keys +
        `<rect x="11" y="-3" width="0.6" height="61" fill="${p.accent}"/>` +
        rule(2.6) +
        rule(51.6) +
        qrCard(QR[0], 18, 27, 2, `stroke="${p.accent}" stroke-width="0.3"`),
      glow("smoke", p.accent, 0.13),
    );
    return {
      background: art,
      design: design(W, H, p.bg, {
        number: number(108, 6, 38, 9, "serif", 13, p.accent),
        qr: [QR[0], 18, 27],
        stub: STUB,
        texts: [
          block("{data_extenso}", 18, 7, 88, 4.5, { bold: true, sizePt: 7.5, color: p.accent, uppercase: true, letterSpacing: 0.25 }),
          block("{evento}", 18, 12.5, 92, 21, { font: "serif", sizePt: 26, color: p.ink, lines: 2 }),
          block(c.atTime, 18, 35.5, 60, 6, { font: "script", sizePt: 17, color: p.accent }),
          block("{local}", 18, 42, 88, 4.5, { sizePt: 9, color: p.muted }),
          block("{preco}", 18, 46.8, 60, 4, { sizePt: 8.5, bold: true, color: p.ink }),
        ],
      }),
    };
  },
};

const festival: TicketTemplate = {
  id: "festival",
  categories: ["music", "party", "culture"],
  palettes: [
    { id: "summer", bg: "#fff4e0", ink: "#2b1b4a", muted: "#6b5a7b", accent: "#e8452c", extra: ["#ffb703", "#fb8500", "#ef4f3a", "#d6336c", "#7b2cbf"] },
    { id: "sunset", bg: "#24123f", ink: "#fff4e8", muted: "#d6c2e8", accent: "#ffb347", extra: ["#ffd166", "#ff9f5a", "#f25f5c", "#c33c86", "#6a35b0"] },
    { id: "forest", bg: "#0f2e24", ink: "#f4f1de", muted: "#b9c8b5", accent: "#f2cc8f", extra: ["#f2cc8f", "#e07a5f", "#c9a66b", "#81b29a", "#3d8361"] },
  ],
  build: (p) => {
    // A long ticket, like a wristband: the sun rises from the corner in rings of colour.
    const w = 180;
    const h = 50;
    const [cx, cy] = [13, 50];
    const [sunColor = p.accent, ...rings] = p.extra;
    let sun = "";
    rings.forEach((color, i) => {
      sun += `<circle cx="${cx}" cy="${cy}" r="${36 - i * 6}" fill="${color}"/>`;
    });
    sun += `<circle cx="${cx}" cy="${cy}" r="12" fill="${sunColor}"/>`;
    let rays = "";
    for (let a = 200; a <= 320; a += 12) {
      const rad = (a * Math.PI) / 180;
      rays += `<line x1="${r(cx + Math.cos(rad) * 39.5)}" y1="${r(cy + Math.sin(rad) * 39.5)}" x2="${r(cx + Math.cos(rad) * 43.5)}" y2="${r(cy + Math.sin(rad) * 43.5)}" stroke="${sunColor}" stroke-width="0.9" stroke-linecap="round"/>`;
    }
    // Stripes of the same colours along the top edge.
    let ribbon = "";
    rings.forEach((color, i) => {
      ribbon += `<rect x="-3" y="${r(-3 + i * 1.3)}" width="${w + 6}" height="1.4" fill="${color}"/>`;
    });
    const art = canvas(
      w,
      h,
      p.bg,
      ribbon + `<rect x="-3" y="2.2" width="${w + 6}" height="0.5" fill="${p.bg}"/>` + rays + sun + qrCard(150, 12, 26),
    );
    return {
      background: art,
      design: design(w, h, p.bg, {
        number: number(146, 41.5, 34, 6, "display", 15, p.ink, "center"),
        qr: [150, 12, 26],
        stub: null,
        texts: [
          block(c.gates, 52, 6, 88, 4.5, { bold: true, sizePt: 7.5, color: p.accent, uppercase: true, letterSpacing: 0.25 }),
          block("{evento}", 52, 11, 92, 22, { font: "display", sizePt: 36, color: p.ink, uppercase: true, lines: 2 }),
          block("{dias}", 52, 33.5, 90, 6.5, { font: "slab", sizePt: 13, color: p.accent }),
          block("{local}", 52, 41.5, 62, 5, { sizePt: 9, bold: true, color: p.muted }),
          block("{preco}", 114, 41.5, 28, 5, { sizePt: 9, bold: true, color: p.ink, align: "right" }),
        ],
      }),
    };
  },
};

const flashback: TicketTemplate = {
  id: "flashback",
  categories: ["music", "party"],
  palettes: [
    { id: "neon", bg: "#14062b", ink: "#ffffff", muted: "#cdb6f2", accent: "#ff3ea5", extra: ["#00e5ff", "#ffe600", "#ff3ea5"] },
    { id: "pastel", bg: "#fdf0f7", ink: "#2a1250", muted: "#6a4f8a", accent: "#e8217f", extra: ["#0b7fa0", "#ffb400", "#7b2ff7"] },
    { id: "fire", bg: "#120a06", ink: "#fff7ed", muted: "#d9bfa9", accent: "#ff6a13", extra: ["#ffd000", "#ff2e63", "#ff6a13"] },
  ],
  build: (p) => {
    const [cyan = p.accent, yellow = p.accent, third = p.accent] = p.extra;
    // The record peeks in from the left edge, label and all.
    const [cx, cy, radius] = [7, 27.5, 28];
    let grooves = "";
    for (let g = 11; g < radius - 0.6; g += 1.05) {
      grooves += `<circle cx="${cx}" cy="${cy}" r="${r(g)}" fill="none" stroke="#3b3b3b" stroke-width="${g % 3 < 1 ? 0.2 : 0.1}"/>`;
    }
    const wedge = (from: number, to: number) => {
      const a = (from * Math.PI) / 180;
      const b = (to * Math.PI) / 180;
      return `<path d="M${cx} ${cy}L${r(cx + Math.cos(a) * radius)} ${r(cy + Math.sin(a) * radius)}A${radius} ${radius} 0 0 1 ${r(cx + Math.cos(b) * radius)} ${r(cy + Math.sin(b) * radius)}Z" fill="#ffffff" opacity="0.09"/>`;
    };
    const record =
      `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="#101010"/>` +
      grooves +
      wedge(-62, -38) +
      wedge(118, 142) +
      `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="#2a2a2a" stroke-width="0.5"/>` +
      `<circle cx="${cx}" cy="${cy}" r="9.6" fill="${p.accent}"/>` +
      `<path d="M${r(cx - 9.6)} ${r(cy - 1.4)}h19.2v2.8h-19.2Z" fill="${yellow}" clip-path="url(#label)"/>` +
      `<circle cx="${cx}" cy="${cy}" r="7.4" fill="none" stroke="#ffffff" stroke-width="0.2" opacity="0.6"/>` +
      `<circle cx="${cx}" cy="${cy}" r="1" fill="${p.bg}"/>`;
    const neon = (y: number, color: string) => `<rect x="38" y="${y}" width="118" height="0.6" rx="0.3" fill="${color}"/>`;
    const art = canvas(
      W,
      H,
      p.bg,
      `<circle cx="${cx}" cy="${cy}" r="44" fill="url(#halo)"/>` +
        `<ellipse cx="150" cy="58" rx="50" ry="26" fill="url(#halo2)"/>` +
        record +
        neon(50.6, third) +
        neon(52, cyan) +
        neon(53.4, yellow) +
        qrCard(QR[0], QR[1], QR[2]),
      glow("halo", p.accent, 0.45) + glow("halo2", cyan, 0.25) + `<clipPath id="label"><circle cx="${cx}" cy="${cy}" r="9.6"/></clipPath>`,
    );
    return {
      background: art,
      design: design(W, H, p.bg, {
        number: number(108, 4, 38, 10, "display", 22, p.ink),
        qr: QR,
        stub: STUB,
        texts: [
          block("{semana} · {hora}", 42, 4, 66, 8, { font: "script", sizePt: 18, color: p.accent }),
          block("{evento}", 42, 12, 68, 22, { font: "display", sizePt: 38, color: p.ink, uppercase: true, lines: 2 }),
          block("{data_extenso}", 42, 35, 66, 5, { sizePt: 9.5, bold: true, color: cyan }),
          block("{local}", 42, 40.5, 66, 4.5, { sizePt: 9, color: p.muted }),
          block("{preco}", 42, 45.3, 50, 4.2, { sizePt: 8.5, bold: true, color: p.ink }),
        ],
      }),
    };
  },
};

const discoBall: TicketTemplate = {
  id: "discoBall",
  categories: ["music", "party"],
  palettes: [
    { id: "disco", bg: "#2a0f3d", ink: "#fff4e0", muted: "#e3c9ef", accent: "#ffb627", extra: ["#ff7a1a", "#c44dff", "#3a3a4a", "#f4f4f8"] },
    { id: "copper", bg: "#3d1607", ink: "#fff1d6", muted: "#f0c9a0", accent: "#ffc23d", extra: ["#ff5e1a", "#ffd9a0", "#4a3a32", "#fff6e8"] },
    { id: "silver", bg: "#111114", ink: "#ffffff", muted: "#c4c4cc", accent: "#ff4fd8", extra: ["#4fd8ff", "#d9dce3", "#33333d", "#ffffff"] },
  ],
  build: (p) => {
    const [tint1 = p.accent, tint2 = p.accent, shade = "#333333", shine = "#ffffff"] = p.extra;
    const [bx, by, br] = [95, 19.5, 13];
    const next = random(70);
    // Facets of the mirror ball: a grid of latitude and longitude, lit from the upper left.
    const at = (lat: number, lon: number) => {
      const la = (lat * Math.PI) / 180;
      const lo = (lon * Math.PI) / 180;
      return [bx + br * Math.cos(la) * Math.sin(lo), by - br * Math.sin(la)] as [number, number];
    };
    let facets = "";
    for (let lat = -90; lat < 90; lat += 15) {
      for (let lon = -90; lon < 90; lon += 12) {
        const la = ((lat + 7.5) * Math.PI) / 180;
        const lo = ((lon + 6) * Math.PI) / 180;
        const light = Math.cos(la) * Math.sin(lo) * -0.5 + Math.sin(la) * 0.6 + Math.cos(la) * Math.cos(lo) * 0.62;
        const roll = next();
        const fill =
          roll < 0.07 ? shine : roll < 0.17 ? tint1 : roll < 0.25 ? tint2 : mix(shade, shine, 0.15 + Math.max(0, light) * 0.75 + (next() - 0.5) * 0.25);
        facets += polygon([at(lat, lon), at(lat, lon + 12), at(lat + 15, lon + 12), at(lat + 15, lon)], fill, `stroke="${shade}" stroke-width="0.12"`);
      }
    }
    // Beams spinning off the ball, and flecks of light around it.
    let beams = "";
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * Math.PI * 2 + 0.2;
      const color = i % 2 === 0 ? tint1 : tint2;
      beams += polygon(
        [
          [bx, by],
          [bx + Math.cos(a - 0.05) * 140, by + Math.sin(a - 0.05) * 140],
          [bx + Math.cos(a + 0.05) * 140, by + Math.sin(a + 0.05) * 140],
        ],
        color,
        `opacity="0.08"`,
      );
    }
    const sparkle = (x: number, y: number, size: number, color: string, opacity = 1) =>
      `<path d="M${r(x)} ${r(y - size)}Q${r(x + size * 0.12)} ${r(y - size * 0.12)} ${r(x + size)} ${r(y)}Q${r(x + size * 0.12)} ${r(y + size * 0.12)} ${r(x)} ${r(y + size)}Q${r(x - size * 0.12)} ${r(y + size * 0.12)} ${r(x - size)} ${r(y)}Q${r(x - size * 0.12)} ${r(y - size * 0.12)} ${r(x)} ${r(y - size)}Z" fill="${color}" opacity="${opacity}"/>`;
    let flecks = "";
    for (let i = 0; i < 26; i += 1) {
      const x = -2 + next() * 112;
      const y = -2 + next() * 58;
      const color = [tint1, tint2, shine][i % 3] ?? shine;
      flecks += `<circle cx="${r(x)}" cy="${r(y)}" r="${r(0.25 + next() * 0.5)}" fill="${color}" opacity="${r(0.35 + next() * 0.4)}"/>`;
    }
    const art = canvas(
      W,
      H,
      p.bg,
      beams +
        `<circle cx="${bx}" cy="${by}" r="30" fill="url(#aura)"/>` +
        flecks +
        `<line x1="${bx}" y1="-3" x2="${bx}" y2="${by - br}" stroke="${shine}" stroke-width="0.3" opacity="0.7"/>` +
        `<rect x="${bx - 1.2}" y="${by - br - 1.6}" width="2.4" height="1.9" rx="0.3" fill="${shade}"/>` +
        `<g clip-path="url(#ball)">${facets}</g>` +
        `<circle cx="${bx}" cy="${by}" r="${br}" fill="url(#rim)"/>` +
        sparkle(bx - 5.5, by - 6, 3.6, shine) +
        sparkle(bx + 6, by + 5.5, 2, shine, 0.9) +
        sparkle(bx - 13, by + 10, 1.6, tint1, 0.8) +
        sparkle(bx + 12, by - 11, 1.4, tint2, 0.8) +
        qrCard(QR[0], QR[1], QR[2]),
      glow("aura", tint1, 0.35) +
        `<radialGradient id="rim"><stop offset="0.7" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity="0.45"/></radialGradient>` +
        `<clipPath id="ball"><circle cx="${bx}" cy="${by}" r="${br}"/></clipPath>`,
    );
    return {
      background: art,
      design: design(W, H, p.bg, {
        number: number(108, 4, 38, 10, "serif", 15, p.ink),
        qr: QR,
        stub: null,
        texts: [
          block("{semana} · {hora}", 8, 5, 70, 6.5, { font: "casual", sizePt: 12, color: p.accent }),
          block("{evento}", 8, 12.5, 76, 22, { font: "serif", sizePt: 28, color: p.ink, lines: 2 }),
          block("{data_extenso}", 8, 36.5, 76, 5, { sizePt: 9.5, bold: true, color: p.ink }),
          block("{local}", 8, 42, 76, 4.5, { sizePt: 9, color: p.muted }),
          block("{preco}", 8, 47.5, 50, 4, { sizePt: 8.5, bold: true, color: p.accent }),
        ],
      }),
    };
  },
};

const vip: TicketTemplate = {
  id: "vip",
  categories: ["music", "party", "formal"],
  palettes: [
    { id: "gold", bg: "#0a0a0a", ink: "#ffffff", muted: "#bdb6a6", accent: "#d4af37", extra: ["#f6dc86", "#8a6a1c"] },
    { id: "platinum", bg: "#0c0d10", ink: "#ffffff", muted: "#b8bcc6", accent: "#d9dde4", extra: ["#f7f8fa", "#6f7686"] },
    { id: "velvet", bg: "#3a0610", ink: "#fff5ea", muted: "#e0bfb5", accent: "#e2b659", extra: ["#f6dc8f", "#8f6a22"] },
  ],
  build: (p) => {
    const w = 160;
    const h = 60;
    const [light = p.accent, deep = p.accent] = p.extra;
    const qr: [number, number, number] = [124, 20, 29];
    // Diagonal stripes of metal between the texts and the QR.
    let stripes = "";
    for (const [offset, width] of [[0, 2.4], [3.6, 0.6], [5.4, 4.2], [11, 0.6], [12.8, 1.6]] as const) {
      const x = 88 + offset;
      stripes += polygon(
        [
          [x, h + 3],
          [x + width, h + 3],
          [x + width + 20, -3],
          [x + 20, -3],
        ],
        "url(#metal)",
      );
    }
    const corner = (x: number, y: number) => `<rect x="${r(x - 0.9)}" y="${r(y - 0.9)}" width="1.8" height="1.8" fill="${p.accent}" transform="rotate(45 ${x} ${y})"/>`;
    const art = canvas(
      w,
      h,
      p.bg,
      `<ellipse cx="30" cy="20" rx="55" ry="35" fill="url(#lux)"/>` +
        stripes +
        `<rect x="3" y="3" width="${w - 6}" height="${h - 6}" fill="none" stroke="${p.accent}" stroke-width="0.4"/>` +
        `<rect x="4.2" y="4.2" width="${w - 8.4}" height="${h - 8.4}" fill="none" stroke="${p.accent}" stroke-width="0.15"/>` +
        corner(3, 3) +
        corner(w - 3, 3) +
        corner(3, h - 3) +
        corner(w - 3, h - 3) +
        `<line x1="10" y1="25.6" x2="34" y2="25.6" stroke="${p.accent}" stroke-width="0.35"/>` +
        qrCard(qr[0], qr[1], qr[2], 2, `stroke="${p.accent}" stroke-width="0.35"`),
      linear("metal", [[0, deep], [0.45, light], [0.6, p.accent], [1, deep]], 90) + glow("lux", p.accent, 0.12),
    );
    return {
      background: art,
      design: design(w, h, p.bg, {
        number: number(117, 7.5, 38, 9, "serif", 14, p.accent),
        qr,
        stub: null,
        texts: [
          block(c.vip, 9.5, 7.5, 60, 17, { font: "serif", sizePt: 46, color: p.accent, letterSpacing: 0.08 }),
          block("{evento}", 10, 28, 82, 15, { sizePt: 16, bold: true, color: p.ink, uppercase: true, letterSpacing: 0.06, lines: 2 }),
          block("{data_extenso} · {hora}", 10, 44.5, 82, 4.5, { sizePt: 8, bold: true, color: p.accent, uppercase: true, letterSpacing: 0.1 }),
          block("{local}", 10, 49.2, 50, 4.5, { sizePt: 8.5, color: p.muted }),
          block("{preco}", 60, 49.2, 24, 4.5, { sizePt: 8.5, bold: true, color: p.ink, align: "right" }),
        ],
      }),
    };
  },
};

const gospel: TicketTemplate = {
  id: "gospel",
  categories: ["music", "church"],
  palettes: [
    { id: "dawn", bg: "#2e1a5e", ink: "#ffffff", muted: "#efe3ff", accent: "#ffd166", extra: ["#8e3a8a", "#ff9a3c", "#fff3c4"] },
    { id: "sky", bg: "#0b4f9c", ink: "#ffffff", muted: "#e3f2ff", accent: "#ffe08a", extra: ["#2a78c8", "#9fdcff", "#ffffff"] },
    { id: "gold", bg: "#fffaf0", ink: "#3a2a10", muted: "#7a6644", accent: "#a8741a", extra: ["#fbeccb", "#f3cf7e", "#c8902a"] },
  ],
  build: (p) => {
    const [low = p.bg, dawn = p.accent, light = "#ffffff"] = p.extra;
    const [sx, sy] = [92, 59];
    // Rays of light fanning up from the sun on the horizon.
    let rays = "";
    for (let a = 188; a <= 352; a += 10) {
      const half = a % 20 === 8 ? 2.4 : 1.4;
      const from = ((a - half) * Math.PI) / 180;
      const to = ((a + half) * Math.PI) / 180;
      rays += polygon(
        [
          [sx, sy],
          [sx + Math.cos(from) * 150, sy + Math.sin(from) * 150],
          [sx + Math.cos(to) * 150, sy + Math.sin(to) * 150],
        ],
        light,
        `opacity="0.11"`,
      );
    }
    // Sound waves: a few sines that swell near the sun.
    const sound = (wavelength: number, phase: number, opacity: number) => {
      let d = "";
      for (let x = -3; x <= 113; x += 0.8) {
        const amplitude = 0.5 + 3.4 * Math.exp(-(((x - sx) / 24) ** 2));
        const y = 50.8 + amplitude * Math.sin((2 * Math.PI * x) / wavelength + phase);
        d += `${d === "" ? "M" : "L"}${r(x)} ${r(y)}`;
      }
      return `<path d="${d}" fill="none" stroke="${light}" stroke-width="0.45" opacity="${opacity}"/>`;
    };
    const art = canvas(
      W,
      H,
      p.bg,
      `<rect x="-3" y="-3" width="156" height="61" fill="url(#heaven)"/>` +
        `<ellipse cx="${sx}" cy="${sy}" rx="62" ry="38" fill="url(#dawn)"/>` +
        rays +
        `<circle cx="${sx}" cy="${sy}" r="10" fill="${light}" opacity="0.9"/>` +
        `<circle cx="${sx}" cy="${sy}" r="13" fill="none" stroke="${light}" stroke-width="0.3" opacity="0.5"/>` +
        sound(7, 0, 0.75) +
        sound(5.2, 1.4, 0.45) +
        sound(9.5, 2.6, 0.3) +
        qrCard(QR[0], QR[1], QR[2]),
      linear("heaven", [[0, p.bg], [1, low]], 90) + glow("dawn", dawn, 0.85),
    );
    return {
      background: art,
      design: design(W, H, p.bg, {
        number: number(108, 4, 38, 10, "display", 22, p.ink),
        qr: QR,
        stub: STUB,
        texts: [
          block("{semana} · {hora}", 8, 5.5, 80, 4.5, { bold: true, sizePt: 7.5, color: p.accent, uppercase: true, letterSpacing: 0.3 }),
          block("{evento}", 8, 11, 94, 22, { font: "display", sizePt: 40, color: p.ink, uppercase: true, lines: 2 }),
          block("{data_extenso}", 8, 34.5, 80, 5, { sizePt: 9.5, bold: true, color: p.ink }),
          block("{local}", 8, 40, 80, 4.5, { sizePt: 9, color: p.muted }),
          block("{preco}", 8, 45, 60, 4, { sizePt: 8.5, bold: true, color: p.accent }),
        ],
      }),
    };
  },
};

export const MUSIC_TEMPLATES: readonly TicketTemplate[] = [rock, sertanejo, samba, forro, electronic, jazz, festival, flashback, discoBall, vip, gospel];
