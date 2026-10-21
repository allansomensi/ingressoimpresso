"use client";

import type { BandStyle, NumberStyle, SponsorStrip, TextAlign, TextBlock, TicketDesign } from "@ingressoimpresso/api-types";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from "react";

import { cn } from "@/lib/cn";
import {
  DRAG_THRESHOLD_PX,
  GRID_MM,
  SNAP_PX,
  boundsOf,
  clampDelta,
  designElements,
  elementBox,
  elementKey,
  guidesFor,
  moveBoxes,
  roundMm,
  roundTo,
  sameElement,
  snapMove,
  snapResize,
  type Box,
  type Guide,
  type TicketElement,
} from "@/lib/design-selection";
import { BLEED_MM, FONT_FAMILIES, FONTS_WITH_BOLD, MIN_QR_SIZE_MM, MM_PER_PT, bandRect, effectiveBand, inkFor } from "@/lib/design-rules";
import { ticketNumber } from "@/lib/format";
import { random } from "@/lib/templates/svg";
import { blockValue, type EventFields } from "@/lib/ticket-fields";
import { ticketCanvas as ticketCanvasTexts } from "@/texts/pt-BR/ticket-canvas";

const t = ticketCanvasTexts.labels;

/** One element placed in a new box, as the canvas reports moves and resizes. */
export interface ElementChange {
  element: TicketElement;
  box: Box;
}

/** Counts font loads, so text is measured again once a typeface arrives. */
export function useFontsVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const fonts = document.fonts;
    let alive = true;
    const bump = () => {
      if (alive) {
        setVersion((value) => value + 1);
      }
    };
    fonts.addEventListener("loadingdone", bump);
    void fonts.ready.then(bump);
    return () => {
      alive = false;
      fonts.removeEventListener("loadingdone", bump);
    };
  }, []);
  return version;
}

const JUSTIFY: Record<TextAlign, string> = { left: "flex-start", center: "center", right: "flex-end" };

/** Lines a laid-out text takes at `line-height: 1`. */
function linesOf(element: HTMLElement, em: number): number {
  return Math.max(1, Math.round(element.offsetHeight / em));
}

/**
 * `value` cut with "…" to at most `lines` lines, like `clamp` in templates/ticket.typ: the longest
 * start (whole grapheme clusters) that still fits, found with a binary search on `probe`, a hidden
 * copy of the text as wide as the box.
 */
function clampText(probe: HTMLElement, value: string, lines: number, em: number): string {
  probe.textContent = value;
  if (linesOf(probe, em) <= lines) {
    return value;
  }
  const chars = Array.from(new Intl.Segmenter("pt-BR", { granularity: "grapheme" }).segment(value), (part) => part.segment);
  let [low, high] = [0, chars.length];
  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2);
    probe.textContent = `${chars.slice(0, mid).join("")}…`;
    if (linesOf(probe, em) <= lines) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return `${chars.slice(0, low).join("").trim()}…`;
}

/**
 * Text shrunk (never enlarged) to fit its box, like `fit` and `clamp` in templates/ticket.typ:
 * one line, or up to `lines` lines cut with "…". Heights follow Typst's metrics (cap height and
 * 0.3 em leading), so the preview shrinks a text when the printed file would.
 *
 * Nothing is clipped, as on paper: a script capital's swash (the "J" of "Júlia") reaches past
 * its line, and cutting the text with `overflow: hidden` used to leave only a "(" of it. The
 * extra lines are cut from the text itself instead.
 */
