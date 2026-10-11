import { describe, expect, it } from "vitest";

import { bandText, categoryOf, clampPosition, compareTables, findSeat, nextColor, seatLabel, uncategorized } from "@/lib/categories";

const categories = [
  { name: "Inteira", color: "#2563eb", ranges: [{ first: 1, last: 5 }] },
  { name: "Meia", color: "#e11d48", ranges: [{ first: 6, last: 8 }, { first: 20, last: 20 }] },
];

describe("categories", () => {
  it("finds the category of a number", () => {
    expect(categoryOf(categories, 7)?.name).toBe("Meia");
    expect(categoryOf(categories, 20)?.name).toBe("Meia");
    expect(categoryOf(categories, 9)).toBeNull();
  });

  it("counts paid numbers without a category", () => {
    expect(uncategorized([{ first: 1, last: 20 }], categories)).toBe(11);
    expect(uncategorized([], categories)).toBe(0);
  });

  it("offers a colour not used yet", () => {
    expect(nextColor(categories)).toBe("#ca8a04");
    expect(nextColor([])).toBe("#2563eb");
  });

  it("writes the band like the printer", () => {
    expect(bandText("Meia", "Mesa 5 · Lugar 3")).toBe("Meia · Mesa 5 · Lugar 3");
    expect(bandText(null, " ")).toBeNull();
    expect(seatLabel(" Mesa 5 ", 3)).toBe("Mesa 5 · Lugar 3");
    expect(seatLabel("x".repeat(60), 12)).toHaveLength(40);
  });
});

describe("tables", () => {
  it("finds a ticket's seat and sorts tables naturally", () => {
    const tables = [
      { name: "Mesa 10", guests: [{ number: 41, seat: 2 }] },
      { name: "Mesa 2", guests: [] },
    ];
    expect(findSeat(tables, 41)).toEqual({ table: tables[0], seat: 2 });
    expect(findSeat(tables, 7)).toBeNull();
    expect([...tables].sort(compareTables).map((table) => table.name)).toEqual(["Mesa 2", "Mesa 10"]);
    expect(clampPosition(1.4)).toBe(1);
    expect(clampPosition(Number.NaN)).toBe(0.5);
  });
});
