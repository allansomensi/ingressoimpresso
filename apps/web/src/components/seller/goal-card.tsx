"use client";

/**
 * The seller's goal and, when the organizer shows it, the ranking (ADR 0073). The other sellers
 * appear only by first name and initial, as the server sends them.
 */
import type { SellerRankingDto } from "@ingressoimpresso/api-types";
import { CheckCircle2, Target, Trophy } from "lucide-react";

import { cn } from "@/lib/cn";
import { goalPercent } from "@/lib/seller-goals";
import { sellerPage as sellerPageTexts } from "@/texts/pt-BR/seller-page";

const t = sellerPageTexts;

const MEDALS = ["bg-warning-soft text-warning-fg ring-warning/30", "bg-surface-3 text-fg ring-border-strong", "bg-brand-soft text-brand-soft-fg ring-brand/20"];

export function GoalCard({ goal, sold, ranking }: { goal: number | null; sold: number; ranking: SellerRankingDto | null }) {
  if (goal === null && ranking === null) {
    return null;
  }
  const percent = goalPercent(sold, goal) ?? 0;
  const reached = goal !== null && sold >= goal;
  return (
    <section className="flex flex-col gap-5 rounded-3xl border border-border bg-surface p-5 shadow-xs">
      {goal !== null && (
        <div className="flex flex-col gap-2.5">
          <h2 className="flex items-center gap-2 text-base font-semibold text-fg">
            <Target aria-hidden className="size-[18px] text-brand" />
            {t.goal.title}
          </h2>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-2xl font-semibold tracking-tight text-fg tabular">{t.goal.progress(sold, goal)}</span>
            <span className={cn("text-sm font-medium tabular", reached ? "text-success-fg" : "text-fg-muted")}>{percent}%</span>
          </div>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-label={t.goal.label(sold, goal)}
            className="h-2.5 overflow-hidden rounded-full bg-surface-3"
          >
            <div
              className={cn("h-full rounded-full transition-[width] duration-500", reached ? "bg-success" : "bg-brand")}
              style={{ width: `${String(percent)}%` }}
            />
          </div>
          <p className={cn("flex items-start gap-1.5 text-sm", reached ? "font-medium text-success-fg" : "text-fg-muted")}>
            {reached && <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0" />}
            {reached ? t.goal.reached : t.goal.left(goal - sold)}
          </p>
        </div>
      )}
      {ranking !== null && (
        <div className={cn("flex flex-col gap-3", goal !== null && "border-t border-border pt-5")}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 className="flex items-center gap-2 text-base font-semibold text-fg">
              <Trophy aria-hidden className="size-[18px] text-warning-fg" />
              {t.ranking.title}
            </h2>
            {ranking.position !== null && (
              <span className="text-sm font-medium text-brand-soft-fg">{t.ranking.position(ranking.position, ranking.participants)}</span>
            )}
          </div>
          {ranking.top.length === 0 ? (
            <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm text-fg-muted">{t.ranking.empty}</p>
          ) : (
            <ol className="flex flex-col gap-1.5">
              {ranking.top.map((entry) => (
                <li
                  key={`${String(entry.position)}-${entry.name}-${String(entry.you)}`}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl px-3 py-2.5",
                    entry.you ? "bg-brand-soft ring-1 ring-brand/25" : "bg-surface-2",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ring-1 tabular",
                      MEDALS[entry.position - 1] ?? "bg-surface text-fg-muted ring-border",
                    )}
                  >
                    {entry.position}º
                  </span>
                  <span className={cn("min-w-0 flex-1 truncate text-sm", entry.you ? "font-semibold text-brand-soft-fg" : "font-medium text-fg")}>
                    {entry.you ? t.ranking.you : entry.name}
                  </span>
                  <span className="shrink-0 text-sm text-fg-muted tabular">{t.ranking.sold(entry.sold)}</span>
                </li>
              ))}
            </ol>
          )}
          {ranking.position === null && ranking.top.length > 0 && <p className="text-sm text-fg-muted">{t.ranking.unranked}</p>}
          <p className="text-xs leading-relaxed text-fg-subtle">
            {t.ranking.privacy} {t.ranking.asOf}
          </p>
        </div>
      )}
    </section>
  );
}
