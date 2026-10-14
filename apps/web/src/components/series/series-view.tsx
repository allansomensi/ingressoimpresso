"use client";

import type { SeriesDateDto, SeriesDto, SeriesNumbersDto, SeriesSellerDto } from "@ingressoimpresso/api-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarPlus, CalendarRange, ChevronLeft, ChevronRight, LifeBuoy, LogIn, Pencil, SearchX, Ticket, TrendingUp, Wallet } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { AddDateDialog } from "@/components/event/add-date";
import { Meter } from "@/components/event/live-chart";
import { MissingBadge, PhaseBadge } from "@/components/panel/event-phase";
import { Alert, Button, ButtonLink, Card, Dialog, EmptyState, ErrorMessage, Field, Input, Skeleton, Stat, TableScroll } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { eventPhase } from "@/lib/event-list";
import { dateParts, money } from "@/lib/format";
import { dayLabel, hourLabel } from "@/lib/series";
import { admin as adminTexts, common as commonTexts, event as eventTexts, meta as metaTexts, series as seriesTexts } from "@/texts/pt-BR";

const t = seriesTexts;
const count = (value: number) => value.toLocaleString("pt-BR");
const cents = (value: number | null) => (value === null ? t.none : money(value));
const percent = (part: number, whole: number) => (whole === 0 ? 0 : Math.round((part / whole) * 100));

/** The series page (ADR 0077): every date side by side, the totals and the sellers by name. */
export function SeriesView({ seriesId }: { seriesId: string }) {
  const series = useQuery({
    queryKey: ["series", seriesId],
    queryFn: () => (seriesId === "" ? Promise.reject(new ApiError(404, "not_found")) : api<SeriesDto>(`/api/series/${seriesId}`)),
  });
  // Judged when the data arrives (rendering stays pure).
  const now = series.dataUpdatedAt;
  const name = series.data?.name;
  useEffect(() => {
    if (name !== undefined) {
      document.title = `${name} · ${metaTexts.title}`;
    }
  }, [name]);

  const back = (
    <Link
      href="/painel"
      className="-ml-1.5 inline-flex min-h-9 w-fit items-center gap-1 rounded-lg px-1.5 text-sm font-medium text-fg-muted transition hover:text-fg active:bg-surface-2 pointer-coarse:min-h-10"
    >
      <ChevronLeft className="size-4" aria-hidden />
      {t.back}
    </Link>
  );

  if (series.isPending) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label={commonTexts.loading}>
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-72 max-w-full" />
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <Skeleton key={item} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }
  if (series.isError) {
    if (series.error instanceof ApiError && series.error.status === 404) {
      return (
        <EmptyState
          icon={SearchX}
          title={t.notFoundTitle}
          description={t.notFound}
          action={
            <ButtonLink href="/painel" variant="secondary" icon={<ArrowLeft />}>
              {eventTexts.backToEvents}
            </ButtonLink>
          }
        />
      );
    }
    return <ErrorMessage error={series.error} />;
  }
  return <SeriesContent data={series.data} now={now} back={back} />;
}

function SeriesContent({ data, now, back }: { data: SeriesDto; now: number; back: React.ReactNode }) {
  const [dialog, setDialog] = useState<"rename" | "date" | null>(null);
  const close = () => {
    setDialog(null);
  };
  const totals = data.totals;
  const latest = data.dates.at(-1)?.event;
  const total = data.dates.length + data.hiddenDates;

  return (
    <main className="flex flex-col gap-6 animate-fade-in">
      {data.supportAccess && (
        <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning-fg">
          <LifeBuoy className="size-4 shrink-0" aria-hidden />
          <span className="flex-1">{adminTexts.support.banner}</span>
        </div>
      )}
      <div className="flex flex-col gap-2">
        {back}
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-brand uppercase">
              <CalendarRange className="size-3.5" aria-hidden />
              {t.kicker}
            </span>
            <h1 className="text-[1.375rem] leading-tight font-semibold tracking-tight text-balance text-fg sm:text-3xl">{data.name}</h1>
            <p className="text-sm text-fg-muted">{t.subtitle(total, data.organizationName)}</p>
          </div>
          {data.canManage && (
            <div className="flex flex-wrap items-center gap-2 max-sm:w-full">
              <Button
                variant="secondary"
                icon={<Pencil />}
                className="max-sm:flex-1"
                onClick={() => {
                  setDialog("rename");
                }}
              >
                {t.rename}
              </Button>
              {latest !== undefined && (
                <Button
                  icon={<CalendarPlus />}
                  className="max-sm:flex-1"
                  onClick={() => {
                    setDialog("date");
                  }}
                >
                  {t.addDate}
                </Button>
              )}
            </div>
          )}
        </header>
      </div>

      {data.hiddenDates > 0 && <Alert tone="brand">{t.hidden(data.dates.length, total)}</Alert>}

      <section aria-label={t.totalsTitle} className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label={t.stats.tickets} value={count(totals.tickets)} icon={Ticket} />
        <Stat
          label={t.stats.sold}
          value={count(totals.sold)}
          hint={totals.tickets > 0 ? t.stats.soldHint(percent(totals.sold, totals.tickets)) : undefined}
          icon={Wallet}
        />
        <Stat
          label={t.stats.entries}
          value={count(totals.entries)}
          hint={totals.sold > 0 ? t.stats.entriesHint(percent(totals.entries, totals.sold)) : undefined}
          icon={LogIn}
          tone="success"
        />
        <Stat
          label={t.stats.net}
          value={totals.netCents === null ? t.stats.noPrice : money(totals.netCents)}
          hint={t.stats.netHint}
          icon={TrendingUp}
          tone={totals.netCents !== null && totals.netCents < 0 ? "danger" : "brand"}
        />
      </section>

      <DatesCard dates={data.dates} totals={totals} now={now} />
      <SellersCard sellers={data.sellers} />

      <RenameDialog series={data} open={dialog === "rename"} onClose={close} />
      {latest !== undefined && <AddDateDialog event={latest} open={dialog === "date"} onClose={close} />}
    </main>
  );
}

