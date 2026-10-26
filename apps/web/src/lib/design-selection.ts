/**
 * Geometry of the ticket editor's selection: which elements a design has, hit testing for the
 * marquee, moving a group inside the body, aligning, distributing and snapping (smart guides).
 * Everything is in millimetres, relative to the body (the stub is not part of it). Pure: no DOM.
 */

import type { TicketDesign } from "@ingressoimpresso/api-types";

/** An element of the body the editor can select, move and resize. */
export type TicketElement =
  | { kind: "number" }
  | { kind: "qr" }
  | { kind: "sponsors" }
  | { kind: "photo"; index: number }
  | { kind: "text"; index: number };

/** A box in millimetres, relative to the body. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The body's size: what elements must stay inside of. */
export interface Area {
  width: number;
  height: number;
}

export type AlignEdge = "left" | "center" | "right" | "top" | "middle" | "bottom";
export type Axis = "x" | "y";

/**
 * A smart guide: on axis `x`, a vertical line at `x = at` from `y = from` to `y = to`; on axis `y`,
 * a horizontal line at `y = at` from `x = from` to `x = to`.
 */
export interface Guide {
  axis: Axis;
  at: number;
  from: number;
  to: number;
}

/** Movements of the pointer below this many pixels are a click, not a drag. */
export const DRAG_THRESHOLD_PX = 3;
/** How close, in pixels, an edge or centre must come to a guide to stick to it. */
export const SNAP_PX = 6;
/** Positions without a guide land on this grid (mm). */
export const GRID_MM = 0.5;
/** Arrow keys move this much (mm): plain, with Shift, with Alt. */
export const NUDGE_MM = { normal: 1, large: 10, fine: 0.1 } as const;

const EPSILON = 1e-6;

export function sameElement(a: TicketElement | null, b: TicketElement | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  if (a.kind === "text" || a.kind === "photo") {
    return b.kind === a.kind && a.index === b.index;
  }
  return a.kind === b.kind;
}

/** A stable key for lists and undo steps: `text-2`, `photo-0`, `number`, `qr`, `sponsors`. */
export function elementKey(element: TicketElement): string {
  return element.kind === "text" || element.kind === "photo" ? `${element.kind}-${String(element.index)}` : element.kind;
}

/** Every element of the design, in the editor's order (photos, texts, number, QR, sponsors). */
export function designElements(design: TicketDesign): TicketElement[] {
  return [
    ...design.photos.map((_, index): TicketElement => ({ kind: "photo", index })),
    ...design.texts.map((_, index): TicketElement => ({ kind: "text", index })),
    { kind: "number" },
    { kind: "qr" },
    ...(design.sponsors == null ? [] : [{ kind: "sponsors" } as const]),
  ];
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
  if (element.kind === "sponsors") {
    const strip = design.sponsors ?? null;
    return strip === null ? null : { x: strip.xMm, y: strip.yMm, width: strip.widthMm, height: strip.heightMm };
  }
  if (element.kind === "photo") {
    const photo = design.photos[element.index];
    return photo === undefined ? null : { x: photo.xMm, y: photo.yMm, width: photo.widthMm, height: photo.heightMm };
  }
  const block = design.texts[element.index];
  return block === undefined ? null : { x: block.xMm, y: block.yMm, width: block.widthMm, height: block.heightMm };
}

/** The design with `element` placed in `box` (the QR stays square: its size is the box's width). */
export function withBox(design: TicketDesign, element: TicketElement, box: Box): TicketDesign {
  if (element.kind === "number") {
    return { ...design, number: { ...design.number, xMm: box.x, yMm: box.y, widthMm: box.width, heightMm: box.height } };
  }
  if (element.kind === "qr") {
    return { ...design, qr: { xMm: box.x, yMm: box.y, sizeMm: box.width } };
  }
  if (element.kind === "sponsors") {
    const strip = design.sponsors ?? null;
    return strip === null ? design : { ...design, sponsors: { ...strip, xMm: box.x, yMm: box.y, widthMm: box.width, heightMm: box.height } };
  }
  if (element.kind === "photo") {
    return {
      ...design,
      photos: design.photos.map((photo, index) =>
        index === element.index ? { ...photo, xMm: box.x, yMm: box.y, widthMm: box.width, heightMm: box.height } : photo,
      ),
    };
  }
  return {
    ...design,
    texts: design.texts.map((block, index) =>
      index === element.index ? { ...block, xMm: box.x, yMm: box.y, widthMm: box.width, heightMm: box.height } : block,
    ),
  };
}

