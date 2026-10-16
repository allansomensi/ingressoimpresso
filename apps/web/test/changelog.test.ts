import type { ChangelogEntryDto } from "@ingressoimpresso/api-types";
import { describe, expect, it } from "vitest";

import { groupChangelog, latestSeen, unreadCount } from "@/lib/changelog";
import { isVersion } from "@/lib/version";

function note(id: string, publishedAt: string, version: string | null): ChangelogEntryDto {
  return { id, kind: "new", title: id, body: "", version, publishedAt, createdAt: publishedAt, updatedAt: publishedAt };
}

describe("release notes (ADR 0049)", () => {
  it("groups notes by release, and notes without a version by month", () => {
    const groups = groupChangelog([
      note("d", "2026-12-03T12:00:00Z", "1.1.0"),
      note("c", "2026-11-20T12:00:00Z", null),
      note("b", "2026-11-02T12:00:00Z", "1.1.0"),
      note("a", "2026-10-10T12:00:00Z", "1.0.0"),
    ]);
    expect(groups.map((group) => (group.kind === "release" ? group.version : "month"))).toEqual(["month", "1.1.0", "1.0.0"]);
    expect(groups[1]?.entries.map((entry) => entry.id)).toEqual(["d", "b"]);
    expect(groups[1]?.since).toBe("2026-11-02T12:00:00Z");
  });

  it("keeps a release in place when a note is added to it later", () => {
    const groups = groupChangelog([
      note("late", "2026-12-01T12:00:00Z", "1.0.0"),
      note("new", "2026-11-02T12:00:00Z", "1.1.0"),
      note("old", "2026-10-10T12:00:00Z", "1.0.0"),
    ]);
    expect(groups.map((group) => (group.kind === "release" ? group.version : "month"))).toEqual(["1.1.0", "1.0.0"]);
    expect(groups[1]?.entries.map((entry) => entry.id)).toEqual(["late", "old"]);
  });

  it("reads versions as tagged", () => {
    expect(isVersion("1.10.0")).toBe(true);
    for (const text of ["v1.0.0", "1.0", "01.0.0", "1.0.0-beta", ""]) {
      expect(isVersion(text)).toBe(false);
    }
  });
});

describe("seen release notes (ADR 0088)", () => {
  const notes = [note("b", "2026-11-02T12:00:00Z", null), note("a", "2026-10-10T12:00:00Z", null)];

  it("takes the later of the account and this browser", () => {
    expect(latestSeen(null, null)).toBeNull();
    expect(latestSeen("2026-10-10T12:00:00Z", null)).toBe("2026-10-10T12:00:00Z");
    expect(latestSeen(null, "2026-10-10T12:00:00Z")).toBe("2026-10-10T12:00:00Z");
    expect(latestSeen("2026-10-10T12:00:00Z", "2026-11-02T12:00:00Z")).toBe("2026-11-02T12:00:00Z");
    expect(latestSeen("2026-11-02T12:00:00.000Z", "2026-11-02T12:00:00Z")).toBe("2026-11-02T12:00:00.000Z");
  });

  it("counts only notes published after the seen time", () => {
    expect(unreadCount(notes, null)).toBe(2);
    expect(unreadCount(notes, "2026-10-10T12:00:00Z")).toBe(1);
    expect(unreadCount(notes, latestSeen("2026-10-10T12:00:00Z", "2026-11-02T12:00:00Z"))).toBe(0);
  });
});
