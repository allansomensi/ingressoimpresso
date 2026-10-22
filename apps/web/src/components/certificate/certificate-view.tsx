"use client";

import type {
  BrandPosition,
  BrandStyle,
  CertificateElement,
  CertificateFrame,
  CertificateLine,
  CertificatePage,
  CertificateSeal,
  CertificateSignature,
  CertificateText,
  PageOrientation,
} from "@ingressoimpresso/api-types";
import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";

import { FakeQr, FitText, useFontsVersion } from "@/components/ticket/ticket-view";
import { luminance } from "@/lib/brand-palette";
import { elementBox, isSquare, minSize, pageSize } from "@/lib/certificate-design";
import { fillCertificate, fillCertificateText, type CertificateFields } from "@/lib/certificates";
import { cn } from "@/lib/cn";
import { FONT_FAMILIES, FONTS_WITH_BOLD, FONTS_WITH_ITALIC, MM_PER_PT } from "@/lib/design-rules";
import {
  DRAG_THRESHOLD_PX,
  GRID_MM,
  SNAP_PX,
  boundsOf,
  clampDelta,
  guidesFor,
  moveBoxes,
  roundMm,
  roundTo,
  snapMove,
  snapResize,
  type Box,
  type Guide,
} from "@/lib/design-selection";
import { certificateEditor as editorTexts } from "@/texts/pt-BR/certificate-editor";

const t = editorTexts.canvas;

/** The line at the bottom of the front (`CERTIFICATE_BRAND` in crates/render). */
export const CERTIFICATE_BRAND = "Emitido com Ingresso Impresso · ingressoimpresso.com.br";

/** The words before the logo in the watermark (`CERTIFICATE_BRAND_CAPTION` in crates/render). */
export const CERTIFICATE_BRAND_CAPTION = "Emitido com";

/** The ink of the watermark: white on dark paper (`brand_ink` in crates/render). */
export function brandInk(paper: string): string {
  return luminance(paper) < 0.4 ? "#ffffff" : "#2a2838";
}

/** Ticket outline of the logo (`components/brand.tsx`), cut by its check and tear line. */
const MARK_TICKET =
  "M10 14h44a6 6 0 0 1 6 6v6.5a5.5 5.5 0 0 0 0 11V44a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6v-6.5a5.5 5.5 0 0 0 0-11V20a6 6 0 0 1 6-6z";

/** The brand's mark in one ink, as `brand_mark_svg` draws it for the PDF. */
function BrandMark({ ink, height }: { ink: string; height: string }) {
  const id = `${useId().replace(/:/g, "")}cut`;
  return (
    <svg viewBox="0 0 64 64" style={{ height, width: height }} aria-hidden>
      <defs>
        <mask id={id}>
          <rect width="64" height="64" fill="#fff" />
          <g transform="rotate(-12 32 32)">
            <path d="M45 20v3.2M45 26.9v3.2M45 33.8v3.2M45 40.7v3.2" stroke="#000" strokeWidth="2.4" strokeLinecap="round" />
            <path d="M18 32.5l5.5 5.5 12-12" fill="none" stroke="#000" strokeWidth="5.2" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        </mask>
      </defs>
      <path transform="rotate(-12 32 32)" mask={`url(#${id})`} fill={ink} fillOpacity={0.5} d={MARK_TICKET} />
    </svg>
  );
}

/** One element placed in a new box, as the canvas reports moves and resizes. */
export interface PlacedElement {
  index: number;
  box: Box;
}

type Drag =
  | {
      mode: "move";
      gesture: string;
      items: PlacedElement[];
      bounds: Box;
      targets: Box[];
      x: number;
      y: number;
      mmPerPx: number;
      moved: boolean;
      collapseTo: number | null;
    }
  | { mode: "resize"; gesture: string; index: number; start: Box; targets: Box[]; x: number; y: number; mmPerPx: number; moved: boolean };

interface DragView {
  guides: Guide[];
  box: Box;
  mode: Drag["mode"];
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));
const mmText = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const VALIGN: Record<CertificateText["valign"], string> = { top: "flex-start", middle: "center", bottom: "flex-end" };

/**
 * A paragraph that shrinks (never grows) until it fits its box, like `text-element` in
 * templates/certificate.typ: the largest size, up to the element's, found by a binary search on a
 * hidden copy. Lines are `lineHeight` apart; the half leading CSS puts above the first line and
 * below the last is taken back, as the PDF has none.
 */
