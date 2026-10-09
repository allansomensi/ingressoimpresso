"use client";

import type { PricingDto } from "@ingressoimpresso/api-types";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";

import { ButtonLink, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import { quote } from "@/lib/pricing";
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
            <ul className="divide-y divide-border">
              {pricing.data.tiers.map((tier, index) => {
                const from = index === 0 ? 1 : (pricing.data.tiers[index - 1]?.upTo ?? 0) + 1;
                return (
                  <li key={tier.upTo} className="flex items-center justify-between gap-4 py-4">
                    <span className="text-[15px] text-fg-muted">{t.pricingTier(from, tier.upTo)}</span>
                    <span className="flex items-baseline gap-1.5">
                      <span className="text-xl font-semibold tracking-tight text-fg tabular">{money(tier.unitCents)}</span>
                      <span className="text-xs text-fg-subtle">{t.pricingPerTicket}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 flex flex-col gap-1 rounded-2xl bg-brand-soft px-4 py-3 text-sm text-brand-soft-fg">
              <span className="font-semibold">
                {t.pricingExample(EXAMPLE_QUANTITY, money(quote(pricing.data, EXAMPLE_QUANTITY)))}
              </span>
              <span className="opacity-80">{t.pricingMinimum(money(pricing.data.minimumCents))}</span>
            </div>
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
