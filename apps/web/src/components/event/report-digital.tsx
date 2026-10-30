"use client";

import type { EventReportDto } from "@ingressoimpresso/api-types";
import { Eye, LogIn, PackageOpen, Send, Smartphone } from "lucide-react";

import { useEventTexts } from "@/components/event/access";
import type { SelectTab } from "@/components/event/tabs";
import { Button, Card, CardHeader, TableScroll } from "@/components/ui";
import { money } from "@/lib/format";

/** One small figure of the digital sales card. */
function Figure({ icon: Icon, label, value, hint }: { icon: typeof Send; label: string; value: string; hint?: string | undefined }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-xl border border-border bg-surface-2/50 px-3.5 py-3">
      <dt className="flex items-center gap-1.5 text-xs font-medium text-fg-muted">
        <Icon aria-hidden className="size-3.5 shrink-0" />
        {label}
      </dt>
      <dd className="text-lg font-semibold tracking-tight text-fg tabular">{value}</dd>
      {hint !== undefined && <dd className="text-xs text-fg-subtle">{hint}</dd>}
    </div>
  );
}

/**
 * The digital tickets the organization sent itself (ADR 0124): how many, what they are worth,
 * opened and entered, by category. Each one is a sale of the organization, at its category's
 * price.
 */
export function DigitalSales({ report, onSelect }: { report: EventReportDto; onSelect: SelectTab }) {
  const t = useEventTexts().report.digital;
  const d = report.digital;
  const rows = report.categories.filter((row) => row.digital > 0);
  const percent = (part: number) => (d.tickets === 0 ? "" : t.share(Math.round((part / d.tickets) * 100)));
  return (
    <Card padded={false} className="overflow-hidden">
      <div className="flex flex-col gap-4 px-5 pt-5 pb-4">
        <CardHeader
          title={t.title}
          icon={Smartphone}
          className="mb-0"
          description={report.digitalOnly ? t.descriptionOnly : t.description}
          actions={
            <Button
              size="sm"
              variant="secondary"
              icon={<Send />}
              onClick={() => {
                onSelect("digital");
              }}
            >
              {t.open}
            </Button>
          }
        />
        <dl className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
          <Figure icon={Send} label={t.sent} value={d.tickets.toLocaleString("pt-BR")} hint={d.courtesies > 0 ? t.courtesies(d.courtesies) : undefined} />
          <Figure
            icon={Smartphone}
            label={t.amount}
            value={d.amountCents === null ? "—" : money(d.amountCents)}
            hint={d.amountCents === null ? t.unpriced : d.pixCents > 0 ? t.pix(money(d.pixCents)) : undefined}
          />
          <Figure icon={Eye} label={t.opened} value={d.opened.toLocaleString("pt-BR")} hint={percent(d.opened)} />
          <Figure icon={LogIn} label={t.entries} value={d.entries.toLocaleString("pt-BR")} hint={percent(d.entries)} />
        </dl>
        {report.digitalOnly && (
          <p className="flex items-center gap-2 text-sm text-fg-muted">
            <PackageOpen aria-hidden className="size-4 shrink-0 text-fg-subtle" />
            {t.free(d.free)}
          </p>
        )}
      </div>
      {rows.length > 0 && (
        <TableScroll label={t.byCategory}>
          <table aria-label={t.byCategory} className="w-full min-w-[30rem] text-sm">
            <thead className="border-y border-border bg-surface-2 text-left text-xs font-medium text-fg-muted">
              <tr>
                <th className="py-2.5 pr-2 pl-5 font-medium">{t.category}</th>
                <th className="px-2 py-2.5 text-right font-medium">{t.price}</th>
                <th className="px-2 py-2.5 text-right font-medium">{t.sent}</th>
                <th className="py-2.5 pr-5 pl-2 text-right font-medium">{t.amount}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.categoryId ?? "none"}>
                  <td className="py-2.5 pr-2 pl-5">
                    <span className="flex items-center gap-2 font-medium text-fg">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: row.color ?? "var(--border-strong)" }} aria-hidden />
                      {row.name ?? t.none}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-right text-fg-muted tabular">{row.priceCents === null ? "—" : money(row.priceCents)}</td>
                  <td className="px-2 py-2.5 text-right tabular">{row.digital.toLocaleString("pt-BR")}</td>
                  <td className="py-2.5 pr-5 pl-2 text-right font-medium tabular">{row.digitalAmountCents === null ? "—" : money(row.digitalAmountCents)}</td>
                </tr>
              ))}
              <tr className="bg-surface-2 font-semibold">
                <td className="py-2.5 pr-2 pl-5">{t.total}</td>
                <td />
                <td className="px-2 py-2.5 text-right tabular">{d.tickets.toLocaleString("pt-BR")}</td>
                <td className="py-2.5 pr-5 pl-2 text-right tabular">{d.amountCents === null ? "—" : money(d.amountCents)}</td>
              </tr>
            </tbody>
          </table>
        </TableScroll>
      )}
    </Card>
  );
}
