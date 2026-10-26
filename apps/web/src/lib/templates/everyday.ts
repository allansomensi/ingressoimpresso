/** Templates of the everyday set, listed in catalog.ts. */

import { templates as templatesTexts } from "@/texts/pt-BR/templates";

import { block, design, H, number, QR, STUB, W, type TicketTemplate } from "./kit";
import { branch, canvas, glow, linear, qrCard, r, random, star } from "./svg";

const c = templatesTexts.content;

/** Every category: the templates that fit any event. */
const ANY = ["business", "culture", "music", "school", "church", "party", "sports", "formal", "charity", "kids", "food", "birthday"] as const;

/** Digits drawn as strokes in a 3 × 5 box (bingo balls and cards): the background has no fonts. */
const DIGITS: Record<string, string> = {
  "0": "M1.5 0Q3 0 3 2.5Q3 5 1.5 5Q0 5 0 2.5Q0 0 1.5 0Z",
  "1": "M0.6 1.1L1.9 0V5",
  "2": "M0.1 1.1Q0.4 0 1.6 0Q3 0 3 1.4Q3 2.5 0 5H3",
  "3": "M0.2 0H2.9L1.3 2Q3 2 3 3.5Q3 5 1.5 5Q0.4 5 0 4.2",
  "4": "M2.2 5V0L0 3.4H3",
  "5": "M2.9 0H0.5L0.2 2.2Q0.8 1.8 1.6 1.8Q3 1.8 3 3.4Q3 5 1.5 5Q0.4 5 0 4.2",
  "6": "M2.7 0.3Q2.2 0 1.6 0Q0 0 0 3Q0 5 1.5 5Q3 5 3 3.4Q3 1.9 1.5 1.9Q0.4 1.9 0.1 2.9",
  "7": "M0 0H3L1 5",
  "8": "M1.5 2.3Q0.2 2.3 0.2 1.15Q0.2 0 1.5 0Q2.8 0 2.8 1.15Q2.8 2.3 1.5 2.3Q0 2.3 0 3.65Q0 5 1.5 5Q3 5 3 3.65Q3 2.3 1.5 2.3Z",
  "9": "M0.3 4.7Q0.8 5 1.4 5Q3 5 3 2Q3 0 1.5 0Q0 0 0 1.6Q0 3.1 1.5 3.1Q2.6 3.1 2.9 2.1",
};

/** `value` in stroke digits `height` tall, centred on (x, y). */
function digits(value: number, x: number, y: number, height: number, color: string, weight: number): string {
  const text = String(value);
  const s = height / 5;
  const gap = 1.1;
  const width = (text.length * 3 + (text.length - 1) * gap) * s;
  let out = "";
  [...text].forEach((digit, i) => {
    const left = x - width / 2 + i * (3 + gap) * s;
    out += `<path d="${DIGITS[digit] ?? ""}" transform="translate(${r(left)} ${r(y - height / 2)}) scale(${r(s)})" fill="none" stroke="${color}" stroke-width="${r(weight / s)}" stroke-linecap="round" stroke-linejoin="round"/>`;
  });
  return out;
}

const stainedGlass: TicketTemplate = {
  id: "stainedGlass",
  categories: ["church", "culture", "formal"],
  palettes: [
    { id: "jewel", bg: "#f7f1e4", ink: "#2b1d47", muted: "#6a5a7d", accent: "#a87b2a", extra: ["#1f4fa8", "#b3263a", "#2f8f5b", "#e0a526", "#6b3fa0", "#3a8fc7"] },
    { id: "navy", bg: "#0f1a36", ink: "#f6ecd2", muted: "#b8c0d8", accent: "#d9b45a", extra: ["#1d4e9e", "#2f6fd0", "#d9a62b", "#f0cf6a", "#163a7a", "#5b8fe0"] },
    { id: "amberGlass", bg: "#fbf3e4", ink: "#4a2412", muted: "#85593d", accent: "#b5532a", extra: ["#d9541e", "#e8a020", "#a8322a", "#f2c14e", "#7a3b1d", "#c97a2c"] },
  ],
  build: (p) => {
    const lead = "#1d1a24";
    const next = random(13);
    const pane = () => p.extra[Math.floor(next() * p.extra.length)] ?? p.accent;
    // A pointed (equilateral) arch: two arcs of radius = span meeting at the apex.
    const [x0, x1, spring, bottom] = [6, 36, 30, 51];
    const apex = spring - (x1 - x0) * 0.866;
    const arch = `M${x0} ${bottom}L${x0} ${spring}A${x1 - x0} ${x1 - x0} 0 0 1 ${(x0 + x1) / 2} ${r(apex)}A${x1 - x0} ${x1 - x0} 0 0 1 ${x1} ${spring}L${x1} ${bottom}Z`;
    // Panes: a jittered grid, some cells split in two triangles, clipped by the arch.
    const cols = 6;
    const rows = 11;
    const points: [number, number][][] = [];
    for (let j = 0; j <= rows; j += 1) {
      const row: [number, number][] = [];
      for (let i = 0; i <= cols; i += 1) {
        row.push([3 + i * 6 + (next() - 0.5) * 2.6, 1 + j * 5 + (next() - 0.5) * 2.6]);
      }
      points.push(row);
    }
    let panes = "";
    for (let j = 0; j < rows; j += 1) {
      for (let i = 0; i < cols; i += 1) {
        const a = points[j]?.[i] ?? [0, 0];
        const b = points[j]?.[i + 1] ?? [0, 0];
        const cc = points[j + 1]?.[i + 1] ?? [0, 0];
        const d = points[j + 1]?.[i] ?? [0, 0];
        const pt = (q: [number, number]) => `${r(q[0])},${r(q[1])}`;
        if (next() < 0.5) {
          panes += `<polygon points="${pt(a)} ${pt(b)} ${pt(cc)}" fill="${pane()}"/><polygon points="${pt(a)} ${pt(cc)} ${pt(d)}" fill="${pane()}"/>`;
        } else {
          panes += `<polygon points="${pt(a)} ${pt(b)} ${pt(cc)} ${pt(d)}" fill="${pane()}"/>`;
        }
      }
    }
    // The rose at the top of the window: eight petals around a small disc.
    const [rx, ry, rr] = [21, 16.5, 6.8];
    let rose = `<circle cx="${rx}" cy="${ry}" r="${rr}" fill="${p.extra[3] ?? p.accent}"/>`;
    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * Math.PI * 2;
      const px = rx + Math.cos(angle) * rr * 0.58;
      const py = ry + Math.sin(angle) * rr * 0.58;
      rose += `<ellipse cx="${r(px)}" cy="${r(py)}" rx="${r(rr * 0.38)}" ry="${r(rr * 0.22)}" fill="${p.extra[i % 2 === 0 ? 1 : 0] ?? p.accent}" stroke="${lead}" stroke-width="0.4" transform="rotate(${Math.round((angle * 180) / Math.PI)} ${r(px)} ${r(py)})"/>`;
    }
    rose += `<circle cx="${rx}" cy="${ry}" r="${r(rr * 0.22)}" fill="${p.extra[3] ?? p.accent}" stroke="${lead}" stroke-width="0.4"/><circle cx="${rx}" cy="${ry}" r="${rr}" fill="none" stroke="${lead}" stroke-width="0.8"/>`;
    const art = canvas(
      W,
      H,
      p.bg,
      `<ellipse cx="21" cy="28" rx="34" ry="34" fill="url(#lightIn)"/>` +
        `<path d="${arch}" fill="none" stroke="${p.accent}" stroke-width="3"/>` +
        `<g clip-path="url(#arch)"><g stroke="${lead}" stroke-width="0.42" stroke-linejoin="round">${panes}</g>` +
        `<rect x="${x0}" y="${r(apex)}" width="${x1 - x0}" height="${r(bottom - apex)}" fill="url(#sheen)"/>` +
        rose +
        `<line x1="21" y1="${r(ry + rr)}" x2="21" y2="${bottom}" stroke="${lead}" stroke-width="0.9"/>` +
        `<line x1="${x0}" y1="37" x2="${x1}" y2="37" stroke="${lead}" stroke-width="0.9"/></g>` +
        `<path d="${arch}" fill="none" stroke="${lead}" stroke-width="1.1"/>` +
        `<rect x="3.5" y="${bottom}" width="35" height="2.2" rx="0.4" fill="${p.accent}"/>` +
        `<line x1="44" y1="35.2" x2="62" y2="35.2" stroke="${p.accent}" stroke-width="0.4"/>` +
        qrCard(QR[0], QR[1], QR[2], 2, `stroke="${p.accent}" stroke-width="0.35"`),
      `<clipPath id="arch"><path d="${arch}"/></clipPath>` +
        glow("lightIn", p.extra[3] ?? p.accent, 0.22) +
        linear("sheen", [[0, "#ffffff", 0.28], [0.5, "#ffffff", 0], [1, "#000000", 0.12]], 70),
    );
    return {
      background: art,
      design: design(W, H, p.bg, {
        number: number(108, 4, 38, 10, "serif", 13, p.ink),
        qr: QR,
        stub: STUB,
        texts: [
          block("{data_extenso}", 44, 6, 66, 4.5, { bold: true, sizePt: 7.5, color: p.accent, uppercase: true, letterSpacing: 0.22 }),
          block("{evento}", 44, 11.5, 68, 22, { font: "serif", sizePt: 24, color: p.ink, lines: 2 }),
          block(c.fromTime, 44, 37.5, 66, 4.5, { sizePt: 9.5, bold: true, color: p.ink }),
          block("{local}", 44, 42.5, 66, 4.5, { sizePt: 9, color: p.muted }),
          block("{preco}", 44, 47.5, 60, 4, { sizePt: 8.5, bold: true, color: p.accent }),
        ],
      }),
    };
  },
};

