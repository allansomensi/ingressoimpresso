"use client";

import type { EventReportDto, ReportRowDto } from "@ingressoimpresso/api-types";
import { useQuery } from "@tanstack/react-query";

import { Button, ErrorMessage } from "@/components/ui";
import { api } from "@/lib/api";
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

export function ReportTab({ eventId }: { eventId: string }) {
  const report = useQuery({
    queryKey: ["report", eventId],
    queryFn: () => api<EventReportDto>(`/api/events/${eventId}/report`),
    // Entries keep arriving while the door works.
    refetchInterval: 30_000,
  });

  if (report.isPending) {
    return <p className="text-sm opacity-70">{texts.common.loading}</p>;
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
    <div className="flex flex-col gap-4">
      <p className="text-sm opacity-80">{t.intro}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => { download(data); }}>{t.csv}</Button>
        <Button variant="secondary" onClick={() => void report.refetch()} disabled={report.isFetching}>
          {t.refresh}
        </Button>
        <span className="text-xs opacity-70">
          {t.generatedAt(new Date(data.generatedAt).toLocaleTimeString("pt-BR", { timeStyle: "short" }))}
          {data.ticketPriceCents === null && ` · ${t.noPrice}`}
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
        <table className="w-full min-w-[46rem] text-sm">
          <thead className="bg-black/5 text-left text-xs dark:bg-white/10">
            <tr>
              <th className="p-2">{t.seller}</th>
              {COLUMNS.map((column) => (
                <th key={column} className="px-1.5 py-2 text-right" title={t.hints[column]}>
                  {t.columns[column]}
                </th>
              ))}
              <th className="p-2 text-right">{t.amountDue}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map(([row, kind]) => (
              <tr
                key={row.sellerId ?? kind}
                className={`border-t border-black/10 dark:border-white/15 ${kind === "totals" ? "font-bold" : ""} ${kind === "unassigned" ? "opacity-70" : ""}`}
              >
                <td className="p-2">{lineName(row, kind)}</td>
                {COLUMNS.map((column) => (
                  <td
                    key={column}
                    className={`px-1.5 py-2 text-right font-mono ${(column === "offlineDuplicates" || column === "voidEntries") && row[column] > 0 ? "text-red-700 dark:text-red-400" : ""}`}
                  >
                    {row[column]}
                  </td>
                ))}
                <td className="whitespace-nowrap p-2 text-right font-mono">{money(row.amountDueCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">{t.door}</h2>
        <p className="text-sm">{t.rejected(data.invalidScans, data.otherEventScans)}</p>
        {data.devices.length === 0 ? (
          <p className="text-sm opacity-70">{t.noDevices}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
            <table className="w-full min-w-[36rem] text-sm">
              <thead className="bg-black/5 text-left dark:bg-white/10">
                <tr>
                  <th className="p-2">{t.device}</th>
                  <th className="p-2 text-right">{t.deviceColumns.scans}</th>
                  <th className="p-2 text-right">{t.deviceColumns.firstEntries}</th>
                  <th className="p-2 text-right">{t.deviceColumns.offlineDuplicates}</th>
                  <th className="p-2 text-right">{t.deviceColumns.blockedCopies}</th>
                  <th className="p-2 text-right">{t.deviceColumns.invalid}</th>
                </tr>
              </thead>
              <tbody>
                {data.devices.map((device) => (
                  <tr key={device.name} className="border-t border-black/10 dark:border-white/15">
                    <td className="p-2">{device.name}</td>
                    <td className="p-2 text-right font-mono">{device.scans}</td>
                    <td className="p-2 text-right font-mono">{device.firstEntries}</td>
                    <td className="p-2 text-right font-mono">{device.offlineDuplicates}</td>
                    <td className="p-2 text-right font-mono">{device.blockedCopies}</td>
                    <td className="p-2 text-right font-mono">{device.invalid}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
