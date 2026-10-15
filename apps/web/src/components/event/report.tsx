"use client";

import type { EventReportDto, ReportCategoryDto, ReportRowDto } from "@ingressoimpresso/api-types";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Download, HandCoins, Info, RefreshCw, Smartphone, Ticket, Users, Wallet } from "lucide-react";

import { Button, Card, CardHeader, ErrorMessage, Lead, LoadingBlock, Stat, TableScroll } from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { money as formatMoney } from "@/lib/format";
import { settlementTotals } from "@/lib/settlement";
import { Accountability } from "@/components/event/accountability";
import { useLivePolling } from "@/components/event/live-polling";
import type { SelectTab } from "@/components/event/tabs";
import { useEventTexts, type EventTexts } from "@/components/event/access";


/** Settlement columns of a report line, in display and CSV order (money comes after them). */
const SETTLEMENT_COLUMNS = ["tickets", "unsold", "lost", "revoked", "declaredSold", "markedSold", "reserved"] as const satisfies readonly (keyof ReportRowDto)[];
/** Door columns of a report line. */
const DOOR_COLUMNS = ["entries", "offlineDuplicates", "blockedCopies", "voidEntries"] as const satisfies readonly (keyof ReportRowDto)[];

type LineKind = "seller" | "unassigned" | "totals";

function money(cents: number | null): string {
  return cents === null ? "—" : formatMoney(cents);
}

function lineName(t: EventTexts["report"], row: ReportRowDto, kind: LineKind): string {
  return kind === "seller" ? (row.seller ?? "") : kind === "unassigned" ? t.unassigned : t.totals;
}

/** The sellers' lines added up: the unassigned tickets are nobody's settlement. */
function sellersTotal(rows: readonly ReportRowDto[]): ReportRowDto {
  const sum = (pick: (row: ReportRowDto) => number) => rows.reduce((total, row) => total + pick(row), 0);
  const due = rows.some((row) => row.amountDueCents !== null) ? sum((row) => row.amountDueCents ?? 0) : null;
  return {
    sellerId: null,
    seller: null,
    tickets: sum((row) => row.tickets),
    unsold: sum((row) => row.unsold),
    lost: sum((row) => row.lost),
    revoked: sum((row) => row.revoked),
    declaredSold: sum((row) => row.declaredSold),
    entries: sum((row) => row.entries),
    offlineDuplicates: sum((row) => row.offlineDuplicates),
    blockedCopies: sum((row) => row.blockedCopies),
    voidEntries: sum((row) => row.voidEntries),
    amountDueCents: due,
    receivedCents: sum((row) => row.receivedCents),
    pixCents: sum((row) => row.pixCents),
    balanceCents: due === null ? null : due - sum((row) => row.receivedCents),
    markedSold: sum((row) => row.markedSold),
    reserved: sum((row) => row.reserved),
    boxOffice: false,
  };
}

function lines(report: EventReportDto): [ReportRowDto, LineKind][] {
  return [
    ...report.sellers.map((row): [ReportRowDto, "seller"] => [row, "seller"]),
    [report.unassigned, "unassigned"],
    [report.totals, "totals"],
  ];
}

