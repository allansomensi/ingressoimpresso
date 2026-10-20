/** Templates of the community set, listed in catalog.ts. */

import { templates as templatesTexts } from "@/texts/pt-BR/templates";

import { block, design, H, number, QR, STUB, W, type TicketTemplate } from "./kit";
import { branch, canvas, glow, linear, qrCard, r, random, star } from "./svg";

const c = templatesTexts.content;

/** `x,y x,y…` for a polygon. */
const points = (list: readonly (readonly [number, number])[]) => list.map(([x, y]) => `${r(x)},${r(y)}`).join(" ");

/**
 * Pixel art from rows of characters: each character with a colour in `colors` is a square of
 * `size` mm (any other character is left empty).
 */
function pixels(rows: readonly string[], x: number, y: number, size: number, colors: Record<string, string>): string {
  let out = "";
  rows.forEach((row, j) => {
    [...row].forEach((char, i) => {
      const color = colors[char];
      if (color !== undefined) {
        // A hair wider than the pixel, so neighbours never show a seam.
        out += `<rect x="${r(x + i * size)}" y="${r(y + j * size)}" width="${r(size + 0.04)}" height="${r(size + 0.04)}" fill="${color}"/>`;
      }
    });
  });
  return out;
}

const exhibition: TicketTemplate = {
  id: "exhibition",
  categories: ["culture", "school", "formal"],
  palettes: [
    { id: "bauhaus", bg: "#f6f2ea", ink: "#141414", muted: "#5c5852", accent: "#e1341e", extra: ["#1f4e9e", "#f2b81d"] },
    { id: "monochrome", bg: "#ffffff", ink: "#111111", muted: "#5f5f5f", accent: "#111111", extra: ["#b5b5b5", "#e2e2e2"] },
    { id: "pastel", bg: "#fbf7f1", ink: "#2e2a33", muted: "#6d6873", accent: "#e98472", extra: ["#8fbcdc", "#f3d27a"] },
  ],
  build: (p) => {
    const [blue = p.accent, yellow = p.accent] = p.extra;
    // A Bauhaus composition between the texts and the QR: circle, bar, half circle and rules.
    const art = canvas(
      W,
      H,
      p.bg,
      `<rect x="99" y="21" width="11" height="37" fill="${yellow}"/>` +
        `<circle cx="91" cy="16" r="15" fill="${blue}"/>` +
        `<path d="M77 58 L77 55 A14 14 0 0 1 105 55 L105 58Z" fill="${p.accent}"/>` +
        `<rect x="74" y="33" width="38" height="0.8" fill="${p.ink}"/>` +
        `<circle cx="108.5" cy="9" r="2.2" fill="${p.ink}"/>` +
        `<rect x="8" y="5" width="14" height="1.4" fill="${p.ink}"/>` +
        qrCard(QR[0], QR[1], QR[2], 2, `stroke="${p.ink}" stroke-width="0.3"`),
    );
    return {
      background: art,
      design: design(W, H, p.bg, {
        number: number(112, 4, 34, 9, "sans", 12, p.ink),
        qr: QR,
        stub: null,
        texts: [
          block(c.exhibitionLabel, 8, 8.5, 60, 4.5, { bold: true, sizePt: 7.5, color: p.ink, uppercase: true, letterSpacing: 0.35 }),
          block("{evento}", 8, 14, 66, 19, { sizePt: 21, bold: true, color: p.ink, lines: 2, letterSpacing: -0.02 }),
          block("{data_extenso}", 8, 35.5, 66, 5, { sizePt: 9.5, bold: true, color: p.accent }),
          block(c.startsAt, 8, 41, 66, 4.5, { sizePt: 9, color: p.ink }),
          block("{local}", 8, 46, 66, 4.5, { sizePt: 9, color: p.muted }),
          block("{preco}", 112, 50, 34, 4, { sizePt: 8.5, bold: true, color: p.ink, align: "right" }),
        ],
      }),
    };
  },
};

const standup: TicketTemplate = {
  id: "standup",
  categories: ["culture", "party"],
  palettes: [
    { id: "brick", bg: "#22100b", ink: "#ffffff", muted: "#ecd6ca", accent: "#ffc93c", extra: ["#8a3324", "#742a1d", "#fff1c9", "#140806"] },
    { id: "midnight", bg: "#0b1020", ink: "#ffffff", muted: "#cdd6ee", accent: "#ff5a5f", extra: ["#28375f", "#1f2c4e", "#dfe8ff", "#05070f"] },
    { id: "yellow", bg: "#b8831a", ink: "#1f1302", muted: "#3b2706", accent: "#a61e1e", extra: ["#f0b93a", "#e3a92c", "#fff8dc", "#1f1302"] },
  ],
  build: (p) => {
    const [b1 = p.bg, b2 = p.bg, light = "#ffffff", mic = p.bg] = p.extra;
    const next = random(13);
    // Bricks in running bond, each a little different.
    let wall = "";
    const bw = 11;
    const bh = 4.4;
    for (let row = 0; row * bh < 62; row += 1) {
      const y = -3 + row * bh;
      for (let x = -3 - (row % 2 === 0 ? 0 : bw / 2); x < 153; x += bw) {
        wall += `<rect x="${r(x + 0.3)}" y="${r(y + 0.3)}" width="${r(bw - 0.6)}" height="${r(bh - 0.6)}" rx="0.3" fill="${next() < 0.5 ? b1 : b2}" opacity="${r(0.82 + next() * 0.18)}"/>`;
      }
    }
    const mx = 101;
    let grille = "";
    for (let y = 15.6; y < 28; y += 1.15) {
      grille += `<line x1="${mx - 4}" y1="${r(y)}" x2="${mx + 4}" y2="${r(y)}" stroke="${light}" stroke-width="0.3" opacity="0.45"/>`;
    }
    const microphone =
      `<ellipse cx="${mx}" cy="51.5" rx="6.5" ry="1.4" fill="${mic}"/>` +
      `<rect x="${mx - 0.55}" y="30" width="1.1" height="21.5" fill="${mic}"/>` +
      `<path d="M${mx - 2.4} 28.5 L${mx + 2.4} 28.5 L${mx + 1.2} 32 L${mx - 1.2} 32Z" fill="${mic}"/>` +
      `<rect x="${mx - 4.6}" y="13" width="9.2" height="16.5" rx="4.6" fill="${mic}"/>` +
      grille +
      `<line x1="${mx}" y1="14" x2="${mx}" y2="28.5" stroke="${light}" stroke-width="0.35" opacity="0.35"/>`;
    const art = canvas(
      W,
      H,
      p.bg,
      wall +
        `<rect x="-3" y="-3" width="156" height="61" fill="url(#shade)"/>` +
        `<polygon points="${mx - 3},-3 ${mx + 3},-3 ${mx + 14},58 ${mx - 14},58" fill="${light}" opacity="0.1"/>` +
        `<ellipse cx="${mx}" cy="27" rx="20" ry="27" fill="url(#pool)"/>` +
        microphone +
        qrCard(QR[0], QR[1], QR[2]),
      linear("shade", [[0, p.bg, 0.82], [0.55, p.bg, 0.6], [1, p.bg, 0.45]]) + glow("pool", light, 0.55),
    );
    return {
      background: art,
      design: design(W, H, p.bg, {
        number: number(108, 4, 38, 10, "condensed", 17, p.ink),
        qr: QR,
        stub: STUB,
        texts: [
          block(c.standupLabel, 8, 6, 70, 4.5, { bold: true, sizePt: 7.5, color: p.accent, uppercase: true, letterSpacing: 0.3 }),
          block("{evento}", 8, 11.5, 85, 22, { font: "condensed", sizePt: 32, color: p.ink, uppercase: true, lines: 2 }),
          block("{data_extenso} · {hora}", 8, 35.5, 78, 6, { font: "display", sizePt: 15, color: p.accent }),
          block("{local}", 8, 42.5, 76, 4.5, { sizePt: 9, color: p.muted }),
          block("{preco}", 8, 47.5, 60, 4.5, { sizePt: 9, bold: true, color: p.ink }),
        ],
      }),
    };
  },
};