const badge: TicketTemplate = {
  id: "badge",
  categories: ["business", "school", "church"],
  palettes: [
    { id: "blue", bg: "#ffffff", ink: "#0f172a", muted: "#5b6577", accent: "#1d4ed8", extra: ["#ffffff", "#60a5fa", "#dbe7ff"] },
    { id: "graphite", bg: "#17181c", ink: "#f4f4f5", muted: "#a1a1aa", accent: "#f5b301", extra: ["#17181c", "#ffd75e", "#2a2b31"] },
    { id: "green", bg: "#ffffff", ink: "#0f2a1f", muted: "#55695f", accent: "#0f7a4a", extra: ["#ffffff", "#5fd39a", "#ddf3e7"] },
  ],
  build: (p) => {
    const w = 70;
    const h = 100;
    const [head = "#ffffff", light = p.accent, pale = p.bg] = p.extra;
    const art = canvas(
      w,
      h,
      p.bg,
      `<path d="M-3 -3H73V33L-3 39Z" fill="${p.accent}"/>` +
        `<path d="M-3 39L73 33V35.4L-3 41.4Z" fill="${light}"/>` +
        `<circle cx="64" cy="4" r="16" fill="${light}" opacity="0.18"/>` +
        `<circle cx="70" cy="22" r="9" fill="${light}" opacity="0.14"/>` +
        // The slot for the lanyard: punched out after printing.
        `<rect x="26" y="4.2" width="18" height="3.6" rx="1.8" fill="#ffffff" stroke="${p.muted}" stroke-width="0.25"/>` +
        `<rect x="-3" y="97" width="76" height="6" fill="${pale}"/>` +
        `<line x1="9" y1="63" x2="61" y2="63" stroke="${p.muted}" stroke-width="0.3"/>` +
        qrCard(23.5, 70.5, 23, 2, `stroke="${pale}" stroke-width="0.4"`),
    );
    return {
      background: art,
      design: design(w, h, p.bg, {
        number: number(5, 95.6, 60, 4.2, "mono", 7.5, p.muted, "center"),
        qr: [23.5, 70.5, 23],
        stub: null,
        texts: [
          block(c.badgeLabel, 5, 11, 60, 4.2, { bold: true, sizePt: 7, color: head, uppercase: true, letterSpacing: 0.4, align: "center" }),
          block("{evento}", 5, 16, 60, 15.5, { sizePt: 14, bold: true, color: head, align: "center", lines: 3 }),
          block("{data} · {hora}", 5, 44, 60, 5, { sizePt: 10, bold: true, color: p.ink, align: "center" }),
          block("{local}", 5, 49.5, 60, 4.5, { sizePt: 8.5, color: p.muted, align: "center" }),
          block(c.badgeAttendee, 5, 64.2, 60, 3.6, { sizePt: 6.5, bold: true, color: p.muted, align: "center", uppercase: true, letterSpacing: 0.35 }),
        ],
      }),
    };
  },
};

