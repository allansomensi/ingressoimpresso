import type { DoorCheckpointDto } from "@ingressoimpresso/api-types";
import { describe, expect, it } from "vitest";

import { allowanceOf, bookKey, comboView, viewOf, type DoorContext } from "@/portaria/logic";

const COMBO = "11111111-1111-4111-8111-111111111111";
const PLAIN = "22222222-2222-4222-8222-222222222222";

const bar: DoorCheckpointDto = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "Bebida",
  instruction: null,
  perDay: false,
  categoryIds: [COMBO],
  allowance: 1,
  categoryAllowances: [{ categoryId: COMBO, allowance: 2 }],
};

const context: DoorContext = {
  digits: 3,
  sellers: [],
  categories: [
    { id: COMBO, name: "Entrada + 2 bebidas", color: "#ea580c", first: 1, last: 10 },
    { id: PLAIN, name: "Entrada", color: "#2563eb", first: 11, last: 20 },
  ],
  seats: [],
  checkpoint: bar,
};

describe("combos (ADR 0112)", () => {
  it("gives each category its items at the checkpoint, one at the entrance", () => {
    expect(allowanceOf(context, 3)).toBe(2);
    expect(allowanceOf(context, 12)).toBe(1);
    expect(allowanceOf({ ...context, checkpoint: null }, 3)).toBe(1);
    expect(allowanceOf({ ...context, checkpoint: { ...bar, categoryIds: [], allowance: 4 } }, 15)).toBe(4);
    // A checkpoint stored before combos.
    const old = { id: bar.id, name: bar.name, instruction: null, perDay: false, categoryIds: [] } as unknown as DoorCheckpointDto;
    expect(allowanceOf({ ...context, checkpoint: old }, 3)).toBe(1);
  });

  it("keeps the first slot's key as before and adds the others", () => {
    expect(bookKey(null)).toBe("");
    expect(bookKey(2)).toBe("d2");
    expect(bookKey(null, 1)).toBe("");
    expect(bookKey(null, 2)).toBe("#2");
    expect(bookKey(1, 3)).toBe("d1#3");
  });

  it("says which item was handed over, and when the last one was", () => {
    const admit = { kind: "admit", number: 3 } as const;
    expect(comboView(viewOf(admit, context), admit, 2, 2, context).detail).toBe("2º de 2 deste ingresso");
    const used = { kind: "already_entered", number: 3, firstEntry: { atUnixMs: Date.parse("2030-01-01T21:15:00-03:00"), deviceName: "Bar 1" } } as const;
    const view = comboView(viewOf(used, context), used, 2, 2, context);
    expect(view.title).toBe("JÁ USOU OS 2");
    expect(view.detail).toContain("Bar 1");
    // A single item keeps the usual screen.
    expect(comboView(viewOf(admit, context), admit, 1, 1, context)).toEqual(viewOf(admit, context));
  });
});
