"use client";

import type { CountDto, MailLogPageDto, MailStatus, MailSummaryDto } from "@ingressoimpresso/api-types";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Inbox, Mail, Search, Send, Webhook } from "lucide-react";
import { Fragment, useDeferredValue, useState } from "react";
import { toast } from "sonner";

import { BarChart } from "@/components/admin/bar-chart";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorMessage,
  Input,
  Lead,
  List,
  ListItem,
  LoadingBlock,
  Select,
  Stat,
  errorMessage,
  type Tone,
} from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { shortDateTime } from "@/lib/format";
import { texts } from "@/texts/pt-BR";

const t = texts.admin.emails;

/** `login@mail.example.com` out of `Name <login@mail.example.com>` (the name is the site's own); it
 * wraps after the `@` and before each dot, never mid-word. */
function senderAddress(from: string): string {
  return /<([^>]+)>/.exec(from)?.[1] ?? from;
}

const STATUSES: readonly MailStatus[] = ["sent", "delivered", "delivery_delayed", "bounced", "complained", "failed", "quota", "sending"];
const STATUS_TONE: Record<MailStatus, Tone> = {
  sending: "neutral",
  sent: "brand",
  delivered: "success",
  delivery_delayed: "warning",
  bounced: "danger",
  complained: "danger",
  failed: "danger",
  quota: "warning",
};
const KINDS = ["login_code", "signup_code", "batch_paid", "test"] as const;

function kindLabel(kind: string): string {
  const labels: Readonly<Record<string, string>> = t.kinds;
  return labels[kind] ?? kind;
}