const tech: TicketTemplate = {
  id: "tech",
  categories: ["business", "school"],
  palettes: [
    { id: "terminal", bg: "#07110c", ink: "#eafff2", muted: "#8fb8a0", accent: "#39ff88", extra: ["#0d1f16", "#1f4a33"] },
    { id: "midnight", bg: "#0a1230", ink: "#eef3ff", muted: "#9fb0d8", accent: "#4cc9f0", extra: ["#111c45", "#24356f"] },
    { id: "light", bg: "#f4f7f5", ink: "#0f1f17", muted: "#4c6357", accent: "#0a8f53", extra: ["#1c2b23", "#c9dcd1"] },
  ],
  build: (p) => {
    const [chip = p.ink, faint = p.muted] = p.extra;
    const pad = (x: number, y: number) => `<circle cx="${x}" cy="${y}" r="0.9" fill="${p.bg}" stroke="${p.accent}" stroke-width="0.4"/>`;
    // Traces from the chip's pins: polylines at right angles and 45°, ending in pads or off the edge.
    const traces: [number, number, boolean][][] = [
      [[86.5, 19, false], [86.5, 12, false], [83, 8.5, false], [83, 4, true]],
      [[89.75, 19, false], [89.75, 7, true]],
      [[93, 19, false], [93, 13, false], [97, 9, false], [104, 9, true]],
      [[96.25, 19, false], [96.25, 4, false], [100, 0.5, false], [104, 0.5, false], [104, -3, false]],
      [[99.5, 19, false], [99.5, 16, false], [102.5, 13, false], [106, 13, true]],
      [[86.5, 33, false], [86.5, 40, false], [82, 44.5, false], [82, 58, false]],
      [[89.75, 33, false], [89.75, 49, true]],
      [[93, 33, false], [93, 38, false], [97, 42, false], [97, 58, false]],
      [[96.25, 33, false], [96.25, 35, false], [100.5, 39.25, false], [113, 39.25, false]],
      [[99.5, 33, false], [99.5, 34, false], [104.5, 34, false], [107.5, 31, false], [113, 31, false]],
      [[102, 22.5, false], [113, 22.5, false]],
      [[102, 26, false], [113, 26, false]],
      [[84, 22.5, false], [80.5, 22.5, false], [78, 20, true]],
      [[84, 29.5, false], [80.5, 29.5, false], [78, 32, true]],
      [[100, 52.5, false], [104, 48.5, false], [110, 48.5, true]],
      [[122, 51, false], [122, 53, false], [125, 56, false], [125, 58, false]],
      [[138, 51, false], [138, 58, false]],
      [[148.5, 18, false], [148.5, 12, false], [153, 7.5, false]],
    ];
    let lines = "";
    let pads = "";
    for (const trace of traces) {
      lines += `<polyline points="${trace.map(([x, y]) => `${x},${y}`).join(" ")}"/>`;
      for (const [x, y, end] of trace) {
        if (end) {
          pads += pad(x, y);
        }
      }
    }
    let pins = "";
    for (let i = 0; i < 5; i += 1) {
      const x = 86 + i * 3.25;
      pins += `<rect x="${r(x)}" y="18" width="1" height="1.6" fill="${p.accent}"/><rect x="${r(x)}" y="32.4" width="1" height="1.6" fill="${p.accent}"/>`;
    }
    for (const y of [22, 25.5, 29]) {
      pins += `<rect x="83" y="${y}" width="1.6" height="1" fill="${p.accent}"/><rect x="101.4" y="${y}" width="1.6" height="1" fill="${p.accent}"/>`;
    }
    const grid = `<pattern id="vias" width="3" height="3" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r="0.18" fill="${faint}"/></pattern>`;
    const art = canvas(
      W,
      H,
      p.bg,
      `<rect x="-3" y="-3" width="156" height="61" fill="url(#vias)" opacity="0.7"/>` +
        `<ellipse cx="93" cy="26" rx="30" ry="24" fill="url(#chipGlow)"/>` +
        `<g fill="none" stroke="${p.accent}" stroke-width="0.4" stroke-linejoin="round" opacity="0.75">${lines}</g>` +
        pads +
        pins +
        `<rect x="84.5" y="19.5" width="17" height="13" rx="0.8" fill="${chip}" stroke="${p.accent}" stroke-width="0.35"/>` +
        `<circle cx="86.6" cy="21.6" r="0.6" fill="${p.accent}" opacity="0.7"/>` +
        `<rect x="7" y="47.2" width="2" height="3.4" fill="${p.accent}"/>` +
        qrCard(QR[0], QR[1], QR[2], 2, `stroke="${p.accent}" stroke-width="0.4"`),
      grid + glow("chipGlow", p.accent, 0.16),
    );
    return {
      background: art,
      design: design(W, H, p.bg, {
        number: number(108, 4, 38, 9, "mono", 12, p.ink),
        qr: QR,
        stub: null,
        texts: [
          block(c.techPrompt, 8, 6, 70, 5, { font: "mono", sizePt: 9, color: p.accent }),
          block("{evento}", 8, 12.5, 72, 20, { font: "mono", sizePt: 19, color: p.ink, uppercase: true, lines: 2, letterSpacing: -0.04 }),
          block(c.techVenue, 8, 35.5, 72, 4.5, { font: "mono", sizePt: 8.5, color: p.muted }),
          block("{data_extenso}", 8, 40.5, 72, 4.5, { font: "mono", sizePt: 8.5, color: p.muted }),
          block("{preco}", 11, 46.7, 50, 4.5, { font: "mono", sizePt: 9.5, color: p.accent }),
        ],
      }),
    };
  },
};

const dinner: TicketTemplate = {
  id: "dinner",
  categories: ["food", "charity", "church"],
  palettes: [
    { id: "redGingham", bg: "#fffaf1", ink: "#7a1c1c", muted: "#8a5a4a", accent: "#c62828", extra: ["#d93636", "#ffffff"] },
    { id: "blueGingham", bg: "#f6faff", ink: "#12355b", muted: "#557090", accent: "#2f6db5", extra: ["#3b78c4", "#ffffff"] },
    { id: "black", bg: "#141414", ink: "#f5efe6", muted: "#b9b0a3", accent: "#c9a96e", extra: ["#c9a96e", "#141414"] },
  ],
  build: (p) => {
    const [check = p.accent, base = "#ffffff"] = p.extra;
    const gingham =
      `<pattern id="gingham" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="4" fill="${base}"/>` +
      `<rect width="2" height="4" fill="${check}" opacity="0.5"/><rect width="4" height="2" fill="${check}" opacity="0.5"/></pattern>`;
    const line = `stroke="${p.ink}" stroke-linecap="round" stroke-linejoin="round"`;
    const [px, py] = [95.5, 24.5];
    const art = canvas(
      W,
      H,
      p.bg,
      `<rect x="-3" y="46" width="156" height="12" fill="url(#gingham)"/>` +
        `<path d="M-3 45.2H153" stroke="${p.accent}" stroke-width="0.5"/>` +
        `<path d="M-3 46.4H153" stroke="${p.accent}" stroke-width="0.2" stroke-dasharray="1 0.7"/>` +
        // Plate, fork and knife, in line drawing.
        `<circle cx="${px}" cy="${py}" r="11.5" fill="${base}" stroke-width="0.4" ${line}/>` +
        `<circle cx="${px}" cy="${py}" r="8.3" fill="none" stroke-width="0.25" ${line}/>` +
        `<circle cx="${px}" cy="${py}" r="7.6" fill="${p.accent}" opacity="0.08"/>` +
        `<path d="M80.2 14.5V20.5Q80.2 22.6 81.6 22.6Q83 22.6 83 20.5V14.5M81.6 14.5V20.5M81.6 22.6V36.5" fill="none" stroke-width="0.4" ${line}/>` +
        `<path d="M110.5 36.5V24.2M110.5 24.2Q108.9 23 108.9 18.5Q109.2 14.8 110.9 14.4V24.2" fill="none" stroke-width="0.4" ${line}/>` +
        qrCard(QR[0], QR[1], QR[2]),
      gingham,
    );
    return {
      background: art,
      design: design(W, H, p.bg, {
        number: number(108, 4, 38, 9, "serif", 13, p.ink),
        qr: QR,
        stub: STUB,
        texts: [
          block(c.dinnerToast, 8, 4.5, 66, 7.5, { font: "script", sizePt: 17, color: p.accent }),
          block("{evento}", 8, 12, 68, 18, { font: "serif", sizePt: 22, color: p.ink, lines: 2 }),
          block("{data_extenso} · {hora}", 8, 31.5, 68, 4.5, { sizePt: 9, bold: true, color: p.ink }),
          block("{local}", 8, 36.5, 68, 4.2, { sizePt: 8.5, color: p.muted }),
          block("{preco}", 8, 40.8, 50, 4, { sizePt: 8.5, bold: true, color: p.accent }),
        ],
      }),
    };
  },
};