export function FitText({ value, lines, align, style }: { value: string; lines: number; align: TextAlign; style: CSSProperties }) {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLDivElement>(null);
  const [fitted, setFitted] = useState({ scale: 1, shown: value });
  const fonts = useFontsVersion();
  const key = JSON.stringify([value, lines, style]);
  const multi = lines > 1;

  useLayoutEffect(() => {
    const outer = box.current;
    const text = inner.current;
    const copy = probe.current;
    if (outer === null || text === null) {
      return;
    }
    const measure = () => {
      const width = outer.clientWidth;
      const height = outer.clientHeight;
      const em = Number.parseFloat(getComputedStyle(text).fontSize);
      if (width === 0 || !(em > 0)) {
        return;
      }
      let shown = value;
      let rendered: number;
      let textWidth: number;
      if (multi && copy !== null) {
        shown = clampText(copy, value, lines, em);
        copy.textContent = shown;
        rendered = linesOf(copy, em);
        textWidth = width;
      } else {
        rendered = linesOf(text, em);
        textWidth = text.offsetWidth;
      }
      const textHeight = (rendered - 0.3) * em;
      const scale = Math.min(1, width / Math.max(textWidth, 0.01), height / Math.max(textHeight, 0.01));
      setFitted((current) => (current.shown === shown && Math.abs(current.scale - scale) < 0.002 ? current : { scale, shown }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(outer);
    return () => {
      observer.disconnect();
    };
  }, [key, value, lines, multi, fonts]);

  const wrapping: CSSProperties = { width: "100%", textAlign: align, overflowWrap: "anywhere" };
  return (
    <div ref={box} className="relative flex size-full items-center overflow-visible" style={{ justifyContent: JUSTIFY[align] }}>
      {multi && <div ref={probe} aria-hidden className="pointer-events-none invisible absolute top-0 left-0" style={{ ...style, ...wrapping, lineHeight: 1 }} />}
      <div
        ref={inner}
        style={{
          ...style,
          lineHeight: 1,
          transform: `scale(${String(fitted.scale)})`,
          transformOrigin: `${align} center`,
          ...(multi ? { ...wrapping, flexShrink: 0 } : { whiteSpace: "pre", flexShrink: 0 }),
        }}
      >
        {multi ? fitted.shown : value}
      </div>
    </div>
  );
}

/** A fake QR code: looks like the real one (45 modules with the quiet zone), carries nothing. */
export function FakeQr() {
  const path = useMemo(() => {
    const next = random(42);
    const finder = (x: number, y: number) =>
      `M${String(x)} ${String(y)}h7v7h-7zM${String(x + 1)} ${String(y + 1)}v5h5v-5zM${String(x + 2)} ${String(y + 2)}h3v3h-3z`;
    let d = finder(4, 4) + finder(34, 4) + finder(4, 34) + "M32 32h5v5h-5zM33 33v3h3v-3zM34 34h1v1h-1z";
    const reserved = (x: number, y: number) =>
      (x < 12 && y < 12) || (x > 32 && y < 12) || (x < 12 && y > 32) || (x >= 31 && x <= 37 && y >= 31 && y <= 37);
    for (let y = 4; y < 41; y += 1) {
      for (let x = 4; x < 41; x += 1) {
        if (!reserved(x, y) && next() < 0.48) {
          d += `M${String(x)} ${String(y)}h1v1h-1z`;
        }
      }
    }
    return d;
  }, []);
  return (
    <svg viewBox="0 0 45 45" className="block size-full" aria-hidden shapeRendering="crispEdges">
      <rect width="45" height="45" fill="#ffffff" />
      <path d={path} fill="#000000" fillRule="evenodd" />
    </svg>
  );
}

function numberLabel(number: NumberStyle, value: number): string {
  return `${number.prefix}${ticketNumber(value, Math.max(1, Math.min(10, Math.trunc(number.digits) || 1)))}`;
}

type Drag =
  | {
      mode: "move";
      /** Undo key of this gesture: the whole drag is one step. */
      gesture: string;
      items: ElementChange[];
      bounds: Box;
      targets: Box[];
      x: number;
      y: number;
      mmPerPx: number;
      moved: boolean;
      /** A press on an element of a group, without moving, selects just that element. */
      collapseTo: TicketElement | null;
    }
  | { mode: "resize"; gesture: string; element: TicketElement; start: Box; targets: Box[]; x: number; y: number; mmPerPx: number; moved: boolean };

/** What the canvas shows while dragging: smart guides and the position or size. */
interface DragView {
  guides: Guide[];
  box: Box;
  mode: Drag["mode"];
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));
const mmText = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

/**
 * A ticket drawn in the browser from its design: background, art, texts with their fields
 * replaced, number, a stand-in QR and the stub. With `onChange` it becomes the editor's canvas:
 * elements are selected (Shift, Ctrl or ⌘ add to the selection), dragged together with smart
 * guides (Alt turns them off) and resized one at a time.
 */
export function TicketView({
  design,
  event,
  artUrl,
  number = 1,
  className,
  selected = [],
  additive = false,
  problems = [],
  onSelect,
  onChange,
  tag = null,
  sponsorUrls = [],
}: {
  design: TicketDesign;
  event: EventFields;
  /** Art covering the body plus bleed (an object URL, or a data URL of a template's SVG). */
  artUrl: string | null;
  number?: number;
  className?: string | undefined;
  selected?: readonly TicketElement[];
  /** Presses add to or remove from the selection, as with Shift (the touch "select several" mode). */
  additive?: boolean;
  /** Elements to outline as invalid. */
  problems?: readonly TicketElement[];
  onSelect?: (elements: TicketElement[]) => void;
  /** Moves and resizes; every change of one gesture carries the same `gesture` key. */
  onChange?: (changes: ElementChange[], gesture: string) => void;
  /**
   * Category and seat of the ticket, drawn on its band (ADR 0056): `{ text: "Meia · Mesa 5…", color }`,
   * and the category's name for the `{categoria}` field (ADR 0084).
   */
  tag?: { text: string; color: string; category?: string | null; priceCents?: number | null } | null;
  /** Object URLs of the sponsors' logos, in order (ADR 0059). */
  sponsorUrls?: readonly string[];
}) {
  // `{categoria}` prints the ticket's category, known here from its band (ADR 0084), and `{preco}`
  // its own price when it has one, as the printed file does (`category_texts`, ADR 0080).
  const fields: EventFields =
    tag?.category === undefined
      ? event
      : { ...event, categoryName: tag.category, ...(tag.priceCents == null ? {} : { ticketPriceCents: tag.priceCents }) };
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [dragView, setDragView] = useState<DragView | null>(null);
  const gestures = useRef(0);
  const editable = onChange !== undefined;
  const stubWidth = design.stub?.widthMm ?? 0;
  const total = design.widthMm + stubWidth;
  const bodyX = design.stub?.side === "left" ? stubWidth : 0;
  const u = (mm: number) => `${String((mm / total) * 100)}cqw`;
  const pt = (size: number) => u(size * MM_PER_PT);
  const label = numberLabel(design.number, number);
  const band = tag === null ? null : effectiveBand(design);
  const area = { width: design.widthMm, height: design.heightMm };
  const isSelected = (element: TicketElement) => selected.some((item) => sameElement(item, element));
  const boxesOutside = (inside: readonly TicketElement[]) =>
    designElements(design)
      .filter((element) => !inside.some((item) => sameElement(item, element)))
      .map((element) => elementBox(design, element))
      .filter((box): box is Box => box !== null);

  const begin = (pointer: PointerEvent): number | null => {
    const width = root.current?.getBoundingClientRect().width ?? 0;
    if (!editable || width === 0 || pointer.button !== 0) {
      return null;
    }
    pointer.preventDefault();
    pointer.stopPropagation();
    // Keyboard shortcuts act on the canvas: a field left focused would keep the arrow keys.
    const active = document.activeElement;
    if (active instanceof HTMLElement && root.current?.contains(active) !== true) {
      active.blur();
    }
    (pointer.currentTarget as HTMLElement).setPointerCapture(pointer.pointerId);
    // A key of its own for this gesture: the whole drag becomes one undo step.
    gestures.current += 1;
    return total / width;
  };

  const startMove = (pointer: PointerEvent, element: TicketElement) => {
    const mmPerPx = begin(pointer);
    if (mmPerPx === null) {
      return;
    }
    const toggle = additive || pointer.shiftKey || pointer.ctrlKey || pointer.metaKey;
    const already = isSelected(element);
    if (toggle && already) {
      onSelect?.(selected.filter((item) => !sameElement(item, element)));
      return;
    }
    const group = toggle ? [...selected, element] : already ? [...selected] : [element];
    if (!already || toggle) {
      onSelect?.(group);
    }
    const items = group.flatMap((item) => {
      const box = elementBox(design, item);
      return box === null ? [] : [{ element: item, box }];
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
      collapseTo: already && !toggle && group.length > 1 ? element : null,
    };
  };

  const startResize = (pointer: PointerEvent, element: TicketElement) => {
    const box = elementBox(design, element);
    const mmPerPx = box === null ? null : begin(pointer);
    if (box === null || mmPerPx === null) {
      return;
    }
    drag.current = {
      mode: "resize",
      gesture: `drag-${String(gestures.current)}`,
      element,
      start: box,
      targets: boxesOutside([element]),
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
        current.items.map(({ element, box: start }) => ({ element, box: { ...start, x: roundMm(start.x + delta.dx), y: roundMm(start.y + delta.dy) } })),
        current.gesture,
      );
      return;
    }
    const { start, element } = current;
    let box: Box;
    if (element.kind === "qr") {
      const size = clamp(roundTo(start.width + Math.max(dx, dy), GRID_MM), MIN_QR_SIZE_MM, Math.min(design.widthMm - start.x, design.heightMm - start.y));
      box = { ...start, width: size, height: size };
    } else {
      let width = roundTo(start.width + dx, GRID_MM);
      let height = roundTo(start.height + dy, GRID_MM);
      if (guides) {
        ({ width, height } = snapResize({ ...start, width, height }, current.targets, area, threshold));
      }
      box = { ...start, width: roundMm(clamp(width, 2, design.widthMm - start.x)), height: roundMm(clamp(height, 2, design.heightMm - start.y)) };
    }
    setDragView({ mode: "resize", box, guides: guides && element.kind !== "qr" ? guidesFor(box, current.targets, area, "end") : [] });
    onChange([{ element, box }], current.gesture);
  };

  const endDrag = () => {
    const current = drag.current;
    drag.current = null;
    setDragView(null);
    if (current?.mode === "move" && !current.moved && current.collapseTo !== null) {
      onSelect?.([current.collapseTo]);
    }
  };

  const single = selected.length === 1;
  const frame = (element: TicketElement, box: Box, children: ReactNode, name: string, extra?: ReactNode) => {
    const chosen = isSelected(element);
    const invalid = problems.some((problem) => sameElement(problem, element));
    return (
      <div
        key={elementKey(element)}
        role={editable ? "button" : undefined}
        tabIndex={editable ? 0 : undefined}
        aria-label={editable ? name : undefined}
        aria-pressed={editable ? chosen : undefined}
        onPointerDown={(pointer) => {
          startMove(pointer, element);
        }}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onFocus={() => {
          // Presses do not focus elements, so this is the keyboard (Tab) reaching one.
          if (editable && !chosen) {
            onSelect?.([element]);
          }
        }}
        className={cn(
          "absolute",
          editable && "cursor-move touch-none outline-offset-0 select-none focus-visible:outline-2 focus-visible:outline-brand",
          editable && !chosen && "hover:outline-1 hover:outline-brand/70 hover:outline-dashed",
          chosen && "z-20 outline-brand outline-solid",
          chosen && (single ? "outline-2" : "outline-1"),
          invalid && !chosen && "outline-2 outline-danger outline-dashed",
        )}
        style={{ left: u(box.x), top: u(box.y), width: u(box.width), height: u(box.height) }}
      >
        {children}
        {extra}
        {editable && chosen && single && (
          <span
            role="presentation"
            title={t.resize}
            onPointerDown={(pointer) => {
              startResize(pointer, element);
            }}
            className="touch-target absolute -right-1.5 -bottom-1.5 size-3 cursor-nwse-resize touch-none rounded-[3px] border-2 border-surface bg-brand-solid shadow-sm ring-1 ring-brand/40 pointer-coarse:-right-2 pointer-coarse:-bottom-2 pointer-coarse:size-4"
          />
        )}
      </div>
    );
  };

  const groupBounds = editable && selected.length > 1 ? boundsOf(selected.map((element) => elementBox(design, element)).filter((box): box is Box => box !== null)) : null;
  const overlays = editable && (
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
  );

  const textStyle = (block: Pick<TextBlock, "font" | "sizePt" | "color" | "bold" | "letterSpacing">): CSSProperties => ({
    fontFamily: FONT_FAMILIES[block.font],
    fontSize: pt(block.sizePt),
    color: block.color,
    fontWeight: block.bold && FONTS_WITH_BOLD.includes(block.font) ? 700 : 400,
    letterSpacing: `${String(block.letterSpacing)}em`,
  });

  const n = design.number;
  const q = design.qr;
  const stub = design.stub;
  const stubX = stub?.side === "left" ? 0 : design.widthMm;

  return (
    <div
      ref={root}
      className={cn("relative w-full overflow-visible select-none [container-type:inline-size]", className)}
      style={{ aspectRatio: `${String(total)} / ${String(design.heightMm)}` }}
    >
      <div
        className="absolute inset-y-0 overflow-hidden"
        style={{ left: u(bodyX), width: u(design.widthMm), background: design.backgroundColor }}
      >
        {artUrl !== null && (
          // eslint-disable-next-line @next/next/no-img-element -- object or data URL drawn under the elements
          <img
            src={artUrl}
            alt=""
            draggable={false}
            className="pointer-events-none absolute max-w-none object-cover"
            style={{ left: u(-BLEED_MM), top: u(-BLEED_MM), width: u(design.widthMm + 2 * BLEED_MM), height: u(design.heightMm + 2 * BLEED_MM) }}
          />
        )}
      </div>
      {/* The editor finds the body by this attribute to turn marquee pixels into millimetres. */}
      <div className="absolute inset-y-0" style={{ left: u(bodyX), width: u(design.widthMm) }} data-ticket-body={editable ? "" : undefined}>
        {design.texts.map((block, index) => {
          const value = blockValue(block, fields);
          const element: TicketElement = { kind: "text", index };
          if (value === null && !editable) {
            return null;
          }
          return frame(
            element,
            { x: block.xMm, y: block.yMm, width: block.widthMm, height: block.heightMm },
            value === null ? (
              <span className="flex size-full items-center justify-center overflow-hidden border border-dashed border-black/30 bg-white/60 px-1 text-[10px] leading-none font-medium whitespace-nowrap text-black/60 italic">
                {t.hiddenText}
              </span>
            ) : (
              <FitText value={value} lines={block.lines} align={block.align} style={textStyle(block)} />
            ),
            t.textElement(value ?? block.text),
          );
        })}
        {frame(
          { kind: "number" },
          { x: n.xMm, y: n.yMm, width: n.widthMm, height: n.heightMm },
          <FitText value={label} lines={1} align={n.align} style={textStyle({ ...n, bold: false, letterSpacing: 0 })} />,
          t.numberElement,
        )}
        {design.sponsors != null &&
          (sponsorUrls.length > 0 || editable) &&
          frame(
            { kind: "sponsors" },
            { x: design.sponsors.xMm, y: design.sponsors.yMm, width: design.sponsors.widthMm, height: design.sponsors.heightMm },
            <Sponsors strip={design.sponsors} urls={sponsorUrls} u={u} />,
            t.sponsorsElement,
          )}
        {band !== null && tag !== null && <Band design={design} band={band} tag={tag} u={u} />}
        {frame({ kind: "qr" }, { x: q.xMm, y: q.yMm, width: q.sizeMm, height: q.sizeMm }, <FakeQr />, t.qrElement)}
        {overlays}
      </div>
      {stub !== null && (
        <>
          <div
            className="absolute inset-y-0 flex flex-col overflow-hidden bg-white text-black"
            style={{ left: u(stubX), width: u(stub.widthMm), padding: u(2.5), gap: u(1.6), fontFamily: FONT_FAMILIES.sans, fontSize: pt(6.5) }}
          >
            <div style={{ height: u(4) }}>
              <FitText
                value={tag === null ? label : `${label} · ${tag.text}`}
                lines={1}
                align="left"
                style={{ fontFamily: FONT_FAMILIES.mono, fontWeight: 700, fontSize: pt(10) }}
              />
            </div>
            <div className="line-clamp-2 font-bold" style={{ lineHeight: 1.15 }}>
              {event.name}
            </div>
            {stub.fields.map((field, index) => (
              <div key={`${field}-${String(index)}`} className="flex min-h-0 flex-1 flex-col justify-between">
                <span className="truncate" style={{ fontSize: pt(5.5) }}>
                  {field}
                </span>
                <span className="block" style={{ borderBottom: `${pt(0.4)} solid #787878` }} />
              </div>
            ))}
          </div>
          <div
            className="absolute inset-y-0"
            style={{ left: u(stub.side === "left" ? stub.widthMm : design.widthMm), borderLeft: `${pt(0.5)} dashed #8c8c8c` }}
          />
        </>
      )}
    </div>
  );
}

/** The category band (ticket.typ `band`): category and seat on one line along one edge. */
function Band({ design, band, tag, u }: { design: TicketDesign; band: BandStyle; tag: { text: string; color: string }; u: (mm: number) => string }) {
  const rect = bandRect(design, band.edge, band.sizeMm);
  const vertical = band.edge === "left" || band.edge === "right";
  const along = (vertical ? rect.height : rect.width) - band.sizeMm * 0.5;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute flex items-center justify-center overflow-hidden"
      style={{ left: u(rect.x), top: u(rect.y), width: u(rect.width), height: u(rect.height), background: tag.color }}
    >
      <div
        className="flex items-center justify-center"
        style={{ width: u(along), height: u(band.sizeMm * 0.62), transform: vertical ? "rotate(-90deg)" : undefined, flexShrink: 0 }}
      >
        <FitText
          value={tag.text.toUpperCase()}
          lines={1}
          align="center"
          style={{ fontFamily: FONT_FAMILIES.sans, fontWeight: 700, fontSize: u(band.sizeMm * 0.5), color: inkFor(tag.color), letterSpacing: "0.04em" }}
        />
      </div>
    </div>
  );
}

/** The sponsors' strip (ticket.typ `sponsors`): label, then logos side by side, fitted. */
function Sponsors({ strip, urls, u }: { strip: SponsorStrip; urls: readonly string[]; u: (mm: number) => string }) {
  const labelHeight = strip.label === "" ? 0 : Math.min(strip.heightMm * 0.3, 3.2);
  const pad = strip.panel ? Math.min(1, strip.heightMm * 0.1) : 0;
  const gap = urls.length === 0 ? 0 : Math.min(2, strip.widthMm / (4 * urls.length));
  return (
    <div
      className="flex size-full flex-col overflow-hidden"
      style={{ padding: u(pad), gap: labelHeight > 0 ? u(0.6) : 0, background: strip.panel ? "#ffffff" : undefined, borderRadius: strip.panel ? u(1) : 0 }}
    >
      {labelHeight > 0 && (
        <div className="shrink-0" style={{ height: u(labelHeight) }}>
          <FitText
            value={strip.label.toUpperCase()}
            lines={1}
            align="center"
            style={{ fontFamily: FONT_FAMILIES.sans, fontWeight: 700, fontSize: u(labelHeight), color: strip.labelColor, letterSpacing: "0.06em" }}
          />
        </div>
      )}
      <div className="flex min-h-0 flex-1 items-stretch" style={{ gap: u(gap) }}>
        {urls.length === 0 ? (
          <span className="flex flex-1 items-center justify-center border border-dashed border-black/30 bg-white/60 text-[10px] font-medium text-black/60 italic">
            {ticketCanvasTexts.sponsorsEmpty}
          </span>
        ) : (
          urls.map((url, index) => (
            // eslint-disable-next-line @next/next/no-img-element -- object URL of an uploaded logo
            <img key={`${url}-${String(index)}`} src={url} alt="" draggable={false} className="pointer-events-none min-w-0 flex-1 object-contain" />
          ))
        )}
      </div>
    </div>
  );
}
