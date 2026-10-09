"use client";

import type { OrgAnalyticsDto } from "@ingressoimpresso/api-types";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, CalendarPlus, CircleDollarSign, Download, Info, LogIn, Receipt, Wallet } from "lucide-react";
import Link from "next/link";

import { BarChart } from "@/components/admin/bar-chart";
import { Badge, Button, ButtonLink, Card, CardHeader, EmptyState, ErrorMessage, LoadingBlock, PageHeader, Stat } from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { eventDateTime, money } from "@/lib/format";
import { downloadCsv } from "@/lib/share";
import { texts } from "@/texts/pt-BR";

const t = texts.results;

function monthLabel(key: string): string {
  const [year = "", month = ""] = key.split("-");
  const name = new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
  return `${name}/${year.slice(2)}`;
}

function percent(part: number, whole: number): string {
  return whole === 0 ? "—" : `${String(Math.round((part / whole) * 100))}%`;
}

export default function ResultsPage() {
  const results = useQuery({ queryKey: ["analytics"], queryFn: () => api<OrgAnalyticsDto>("/api/analytics") });

  if (results.isPending) {
    return <LoadingBlock rows={4} />;
  }
  if (results.isError) {
    return <ErrorMessage error={results.error} />;
  }
  const { totals, events, months } = results.data;
  const exportCsv = () => {
    const c = t.columns;
    downloadCsv(t.csvFile, [
      [c.event, c.date, c.sold, "Pagos", c.entries, `${c.gross} (R$)`, `${c.cost} (R$)`, `${c.net} (R$)`],
      ...events.map((event) => [
        event.name,
        eventDateTime(event.startsAt),
        event.sold,
        event.paidTickets,
        event.entries,
        (event.grossCents / 100).toFixed(2).replace(".", ","),
        (event.costCents / 100).toFixed(2).replace(".", ","),
        ((event.grossCents - event.costCents) / 100).toFixed(2).replace(".", ","),
      ]),
    ]);
  };

  return (
    <main className="flex flex-col gap-8 animate-fade-in">
      <PageHeader
        title={t.title}
        description={t.subtitle}
        actions={
          events.length > 0 && (
            <Button variant="secondary" icon={<Download />} onClick={exportCsv}>
              {t.csv}
            </Button>
          )
        }
      />
      {events.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title={t.emptyTitle}
          description={t.empty}
          action={
            <ButtonLink href="/painel" icon={<CalendarPlus />}>
              {t.newEvent}
            </ButtonLink>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label={t.gross} value={money(totals.grossCents)} hint={t.grossHint} icon={CircleDollarSign} tone="success" />
            <Stat label={t.cost} value={money(totals.costCents)} hint={t.costHint} icon={Receipt} />
            <Stat
              label={t.net}
              value={money(totals.netCents)}
              hint={t.netHint}
              icon={Wallet}
              tone={totals.netCents < 0 ? "danger" : "success"}
            />
            <Stat
              label={t.attendance}
              value={percent(totals.entries, totals.sold)}
              hint={`${t.soldHint(totals.sold, totals.paidTickets)} · ${t.attendanceHint(totals.entries)}`}
              icon={LogIn}
            />
          </div>

          <Card>
            <CardHeader icon={BarChart3} title={t.chartTitle} description={t.chartHint} />
            <BarChart
              label={t.chartTitle}
              bars={months.map((month) => ({ date: month.month, value: month.grossCents }))}
              format={money}
              describe={texts.admin.chartBar}
              formatLabel={monthLabel}
            />
          </Card>

          <section className="flex flex-col gap-3">
            <h2 className="text-base font-semibold tracking-tight text-fg">{t.events}</h2>
            <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-xs">
              <table className="w-full min-w-[44rem] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium text-fg-muted">
                    <th className="px-4 py-3 font-medium">{t.columns.event}</th>
                    <th className="px-4 py-3 text-right font-medium">{t.columns.sold}</th>
                    <th className="px-4 py-3 text-right font-medium">{t.columns.entries}</th>
                    <th className="px-4 py-3 text-right font-medium">{t.columns.gross}</th>
                    <th className="px-4 py-3 text-right font-medium">{t.columns.cost}</th>
                    <th className="px-4 py-3 text-right font-medium">{t.columns.net}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {events.map((event) => {
                    const net = event.grossCents - event.costCents;
                    return (
                      <tr key={event.id} className="transition hover:bg-surface-2">
                        <td className="px-4 py-3">
                          <Link href={`/painel/eventos/${event.id}`} className="flex flex-col gap-0.5">
                            <span className="flex items-center gap-2 font-medium text-fg">
                              {event.name}
                              {event.status === "closed" && <Badge>{texts.event.actions.archivedBadge}</Badge>}
                            </span>
                            <span className="text-xs text-fg-muted">{eventDateTime(event.startsAt)}</span>
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-right text-fg tabular">{t.soldOf(event.sold, event.paidTickets)}</td>
                        <td className="px-4 py-3 text-right text-fg tabular">{event.entries.toLocaleString("pt-BR")}</td>
                        <td className="px-4 py-3 text-right text-fg tabular">
                          {event.ticketPriceCents === null ? <span className="text-fg-subtle">{t.noPrice}</span> : money(event.grossCents)}
                        </td>
                        <td className="px-4 py-3 text-right text-fg-muted tabular">{money(event.costCents)}</td>
                        <td className={cn("px-4 py-3 text-right font-semibold tabular", net < 0 ? "text-danger-fg" : "text-fg")}>{money(net)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
          <p className="flex items-start gap-2 text-xs leading-relaxed text-fg-muted">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {t.note}
          </p>
        </>
      )}
    </main>
  );
}
