"use client";

import type {
  AdminClosingDto,
  AdminCohortDto,
  AdminCouponReturnDto,
} from "@ingressoimpresso/api-types";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  CircleDollarSign,
  FileSpreadsheet,
  FileText,
  Grid3x3,
  TicketPercent,
  TrendingDown,
  Undo2,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorMessage,
  Field,
  LoadingBlock,
  Select,
  Stat,
  TableScroll,
  errorMessage,
} from "@/components/ui";
import { api, fetchBlobUrl } from "@/lib/api";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import {
  heatLevel,
  monthName,
  recentMonths,
  shortMonth,
} from "@/lib/revenue-reports";
import { admin as adminTexts } from "@/texts/pt-BR/admin";

const t = adminTexts.reports;
const integer = (value: number) => value.toLocaleString("pt-BR");

const HEAT = [
  "",
  "bg-success-soft/50",
  "bg-success-soft",
  "bg-success/30",
  "bg-success/50",
] as const;

async function download(path: string, name: string) {
  try {
    const url = await fetchBlobUrl(path);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 10_000);
  } catch (error) {
    toast.error(errorMessage(error));
  }
}

function Row({
  label,
  value,
  hint,
  strong = false,
}: {
  label: string;
  value: string;
  hint?: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <span className="flex min-w-0 flex-col">
        <span
          className={cn(
            "text-sm",
            strong ? "font-semibold text-fg" : "text-fg-muted",
          )}
        >
          {label}
        </span>
        {hint !== undefined && (
          <span className="text-xs text-fg-subtle">{hint}</span>
        )}
      </span>
      <span
        className={cn(
          "shrink-0 text-sm tabular",
          strong ? "font-semibold text-fg" : "text-fg",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function Closing() {
  const months = recentMonths(new Date(), 24);
  const [month, setMonth] = useState(months[0] ?? "");
  const [busy, setBusy] = useState<"xlsx" | "csv" | null>(null);
  const closing = useQuery({
    queryKey: ["admin", "reports", "closing", month],
    queryFn: () =>
      api<AdminClosingDto>(`/api/admin/reports/closing?month=${month}`),
    placeholderData: keepPreviousData,
  });
  const save = async (format: "xlsx" | "csv") => {
    setBusy(format);
    await download(
      `/api/admin/reports/closing/${format}?month=${month}`,
      format === "xlsx" ? t.xlsxFile(month) : t.csvFile(month),
    );
    setBusy(null);
  };
  return (
    <Card>
      <CardHeader
        icon={FileSpreadsheet}
        title={t.closingTitle}
        description={t.closingHint}
      />
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <Field label={t.month} className="sm:w-64">
            <Select
              value={month}
              onChange={(event) => {
                setMonth(event.target.value);
              }}
            >
              {months.map((option) => (
                <option key={option} value={option}>
                  {monthName(option)}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              icon={<FileSpreadsheet />}
              loading={busy === "xlsx"}
              onClick={() => void save("xlsx")}
            >
              {t.xlsx}
            </Button>
            <Button
              variant="secondary"
              icon={<FileText />}
              loading={busy === "csv"}
              onClick={() => void save("csv")}
            >
              {t.csv}
            </Button>
          </div>
        </div>
        {closing.isPending ? (
          <LoadingBlock rows={3} />
        ) : closing.isError ? (
          <ErrorMessage error={closing.error} onRetry={() => void closing.refetch()} />
        ) : (
          <div
            className={cn(
              "flex flex-col gap-5",
              closing.isPlaceholderData && "opacity-60",
            )}
          >
            <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
              <Stat
                label={t.gross}
                value={money(closing.data.grossCents)}
                hint={t.stripe(money(closing.data.stripeCents))}
                icon={CircleDollarSign}
                tone="success"
              />
              <Stat
                label={t.refunds}
                value={money(closing.data.refundsCents)}
                hint={t.refundHint}
                icon={Undo2}
                tone="danger"
              />
              <Stat
                label={t.net}
                value={money(closing.data.netCents)}
                hint={t.manual(money(closing.data.manualCents))}
                icon={Wallet}
              />
              <Stat
                label={t.batches}
                value={integer(closing.data.batches)}
                hint={t.ticketsHint(
                  closing.data.tickets,
                  closing.data.freeTickets,
                )}
                icon={TrendingDown}
                tone="warning"
              />
            </div>
            {closing.data.lines.length === 0 ? (
              <p className="text-sm text-fg-muted">{t.noMovement}</p>
            ) : (
              <div className="grid items-start gap-6 lg:grid-cols-2">
                <div className="flex flex-col">
                  <h3 className="text-sm font-semibold text-fg">
                    {t.breakdown}
                  </h3>
                  <div className="divide-y divide-border">
                    <Row label={t.list} value={money(closing.data.listCents)} />
                    <Row
                      label={t.discounts}
                      value={`−${money(closing.data.discountCents)}`}
                    />
                    <Row
                      label={t.creditUsed}
                      value={`−${money(closing.data.creditUsedCents)}`}
                    />
                    <Row
                      label={t.gross}
                      value={money(closing.data.grossCents)}
                      strong
                    />
                    <Row
                      label={t.creditIssued}
                      value={money(closing.data.creditIssuedCents)}
                    />
                    <Row
                      label={t.creditBalance}
                      value={money(closing.data.creditBalanceCents)}
                      hint={t.creditBalanceHint}
                    />
                    <Row
                      label={t.disputesLost}
                      value={money(closing.data.disputesLostCents)}
                    />
                  </div>
                  <h3 className="mt-4 text-sm font-semibold text-fg">
                    {t.methods}
                  </h3>
                  <div className="divide-y divide-border">
                    {closing.data.methods.map((method) => (
                      <Row
                        key={method.method}
                        label={t.methodNames[method.method] ?? method.method}
                        hint={t.methodLine(method.batches)}
                        value={money(method.cents)}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex flex-col">
                  <h3 className="flex items-baseline justify-between gap-2 text-sm font-semibold text-fg">
                    {t.organizations}
                    <span className="text-xs font-normal text-fg-subtle">
                      {t.lines(closing.data.lines.length)}
                    </span>
                  </h3>
                  <ul className="divide-y divide-border">
                    {closing.data.organizations
                      .slice(0, 12)
                      .map((organization) => (
                        <li
                          key={organization.id}
                          className="flex items-baseline justify-between gap-4 py-2 text-sm"
                        >
                          <Link
                            href={`/painel/admin/organizacoes/${organization.id}`}
                            className="min-w-0 truncate text-fg hover:text-brand hover:underline"
                          >
                            {organization.name}
                          </Link>
                          <span className="shrink-0 text-right tabular">
                            <span className="font-medium text-fg">
                              {money(
                                organization.grossCents -
                                  organization.refundsCents,
                              )}
                            </span>
                            {organization.refundsCents > 0 && (
                              <span className="block text-xs text-danger-fg">
                                −{money(organization.refundsCents)}
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

function Cohorts() {
  const cohorts = useQuery({
    queryKey: ["admin", "reports", "cohorts"],
    queryFn: () => api<AdminCohortDto[]>("/api/admin/reports/cohorts"),
  });
  const columns =
    cohorts.data?.reduce(
      (most, cohort) => Math.max(most, cohort.byMonth.length),
      0,
    ) ?? 0;
  const max =
    cohorts.data?.reduce(
      (most, cohort) => Math.max(most, ...cohort.byMonth),
      0,
    ) ?? 0;
  return (
    <Card padded={false}>
      <div className="p-5 pb-4 sm:p-6 sm:pb-4">
        <CardHeader
          icon={Grid3x3}
          title={t.cohortsTitle}
          description={t.cohortsHint}
        />
      </div>
      {cohorts.isPending ? (
        <div className="px-6 pb-6">
          <LoadingBlock rows={4} />
        </div>
      ) : cohorts.isError ? (
        <div className="px-6 pb-6">
          <ErrorMessage error={cohorts.error} onRetry={() => void cohorts.refetch()} />
        </div>
      ) : (
        <TableScroll label={t.cohortsTitle}>
          <table
            aria-label={t.cohortsTitle}
            className="w-full min-w-[56rem] text-sm"
          >
            <thead className="border-y border-border bg-surface-2 text-left text-xs font-medium text-fg-muted">
              <tr>
                <th className="py-2.5 pr-2 pl-5 font-medium">{t.cohort}</th>
                <th className="px-2 py-2.5 text-right font-medium">
                  {t.signups}
                </th>
                <th
                  className="px-2 py-2.5 text-right font-medium"
                  title={t.activatedHint}
                >
                  {t.activated}
                </th>
                <th className="px-2 py-2.5 text-right font-medium">
                  {t.paying}
                </th>
                <th className="px-2 py-2.5 text-right font-medium">
                  {t.revenue}
                </th>
                {Array.from({ length: columns }, (_, index) => (
                  <th
                    key={index}
                    className="px-1 py-2.5 text-center font-medium"
                  >
                    M{index}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {cohorts.data.map((cohort) => (
                <tr key={cohort.month}>
                  <th
                    scope="row"
                    className="py-2 pr-2 pl-5 text-left font-medium whitespace-nowrap text-fg"
                  >
                    {shortMonth(cohort.month)}
                  </th>
                  <td className="px-2 py-2 text-right tabular">
                    {integer(cohort.signups)}
                  </td>
                  <td className="px-2 py-2 text-right tabular">
                    {integer(cohort.activated)}
                  </td>
                  <td className="px-2 py-2 text-right tabular">
                    {integer(cohort.paying)}{" "}
                    <span className="text-xs text-fg-subtle">
                      {t.conversion(cohort.paying, cohort.signups)}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right font-medium whitespace-nowrap tabular">
                    {money(cohort.revenueCents)}
                  </td>
                  {Array.from({ length: columns }, (_, index) => {
                    const cents = cohort.byMonth[index];
                    return (
                      <td key={index} className="px-0.5 py-1">
                        {cents !== undefined && (
                          <span
                            className={cn(
                              "block rounded-md px-1 py-1 text-center text-[11px] whitespace-nowrap tabular",
                              HEAT[heatLevel(cents, max)],
                              cents === 0 && "text-fg-subtle",
                            )}
                            title={money(cents)}
                          >
                            {cents === 0
                              ? "·"
                              : integer(Math.round(cents / 100))}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
    </Card>
  );
}

function Coupons() {
  const coupons = useQuery({
    queryKey: ["admin", "reports", "coupons"],
    queryFn: () => api<AdminCouponReturnDto[]>("/api/admin/reports/coupons"),
  });
  return (
    <Card padded={false}>
      <div className="p-5 pb-4 sm:p-6 sm:pb-4">
        <CardHeader
          icon={TicketPercent}
          title={t.couponsTitle}
          description={t.couponsHint}
        />
      </div>
      {coupons.isPending ? (
        <div className="px-6 pb-6">
          <LoadingBlock rows={3} />
        </div>
      ) : coupons.isError ? (
        <div className="px-6 pb-6">
          <ErrorMessage error={coupons.error} onRetry={() => void coupons.refetch()} />
        </div>
      ) : coupons.data.length === 0 ? (
        <div className="px-6 pb-6">
          <EmptyState icon={TicketPercent} title={t.noCoupons} />
        </div>
      ) : (
        <TableScroll label={t.couponsTitle}>
          <table
            aria-label={t.couponsTitle}
            className="w-full min-w-[44rem] text-sm"
          >
            <thead className="border-y border-border bg-surface-2 text-left text-xs font-medium text-fg-muted">
              <tr>
                <th className="py-2.5 pr-2 pl-5 font-medium">{t.coupon}</th>
                <th className="px-2 py-2.5 text-right font-medium">{t.used}</th>
                <th className="px-2 py-2.5 text-right font-medium">
                  {t.payingAfter}
                </th>
                <th className="px-2 py-2.5 text-right font-medium">{t.cost}</th>
                <th className="py-2.5 pr-5 pl-2 text-right font-medium">
                  {t.revenueAfter}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {coupons.data.map((coupon) => {
                const cost = coupon.creditCents + coupon.discountCents;
                return (
                  <tr key={`${coupon.source}-${coupon.id}`}>
                    <th
                      scope="row"
                      className="py-2.5 pr-2 pl-5 text-left font-normal"
                    >
                      <span
                        className={cn(
                          "block font-medium text-fg",
                          coupon.source === "code" && "font-mono",
                        )}
                      >
                        {coupon.name}
                      </span>
                      <span className="text-xs text-fg-subtle">
                        {t.kinds[coupon.kind] ?? coupon.kind}
                      </span>
                    </th>
                    <td className="px-2 py-2.5 text-right tabular">
                      {integer(coupon.organizations)}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular">
                      {integer(coupon.paying)}{" "}
                      <span className="text-xs text-fg-subtle">
                        {t.conversion(coupon.paying, coupon.organizations)}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 text-right tabular">
                      <span className="block">{money(cost)}</span>
                      <span className="text-xs text-fg-subtle">
                        {t.costHint(
                          coupon.creditCents > 0
                            ? money(coupon.creditCents)
                            : "",
                          coupon.discountCents > 0
                            ? money(coupon.discountCents)
                            : "",
                          Number(coupon.freeTickets),
                        )}
                      </span>
                    </td>
                    <td className="py-2.5 pr-5 pl-2 text-right font-medium tabular">
                      {money(coupon.revenueCents)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableScroll>
      )}
    </Card>
  );
}

/** Revenue reports (ADR 0106): the month's closing for the accountant, cohorts and coupons. */
export function AdminReports() {
  return (
    <div className="flex flex-col gap-6">
      <Closing />
      <Cohorts />
      <Coupons />
    </div>
  );
}
