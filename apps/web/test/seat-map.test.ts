import type { PassTableDto } from "@ingressoimpresso/api-types";
import { describe, expect, it } from "vitest";

import { MAP_HEIGHT, MAP_WIDTH, chairPositions, seatMapLayout, tableBox, tableLabels } from "@/lib/seat-map";

const table = (name: string, x: number, y: number, seats = 8, shape: PassTableDto["shape"] = "round"): PassTableDto => ({ name, seats, shape, x, y });

function inside(layout: ReturnType<typeof seatMapLayout>) {
  for (const item of layout) {
    expect(item.cx - item.width / 2).toBeGreaterThanOrEqual(0);
    expect(item.cx + item.width / 2).toBeLessThanOrEqual(MAP_WIDTH);
    expect(item.cy - item.height / 2).toBeGreaterThanOrEqual(0);
    expect(item.cy + item.height / 2).toBeLessThanOrEqual(MAP_HEIGHT);
  }
}

describe("seat map", () => {
  it("sizes tables like the Mesas tab", () => {
    expect(tableBox({ seats: 8, shape: "round" })).toEqual({ width: (6 + 8 * 0.32) / 100, height: (6 + 8 * 0.32) / 100 });
    expect(tableBox({ seats: 40, shape: "round" }).width).toBe(0.11);
    expect(tableBox({ seats: 10, shape: "rect" })).toEqual({ width: 0.125, height: 0.055 });
  });

  it("highlights the holder's table and keeps everything in the drawing", () => {
    const layout = seatMapLayout([table("Mesa 1", 0.1, 0.1), table("Mesa 2", 0.9, 0.9), table("Mesa 3", 0.5, 0.5, 10, "rect")], "Mesa 2");
    expect(layout.map((item) => item.mine)).toEqual([false, true, false]);
    inside(layout);
  });

  it("zooms into tables placed in a corner, up to a limit", () => {
    const corner = seatMapLayout([table("A", 0.1, 0.1), table("B", 0.2, 0.1)], "A");
    const room = seatMapLayout([table("A", 0.1, 0.1), table("B", 0.9, 0.9)], "A");
    const [cornerA] = corner;
    const [roomA] = room;
    expect(cornerA?.width).toBeGreaterThan(roomA?.width ?? Infinity);
    // Never more than 2.2 times the size on the panel's map.
    expect(cornerA?.width).toBeLessThanOrEqual(tableBox(table("A", 0, 0)).width * MAP_WIDTH * 1.4 * 2.2 + 1e-9);
    inside(corner);
    // Centred.
    const middle = ((corner[0]?.cx ?? 0) + (corner[1]?.cx ?? 0)) / 2;
    expect(middle).toBeCloseTo(MAP_WIDTH / 2, 5);
  });

  it("handles one table, no tables and positions out of range", () => {
    const one = seatMapLayout([table("Única", 0.5, 0.5)], "Única");
    expect(one[0]?.cx).toBeCloseTo(MAP_WIDTH / 2, 5);
    expect(one[0]?.cy).toBeCloseTo(MAP_HEIGHT / 2, 5);
    expect(seatMapLayout([], "x")).toEqual([]);
    inside(seatMapLayout([table("A", -3, Number.NaN), table("B", 7, 0.5)], "A"));
  });

  it("puts chairs around round tables and on both sides of long ones", () => {
    const round = chairPositions({ seats: 4, shape: "round", cx: 100, cy: 100, width: 40, height: 40 });
    expect(round.map((chair) => chair.seat)).toEqual([1, 2, 3, 4]);
    expect(round[0]?.x).toBeCloseTo(100, 5);
    expect(round[0]?.y).toBeCloseTo(100 - 0.64 * 40, 5);
    const long = chairPositions({ seats: 5, shape: "rect", cx: 100, cy: 100, width: 60, height: 20 });
    expect(long.filter((chair) => chair.y < 100)).toHaveLength(3);
    expect(long.filter((chair) => chair.y > 100)).toHaveLength(2);
  });

  it("writes only what tells the tables apart", () => {
    expect(tableLabels(["Mesa 1", "Mesa 2", "Mesa 10"])).toEqual(["1", "2", "10"]);
    expect(tableLabels(["Mesa VIP 1", "Mesa VIP 2"])).toEqual(["1", "2"]);
    expect(tableLabels(["Família Souza", "Família Lima"])).toEqual(["Souza", "Lima"]);
    expect(tableLabels(["Palco", "Bar"])).toEqual(["Palco", "Bar"]);
    expect(tableLabels(["Mesa 1", "Mesão"])).toEqual(["Mesa 1", "Mesão"]);
    expect(tableLabels(["Mesa 1"])).toEqual(["Mesa 1"]);
  });
});