/** Only the elements the design still has (an undo may have removed a text), without repeats. */
export function existingSelection(design: TicketDesign, selection: readonly TicketElement[]): TicketElement[] {
  const kept: TicketElement[] = [];
  for (const element of selection) {
    if (elementBox(design, element) !== null && !kept.some((item) => sameElement(item, element))) {
      kept.push(element);
    }
  }
  return kept;
}

/** `selection` with `element` added, or removed if it was there (Shift-click). */
export function toggleElement(selection: readonly TicketElement[], element: TicketElement): TicketElement[] {
  return selection.some((item) => sameElement(item, element))
    ? selection.filter((item) => !sameElement(item, element))
    : [...selection, element];
}

/** Rounds to hundredths of a millimetre, so sums of floats do not leave 12.299999. */
export function roundMm(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Rounds to the nearest multiple of `step`. */
export function roundTo(value: number, step: number): number {
  return roundMm(Math.round(value / step) * step);
}

/** The smallest box around all of `boxes`, or null when there are none. */
export function boundsOf(boxes: readonly Box[]): Box | null {
  if (boxes.length === 0) {
    return null;
  }
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** The box between two corners, in any order (a marquee dragged up or left). */
export function rectBetween(ax: number, ay: number, bx: number, by: number): Box {
  return { x: Math.min(ax, bx), y: Math.min(ay, by), width: Math.abs(bx - ax), height: Math.abs(by - ay) };
}

/** Whether two boxes share some area or touch. */
export function intersects(a: Box, b: Box): boolean {
  return a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height;
}

/** The items whose box the marquee touches, in their order. */
export function hitTest<T>(marquee: Box, items: readonly { item: T; box: Box }[]): T[] {
  return items.filter(({ box }) => intersects(marquee, box)).map(({ item }) => item);
}

/**
 * The part of a move by `(dx, dy)` that keeps `boxes` (as a group) inside `area`. A group already
 * outside is pulled back in, like a single element.
 */
export function clampDelta(boxes: readonly Box[], dx: number, dy: number, area: Area): { dx: number; dy: number } {
  const bounds = boundsOf(boxes);
  if (bounds === null) {
    return { dx: 0, dy: 0 };
  }
  const limit = (delta: number, start: number, size: number, room: number) => {
    const min = -start;
    const max = room - start - size;
    return Math.min(Math.max(delta, min), Math.max(min, max));
  };
  return { dx: roundMm(limit(dx, bounds.x, bounds.width, area.width)), dy: roundMm(limit(dy, bounds.y, bounds.height, area.height)) };
}

/** `boxes` moved by `(dx, dy)`. */
export function moveBoxes(boxes: readonly Box[], dx: number, dy: number): Box[] {
  return boxes.map((box) => ({ ...box, x: roundMm(box.x + dx), y: roundMm(box.y + dy) }));
}

/**
 * Lines `boxes` up on one edge or centre of `frame`: the selection's bounds when several are
 * aligned with each other, or the body when a single element is aligned to the ticket.
 */
export function alignBoxes(boxes: readonly Box[], edge: AlignEdge, frame: Box): Box[] {
  return boxes.map((box) => {
    switch (edge) {
      case "left":
        return { ...box, x: roundMm(frame.x) };
      case "center":
        return { ...box, x: roundMm(frame.x + (frame.width - box.width) / 2) };
      case "right":
        return { ...box, x: roundMm(frame.x + frame.width - box.width) };
      case "top":
        return { ...box, y: roundMm(frame.y) };
      case "middle":
        return { ...box, y: roundMm(frame.y + (frame.height - box.height) / 2) };
      case "bottom":
        return { ...box, y: roundMm(frame.y + frame.height - box.height) };
    }
  });
}

/**
 * Spreads three or more boxes so the gaps between neighbours are equal, keeping the first and the
 * last (by position) where they are. Returns the boxes in the input order; fewer than three are
 * returned unchanged.
 */
export function distributeBoxes(boxes: readonly Box[], axis: Axis): Box[] {
  if (boxes.length < 3) {
    return boxes.map((box) => ({ ...box }));
  }
  const start = (box: Box) => (axis === "x" ? box.x : box.y);
  const size = (box: Box) => (axis === "x" ? box.width : box.height);
  const order = boxes.map((box, index) => ({ box, index })).sort((a, b) => start(a.box) - start(b.box) || a.index - b.index);
  const first = order[0];
  const last = order.at(-1);
  if (first === undefined || last === undefined) {
    return boxes.map((box) => ({ ...box }));
  }
  const span = start(last.box) + size(last.box) - start(first.box);
  const filled = order.reduce((sum, { box }) => sum + size(box), 0);
  const gap = (span - filled) / (order.length - 1);
  const result = boxes.map((box) => ({ ...box }));
  let cursor = start(first.box);
  for (const { box, index } of order) {
    const placed = roundMm(cursor);
    result[index] = axis === "x" ? { ...box, x: placed } : { ...box, y: placed };
    cursor += size(box) + gap;
  }
  return result;
}

/** Which points of the moving box take part: all three (move) or only the far edge (resize). */
export type SnapPoints = "all" | "end";

/** The lines elements stick to on one axis: the body's edges and centre, and the targets'. */
function stops(targets: readonly Box[], area: Area, axis: Axis): { at: number; box: Box | null }[] {
  const size = axis === "x" ? area.width : area.height;
  const own = [0, size / 2, size].map((at) => ({ at, box: null }));
  const theirs = targets.flatMap((box) => {
    const start = axis === "x" ? box.x : box.y;
    const length = axis === "x" ? box.width : box.height;
    return [start, start + length / 2, start + length].map((at) => ({ at, box }));
  });
  return [...own, ...theirs];
}

function points(box: Box, axis: Axis, which: SnapPoints): number[] {
  const start = axis === "x" ? box.x : box.y;
  const length = axis === "x" ? box.width : box.height;
  return which === "end" ? [start + length] : [start, start + length / 2, start + length];
}

/** The smallest shift (within `threshold`) that puts one of the box's points on a stop, or 0. */
function nearest(box: Box, targets: readonly Box[], area: Area, threshold: number, axis: Axis, which: SnapPoints): number {
  let best: number | null = null;
  for (const point of points(box, axis, which)) {
    for (const { at } of stops(targets, area, axis)) {
      const shift = at - point;
      if (Math.abs(shift) <= threshold && (best === null || Math.abs(shift) < Math.abs(best) - EPSILON)) {
        best = shift;
      }
    }
  }
  return best ?? 0;
}

/**
 * How far to shift a box being dragged so its edges or centre stick to the nearest guide (the
 * body's edges and centre, the other elements' edges and centres) within `threshold` mm.
 */
export function snapMove(box: Box, targets: readonly Box[], area: Area, threshold: number): { dx: number; dy: number } {
  return { dx: nearest(box, targets, area, threshold, "x", "all"), dy: nearest(box, targets, area, threshold, "y", "all") };
}

/** The size a box being resized from its bottom-right corner takes when that corner sticks to a guide. */
export function snapResize(box: Box, targets: readonly Box[], area: Area, threshold: number): { width: number; height: number } {
  return {
    width: box.width + nearest(box, targets, area, threshold, "x", "end"),
    height: box.height + nearest(box, targets, area, threshold, "y", "end"),
  };
}

/**
 * The guides to draw for a box: every stop one of its points lies on. A body guide spans the
 * whole ticket; a guide from another element spans both boxes.
 */
export function guidesFor(box: Box, targets: readonly Box[], area: Area, which: SnapPoints = "all"): Guide[] {
  const guides: Guide[] = [];
  for (const axis of ["x", "y"] as const) {
    const across = axis === "x" ? area.height : area.width;
    for (const point of points(box, axis, which)) {
      for (const stop of stops(targets, area, axis)) {
        if (Math.abs(stop.at - point) > EPSILON) {
          continue;
        }
        const span = stop.box === null ? { from: 0, to: across } : spanOf(box, stop.box, axis);
        const at = roundMm(stop.at);
        const same = guides.find((guide) => guide.axis === axis && Math.abs(guide.at - at) < EPSILON);
        if (same === undefined) {
          guides.push({ axis, at, ...span });
        } else {
          same.from = Math.min(same.from, span.from);
          same.to = Math.max(same.to, span.to);
        }
      }
    }
  }
  return guides;
}

/** Where a guide between two boxes runs, across the axis it marks. */
function spanOf(a: Box, b: Box, axis: Axis): { from: number; to: number } {
  return axis === "x"
    ? { from: Math.min(a.y, b.y), to: Math.max(a.y + a.height, b.y + b.height) }
    : { from: Math.min(a.x, b.x), to: Math.max(a.x + a.width, b.x + b.width) };
}