function FitParagraph({ element, fields, unit }: { element: CertificateText; fields: CertificateFields; unit: (mm: number) => number }) {
  const outer = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const fonts = useFontsVersion();
  const segments = fillCertificate(element.text, fields);
  const base = unit(element.sizePt * MM_PER_PT);
  const lineHeight = element.lineHeight;
  const key = JSON.stringify([segments, element.font, element.sizePt, element.bold, element.italic, element.uppercase, element.letterSpacing, lineHeight, element.boldName]);

  useLayoutEffect(() => {
    const box = outer.current;
    const copy = probe.current;
    if (box === null || copy === null) {
      return;
    }
    const measure = () => {
      const height = box.clientHeight;
      if (box.clientWidth === 0) {
        return;
      }
      const fits = (factor: number) => {
        copy.style.fontSize = `${String(base * factor)}cqw`;
        const em = Number.parseFloat(getComputedStyle(copy).fontSize);
        return copy.offsetHeight - (lineHeight - 1) * em <= height + 0.5;
      };
      let best = 1;
      if (!fits(1)) {
        let [low, high] = [0.1, 1];
        for (let step = 0; step < 14; step += 1) {
          const mid = (low + high) / 2;
          if (fits(mid)) {
            low = mid;
          } else {
            high = mid;
          }
        }
        best = low;
      }
      setScale((current) => (Math.abs(current - best) < 0.002 ? current : best));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => {
      observer.disconnect();
    };
  }, [key, base, lineHeight, fonts]);

  const bold = FONTS_WITH_BOLD.includes(element.font);
  const style: CSSProperties = {
    fontFamily: FONT_FAMILIES[element.font],
    color: element.color,
    fontWeight: element.bold && bold ? 700 : 400,
    fontStyle: element.italic && FONTS_WITH_ITALIC.includes(element.font) ? "italic" : "normal",
    fontSynthesis: "none",
    letterSpacing: `${String(element.letterSpacing)}em`,
    lineHeight,
    textAlign: element.align === "justify" ? "justify" : element.align,
    textAlignLast: element.align === "justify" ? "left" : undefined,
    whiteSpace: "pre-wrap",
    width: "100%",
  };
  const content = segments.map((segment, index) => {
    const value = element.uppercase ? segment.text.toLocaleUpperCase("pt-BR") : segment.text;
    return segment.strong && element.boldName && bold ? (
      <strong key={index} style={{ fontWeight: 700 }}>
        {value}
      </strong>
    ) : (
      <span key={index}>{value}</span>
    );
  });
  return (
    <div ref={outer} className="relative flex size-full flex-col" style={{ justifyContent: VALIGN[element.valign] }}>
      <div ref={probe} aria-hidden className="pointer-events-none invisible absolute top-0 left-0" style={style}>
        {content}
      </div>
      <div style={{ ...style, fontSize: `${String(base * scale)}cqw`, margin: `${String(-(lineHeight - 1) / 2)}em 0` }}>{content}</div>
    </div>
  );
}

/** The frame of a page (`frame` in templates/certificate.typ), drawn in millimetres. */
function FrameArt({ frame, width: W, height: H }: { frame: CertificateFrame; width: number; height: number }) {
  const { color: c, accent: a, marginMm: m, thicknessMm: t } = frame;
  const outline = (offset: number, thickness: number, paint: string, key: string) => (
    <rect key={key} x={offset + thickness / 2} y={offset + thickness / 2} width={W - 2 * offset - thickness} height={H - 2 * offset - thickness} fill="none" stroke={paint} strokeWidth={thickness} />
  );
  const diamond = (cx: number, cy: number, r: number, paint: string, key: string) => (
    <polygon key={key} points={`${String(cx)},${String(cy - r)} ${String(cx + r)},${String(cy)} ${String(cx)},${String(cy + r)} ${String(cx - r)},${String(cy)}`} fill={paint} />
  );
  const parts: ReactNode[] = [];
  switch (frame.style) {
    case "simple":
      parts.push(outline(m, t, c, "o"));
      break;
    case "double":
      parts.push(outline(m, t, c, "o"), outline(m + t + 1.5, Math.max(t * 0.35, 0.25), c, "i"));
      break;
    case "band":
      if (m > 0) {
        parts.push(outline(0, m, c, "b"));
      }
      parts.push(outline(m + 2.5, t, a, "l"));
      break;
    case "classic": {
      parts.push(outline(m, t, c, "o"), outline(m + t + 1.8, 0.3, a, "i"));
      const r = Math.max(2.6, t * 2);
      const o = m + t / 2;
      [
        [o, o],
        [W - o, o],
        [o, H - o],
        [W - o, H - o],
      ].forEach(([cx = 0, cy = 0], index) => parts.push(diamond(cx, cy, r, a, `d${String(index)}`)));
      break;
    }
    case "corners": {
      const arm = Math.min(24, (W - 2 * m) / 3);
      const o = m + t / 2;
      const thin = Math.max(t / 2, 0.2);
      const i = m + t + 2.5 + thin / 2;
      for (const [sx, sy] of [
        [1, 1],
        [-1, 1],
        [1, -1],
        [-1, -1],
      ] as const) {
        const x = (offset: number) => (sx === 1 ? offset : W - offset);
        const y = (offset: number) => (sy === 1 ? offset : H - offset);
        const bracket = (offset: number, length: number, thickness: number, paint: string, key: string) => (
          <path
            key={key}
            d={`M${String(x(offset) + sx * length)} ${String(y(offset))}H${String(x(offset))}V${String(y(offset) + sy * length)}`}
            fill="none"
            stroke={paint}
            strokeWidth={thickness}
            strokeLinecap="square"
          />
        );
        parts.push(bracket(o, arm, t, c, `o${String(sx)}${String(sy)}`), bracket(i, arm * 0.6, thin, a, `i${String(sx)}${String(sy)}`));
      }
      break;
    }
    case "geometric": {
      const big = Math.min(W, H) * 0.3;
      const s = Math.max(t, 1);
      const pts = (points: [number, number][]) => points.map(([x, y]) => `${String(x)},${String(y)}`).join(" ");
      parts.push(
        <polygon key="a" points={pts([[0, 0], [big, 0], [0, big]])} fill={c} />,
        <polygon key="b" points={pts([[big + 3, 0], [big + 3 + s, 0], [0, big + 3 + s], [0, big + 3]])} fill={a} />,
        <polygon key="c" points={pts([[W, H], [W - big, H], [W, H - big]])} fill={c} />,
        <polygon key="d" points={pts([[W - big - 3, H], [W - big - 3 - s, H], [W, H - big - 3 - s], [W, H - big - 3]])} fill={a} />,
      );
      break;
    }
    case "side":
      if (m > 0) {
        parts.push(<rect key="b" x={0} y={0} width={m} height={H} fill={c} />);
      }
      parts.push(<rect key="s" x={m + 1.5} y={0} width={t} height={H} fill={a} />);
      break;
  }
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0 size-full" viewBox={`0 0 ${String(W)} ${String(H)}`}>
      {parts}
    </svg>
  );
}