/** A treble clef stroked over a staff whose top line is at `top`, lines `s` mm apart. */
function trebleClef(x: number, top: number, s: number, color: string): string {
  const pt = (u: number, v: number) => `${r(x + u * s)} ${r(top + v * s)}`;
  const d =
    `M${pt(1.25, 5.25)}C${pt(1.3, 6.1)} ${pt(0.2, 6.1)} ${pt(0.35, 5.35)}` +
    `L${pt(1.0, -0.6)}C${pt(1.05, -1.75)} ${pt(1.95, -1.9)} ${pt(1.85, -0.85)}` +
    `C${pt(1.75, 0.25)} ${pt(-0.05, 1.3)} ${pt(0.05, 2.95)}` +
    `C${pt(0.15, 4.35)} ${pt(2.45, 4.3)} ${pt(2.35, 3.0)}` +
    `C${pt(2.25, 1.95)} ${pt(0.85, 2.05)} ${pt(1.0, 3.05)}`;
  return (
    `<path d="${d}" fill="none" stroke="${color}" stroke-width="${r(s * 0.17)}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<circle cx="${r(x + 0.55 * s)}" cy="${r(top + 5.35 * s)}" r="${r(s * 0.32)}" fill="${color}"/>`
  );
}

const recital: TicketTemplate = {
  id: "recital",
  categories: ["culture", "music", "school", "church"],
  palettes: [
    { id: "cream", bg: "#f8f2e4", ink: "#1c1a17", muted: "#6a5f4c", accent: "#9a2a1f", extra: ["#b08d4f"] },
    { id: "navy", bg: "#101d3a", ink: "#f7efdc", muted: "#b9c2d6", accent: "#d9b45a", extra: ["#d9b45a"] },
    { id: "wine", bg: "#3b0d18", ink: "#f8eee4", muted: "#dbbab3", accent: "#e3be6c", extra: ["#e3be6c"] },
  ],
  build: (p) => {
    const [gold = p.accent] = p.extra;
    const s = 1.5;
    // The staff waves gently along the bottom; `top(x)` is its top line.
    const top = (x: number) => 44.4 + Math.sin((x + 10) / 24) * 1;
    let staff = "";
    for (let line = 0; line < 5; line += 1) {
      let d = "";
      for (let x = -3; x <= 153; x += 3) {
        d += `${d === "" ? "M" : "L"}${x} ${r(top(x) + line * s)}`;
      }
      staff += `<path d="${d}" fill="none" stroke="${p.muted}" stroke-width="0.18" opacity="0.8"/>`;
    }
    // Notes: `pos` counts half spaces up from the bottom line (0) to the top line (8).
    const headY = (x: number, pos: number) => top(x) + ((8 - pos) * s) / 2;
    const head = (x: number, pos: number, hollow = false) =>
      `<ellipse cx="${r(x)}" cy="${r(headY(x, pos))}" rx="0.95" ry="0.66" fill="${hollow ? "none" : p.ink}" stroke="${p.ink}" stroke-width="${hollow ? 0.28 : 0}" transform="rotate(-22 ${r(x)} ${r(headY(x, pos))})"/>`;
    const stem = (x: number, pos: number, to: number) =>
      `<line x1="${r(x + 0.88)}" y1="${r(headY(x, pos) - 0.2)}" x2="${r(x + 0.88)}" y2="${r(to)}" stroke="${p.ink}" stroke-width="0.2"/>`;
    const quarter = (x: number, pos: number, hollow = false) => head(x, pos, hollow) + stem(x, pos, headY(x, pos) - 5);
    const eighth = (x: number, pos: number) =>
      quarter(x, pos) +
      `<path d="M${r(x + 0.88)} ${r(headY(x, pos) - 5)} q0.4 1.6 1.9 2.3 q0.5 0.6 0.1 1.9 q-0.1 -1.2 -2 -1.8Z" fill="${p.ink}"/>`;
    const beamed = (x1: number, p1: number, x2: number, p2: number) => {
      const y1 = Math.min(headY(x1, p1), headY(x2, p2)) - 5;
      const y2 = y1 - (headY(x1, p1) - headY(x2, p2)) * 0.25;
      return (
        head(x1, p1) +
        head(x2, p2) +
        stem(x1, p1, y1) +
        stem(x2, p2, y2) +
        `<polygon points="${points([[x1 + 0.78, y1], [x2 + 0.98, y2], [x2 + 0.98, y2 + 0.75], [x1 + 0.78, y1 + 0.75]])}" fill="${p.ink}"/>`
      );
    };
    const bar = (x: number) => `<line x1="${x}" y1="${r(top(x))}" x2="${x}" y2="${r(top(x) + 4 * s)}" stroke="${p.muted}" stroke-width="0.22"/>`;
    const notes =
      trebleClef(3, top(4.5), s, gold) +
      quarter(64, 3) +
      beamed(69, 4, 73, 6) +
      eighth(78, 5) +
      bar(83) +
      quarter(87, 7, true) +
      beamed(93, 5, 97, 3) +
      quarter(102, 4) +
      bar(107) +
      beamed(112, 2, 116, 4) +
      quarter(121, 6) +
      `<line x1="148.6" y1="${r(top(148.6))}" x2="148.6" y2="${r(top(148.6) + 4 * s)}" stroke="${p.muted}" stroke-width="0.22"/>` +
      `<line x1="149.6" y1="${r(top(149.6))}" x2="149.6" y2="${r(top(149.6) + 4 * s)}" stroke="${p.muted}" stroke-width="0.6"/>`;
    const art = canvas(
      W,
      H,
      p.bg,
      `<ellipse cx="60" cy="0" rx="80" ry="30" fill="url(#hall)"/>` +
        staff +
        notes +
        `<line x1="8" y1="31" x2="30" y2="31" stroke="${gold}" stroke-width="0.35"/>` +
        qrCard(117, 6, 28, 2, `stroke="${gold}" stroke-width="0.3"`),
      glow("hall", gold, 0.16),
    );
    return {
      background: art,
      design: design(W, H, p.bg, {
        number: number(108, 37.5, 38, 5.5, "serif", 10.5, p.accent),
        qr: [117, 6, 28],
        stub: STUB,
        texts: [
          block("{data_extenso}", 8, 5.5, 96, 4.5, { bold: true, sizePt: 7.5, color: p.accent, uppercase: true, letterSpacing: 0.25 }),
          block("{evento}", 8, 10.5, 100, 19.5, { font: "serif", sizePt: 26, color: p.ink, lines: 2 }),
          block(c.startsAt, 8, 32.5, 60, 4.5, { sizePt: 9.5, bold: true, color: p.ink }),
          block("{local}", 8, 37.5, 60, 4.5, { sizePt: 9, color: p.muted }),
          block("{preco}", 70, 32.5, 34, 4.5, { sizePt: 9.5, bold: true, color: p.accent, align: "right" }),
        ],
      }),
    };
  },
};