/** A row of flame tongues along `base`, `scale` of their full height. */
function flames(seed: number, base: number, scale: number, color: string, opacity = 1): string {
  const next = random(seed);
  let d = `M-3 58V${base}`;
  let x = -3;
  while (x < 153) {
    const w = 5 + next() * 5;
    const tall = (x > 106 ? 14 + next() * 10 : 7 + next() * 7) * scale;
    const lean = (next() - 0.5) * w * 0.6;
    d +=
      `C${r(x + w * 0.1)} ${r(base - tall * 0.5)} ${r(x + w * 0.35 + lean)} ${r(base - tall * 0.7)} ${r(x + w * 0.5 + lean)} ${r(base - tall)}` +
      `C${r(x + w * 0.6)} ${r(base - tall * 0.6)} ${r(x + w * 0.95)} ${r(base - tall * 0.35)} ${r(x + w)} ${base}`;
    x += w;
  }
  return `<path d="${d}V58Z" fill="${color}" opacity="${opacity}"/>`;
}

const churrasco: TicketTemplate = {
  id: "churrasco",
  categories: ["food", "party"],
  palettes: [
    { id: "fire", bg: "#3a2215", ink: "#fff3e0", muted: "#e3c7a8", accent: "#ffb627", extra: ["#50301c", "#24140b", "#d62828", "#f77f00", "#fcbf49"] },
    { id: "charcoal", bg: "#1f1f21", ink: "#f5f5f4", muted: "#c4bdb5", accent: "#ff7a1a", extra: ["#2a2a2d", "#161618", "#b3261e", "#ff6b1a", "#ffb347"] },
    { id: "gaucho", bg: "#123d26", ink: "#fff8e1", muted: "#cfe0cf", accent: "#ffcc29", extra: ["#174a2f", "#0d2f1d", "#c8102e", "#e8501c", "#ffcc29"] },
  ],
  build: (p) => {
    const [light = p.bg, dark = p.bg, red = p.accent, orange = p.accent, yellow = p.accent] = p.extra;
    const next = random(29);
    let planks = "";
    for (let i = 0; i < 5; i += 1) {
      const y = -3 + i * 12.2;
      planks += `<rect x="-3" y="${r(y)}" width="156" height="12.2" fill="${i % 2 === 0 ? p.bg : light}"/>`;
      for (let k = 0; k < 4; k += 1) {
        const gy = y + 2 + next() * 8.5;
        planks += `<path d="M-3 ${r(gy)}C30 ${r(gy - 1.2 + next() * 2.4)} 70 ${r(gy - 1.2 + next() * 2.4)} 100 ${r(gy)}S140 ${r(gy + next() * 1.6)} 153 ${r(gy)}" fill="none" stroke="${dark}" stroke-width="0.3" opacity="0.8"/>`;
      }
      const knot = 10 + next() * 130;
      planks += `<ellipse cx="${r(knot)}" cy="${r(y + 6)}" rx="2.2" ry="0.9" fill="none" stroke="${dark}" stroke-width="0.3" opacity="0.7"/>`;
      planks += `<line x1="-3" y1="${r(y + 12.2)}" x2="153" y2="${r(y + 12.2)}" stroke="${dark}" stroke-width="0.5"/>`;
      // Butt joints, staggered from plank to plank.
      const joint = i % 2 === 0 ? 62 : 28;
      planks += `<line x1="${joint}" y1="${r(y)}" x2="${joint}" y2="${r(y + 12.2)}" stroke="${dark}" stroke-width="0.4"/>`;
    }
    let embers = "";
    for (let i = 0; i < 18; i += 1) {
      embers += `<circle cx="${r(next() * 150)}" cy="${r(36 + next() * 12)}" r="${r(0.2 + next() * 0.35)}" fill="${yellow}" opacity="${r(0.4 + next() * 0.5)}"/>`;
    }
    const art = canvas(
      W,
      H,
      p.bg,
      planks +
        `<rect x="-3" y="30" width="156" height="28" fill="url(#heat)"/>` +
        embers +
        flames(4, 58, 1, red) +
        flames(5, 58, 0.72, orange) +
        flames(6, 58, 0.42, yellow) +
        qrCard(QR[0], QR[1], QR[2]),
      linear("heat", [[0, orange, 0], [1, red, 0.55]], 90),
    );
    return {
      background: art,
      design: design(W, H, p.bg, {
        number: number(108, 4, 38, 10, "slab", 15, p.ink),
        qr: QR,
        stub: STUB,
        texts: [
          block("{semana} · {hora}", 8, 5, 90, 5, { font: "slab", sizePt: 10, color: p.accent, uppercase: true, letterSpacing: 0.08 }),
          block("{evento}", 8, 11, 98, 20, { font: "slab", sizePt: 26, color: p.ink, lines: 2 }),
          block("{data_extenso}", 8, 32.5, 98, 4.5, { sizePt: 9.5, bold: true, color: p.ink }),
          block("{local}", 8, 37.5, 70, 4.5, { sizePt: 9, color: p.muted }),
          block("{preco}", 80, 37.5, 26, 4.5, { font: "slab", sizePt: 10, color: p.accent, align: "right" }),
        ],
      }),
    };
  },
};

/** A wine glass whose foot stands at (x, y), tilted by `tilt` degrees. */
function wineGlass(id: string, x: number, y: number, tilt: number, glass: string, wine: string): string {
  const bowl = "M-5.6 -33C-6.4 -25 -4.6 -19.6 0 -19.2C4.6 -19.6 6.4 -25 5.6 -33Z";
  return (
    `<g transform="translate(${x} ${y}) rotate(${tilt})">` +
    `<clipPath id="${id}"><path d="${bowl}"/></clipPath>` +
    `<rect x="-7" y="-28.2" width="14" height="10" fill="${wine}" clip-path="url(#${id})"/>` +
    `<path d="${bowl}" fill="#ffffff" fill-opacity="0.07" stroke="${glass}" stroke-width="0.4"/>` +
    `<path d="M-3.6 -31C-4.1 -27 -3.4 -23.8 -1.8 -22.2" fill="none" stroke="#ffffff" stroke-width="0.35" stroke-linecap="round" opacity="0.55"/>` +
    `<path d="M0 -19.2V-0.6M-4.4 0H4.4" fill="none" stroke="${glass}" stroke-width="0.5" stroke-linecap="round"/>` +
    `</g>`
  );
}