/** A line across its box (`line-element` in templates/certificate.typ). */
function LineArt({ line }: { line: CertificateLine }) {
  const { widthMm: w, heightMm: h, thicknessMm: t, color: c } = line;
  const across = w >= h;
  const length = across ? w : h;
  const middle = across ? h / 2 : w / 2;
  const segment = (a: number, b: number, shift: number, key: string, extra?: { dash?: string; cap?: "round" }) => {
    const [x1, y1, x2, y2] = across ? [a, middle + shift, b, middle + shift] : [middle + shift, a, middle + shift, b];
    return (
      <line
        key={key}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={c}
        strokeWidth={t}
        strokeDasharray={extra?.dash}
        strokeLinecap={extra?.cap ?? "butt"}
      />
    );
  };
  let parts: ReactNode[];
  switch (line.style) {
    case "solid":
      parts = [segment(0, length, 0, "s")];
      break;
    case "double": {
      const d = (t + Math.max(t, 0.4)) / 2;
      parts = [segment(0, length, -d, "a"), segment(0, length, d, "b")];
      break;
    }
    case "dotted":
      parts = [segment(0, length, 0, "d", { dash: `0 ${String(t * 2.5)}`, cap: "round" })];
      break;
    case "ornament": {
      const r = Math.max(t * 3, 1.2);
      const [cx, cy] = across ? [length / 2, middle] : [middle, length / 2];
      parts = [
        segment(0, length / 2 - r - 1, 0, "a"),
        segment(length / 2 + r + 1, length, 0, "b"),
        <polygon key="d" points={`${String(cx)},${String(cy - r)} ${String(cx + r)},${String(cy)} ${String(cx)},${String(cy + r)} ${String(cx - r)},${String(cy)}`} fill={c} />,
      ];
      break;
    }
  }
  return (
    <svg aria-hidden className="block size-full overflow-visible" viewBox={`0 0 ${String(w)} ${String(h)}`}>
      {parts}
    </svg>
  );
}