const sarau: TicketTemplate = {
  id: "sarau",
  categories: ["culture", "school"],
  palettes: [
    { id: "paper", bg: "#efe3c6", ink: "#2a2018", muted: "#665441", accent: "#8f2d1e", extra: ["#b8996a", "#5b4632"] },
    { id: "ink", bg: "#f4efe3", ink: "#1b2f5c", muted: "#4b5a7a", accent: "#1b2f5c", extra: ["#b7aa8a", "#1b2f5c"] },
    { id: "sepia", bg: "#2b2119", ink: "#f0e4c8", muted: "#c6b392", accent: "#e0ac5f", extra: ["#0d0906", "#c6b392"] },
  ],
  build: (p) => {
    const [age = p.muted, line = p.muted] = p.extra;
    const next = random(19);
    let fibres = "";
    for (let i = 0; i < 70; i += 1) {
      fibres += `<circle cx="${r(-3 + next() * 156)}" cy="${r(-3 + next() * 61)}" r="${r(0.1 + next() * 0.25)}" fill="${age}" opacity="${r(0.2 + next() * 0.35)}"/>`;
    }
    // The typewriter's paper guide along the top edge.
    let ruler = `<line x1="-3" y1="1.6" x2="153" y2="1.6" stroke="${line}" stroke-width="0.15" opacity="0.6"/>`;
    for (let i = 0; i * 2.5 < 153; i += 1) {
      const x = 2 + i * 2.5;
      ruler += `<line x1="${r(x)}" y1="-3" x2="${r(x)}" y2="${i % 5 === 0 ? 1.6 : 0.6}" stroke="${line}" stroke-width="${i % 5 === 0 ? 0.2 : 0.12}" opacity="0.6"/>`;
    }
    // A quill: the shaft from the nib up to the top, the vane along it, and its barbs.
    const nib: [number, number] = [93.5, 45];
    const tip: [number, number] = [109, 5];
    const along = (t: number, side: number) => {
      const dx = tip[0] - nib[0];
      const dy = tip[1] - nib[1];
      const len = Math.hypot(dx, dy);
      // The vane is widest two thirds of the way up.
      const width = t < 0.22 ? 0 : Math.sin(((t - 0.22) / 0.78) * Math.PI) ** 0.7 * 5;
      return [nib[0] + dx * t + (-dy / len) * width * side, nib[1] + dy * t + (dx / len) * width * side] as const;
    };
    let vane = "";
    const left: string[] = [];
    const right: string[] = [];
    for (let i = 0; i <= 24; i += 1) {
      const t = 0.22 + (i / 24) * 0.78;
      const [lx, ly] = along(t, -1);
      const [rx, ry] = along(t, 1);
      left.push(`${r(lx)},${r(ly)}`);
      right.unshift(`${r(rx)},${r(ry)}`);
      if (i > 0 && i < 24 && i % 2 === 0) {
        const [sx, sy] = along(t - 0.05, 0);
        vane += `<line x1="${r(sx)}" y1="${r(sy)}" x2="${r(lx)}" y2="${r(ly)}" stroke="${line}" stroke-width="0.15" opacity="0.7"/>`;
        vane += `<line x1="${r(sx)}" y1="${r(sy)}" x2="${r(rx)}" y2="${r(ry)}" stroke="${line}" stroke-width="0.15" opacity="0.7"/>`;
      }
    }
    const quill =
      `<polygon points="${left.join(" ")} ${right.join(" ")}" fill="${p.bg}" stroke="${line}" stroke-width="0.3" stroke-linejoin="round"/>` +
      vane +
      `<line x1="${nib[0]}" y1="${nib[1]}" x2="${tip[0]}" y2="${tip[1]}" stroke="${line}" stroke-width="0.35" stroke-linecap="round"/>` +
      `<path d="M${nib[0]} ${nib[1]} l-0.9 2.6 l1.5 -1.9Z" fill="${line}"/>`;
    const inkwell =
      `<path d="M86.5 55.5 L86.5 50.5 Q86.5 48.5 89 48.2 L91.2 48.2 L91.2 46.6 L97.8 46.6 L97.8 48.2 L100 48.2 Q102.5 48.5 102.5 50.5 L102.5 55.5Z" fill="${line}"/>` +
      `<rect x="90.6" y="45.6" width="7.8" height="1.4" rx="0.5" fill="${line}"/>`;
    const art = canvas(
      W,
      H,
      p.bg,
      `<rect x="-3" y="-3" width="156" height="61" fill="url(#aged)"/>` +
        fibres +
        `<circle cx="74" cy="14" r="7.5" fill="none" stroke="${age}" stroke-width="0.7" opacity="0.28"/>` +
        ruler +
        quill +
        inkwell +
        `<line x1="8" y1="33" x2="74" y2="33" stroke="${p.muted}" stroke-width="0.25" stroke-dasharray="1.6 0.7"/>` +
        qrCard(QR[0], QR[1], QR[2], 2, `stroke="${line}" stroke-width="0.25"`),
      `<radialGradient id="aged" cx="0.45" cy="0.5" r="0.75"><stop offset="0.55" stop-color="${age}" stop-opacity="0"/><stop offset="1" stop-color="${age}" stop-opacity="0.7"/></radialGradient>`,
    );
    return {
      background: art,
      design: design(W, H, p.bg, {
        number: number(108, 4, 38, 9, "mono", 11, p.muted),
        qr: QR,
        stub: null,
        texts: [
          block(c.sarauLabel, 8, 6, 66, 4.5, { font: "mono", sizePt: 7.5, color: p.accent, uppercase: true, letterSpacing: 0.15 }),
          block("{evento}", 8, 11.5, 80, 20, { font: "mono", sizePt: 19, color: p.ink, lines: 2, letterSpacing: -0.03 }),
          block("{data_extenso} · {hora}", 8, 35, 78, 4.5, { font: "mono", sizePt: 8.5, color: p.ink }),
          block("{local}", 8, 40.5, 78, 4.5, { font: "mono", sizePt: 8.5, color: p.muted }),
          block("{preco}", 8, 46, 60, 5, { font: "mono", sizePt: 10, color: p.accent }),
        ],
      }),
    };
  },
};

