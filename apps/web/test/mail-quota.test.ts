import type { AnnouncementAudienceDto } from "@ingressoimpresso/api-types";
import { describe, expect, it } from "vitest";

import { mailOutlook } from "@/lib/mail-quota";

function preview(change: Partial<AnnouncementAudienceDto>): AnnouncementAudienceDto {
  // MAIL_DAILY_LIMIT = 95: a reserve of 23, 72 announcements a day.
  return { recipients: 10, optedOut: 0, already: 0, dailyBudget: 72, dailyLimit: 95, reserve: 23, sentLastDay: 5, queued: 0, ...change };
}

describe("mailOutlook (ADR 0115)", () => {
  it("fits with room", () => {
    expect(mailOutlook(preview({}))).toMatchObject({ level: "ok", today: 10, days: 1, usedAfter: 15, leftAfter: 80 });
  });

  it("warns when the announcements' part of the day is nearly used", () => {
    expect(mailOutlook(preview({ recipients: 50, sentLastDay: 10 }))).toMatchObject({ level: "near", today: 50, days: 1, usedAfter: 60, leftAfter: 35 });
  });

  it("spreads what does not fit over the next days", () => {
    // 72 - 20 sent - 12 queued = 40 today; 160 more at 72 a day.
    expect(mailOutlook(preview({ recipients: 200, sentLastDay: 20, queued: 12 }))).toMatchObject({ level: "over", today: 40, days: 4, usedAfter: 72, leftAfter: 23 });
    expect(mailOutlook(preview({ recipients: 5, sentLastDay: 72 }))).toMatchObject({ level: "over", today: 0, days: 2 });
  });

  it("says nothing without a limit", () => {
    expect(mailOutlook(preview({ dailyLimit: null, reserve: null, dailyBudget: null })).level).toBe("none");
  });

  it("never sends when the limit is all reserve", () => {
    expect(mailOutlook(preview({ dailyLimit: 5, reserve: 5, dailyBudget: 0 }))).toMatchObject({ level: "over", today: 0, days: Infinity });
  });
});
