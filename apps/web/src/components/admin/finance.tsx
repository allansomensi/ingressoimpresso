"use client";

import type { AdminFinanceDto, PaymentMethod } from "@ingressoimpresso/api-types";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { CircleDollarSign, Hourglass, Layers, PiggyBank, Trophy, TrendingDown, TrendingUp, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { BarChart } from "@/components/admin/bar-chart";
import { Card, CardHeader, EmptyState, ErrorMessage, LoadingBlock, Stat } from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import { texts } from "@/texts/pt-BR";

const t = texts.admin.finance;
const PERIODS = [7, 30, 90, 365] as const;
type Period = (typeof PERIODS)[number];
const integer = (value: number) => value.toLocaleString("pt-BR");

const METHOD_TONE: Record<PaymentMethod, string> = {
  stripe: "bg-brand",
  admin: "bg-warning",
  free: "bg-success",
  credit: "bg-brand-soft-fg",
};

/** `+12%`, `−5%` or `null` without a previous period. */
function growth(current: number, previous: number): string | null {
  if (previous <= 0) {
    return null;
  }
  const change = ((current - previous) / previous) * 100;
  const rounded = Math.round(change);
  return `${rounded > 0 ? "+" : rounded < 0 ? "−" : ""}${String(Math.abs(rounded))}%`;
}

/** `out/26` for a month, `20/11` for a day. */
function seriesLabel(key: string): string {
  const [year = "", month = "", day] = key.split("-");
  if (day !== undefined) {
    return `${day}/${month}`;
  }
  const name = new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
  return `${name}/${year.slice(2)}`;
}

export function AdminFinance() {
  const [period, setPeriod] = useState<Period>(30);
  const finance = useQuery({
    queryKey: ["admin", "finance", period],
    queryFn: () => api<AdminFinanceDto>(`/api/admin/finance?days=${String(period)}`),
    placeholderData: keepPreviousData,
  });

  if (finance.isPending) {
    return <LoadingBlock rows={4} />;
  }
  if (finance.isError) {
    return <ErrorMessage error={finance.error} />;
  }
  const f = finance.data;
  const change = growth(f.revenueCents, f.previousRevenueCents);
  const methodTotal = f.methods.reduce((sum, method) => sum + method.batches, 0);
  const funnel = [f.signups, f.signupsWithEvent, f.signupsWithTickets, f.signupsPaying];

  return (
    <div className={cn("flex flex-col gap-6 transition-opacity", finance.isPlaceholderData && "opacity-60")}>
      <div role="radiogroup" aria-label={t.chartTitle} className="flex w-fit rounded-full border border-border bg-surface-2 p-0.5">
        {PERIODS.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={period === option}
            onClick={() => {
              setPeriod(option);
            }}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-sm font-medium transition",
              period === option ? "bg-surface text-fg shadow-sm ring-1 ring-border" : "text-fg-muted hover:text-fg",
            )}
          >
            {t.periods[option]}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={t.revenue}
          value={money(f.revenueCents)}
          hint={change === null ? t.noPrevious : t.growth(change)}
          icon={change !== null && change.startsWith("−") ? TrendingDown : TrendingUp}
          tone={change !== null && change.startsWith("−") ? "danger" : "success"}
        />
        <Stat label={t.net} value={money(f.netCents)} hint={t.netHint(money(f.refundsCents))} icon={Wallet} tone="success" />
        <Stat label={t.batches} value={integer(f.chargedBatches)} hint={t.batchesHint(integer(f.chargedTickets))} icon={Layers} />
        <Stat
          label={t.pending}
          value={money(f.pendingCents)}
          hint={t.pendingHint(f.pendingBatches)}
          icon={Hourglass}
          tone={f.pendingBatches > 0 ? "warning" : "brand"}
        />
      </div>

      <Card>
        <CardHeader
          icon={CircleDollarSign}
          title={t.chartTitle}
          description={f.monthly ? t.chartMonthly : t.chartDaily}
          actions={<span className="text-sm text-fg-muted">{`${t.average}: ${money(f.averageBatchCents)}`}</span>}
        />
        <BarChart
          label={t.chartTitle}
          bars={f.series.map((point) => ({ date: point.label, value: point.revenueCents }))}
          format={money}
          describe={texts.admin.chartBar}
          formatLabel={seriesLabel}
        />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader icon={PiggyBank} title={t.methods} />
          {f.methods.length === 0 ? (
            <p className="text-sm text-fg-muted">{t.noData}</p>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex h-3 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                {f.methods.map((method) => (
                  <div
                    key={method.method}
                    className={METHOD_TONE[method.method]}
                    style={{ width: `${String((method.batches / Math.max(methodTotal, 1)) * 100)}%` }}
                  />
                ))}
              </div>
              <ul className="flex flex-col gap-3">
                {f.methods.map((method) => (
                  <li key={method.method} className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span className={cn("size-2.5 shrink-0 rounded-full", METHOD_TONE[method.method])} />
                      <span className="flex min-w-0 flex-col">
                        <span className="font-medium text-fg">{t.methodNames[method.method]}</span>
                        <span className="text-xs text-fg-muted">{t.methodLine(method.batches, method.tickets)}</span>
                      </span>
                    </span>
                    <span className="font-semibold text-fg tabular">{money(method.revenueCents)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader icon={Users} title={t.funnel} description={t.funnelHint} />
          <ol className="flex flex-col gap-3">
            {t.funnelSteps.map((step, index) => {
              const value = funnel[index] ?? 0;
              const share = f.signups === 0 ? 0 : (value / f.signups) * 100;
              return (
                <li key={step} className="flex flex-col gap-1.5">
                  <span className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="text-fg-muted">{step}</span>
                    <span className="font-semibold text-fg tabular">
                      {integer(value)}
                      {index > 0 && f.signups > 0 && <span className="ml-1.5 text-xs font-normal text-fg-subtle">{`${String(Math.round(share))}%`}</span>}
                    </span>
                  </span>
                  <span className="h-2 overflow-hidden rounded-full bg-surface-3">
                    <span className="block h-full rounded-full bg-brand transition-[width]" style={{ width: `${String(index === 0 && f.signups > 0 ? 100 : share)}%` }} />
                  </span>
                </li>
              );
            })}
          </ol>
        </Card>
      </div>

      <Card padded={false}>
        <div className="p-5 pb-0 sm:p-6 sm:pb-0">
          <CardHeader icon={Trophy} title={t.top} />
        </div>
        {f.topOrganizations.length === 0 ? (
          <div className="px-5 pb-6 sm:px-6">
            <EmptyState icon={Trophy} title={t.topEmpty} />
          </div>
        ) : (
          <ol className="divide-y divide-border border-t border-border">
            {f.topOrganizations.map((organization, index) => (
              <li key={organization.id}>
                <Link
                  href={`/painel/admin/organizacoes/${organization.id}`}
                  className="flex items-center gap-4 px-5 py-3 transition hover:bg-surface-2 sm:px-6"
                >
                  <span className="w-5 text-sm font-semibold text-fg-subtle tabular">{index + 1}</span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium text-fg">{organization.name}</span>
                    <span className="text-xs text-fg-muted">{texts.admin.organizations.tickets(organization.tickets)}</span>
                  </span>
                  <span className="text-sm font-semibold text-fg tabular">{money(organization.revenueCents)}</span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
