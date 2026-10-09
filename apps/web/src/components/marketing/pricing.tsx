"use client";

import type { PricingDto } from "@ingressoimpresso/api-types";
import { useQuery } from "@tanstack/react-query";
import { BadgePercent, Check, Gift } from "lucide-react";

import { ButtonLink, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { dateTime, money } from "@/lib/format";
import { discounted, quote } from "@/lib/pricing";
import { texts } from "@/texts/pt-BR";

const t = texts.landing;
const EXAMPLE_QUANTITY = 200;

export function PricingSection() {
  const pricing = useQuery({ queryKey: ["pricing"], queryFn: () => api<PricingDto>("/api/pricing"), staleTime: 60 * 60_000 });

  return (
    <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
      <div className="rounded-3xl border border-border bg-surface p-6 shadow-sm sm:p-8">
        {pricing.isPending ? (
          <div className="flex flex-col gap-3">
            {[0, 1, 2, 3].map((row) => (
              <Skeleton key={row} className="h-14 w-full" />
            ))}
          </div>
        ) : pricing.isError ? (
          <p className="text-sm text-fg-muted">{t.pricingUnavailable}</p>
        ) : (
          <>
            {pricing.data.promotion !== null && (
              <div className="mb-4 flex items-center gap-3 rounded-2xl bg-gradient-to-r from-success-solid to-[#16a34a] px-4 py-3 text-white shadow-sm">
                <BadgePercent className="size-5 shrink-0" aria-hidden />
                <span className="flex min-w-0 flex-col">
                  <span className="font-semibold">{pricing.data.promotion.headline ?? t.pricingPromotion(pricing.data.promotion.discountPercent)}</span>
                  <span className="text-xs opacity-90">{t.pricingPromotionUntil(dateTime(pricing.data.promotion.endsAt))}</span>
                </span>
              </div>
            )}
            <ul className="divide-y divide-border">
              {pricing.data.tiers.map((tier, index) => {
                const from = index === 0 ? 1 : (pricing.data.tiers[index - 1]?.upTo ?? 0) + 1;
                return (
                  <li key={tier.upTo} className="flex items-center justify-between gap-4 py-4">
                    <span className="text-[15px] text-fg-muted">{t.pricingTier(from, tier.upTo)}</span>
                    <span className="flex items-baseline gap-1.5">
                      {pricing.data.promotion !== null && (
                        <span className="text-sm text-fg-subtle line-through tabular">{money(tier.unitCents)}</span>
                      )}
                      <span className="text-xl font-semibold tracking-tight text-fg tabular">
                        {money(pricing.data.promotion === null ? tier.unitCents : discounted(tier.unitCents, pricing.data.promotion.discountPercent))}
                      </span>
                      <span className="text-xs text-fg-subtle">{t.pricingPerTicket}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
            {pricing.data.freeTickets > 0 && (
              <div className="mt-4 flex items-start gap-3 rounded-2xl border border-success/25 bg-success-soft px-4 py-3 text-sm text-success-fg">
                <Gift className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span className="flex flex-col gap-0.5">
                  <span className="font-semibold">{t.pricingFree(pricing.data.freeTickets)}</span>
                  <span className="opacity-90">{t.pricingFreeBody}</span>
                </span>
              </div>
            )}
            <div className="mt-3 flex flex-col gap-1 rounded-2xl bg-brand-soft px-4 py-3 text-sm text-brand-soft-fg">
              <span className="font-semibold">
                {t.pricingExample(
                  EXAMPLE_QUANTITY,
                  money(discounted(quote(pricing.data, EXAMPLE_QUANTITY), pricing.data.promotion?.discountPercent ?? 0)),
                )}
              </span>
              <span className="opacity-80">{t.pricingMinimum(money(pricing.data.minimumCents))}</span>
            </div>
            {pricing.data.upcoming !== null && (
              <p className="mt-3 text-xs text-fg-muted">{t.pricingUpcoming(dateTime(pricing.data.upcoming.effectiveAt))}</p>
            )}
          </>
        )}
      </div>
      <div className="flex flex-col justify-between gap-6 rounded-3xl bg-[#0e0d14] p-6 text-white shadow-lg sm:p-8 dark:bg-surface-2">
        <ul className="flex flex-col gap-3.5">
          {t.pricingIncluded.map((item) => (
            <li key={item} className="flex items-start gap-3 text-[15px]">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[#7c66ff]">
                <Check className="size-3.5" strokeWidth={3} aria-hidden />
              </span>
              {item}
            </li>
          ))}
        </ul>
        <ButtonLink href="/entrar" variant="inverse" size="lg">
          {t.primaryCta}
        </ButtonLink>
      </div>
    </div>
  );
}