const scienceFair: TicketTemplate = {
  id: "scienceFair",
  categories: ["school", "kids"],
  palettes: [
    { id: "notebook", bg: "#f7fbff", ink: "#183a6d", muted: "#46628a", accent: "#e8553e", extra: ["#9fc2ea", "#ef8a7a", "#2d63b0"] },
    { id: "chalkboard", bg: "#26473c", ink: "#f6f3ea", muted: "#c9d8d0", accent: "#ffd166", extra: ["#5f8476", "#ff9fb0", "#eef5f0"] },
    { id: "yellow", bg: "#fff6cc", ink: "#3a2c00", muted: "#6b5a1c", accent: "#d9480f", extra: ["#e7cf72", "#e98a5a", "#7a5600"] },
  ],
  build: (p) => {
    const [grid = p.muted, margin = p.accent, doodle = p.ink] = p.extra;
    const pen = `fill="none" stroke="${doodle}" stroke-width="0.45" stroke-linecap="round" stroke-linejoin="round"`;
    const patterns =
      `<pattern id="minor" width="2.5" height="2.5" patternUnits="userSpaceOnUse"><path d="M2.5 0V2.5H0" fill="none" stroke="${grid}" stroke-width="0.1"/></pattern>` +
      `<pattern id="major" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0V10H0" fill="none" stroke="${grid}" stroke-width="0.22"/></pattern>`;
    // An atom: three orbits, a nucleus and electrons.
    const ax = 99;
    const ay = 11;
    let atom = `<circle cx="${ax}" cy="${ay}" r="1.3" fill="${doodle}"/>`;
    for (const angle of [0, 60, 120]) {
      atom += `<ellipse cx="${ax}" cy="${ay}" rx="7.5" ry="2.6" ${pen} transform="rotate(${angle} ${ax} ${ay})"/>`;
    }
    atom += `<circle cx="${ax + 7.5}" cy="${ay}" r="0.7" fill="${p.accent}"/><circle cx="${r(ax - 3.75)}" cy="${r(ay - 6.5)}" r="0.7" fill="${p.accent}"/>`;
    // An Erlenmeyer flask with a little liquid and bubbles.
    const flask =
      `<path d="M92.6 49.5 L106.2 49.5 L108.2 52.6 Q108.8 53.8 107.4 53.8 L91.4 53.8 Q90 53.8 90.6 52.6Z" fill="${p.accent}" opacity="0.4"/>` +
      `<path d="M96.2 39 L96.2 44 L90.6 52.6 Q90 53.8 91.4 53.8" ${pen}/>` +
      `<path d="M102.6 39 L102.6 44 L108.2 52.6 Q108.8 53.8 107.4 53.8 L91.4 53.8" ${pen}/>` +
      `<line x1="95.2" y1="39" x2="103.6" y2="39" ${pen}/>` +
      `<circle cx="98" cy="35.6" r="0.8" ${pen}/><circle cx="100.6" cy="33" r="0.55" ${pen}/><circle cx="98.8" cy="30.8" r="0.4" ${pen}/>`;
    // A light bulb with rays.
    const bx = 90;
    const by = 27;
    const bulb =
      `<path d="M${bx - 1.6} ${by + 4.2} C${bx - 1.6} ${by + 2.4} ${bx - 4} ${by + 1.6} ${bx - 4} ${by - 1} A4 4 0 0 1 ${bx + 4} ${by - 1} C${bx + 4} ${by + 1.6} ${bx + 1.6} ${by + 2.4} ${bx + 1.6} ${by + 4.2}Z" ${pen}/>` +
      `<path d="M${bx - 1.6} ${by + 5.3} L${bx + 1.6} ${by + 5.3} M${bx - 1.2} ${by + 6.4} L${bx + 1.2} ${by + 6.4}" ${pen}/>` +
      `<path d="M${bx - 1.2} ${by + 3.6} L${bx - 1.2} ${by + 0.4} M${bx + 1.2} ${by + 3.6} L${bx + 1.2} ${by + 0.4} M${bx - 1.2} ${by + 0.4} q0.4 -1 0.8 0 q0.4 1 0.8 0 q0.4 -1 0.8 0" ${pen}/>` +
      `<path d="M${bx} ${by - 6.4} V${by - 8} M${bx - 5.2} ${by - 4.2} L${bx - 6.4} ${by - 5.4} M${bx + 5.2} ${by - 4.2} L${bx + 6.4} ${by - 5.4} M${bx - 5.8} ${by} H${bx - 7.4} M${bx + 5.8} ${by} H${bx + 7.4}" ${pen}/>`;
    // A ringed planet.
    const planet =
      `<circle cx="106" cy="25.5" r="3.4" ${pen}/>` +
      `<path d="M101.8 27.4 C98.6 29.6 100.2 30.6 106 28.6 C111.6 26.6 113.6 24.2 110.4 23.6" ${pen}/>`;
    const art = canvas(
      W,
      H,
      p.bg,
      `<rect x="-3" y="-3" width="156" height="61" fill="url(#minor)"/>` +
        `<rect x="-3" y="-3" width="156" height="61" fill="url(#major)"/>` +
        `<line x1="4.2" y1="-3" x2="4.2" y2="58" stroke="${margin}" stroke-width="0.3"/>` +
        `<line x1="5" y1="-3" x2="5" y2="58" stroke="${margin}" stroke-width="0.3"/>` +
        atom +
        bulb +
        planet +
        flask +
        `<path d="M8.5 33 q10 -1.6 20 0 t20 0" fill="none" stroke="${p.accent}" stroke-width="0.45" stroke-linecap="round"/>` +
        qrCard(QR[0], QR[1], QR[2], 2, `stroke="${grid}" stroke-width="0.3"`),
      patterns,
    );
    return {
      background: art,
      design: design(W, H, p.bg, {
        number: number(108, 4, 38, 9, "mono", 12, p.ink),
        qr: QR,
        stub: STUB,
        texts: [
          block(c.scienceLabel, 9, 5, 70, 4.5, { font: "mono", sizePt: 8, color: p.accent, uppercase: true, letterSpacing: 0.05 }),
          block("{evento}", 9, 10, 74, 21, { font: "casual", sizePt: 21, color: p.ink, lines: 2 }),
          block("{data_extenso}", 9, 35, 74, 5, { sizePt: 9.5, bold: true, color: p.ink }),
          block(c.fromTime, 9, 40.5, 74, 4.5, { font: "mono", sizePt: 8.5, color: p.muted }),
          block("{local}", 9, 45.5, 74, 4.5, { sizePt: 9, color: p.muted }),
          block("{preco}", 112, 50.2, 34, 4, { font: "mono", sizePt: 9, color: p.accent, align: "right" }),
        ],
      }),
    };
  },
};

const circus: TicketTemplate = {
  id: "circus",
  categories: ["kids", "culture", "party"],
  palettes: [
    { id: "classic", bg: "#fff4e0", ink: "#b3121b", muted: "#6b3a1f", accent: "#1d3c8f", extra: ["#d62828", "#fffaf0", "#f2b705"] },
    { id: "blueYellow", bg: "#fff8e1", ink: "#1d3f8f", muted: "#4a5578", accent: "#d62828", extra: ["#1f4fa8", "#ffd23f", "#f29e02"] },
    { id: "purple", bg: "#f8f0ff", ink: "#5b1f86", muted: "#6f5a85", accent: "#d63b75", extra: ["#6a2c91", "#fdf7ff", "#f2b705"] },
  ],
  build: (p) => {
    const [stripe = p.ink, stripe2 = p.bg, gold = p.accent] = p.extra;
    // Sunburst behind everything, from below the texts.
    let rays = "";
    for (let i = 0; i < 24; i += 2) {
      const a1 = Math.PI + (i / 24) * Math.PI;
      const a2 = Math.PI + ((i + 1) / 24) * Math.PI;
      rays += `<polygon points="${points([[55, 70], [55 + Math.cos(a1) * 160, 70 + Math.sin(a1) * 160], [55 + Math.cos(a2) * 160, 70 + Math.sin(a2) * 160]])}" fill="${stripe}" opacity="0.06"/>`;
    }
    // The big top's valance: stripes ending in scallops, a gold trim and tassels.
    let valance = "";
    for (let i = 0; i * 6 - 3 < 153; i += 1) {
      const x = -3 + i * 6;
      valance += `<path d="M${x} -3 L${x + 6} -3 L${x + 6} 3.5 A3 3 0 0 1 ${x} 3.5Z" fill="${i % 2 === 0 ? stripe : stripe2}" stroke="${gold}" stroke-width="0.25"/>`;
      valance += `<circle cx="${x}" cy="3.7" r="0.75" fill="${gold}"/>`;
    }
    const art = canvas(
      W,
      H,
      p.bg,
      rays +
        `<rect x="-3" y="-3" width="156" height="6.5" fill="${stripe2}"/>` +
        valance +
        star(92, 20, 3.2, gold) +
        star(104, 31, 2, stripe, 0.85) +
        star(90, 42, 1.6, stripe, 0.7) +
        star(106, 13, 1.3, gold) +
        star(100, 48, 2.4, gold) +
        `<line x1="-3" y1="53.2" x2="153" y2="53.2" stroke="${gold}" stroke-width="0.4"/>` +
        `<rect x="-3" y="54" width="156" height="4" fill="${stripe}"/>` +
        qrCard(117, 19.5, 27, 2, `stroke="${gold}" stroke-width="0.4"`),
    );
    return {
      background: art,
      design: design(W, H, p.bg, {
        number: number(108, 9, 38, 8, "slab", 13, p.ink),
        qr: [117, 19.5, 27],
        stub: STUB,
        texts: [
          block(c.circusLabel, 8, 9.5, 76, 6.5, { font: "casual", sizePt: 12, color: p.accent }),
          block("{evento}", 8, 16.5, 84, 18, { font: "slab", sizePt: 24, color: p.ink, lines: 2 }),
          block("{data_extenso} · {hora}", 8, 36.5, 84, 5, { sizePt: 9.5, bold: true, color: p.muted }),
          block("{local}", 8, 42, 80, 4.5, { sizePt: 9, color: p.muted }),
          block("{preco}", 8, 47, 60, 5, { font: "slab", sizePt: 10, color: p.ink }),
        ],
      }),
    };
  },
};

