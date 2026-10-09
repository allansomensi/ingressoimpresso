"use client";

import type { EventAnalyticsDto } from "@ingressoimpresso/api-types";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, CircleDollarSign, LogIn, Receipt, ShieldCheck, Smartphone, Ticket, Wallet } from "lucide-react";

import { BarChart } from "@/components/admin/bar-chart";
import { Card, CardHeader, Skeleton, Stat } from "@/components/ui";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import { texts } from "@/texts/pt-BR";

const t = texts.event.results;

/** `22:15` of an RFC 3339 instant, in its own offset (the event's local time). */
function clock(iso: string): string {
  return iso.slice(11, 16);
}

function percent(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 100);
}

/** What the event sold, cost and how the door went (ADR 0034). */
export function EventResults({ eventId }: { eventId: string }) {
  const results = useQuery({
    queryKey: ["analytics", eventId],
    queryFn: () => api<EventAnalyticsDto>(`/api/events/${eventId}/analytics`),
    refetchInterval: 30_000,
  });
  if (results.isPending) {
    return <Skeleton className="h-72 w-full rounded-2xl" />;
  }
  if (results.isError || results.data.paidTickets === 0) {
    return null;
  }
  const r = results.data;
  const peak = r.timeline.reduce<(typeof r.timeline)[number] | null>((best, bar) => (best === null || bar.entries > best.entries ? bar : best), null);

  return (
    <Card>
      <CardHeader icon={BarChart3} title={t.title} description={t.subtitle} />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label={t.sold} value={r.sold.toLocaleString("pt-BR")} hint={t.soldHint(r.paidTickets, percent(r.sold, r.paidTickets))} icon={Ticket} />
        <Stat
          label={t.gross}
          value={r.grossCents === null ? t.noPrice : money(r.grossCents)}
          hint={r.ticketPriceCents === null ? t.noPriceHint : t.grossHint(money(r.ticketPriceCents))}
          icon={CircleDollarSign}
          tone="success"
        />
        <Stat label={t.cost} value={money(r.costCents)} hint={t.costHint(r.freeTickets)} icon={Receipt} />
        <Stat
          label={t.net}
          value={r.netCents === null ? "—" : money(r.netCents)}
          hint={t.netHint}
          icon={Wallet}
          tone={r.netCents !== null && r.netCents < 0 ? "danger" : "success"}
        />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_16rem]">
        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold text-fg">{t.chartTitle}</p>
          {r.timeline.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border-strong px-4 py-8 text-center text-sm text-fg-muted">{t.chartEmpty}</p>
          ) : (
            <BarChart
              label={t.chartTitle}
              bars={r.timeline.map((bar) => ({ date: bar.at, value: bar.entries }))}
              format={(value) => t.entriesValue(value)}
              describe={t.chartBar}
              formatLabel={clock}
            />
          )}
          {peak !== null && peak.entries > 0 && <p className="text-xs text-fg-muted">{t.peak(clock(peak.at), peak.entries)}</p>}
        </div>
        <ul className="flex flex-col gap-3 text-sm">
          <li className="flex items-center gap-3 rounded-xl bg-surface-2 px-4 py-3">
            <LogIn className="size-4 text-success" aria-hidden />
            <span className="flex flex-col">
              <span className="font-semibold text-fg">{`${String(percent(r.entries, r.sold))}% ${t.attendance.toLowerCase()}`}</span>
              <span className="text-xs text-fg-muted">{t.attendanceHint(r.entries)}</span>
            </span>
          </li>
          <li className="flex items-center gap-3 rounded-xl bg-surface-2 px-4 py-3">
            <ShieldCheck className="size-4 text-brand" aria-hidden />
            <span className="text-fg">{t.blocked(r.blockedCopies)}</span>
          </li>
          {r.digitalTickets > 0 && (
            <li className="flex items-center gap-3 rounded-xl bg-surface-2 px-4 py-3">
              <Smartphone className="size-4 text-brand" aria-hidden />
              <span className="text-fg">{t.digital(r.digitalTickets, r.digitalOpened)}</span>
            </li>
          )}
        </ul>
      </div>
    </Card>
  );
}
