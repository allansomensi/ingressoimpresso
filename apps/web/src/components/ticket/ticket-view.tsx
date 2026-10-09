"use client";

import type { NumberStyle, TextAlign, TextBlock, TicketDesign } from "@ingressoimpresso/api-types";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

import { cn } from "@/lib/cn";
import { BLEED_MM, FONT_FAMILIES, FONTS_WITH_BOLD, MIN_QR_SIZE_MM, MM_PER_PT } from "@/lib/design-rules";
import { ticketNumber } from "@/lib/format";
import { random } from "@/lib/templates/svg";
import { blockValue, type EventFields } from "@/lib/ticket-fields";
import { texts } from "@/texts/pt-BR";

const t = texts.event.design.canvas;

/** An element of the body the editor can select, move and resize. */
export type TicketElement = { kind: "number" } | { kind: "qr" } | { kind: "text"; index: number };

/** A box in millimetres, relative to the body. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function sameElement(a: TicketElement | null, b: TicketElement | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return a.kind === b.kind && (a.kind !== "text" || (b.kind === "text" && a.index === b.index));
}

export function elementBox(design: TicketDesign, element: TicketElement): Box | null {
  if (element.kind === "number") {
    const n = design.number;
    return { x: n.xMm, y: n.yMm, width: n.widthMm, height: n.heightMm };
  }
  if (element.kind === "qr") {
    const q = design.qr;
    return { x: q.xMm, y: q.yMm, width: q.sizeMm, height: q.sizeMm };
  }
  const block = design.texts[element.index];
  return block === undefined ? null : { x: block.xMm, y: block.yMm, width: block.widthMm, height: block.heightMm };
}

/** Counts font loads, so text is measured again once a typeface arrives. */
function useFontsVersion(): number {
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

/**
 * Text shrunk (never enlarged) to fit its box, like `fit` and `clamp` in templates/ticket.typ:
 * one line, or up to `lines` lines cut with "…". Heights follow Typst's metrics (cap height and
 * 0.3 em leading), so the preview shrinks a text when the printed file would.
 */
function FitText({ value, lines, align, style }: { value: string; lines: number; align: TextAlign; style: CSSProperties }) {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const fonts = useFontsVersion();
  const key = JSON.stringify([value, lines, style]);

  useLayoutEffect(() => {
    const outer = box.current;
    const text = inner.current;
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
      const rendered = Math.max(1, Math.round(text.offsetHeight / em));
      const textHeight = (rendered - 0.3) * em;
      const textWidth = lines === 1 ? text.offsetWidth : width;
      const next = Math.min(1, width / Math.max(textWidth, 0.01), height / Math.max(textHeight, 0.01));
      setScale((current) => (Math.abs(current - next) < 0.002 ? current : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(outer);
    return () => {
      observer.disconnect();
    };
  }, [key, lines, fonts]);

  const multi = lines > 1;
  return (
    <div ref={box} className="flex size-full items-center overflow-visible" style={{ justifyContent: JUSTIFY[align] }}>
      <div
        ref={inner}
        style={{
          ...style,
          lineHeight: 1,
          transform: `scale(${String(scale)})`,
          transformOrigin: `${align} center`,
          ...(multi
            ? {
                width: "100%",
                flexShrink: 0,
                textAlign: align,
                display: "-webkit-box",
                WebkitBoxOrient: "vertical",
                WebkitLineClamp: lines,
                overflow: "hidden",
                overflowWrap: "anywhere",
              }
            : { whiteSpace: "pre", flexShrink: 0 }),
        }}
      >
        {value}
      </div>
    </div>
  );
}

/** A fake QR code: looks like the real one (45 modules with the quiet zone), carries nothing. */
function FakeQr() {
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

type Drag = { element: TicketElement; mode: "move" | "resize"; x: number; y: number; start: Box; mmPerPx: number };

const snap = (value: number) => Math.round(value * 2) / 2;
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

/**
 * A ticket drawn in the browser from its design: background, art, texts with their fields
 * replaced, number, a stand-in QR and the stub. With `onChange` it becomes the editor's canvas:
 * elements are selected, dragged and resized with the pointer or moved with the arrow keys.
 */
export function TicketView({
  design,
  event,
  artUrl,
  number = 1,
  className,
  selected = null,
  problems = [],
  onSelect,
  onChange,
  onRemove,
}: {
  design: TicketDesign;
  event: EventFields;
  /** Art covering the body plus bleed (an object URL, or a data URL of a template's SVG). */
  artUrl: string | null;
  number?: number;
  className?: string | undefined;
  selected?: TicketElement | null;
  /** Elements to outline as invalid. */
  problems?: readonly TicketElement[];
  onSelect?: (element: TicketElement | null) => void;
  onChange?: (element: TicketElement, box: Box) => void;
  onRemove?: (element: TicketElement) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const editable = onChange !== undefined;
  const stubWidth = design.stub?.widthMm ?? 0;
  const total = design.widthMm + stubWidth;
  const bodyX = design.stub?.side === "left" ? stubWidth : 0;
  const u = (mm: number) => `${String((mm / total) * 100)}cqw`;
  const pt = (size: number) => u(size * MM_PER_PT);
  const label = numberLabel(design.number, number);

  const startDrag = (pointer: PointerEvent, element: TicketElement, mode: Drag["mode"]) => {
    const box = elementBox(design, element);
    const width = root.current?.getBoundingClientRect().width ?? 0;
    if (!editable || box === null || width === 0) {
      return;
    }
    pointer.preventDefault();
    pointer.stopPropagation();
    (pointer.currentTarget as HTMLElement).setPointerCapture(pointer.pointerId);
    onSelect?.(element);
    drag.current = { element, mode, x: pointer.clientX, y: pointer.clientY, start: box, mmPerPx: total / width };
  };

  const moveDrag = (pointer: PointerEvent) => {
    const current = drag.current;
    if (current === null || onChange === undefined) {
      return;
    }
    const dx = (pointer.clientX - current.x) * current.mmPerPx;
    const dy = (pointer.clientY - current.y) * current.mmPerPx;
    const { start } = current;
    if (current.mode === "move") {
      onChange(current.element, {
        ...start,
        x: clamp(snap(start.x + dx), 0, design.widthMm - start.width),
        y: clamp(snap(start.y + dy), 0, design.heightMm - start.height),
      });
    } else if (current.element.kind === "qr") {
      const size = clamp(snap(start.width + Math.max(dx, dy)), MIN_QR_SIZE_MM, Math.min(design.widthMm - start.x, design.heightMm - start.y));
      onChange(current.element, { ...start, width: size, height: size });
    } else {
      onChange(current.element, {
        ...start,
        width: clamp(snap(start.width + dx), 2, design.widthMm - start.x),
        height: clamp(snap(start.height + dy), 2, design.heightMm - start.y),
      });
    }
  };

  const endDrag = () => {
    drag.current = null;
  };

  const keyDown = (key: KeyboardEvent, element: TicketElement) => {
    const box = elementBox(design, element);
    if (onChange === undefined || box === null) {
      return;
    }
    const step = key.shiftKey ? 5 : 0.5;
    const moves: Partial<Record<string, [number, number]>> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[key.key];
    if (move !== undefined) {
      key.preventDefault();
      onChange(element, {
        ...box,
        x: clamp(snap(box.x + move[0]), 0, design.widthMm - box.width),
        y: clamp(snap(box.y + move[1]), 0, design.heightMm - box.height),
      });
    } else if ((key.key === "Delete" || key.key === "Backspace") && element.kind === "text" && onRemove !== undefined) {
      key.preventDefault();
      onRemove(element);
    } else if (key.key === "Escape") {
      onSelect?.(null);
    }
  };

  const frame = (element: TicketElement, box: Box, children: ReactNode, name: string, extra?: ReactNode) => {
    const isSelected = sameElement(selected, element);
    const invalid = problems.some((problem) => sameElement(problem, element));
    return (
      <div
        key={element.kind === "text" ? `text-${String(element.index)}` : element.kind}
        role={editable ? "button" : undefined}
        tabIndex={editable ? 0 : undefined}
        aria-label={editable ? name : undefined}
        aria-pressed={editable ? isSelected : undefined}
        onPointerDown={(pointer) => {
          startDrag(pointer, element, "move");
        }}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={(key) => {
          keyDown(key, element);
        }}
        onFocus={() => {
          if (editable && !isSelected) {
            onSelect?.(element);
          }
        }}
        className={cn(
          "absolute",
          editable && "cursor-move touch-none outline-offset-0 select-none focus-visible:outline-2 focus-visible:outline-brand",
          editable && !isSelected && "hover:outline-1 hover:outline-brand/70 hover:outline-dashed",
          isSelected && "z-20 outline-2 outline-brand outline-solid",
          invalid && !isSelected && "outline-2 outline-danger outline-dashed",
        )}
        style={{ left: u(box.x), top: u(box.y), width: u(box.width), height: u(box.height) }}
      >
        {children}
        {extra}
        {editable && isSelected && (
          <span
            role="presentation"
            onPointerDown={(pointer) => {
              startDrag(pointer, element, "resize");
            }}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className="absolute -right-1.5 -bottom-1.5 size-3 cursor-nwse-resize touch-none rounded-[3px] border-2 border-white bg-brand shadow"
          />
        )}
      </div>
    );
  };

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
      <div
        className="absolute inset-y-0"
        style={{ left: u(bodyX), width: u(design.widthMm) }}
        onPointerDown={() => {
          // A press on the background (elements stop their own presses) clears the selection.
          if (editable) {
            onSelect?.(null);
          }
        }}
      >
        {design.texts.map((block, index) => {
          const value = blockValue(block, event);
          const element: TicketElement = { kind: "text", index };
          if (value === null && !editable) {
            return null;
          }
          return frame(
            element,
            { x: block.xMm, y: block.yMm, width: block.widthMm, height: block.heightMm },
            value === null ? (
              <span className="flex size-full items-center justify-center bg-surface/40 text-[10px] font-medium text-fg-muted italic">
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
        {frame({ kind: "qr" }, { x: q.xMm, y: q.yMm, width: q.sizeMm, height: q.sizeMm }, <FakeQr />, t.qrElement)}
      </div>
      {stub !== null && (
        <>
          <div
            className="absolute inset-y-0 flex flex-col overflow-hidden bg-white text-black"
            style={{ left: u(stubX), width: u(stub.widthMm), padding: u(2.5), gap: u(1.6), fontFamily: FONT_FAMILIES.sans, fontSize: pt(6.5) }}
          >
            <div style={{ height: u(4) }}>
              <FitText value={label} lines={1} align="left" style={{ fontFamily: FONT_FAMILIES.mono, fontWeight: 700, fontSize: pt(10) }} />
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
