"use client";

import type { CashierCloseBody, CashierClosingDto, CashierReportDto, CashierShiftDto } from "@ingressoimpresso/api-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Calculator, Lock } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useEventTexts } from "@/components/event/access";
import { Badge, Button, Card, CardHeader, Dialog, ErrorMessage, Field, Input, TableScroll } from "@/components/ui";
import { api } from "@/lib/api";
import { money, parseMoney, shortDateTime } from "@/lib/format";
import { common as commonTexts } from "@/texts/pt-BR/common";

function useCashierTexts() {
  return useEventTexts().sellers.cashier;
}

function Difference({ difference }: { difference: number | null }) {
  const t = useCashierTexts();
  if (difference === null) {
    return <Badge>{t.notCounted}</Badge>;
  }
  if (difference === 0) {
    return <Badge tone="success">{t.ok}</Badge>;
  }
  return difference < 0 ? <Badge tone="danger">{t.short(money(-difference))}</Badge> : <Badge tone="warning">{t.over(money(difference))}</Badge>;
}

/** Everything a cashier sold, closed shifts and the open one together. */
function totalOf(report: CashierReportDto): CashierShiftDto {
  const sum = { ...report.open };
  for (const item of report.closings) {
    sum.tokens += item.tokens;
    sum.cashCents += item.cashCents;
    sum.pixCents += item.pixCents;
    sum.cardCents += item.cardCents;
    sum.otherCents += item.otherCents;
  }
  return sum;
}

