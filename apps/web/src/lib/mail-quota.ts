/**
 * What an announcement e-mail does to the day's quota (ADR 0115), from the numbers of
 * `AnnouncementAudienceDto`: how many go out in the next 24 hours, how many wait for the next
 * days, and whether the quota ends up near or past the part announcements may use. The sender
 * (`mailings.rs`) never touches the reserve; these words tell the admin what that means.
 */

import type { AnnouncementAudienceDto } from "@ingressoimpresso/api-types";

/** From this share of the announcements' part of the quota on, the admin is warned. */
export const NEAR_SHARE = 0.8;

export interface MailOutlook {
  /** `none`: no daily limit is set; `ok`: fits with room; `near`: fits, barely; `over`: does not fit today. */
  level: "none" | "ok" | "near" | "over";
  /** E-mails of this sending that go out in the next 24 hours. */
  today: number;
  /** Days until the last one goes out (1: today). */
  days: number;
  /** E-mails of every kind sent in the 24 hours after this sending starts, counting it. */
  usedAfter: number;
  /** What is left in the quota for everything else (codes, invitations, payments) after it. */
  leftAfter: number;
  limit: number;
  reserve: number;
  /** Announcement e-mails a day. */
  budget: number;
  /** Announcement e-mails of other sendings that go out first. */
  queued: number;
}

export function mailOutlook(preview: AnnouncementAudienceDto): MailOutlook {
  const limit = preview.dailyLimit ?? 0;
  const reserve = preview.reserve ?? 0;
  const budget = Math.max(0, limit - reserve);
  const recipients = preview.recipients;
  if (preview.dailyLimit === null) {
    return { level: "none", today: recipients, days: recipients > 0 ? 1 : 0, usedAfter: 0, leftAfter: 0, limit: 0, reserve: 0, budget: 0, queued: preview.queued };
  }
  // The announcements' part still free in the next 24 hours, after the sendings ahead.
  const room = Math.max(0, budget - preview.sentLastDay - preview.queued);
  const today = Math.min(recipients, room);
  const rest = recipients - today;
  const days = rest === 0 ? (recipients > 0 ? 1 : 0) : budget > 0 ? 1 + Math.ceil(rest / budget) : Infinity;
  const usedAfter = preview.sentLastDay + preview.queued + today;
  const leftAfter = Math.max(0, limit - usedAfter);
  const level = recipients === 0 ? "ok" : rest > 0 ? "over" : usedAfter >= budget * NEAR_SHARE ? "near" : "ok";
  return { level, today, days, usedAfter, leftAfter, limit, reserve, budget, queued: preview.queued };
}