/** "sáb 12/11 · 20h", and the date's own name when it differs from the series'. */
function DateTitle({ date }: { date: SeriesDateDto }) {
  const own = date.event.series !== null && date.event.name !== date.event.series.name;
  return (
    <span className="flex min-w-0 flex-col">
      <span className="font-semibold whitespace-nowrap text-fg tabular">
        <span className="font-normal text-fg-muted">{dateParts(date.event.startsAt).weekday}</span> {dayLabel(date.event.startsAt)} ·{" "}
        {hourLabel(date.event.startsAt)}
      </span>
      {own && <span className="truncate text-xs text-fg-muted">{date.event.name}</span>}
    </span>
  );
}

function SoldCell({ numbers }: { numbers: SeriesNumbersDto }) {
  const share = numbers.tickets === 0 ? 0 : numbers.sold / numbers.tickets;
  return (
    <span className="flex flex-col items-end gap-1.5">
      <span className="font-mono text-fg tabular">{count(numbers.sold)}</span>
      <Meter value={share} label={t.soldBar(count(numbers.sold), count(numbers.tickets))} className="h-1.5 w-20" />
    </span>
  );
}

function Net({ value }: { value: number | null }) {
  if (value === null) {
    return <span className="text-fg-subtle">{t.none}</span>;
  }
  return <span className={cn("font-semibold", value < 0 ? "text-danger-fg" : "text-fg")}>{money(value)}</span>;
}