function Amounts({ shift }: { shift: CashierShiftDto }) {
  const t = useCashierTexts();
  const cells = [
    { label: t.cash, value: shift.cashCents },
    { label: t.pix, value: shift.pixCents },
    { label: t.card, value: shift.cardCents },
    ...(shift.otherCents > 0 ? [{ label: t.other, value: shift.otherCents }] : []),
  ];
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {cells.map((cell) => (
        <div key={cell.label} className="flex flex-col gap-0.5 rounded-xl bg-surface-2 px-3 py-2">
          <dt className="text-xs text-fg-muted">{cell.label}</dt>
          <dd className="text-[15px] font-semibold text-fg tabular">{money(cell.value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function ClosingsTable({ closings }: { closings: readonly CashierClosingDto[] }) {
  const t = useCashierTexts();
  return (
    <TableScroll label={t.closings}>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-fg-muted">
            <th className="py-2 pr-3 font-medium">{t.closedAt}</th>
            <th className="py-2 pr-3 text-right font-medium">{t.tokensColumn}</th>
            <th className="py-2 pr-3 text-right font-medium">{t.cash}</th>
            <th className="py-2 pr-3 text-right font-medium">{t.countedColumn}</th>
            <th className="py-2 pr-3 font-medium">{t.difference}</th>
            <th className="py-2 pr-3 text-right font-medium">{t.pix}</th>
            <th className="py-2 text-right font-medium">{t.card}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {closings.map((item) => (
            <tr key={item.id} className="align-top">
              <td className="py-2 pr-3 whitespace-nowrap text-fg">
                {shortDateTime(item.closedAt)}
                <span className="block text-xs text-fg-muted">{item.byOrganizer ? t.byOrganizer : t.byCashier}</span>
                {item.note !== null && <span className="block max-w-56 text-xs text-fg-muted italic">{item.note}</span>}
              </td>
              <td className="py-2 pr-3 text-right tabular">{item.tokens.toLocaleString("pt-BR")}</td>
              <td className="py-2 pr-3 text-right tabular">{money(item.cashCents)}</td>
              <td className="py-2 pr-3 text-right tabular">{item.countedCents === null ? "—" : money(item.countedCents)}</td>
              <td className="py-2 pr-3">
                <Difference difference={item.differenceCents} />
              </td>
              <td className="py-2 pr-3 text-right tabular">{money(item.pixCents)}</td>
              <td className="py-2 text-right tabular">{money(item.cardCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableScroll>
  );
}

function CloseDialog({ report, eventId, onClose }: { report: CashierReportDto; eventId: string; onClose: () => void }) {
  const t = useCashierTexts();
  const queryClient = useQueryClient();
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const typed = parseMoney(counted);
  const close = useMutation({
    mutationFn: (body: CashierCloseBody) => api<CashierReportDto>(`/api/sellers/${report.sellerId}/cashier/close`, { method: "POST", body }),
    onSuccess: (next) => {
      queryClient.setQueryData<CashierReportDto[]>(["cashiers", eventId], (list) => list?.map((item) => (item.sellerId === next.sellerId ? next : item)));
      void queryClient.invalidateQueries({ queryKey: ["ticket-sales", eventId] });
      toast.success(t.closedToast);
      onClose();
    },
  });
  return (
    <Dialog
      open
      onClose={onClose}
      title={t.closeTitle(report.name)}
      description={t.closeHint}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {commonTexts.cancel}
          </Button>
          <Button type="submit" form="cashier-close" icon={<Lock />} loading={close.isPending} disabled={!typed.ok}>
            {t.close}
          </Button>
        </>
      }
    >
      <form
        id="cashier-close"
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (typed.ok) {
            close.mutate({ countedCents: typed.cents, note: note.trim() === "" ? null : note.trim() });
          }
        }}
      >
        <div className="flex items-baseline justify-between gap-3 rounded-xl bg-surface-2 px-4 py-3">
          <span className="text-sm text-fg-muted">{t.expected}</span>
          <span className="text-lg font-semibold text-fg tabular">{money(report.open.cashCents)}</span>
        </div>
        <Field label={t.counted} optional hint={counted !== "" && !typed.ok ? <span className="text-danger-fg">{t.invalid}</span> : t.countedHint}>
          <Input
            value={counted}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0,00"
            aria-invalid={counted !== "" && !typed.ok}
            onChange={(event) => {
              setCounted(event.target.value);
            }}
          />
        </Field>
        <Field label={t.note} optional>
          <Input
            value={note}
            maxLength={200}
            onChange={(event) => {
              setNote(event.target.value);
            }}
          />
        </Field>
        <ErrorMessage error={close.error} />
      </form>
    </Dialog>
  );
}

/**
 * The token cashiers on the panel (ADR 0098): each one's open shift, the closings with the cash
 * counted against what the sales say, and the totals by how buyers paid.
 */
export function CashiersCard({ eventId, editable }: { eventId: string; editable: boolean }) {
  const t = useCashierTexts();
  const data = useQuery({ queryKey: ["cashiers", eventId], queryFn: () => api<CashierReportDto[]>(`/api/events/${eventId}/cashiers`) });
  const [closing, setClosing] = useState<CashierReportDto | null>(null);
  if (data.data === undefined) {
    return data.isError ? <ErrorMessage error={data.error} onRetry={() => void data.refetch()} /> : null;
  }
  if (data.data.length === 0) {
    return null;
  }
  return (
    <Card>
      <CardHeader title={t.title} description={t.description} icon={Calculator} />
      <div className="flex flex-col divide-y divide-border">
        {data.data.map((report) => {
          const total = totalOf(report);
          return (
            <section key={report.sellerId} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex min-w-0 flex-col">
                  <span className="font-semibold text-fg">{report.name}</span>
                  <span className="text-xs text-fg-muted">
                    {t.total}: {t.tokens(total.tokens)} · {money(total.cashCents + total.pixCents + total.cardCents + total.otherCents)}
                  </span>
                </span>
                {editable && report.open.tokens > 0 && (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<Lock />}
                    onClick={() => {
                      setClosing(report);
                    }}
                  >
                    {t.close}
                  </Button>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium text-fg">
                  {t.open}
                  <span className="font-normal text-fg-muted">
                    {" · "}
                    {t.tokens(report.open.tokens)}
                    {report.open.since !== null && ` · ${t.since(shortDateTime(report.open.since))}`}
                  </span>
                </span>
                {report.open.tokens === 0 ? <p className="text-sm text-fg-muted">{t.nothingOpen}</p> : <Amounts shift={report.open} />}
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-fg">{t.closings}</span>
                {report.closings.length === 0 ? <p className="text-sm text-fg-muted">{t.noClosings}</p> : <ClosingsTable closings={report.closings} />}
              </div>
            </section>
          );
        })}
      </div>
      {closing !== null && (
        <CloseDialog
          report={closing}
          eventId={eventId}
          onClose={() => {
            setClosing(null);
          }}
        />
      )}
    </Card>
  );
}
