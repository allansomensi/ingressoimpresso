/**
 * Goals and ranking of sellers (ADR 0073), as the organizer sees them on the Sellers tab. The
 * same rules as the server's ranking on the seller's page (`seller_goals.rs`): most sales first,
 * ties share a position ("1, 2, 2, 4") and are listed by name; box offices and sellers without
 * numbers stay out; nobody is ranked before their first sale.
 */
import type { ReportRowDto, SellerDto } from "@ingressoimpresso/api-types";

export type RankedSeller = {
  seller: SellerDto;
  /** Sales marked on the link (not voided). */
  sold: number;
  /** Position, shared by ties; `null` before the first sale. */
  position: number | null;
  /** Share of the goal reached, 0–100; `null` without a goal. */
  percent: number | null;
};

/** "Ana S." from "Ana Paula Souza": how the other sellers see a name in the ranking. */
export function shortName(name: string): string {
  const words = name.trim().split(/\s+/).filter((word) => word !== "");
  const first = words[0];
  if (first === undefined) {
    return "";
  }
  const last = words.length > 1 ? words.at(-1) : undefined;
  return last === undefined ? first : `${first} ${(last[0] ?? "").toLocaleUpperCase("pt-BR")}.`;
}

/** Share of a goal reached, 0–100 (more than the goal is 100). */
export function goalPercent(sold: number, goal: number | null): number | null {
  if (goal === null || goal <= 0) {
    return null;
  }
  return Math.min(100, Math.round((sold / goal) * 100));
}

/** The sellers in the ranking, in order. */
export function rankSellers(sellers: readonly SellerDto[], rows: ReadonlyMap<string | null, ReportRowDto>): RankedSeller[] {
  const ranked = sellers
    .filter((seller) => !seller.boxOffice && seller.ranges.length > 0)
    .map((seller) => ({ seller, sold: rows.get(seller.id)?.markedSold ?? 0 }))
    .sort((a, b) => b.sold - a.sold || shortName(a.seller.name).localeCompare(shortName(b.seller.name), "pt-BR") || a.seller.name.localeCompare(b.seller.name, "pt-BR"));
  let position = 0;
  let previous: number | null = null;
  return ranked.map((entry, index) => {
    if (entry.sold !== previous) {
      position = index + 1;
      previous = entry.sold;
    }
    return {
      ...entry,
      position: entry.sold === 0 ? null : position,
      percent: goalPercent(entry.sold, entry.seller.goal),
    };
  });
}

/** Sellers with a goal and how many of them reached it. */
export function goalTotals(ranked: readonly RankedSeller[]): { withGoal: number; reached: number; sold: number; goal: number } {
  let withGoal = 0;
  let reached = 0;
  let sold = 0;
  let goal = 0;
  for (const entry of ranked) {
    if (entry.seller.goal === null) {
      continue;
    }
    withGoal += 1;
    goal += entry.seller.goal;
    sold += Math.min(entry.sold, entry.seller.goal);
    if (entry.sold >= entry.seller.goal) {
      reached += 1;
    }
  }
  return { withGoal, reached, sold, goal };
}