function Counts({ title, rows, label }: { title: string; rows: readonly CountDto[]; label: (key: string) => string }) {
  return (
    <Card padded={false}>
      <p className="px-5 pt-4 pb-2 text-sm font-semibold text-fg">{title}</p>
      {rows.length === 0 ? (
        <p className="px-5 pb-4 text-sm text-fg-muted">{t.none}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-fg-subtle">
              <th className="px-5 py-1.5 text-left font-medium" />
              <th className="px-3 py-1.5 text-right font-medium">{t.day}</th>
              <th className="px-5 py-1.5 text-right font-medium">{t.week}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.key}>
                <td className="px-5 py-2 text-fg">{label(row.key)}</td>
                <td className="px-3 py-2 text-right font-medium text-fg tabular">{row.day.toLocaleString("pt-BR")}</td>
                <td className="px-5 py-2 text-right text-fg-muted tabular">{row.week.toLocaleString("pt-BR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function Summary({ summary }: { summary: MailSummaryDto }) {
  const queryClient = useQueryClient();
  const test = useMutation({
    mutationFn: () => api<undefined>("/api/admin/emails/test", { method: "POST" }),
    onSuccess: () => {
      toast.success(t.testSent);
      void queryClient.invalidateQueries({ queryKey: ["admin", "emails"] });
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
  const limit = summary.dailyLimit;
  const used = summary.usedToday;
  const ratio = limit === null ? 0 : Math.min(1, used / limit);
  const failedWeek = summary.byStatus
    .filter((row) => ["failed", "bounced", "complained"].includes(row.key))
    .reduce((sum, row) => sum + row.week, 0);
  return (
    <div className="flex flex-col gap-4">
      {summary.provider !== "resend" && <Alert tone="warning">{t.noProvider}</Alert>}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <div className="col-span-2 flex flex-col gap-2 rounded-2xl border border-border bg-surface p-3.5 shadow-xs sm:p-5">
          <span className="flex items-center justify-between text-[13px] font-medium text-fg-muted">
            {t.quota}
            <span className="text-fg tabular">{limit === null ? t.unlimited : `${String(used)} / ${String(limit)}`}</span>
          </span>
          <div className="h-2.5 overflow-hidden rounded-full bg-surface-3">
            <div
              className={cn("h-full rounded-full transition-[width]", ratio >= 1 ? "bg-danger" : ratio >= 0.8 ? "bg-warning" : "bg-brand")}
              style={{ width: `${String(ratio * 100)}%` }}
            />
          </div>
          <span className="text-xs text-fg-subtle">{t.quotaHint(summary.signupsToday)}</span>
        </div>
        <Stat label={t.failedWeek} value={failedWeek.toLocaleString("pt-BR")} tone={failedWeek > 0 ? "danger" : "success"} icon={Inbox} />
        <Stat
          label={t.provider}
          value={summary.provider === "resend" ? "Resend" : t.providers[summary.provider === "memory" ? "memory" : "log"]}
          hint={
            summary.from === null ? undefined : (
              <span title={summary.from}>
                {senderAddress(summary.from)
                  .split(/(?<=@)|(?=\.)/)
                  .map((part, index) => (
                    <Fragment key={index}>
                      {index > 0 && <wbr />}
                      {part}
                    </Fragment>
                  ))}
              </span>
            )
          }
          icon={Mail}
        />
      </div>
      <Card>
        <CardHeader
          icon={Send}
          title={t.chartTitle}
          description={summary.webhook ? t.webhookOn : t.webhookOff}
          actions={
            <Button variant="secondary" size="sm" icon={<Send />} loading={test.isPending} onClick={() => test.mutate()}>
              {t.test}
            </Button>
          }
        />
        <BarChart
          label={t.chartTitle}
          bars={summary.days.map((day) => ({ date: day.date, value: day.sent + day.failed }))}
          format={(value) => t.messages(value)}
          describe={t.chartBar}
        />
        {!summary.webhook && (
          <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-fg-muted">
            <Webhook className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {t.webhookHint}
          </p>
        )}
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Counts title={t.byStatus} rows={summary.byStatus} label={(key) => t.statuses[key as MailStatus] ?? key} />
        <Counts title={t.byKind} rows={summary.byKind} label={kindLabel} />
      </div>
    </div>
  );
}

/** Every e-mail the service sent (ADR 0041). */
export function AdminEmails() {
  const [status, setStatus] = useState("");
  const [kind, setKind] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const search = useDeferredValue(query.trim());
  const summary = useQuery({
    queryKey: ["admin", "emails", "summary"],
    queryFn: () => api<MailSummaryDto>("/api/admin/emails/summary"),
    refetchInterval: 60_000,
  });
  const params = new URLSearchParams({ status, kind, q: search, page: String(page), perPage: "25" });
  const log = useQuery({
    queryKey: ["admin", "emails", "log", status, kind, search, page],
    queryFn: () => api<MailLogPageDto>(`/api/admin/emails?${params.toString()}`),
    placeholderData: keepPreviousData,
  });
  const pages = log.data === undefined ? 1 : Math.max(1, Math.ceil(log.data.total / log.data.perPage));
  return (
    <div className="flex flex-col gap-4">
      <Lead>{t.intro}</Lead>
      {summary.isPending ? <LoadingBlock rows={2} /> : summary.isError ? <ErrorMessage error={summary.error} /> : <Summary summary={summary.data} />}
      <div className="flex flex-col gap-3 sm:flex-row">
        <span className="relative flex flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
          <Input
            type="search"
            value={query}
            placeholder={t.search}
            aria-label={t.search}
            className="pl-10"
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
        </span>
        <div className="grid grid-cols-2 gap-3 sm:flex">
          <Select
            aria-label={t.status}
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">{t.allStatuses}</option>
            {STATUSES.map((item) => (
              <option key={item} value={item}>
                {t.statuses[item]}
              </option>
            ))}
          </Select>
          <Select
            aria-label={t.kind}
            value={kind}
            onChange={(event) => {
              setKind(event.target.value);
              setPage(1);
            }}
          >
            <option value="">{t.allKinds}</option>
            {KINDS.map((item) => (
              <option key={item} value={item}>
                {kindLabel(item)}
              </option>
            ))}
          </Select>
        </div>
      </div>
      {log.isPending ? (
        <LoadingBlock rows={4} />
      ) : log.isError ? (
        <ErrorMessage error={log.error} />
      ) : log.data.items.length === 0 ? (
        <EmptyState icon={Mail} title={t.empty} />
      ) : (
        <>
          <List className={cn(log.isPlaceholderData && "opacity-60")}>
            {log.data.items.map((item) => (
              <ListItem key={item.id} className="flex-nowrap items-start justify-between">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium text-fg">{item.to ?? t.removedAddress}</span>
                  <span className="truncate text-xs text-fg-muted">
                    {kindLabel(item.kind)}
                    {item.subject !== null && ` · ${item.subject}`}
                  </span>
                  {item.error !== null && <span className="line-clamp-2 font-mono text-[11px] text-danger-fg">{item.error}</span>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Badge tone={STATUS_TONE[item.status]}>{t.statuses[item.status]}</Badge>
                  <time dateTime={item.createdAt} className="text-xs text-fg-subtle tabular">
                    {shortDateTime(item.createdAt)}
                  </time>
                </div>
              </ListItem>
            ))}
          </List>
          <nav aria-label={t.pagination} className="flex items-center justify-between gap-3 text-sm text-fg-muted">
            <span>{t.total(log.data.total)}</span>
            <span className="flex items-center gap-2">
              <Button variant="secondary" size="icon" aria-label={t.previous} disabled={page <= 1} onClick={() => setPage(page - 1)}>
                <ChevronLeft />
              </Button>
              <span className="tabular">{t.page(page, pages)}</span>
              <Button variant="secondary" size="icon" aria-label={t.next} disabled={page >= pages} onClick={() => setPage(page + 1)}>
                <ChevronRight />
              </Button>
            </span>
          </nav>
        </>
      )}
    </div>
  );
}