/** Spreadsheet-friendly CSV: `;` separators and a BOM, as Brazilian Excel expects. */
function toCsv(t: EventTexts["report"], report: EventReportDto): string {
  // Text starting like a formula (=, +, -, @) is kept as text by Excel/Sheets with a leading '.
  const quote = (value: string) => `"${(/^[=+\-@\t\r]/.test(value) ? `'${value}` : value).replaceAll('"', '""')}"`;
  const amount = (cents: number | null) => (cents === null ? "" : (cents / 100).toFixed(2).replace(".", ","));
  const header = [
    t.seller,
    ...SETTLEMENT_COLUMNS.map((column) => t.columns[column]),
    t.amountDue,
    t.received,
    t.balance,
    ...DOOR_COLUMNS.map((column) => t.columns[column]),
  ];
  const body = lines(report).map(([row, kind]) =>
    [
      quote(lineName(t, row, kind)),
      ...SETTLEMENT_COLUMNS.map((column) => String(row[column])),
      amount(row.amountDueCents),
      amount(row.receivedCents),
      amount(row.balanceCents),
      ...DOOR_COLUMNS.map((column) => String(row[column])),
    ].join(";"),
  );
  return `\uFEFF${[header.map(quote).join(";"), ...body].join("\r\n")}\r\n`;
}

function download(t: EventTexts["report"], report: EventReportDto) {
  const url = URL.createObjectURL(new Blob([toCsv(t, report)], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = t.fileName;
  link.click();
  // Safari starts the download asynchronously: revoke the URL only afterwards.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 30_000);
}

const ALERT_COLUMNS = new Set<string>(["offlineDuplicates", "voidEntries"]);

/** The balance cell: what is missing, settled, or paid beyond. */
function Balance({ cents }: { cents: number | null }) {
  const t = useEventTexts().report;
  if (cents === null) {
    return <span className="text-fg-subtle">—</span>;
  }
  if (cents > 0) {
    return <span className="font-semibold text-warning-fg">{formatMoney(cents)}</span>;
  }
  if (cents < 0) {
    return <span className="text-brand">{t.overpaid(formatMoney(-cents))}</span>;
  }
  return <span className="font-medium text-success-fg">{t.settled}</span>;
}

/** The total balance: what is still to collect, and apart, what some sellers paid beyond. */
function TotalBalance({ outstanding, overpaid }: { outstanding: number | null; overpaid: number }) {
  const t = useEventTexts().report;
  if (outstanding === null) {
    return <span className="text-fg-subtle">—</span>;
  }
  return (
    <span className="flex flex-col items-end">
      {outstanding > 0 ? <span className="text-warning-fg">{formatMoney(outstanding)}</span> : <span className="text-success-fg">{t.settled}</span>}
      {overpaid > 0 && <span className="text-xs font-normal text-brand">{t.overpaid(formatMoney(overpaid))}</span>}
    </span>
  );
}

function rowClass(kind: LineKind): string {
  return cn(
    "transition-colors hover:bg-surface-2/60 active:bg-surface-2/60",
    kind === "totals" && "bg-surface-2 font-semibold",
    kind === "unassigned" && "text-fg-muted",
  );
}

function HeaderCell({ column }: { column: (typeof SETTLEMENT_COLUMNS)[number] | (typeof DOOR_COLUMNS)[number] }) {
  const t = useEventTexts().report;
  return (
    <th className="px-2 py-2.5 text-right font-medium" title={t.hints[column]}>
      <span className="cursor-help border-b border-dotted border-fg-subtle/60">{t.columns[column]}</span>
    </th>
  );
}

export function ReportTab({ eventId, onSelect }: { eventId: string; onSelect: SelectTab }) {
  const t = useEventTexts().report;
  const report = useQuery({
    queryKey: ["report", eventId],
    queryFn: () => api<EventReportDto>(`/api/events/${eventId}/report`),
    // Entries keep arriving while the door works.
    refetchInterval: useLivePolling(eventId, 30_000),
  });

  if (report.isPending) {
    return <LoadingBlock rows={3} />;
  }
  if (report.isError) {
    return <ErrorMessage error={report.error} />;
  }
  const data = report.data;
  const totals = settlementTotals(data.sellers);
  const settlementLines: [ReportRowDto, LineKind][] =
    data.sellers.length === 0
      ? []
      : [...data.sellers.map((row): [ReportRowDto, "seller"] => [row, "seller"]), [sellersTotal(data.sellers), "totals"]];
  const generated = new Date(data.generatedAt).toLocaleTimeString("pt-BR", { timeStyle: "short" });
  // Amounts exist with an event price or category prices (ADR 0056).
  const priced = data.ticketPriceCents !== null || data.sellers.some((row) => row.amountDueCents !== null);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <Lead>{t.intro}</Lead>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" icon={<RefreshCw />} onClick={() => void report.refetch()} loading={report.isFetching}>
            {t.refresh}
          </Button>
          <Button size="sm" icon={<Download />} onClick={() => { download(t, data); }}>
            {t.csv}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat
          label={t.stats.issued}
          value={data.totals.tickets.toLocaleString("pt-BR")}
          icon={Ticket}
          hint={t.stats.issuedHint(data.totals.tickets - data.unassigned.tickets, data.unassigned.tickets)}
        />
        <Stat
          label={t.stats.sold}
          value={data.totals.markedSold.toLocaleString("pt-BR")}
          icon={CheckCircle2}
          tone="success"
          hint={
            data.totals.reserved > 0
              ? `${data.totals.markedSold > 0 ? t.stats.soldHint : t.stats.soldHintNone} ${t.stats.reservedHint(data.totals.reserved)}`
              : data.totals.markedSold > 0
                ? t.stats.soldHint
                : t.stats.soldHintNone
          }
        />
        <Stat
          label={t.stats.received}
          value={formatMoney(totals.receivedCents)}
          icon={HandCoins}
          tone="success"
          hint={priced ? t.stats.receivedHint(formatMoney(totals.dueCents)) : t.noPrice}
        />
        <Stat
          label={t.stats.outstanding}
          value={priced ? formatMoney(totals.outstandingCents) : "—"}
          icon={Wallet}
          tone={totals.outstandingCents === 0 ? "success" : "warning"}
          hint={
            !priced
              ? undefined
              : totals.overpaidCents > 0
                ? t.stats.overpaidHint(formatMoney(totals.overpaidCents))
                : totals.outstandingCents === 0 && totals.active > 0
                  ? t.stats.outstandingDone
                  : undefined
          }
        />
      </div>

      <Accountability eventId={eventId} />

      {data.categories.length > 0 && <CategoryTable rows={data.categories} />}

      <Card padded={false} className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-5 pb-4">
          <h2 className="text-base font-semibold tracking-tight text-fg">{t.sellersTitle}</h2>
          <span className="text-xs text-fg-subtle">{t.generatedAt(generated)}</span>
        </div>
        <TableScroll label={t.sellersTitle}>
          <table aria-label={t.sellersTitle} className="w-full min-w-[46rem] text-sm">
            <thead className="border-y border-border bg-surface-2 text-left text-xs font-medium text-fg-muted">
              <tr>
                <th className="py-2.5 pr-2 pl-5 font-medium">{t.seller}</th>
                {SETTLEMENT_COLUMNS.map((column) => (
                  <HeaderCell key={column} column={column} />
                ))}
                <th className="px-2 py-2.5 text-right font-medium">{t.amountDue}</th>
                <th className="px-2 py-2.5 text-right font-medium">{t.received}</th>
                <th className="py-2.5 pr-5 pl-2 text-right font-medium" title={t.balanceHint}>
                  <span className="cursor-help border-b border-dotted border-fg-subtle/60">{t.balance}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.sellers.length === 0 && (
                <tr>
                  <td colSpan={SETTLEMENT_COLUMNS.length + 4} className="px-5 py-6 text-center text-fg-muted">
                    {t.noSellers}
                  </td>
                </tr>
              )}
              {settlementLines.map(([row, kind]) => (
                <tr key={row.sellerId ?? kind} className={rowClass(kind)}>
                  <td className="py-3 pr-2 pl-5 text-fg">{kind === "totals" ? t.sellersTotal : lineName(t, row, kind)}</td>
                  {SETTLEMENT_COLUMNS.map((column) => (
                    <td key={column} className="px-2 py-3 text-right font-mono text-fg tabular">
                      {row[column]}
                    </td>
                  ))}
                  <td className="px-2 py-3 text-right font-mono whitespace-nowrap text-fg tabular">{money(row.amountDueCents)}</td>
                  <td className="px-2 py-3 text-right font-mono whitespace-nowrap text-fg tabular">{formatMoney(row.receivedCents)}</td>
                  <td className="py-3 pr-5 pl-2 text-right font-mono whitespace-nowrap tabular">
                    {kind === "totals" ? (
                      <TotalBalance outstanding={data.ticketPriceCents === null ? null : totals.outstandingCents} overpaid={totals.overpaidCents} />
                    ) : (
                      <Balance cents={row.balanceCents} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
        {data.unassigned.tickets > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface-2/60 px-5 py-3.5">
            <p className="flex items-center gap-2 text-sm text-fg-muted">
              <Info aria-hidden className="size-4 shrink-0 text-fg-subtle" />
              {t.unassignedNote(data.unassigned.tickets)}
            </p>
            <Button
              variant="secondary"
              size="sm"
              icon={<Users />}
              onClick={() => {
                onSelect("sellers");
              }}
            >
              {t.unassignedAction}
            </Button>
          </div>
        )}
      </Card>

      <Card padded={false} className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-5 pb-4">
          <h2 className="text-base font-semibold tracking-tight text-fg">{t.doorBySellerTitle}</h2>
          <span className="text-sm text-fg-muted tabular">{t.doorSummary(data.totals.entries, data.totals.blockedCopies)}</span>
        </div>
        <TableScroll label={t.doorBySellerTitle}>
          <table aria-label={t.doorBySellerTitle} className="w-full min-w-[34rem] text-sm">
            <thead className="border-y border-border bg-surface-2 text-left text-xs font-medium text-fg-muted">
              <tr>
                <th className="py-2.5 pr-2 pl-5 font-medium">{t.seller}</th>
                {DOOR_COLUMNS.map((column) => (
                  <HeaderCell key={column} column={column} />
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lines(data).map(([row, kind]) => (
                <tr key={row.sellerId ?? kind} className={rowClass(kind)}>
                  <td className="py-3 pr-2 pl-5 text-fg">{lineName(t, row, kind)}</td>
                  {DOOR_COLUMNS.map((column, index) => (
                    <td
                      key={column}
                      className={cn(
                        "py-3 text-right font-mono tabular",
                        index === DOOR_COLUMNS.length - 1 ? "pr-5 pl-2" : "px-2",
                        ALERT_COLUMNS.has(column) && row[column] > 0 ? "font-semibold text-danger-fg" : "text-fg",
                      )}
                    >
                      {row[column]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </Card>

      <Card padded={false} className="overflow-hidden">
        <div className="px-5 pt-5">
          <CardHeader title={t.door} icon={Smartphone} description={t.rejected(data.invalidScans, data.otherEventScans)} />
        </div>
        {data.devices.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-fg-subtle">{t.noDevices}</p>
        ) : (
          <TableScroll label={t.door}>
            <table aria-label={t.door} className="w-full min-w-[36rem] text-sm">
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
                {data.devices.map((device, index) => (
                  // Phone names are not unique: the position keeps rows apart.
                  <tr key={`${String(index)}-${device.name}`} className="hover:bg-surface-2/60 active:bg-surface-2/60">
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
          </TableScroll>
        )}
      </Card>
    </div>
  );
}

/** Paid tickets by category (ADR 0056): how many, sold, entered and the amount. */
function CategoryTable({ rows }: { rows: readonly ReportCategoryDto[] }) {
  const t = useEventTexts().report;
  const c = t.categories;
  const total = rows.reduce(
    (sum, row) => ({
      tickets: sum.tickets + row.tickets,
      sold: sum.sold + row.sold,
      entries: sum.entries + row.entries,
      amount: sum.amount === null || row.amountCents === null ? null : sum.amount + row.amountCents,
    }),
    { tickets: 0, sold: 0, entries: 0, amount: 0 as number | null },
  );
  return (
    <Card padded={false} className="overflow-hidden">
      <h2 className="px-5 pt-5 pb-4 text-base font-semibold tracking-tight text-fg">{c.title}</h2>
      <TableScroll label={c.title}>
        <table aria-label={c.title} className="w-full min-w-[38rem] text-sm">
          <thead className="border-y border-border bg-surface-2 text-left text-xs font-medium text-fg-muted">
            <tr>
              <th className="py-2.5 pr-2 pl-5 font-medium">{c.category}</th>
              <th className="px-2 py-2.5 text-right font-medium">{c.price}</th>
              <th className="px-2 py-2.5 text-right font-medium">{c.tickets}</th>
              <th className="px-2 py-2.5 text-right font-medium">{c.sold}</th>
              <th className="px-2 py-2.5 text-right font-medium">{c.entries}</th>
              <th className="py-2.5 pr-5 pl-2 text-right font-medium">{c.amount}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.categoryId ?? "none"}>
                <td className="py-2.5 pr-2 pl-5">
                  <span className="flex items-center gap-2 font-medium text-fg">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: row.color ?? "var(--border-strong)" }} aria-hidden />
                    {row.name ?? c.none}
                  </span>
                </td>
                <td className="px-2 py-2.5 text-right text-fg-muted tabular">
                  {row.priceCents === null ? "—" : row.priceCents === 0 ? c.free : formatMoney(row.priceCents)}
                </td>
                <td className="px-2 py-2.5 text-right tabular">{row.tickets.toLocaleString("pt-BR")}</td>
                <td className="px-2 py-2.5 text-right tabular">{row.sold.toLocaleString("pt-BR")}</td>
                <td className="px-2 py-2.5 text-right tabular">{row.entries.toLocaleString("pt-BR")}</td>
                <td className="py-2.5 pr-5 pl-2 text-right font-medium tabular">{money(row.amountCents)}</td>
              </tr>
            ))}
            <tr className="bg-surface-2 font-semibold">
              <td className="py-2.5 pr-2 pl-5">{c.total}</td>
              <td />
              <td className="px-2 py-2.5 text-right tabular">{total.tickets.toLocaleString("pt-BR")}</td>
              <td className="px-2 py-2.5 text-right tabular">{total.sold.toLocaleString("pt-BR")}</td>
              <td className="px-2 py-2.5 text-right tabular">{total.entries.toLocaleString("pt-BR")}</td>
              <td className="py-2.5 pr-5 pl-2 text-right tabular">{money(total.amount)}</td>
            </tr>
          </tbody>
        </table>
      </TableScroll>
    </Card>
  );
}
