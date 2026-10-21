"use client";

import type { AdminAlertDto, AdminAlertsDto, AlertDeliveryDto, AlertSettingsDto } from "@ingressoimpresso/api-types";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, BellRing, CheckCircle2, Send, Settings2, Sun } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { Badge, Button, Card, CardHeader, EmptyState, ErrorMessage, Field, LoadingBlock, NumberInput, Select, Switch, errorMessage } from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { shortDateTime } from "@/lib/format";
import { admin as adminTexts } from "@/texts/pt-BR/admin";

const t = adminTexts.alerts;
const KEY = ["admin", "alerts"];

function AlertRow({ alert, onResolve, resolving }: { alert: AdminAlertDto; onResolve: () => void; resolving: boolean }) {
  const critical = alert.severity === "critical";
  const resolved = alert.resolvedAt !== null;
  return (
    <li
      className={cn(
        "flex flex-col gap-2 rounded-2xl border p-4",
        resolved ? "border-border bg-surface opacity-75" : critical ? "border-danger/40 bg-danger-soft/40" : "border-warning/40 bg-warning-soft/30",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={resolved ? "neutral" : critical ? "danger" : "warning"} dot={!resolved} pulse={!resolved && critical}>
              {t.severity[alert.severity]}
            </Badge>
            <span className="text-xs font-medium text-fg-muted">{t.kinds[alert.kind]}</span>
          </span>
          <span className="font-semibold text-fg">{alert.title}</span>
        </div>
        <span className="shrink-0 text-xs text-fg-muted tabular">{t.times(alert.count)}</span>
      </div>
      {alert.detail !== null && <p className="text-sm leading-relaxed whitespace-pre-line text-fg-muted">{alert.detail}</p>}
      <p className="text-xs text-fg-subtle">
        {t.since(shortDateTime(alert.firstAt), shortDateTime(alert.lastAt))}
        {" · "}
        {resolved ? t.resolvedBy(alert.resolvedBy, shortDateTime(alert.resolvedAt ?? alert.lastAt)) : alert.notifiedAt === null ? t.notNotified : t.notified}
      </p>
      <div className="flex flex-wrap gap-2 pt-1">
        {alert.link !== null && (
          <Link
            href={alert.link}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg text-sm font-medium text-brand hover:underline pointer-coarse:min-h-11"
          >
            {t.look}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        )}
        {!resolved && (
          <Button size="sm" variant="secondary" icon={<CheckCircle2 />} loading={resolving} onClick={onResolve} className="ml-auto">
            {t.resolve}
          </Button>
        )}
      </div>
    </li>
  );
}

function SettingsCard({ data }: { data: AdminAlertsDto }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<AlertSettingsDto>(data.settings);
  const save = useMutation({
    mutationFn: (body: AlertSettingsDto) => api<AlertSettingsDto>("/api/admin/alerts/settings", { method: "PUT", body }),
    onSuccess: (settings) => {
      setDraft(settings);
      void queryClient.invalidateQueries({ queryKey: KEY });
      toast.success(t.saved);
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
  const set = (patch: Partial<AlertSettingsDto>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };
  const dirty = JSON.stringify(draft) !== JSON.stringify(data.settings);
  return (
    <Card>
      <CardHeader title={t.settingsTitle} description={t.settingsDescription} icon={Settings2} />
      <div className="flex flex-col gap-4">
        <Switch
          checked={draft.email}
          onChange={(email) => {
            set({ email });
          }}
          label={t.email}
          description={t.emailTo(data.channels.emails.join(", "))}
        />
        {data.channels.telegram ? (
          <Switch
            checked={draft.telegram}
            onChange={(telegram) => {
              set({ telegram });
            }}
            label={t.telegram}
            description={t.telegramOn}
          />
        ) : (
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-fg">{t.telegram}</span>
            <span className="text-sm text-fg-muted">{t.telegramOff}</span>
          </div>
        )}
        <div className="border-t border-border pt-4">
          <Switch
            checked={draft.summary}
            onChange={(summary) => {
              set({ summary });
            }}
            label={t.summary}
            description={t.summaryHint}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.summaryFrequency}>
            <Select
              value={draft.summaryFrequency}
              disabled={!draft.summary}
              onChange={(event) => {
                set({ summaryFrequency: event.target.value === "daily" ? "daily" : "weekly" });
              }}
            >
              <option value="weekly">{t.frequencies.weekly}</option>
              <option value="daily">{t.frequencies.daily}</option>
            </Select>
          </Field>
          {draft.summaryFrequency === "weekly" && (
            <Field label={t.summaryWeekday}>
              <Select
                value={String(draft.summaryWeekday)}
                disabled={!draft.summary}
                onChange={(event) => {
                  set({ summaryWeekday: Number(event.target.value) });
                }}
              >
                {t.weekdays.map((name, index) => (
                  <option key={name} value={index + 1}>
                    {name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label={t.summaryHour}>
            <Select
              value={String(draft.summaryHour)}
              disabled={!draft.summary}
              onChange={(event) => {
                set({ summaryHour: Number(event.target.value) });
              }}
            >
              {Array.from({ length: 24 }, (_, hour) => (
                <option key={hour} value={hour}>
                  {t.hour(hour)}
                </option>
              ))}
            </Select>
          </Field>
          {data.channels.telegram && (
            <Switch
              checked={draft.summaryTelegram}
              onChange={(summaryTelegram) => {
                set({ summaryTelegram });
              }}
              label={t.summaryTelegram}
              description={t.summaryTelegramHint}
            />
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.doorThreshold} hint={t.doorThresholdHint}>
            <NumberInput
              value={draft.doorMinTickets}
              step={10}
              min={1}
              max={100_000}
              suffix={t.tickets}
              onChange={(doorMinTickets) => {
                set({ doorMinTickets: Math.max(1, Math.round(doorMinTickets)) });
              }}
            />
          </Field>
        </div>
        <div className="flex justify-end">
          <Button
            disabled={!dirty}
            loading={save.isPending}
            onClick={() => {
              save.mutate(draft);
            }}
          >
            {t.save}
          </Button>
        </div>
      </div>
    </Card>
  );
}

/**
 * The admins' alerts (ADR 0103): what went wrong and is still open, the channels they reach and
 * the summary by e-mail (ADR 0108). Every alert is also sent by e-mail and Telegram when it opens.
 */
export function AdminAlerts() {
  const queryClient = useQueryClient();
  const [showResolved, setShowResolved] = useState(false);
  const alerts = useQuery({
    queryKey: [...KEY, showResolved],
    queryFn: () => api<AdminAlertsDto>(`/api/admin/alerts${showResolved ? "?resolved=true" : ""}`),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
  const resolve = useMutation({
    mutationFn: (id: string) => api<undefined>(`/api/admin/alerts/${id}/resolve`, { method: "POST" }),
    onSuccess: () => {
      toast.success(t.resolvedToast);
      void queryClient.invalidateQueries({ queryKey: KEY });
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
  const test = useMutation({
    mutationFn: () => api<AlertDeliveryDto>("/api/admin/alerts/test", { method: "POST" }),
    onSuccess: (delivery) => {
      toast.success(t.testToast(t.testSent(delivery.emails, delivery.telegram)));
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
  const summary = useMutation({
    mutationFn: () => api<AlertDeliveryDto>("/api/admin/alerts/summary", { method: "POST" }),
    onSuccess: (delivery) => {
      toast.success(t.summaryToast(t.testSent(delivery.emails, delivery.telegram)));
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
  if (alerts.isPending) {
    return <LoadingBlock rows={4} />;
  }
  if (alerts.isError) {
    return <ErrorMessage error={alerts.error} />;
  }
  const data = alerts.data;
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          title={t.title}
          description={t.description}
          icon={BellRing}
          actions={
            <span className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                icon={<Send />}
                loading={test.isPending}
                onClick={() => {
                  test.mutate();
                }}
              >
                {t.test}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={<Sun />}
                loading={summary.isPending}
                onClick={() => {
                  summary.mutate();
                }}
              >
                {t.summaryNow}
              </Button>
            </span>
          }
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          {data.open > 0 ? (
            <Badge tone="danger" dot pulse>
              {t.open(data.open)}
            </Badge>
          ) : (
            <Badge tone="success">
              <CheckCircle2 className="size-3.5" aria-hidden />
              {t.emptyTitle}
            </Badge>
          )}
          <Switch checked={showResolved} onChange={setShowResolved} label={t.showResolved} />
        </div>
      </Card>
      {data.alerts.length === 0 ? (
        <EmptyState icon={BellRing} title={t.emptyTitle} description={t.empty} />
      ) : (
        <ul className="flex flex-col gap-3">
          {data.alerts.map((alert) => (
            <AlertRow
              key={alert.id}
              alert={alert}
              resolving={resolve.isPending && resolve.variables === alert.id}
              onResolve={() => {
                resolve.mutate(alert.id);
              }}
            />
          ))}
        </ul>
      )}
      <SettingsCard key={JSON.stringify(data.settings)} data={data} />
    </div>
  );
}

/** Open alerts (the mark of the section). */
export function useOpenAlerts(enabled: boolean): number {
  const alerts = useQuery({
    queryKey: [...KEY, false],
    queryFn: () => api<AdminAlertsDto>("/api/admin/alerts"),
    enabled,
    refetchInterval: 60_000,
  });
  return alerts.data?.open ?? 0;
}
