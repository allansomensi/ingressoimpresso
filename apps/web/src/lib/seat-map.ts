/**
 * "Onde fica minha mesa" on the digital ticket (ADR 0066): the room as the organizer drew it in
 * the Mesas tab (positions are fractions of a 4:3 map, sizes follow the number of seats), scaled
 * to the part of the room that has tables, with the holder's table highlighted.
 */

import type { PassTableDto } from "@ingressoimpresso/api-types";

/** Size of the drawing (SVG units): the panel's map on phones is 4:3. */
export const MAP_WIDTH = 400;
export const MAP_HEIGHT = 300;
/** Never zoom in more than this, so two tables in a corner do not fill the screen. */
const MAX_ZOOM = 2.2;
const PADDING = 26;
/** Tables are drawn bigger than on the panel's map: on a phone they are what the holder looks for. */
const TABLE_SCALE = 1.4;

export interface PlacedTable {
  name: string;
  shape: PassTableDto["shape"];
  seats: number;
  /** Centre, in map units. */
  cx: number;
  cy: number;
  width: number;
  height: number;
  mine: boolean;
}

/** A table's box on the panel's map, in fractions of the map's width (same as the Mesas tab). */
export function tableBox(table: Pick<PassTableDto, "seats" | "shape">): { width: number; height: number } {
  if (table.shape === "rect") {
    return { width: Math.min(18, 7 + table.seats * 0.55) / 100, height: 5.5 / 100 };
  }
  const diameter = Math.min(11, 6 + table.seats * 0.32) / 100;
  return { width: diameter, height: diameter };
}

const clamp = (value: number) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.5);

/**
 * Every table placed in a `MAP_WIDTH` × `MAP_HEIGHT` drawing: the bounding box of the tables is
 * scaled up to fill it (up to `MAX_ZOOM`) and centred.
 */
export function seatMapLayout(tables: readonly PassTableDto[], mine: string): PlacedTable[] {
  const raw = tables.map((table) => {
    const box = tableBox(table);
    return {
      table,
      cx: clamp(table.x) * MAP_WIDTH,
      cy: clamp(table.y) * MAP_HEIGHT,
      width: box.width * MAP_WIDTH * TABLE_SCALE,
      height: box.height * MAP_WIDTH * TABLE_SCALE,
    };
  });
  if (raw.length === 0) {
    return [];
  }
  const left = Math.min(...raw.map((item) => item.cx - item.width / 2));
  const right = Math.max(...raw.map((item) => item.cx + item.width / 2));
  const top = Math.min(...raw.map((item) => item.cy - item.height / 2));
  const bottom = Math.max(...raw.map((item) => item.cy + item.height / 2));
  const zoom = Math.min(
    MAX_ZOOM,
    (MAP_WIDTH - 2 * PADDING) / Math.max(right - left, 1),
    (MAP_HEIGHT - 2 * PADDING) / Math.max(bottom - top, 1),
  );
  const offsetX = (MAP_WIDTH - (right - left) * zoom) / 2 - left * zoom;
  const offsetY = (MAP_HEIGHT - (bottom - top) * zoom) / 2 - top * zoom;
  return raw.map((item) => ({
    name: item.table.name,
    shape: item.table.shape,
    seats: item.table.seats,
    cx: item.cx * zoom + offsetX,
    cy: item.cy * zoom + offsetY,
    width: item.width * zoom,
    height: item.height * zoom,
    mine: item.table.name === mine,
  }));
}

/** Where each chair of a table is drawn (same arrangement as the Mesas tab). */
export function chairPositions(table: Pick<PlacedTable, "seats" | "shape" | "cx" | "cy" | "width" | "height">): { seat: number; x: number; y: number }[] {
  return Array.from({ length: table.seats }, (_, index) => {
    const seat = index + 1;
    if (table.shape === "round") {
      const angle = (index / table.seats) * 2 * Math.PI - Math.PI / 2;
      return { seat, x: table.cx + 0.64 * table.width * Math.cos(angle), y: table.cy + 0.64 * table.height * Math.sin(angle) };
    }
    // Long table: half the chairs on each side.
    const perSide = Math.ceil(table.seats / 2);
    const side = seat <= perSide ? 0 : 1;
    const position = side === 0 ? index : index - perSide;
    return {
      seat,
      x: table.cx - table.width / 2 + ((position + 0.5) / perSide) * table.width,
      y: table.cy + (side === 0 ? -0.72 : 0.72) * table.height,
    };
  });
}

/**
 * What is written on each table: the name without the part every table shares ("Mesa 1",
 * "Mesa 2" → "1", "2"), so it fits; the full name when they share nothing.
 */
export function tableLabels(names: readonly string[]): string[] {
  if (names.length < 2) {
    return [...names];
  }
  let prefix = names[0] ?? "";
  for (const name of names) {
    while (!name.startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
    }
  }
  // Only a whole word ("Mesa "), never half of one.
  const cut = prefix.lastIndexOf(" ") + 1;
  return names.map((name) => (cut > 0 && name.length > cut ? name.slice(cut) : name));
}
