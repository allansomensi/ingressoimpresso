import { describe, expect, it } from "vitest";

import { STALE_SYNC_MS, agoLabel, deviceHealth, isDoorDay, niceMax, occupancy, refusalCount } from "@/lib/door-live";

describe("live door", () => {
  const now = Date.parse("2026-11-20T23:00:00Z");
  const at = (ms: number) => new Date(now - ms).toISOString();

  it("flags phones that stopped syncing", () => {
    expect(deviceHealth({ lastSyncAt: at(30_000), lastSeenAt: null, revoked: false }, now)).toBe("ok");
    expect(deviceHealth({ lastSyncAt: at(STALE_SYNC_MS + 1), lastSeenAt: null, revoked: false }, now)).toBe("stale");
    // An app that does not report syncs is judged by its last contact.
    expect(deviceHealth({ lastSyncAt: null, lastSeenAt: at(10_000), revoked: false }, now)).toBe("ok");
    expect(deviceHealth({ lastSyncAt: null, lastSeenAt: null, revoked: false }, now)).toBe("never");
    expect(deviceHealth({ lastSyncAt: at(STALE_SYNC_MS * 2), lastSeenAt: null, revoked: true }, now)).toBe("revoked");
  });

  it("says how long ago", () => {
    expect(agoLabel(2_000)).toBe("agora");
    expect(agoLabel(12_000)).toBe("há 12 s");
    expect(agoLabel(3 * 60_000)).toBe("há 3 min");
    expect(agoLabel(2 * 3_600_000)).toBe("há 2 h");
    expect(agoLabel(-5)).toBe("agora");
  });

  it("caps the occupancy bar and scales the curve to clean ticks", () => {
    expect(occupancy(50, 200)).toBe(0.25);
    expect(occupancy(210, 200)).toBe(1);
    expect(occupancy(3, 0)).toBe(0);
    expect(niceMax(0)).toBe(4);
    expect(niceMax(7)).toBe(8);
    expect(niceMax(13)).toBe(20);
    expect(niceMax(41)).toBe(60);
    expect(niceMax(100)).toBe(100);
  });

  it("adds the refusals that let nobody in", () => {
    expect(
      refusalCount({ blockedCopies: 2, offlineDuplicates: 9, invalid: 1, otherEvent: 1, voided: 3, voidEntries: 9, wrongDoor: 4, wrongDoorAdmitted: 9 }),
    ).toBe(11);
  });

  it("shows the live card on the day of the event", () => {
    expect(isDoorDay("2026-11-21T01:00:00Z", "2026-11-21T06:00:00Z", now)).toBe(true);
    expect(isDoorDay("2026-11-22T01:00:00Z", "2026-11-22T06:00:00Z", now)).toBe(false);
    expect(isDoorDay("2026-11-19T01:00:00Z", "2026-11-19T06:00:00Z", now)).toBe(false);
  });
});