/** A jagged explosion of `spikes` points around (x, y). */
function explosion(seed: number, x: number, y: number, outer: number, inner: number, spikes: number): string {
  const next = random(seed);
  const list: [number, number][] = [];
  for (let i = 0; i < spikes * 2; i += 1) {
    const angle = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
    const radius = i % 2 === 0 ? outer * (0.82 + next() * 0.18) : inner * (0.9 + next() * 0.15);
    list.push([x + Math.cos(angle) * radius, y + Math.sin(angle) * radius * 0.82]);
  }
  return points(list);
}

const comic: TicketTemplate = {
  id: "comic",
  categories: ["party", "kids", "birthday"],
  palettes: [
    { id: "blue", bg: "#1e63d6", ink: "#ffffff", muted: "#e1ecff", accent: "#ffe14d", extra: ["#5b94f0", "#e8262b", "#ffe14d", "#ffe14d"] },
    { id: "red", bg: "#e02a2a", ink: "#ffffff", muted: "#ffe3e3", accent: "#ffe14d", extra: ["#ff6a6a", "#1e63d6", "#ffe14d", "#ffe14d"] },
    { id: "yellow", bg: "#ffd60a", ink: "#111111", muted: "#2b2b2b", accent: "#d61f1f", extra: ["#f29f00", "#e02a2a", "#ffffff", "#ffffff"] },
  ],
  build: (p) => {
    const [dots = p.muted, boom = p.accent, cloud = "#ffffff", caption = "#ffe14d"] = p.extra;
    const black = "#111111";
    const bx = 100;
    const by = 29;
    // Action lines out of the explosion.
    let lines = "";
    for (let i = 0; i < 22; i += 1) {
      const angle = (i / 22) * Math.PI * 2;
      lines += `<line x1="${r(bx + Math.cos(angle) * 16)}" y1="${r(by + Math.sin(angle) * 13)}" x2="${r(bx + Math.cos(angle) * 40)}" y2="${r(by + Math.sin(angle) * 34)}" stroke="${black}" stroke-width="0.3" opacity="0.22"/>`;
    }
    const defs =
      `<pattern id="dots" width="2.2" height="2.2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><circle cx="1.1" cy="1.1" r="0.62" fill="${dots}"/></pattern>` +
      linear("fade", [[0, "#ffffff", 1], [0.6, "#ffffff", 0.25], [1, "#ffffff", 0]], 20) +
      `<mask id="halftone"><rect x="-3" y="-3" width="156" height="61" fill="url(#fade)"/></mask>`;
    const art = canvas(
      W,
      H,
      p.bg,
      `<rect x="-3" y="-3" width="156" height="61" fill="url(#dots)" mask="url(#halftone)"/>` +
        lines +
        // The title panel, with a hard shadow.
        `<rect x="6.2" y="13.2" width="78" height="24" fill="${black}"/>` +
        `<rect x="5" y="12" width="78" height="24" fill="#ffffff" stroke="${black}" stroke-width="0.9"/>` +
        `<rect x="5" y="4.5" width="42" height="6" fill="${caption}" stroke="${black}" stroke-width="0.7"/>` +
        `<polygon points="${explosion(23, bx, by, 15, 10.5, 13)}" fill="${cloud}" stroke="${black}" stroke-width="0.8" stroke-linejoin="round"/>` +
        `<polygon points="${explosion(29, bx, by, 11, 7.5, 11)}" fill="${boom}" stroke="${black}" stroke-width="0.5" stroke-linejoin="round"/>` +
        `<rect x="1.4" y="1.4" width="147.2" height="52.2" fill="none" stroke="${black}" stroke-width="1.2"/>` +
        qrCard(QR[0], QR[1], QR[2], 2, `stroke="${black}" stroke-width="0.8"`),
      defs,
    );
    return {
      background: art,
      design: design(W, H, p.bg, {
        number: number(108, 4, 38, 10, "condensed", 17, p.ink),
        qr: QR,
        stub: STUB,
        texts: [
          block(c.comicLabel, 7, 5.3, 38, 4.5, { bold: true, sizePt: 7.5, color: black, uppercase: true, letterSpacing: 0.15 }),
          block("{evento}", 8, 13, 66, 22, { font: "condensed", sizePt: 30, color: black, uppercase: true, lines: 2 }),
          block(c.pow, 89, 24.5, 22, 10, { font: "condensed", sizePt: 24, color: caption, align: "center" }),
          block("{data_extenso} · {hora}", 6, 38.5, 82, 5.5, { font: "condensed", sizePt: 11.5, color: p.ink, uppercase: true }),
          block("{local}", 6, 44.2, 82, 4.2, { sizePt: 8.5, bold: true, color: p.muted }),
          block("{preco}", 6, 48.4, 50, 4.2, { sizePt: 8.5, bold: true, color: p.accent }),
        ],
      }),
    };
  },
};

const race: TicketTemplate = {
  id: "race",
  categories: ["sports", "charity", "school"],
  palettes: [
    { id: "red", bg: "#ffffff", ink: "#111111", muted: "#555555", accent: "#e11d2a", extra: ["#ffffff", "#111111"] },
    { id: "blue", bg: "#ffffff", ink: "#0b1f44", muted: "#4a5a78", accent: "#1d4ed8", extra: ["#ffffff", "#facc15"] },
    { id: "neon", bg: "#ffffff", ink: "#111111", muted: "#4d4d4d", accent: "#d4ff1e", extra: ["#111111", "#111111"] },
  ],
  build: (p) => {
    // A race bib: 150 × 100, two per A4 sheet.
    const w = 150;
    const h = 100;
    const [onBand = "#ffffff", stripe = p.ink] = p.extra;
    const hole = (x: number, y: number) =>
      `<circle cx="${x}" cy="${y}" r="2.3" fill="#ececec" stroke="#9a9a9a" stroke-width="0.3"/>` +
      `<circle cx="${x}" cy="${y}" r="1.2" fill="#ffffff" stroke="#b5b5b5" stroke-width="0.2"/>`;
    let speed = "";
    for (let i = 0; i < 4; i += 1) {
      const x = 118 + i * 7;
      speed += `<polygon points="${points([[x, -3], [x + 4, -3], [x - 3, 24], [x - 7, 24]])}" fill="${onBand}" opacity="${r(0.08 + i * 0.05)}"/>`;
      speed += `<polygon points="${points([[32 - i * 7, -3], [36 - i * 7, -3], [29 - i * 7, 24], [25 - i * 7, 24]])}" fill="${onBand}" opacity="${r(0.08 + i * 0.05)}"/>`;
    }
    const art = canvas(
      w,
      h,
      p.bg,
      `<rect x="-3" y="-3" width="156" height="27" fill="${p.accent}"/>` +
        speed +
        `<rect x="-3" y="24" width="156" height="1.6" fill="${stripe}"/>` +
        `<line x1="14" y1="68.5" x2="104" y2="68.5" stroke="${p.ink}" stroke-width="0.35"/>` +
        `<rect x="-3" y="97.4" width="156" height="5.6" fill="${p.accent}"/>` +
        hole(7, 7) +
        hole(143, 7) +
        hole(7, 91.5) +
        hole(143, 91.5) +
        qrCard(113, 70, 24, 1.8, `stroke="#d4d4d4" stroke-width="0.3"`),
    );
    return {
      background: art,
      design: design(w, h, p.bg, {
        number: { ...number(8, 27, 134, 41, "condensed", 128, p.ink, "center"), prefix: "" },
        qr: [113, 70, 24],
        stub: null,
        texts: [
          block("{evento}", 14, 4.5, 122, 11, { font: "condensed", sizePt: 26, color: onBand, align: "center", uppercase: true }),
          block("{data_extenso}", 14, 16, 122, 5, { sizePt: 9, bold: true, color: onBand, align: "center", uppercase: true, letterSpacing: 0.12 }),
          block(c.raceStart, 14, 71.5, 92, 7, { font: "condensed", sizePt: 17, color: p.ink, uppercase: true }),
          block("{local}", 14, 79.5, 92, 5, { sizePt: 10, bold: true, color: p.muted }),
          block(c.raceFee, 14, 85.5, 92, 4.5, { sizePt: 9, color: p.muted }),
        ],
      }),
    };
  },
};

