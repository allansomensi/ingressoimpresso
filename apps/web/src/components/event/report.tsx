"use client";

import type { EventReportDto, ReportRowDto } from "@ingressoimpresso/api-types";
import { useQuery } from "@tanstack/react-query";
import { Ban, Download, LogIn, RefreshCw, Smartphone, Ticket, Wallet } from "lucide-react";

import { Button, Card, CardHeader, ErrorMessage, Lead, LoadingBlock, Stat } from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { texts } from "@/texts/pt-BR";

const t = texts.event.report;

/** Columns of a report line, in display and CSV order. */
const COLUMNS = [
  "tickets",
  "unsold",
  "lost",
  "revoked",
  "declaredSold",
  "entries",
  "offlineDuplicates",
  "blockedCopies",
  "voidEntries",
] as const satisfies readonly (keyof ReportRowDto)[];

function money(cents: number | null): string {
  return cents === null ? "—" : (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function lineName(row: ReportRowDto, kind: "seller" | "unassigned" | "totals"): string {
  return kind === "seller" ? (row.seller ?? "") : kind === "unassigned" ? t.unassigned : t.totals;
}

/** Spreadsheet-friendly CSV: `;` separators and a BOM, as Brazilian Excel expects. */
function toCsv(report: EventReportDto): string {
  const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const header = [t.seller, ...COLUMNS.map((column) => t.columns[column]), t.amountDue];
  const lines: [ReportRowDto, "seller" | "unassigned" | "totals"][] = [
    ...report.sellers.map((row): [ReportRowDto, "seller"] => [row, "seller"]),
    [report.unassigned, "unassigned"],
    [report.totals, "totals"],
  ];
  const body = lines.map(([row, kind]) =>
    [
      quote(lineName(row, kind)),
      ...COLUMNS.map((column) => String(row[column])),
      row.amountDueCents === null ? "" : (row.amountDueCents / 100).toFixed(2).replace(".", ","),
    ].join(";"),
  );
  return `﻿${[header.map(quote).join(";"), ...body].join("\r\n")}\r\n`;
}

function download(report: EventReportDto) {
  const url = URL.createObjectURL(new Blob([toCsv(report)], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = t.fileName;
  link.click();
  URL.revokeObjectURL(url);
}

const ALERT_COLUMNS = new Set<string>(["offlineDuplicates", "voidEntries"]);

export function ReportTab({ eventId }: { eventId: string }) {
  const report = useQuery({
    queryKey: ["report", eventId],
    queryFn: () => api<EventReportDto>(`/api/events/${eventId}/report`),
    // Entries keep arriving while the door works.
    refetchInterval: 30_000,
  });

  if (report.isPending) {
    return <LoadingBlock rows={3} />;
  }
  if (report.isError) {
    return <ErrorMessage error={report.error} />;
  }
  const data = report.data;
  const lines: [ReportRowDto, "seller" | "unassigned" | "totals"][] = [
    ...data.sellers.map((row): [ReportRowDto, "seller"] => [row, "seller"]),
    [data.unassigned, "unassigned"],
    [data.totals, "totals"],
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <Lead>{t.intro}</Lead>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" icon={<RefreshCw />} onClick={() => void report.refetch()} loading={report.isFetching}>
            {t.refresh}
          </Button>
          <Button size="sm" icon={<Download />} onClick={() => { download(data); }}>
            {t.csv}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t.stats.sold} value={data.totals.declaredSold.toLocaleString("pt-BR")} icon={Ticket} />
        <Stat label={t.stats.entries} value={data.totals.entries.toLocaleString("pt-BR")} icon={LogIn} tone="success" />
        <Stat label={t.stats.blocked} value={data.totals.blockedCopies.toLocaleString("pt-BR")} icon={Ban} tone="danger" />
        <Stat
          label={t.stats.amountDue}
          value={money(data.totals.amountDueCents)}
          icon={Wallet}
          tone="warning"
          hint={data.ticketPriceCents === null ? t.noPrice : undefined}
        />
      </div>

      <Card padded={false} className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-5 pb-4">
          <h2 className="text-base font-semibold tracking-tight text-fg">{t.sellersTitle}</h2>
          <span className="text-xs text-fg-subtle">
            {t.generatedAt(new Date(data.generatedAt).toLocaleTimeString("pt-BR", { timeStyle: "short" }))}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-sm">
            <thead className="border-y border-border bg-surface-2 text-left text-xs font-medium text-fg-muted">
              <tr>
                <th className="py-2.5 pr-2 pl-5 font-medium">{t.seller}</th>
                {COLUMNS.map((column) => (
                  <th key={column} className="px-2 py-2.5 text-right font-medium" title={t.hints[column]}>
                    <span className="cursor-help border-b border-dotted border-fg-subtle/60">{t.columns[column]}</span>
                  </th>
                ))}
                <th className="py-2.5 pr-5 pl-2 text-right font-medium">{t.amountDue}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lines.map(([row, kind]) => (
                <tr
                  key={row.sellerId ?? kind}
                  className={cn(
                    "transition-colors hover:bg-surface-2/60",
                    kind === "totals" && "bg-surface-2 font-semibold",
                    kind === "unassigned" && "text-fg-muted",
                  )}
                >
                  <td className="py-3 pr-2 pl-5 text-fg">{lineName(row, kind)}</td>
                  {COLUMNS.map((column) => (
                    <td
                      key={column}
                      className={cn(
                        "px-2 py-3 text-right font-mono tabular",
                        ALERT_COLUMNS.has(column) && row[column] > 0 ? "font-semibold text-danger-fg" : "text-fg",
                      )}
                    >
                      {row[column]}
                    </td>
                  ))}
                  <td className="py-3 pr-5 pl-2 text-right font-mono whitespace-nowrap text-fg tabular">{money(row.amountDueCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card padded={false} className="overflow-hidden">
        <div className="px-5 pt-5">
          <CardHeader title={t.door} icon={Smartphone} description={t.rejected(data.invalidScans, data.otherEventScans)} />
        </div>
        {data.devices.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-fg-subtle">{t.noDevices}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead className="border-y border-border bg-surface-2 text-left text-xs text-fg-muted">
                <tr>
                  <th className="py-2.5 pr-2 pl-5 font-medium">{t.device}</th>
                  <th className="px-2 py-2.5 text-right font-medium">{t.deviceColumns.scans}</th>
                  <th className="px-2 py-2.5 text-right font-medium">{t.deviceColumns.firstEntries}</th>
                  <th className="px-2 py-2.5 text-right font-medium">{t.deviceColumns.offlineDuplicates}</th>
                  <th className="px-2 py-2.5 text-right font-medium">{t.deviceColumns.blockedCopies}</th>
                  <th className="py-2.5 pr-5 pl-2 text-right font-medium">{t.deviceColumns.invalid}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.devices.map((device) => (
                  <tr key={device.name} className="hover:bg-surface-2/60">
                    <td className="py-3 pr-2 pl-5 text-fg">{device.name}</td>
                    <td className="px-2 py-3 text-right font-mono tabular">{device.scans}</td>
                    <td className="px-2 py-3 text-right font-mono tabular">{device.firstEntries}</td>
                    <td className="px-2 py-3 text-right font-mono tabular">{device.offlineDuplicates}</td>
                    <td className="px-2 py-3 text-right font-mono tabular">{device.blockedCopies}</td>
                    <td className="py-3 pr-5 pl-2 text-right font-mono tabular">{device.invalid}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
