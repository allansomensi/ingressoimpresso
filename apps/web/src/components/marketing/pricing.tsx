"use client";

import type { PricingDto } from "@ingressoimpresso/api-types";
import { useQuery } from "@tanstack/react-query";
import { BadgePercent, Calculator, Check, ChevronDown, Gift, TrendingUp } from "lucide-react";
import { useId, useState } from "react";

import { ButtonLink, Skeleton, Switch } from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { dateTime, money, parseMoney } from "@/lib/format";
import { LARGEST_BATCH, discounted, quoteBreakdown, sliderPosition, sliderQuantity } from "@/lib/pricing";
import { common as commonTexts, landing as landingTexts } from "@/texts/pt-BR";

const t = landingTexts;
const s = t.sim;
const START_QUANTITY = 200;

/** `0,6%` of a revenue, with one decimal. */
function share(cost: number, revenue: number): string | null {
  const percent = (cost / revenue) * 100;
  return percent < 0.1 ? null : `${percent.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

/** Ticket count, free tickets and (optionally) the ticket price → what the batch costs. */
function Simulator({ pricing }: { pricing: PricingDto }) {
  const [quantity, setQuantity] = useState(START_QUANTITY);
  const [useFree, setUseFree] = useState(true);
  const [price, setPrice] = useState("");
  const sliderId = useId();
  const priceId = useId();
  const promotion = pricing.promotion?.discountPercent ?? 0;
  const breakdown = quoteBreakdown(pricing, quantity, useFree ? pricing.freeTickets : 0);
  const total = discounted(breakdown.totalCents, promotion);
  const perTicket = quantity > 0 ? Math.round(total / quantity) : 0;
  const parsedPrice = parseMoney(price);
  const priceCents = parsedPrice.ok ? parsedPrice.cents : null;
  const revenue = priceCents !== null && priceCents > 0 ? priceCents * quantity : null;
  const position = sliderPosition(quantity);
  const revenueShare = revenue === null ? null : share(total, revenue);

  const setFromText = (text: string) => {
    const value = Number(text.replace(/\D/g, ""));
    setQuantity(Number.isFinite(value) ? Math.min(Math.max(value, 0), LARGEST_BATCH) : 0);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-soft-fg">
          <Calculator aria-hidden className="size-5" />
        </span>
        <div className="flex flex-col gap-0.5">
          <h3 className="text-lg font-semibold tracking-tight text-fg">{s.title}</h3>
          <p className="text-sm text-fg-muted">{s.lead}</p>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <label htmlFor={sliderId} className="text-sm font-medium text-fg">
            {s.quantity}
          </label>
          <span className="flex items-baseline gap-2">
            <input
              type="text"
              inputMode="numeric"
              aria-label={s.quantity}
              value={quantity === 0 ? "" : quantity.toLocaleString("pt-BR")}
              onChange={(event) => {
                setFromText(event.target.value);
              }}
              className="w-28 rounded-xl border border-border-strong bg-surface px-3 py-1.5 text-right text-2xl font-semibold tracking-tight text-fg tabular shadow-xs focus:border-brand focus:ring-4 focus:ring-ring focus:outline-none"
            />
            <span className="text-sm text-fg-muted">{s.quantityUnit}</span>
          </span>
        </div>
        <input
          id={sliderId}
          type="range"
          min={0}
          max={1000}
          step={1}
          value={position}
          aria-valuetext={`${quantity.toLocaleString("pt-BR")} ${s.quantityUnit}`}
          onChange={(event) => {
            setQuantity(sliderQuantity(Number(event.target.value)));
          }}
          style={{ background: `linear-gradient(to right, var(--brand) ${String(position / 10)}%, var(--surface-3) ${String(position / 10)}%)` }}
          className={cn(
            "h-2 w-full cursor-pointer appearance-none rounded-full",
            // Touch: a taller box to hit (the track stays thin) and a bigger thumb.
            "pointer-coarse:h-8 pointer-coarse:bg-clip-content pointer-coarse:py-3 pointer-coarse:[&::-webkit-slider-thumb]:size-7",
            "[&::-webkit-slider-thumb]:size-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-4 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-brand-solid [&::-webkit-slider-thumb]:shadow-md",
            "[&::-moz-range-thumb]:size-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-4 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-brand-solid [&::-moz-range-thumb]:shadow-md",
            "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand",
          )}
        />
        <div className="flex flex-wrap gap-2">
          {s.presets.map((preset) => (
            <button
              key={preset}
              type="button"
              aria-pressed={quantity === preset}
              onClick={() => {
                setQuantity(preset);
              }}
              className={cn(
                "rounded-full border px-3 py-1 text-[13px] font-medium tabular transition",
                quantity === preset
                  ? "border-brand bg-brand-soft text-brand-soft-fg"
                  : "border-border bg-surface text-fg-muted hover:border-border-strong hover:text-fg",
              )}
            >
              {preset.toLocaleString("pt-BR")}
            </button>
          ))}
        </div>
        {pricing.freeTickets > 0 && (
          <div className="rounded-2xl border border-success/25 bg-success-soft/60 px-4 py-3">
            <Switch checked={useFree} onChange={setUseFree} label={s.free(pricing.freeTickets)} description={s.freeHint} />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4 rounded-2xl bg-surface-2 p-5">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <span className="flex flex-col">
            <span className="text-sm font-medium text-fg-muted">{s.total}</span>
            <span aria-live="polite" className="text-4xl font-semibold tracking-tight text-fg tabular">
              {quantity > 0 && total === 0 ? s.totalFree : money(total)}
            </span>
          </span>
          <span className="text-sm text-fg-muted">
            {quantity > 0 && total === 0 ? s.allFree : quantity > 0 ? s.perTicket(money(perTicket)) : ""}
          </span>
        </div>
        {quantity > 0 && (
          <details className="group">
            <summary className="flex w-fit cursor-pointer list-none items-center gap-1 text-[13px] font-medium text-fg-muted transition hover:text-fg pointer-coarse:min-h-10 [&::-webkit-details-marker]:hidden">
              {s.breakdown}
              <ChevronDown aria-hidden className="size-4 transition-transform group-open:rotate-180" />
            </summary>
            <ul className="mt-3 flex flex-col gap-1.5 text-sm">
              {breakdown.free > 0 && (
                <li className="flex justify-between gap-4 text-success-fg">
                  <span className="flex items-center gap-1.5">
                    <Gift aria-hidden className="size-3.5" />
                    {s.lineFree(breakdown.free)}
                  </span>
                  <span className="tabular">{money(0)}</span>
                </li>
              )}
              {breakdown.lines.map((line) => (
                <li key={line.unitCents} className="flex justify-between gap-4 text-fg-muted">
                  <span className="tabular">{s.line(line.count, money(line.unitCents))}</span>
                  <span className="tabular">{money(line.totalCents)}</span>
                </li>
              ))}
              {breakdown.minimumApplied && (
                <li className="flex justify-between gap-4 text-fg-muted">
                  <span>{s.minimum(money(pricing.minimumCents))}</span>
                  <span className="tabular">{money(pricing.minimumCents)}</span>
                </li>
              )}
              {promotion > 0 && breakdown.totalCents > 0 && (
                <li className="flex justify-between gap-4 text-success-fg">
                  <span>{s.discount(promotion)}</span>
                  <span className="tabular">−{money(breakdown.totalCents - total)}</span>
                </li>
              )}
            </ul>
          </details>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={priceId} className="text-sm font-medium text-fg">
          {s.price} <span className="text-xs font-normal text-fg-subtle">({commonTexts.optional})</span>
        </label>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <span className="relative flex sm:w-40 sm:shrink-0">
            <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-fg-subtle">{commonTexts.currency}</span>
            <input
              id={priceId}
              value={price}
              onChange={(event) => {
                setPrice(event.target.value);
              }}
              inputMode="decimal"
              placeholder={s.pricePlaceholder}
              className="h-11 w-full rounded-xl border border-border-strong bg-surface pr-3.5 pl-10 text-base text-fg shadow-xs focus:border-brand focus:ring-4 focus:ring-ring focus:outline-none sm:text-[15px]"
            />
          </span>
          {revenue !== null && (
            <p className="flex flex-1 items-start gap-2 rounded-xl bg-brand-soft px-3.5 py-2.5 text-sm text-brand-soft-fg animate-fade-in">
              <TrendingUp aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>
                {s.revenue(money(revenue))} {revenueShare === null ? s.shareTiny : s.share(revenueShare)}
              </span>
            </p>
          )}
        </div>
      </div>
      <p className="text-xs text-fg-subtle">{s.max}</p>
    </div>
  );
}

function PriceTable({ pricing }: { pricing: PricingDto }) {
  return (
    <details className="group rounded-2xl border border-border">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-fg [&::-webkit-details-marker]:hidden">
        {s.table}
        <ChevronDown aria-hidden className="size-4 text-fg-subtle transition-transform group-open:rotate-180" />
      </summary>
      <ul className="divide-y divide-border border-t border-border px-4">
        {pricing.tiers.map((tier, index) => {
          const from = index === 0 ? 1 : (pricing.tiers[index - 1]?.upTo ?? 0) + 1;
          return (
            <li key={tier.upTo} className="flex items-center justify-between gap-4 py-3">
              <span className="text-sm text-fg-muted">{t.pricingTier(from, tier.upTo)}</span>
              <span className="flex items-baseline gap-1.5">
                {pricing.promotion !== null && <span className="text-xs text-fg-subtle line-through tabular">{money(tier.unitCents)}</span>}
                <span className="font-semibold text-fg tabular">
                  {money(pricing.promotion === null ? tier.unitCents : discounted(tier.unitCents, pricing.promotion.discountPercent))}
                </span>
                <span className="text-xs text-fg-subtle">{t.pricingPerTicket}</span>
              </span>
            </li>
          );
        })}
        <li className="py-3 text-xs text-fg-muted">{t.pricingMinimum(money(pricing.minimumCents))}</li>
      </ul>
    </details>
  );
}

export function PricingSection() {
  const pricing = useQuery({ queryKey: ["pricing"], queryFn: () => api<PricingDto>("/api/pricing"), staleTime: 60 * 60_000 });

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
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
          <div className="flex flex-col gap-6">
            {pricing.data.promotion !== null && (
              <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-success-solid to-[#16a34a] px-4 py-3 text-white shadow-sm">
                <BadgePercent className="size-5 shrink-0" aria-hidden />
                <span className="flex min-w-0 flex-col">
                  <span className="font-semibold">{pricing.data.promotion.headline ?? t.pricingPromotion(pricing.data.promotion.discountPercent)}</span>
                  <span className="text-xs opacity-90">{t.pricingPromotionUntil(dateTime(pricing.data.promotion.endsAt))}</span>
                </span>
              </div>
            )}
            <Simulator pricing={pricing.data} />
            <PriceTable pricing={pricing.data} />
            {pricing.data.upcoming !== null && <p className="text-xs text-fg-muted">{t.pricingUpcoming(dateTime(pricing.data.upcoming.effectiveAt))}</p>}
          </div>
        )}
      </div>
      {/* Follows the theme: a soft brand panel next to the simulator, never a dark block on a light page. */}
      <div className="flex flex-col justify-between gap-6 rounded-3xl border border-brand/20 bg-gradient-to-br from-brand-soft via-brand-soft/50 to-surface p-6 text-fg shadow-sm sm:p-8 lg:sticky lg:top-24 lg:self-start">
        <ul className="flex flex-col gap-3.5">
          {t.pricingIncluded.map((item) => (
            <li key={item} className="flex items-start gap-3 text-[15px] leading-snug">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-solid text-brand-fg">
                <Check className="size-3.5" strokeWidth={3} aria-hidden />
              </span>
              {item}
            </li>
          ))}
        </ul>
        <ButtonLink href="/entrar" size="lg">
          {t.primaryCta}
        </ButtonLink>
      </div>
    </div>
  );
}
