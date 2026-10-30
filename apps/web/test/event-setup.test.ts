import { describe, expect, it } from "vitest";

import { blankExtra, dayName, numberPlan, recipeTypes, recipesFor, setupBody, setupIssues, typesReady, type SetupDraft } from "@/lib/event-setup";
import { eventSetup } from "@/texts/pt-BR/event-setup";

const WEEKEND = [
  { position: 1, startsAt: "2026-11-21T18:00:00-03:00" },
  { position: 2, startsAt: "2026-11-22T12:00:00-03:00" },
];

describe("recipes", () => {
  it("offers days only to events of several days and products only to tokens", () => {
    expect(recipesFor("tickets", 1)).not.toContain("days");
    expect(recipesFor("tickets", 2)).toContain("days");
    expect(recipesFor("tokens", 2)).toEqual(["single", "products", "custom"]);
  });

  it("starts meia at half the event's price, asking for a document", () => {
    const [full, half] = recipeTypes("half", eventSetup.words, 3000, []);
    expect(full?.name).toBe("Inteira");
    expect(full?.priceText).toBe("");
    expect(half?.priceText).toBe("15,00");
    expect(half?.document).toBe(true);
  });

  it("makes a pass plus one type per day, named by weekday", () => {
    const types = recipeTypes("days", eventSetup.words, 5000, WEEKEND);
    expect(types.map((item) => item.name)).toEqual(["Passaporte", "Sábado", "Domingo"]);
    expect(types[1]?.dayRule).toBe("days");
    expect(types[1]?.validDays).toEqual([1]);
    expect(dayName([...WEEKEND, { position: 3, startsAt: "2026-11-28T18:00:00-03:00" }], 1)).toBe("Dia 1");
  });
});

describe("numbers and checks", () => {
  const draft = (): SetupDraft => {
    const types = recipeTypes("half", eventSetup.words, 3000, []);
    return { recipe: "half", types, extras: [blankExtra("Jantar", types.slice(0, 1))] };
  };

  it("gives numbers in a row from 1", () => {
    const { types } = draft();
    expect(numberPlan(types).map(({ first, last }) => [first, last])).toEqual([
      [1, 150],
      [151, 200],
    ]);
  });

  it("flags names, prices, quantities and who has the right", () => {
    const bad = draft();
    bad.types[1] = { ...bad.types[1]!, name: " inteira ", priceText: "abc", quantityText: "0" };
    bad.extras[0] = { ...bad.extras[0]!, types: [] };
    const issues = setupIssues(bad, false);
    expect(issues.types.get(bad.types[1]!.key)).toEqual(["duplicate", "price", "quantity"]);
    expect(issues.extras.get(bad.extras[0]!.key)).toEqual(["who"]);
    expect(typesReady(issues)).toBe(false);
    expect(typesReady(setupIssues(draft(), false))).toBe(true);

    const days = recipeTypes("days", eventSetup.words, null, WEEKEND);
    days[1] = { ...days[1]!, validDays: [] };
    expect(setupIssues({ recipe: "days", types: days, extras: [] }, true).types.get(days[1]!.key)).toEqual(["days"]);
    const huge = recipeTypes("single", eventSetup.words, null, []).map((item) => ({ ...item, quantityText: "10000" }));
    const many = Array.from({ length: 6 }, (_, index) => ({ ...huge[0]!, key: `k${String(index)}`, name: `T${String(index)}` }));
    expect(setupIssues({ recipe: "custom", types: many, extras: [] }, false).total).toBe(true);
  });

  it("sends the categories in order and the extras by place", () => {
    const body = setupBody(draft(), false);
    expect(body.categories.map((item) => [item.category.name, item.quantity, item.category.priceCents])).toEqual([
      ["Inteira", 150, null],
      ["Meia", 50, 1500],
    ]);
    expect(body.categories[1]?.category.checkDocument).toBe(true);
    expect(body.categories[0]?.category.dayRule).toBeUndefined();
    expect(body.checkpoints).toEqual([{ name: "Jantar", instruction: null, perDay: false, allowance: 1, categories: [0] }]);
  });
});
