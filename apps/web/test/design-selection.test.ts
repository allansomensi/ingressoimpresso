import type { TicketDesign } from "@ingressoimpresso/api-types";
import { describe, expect, it } from "vitest";

import {
  alignBoxes,
  boundsOf,
  clampDelta,
  designElements,
  distributeBoxes,
  elementBox,
  elementKey,
  existingSelection,
  guidesFor,
  hitTest,
  intersects,
  moveBoxes,
  rectBetween,
  roundTo,
  sameElement,
  snapMove,
  snapResize,
  toggleElement,
  withBox,
  type Box,
  type TicketElement,
} from "@/lib/design-selection";

const design: TicketDesign = {
  version: 1,
  widthMm: 150,
  heightMm: 55,
  backgroundColor: "#ffffff",
  number: { xMm: 6, yMm: 4, widthMm: 60, heightMm: 12, font: "display", sizePt: 24, color: "#111111", align: "left", prefix: "Nº ", digits: 4 },
  qr: { xMm: 117, yMm: 14.5, sizeMm: 28 },
  stub: null,
  texts: [
    {
      text: "{evento}",
      xMm: 6,
      yMm: 20,
      widthMm: 80,
      heightMm: 10,
      font: "sans",
      sizePt: 16,
      color: "#111111",
      align: "left",
      lines: 1,
      bold: true,
      uppercase: false,
      letterSpacing: 0,
    },
  ],
  band: null,
  sponsors: null,
  photos: [],
};
const area = { width: 150, height: 55 };
const box = (x: number, y: number, width: number, height: number): Box => ({ x, y, width, height });

describe("elements of a design", () => {
  it("lists texts, number and QR, and sponsors only when the strip exists", () => {
    expect(designElements(design)).toEqual([{ kind: "text", index: 0 }, { kind: "number" }, { kind: "qr" }]);
    const withStrip = { ...design, sponsors: { xMm: 5, yMm: 40, widthMm: 50, heightMm: 10, label: "", labelColor: "#555555", panel: false } };
    expect(designElements(withStrip).at(-1)).toEqual({ kind: "sponsors" });
  });

  it("lists photos first: they lie under everything else", () => {
    const withPhoto = { ...design, photos: [{ xMm: 5, yMm: 5, widthMm: 20, heightMm: 20, fit: "cover", shape: "square" } as const] };
    expect(designElements(withPhoto)[0]).toEqual({ kind: "photo", index: 0 });
    expect(elementKey({ kind: "photo", index: 0 })).toBe("photo-0");
    expect(sameElement({ kind: "photo", index: 0 }, { kind: "text", index: 0 })).toBe(false);
    const moved = withBox(withPhoto, { kind: "photo", index: 0 }, box(1, 2, 30, 40));
    expect(elementBox(moved, { kind: "photo", index: 0 })).toEqual(box(1, 2, 30, 40));
    expect(moved.photos[0]?.fit).toBe("cover");
  });

  it("drops elements that are gone and repeats from a selection", () => {
    const selection: TicketElement[] = [{ kind: "text", index: 3 }, { kind: "qr" }, { kind: "qr" }, { kind: "sponsors" }];
    expect(existingSelection(design, selection)).toEqual([{ kind: "qr" }]);
  });

  it("toggles an element in and out of the selection", () => {
    const one = toggleElement([], { kind: "qr" });
    expect(one).toEqual([{ kind: "qr" }]);
    expect(toggleElement(one, { kind: "number" })).toEqual([{ kind: "qr" }, { kind: "number" }]);
    expect(toggleElement(one, { kind: "qr" })).toEqual([]);
  });

  it("places boxes back into the design, keeping the QR square", () => {
    const moved = withBox(design, { kind: "qr" }, box(10, 10, 30, 30));
    expect(moved.qr).toEqual({ xMm: 10, yMm: 10, sizeMm: 30 });
    const text = withBox(design, { kind: "text", index: 0 }, box(1, 2, 3, 4));
    expect(elementBox(text, { kind: "text", index: 0 })).toEqual(box(1, 2, 3, 4));
    expect(text.texts[0]?.text).toBe("{evento}");
  });
});

describe("marquee", () => {
  it("normalizes a rectangle dragged in any direction", () => {
    expect(rectBetween(50, 40, 10, 5)).toEqual(box(10, 5, 40, 35));
  });

  it("selects every element the rectangle touches", () => {
    const items = designElements(design).map((item) => ({ item, box: elementBox(design, item) ?? box(0, 0, 0, 0) }));
    // Over the number and the text, short of the QR.
    expect(hitTest(box(0, 0, 70, 22), items)).toEqual([{ kind: "text", index: 0 }, { kind: "number" }]);
    expect(hitTest(box(100, 0, 50, 55), items)).toEqual([{ kind: "qr" }]);
    expect(hitTest(box(90, 0, 5, 5), items)).toEqual([]);
  });

  it("counts touching edges as a hit", () => {
    expect(intersects(box(0, 0, 10, 10), box(10, 0, 5, 5))).toBe(true);
    expect(intersects(box(0, 0, 10, 10), box(10.1, 0, 5, 5))).toBe(false);
  });
});