/** A seal (`seal-element` in templates/certificate.typ). */
function SealArt({ seal, fields, unit }: { seal: CertificateSeal; fields: CertificateFields; unit: (mm: number) => number }) {
  const d = seal.sizeMm;
  const r = d / 2;
  const points = Array.from({ length: 80 }, (_, i) => {
    const angle = (i * 4.5 * Math.PI) / 180;
    const radius = i % 2 === 0 ? r : r * 0.93;
    return `${String(r + radius * Math.sin(angle))},${String(r - radius * Math.cos(angle))}`;
  }).join(" ");
  const small = fillCertificateText(seal.text, fields);
  const big = fillCertificateText(seal.center, fields);
  const smallH = d * 0.11;
  const bigH = d * 0.24;
  const inner = d * 0.62;
  const gap = small !== "" && big !== "" ? d * 0.03 : 0;
  const total = (small === "" ? 0 : smallH) + (big === "" ? 0 : bigH) + gap;
  const top = r - total / 2;
  const pct = (mm: number) => `${String((mm / d) * 100)}%`;
  return (
    <div className="relative size-full">
      <svg aria-hidden className="absolute inset-0 size-full" viewBox={`0 0 ${String(d)} ${String(d)}`}>
        <polygon points={points} fill={seal.color} />
        <circle cx={r} cy={r} r={r * 0.8} fill="none" stroke={seal.textColor} strokeWidth={Math.max(d * 0.012, 0.3 * MM_PER_PT)} />
      </svg>
      {small !== "" && (
        <div className="absolute" style={{ left: pct(r - inner / 2), top: pct(top), width: pct(inner), height: pct(smallH) }}>
          <FitText
            value={small.toLocaleUpperCase("pt-BR")}
            lines={1}
            align="center"
            style={{ fontFamily: FONT_FAMILIES.sans, fontWeight: 700, fontSize: `${String(unit(smallH))}cqw`, color: seal.textColor, letterSpacing: "0.08em" }}
          />
        </div>
      )}
      {big !== "" && (
        <div className="absolute" style={{ left: pct(r - inner / 2), top: pct(small === "" ? top : top + smallH + gap), width: pct(inner), height: pct(bigH) }}>
          <FitText
            value={big}
            lines={1}
            align="center"
            style={{ fontFamily: FONT_FAMILIES.roman, fontWeight: 700, fontSize: `${String(unit(bigH * 1.25))}cqw`, color: seal.textColor }}
          />
        </div>
      )}
    </div>
  );
}

/** A signature (`signature-element` in templates/certificate.typ): picture, line, name and role. */
function SignatureArt({ signature, imageUrl, unit }: { signature: CertificateSignature; imageUrl: string | null; unit: (mm: number) => number }) {
  const { widthMm: w, heightMm: h, sizePt: size } = signature;
  const nameH = size * 1.3 * MM_PER_PT;
  const roleH = size * 0.8 * 1.3 * MM_PER_PT;
  const lineY = h - nameH - roleH - 1.2;
  const pctX = (mm: number) => `${String((mm / w) * 100)}%`;
  const pctY = (mm: number) => `${String((mm / h) * 100)}%`;
  const font = FONT_FAMILIES[signature.font];
  return (
    <div className="relative size-full">
      {imageUrl !== null && lineY > 2.5 && (
        // eslint-disable-next-line @next/next/no-img-element -- object URL of an uploaded signature
        <img
          src={imageUrl}
          alt=""
          draggable={false}
          className="pointer-events-none absolute left-0 object-contain object-bottom"
          style={{ top: 0, width: "100%", height: pctY(lineY - 0.5) }}
        />
      )}
      <span
        aria-hidden
        className="absolute"
        style={{ left: pctX(w * 0.075), width: pctX(w * 0.85), top: pctY(lineY), borderTop: `${String(unit(0.6 * MM_PER_PT))}cqw solid ${signature.lineColor}` }}
      />
      {signature.name !== "" && (
        <div className="absolute left-0 w-full" style={{ top: pctY(lineY + 1.2), height: pctY(nameH) }}>
          <FitText value={signature.name} lines={1} align="center" style={{ fontFamily: font, fontSize: `${String(unit(size * MM_PER_PT))}cqw`, color: signature.color }} />
        </div>
      )}
      {signature.role !== "" && (
        <div className="absolute left-0 w-full" style={{ top: pctY(lineY + 1.2 + nameH), height: pctY(roleH) }}>
          <FitText
            value={signature.role}
            lines={1}
            align="center"
            style={{ fontFamily: font, fontSize: `${String(unit(size * 0.8 * MM_PER_PT))}cqw`, color: signature.color, opacity: 0.75 }}
          />
        </div>
      )}
    </div>
  );
}

function Placeholder({ label, hint }: { label: string; hint?: string }) {
  return (
    <span className="flex size-full flex-col items-center justify-center overflow-hidden border border-dashed border-black/30 bg-white/60 px-1 text-center text-[10px] leading-tight font-medium text-black/60 italic">
      <span className="truncate">{label}</span>
      {hint !== undefined && <span className="truncate text-[9px] font-normal">{hint}</span>}
    </span>
  );
}