const wine: TicketTemplate = {
  id: "wine",
  categories: ["food", "formal"],
  palettes: [
    { id: "wine", bg: "#3b0a1a", ink: "#f8ece2", muted: "#d8b9b0", accent: "#d8ad5f", extra: ["#b0284e", "#7a9a52"] },
    { id: "rose", bg: "#fbeef0", ink: "#5b1a2c", muted: "#8f5a68", accent: "#b0475f", extra: ["#ec8fa2", "#7f9a62"] },
    { id: "ivory", bg: "#fbf7ee", ink: "#3b1020", muted: "#7a5a60", accent: "#7a1f35", extra: ["#8e1b3a", "#6f8a4a"] },
  ],
  build: (p) => {
    const [red = p.accent, leaf = p.accent] = p.extra;
    // A bunch of grapes hanging from a small vine.
    let grapes = "";
    const rows = [4, 3, 3, 2, 1];
    rows.forEach((count, j) => {
      for (let i = 0; i < count; i += 1) {
        const gx = 104 - ((count - 1) * 2.6) / 2 + i * 2.6 + (j % 2 === 0 ? 0 : 0.2);
        const gy = 8 + j * 2.3;
        grapes += `<circle cx="${r(gx)}" cy="${r(gy)}" r="1.45" fill="${red}" stroke="${p.bg}" stroke-width="0.25"/>`;
        grapes += `<circle cx="${r(gx - 0.45)}" cy="${r(gy - 0.5)}" r="0.35" fill="#ffffff" opacity="0.45"/>`;
      }
    });
    const art = canvas(
      W,
      H,
      p.bg,
      `<ellipse cx="92" cy="30" rx="34" ry="30" fill="url(#candle)"/>` +
        branch([78, 1.5], [112, 3], 0.12, 7, leaf, 2) +
        `<path d="M104 3.5V6.6M104 3.5Q107 1.6 108.5 3.8Q109.6 5.4 108 6.2" fill="none" stroke="${leaf}" stroke-width="0.35" stroke-linecap="round"/>` +
        grapes +
        wineGlass("glassL", 85, 50, 9, p.accent, red) +
        wineGlass("glassR", 99, 50, -9, p.accent, red) +
        `<g stroke="${p.accent}" stroke-width="0.3" stroke-linecap="round"><line x1="92" y1="13.2" x2="92" y2="10.6"/><line x1="88.9" y1="14" x2="87.6" y2="11.8"/><line x1="95.1" y1="14" x2="96.4" y2="11.8"/></g>` +
        `<line x1="8" y1="34.4" x2="26" y2="34.4" stroke="${p.accent}" stroke-width="0.35"/>` +
        qrCard(QR[0], QR[1], QR[2], 2, `stroke="${p.accent}" stroke-width="0.3"`),
      glow("candle", p.accent, 0.14),
    );
    return {
      background: art,
      design: design(W, H, p.bg, {
        number: number(108, 4, 38, 9, "serif", 12, p.accent),
        qr: QR,
        stub: null,
        texts: [
          block(c.wineLabel, 8, 4.5, 66, 8, { font: "script", sizePt: 19, color: p.accent }),
          block("{evento}", 8, 13, 70, 20, { font: "serif", sizePt: 24, color: p.ink, lines: 2 }),
          block("{data_extenso} · {hora}", 8, 36.5, 72, 4.5, { sizePt: 9, bold: true, color: p.ink }),
          block("{local}", 8, 41.5, 72, 4.5, { sizePt: 9, color: p.muted }),
          block("{preco}", 8, 46.5, 60, 4, { sizePt: 8.5, bold: true, color: p.accent }),
        ],
      }),
    };
  },
};

const oktoberfest: TicketTemplate = {
  id: "oktoberfest",
  categories: ["food", "party", "music"],
  palettes: [
    { id: "bavarian", bg: "#fbf6ea", ink: "#0d3b7a", muted: "#4f6688", accent: "#1f74c8", extra: ["#1f74c8", "#ffffff", "#f2a51a", "#8a5a1c"] },
    { id: "wood", bg: "#3a2414", ink: "#fff2d6", muted: "#e0c49e", accent: "#f2b134", extra: ["#6b4426", "#e9d3ae", "#f2a51a", "#ffe3a3"] },
    { id: "green", bg: "#0f3b2a", ink: "#fff7e3", muted: "#cfe2d4", accent: "#f2b134", extra: ["#1a6b48", "#f3efe2", "#f2a51a", "#ffe3a3"] },
  ],
  build: (p) => {
    const [lozenge = p.accent, white = "#ffffff", beer = "#f2a51a", glass = p.ink] = p.extra;
    const pattern =
      `<pattern id="raute" width="7" height="4.4" patternUnits="userSpaceOnUse" patternTransform="rotate(-25)"><rect width="7" height="4.4" fill="${white}"/>` +
      `<polygon points="3.5,0 7,2.2 3.5,4.4 0,2.2" fill="${lozenge}"/></pattern>`;
    let foam = "";
    for (const [fx, fy, fr] of [[83.6, 22.6, 2.4], [87.4, 21.4, 2.8], [91.6, 21.8, 2.6], [95.4, 21.2, 2.7], [99, 22.4, 2.3], [85.2, 24.8, 1.8], [97.6, 24.6, 1.9]] as const) {
      foam += `<circle cx="${fx}" cy="${fy}" r="${fr}" fill="#ffffff"/>`;
    }
    let bubbles = "";
    const next = random(41);
    for (let i = 0; i < 9; i += 1) {
      bubbles += `<circle cx="${r(85.5 + next() * 12)}" cy="${r(28 + next() * 16)}" r="${r(0.25 + next() * 0.35)}" fill="#ffffff" opacity="0.7"/>`;
    }
    const art = canvas(
      W,
      H,
      p.bg,
      `<rect x="-3" y="-3" width="156" height="12" fill="url(#raute)"/>` +
        `<rect x="-3" y="9" width="156" height="0.9" fill="${lozenge}"/>` +
        `<rect x="-3" y="52" width="156" height="6" fill="url(#raute)"/>` +
        `<rect x="-3" y="51.2" width="156" height="0.8" fill="${lozenge}"/>` +
        // The beer mug: handle, glass, beer, facets, foam.
        `<path d="M100.6 28.5H104.2Q107 28.5 107 31.3V39.2Q107 42 104.2 42H100.6" fill="none" stroke="${glass}" stroke-width="1.6" stroke-linejoin="round"/>` +
        `<rect x="83" y="23" width="18" height="25.5" rx="1.6" fill="url(#beer)" stroke="${glass}" stroke-width="0.6"/>` +
        `<g stroke="#ffffff" stroke-width="0.5" opacity="0.4"><line x1="87.5" y1="26.5" x2="87.5" y2="46"/><line x1="92" y1="26.5" x2="92" y2="46"/><line x1="96.5" y1="26.5" x2="96.5" y2="46"/></g>` +
        bubbles +
        foam +
        `<rect x="82" y="46.6" width="20" height="2" rx="0.6" fill="${glass}" opacity="0.9"/>` +
        qrCard(117, 18, 27),
      pattern + linear("beer", [[0, beer], [1, "#c97a0a"]], 90),
    );
    return {
      background: art,
      design: design(W, H, p.bg, {
        number: number(108, 10.6, 38, 5.6, "slab", 10, p.muted),
        qr: [117, 18, 27],
        stub: STUB,
        texts: [
          block(c.oktoberfestToast, 8, 12, 60, 6, { font: "slab", sizePt: 12, color: p.accent }),
          block("{evento}", 8, 18.5, 72, 18, { font: "slab", sizePt: 23, color: p.ink, lines: 2 }),
          block("{data_extenso} · {hora}", 8, 37.5, 72, 4.5, { sizePt: 9, bold: true, color: p.ink }),
          block("{local}", 8, 42, 72, 4.2, { sizePt: 8.5, color: p.muted }),
          block("{preco}", 8, 46.5, 60, 4.2, { font: "slab", sizePt: 9, color: p.accent }),
        ],
      }),
    };
  },
};