describe("moving a group", () => {
  const group = [box(10, 10, 20, 10), box(40, 30, 10, 10)];

  it("finds the bounds of the group", () => {
    expect(boundsOf(group)).toEqual(box(10, 10, 40, 30));
    expect(boundsOf([])).toBeNull();
  });

  it("keeps the whole group inside the body", () => {
    expect(clampDelta(group, -50, 0, area)).toEqual({ dx: -10, dy: 0 });
    expect(clampDelta(group, 200, 200, area)).toEqual({ dx: 100, dy: 15 });
    expect(clampDelta(group, 3, -4, area)).toEqual({ dx: 3, dy: -4 });
  });

  it("moves every box by the same amount", () => {
    expect(moveBoxes(group, 0.1, 0.2)).toEqual([box(10.1, 10.2, 20, 10), box(40.1, 30.2, 10, 10)]);
  });

  it("rounds to the grid without float noise", () => {
    expect(roundTo(12.26, 0.5)).toBe(12.5);
    expect(roundTo(0.1 + 0.2, 0.1)).toBe(0.3);
  });
});

describe("align and distribute", () => {
  const frame = box(10, 10, 100, 40);
  const boxes = [box(20, 15, 10, 10), box(50, 30, 30, 20)];

  it("aligns edges and centres to the frame", () => {
    expect(alignBoxes(boxes, "left", frame).map((b) => b.x)).toEqual([10, 10]);
    expect(alignBoxes(boxes, "right", frame).map((b) => b.x)).toEqual([100, 80]);
    expect(alignBoxes(boxes, "center", frame).map((b) => b.x)).toEqual([55, 45]);
    expect(alignBoxes(boxes, "top", frame).map((b) => b.y)).toEqual([10, 10]);
    expect(alignBoxes(boxes, "middle", frame).map((b) => b.y)).toEqual([25, 20]);
    expect(alignBoxes(boxes, "bottom", frame).map((b) => b.y)).toEqual([40, 30]);
  });

  it("leaves the other axis alone", () => {
    expect(alignBoxes(boxes, "left", frame).map((b) => b.y)).toEqual([15, 30]);
  });

  it("spreads three or more with equal gaps, keeping the ends and the input order", () => {
    const row = [box(100, 0, 10, 5), box(0, 0, 10, 5), box(20, 0, 30, 5)];
    // Span 0–110, 50 mm of boxes: two gaps of 30 mm.
    expect(distributeBoxes(row, "x").map((b) => b.x)).toEqual([100, 0, 40]);
    const column = [box(0, 0, 5, 10), box(0, 12, 5, 10), box(0, 50, 5, 10)];
    expect(distributeBoxes(column, "y").map((b) => b.y)).toEqual([0, 25, 50]);
  });

  it("does nothing with fewer than three", () => {
    expect(distributeBoxes(boxes, "x")).toEqual(boxes);
  });
});

describe("smart guides", () => {
  const others = [box(100, 20, 30, 10)];

  it("sticks an edge to the nearest guide within the threshold", () => {
    // Left edge at 98.5: 1.5 mm from the other element's left edge.
    expect(snapMove(box(98.5, 0, 10, 5), others, area, 2)).toEqual({ dx: 1.5, dy: 0 });
    // Too far: no snap.
    expect(snapMove(box(95, 0, 10, 5), others, area, 2)).toEqual({ dx: 0, dy: 0 });
  });

  it("sticks centres to the ticket's centre", () => {
    // Centre at 74 → 75; vertical centre at 26.5 → 27.5 (body centre) is 1 mm, top 20 is far.
    expect(snapMove(box(69, 24, 10, 5), [], area, 1.5)).toEqual({ dx: 1, dy: 1 });
  });

  it("prefers the closest guide", () => {
    // Right edge 129.6: the other's right edge (130) beats its centre (115) and the body edge.
    expect(snapMove(box(119.6, 40, 10, 5), others, area, 3).dx).toBeCloseTo(0.4);
  });

  it("snaps only the far edges when resizing", () => {
    expect(snapResize(box(10, 10, 89, 9.5), others, area, 2)).toEqual({ width: 90, height: 10 });
  });

  it("draws the guides a box lies on", () => {
    const guides = guidesFor(box(100, 45, 30, 10), others, area);
    expect(guides).toContainEqual({ axis: "x", at: 100, from: 20, to: 55 });
    expect(guides).toContainEqual({ axis: "x", at: 130, from: 20, to: 55 });
    expect(guides).toContainEqual({ axis: "x", at: 115, from: 20, to: 55 });
    // The bottom edge lies on the body's edge: a guide across the whole ticket.
    expect(guides).toContainEqual({ axis: "y", at: 55, from: 0, to: 150 });
  });

  it("merges a body guide and an element guide on the same line", () => {
    const guides = guidesFor(box(60, 0, 30, 10), [box(70, 30, 10, 5)], area);
    const centre = guides.filter((guide) => guide.axis === "x" && guide.at === 75);
    expect(centre).toEqual([{ axis: "x", at: 75, from: 0, to: 55 }]);
  });

  it("only draws the far edges for a resize", () => {
    const guides = guidesFor(box(100, 0, 30, 30), others, area, "end");
    expect(guides.map((guide) => guide.at)).toEqual([130, 30]);
  });
});
