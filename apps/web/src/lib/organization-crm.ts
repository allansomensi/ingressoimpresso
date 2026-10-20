import type {
  AdminOrganizationDto,
  TimelineEntryDto,
  TimelineKind,
} from "@ingressoimpresso/api-types";

/** Days without activity after which a paying organization is "cooling". */
export const COOLING_DAYS = 60;

/**
 * An organization that paid for tickets but where nobody signed in or created a batch for
 * `COOLING_DAYS` (ADR 0105): worth a call before it is gone.
 */
export function isCooling(
  organization: Pick<AdminOrganizationDto, "paidTickets" | "lastActivityAt">,
  now: Date = new Date(),
): boolean {
  if (organization.paidTickets === 0 || organization.lastActivityAt === null) {
    return false;
  }
  const idle = now.getTime() - new Date(organization.lastActivityAt).getTime();
  return idle > COOLING_DAYS * 86_400_000;
}

export type TimelineFilter = "all" | "money" | "usage" | "emails" | "admin";

const FILTER_KINDS: Record<
  Exclude<TimelineFilter, "all">,
  readonly TimelineKind[]
> = {
  money: ["batch_paid", "batch_refunded", "dispute", "credit", "coupon"],
  usage: ["signup", "member_joined", "login", "event_created", "batch_created"],
  emails: ["email"],
  admin: ["admin", "note"],
};

/** The entries a filter of the timeline shows. */
export function filterTimeline(
  entries: readonly TimelineEntryDto[],
  filter: TimelineFilter,
): TimelineEntryDto[] {
  if (filter === "all") {
    return [...entries];
  }
  const kinds = FILTER_KINDS[filter];
  return entries.filter((entry) => kinds.includes(entry.kind));
}

/** Labels as the server keeps them: trimmed, lowercase, single spaces. */
export function normalizeTag(text: string): string {
  return text.trim().split(/\s+/).join(" ").toLowerCase();
}

/** Pages of the timeline put together, without the entries a page repeated at its edge. */
export function mergeTimeline(
  pages: readonly (readonly TimelineEntryDto[])[],
): TimelineEntryDto[] {
  const seen = new Set<string>();
  const merged: TimelineEntryDto[] = [];
  for (const entry of pages.flat()) {
    const key = `${entry.at}|${entry.kind}|${entry.code ?? ""}|${entry.detail ?? ""}|${entry.actor ?? ""}|${entry.eventId ?? ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(entry);
    }
  }
  return merged;
}