/** A regular octagon of radius `size` around (x, y). */
function octagon(x: number, y: number, size: number): string {
  const list: [number, number][] = [];
  for (let i = 0; i < 8; i += 1) {
    const angle = ((i + 0.5) / 8) * Math.PI * 2;
    list.push([x + Math.cos(angle) * size, y + Math.sin(angle) * size]);
  }
  return points(list);
}

const fight: TicketTemplate = {
  id: "fight",
  categories: ["sports"],
  palettes: [
    { id: "corners", bg: "#0b0b0e", ink: "#ffffff", muted: "#dcdce4", accent: "#ffd23f", extra: ["#c8102e", "#1747c4"] },
    { id: "brazil", bg: "#06140c", ink: "#ffffff", muted: "#dcefe3", accent: "#ffdf00", extra: ["#0b7a37", "#13307d"] },
    { id: "gold", bg: "#0a0a0a", ink: "#ffffff", muted: "#d8d4c8", accent: "#e8bd4a", extra: ["#2a2a2f", "#8c6a1c"] },
  ],
  build: (p) => {
    const [red = p.accent, blue = p.accent] = p.extra;
    const defs =
      linear("redCorner", [[0, red, 0.55], [1, red, 1]]) +
      linear("blueCorner", [[0, blue, 1], [1, blue, 0.6]]) +
      `<pattern id="cage" width="3" height="3" patternUnits="userSpaceOnUse"><path d="M0 0L3 3M3 0L0 3" stroke="#ffffff" stroke-width="0.12" opacity="0.5"/></pattern>`;
    // Ring ropes along the top and bottom edges.
    const rope = (y: number, color: string) =>
      `<rect x="-3" y="${r(y - 0.45)}" width="156" height="0.9" rx="0.45" fill="${color}"/>` +
      `<rect x="-3" y="${r(y - 0.3)}" width="156" height="0.25" fill="#ffffff" opacity="0.35"/>`;
    const art = canvas(
      W,
      H,
      p.bg,
      `<polygon points="-3,-3 84,-3 64,58 -3,58" fill="url(#redCorner)"/>` +
        `<polygon points="90,-3 153,-3 153,58 70,58" fill="url(#blueCorner)"/>` +
        `<rect x="-3" y="-3" width="156" height="61" fill="url(#cage)" opacity="0.18"/>` +
        `<polygon points="${octagon(77, 27.5, 36)}" fill="none" stroke="#ffffff" stroke-width="0.7" opacity="0.14"/>` +
        `<polygon points="${octagon(77, 27.5, 32)}" fill="none" stroke="#ffffff" stroke-width="0.3" opacity="0.1"/>` +
        `<line x1="87" y1="-3" x2="67" y2="58" stroke="${p.accent}" stroke-width="0.4"/>` +
        `<circle cx="77.3" cy="27.5" r="7" fill="${p.bg}" stroke="${p.accent}" stroke-width="0.6"/>` +
        rope(1.4, red) +
        rope(-1.2, "#ffffff") +
        rope(53.6, blue) +
        rope(56.2, "#ffffff") +
        qrCard(QR[0], QR[1], QR[2]),
      defs,
    );
    return {
      background: art,
      design: design(W, H, p.bg, {
        number: number(108, 4.5, 38, 10, "condensed", 17, p.ink),
        qr: QR,
        stub: STUB,
        texts: [
          block(c.fightLabel, 8, 5.5, 56, 4.5, { bold: true, sizePt: 7.5, color: p.accent, uppercase: true, letterSpacing: 0.3 }),
          block("{evento}", 8, 10.5, 60, 24.5, { font: "condensed", sizePt: 32, color: p.ink, uppercase: true, lines: 2 }),
          block(c.versus, 70.3, 22.5, 14, 10, { font: "condensed", sizePt: 20, color: p.accent, align: "center" }),
          block("{data} · {hora}", 8, 36, 58, 6, { font: "condensed", sizePt: 13, color: p.accent, uppercase: true }),
          block("{local}", 8, 42.5, 58, 4.5, { sizePt: 9, bold: true, color: p.muted }),
          block("{preco}", 8, 47.5, 50, 4.5, { sizePt: 9, bold: true, color: p.ink }),
        ],
      }),
    };
  },
};

const HEART = [".XX.XX.", "XXXXXXX", "XXXXXXX", ".XXXXX.", "..XXX..", "...X..."];
const EMPTY_HEART = [".XX.XX.", "X..X..X", "X.....X", ".X...X.", "..X.X..", "...X..."];
const GAMEPAD = [
  ".XXXXXXXXXXXXXXXX.",
  "XXXXXXXXXXXXXXXXXX",
  "XXoXXXXXXXXXXXXbXX",
  "XoooXXXXXXXXXXbXbX",
  "XXoXXXXXXXXXXXXbXX",
  "XXXXXXXoXXoXXXXXXX",
  "XXXXXXXXXXXXXXXXXX",
  "XXXXX........XXXXX",
  ".XXX..........XXX.",
];