const bingo: TicketTemplate = {
  id: "bingo",
  categories: ["church", "charity", "school"],
  palettes: [
    { id: "red", bg: "#fff8e1", ink: "#3d1408", muted: "#7a4a30", accent: "#d62828", extra: ["#ffc93c", "#d62828", "#1d6fd1", "#2a9d5c"] },
    { id: "blue", bg: "#eef4ff", ink: "#0e2449", muted: "#46618d", accent: "#1d5ed8", extra: ["#ffc93c", "#1d5ed8", "#e63946", "#2a9d5c"] },
    { id: "green", bg: "#effaf1", ink: "#0f3320", muted: "#46705a", accent: "#178a4a", extra: ["#ffc93c", "#178a4a", "#e63946", "#1d6fd1"] },
  ],
  build: (p) => {
    const [daub = p.accent, ...balls] = p.extra;
    const next = random(75);
    // The card: B I N G O columns (1–15, 16–30…), a free star in the middle, some numbers marked.
    const [cx, cy, cw, ch] = [69, 11.2, 7.6, 7.85];
    let card = `<rect x="${cx}" y="3.6" width="${r(cw * 5)}" height="${r(51.2 - 3.6)}" rx="1.2" fill="#ffffff" stroke="${p.accent}" stroke-width="0.6"/>`;
    card += `<path d="M${cx} ${cy}V4.8Q${cx} 3.6 ${r(cx + 1.2)} 3.6H${r(cx + cw * 5 - 1.2)}Q${r(cx + cw * 5)} 3.6 ${r(cx + cw * 5)} 4.8V${cy}Z" fill="${p.accent}"/>`;
    const marked = new Set([1, 7, 13, 18, 21]);
    for (let col = 0; col < 5; col += 1) {
      const pool = Array.from({ length: 15 }, (_, i) => col * 15 + i + 1);
      for (let row = 0; row < 5; row += 1) {
        const pick = pool.splice(Math.floor(next() * pool.length), 1)[0] ?? 1;
        const x = cx + col * cw + cw / 2;
        const y = cy + row * ch + ch / 2;
        const index = row * 5 + col;
        if (index === 12) {
          card += star(x, y, 2.6, daub);
        } else {
          if (marked.has(index)) {
            card += `<circle cx="${r(x)}" cy="${r(y)}" r="3.1" fill="${daub}" opacity="0.55"/>`;
          }
          card += digits(pick, x, y, 3, p.ink, 0.42);
        }
      }
    }
    for (let i = 1; i < 5; i += 1) {
      card += `<line x1="${r(cx + i * cw)}" y1="${cy}" x2="${r(cx + i * cw)}" y2="51.2" stroke="${p.accent}" stroke-width="0.25"/>`;
      card += `<line x1="${cx}" y1="${r(cy + i * ch)}" x2="${r(cx + 5 * cw)}" y2="${r(cy + i * ch)}" stroke="${p.accent}" stroke-width="0.25"/>`;
    }
    const ball = (x: number, y: number, size: number, color: string, value: number) =>
      `<circle cx="${x}" cy="${y}" r="${size}" fill="${color}"/>` +
      `<circle cx="${x}" cy="${y}" r="${r(size * 0.62)}" fill="#ffffff"/>` +
      digits(value, x, y, size * 0.62, "#1d1d1d", 0.38) +
      `<ellipse cx="${r(x - size * 0.45)}" cy="${r(y - size * 0.55)}" rx="${r(size * 0.28)}" ry="${r(size * 0.16)}" fill="#ffffff" opacity="0.6" transform="rotate(-35 ${r(x - size * 0.45)} ${r(y - size * 0.55)})"/>`;
    const art = canvas(
      W,
      H,
      p.bg,
      card +
        ball(53, 45.5, 5.2, balls[0] ?? p.accent, 7) +
        ball(61.5, 39.8, 4.2, balls[1] ?? p.accent, 42) +
        ball(62.3, 49.8, 3.6, balls[2] ?? p.accent, 63) +
        qrCard(QR[0], QR[1], QR[2]),
    );
    return {
      background: art,
      design: design(W, H, p.bg, {
        number: number(108, 4, 38, 10, "condensed", 16, p.ink),
        qr: QR,
        stub: STUB,
        texts: [
          block(c.bingoTitle, 69, 4.4, 38, 6.4, { font: "display", sizePt: 16, color: "#ffffff", align: "center", letterSpacing: 0.3 }),
          block("{data} · {hora}", 7, 5.5, 58, 5.5, { font: "condensed", sizePt: 12, color: p.accent, uppercase: true, letterSpacing: 0.04 }),
          block("{evento}", 7, 12, 59, 21, { font: "condensed", sizePt: 28, color: p.ink, uppercase: true, lines: 2 }),
          block("{local}", 7, 35, 40, 4.5, { sizePt: 8.5, bold: true, color: p.muted, lines: 1 }),
          block("{preco}", 7, 41, 40, 6, { font: "condensed", sizePt: 14, color: p.accent }),
        ],
      }),
    };
  },
};

const raffleGift: TicketTemplate = {
  id: "raffleGift",
  categories: ["charity", "school", "church"],
  palettes: [
    { id: "red", bg: "#fff7ec", ink: "#5a0d16", muted: "#8a4a3e", accent: "#c8102e", extra: ["#e8b84a", "#ffffff", "#a30d26"] },
    { id: "pink", bg: "#fff3f7", ink: "#6b1238", muted: "#9a5674", accent: "#ef4f8b", extra: ["#ffffff", "#ffffff", "#d93a76"] },
    { id: "blue", bg: "#f0f6ff", ink: "#0f2a5c", muted: "#4a6390", accent: "#1f5fd6", extra: ["#ffcf3f", "#ffffff", "#174bb0"] },
  ],
  build: (p) => {
    const w = 70;
    const h = 45;
    const [ribbon = p.accent, , deep = p.accent] = p.extra;
    const dots = `<pattern id="wrap" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="1.2" cy="1.2" r="0.55" fill="#ffffff" opacity="0.28"/><circle cx="3.7" cy="3.7" r="0.55" fill="#ffffff" opacity="0.28"/></pattern>`;
    const [bx, by] = [56.5, 14.4];
    const bow =
      `<path d="M${bx} ${by}C${bx - 3} ${by - 8} ${bx - 11} ${by - 7} ${bx - 9} ${by - 2.6}C${bx - 8} ${by - 0.6} ${bx - 3} ${by} ${bx} ${by}Z" fill="${ribbon}" stroke="${deep}" stroke-width="0.3"/>` +
      `<path d="M${bx} ${by}C${bx + 3} ${by - 8} ${bx + 11} ${by - 7} ${bx + 9} ${by - 2.6}C${bx + 8} ${by - 0.6} ${bx + 3} ${by} ${bx} ${by}Z" fill="${ribbon}" stroke="${deep}" stroke-width="0.3"/>` +
      `<path d="M${bx - 1} ${by + 1}L${bx - 5} ${by + 4.6}L${bx - 3.2} ${by + 4.4}L${bx - 3} ${by + 6}L${bx + 0.4} ${by + 1.4}Z" fill="${ribbon}" stroke="${deep}" stroke-width="0.3"/>` +
      `<path d="M${bx + 1} ${by + 1}L${bx + 5} ${by + 4.6}L${bx + 3.2} ${by + 4.4}L${bx + 3} ${by + 6}L${bx - 0.4} ${by + 1.4}Z" fill="${ribbon}" stroke="${deep}" stroke-width="0.3"/>` +
      `<ellipse cx="${bx}" cy="${by}" rx="2" ry="1.8" fill="${ribbon}" stroke="${deep}" stroke-width="0.3"/>`;
    const art = canvas(
      w,
      h,
      p.bg,
      `<rect x="-3" y="-3" width="76" height="17.4" fill="${p.accent}"/>` +
        `<rect x="-3" y="-3" width="76" height="17.4" fill="url(#wrap)"/>` +
        `<rect x="54.9" y="-3" width="3.2" height="17.4" fill="${ribbon}"/>` +
        `<rect x="-3" y="12.8" width="76" height="3.2" fill="${ribbon}"/>` +
        bow +
        `<path d="M3.5 41.6H40" stroke="${p.accent}" stroke-width="0.25" stroke-dasharray="0.8 0.6"/>` +
        qrCard(45, 21, 22, 1.5),
      dots,
    );
    return {
      background: art,
      design: design(w, h, p.bg, {
        number: number(4, 1.6, 44, 10.5, "slab", 24, "#ffffff", "left"),
        qr: [45, 21, 22],
        stub: { side: "left", widthMm: 25, fields: [...STUB.fields], image: null },
        texts: [
          block("{evento}", 4, 18.5, 38, 10, { sizePt: 9.5, bold: true, color: p.ink, lines: 2 }),
          block(c.drawDate, 4, 29, 38, 4, { sizePt: 7, color: p.muted }),
          block("{preco}", 4, 34, 38, 6.5, { font: "slab", sizePt: 13, color: p.accent }),
        ],
      }),
    };
  },
};

