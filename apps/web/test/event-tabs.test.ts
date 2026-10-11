import { describe, expect, it } from "vitest";

import { TAB_GROUPS, TABS, tabFromSlug, tabSlug } from "@/components/event/tabs";

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
});