const gamer: TicketTemplate = {
  id: "gamer",
  categories: ["party", "kids", "school"],
  palettes: [
    { id: "arcade", bg: "#0d0221", ink: "#ffffff", muted: "#bcaee6", accent: "#ff2a6d", extra: ["#05d9e8", "#f9f871", "#24104f"] },
    { id: "lcd", bg: "#0f380f", ink: "#c4e35a", muted: "#8bac0f", accent: "#9bbc0f", extra: ["#8bac0f", "#c4e35a", "#306230"] },
    { id: "purple", bg: "#1a0b2e", ink: "#ffffff", muted: "#cdb9f0", accent: "#b967ff", extra: ["#01cdfe", "#fffb96", "#3a1d63"] },
  ],
  build: (p) => {
    const [cyan = p.accent, score = p.accent, dim = p.bg] = p.extra;
    const next = random(31);
    // Dim pixel blocks in the corners, like an old game's background.
    let blocks = "";
    for (let i = 0; i < 18; i += 1) {
      const x = Math.floor(next() * 50) * 3 - 3;
      const y = next() < 0.5 ? Math.floor(next() * 3) * 3 - 3 : 49 + Math.floor(next() * 3) * 3;
      blocks += `<rect x="${x}" y="${y}" width="3" height="3" fill="${dim}" opacity="${r(0.5 + next() * 0.5)}"/>`;
    }
    // A pixel frame with notched corners.
    const px = 1;
    const frame =
      `<rect x="${2 + px}" y="2" width="${146 - 2 * px}" height="${px}" fill="${p.accent}"/>` +
      `<rect x="${2 + px}" y="${53 - px}" width="${146 - 2 * px}" height="${px}" fill="${p.accent}"/>` +
      `<rect x="2" y="${2 + px}" width="${px}" height="${51 - 2 * px}" fill="${p.accent}"/>` +
      `<rect x="${148 - px}" y="${2 + px}" width="${px}" height="${51 - 2 * px}" fill="${p.accent}"/>` +
      [
        [2 + px, 2 + px],
        [148 - 2 * px, 2 + px],
        [2 + px, 53 - 2 * px],
        [148 - 2 * px, 53 - 2 * px],
      ]
        .map(([x, y]) => `<rect x="${x}" y="${y}" width="${px}" height="${px}" fill="${p.accent}"/>`)
        .join("");
    let sparkles = "";
    for (const [x, y] of [
      [86, 17],
      [103, 9],
      [79, 47],
      [109, 30],
    ] as const) {
      sparkles += pixels([".X.", "XXX", ".X."], x, y, 0.8, { X: score });
    }
    const art = canvas(
      W,
      H,
      p.bg,
      blocks +
        `<ellipse cx="30" cy="22" rx="50" ry="30" fill="url(#crt)"/>` +
        frame +
        pixels(HEART, 69, 5.2, 0.75, { X: p.accent }) +
        pixels(HEART, 75.5, 5.2, 0.75, { X: p.accent }) +
        pixels(EMPTY_HEART, 82, 5.2, 0.75, { X: p.muted }) +
        pixels(GAMEPAD, 88, 38, 1.1, { X: cyan, b: p.accent }) +
        sparkles +
        `<rect x="-3" y="-3" width="156" height="61" fill="url(#scan)"/>` +
        qrCard(QR[0], QR[1], QR[2], 2, `stroke="${cyan}" stroke-width="0.5"`),
      glow("crt", cyan, 0.14) + `<pattern id="scan" width="4" height="0.8" patternUnits="userSpaceOnUse"><rect width="4" height="0.35" fill="#000000" opacity="0.28"/></pattern>`,
    );
    return {
      background: art,
      design: design(W, H, p.bg, {
        number: number(108, 4.5, 38, 9, "mono", 12, score),
        qr: QR,
        stub: STUB,
        texts: [
          block(c.gamerLabel, 8, 5.5, 58, 4.5, { font: "mono", sizePt: 8, color: cyan, uppercase: true }),
          block("{evento}", 8, 11.5, 78, 22, { font: "mono", sizePt: 22, color: p.ink, uppercase: true, lines: 2, letterSpacing: -0.04 }),
          block("{data_extenso} · {hora}", 8, 35, 78, 4.5, { font: "mono", sizePt: 8, color: p.accent }),
          block("{local}", 8, 40.5, 76, 4.5, { font: "mono", sizePt: 8, color: p.muted }),
          block("{preco}", 8, 46, 60, 5, { font: "mono", sizePt: 10.5, color: score }),
        ],
      }),
    };
  },
};

const trophy: TicketTemplate = {
  id: "trophy",
  categories: ["sports", "school", "formal"],
  palettes: [
    { id: "navy", bg: "#0d1b38", ink: "#ffffff", muted: "#bac5dd", accent: "#e2b84b", extra: ["#f8e19a", "#94701d", "#1a2d57"] },
    { id: "black", bg: "#0e0e10", ink: "#ffffff", muted: "#b8b8c0", accent: "#e2b84b", extra: ["#f8e19a", "#94701d", "#232327"] },
    { id: "field", bg: "#0e4a28", ink: "#ffffff", muted: "#d0e9d8", accent: "#f1c84b", extra: ["#fde7a0", "#9a741b", "#0a3a1f"] },
  ],
  build: (p) => {
    const [light = p.accent, dark = p.accent, podium = p.bg] = p.extra;
    const cx = 93;
    let rays = "";
    for (let i = 0; i < 18; i += 1) {
      const a = (i / 18) * Math.PI * 2;
      const b = a + 0.07;
      rays += `<polygon points="${points([[cx, 19], [cx + Math.cos(a) * 40, 19 + Math.sin(a) * 40], [cx + Math.cos(b) * 40, 19 + Math.sin(b) * 40]])}" fill="${p.accent}" opacity="0.09"/>`;
    }
    const cup =
      `<path d="M${cx - 7.3} 11.5 C${cx - 13.5} 10.5 ${cx - 13} 20.5 ${cx - 4.5} 22.5" fill="none" stroke="url(#metal)" stroke-width="1.3" stroke-linecap="round"/>` +
      `<path d="M${cx + 7.3} 11.5 C${cx + 13.5} 10.5 ${cx + 13} 20.5 ${cx + 4.5} 22.5" fill="none" stroke="url(#metal)" stroke-width="1.3" stroke-linecap="round"/>` +
      `<path d="M${cx - 8} 8.5 L${cx + 8} 8.5 C${cx + 8} 19 ${cx + 4.5} 25 ${cx} 26 C${cx - 4.5} 25 ${cx - 8} 19 ${cx - 8} 8.5Z" fill="url(#metal)"/>` +
      `<ellipse cx="${cx}" cy="8.5" rx="8" ry="1.2" fill="${dark}"/>` +
      `<path d="M${cx - 5.6} 11 C${cx - 5.6} 17 ${cx - 3.8} 21 ${cx - 1.6} 22.6" fill="none" stroke="#ffffff" stroke-width="0.5" opacity="0.45" stroke-linecap="round"/>` +
      `<path d="M${cx - 1.4} 25.6 L${cx + 1.4} 25.6 L${cx + 0.9} 32.5 L${cx - 0.9} 32.5Z" fill="url(#metal)"/>` +
      `<ellipse cx="${cx}" cy="29" rx="2.2" ry="0.9" fill="url(#metal)"/>` +
      `<path d="M${cx - 4} 32.5 L${cx + 4} 32.5 L${cx + 5.5} 36 L${cx - 5.5} 36Z" fill="url(#metal)"/>` +
      `<rect x="${cx - 7}" y="36" width="14" height="7.5" rx="0.5" fill="${dark}"/>` +
      `<rect x="${cx - 4.6}" y="38" width="9.2" height="3.5" rx="0.3" fill="${light}" opacity="0.85"/>` +
      star(cx, 15.5, 2.6, light, 0.9);
    const step = (x: number, y: number, width: number) =>
      `<rect x="${x}" y="${y}" width="${width}" height="${58 - y}" fill="${podium}"/>` +
      `<rect x="${x}" y="${y}" width="${width}" height="0.6" fill="${p.accent}"/>`;
    const art = canvas(
      W,
      H,
      p.bg,
      `<ellipse cx="${cx}" cy="20" rx="30" ry="28" fill="url(#halo)"/>` +
        rays +
        branch([cx - 9, 42], [cx - 13, 9], 0.28, 9, p.accent, 2.1) +
        branch([cx + 9, 42], [cx + 13, 9], -0.28, 9, p.accent, 2.1) +
        step(cx - 19.5, 48.5, 11) +
        step(cx + 8.5, 50, 11) +
        step(cx - 8.5, 43.5, 17) +
        star(cx, 49.5, 1.6, p.accent) +
        cup +
        qrCard(QR[0], QR[1], QR[2]),
      glow("halo", p.accent, 0.22) + linear("metal", [[0, dark], [0.3, light], [0.55, p.accent], [1, dark]]),
    );
    return {
      background: art,
      design: design(W, H, p.bg, {
        number: number(108, 4, 38, 10, "serif", 13, p.accent),
        qr: QR,
        stub: STUB,
        texts: [
          block(c.trophyLabel, 8, 6, 60, 4.5, { bold: true, sizePt: 7.5, color: p.accent, uppercase: true, letterSpacing: 0.35 }),
          block("{evento}", 8, 11.5, 64, 21, { font: "serif", sizePt: 24, color: p.ink, lines: 2 }),
          block("{data} · {hora}", 8, 35, 64, 5.5, { sizePt: 10, bold: true, color: p.accent }),
          block("{local}", 8, 41.5, 64, 4.5, { sizePt: 9, color: p.muted }),
          block("{preco}", 8, 47, 50, 4.5, { sizePt: 9, bold: true, color: p.ink }),
        ],
      }),
    };
  },
};