/** A guilloché rosette: `count` wavy rings around (x, y). */
function rosette(x: number, y: number, radius: number, wave: number, lobes: number, count: number, color: string, opacity: number): string {
  let out = "";
  for (let k = 0; k < count; k += 1) {
    const phase = (k / count) * Math.PI * 2;
    let d = "";
    for (let i = 0; i < 120; i += 1) {
      const t = (i / 120) * Math.PI * 2;
      const rho = radius + wave * Math.sin(lobes * t + phase);
      d += `${i === 0 ? "M" : "L"}${r(x + Math.cos(t) * rho)} ${r(y + Math.sin(t) * rho)}`;
    }
    out += `<path d="${d}Z"/>`;
  }
  return `<g fill="none" stroke="${color}" stroke-width="0.14" opacity="${opacity}">${out}</g>`;
}

/** A guilloché band: braided sine waves between `x1` and `x2` around `y`. */
function guilloche(x1: number, x2: number, y: number, amplitude: number, wavelength: number, count: number, color: string): string {
  let out = "";
  for (let k = 0; k < count; k += 1) {
    const phase = (k / count) * Math.PI * 2;
    for (const sign of [1, -1]) {
      let d = "";
      for (let x = x1; x <= x2 + 0.01; x += 1) {
        d += `${x === x1 ? "M" : "L"}${r(x)} ${r(y + sign * amplitude * Math.sin(((x - x1) / wavelength) * Math.PI * 2 + phase))}`;
      }
      out += `<path d="${d}"/>`;
    }
  }
  return `<g fill="none" stroke="${color}" stroke-width="0.14">${out}</g>`;
}

const lottery: TicketTemplate = {
  id: "lottery",
  categories: ["charity", "school", "church"],
  palettes: [
    { id: "green", bg: "#eef5e6", ink: "#183f24", muted: "#4d6b52", accent: "#2f7a45", extra: ["#8fbf8a", "#c8a24a"] },
    { id: "blue", bg: "#ebf1fa", ink: "#142f5a", muted: "#4a5f82", accent: "#2b5ea8", extra: ["#93b1de", "#c8a24a"] },
    { id: "sepia", bg: "#f6ebd5", ink: "#4a3018", muted: "#7a5c3e", accent: "#8a5a2b", extra: ["#cfae80", "#9c2f2f"] },
  ],
  build: (p) => {
    const w = 90;
    const h = 50;
    const [soft = p.accent] = p.extra;
    const corner = (x: number, y: number) =>
      `<circle cx="${x}" cy="${y}" r="2.2" fill="${p.bg}" stroke="${p.accent}" stroke-width="0.35"/>` + star(x, y, 1.4, p.accent);
    const art = canvas(
      w,
      h,
      p.bg,
      rosette(31, 25, 15.5, 3, 11, 12, soft, 0.55) +
        rosette(31, 25, 7, 1.6, 7, 8, soft, 0.45) +
        `<rect x="2" y="2" width="86" height="46" fill="none" stroke="${p.accent}" stroke-width="0.6"/>` +
        `<rect x="3.2" y="3.2" width="83.6" height="43.6" fill="none" stroke="${p.accent}" stroke-width="0.2"/>` +
        guilloche(4, 86, 44.4, 1.5, 5, 6, p.accent) +
        `<line x1="4" y1="41.6" x2="86" y2="41.6" stroke="${p.accent}" stroke-width="0.2"/>` +
        corner(2.6, 2.6) +
        corner(87.4, 2.6) +
        corner(2.6, 47.4) +
        corner(87.4, 47.4) +
        qrCard(62, 13.5, 22, 1.5, `stroke="${p.accent}" stroke-width="0.25"`),
    );
    return {
      background: art,
      design: design(w, h, p.bg, {
        number: number(56, 5.5, 32, 6, "mono", 11, p.ink, "center"),
        qr: [62, 13.5, 22],
        stub: { side: "left", widthMm: 25, fields: [...STUB.fields], image: null },
        texts: [
          block(c.lotteryLabel, 6.5, 5.8, 48, 4, { bold: true, sizePt: 6.5, color: p.accent, uppercase: true, letterSpacing: 0.3 }),
          block("{evento}", 6.5, 10.5, 50, 14, { font: "serif", sizePt: 17, color: p.ink, lines: 2 }),
          block(c.drawDate, 6.5, 26, 50, 4.5, { sizePt: 8.5, bold: true, color: p.ink }),
          block("{local}", 6.5, 30.8, 50, 4, { sizePt: 7.5, color: p.muted }),
          block("{preco}", 6.5, 35.2, 40, 5.6, { font: "slab", sizePt: 12, color: p.accent }),
        ],
      }),
    };
  },
};

const minimal: TicketTemplate = {
  id: "minimal",
  categories: ANY,
  palettes: [
    { id: "black", bg: "#ffffff", ink: "#111111", muted: "#6b6b6b", accent: "#111111", extra: [] },
    { id: "orange", bg: "#ffffff", ink: "#141414", muted: "#6b6b6b", accent: "#ff5a1f", extra: [] },
    { id: "blue", bg: "#ffffff", ink: "#0b1a33", muted: "#5f6b80", accent: "#2563eb", extra: [] },
  ],
  build: (p) => {
    const art = canvas(W, H, p.bg, `<rect x="8" y="34.6" width="16" height="0.7" fill="${p.accent}"/>` + qrCard(QR[0], QR[1], QR[2]));
    return {
      background: art,
      design: design(W, H, p.bg, {
        number: number(108, 7, 38, 6, "mono", 9, p.muted),
        qr: QR,
        stub: null,
        texts: [
          block("{evento}", 8, 5.5, 100, 27, { sizePt: 32, bold: true, color: p.ink, lines: 2, letterSpacing: -0.03 }),
          block("{data_extenso} · {hora}", 8, 38.5, 100, 4.5, { sizePt: 9, bold: true, color: p.ink }),
          block("{local}", 8, 43.5, 100, 4.5, { sizePt: 9, color: p.muted }),
          block("{preco}", 8, 48.3, 60, 4.2, { sizePt: 8.5, bold: true, color: p.accent }),
        ],
      }),
    };
  },
};

