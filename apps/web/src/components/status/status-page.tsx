"use client";

import type { IncidentDto, IncidentImpact, ServiceStatus, StatusDto } from "@ingressoimpresso/api-types";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, CheckCircle2, RefreshCw, Wrench, XCircle } from "lucide-react";

import { Button, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { dateTime, shortDateTime } from "@/lib/format";
import { texts } from "@/texts/pt-BR";

const t = texts.status;
const DAYS = 90;
const DAY_MS = 86_400_000;

const STATUS_STYLE: Record<ServiceStatus, { dot: string; text: string; box: string; icon: typeof CheckCircle2 }> = {
  operational: { dot: "bg-success", text: "text-success-fg", box: "border-success/30 bg-success-soft text-success-fg", icon: CheckCircle2 },
  degraded: { dot: "bg-warning", text: "text-warning-fg", box: "border-warning/30 bg-warning-soft text-warning-fg", icon: AlertTriangle },
  down: { dot: "bg-danger", text: "text-danger-fg", box: "border-danger/30 bg-danger-soft text-danger-fg", icon: XCircle },
  maintenance: { dot: "bg-brand", text: "text-brand-soft-fg", box: "border-brand/30 bg-brand-soft text-brand-soft-fg", icon: Wrench },
};

const IMPACT_RANK: Record<IncidentImpact, number> = { none: 0, minor: 1, major: 2, critical: 3 };

function componentLabel(key: string): string {
  const labels: Readonly<Record<string, string>> = t.components;
  return labels[key] ?? key;
}

/** Worst impact of the incidents that touched each of the last 90 days (oldest first). */
function history(incidents: readonly IncidentDto[]): { day: Date; rank: number; titles: string[] }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: DAYS }, (_, index) => {
    const day = new Date(today.getTime() - (DAYS - 1 - index) * DAY_MS);
    const end = day.getTime() + DAY_MS;
    const touching = incidents.filter((incident) => {
      if (incident.kind === "maintenance" && incident.status === "scheduled") {
        return false;
      }
      const start = Date.parse(incident.startedAt);
      const stop = incident.resolvedAt === null ? Date.now() : Date.parse(incident.resolvedAt);
      return start < end && stop >= day.getTime();
    });
    return {
      day,
      rank: touching.reduce((worst, incident) => Math.max(worst, incident.kind === "maintenance" ? 0.5 : IMPACT_RANK[incident.impact]), 0),
      titles: touching.map((incident) => incident.title),
    };
  });
}

function Timeline({ incident }: { incident: IncidentDto }) {
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 shadow-xs">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-fg">{incident.title}</h3>
        <span className="text-xs text-fg-subtle">
          {incident.kind === "maintenance" && incident.scheduledFor !== null
            ? t.window(dateTime(incident.scheduledFor), incident.scheduledUntil === null ? "" : dateTime(incident.scheduledUntil))
            : t.startedAt(dateTime(incident.startedAt))}
        </span>
      </header>
      {incident.components.length > 0 && (
        <p className="text-xs text-fg-muted">{t.affects(incident.components.map(componentLabel).join(", "))}</p>
      )}
      <ol className="flex flex-col gap-3 border-l-2 border-border pl-4">
        {incident.updates.map((update) => (
          <li key={update.id} className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold text-fg">
              {t.incidentStatuses[update.status]} <span className="text-xs font-normal text-fg-subtle">· {shortDateTime(update.createdAt)}</span>
            </span>
            <span className="text-sm leading-relaxed whitespace-pre-line text-fg-muted">{update.body}</span>
          </li>
        ))}
      </ol>
    </article>
  );
}