/** A pine of height `h` standing on (x, y): three tiers and a trunk. */
function pine(x: number, y: number, h: number, color: string): string {
  const w = h * 0.42;
  const tier = (top: number, bottom: number, half: number) => `${r(x)},${r(top)} ${r(x + half)},${r(bottom)} ${r(x - half)},${r(bottom)}`;
  return (
    `<rect x="${r(x - h * 0.04)}" y="${r(y - h * 0.12)}" width="${r(h * 0.08)}" height="${r(h * 0.14)}" fill="${color}"/>` +
    `<polygon points="${tier(y - h, y - h * 0.55, w * 0.55)}" fill="${color}"/>` +
    `<polygon points="${tier(y - h * 0.78, y - h * 0.3, w * 0.78)}" fill="${color}"/>` +
    `<polygon points="${tier(y - h * 0.55, y - h * 0.1, w)}" fill="${color}"/>`
  );
}

const retreat: TicketTemplate = {
  id: "retreat",
  categories: ["church", "school", "sports"],
  palettes: [
    { id: "night", bg: "#0a1530", ink: "#ffffff", muted: "#cbd5ec", accent: "#ffc857", extra: ["#24407a", "#33507f", "#223a63", "#14233f", "#0a1328"] },
    { id: "dawn", bg: "#27286a", ink: "#ffffff", muted: "#ffe6d6", accent: "#ffd08a", extra: ["#f2996a", "#9a5f9c", "#6c4384", "#432d66", "#241838"] },
    { id: "forest", bg: "#143628", ink: "#ffffff", muted: "#d6ecdf", accent: "#f4d35e", extra: ["#3d7a5a", "#3b6d55", "#28543f", "#183a2b", "#0c2219"] },
  ],
  build: (p) => {
    const [horizon = p.bg, far = p.bg, mid = p.bg, near = p.bg, trees = p.bg] = p.extra;
    const next = random(37);
    let stars = "";
    for (let i = 0; i < 46; i += 1) {
      const x = -3 + next() * 156;
      const y = -3 + next() * 30;
      stars += `<circle cx="${r(x)}" cy="${r(y)}" r="${r(0.12 + next() * 0.3)}" fill="#ffffff" opacity="${r(0.25 + next() * 0.6)}"/>`;
    }
    const range = (list: readonly (readonly [number, number])[], color: string) =>
      `<polygon points="${points([...list, [153, 58], [-3, 58]])}" fill="${color}"/>`;
    let forest = "";
    for (const [x, y, h] of [
      [60, 49.5, 8],
      [64.5, 49, 11],
      [69, 48.5, 7.5],
      [76, 47.5, 9.5],
      [104, 46, 12],
      [109, 46.5, 8.5],
      [1, 51.5, 9],
      [4.5, 52, 6.5],
    ] as const) {
      forest += pine(x, y, h, trees);
    }
    const fire =
      `<ellipse cx="88" cy="50" rx="9" ry="6" fill="url(#fire)"/>` +
      `<path d="M85.6 52.6 L90.4 50.8 M85.6 50.8 L90.4 52.6" stroke="${trees}" stroke-width="0.9" stroke-linecap="round"/>` +
      `<path d="M88 46 C86.4 48 85.8 49.4 86.6 50.9 C87.2 51.9 88.8 51.9 89.4 50.9 C90.2 49.4 89.4 48.6 88.8 47.6 C88.6 48.6 88.2 49 88 49.2 C87.8 48.2 88.2 47 88 46Z" fill="${p.accent}"/>`;
    const art = canvas(
      W,
      H,
      p.bg,
      `<rect x="-3" y="-3" width="156" height="61" fill="url(#sky)"/>` +
        stars +
        `<circle cx="98" cy="17" r="12" fill="url(#moonGlow)"/>` +
        `<circle cx="98" cy="17" r="4.6" fill="${p.accent}" opacity="0.92"/>` +
        range(
          [[-3, 41], [10, 37], [22, 39.5], [38, 33], [52, 36.5], [66, 27], [79, 20], [89, 25], [100, 15], [112, 23], [124, 18], [138, 26], [153, 21]],
          far,
        ) +
        `<polygon points="100,15 97.2,18.3 98.8,17.6 100,19 101.4,17.4 103,18.4" fill="#ffffff" opacity="0.5"/>` +
        `<polygon points="79,20 76.3,23 77.9,22.5 79.2,23.8 80.4,22.4 82,23.2" fill="#ffffff" opacity="0.4"/>` +
        range([[-3, 46], [14, 43.5], [30, 46], [46, 40.5], [60, 44], [74, 36], [86, 41.5], [98, 33], [110, 39.5], [126, 34], [140, 40], [153, 37]], mid) +
        range([[-3, 50], [20, 48.5], [40, 50.5], [60, 47.5], [78, 45.5], [92, 48.5], [106, 43.5], [124, 47.5], [153, 45.5]], near) +
        forest +
        fire +
        qrCard(QR[0], QR[1], QR[2]),
      linear("sky", [[0, p.bg], [0.55, p.bg], [1, horizon]], 90) + glow("moonGlow", p.accent, 0.35) + glow("fire", p.accent, 0.5),
    );
    return {
      background: art,
      design: design(W, H, p.bg, {
        number: number(108, 4, 38, 10, "slab", 13, p.ink),
        qr: QR,
        stub: STUB,
        texts: [
          block(c.retreatLabel, 8, 5.5, 60, 4.5, { bold: true, sizePt: 7.5, color: p.accent, uppercase: true, letterSpacing: 0.35 }),
          block("{evento}", 8, 11, 80, 19, { font: "slab", sizePt: 22, color: p.ink, lines: 2 }),
          block("{dias}", 8, 31.5, 80, 5, { sizePt: 10, bold: true, color: p.accent }),
          block(c.fromTime, 8, 37, 80, 4.5, { sizePt: 9, color: p.muted }),
          block("{local}", 8, 42.5, 80, 4.5, { sizePt: 9, bold: true, color: p.ink }),
          block("{preco}", 8, 48, 60, 4.5, { sizePt: 8.5, bold: true, color: p.muted }),
        ],
      }),
    };
  },
};

export const COMMUNITY_TEMPLATES: readonly TicketTemplate[] = [
  exhibition,
  standup,
  recital,
  sarau,
  scienceFair,
  circus,
  comic,
  race,
  fight,
  gamer,
  trophy,
  retreat,
];