const gradient: TicketTemplate = {
  id: "gradient",
  categories: ANY,
  palettes: [
    { id: "aurora", bg: "#0b1030", ink: "#ffffff", muted: "#d9def7", accent: "#7df9d1", extra: ["#14b8a6", "#7c3aed", "#2563eb", "#db2777"] },
    { id: "peach", bg: "#ffe8da", ink: "#3a1222", muted: "#74404f", accent: "#c2255c", extra: ["#ff9a8b", "#ffc371", "#ff6f91", "#fbd3e9"] },
    { id: "ocean", bg: "#05284a", ink: "#ffffff", muted: "#cdeff8", accent: "#90e0ef", extra: ["#0096c7", "#023e8a", "#00b4d8", "#4361ee"] },
  ],
  build: (p) => {
    const [a = p.accent, b = p.accent, cc = p.accent, d = p.accent] = p.extra;
    // Soft blobs: radial gradients that fade slowly, overlapping like a mesh gradient.
    const blob = (id: string, color: string) =>
      `<radialGradient id="${id}"><stop offset="0" stop-color="${color}" stop-opacity="0.95"/><stop offset="0.45" stop-color="${color}" stop-opacity="0.55"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`;
    const art = canvas(
      W,
      H,
      p.bg,
      `<ellipse cx="0" cy="-4" rx="70" ry="42" fill="url(#blobA)"/>` +
        `<ellipse cx="150" cy="60" rx="80" ry="46" fill="url(#blobB)"/>` +
        `<ellipse cx="88" cy="8" rx="52" ry="34" fill="url(#blobC)"/>` +
        `<ellipse cx="34" cy="62" rx="58" ry="30" fill="url(#blobD)"/>` +
        `<ellipse cx="150" cy="-4" rx="40" ry="30" fill="url(#blobA)"/>` +
        qrCard(QR[0], QR[1], QR[2], 2.4),
      blob("blobA", a) + blob("blobB", b) + blob("blobC", cc) + blob("blobD", d),
    );
    return {
      background: art,
      design: design(W, H, p.bg, {
        number: number(108, 4, 38, 9, "sans", 13, p.ink),
        qr: QR,
        stub: null,
        texts: [
          block("{semana} · {hora}", 8, 6, 90, 4.5, { sizePt: 7.5, bold: true, color: p.ink, uppercase: true, letterSpacing: 0.3 }),
          block("{evento}", 8, 12, 98, 22, { sizePt: 27, bold: true, color: p.ink, lines: 2, letterSpacing: -0.02 }),
          block("{data_extenso}", 8, 36.5, 98, 5, { sizePt: 10, bold: true, color: p.ink }),
          block("{local}", 8, 42, 98, 4.5, { sizePt: 9, color: p.muted }),
          block("{preco}", 8, 47.5, 60, 4, { sizePt: 8.5, bold: true, color: p.ink }),
        ],
      }),
    };
  },
};

/** The outline of a ticket with the corners and the middle of the sides bitten off, inset by `i`. */
function bitten(width: number, height: number, corner: number, notch: number, i: number): string {
  const a = Math.sqrt((corner + i) ** 2 - i ** 2);
  const n = Math.sqrt((notch + i) ** 2 - i ** 2);
  const mid = height / 2;
  const cr = r(corner + i);
  const nr = r(notch + i);
  return (
    `M${r(a)} ${i}H${r(width - a)}A${cr} ${cr} 0 0 0 ${r(width - i)} ${r(a)}V${r(mid - n)}A${nr} ${nr} 0 0 0 ${r(width - i)} ${r(mid + n)}` +
    `V${r(height - a)}A${cr} ${cr} 0 0 0 ${r(width - a)} ${r(height - i)}H${r(a)}A${cr} ${cr} 0 0 0 ${i} ${r(height - a)}` +
    `V${r(mid + n)}A${nr} ${nr} 0 0 0 ${i} ${r(mid - n)}V${r(a)}A${cr} ${cr} 0 0 0 ${r(a)} ${i}Z`
  );
}

const admitOne: TicketTemplate = {
  id: "admitOne",
  categories: ANY,
  palettes: [
    { id: "red", bg: "#f7ead0", ink: "#8f1d1d", muted: "#6e5038", accent: "#c0392b", extra: ["#8f1d1d", "#e0a43a"] },
    { id: "teal", bg: "#e9f4ef", ink: "#0f4c4c", muted: "#4a6b64", accent: "#e0662e", extra: ["#0f4c4c", "#e9b949"] },
    { id: "yellow", bg: "#ffd447", ink: "#1f1f1f", muted: "#4d3d0a", accent: "#c1121f", extra: ["#1f1f1f", "#c1121f"] },
  ],
  build: (p) => {
    const [outer = p.ink, gold = p.accent] = p.extra;
    const shape = (i: number) => bitten(W, H, 5, 4, i);
    let sunburst = "";
    for (let i = 0; i < 24; i += 1) {
      const angle = (i / 24) * Math.PI * 2;
      const spread = Math.PI / 48;
      sunburst += `<polygon points="58,22 ${r(58 + Math.cos(angle - spread) * 90)},${r(22 + Math.sin(angle - spread) * 90)} ${r(58 + Math.cos(angle + spread) * 90)},${r(22 + Math.sin(angle + spread) * 90)}"/>`;
    }
    const art = canvas(
      W,
      H,
      outer,
      `<path d="${shape(0)}" fill="${p.bg}"/>` +
        `<g clip-path="url(#inside)" fill="${gold}" opacity="0.13">${sunburst}</g>` +
        `<path d="${shape(2.6)}" fill="none" stroke="${p.ink}" stroke-width="0.7"/>` +
        `<path d="${shape(3.7)}" fill="none" stroke="${p.ink}" stroke-width="0.25"/>` +
        star(31, 8.6, 1.5, p.accent) +
        star(85, 8.6, 1.5, p.accent) +
        `<line x1="22" y1="35" x2="52" y2="35" stroke="${p.ink}" stroke-width="0.3"/>` +
        `<line x1="64" y1="35" x2="94" y2="35" stroke="${p.ink}" stroke-width="0.3"/>` +
        star(58, 35, 2, p.accent) +
        star(17.5, 35, 1, p.ink) +
        star(98.5, 35, 1, p.ink) +
        qrCard(111, 18.5, 26, 2, `stroke="${p.ink}" stroke-width="0.35"`),
      `<clipPath id="inside"><path d="${shape(3.7)}"/></clipPath>`,
    );
    return {
      background: art,
      design: design(W, H, p.bg, {
        number: number(104, 7.5, 40, 8, "slab", 13, p.ink, "center"),
        qr: [111, 18.5, 26],
        stub: null,
        texts: [
          block(c.admitOneLabel, 34, 6.6, 48, 4.2, { bold: true, sizePt: 7.5, color: p.accent, uppercase: true, letterSpacing: 0.3, align: "center" }),
          block("{evento}", 12, 11.5, 92, 22, { font: "condensed", sizePt: 30, color: p.ink, uppercase: true, align: "center", lines: 2 }),
          block("{data_extenso} · {hora}", 12, 37.5, 92, 4.6, { font: "slab", sizePt: 9, color: p.ink, align: "center" }),
          block("{local}", 12, 42.5, 92, 4.2, { sizePt: 8.5, color: p.muted, align: "center" }),
          block("{preco}", 12, 46.9, 92, 4, { sizePt: 8.5, bold: true, color: p.accent, align: "center" }),
        ],
      }),
    };
  },
};

export const EVERYDAY_TEMPLATES: readonly TicketTemplate[] = [
  stainedGlass,
  badge,
  tech,
  dinner,
  churrasco,
  wine,
  oktoberfest,
  bingo,
  raffleGift,
  lottery,
  minimal,
  gradient,
  admitOne,
];
