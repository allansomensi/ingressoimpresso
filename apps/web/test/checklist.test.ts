import type { ChecklistDto, ChecklistItemDto } from "@ingressoimpresso/api-types";
import { describe, expect, it } from "vitest";

import { checklistTarget, isComplete, requiredDone, splitItems } from "@/lib/checklist";
import { texts } from "@/texts/pt-BR";

function item(key: ChecklistItemDto["key"], state: ChecklistItemDto["state"], optional = false): ChecklistItemDto {
  return { key, state, optional, area: "manage", canAct: true, progress: null, hint: null };
}

describe("checklist (ADR 0078)", () => {
  const list: ChecklistDto = {
    applies: true,
    missing: 2,
    required: 4,
    items: [
      item("details", "done"),
      item("design", "missing"),
      item("art", "not_applicable"),
      item("categories", "optional", true),
      item("batch", "done"),
      item("rehearsal", "missing"),
    ],
  };

  it("puts what is open first and hides what does not apply", () => {
    const { open, done } = splitItems(list);
    expect(open.map((entry) => entry.key)).toEqual(["design", "categories", "rehearsal"]);
    expect(done.map((entry) => entry.key)).toEqual(["details", "batch"]);
    expect(requiredDone(list)).toBe(2);
    expect(isComplete(list)).toBe(false);
    expect(isComplete({ ...list, missing: 0 })).toBe(true);
  });

  it("leads every item to where it is done, with its own words", () => {
    expect(checklistTarget("details")).toEqual({ kind: "edit" });
    expect(checklistTarget("rehearsal")).toEqual({ kind: "tab", tab: "door" });
    expect(checklistTarget("organization_contact")).toEqual({ kind: "profile" });
    for (const key of Object.keys(texts.checklist.items) as ChecklistItemDto["key"][]) {
      expect(checklistTarget(key)).toBeDefined();
    }
  });
});
