import { describe, expect, it } from "vitest";

import { TAB_GROUPS, TABS, tabFromSlug, tabSlug, tabsOf } from "@/components/event/tabs";
import { checklistTarget } from "@/lib/checklist";

describe("event tabs", () => {
  it("lists every tab exactly once in the sections sheet", () => {
    const grouped = TAB_GROUPS.flatMap((group) => [...group.tabs]);
    expect([...grouped].sort()).toEqual([...TABS].sort());
  });

  it("keeps a slug for every tab", () => {
    for (const tab of TABS) {
      expect(tabFromSlug(tabSlug(tab))).toBe(tab);
    }
  });

  it("leaves printing out of an event of digital tickets only (ADR 0123)", () => {
    const sell = TAB_GROUPS.find((group) => group.key === "sell")?.tabs ?? [];
    expect(tabsOf("tickets", sell)).toEqual(["sellers", "digital", "voids", "files"]);
    expect(tabsOf("tickets", sell, true)).toEqual(["digital", "sellers", "voids"]);
    expect(tabsOf("tokens", TABS, true)).not.toContain("files");
    expect(checklistTarget("delivery")).toEqual({ kind: "tab", tab: "files" });
    expect(checklistTarget("delivery", true)).toEqual({ kind: "tab", tab: "digital" });
  });
});