/** The public status page (ADR 0043): live checks of the API plus what the team reported. */
export function StatusPage() {
  const status = useQuery({
    queryKey: ["status"],
    queryFn: () => api<StatusDto>("/api/status"),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    retry: 1,
  });
  // The API not answering is itself the news: the site is up (this page loaded), the rest is not.
  const unreachable = status.isError;
  const data = status.data;
  const overall: ServiceStatus = unreachable ? "down" : (data?.status ?? "operational");
  const style = STATUS_STYLE[overall];
  const Icon = style.icon;
  const days = history([...(data?.active ?? []), ...(data?.recent ?? [])]);
  const clean = days.filter((day) => day.rank < 1).length;
  const planned = (data?.active ?? []).filter((incident) => incident.kind === "maintenance" && incident.status === "scheduled");
  const open = (data?.active ?? []).filter((incident) => !(incident.kind === "maintenance" && incident.status === "scheduled"));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-12 sm:px-6 sm:py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">{t.title}</h1>
        <p className="text-[15px] leading-relaxed text-fg-muted">{t.subtitle}</p>
      </header>

      {status.isPending ? (
        <Skeleton className="h-20 w-full rounded-2xl" />
      ) : (
        <div className={cn("flex items-center gap-4 rounded-2xl border px-5 py-4", style.box)}>
          <Icon className="size-7 shrink-0" aria-hidden />
          <div className="flex min-w-0 flex-1 flex-col">
            <p className="text-lg font-semibold">{unreachable ? t.unreachable : t.overall[overall]}</p>
            <p className="text-sm opacity-80">
              {data !== undefined && !unreachable ? t.checkedAt(shortDateTime(data.checkedAt)) : t.unreachableHint}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t.refresh}
            onClick={() => void status.refetch()}
            className={cn(status.isFetching && "[&_svg]:animate-spin")}
          >
            <RefreshCw />
          </Button>
        </div>
      )}

      {data?.maintenance.mode !== undefined && data.maintenance.mode !== "off" && (
        <p className="flex items-start gap-3 rounded-2xl border border-brand/25 bg-brand-soft px-5 py-4 text-sm text-brand-soft-fg">
          <Wrench className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {data.maintenance.message ?? t.maintenanceNow}
            {data.maintenance.endsAt !== null && ` ${texts.maintenance.expected(dateTime(data.maintenance.endsAt))}`}
          </span>
        </p>
      )}

      <section aria-labelledby="componentes" className="flex flex-col gap-3">
        <h2 id="componentes" className="text-sm font-semibold tracking-wide text-fg-subtle uppercase">
          {t.servicesTitle}
        </h2>
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-xs">
          {(data?.components ?? [{ key: "site", status: "operational" as const }]).map((component) => {
            const live: ServiceStatus = unreachable && component.key !== "site" ? "down" : component.status;
            return (
              <li key={component.key} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <span className="flex flex-col">
                  <span className="font-medium text-fg">{componentLabel(component.key)}</span>
                  <span className="text-xs text-fg-muted">{t.componentHints[component.key as keyof typeof t.componentHints]}</span>
                </span>
                <span className={cn("flex items-center gap-2 text-sm font-medium", STATUS_STYLE[live].text)}>
                  <span className={cn("size-2.5 rounded-full", STATUS_STYLE[live].dot)} aria-hidden />
                  {t.states[live]}
                </span>
              </li>
            );
          })}
          {unreachable && (
            <li className="flex items-center justify-between gap-3 px-5 py-3.5">
              <span className="font-medium text-fg">{componentLabel("panel")}</span>
              <span className={cn("flex items-center gap-2 text-sm font-medium", STATUS_STYLE.down.text)}>
                <span className="size-2.5 rounded-full bg-danger" aria-hidden />
                {t.states.down}
              </span>
            </li>
          )}
        </ul>
      </section>

      <section aria-labelledby="historico" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="historico" className="text-sm font-semibold tracking-wide text-fg-subtle uppercase">
            {t.historyTitle}
          </h2>
          <span className="text-xs text-fg-muted tabular">{t.daysClean(clean, DAYS)}</span>
        </div>
        <div className="flex h-10 items-stretch gap-[2px]" role="img" aria-label={t.historyLabel(clean, DAYS)}>
          {days.map((day) => (
            <span
              key={day.day.getTime()}
              title={`${day.day.toLocaleDateString("pt-BR")}: ${day.titles.length === 0 ? t.noIncidents : day.titles.join(", ")}`}
              className={cn(
                "flex-1 rounded-[3px] transition hover:opacity-70",
                day.rank >= 3 ? "bg-danger" : day.rank >= 1 ? "bg-warning" : day.rank > 0 ? "bg-brand/60" : "bg-success/70",
              )}
            />
          ))}
        </div>
        <div className="flex justify-between text-xs text-fg-subtle">
          <span>{t.daysAgo(DAYS)}</span>
          <span>{t.today}</span>
        </div>
      </section>

      {planned.length > 0 && (
        <section aria-labelledby="planejadas" className="flex flex-col gap-3">
          <h2 id="planejadas" className="flex items-center gap-2 text-sm font-semibold tracking-wide text-fg-subtle uppercase">
            <CalendarClock className="size-4" aria-hidden />
            {t.plannedTitle}
          </h2>
          {planned.map((incident) => (
            <Timeline key={incident.id} incident={incident} />
          ))}
        </section>
      )}

      {open.length > 0 && (
        <section aria-labelledby="abertos" className="flex flex-col gap-3">
          <h2 id="abertos" className="text-sm font-semibold tracking-wide text-fg-subtle uppercase">
            {t.activeTitle}
          </h2>
          {open.map((incident) => (
            <Timeline key={incident.id} incident={incident} />
          ))}
        </section>
      )}

      <section aria-labelledby="passados" className="flex flex-col gap-3">
        <h2 id="passados" className="text-sm font-semibold tracking-wide text-fg-subtle uppercase">
          {t.pastTitle}
        </h2>
        {(data?.recent ?? []).length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border-strong px-5 py-6 text-center text-sm text-fg-muted">{t.noPast}</p>
        ) : (
          (data?.recent ?? []).map((incident) => <Timeline key={incident.id} incident={incident} />)
        )}
      </section>
    </div>
  );
}