/**
 * One side of a certificate drawn in the browser from its design: paper, background image, frame
 * and the elements with the person's fields. With `onChange` it becomes the editor's canvas:
 * elements are selected (Shift, Ctrl or ⌘ add), dragged together with smart guides (Alt turns them
 * off) and resized one at a time.
 */
export function CertificateView({
  page,
  orientation,
  fields,
  imageUrls,
  logoUrl,
  brand,
  brandPosition = null,
  onBrandMove,
  className,
  selected = [],
  problems = [],
  additive = false,
  onSelect,
  onChange,
}: {
  page: CertificatePage;
  orientation: PageOrientation;
  fields: CertificateFields;
  /** Object URLs of the certificate's images, by index (`null` while loading or missing). */
  imageUrls: readonly (string | null)[];
  /** The organization's logo, when it has one. */
  logoUrl: string | null;
  /** Draws the "Emitido com Ingresso Impresso" in this style (the front of a design that keeps it). */
  brand: BrandStyle | null;
  /** Where the brand sits (`null`: centred at the bottom). */
  brandPosition?: BrandPosition | null;
  /** Drags the brand somewhere else (the editor); every change of one gesture shares `gesture`. */
  onBrandMove?: (position: BrandPosition, gesture: string) => void;
  className?: string;
  selected?: readonly number[];
  problems?: readonly number[];
  additive?: boolean;
  onSelect?: (indices: number[]) => void;
  /** Moves and resizes; every change of one gesture carries the same `gesture` key. */
  onChange?: (changes: PlacedElement[], gesture: string) => void;
}) {
  const { width: W, height: H } = pageSize(orientation);
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const gestures = useRef(0);
  const [dragView, setDragView] = useState<DragView | null>(null);
  const editable = onChange !== undefined;
  const area = { width: W, height: H };
  /** Millimetres as a number of `cqw` (the page is the container). */
  const unit = (mm: number) => (mm / W) * 100;
  const u = (mm: number) => `${String(unit(mm))}cqw`;
  const boxes = page.elements.map(elementBox);
  const isSelected = (index: number) => selected.includes(index);
  const boxesOutside = (inside: readonly number[]) => boxes.filter((_, index) => !inside.includes(index));

  const begin = (pointer: PointerEvent): number | null => {
    const width = root.current?.getBoundingClientRect().width ?? 0;
    if (!editable || width === 0 || pointer.button !== 0) {
      return null;
    }
    pointer.preventDefault();
    pointer.stopPropagation();
    const active = document.activeElement;
    if (active instanceof HTMLElement && root.current?.contains(active) !== true) {
      active.blur();
    }
    (pointer.currentTarget as HTMLElement).setPointerCapture(pointer.pointerId);
    gestures.current += 1;
    return W / width;
  };

  const startMove = (pointer: PointerEvent, index: number) => {
    const mmPerPx = begin(pointer);
    if (mmPerPx === null) {
      return;
    }
    const toggle = additive || pointer.shiftKey || pointer.ctrlKey || pointer.metaKey;
    const already = isSelected(index);
    if (toggle && already) {
      onSelect?.(selected.filter((item) => item !== index));
      return;
    }
    const group = toggle ? [...selected, index] : already ? [...selected] : [index];
    if (!already || toggle) {
      onSelect?.(group);
    }
    const items = group.flatMap((item) => {
      const box = boxes[item];
      return box === undefined ? [] : [{ index: item, box }];
    });
    const bounds = boundsOf(items.map((item) => item.box));
    if (bounds === null) {
      return;
    }
    drag.current = {
      mode: "move",
      gesture: `drag-${String(gestures.current)}`,
      items,
      bounds,
      targets: boxesOutside(group),
      x: pointer.clientX,
      y: pointer.clientY,
      mmPerPx,
      moved: false,
      collapseTo: already && !toggle && group.length > 1 ? index : null,
    };
  };

  const startResize = (pointer: PointerEvent, index: number) => {
    const box = boxes[index];
    const mmPerPx = box === undefined ? null : begin(pointer);
    if (box === undefined || mmPerPx === null) {
      return;
    }
    drag.current = {
      mode: "resize",
      gesture: `drag-${String(gestures.current)}`,
      index,
      start: box,
      targets: boxesOutside([index]),
      x: pointer.clientX,
      y: pointer.clientY,
      mmPerPx,
      moved: false,
    };
  };

  const moveDrag = (pointer: PointerEvent) => {
    const current = drag.current;
    if (current === null || onChange === undefined) {
      return;
    }
    const px = pointer.clientX - current.x;
    const py = pointer.clientY - current.y;
    if (!current.moved) {
      if (Math.hypot(px, py) < DRAG_THRESHOLD_PX) {
        return;
      }
      current.moved = true;
    }
    const dx = px * current.mmPerPx;
    const dy = py * current.mmPerPx;
    const threshold = SNAP_PX * current.mmPerPx;
    const guides = !pointer.altKey;
    if (current.mode === "move") {
      const { bounds } = current;
      let x = roundTo(bounds.x + dx, GRID_MM);
      let y = roundTo(bounds.y + dy, GRID_MM);
      if (guides) {
        const shift = snapMove({ ...bounds, x, y }, current.targets, area, threshold);
        x += shift.dx;
        y += shift.dy;
      }
      const delta = clampDelta([bounds], x - bounds.x, y - bounds.y, area);
      const [box] = moveBoxes([bounds], delta.dx, delta.dy);
      if (box !== undefined) {
        setDragView({ mode: "move", box, guides: guides ? guidesFor(box, current.targets, area) : [] });
      }
      onChange(
        current.items.map(({ index, box: start }) => ({ index, box: { ...start, x: roundMm(start.x + delta.dx), y: roundMm(start.y + delta.dy) } })),
        current.gesture,
      );
      return;
    }
    const { start, index } = current;
    const element = page.elements[index];
    if (element === undefined) {
      return;
    }
    const min = minSize(element);
    let box: Box;
    if (isSquare(element)) {
      const size = clamp(roundTo(start.width + Math.max(dx, dy), GRID_MM), min.width, Math.min(W - start.x, H - start.y));
      box = { ...start, width: size, height: size };
    } else {
      let width = roundTo(start.width + dx, GRID_MM);
      let height = roundTo(start.height + dy, GRID_MM);
      if (guides) {
        ({ width, height } = snapResize({ ...start, width, height }, current.targets, area, threshold));
      }
      box = { ...start, width: roundMm(clamp(width, min.width, W - start.x)), height: roundMm(clamp(height, min.height, H - start.y)) };
    }
    setDragView({ mode: "resize", box, guides: guides && !isSquare(element) ? guidesFor(box, current.targets, area, "end") : [] });
    onChange([{ index, box }], current.gesture);
  };

  const endDrag = () => {
    const current = drag.current;
    drag.current = null;
    setDragView(null);
    if (current?.mode === "move" && !current.moved && current.collapseTo !== null) {
      onSelect?.([current.collapseTo]);
    }
  };

  // The brand moves on its own, by its centre, kept inside the page; it snaps to the middle.
  const brandDrag = useRef<{ x: number; y: number; cx: number; cy: number; halfW: number; halfH: number; mmPerPx: number; gesture: string; moved: boolean } | null>(null);
  const startBrand = (pointer: PointerEvent<HTMLSpanElement>) => {
    const page = root.current?.getBoundingClientRect();
    if (onBrandMove === undefined || page === undefined || page.width === 0 || pointer.button !== 0) {
      return;
    }
    pointer.preventDefault();
    pointer.stopPropagation();
    pointer.currentTarget.setPointerCapture(pointer.pointerId);
    const box = pointer.currentTarget.getBoundingClientRect();
    const mmPerPx = W / page.width;
    gestures.current += 1;
    brandDrag.current = {
      x: pointer.clientX,
      y: pointer.clientY,
      cx: (box.left + box.width / 2 - page.left) * mmPerPx,
      cy: (box.top + box.height / 2 - page.top) * mmPerPx,
      halfW: (box.width / 2) * mmPerPx,
      halfH: (box.height / 2) * mmPerPx,
      mmPerPx,
      gesture: `brand-${String(gestures.current)}`,
      moved: false,
    };
  };
  const moveBrand = (pointer: PointerEvent<HTMLSpanElement>) => {
    const current = brandDrag.current;
    if (current === null || onBrandMove === undefined) {
      return;
    }
    const px = pointer.clientX - current.x;
    const py = pointer.clientY - current.y;
    if (!current.moved && Math.hypot(px, py) < DRAG_THRESHOLD_PX) {
      return;
    }
    current.moved = true;
    let x = clamp(current.cx + px * current.mmPerPx, current.halfW, W - current.halfW);
    const y = clamp(current.cy + py * current.mmPerPx, current.halfH, H - current.halfH);
    if (!pointer.altKey && Math.abs(x - W / 2) <= SNAP_PX * current.mmPerPx) {
      x = W / 2;
    }
    onBrandMove({ xMm: roundMm(x), yMm: roundMm(y) }, current.gesture);
  };
  const endBrand = () => {
    brandDrag.current = null;
  };

  const single = selected.length === 1;
  const drawn = (element: CertificateElement): { node: ReactNode; label: string } | null => {
    switch (element.kind) {
      case "text": {
        const segments = fillCertificate(element.text, fields);
        const label = segments.map((segment) => segment.text).join("") || element.text;
        if (segments.length === 0) {
          return editable ? { node: <Placeholder label={element.text} />, label } : null;
        }
        return { node: <FitParagraph element={element} fields={fields} unit={unit} />, label };
      }
      case "image": {
        const url = element.source.from === "organization" ? logoUrl : (imageUrls[element.source.index] ?? null);
        if (url === null) {
          if (!editable) {
            return null;
          }
          return {
            node:
              element.source.from === "organization" ? <Placeholder label={t.noLogo} hint={t.noLogoHint} /> : <Placeholder label={t.noImage} />,
            label: element.source.from === "organization" ? editorTexts.logoElement : editorTexts.imageElement(element.source.index),
          };
        }
        return {
          // eslint-disable-next-line @next/next/no-img-element -- object or API URL of a logo
          node: <img src={url} alt="" draggable={false} className="pointer-events-none size-full object-contain" />,
          label: element.source.from === "organization" ? editorTexts.logoElement : editorTexts.imageElement(element.source.index),
        };
      }
      case "signature":
        return {
          node: <SignatureArt signature={element} imageUrl={element.image == null ? null : (imageUrls[element.image] ?? null)} unit={unit} />,
          label: editorTexts.signatureElement(element.name),
        };
      case "qr":
        return { node: <FakeQr />, label: editorTexts.kinds.qr };
      case "line":
        return { node: <LineArt line={element} />, label: editorTexts.kinds.line };
      case "shape":
        return {
          node: <div className="size-full" style={{ background: element.color, opacity: element.opacity, borderRadius: u(element.radiusMm) }} />,
          label: editorTexts.kinds.shape,
        };
      case "seal":
        return { node: <SealArt seal={element} fields={fields} unit={unit} />, label: editorTexts.kinds.seal };
    }
  };

  const groupBounds = editable && selected.length > 1 ? boundsOf(selected.flatMap((index) => boxes[index] ?? [])) : null;
  const backgroundUrl = page.backgroundImage == null ? null : (imageUrls[page.backgroundImage] ?? null);

  return (
    <div
      ref={root}
      className={cn("relative w-full overflow-visible select-none [container-type:inline-size]", className)}
      style={{ aspectRatio: `${String(W)} / ${String(H)}` }}
      data-certificate-page={editable ? "" : undefined}
    >
      {/* The paper, clipped to the page; the elements above it keep their handles outside. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ background: page.backgroundColor }}>
        {backgroundUrl !== null && (
          // eslint-disable-next-line @next/next/no-img-element -- object URL of an uploaded background
          <img src={backgroundUrl} alt="" draggable={false} className="absolute inset-0 size-full object-cover" />
        )}
        {page.frame != null && <FrameArt frame={page.frame} width={W} height={H} />}
      </div>
      {page.elements.map((element, index) => {
        const shown = drawn(element);
        if (shown === null) {
          return null;
        }
        const box = boxes[index];
        if (box === undefined) {
          return null;
        }
        const chosen = isSelected(index);
        const invalid = problems.includes(index);
        return (
          <div
            key={index}
            role={editable ? "button" : undefined}
            tabIndex={editable ? 0 : undefined}
            aria-label={editable ? shown.label : undefined}
            aria-pressed={editable ? chosen : undefined}
            onPointerDown={(pointer) => {
              startMove(pointer, index);
            }}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onFocus={() => {
              if (editable && !chosen) {
                onSelect?.([index]);
              }
            }}
            className={cn(
              "absolute",
              element.kind === "qr" && "bg-white",
              editable && "cursor-move touch-none outline-offset-0 select-none focus-visible:outline-2 focus-visible:outline-brand",
              editable && !chosen && "hover:outline-1 hover:outline-brand/70 hover:outline-dashed",
              chosen && "z-20 outline-brand outline-solid",
              chosen && (single ? "outline-2" : "outline-1"),
              invalid && !chosen && "outline-2 outline-danger outline-dashed",
            )}
            style={{ left: u(box.x), top: u(box.y), width: u(box.width), height: u(box.height) }}
          >
            {shown.node}
            {editable && chosen && single && (
              <span
                role="presentation"
                title={t.resize}
                onPointerDown={(pointer) => {
                  startResize(pointer, index);
                }}
                className="touch-target absolute -right-1.5 -bottom-1.5 size-3 cursor-nwse-resize touch-none rounded-[3px] border-2 border-surface bg-brand-solid shadow-sm ring-1 ring-brand/40 pointer-coarse:-right-2 pointer-coarse:-bottom-2 pointer-coarse:size-4"
              />
            )}
          </div>
        );
      })}
      {brand !== null && (
        <CertificateBrand
          style={brand}
          paper={page.backgroundColor}
          u={u}
          position={brandPosition}
          {...(editable && onBrandMove !== undefined
            ? { onPointerDown: startBrand, onPointerMove: moveBrand, onPointerUp: endBrand, title: t.moveBrand }
            : {})}
        />
      )}
      {editable && (
        <>
          {groupBounds !== null && (
            <div
              aria-hidden
              className="pointer-events-none absolute z-30 rounded-[2px] outline-2 outline-offset-2 outline-brand outline-dashed"
              style={{ left: u(groupBounds.x), top: u(groupBounds.y), width: u(groupBounds.width), height: u(groupBounds.height) }}
            />
          )}
          {dragView?.guides.map((guide) => (
            <span
              key={`${guide.axis}-${String(guide.at)}`}
              aria-hidden
              className="pointer-events-none absolute z-30 bg-accent"
              style={
                guide.axis === "x"
                  ? { left: u(guide.at), top: u(guide.from), height: u(guide.to - guide.from), width: 1, transform: "translateX(-0.5px)" }
                  : { top: u(guide.at), left: u(guide.from), width: u(guide.to - guide.from), height: 1, transform: "translateY(-0.5px)" }
              }
            />
          ))}
          {dragView !== null && (
            <span
              aria-hidden
              className="pointer-events-none absolute z-30 mt-1.5 -translate-x-1/2 rounded-md bg-fg px-1.5 py-0.5 text-[11px] leading-tight font-medium whitespace-nowrap text-bg tabular-nums shadow-sm"
              style={{ left: u(dragView.box.x + dragView.box.width / 2), top: u(dragView.box.y + dragView.box.height) }}
            >
              {dragView.mode === "move"
                ? t.readoutPosition(mmText(dragView.box.x), mmText(dragView.box.y))
                : t.readoutSize(mmText(dragView.box.width), mmText(dragView.box.height))}
            </span>
          )}
        </>
      )}
    </div>
  );
}

/** Where the brand goes: centred at the bottom, or centred on the point the editor saved. */
function brandPlacement(position: BrandPosition | null, u: (mm: number) => string): CSSProperties {
  return position === null
    ? { left: "50%", bottom: u(3), transform: "translateX(-50%)" }
    : { left: u(position.xMm), top: u(position.yMm), transform: "translate(-50%, -50%)" };
}

/**
 * "Emitido com Ingresso Impresso" on a page, in either style, with the geometry of
 * `templates/certificate.typ`; `u` turns millimetres into the container's units. With `onPointerDown`
 * it can be dragged (the editor, ADR 0118).
 */
export function CertificateBrand({
  style,
  paper,
  u,
  position = null,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  title,
}: {
  style: BrandStyle;
  paper: string;
  u: (mm: number) => string;
  position?: BrandPosition | null;
  onPointerDown?: (pointer: PointerEvent<HTMLSpanElement>) => void;
  onPointerMove?: (pointer: PointerEvent<HTMLSpanElement>) => void;
  onPointerUp?: () => void;
  title?: string;
}) {
  const movable = onPointerDown !== undefined;
  const common = {
    title,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
    className: cn(
      "absolute rounded-[0.35cqw] whitespace-nowrap",
      movable
        ? "z-30 cursor-move touch-none select-none hover:outline-1 hover:outline-brand/70 hover:outline-dashed"
        : "pointer-events-none",
      style === "mark" && "flex items-center",
    ),
  };
  if (style === "mark") {
    const ink = brandInk(paper);
    return (
      <span
        {...common}
        style={{ ...brandPlacement(position, u), padding: `${u(0.9)} ${u(2.6)}`, background: paper, gap: u(1.5), fontFamily: FONT_FAMILIES.sans, lineHeight: 1, color: ink }}
      >
        <span style={{ fontSize: u(5 * MM_PER_PT), letterSpacing: "0.14em", textTransform: "uppercase", opacity: 0.45 }}>{CERTIFICATE_BRAND_CAPTION}</span>
        <BrandMark ink={ink} height={u(3.8)} />
        <span style={{ fontSize: u(7.5 * MM_PER_PT), letterSpacing: "-0.01em", opacity: 0.58 }}>
          <span style={{ fontWeight: 700 }}>Ingresso</span> Impresso
        </span>
      </span>
    );
  }
  return (
    <span
      {...common}
      style={{
        ...brandPlacement(position, u),
        padding: `${u(1)} ${u(2.2)}`,
        background: "rgb(255 255 255 / 0.85)",
        color: "#6b6b78",
        fontFamily: FONT_FAMILIES.sans,
        fontSize: u(6.5 * MM_PER_PT),
        lineHeight: 1,
      }}
    >
      {CERTIFICATE_BRAND}
    </span>
  );
}