/** Every date side by side: a table on larger screens, a card per date on phones. */
function DatesCard({ dates, totals, now }: { dates: SeriesDateDto[]; totals: SeriesNumbersDto; now: number }) {
  const c = t.columns;
  return (
    <Card padded={false} className="overflow-hidden">
      <div className="flex flex-col gap-0.5 px-5 pt-5 pb-4">
        <h2 className="text-base font-semibold tracking-tight text-fg">{t.datesTitle}</h2>
        <p className="text-sm leading-relaxed text-fg-muted">{t.datesSubtitle}</p>
      </div>

      {/* Phones: one card per date. */}
      <ul className="flex flex-col gap-3 px-4 pb-4 sm:hidden">
        {dates.map((date) => (
          <li key={date.event.id}>
            <Link
              href={`/painel/eventos/${date.event.id}`}
              className="flex flex-col gap-3 rounded-xl border border-border bg-bg p-3.5 transition active:bg-surface-2"
            >
              <span className="flex items-start justify-between gap-3">
                <DateTitle date={date} />
                <span className="flex items-center gap-1">
                  <ChevronRight className="size-4 text-fg-subtle" aria-hidden />
                </span>
              </span>
              <span className="flex flex-wrap gap-1.5">
                <PhaseBadge phase={eventPhase(date.event, now)} dot={false} />
                <MissingBadge count={date.event.checklistMissing} />
              </span>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex flex-col gap-1 rounded-lg bg-surface-2 px-3 py-2">
                  <dt className="text-xs text-fg-muted">{c.sold}</dt>
                  <dd className="flex flex-col gap-1.5">
                    <span className="font-semibold text-fg tabular">
                      {count(date.numbers.sold)} <span className="font-normal text-fg-muted">/ {count(date.numbers.tickets)}</span>
                    </span>
                    <Meter
                      value={date.numbers.tickets === 0 ? 0 : date.numbers.sold / date.numbers.tickets}
                      label={t.soldBar(count(date.numbers.sold), count(date.numbers.tickets))}
                      className="h-1.5"
                    />
                  </dd>
                </div>
                <div className="flex flex-col gap-1 rounded-lg bg-surface-2 px-3 py-2">
                  <dt className="text-xs text-fg-muted">{c.entries}</dt>
                  <dd className="font-semibold text-fg tabular">{count(date.numbers.entries)}</dd>
                </div>
                <div className="flex flex-col gap-1 rounded-lg bg-surface-2 px-3 py-2">
                  <dt className="text-xs text-fg-muted">{c.due}</dt>
                  <dd className="font-semibold text-fg tabular">{cents(date.numbers.amountDueCents)}</dd>
                </div>
                <div className="flex flex-col gap-1 rounded-lg bg-surface-2 px-3 py-2">
                  <dt className="text-xs text-fg-muted">{c.net}</dt>
                  <dd className="tabular">
                    <Net value={date.numbers.netCents} />
                  </dd>
                </div>
              </dl>
            </Link>
          </li>
        ))}
        <li className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-3.5 py-3 text-sm">
          <span className="font-semibold text-fg">{t.total}</span>
          <span className="text-right text-fg-muted tabular">
            {count(totals.sold)} {c.sold.toLowerCase()} · <Net value={totals.netCents} />
          </span>
        </li>
      </ul>

      {/* Larger screens: a comparison table. */}
      <TableScroll label={t.datesTitle} className="max-sm:hidden">
        <table aria-label={t.datesTitle} className="w-full min-w-[52rem] text-sm">
          <thead className="border-y border-border bg-surface-2 text-left text-xs font-medium text-fg-muted">
            <tr>
              <th className="py-2.5 pr-2 pl-5 font-medium">{c.date}</th>
              <th className="px-2 py-2.5 text-right font-medium">{c.tickets}</th>
              <th className="px-2 py-2.5 text-right font-medium">{c.sold}</th>
              <th className="px-2 py-2.5 text-right font-medium">{c.entries}</th>
              <th className="px-2 py-2.5 text-right font-medium">{c.due}</th>
              <th className="px-2 py-2.5 text-right font-medium">{c.received}</th>
              <th className="px-2 py-2.5 text-right font-medium">{c.cost}</th>
              <th className="py-2.5 pr-5 pl-2 text-right font-medium">{c.net}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {dates.map((date) => (
              <tr key={date.event.id} className="transition hover:bg-surface-2/60">
                <td className="py-3 pr-2 pl-5">
                  <Link href={`/painel/eventos/${date.event.id}`} className="group flex items-center gap-3 rounded-lg">
                    <span className="min-w-0">
                      <DateTitle date={date} />
                    </span>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <PhaseBadge phase={eventPhase(date.event, now)} dot={false} />
                      <MissingBadge count={date.event.checklistMissing} />
                    </span>
                    <ChevronRight aria-hidden className="size-4 shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </td>
                <td className="px-2 py-3 text-right font-mono text-fg tabular">{count(date.numbers.tickets)}</td>
                <td className="px-2 py-3 text-right">
                  <SoldCell numbers={date.numbers} />
                </td>
                <td className="px-2 py-3 text-right font-mono text-fg tabular">{count(date.numbers.entries)}</td>
                <td className="px-2 py-3 text-right font-mono whitespace-nowrap text-fg tabular">{cents(date.numbers.amountDueCents)}</td>
                <td className="px-2 py-3 text-right font-mono whitespace-nowrap text-fg tabular">{money(date.numbers.receivedCents)}</td>
                <td className="px-2 py-3 text-right font-mono whitespace-nowrap text-fg-muted tabular">{money(date.numbers.costCents)}</td>
                <td className="py-3 pr-5 pl-2 text-right font-mono whitespace-nowrap tabular">
                  <Net value={date.numbers.netCents} />
                </td>
              </tr>
            ))}
            <tr className="bg-surface-2 font-semibold">
              <td className="py-3 pr-2 pl-5 text-fg">{t.total}</td>
              <td className="px-2 py-3 text-right font-mono text-fg tabular">{count(totals.tickets)}</td>
              <td className="px-2 py-3 text-right">
                <SoldCell numbers={totals} />
              </td>
              <td className="px-2 py-3 text-right font-mono text-fg tabular">{count(totals.entries)}</td>
              <td className="px-2 py-3 text-right font-mono whitespace-nowrap text-fg tabular">{cents(totals.amountDueCents)}</td>
              <td className="px-2 py-3 text-right font-mono whitespace-nowrap text-fg tabular">{money(totals.receivedCents)}</td>
              <td className="px-2 py-3 text-right font-mono whitespace-nowrap text-fg-muted tabular">{money(totals.costCents)}</td>
              <td className="py-3 pr-5 pl-2 text-right font-mono whitespace-nowrap tabular">
                <Net value={totals.netCents} />
              </td>
            </tr>
          </tbody>
        </table>
      </TableScroll>
    </Card>
  );
}

function Balance({ value }: { value: number | null }) {
  if (value === null) {
    return <span className="text-fg-subtle">{t.none}</span>;
  }
  if (value > 0) {
    return <span className="font-semibold text-warning-fg">{money(value)}</span>;
  }
  if (value < 0) {
    return <span className="text-brand">{eventTexts.report.overpaid(money(-value))}</span>;
  }
  return <span className="font-medium text-success-fg">{eventTexts.report.settled}</span>;
}

/** Sellers of every date, one line per name. */
function SellersCard({ sellers }: { sellers: SeriesSellerDto[] }) {
  const c = t.sellerColumns;
  return (
    <Card padded={false} className="overflow-hidden">
      <div className="flex flex-col gap-0.5 px-5 pt-5 pb-4">
        <h2 className="text-base font-semibold tracking-tight text-fg">{t.sellersTitle}</h2>
        <p className="text-sm leading-relaxed text-fg-muted">{t.sellersSubtitle}</p>
      </div>
      {sellers.length === 0 ? (
        <p className="border-t border-border px-5 py-6 text-center text-sm text-fg-muted">{t.noSellers}</p>
      ) : (
        <TableScroll label={t.sellersTitle}>
          <table aria-label={t.sellersTitle} className="w-full min-w-[40rem] text-sm">
            <thead className="border-y border-border bg-surface-2 text-left text-xs font-medium text-fg-muted">
              <tr>
                <th className="py-2.5 pr-2 pl-5 font-medium">{c.name}</th>
                <th className="px-2 py-2.5 text-right font-medium">{c.dates}</th>
                <th className="px-2 py-2.5 text-right font-medium">{c.tickets}</th>
                <th className="px-2 py-2.5 text-right font-medium">{c.sold}</th>
                <th className="px-2 py-2.5 text-right font-medium">{c.due}</th>
                <th className="px-2 py-2.5 text-right font-medium">{c.received}</th>
                <th className="py-2.5 pr-5 pl-2 text-right font-medium">{c.balance}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sellers.map((seller) => (
                <tr key={seller.name}>
                  <td className="py-3 pr-2 pl-5 font-medium text-fg">{seller.name}</td>
                  <td className="px-2 py-3 text-right font-mono text-fg-muted tabular">{seller.dates === 0 ? t.none : seller.dates}</td>
                  <td className="px-2 py-3 text-right font-mono text-fg tabular">{count(seller.tickets)}</td>
                  <td className="px-2 py-3 text-right font-mono text-fg tabular">{count(seller.sold)}</td>
                  <td className="px-2 py-3 text-right font-mono whitespace-nowrap text-fg tabular">{cents(seller.amountDueCents)}</td>
                  <td className="px-2 py-3 text-right font-mono whitespace-nowrap text-fg tabular">{money(seller.receivedCents)}</td>
                  <td className="py-3 pr-5 pl-2 text-right font-mono whitespace-nowrap tabular">
                    <Balance value={seller.balanceCents} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
    </Card>
  );
}

function RenameDialog({ series, open, onClose }: { series: SeriesDto; open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title={t.renameTitle} description={t.renameHint}>
      {open && <RenameForm series={series} onClose={onClose} />}
    </Dialog>
  );
}

function RenameForm({ series, onClose }: { series: SeriesDto; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(series.name);
  const save = useMutation({
    mutationFn: () => api<SeriesDto>(`/api/series/${series.id}`, { method: "PUT", body: { name: name.trim() } }),
    onSuccess: (saved) => {
      toast.success(t.renamed);
      queryClient.setQueryData(["series", saved.id], saved);
      void queryClient.invalidateQueries({ queryKey: ["events"] });
      void queryClient.invalidateQueries({ queryKey: ["event"] });
      onClose();
    },
  });
  const submit = (formEvent: FormEvent) => {
    formEvent.preventDefault();
    save.mutate();
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label={t.name}>
        <Input
          value={name}
          required
          maxLength={100}
          autoComplete="off"
          enterKeyHint="done"
          onChange={(e) => {
            setName(e.target.value);
          }}
        />
      </Field>
      <ErrorMessage error={save.error} />
      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose}>
          {commonTexts.cancel}
        </Button>
        <Button type="submit" loading={save.isPending} disabled={name.trim() === "" || name.trim() === series.name}>
          {commonTexts.save}
        </Button>
      </div>
    </form>
  );
}
