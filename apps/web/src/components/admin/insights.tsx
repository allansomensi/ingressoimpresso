"use client";

import type { AdminFunnelDto, AdminLiveDto, AdminLiveEventDto, LiveProblemDto } from "@ingressoimpresso/api-types";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, Filter, RadioTower, RefreshCw, Smartphone } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Badge, Button, Card, CardHeader, EmptyState, ErrorMessage, LoadingBlock, type Tone } from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { eventDateTime } from "@/lib/format";
import { admin as adminTexts } from "@/texts/pt-BR/admin";

const t = adminTexts;
const integer = (value: number) => value.toLocaleString("pt-BR");

/** Cohorts the funnel offers, in days (`null`: every organization). */
const WINDOWS = [30, 90, 365, null] as const;
type Window = (typeof WINDOWS)[number];

/** Share of `part` in `whole`, 0–100 with one decimal. */
function share(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10;
}

/**
 * The funnel (ADR 0099): organizations created in the window and how far they went, from the
 * signup to the door. The biggest drop between two steps is marked: that is where people give up.
 */
export function AdminFunnel() {
  const f = t.funnel;
  const [days, setDays] = useState<Window>(90);
  const funnel = useQuery({
    queryKey: ["admin", "funnel", days],
    queryFn: () => api<AdminFunnelDto>(`/api/admin/funnel${days === null ? "" : `?days=${String(days)}`}`),
    placeholderData: keepPreviousData,
  });

  const picker = (
    <div role="radiogroup" aria-label={f.window} className="flex gap-1 rounded-xl bg-surface-2 p-1">
      {WINDOWS.map((option) => (
        <button
          key={option ?? "all"}
          type="button"
          role="radio"
          aria-checked={days === option}
          onClick={() => {
            setDays(option);
          }}
          className={cn(
            "min-h-9 rounded-lg px-3 text-sm font-medium transition pointer-coarse:min-h-11",
            days === option ? "bg-surface text-fg shadow-xs" : "text-fg-muted hover:text-fg active:bg-surface-3",
          )}
        >
          {option === null ? f.all : f.days(option)}
        </button>
      ))}
    </div>
  );

  let body;
  if (funnel.isPending) {
    body = <LoadingBlock rows={4} />;
  } else if (funnel.isError) {
    body = <ErrorMessage error={funnel.error} />;
  } else {
    const steps = funnel.data.steps;
    const total = steps[0]?.organizations ?? 0;
    // The step that loses the most of the previous one.
    let worst = -1;
    let worstLoss = 0;
    steps.forEach((step, index) => {
      const before = steps[index - 1];
      if (before !== undefined && before.organizations > 0) {
        const loss = 1 - step.organizations / before.organizations;
        if (loss > worstLoss) {
          worstLoss = loss;
          worst = index;
        }
      }
    });
    body =
      total === 0 ? (
        <EmptyState icon={Filter} title={f.emptyTitle} description={f.empty} />
      ) : (
        <ol className={cn("flex flex-col gap-3", funnel.isFetching && "opacity-60 transition-opacity")}>
          {steps.map((step, index) => {
            const before = steps[index - 1];
            const percent = share(step.organizations, total);
            const fromBefore = before === undefined ? null : share(step.organizations, before.organizations);
            const lost = before === undefined ? 0 : before.organizations - step.organizations;
            return (
              <li key={step.step} className="flex flex-col gap-1.5">
                {before !== undefined && lost > 0 && (
                  <p className={cn("flex items-center gap-1.5 pl-1 text-xs", index === worst ? "font-semibold text-danger-fg" : "text-fg-subtle")}>
                    {index === worst && <AlertTriangle className="size-3.5" aria-hidden />}
                    {f.lost(lost, fromBefore ?? 0)}
                    {index === worst && ` · ${f.worst}`}
                  </p>
                )}
                <div className="flex items-center gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand-soft-fg">
                    {index + 1}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-sm font-medium text-fg">{f.steps[step.step]}</span>
                      <span className="shrink-0 text-sm text-fg-muted tabular">
                        <span className="font-semibold text-fg">{integer(step.organizations)}</span> · {percent.toLocaleString("pt-BR")}%
                      </span>
                    </div>
                    <div
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={percent}
                      aria-label={f.steps[step.step]}
                      className="h-3 overflow-hidden rounded-full bg-surface-3"
                    >
                      <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${String(Math.max(percent, step.organizations > 0 ? 1.5 : 0))}%` }} />
                    </div>
                    {index > 0 && step.medianDays !== null && <span className="text-xs text-fg-subtle">{f.median(step.medianDays)}</span>}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader title={f.title} description={f.description} icon={Filter} actions={picker} />
        {body}
      </Card>
      <p className="text-xs leading-relaxed text-fg-subtle">{f.note}</p>
    </div>
  );
}

const STATE_TONE: Record<AdminLiveEventDto["state"], Tone> = { live: "success", upcoming: "brand", ended: "neutral" };

function problemText(problem: LiveProblemDto): string {
  const p = t.live.problems;
  switch (problem.kind) {
    case "stale":
      return p.stale(problem.device ?? "", problem.value ?? 0);
    case "pending":
      return p.pending(problem.device ?? "", problem.value ?? 0);
    case "invalid":
      return p.invalid(problem.device ?? "", problem.value ?? 0);
    case "no_devices":
      return p.noDevices;
  }
}

/**
 * "Acontecendo agora" (ADR 0099): the events from two hours ago to six hours ahead, those whose
 * door needs a look first (a phone that stopped syncing, reads piling up, a burst of invalid
 * codes, no phone at all), so the support calls the organizer before anyone complains.
 */
export function AdminLive() {
  const l = t.live;
  const live = useQuery({
    queryKey: ["admin", "live"],
    queryFn: () => api<AdminLiveDto>("/api/admin/live"),
    refetchInterval: 60_000,
  });
  if (live.isPending) {
    return <LoadingBlock rows={4} />;
  }
  if (live.isError) {
    return <ErrorMessage error={live.error} />;
  }
  const { events, generatedAt } = live.data;
  const troubled = events.filter((event) => event.problems.length > 0).length;
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          title={l.title}
          description={l.description}
          icon={RadioTower}
          actions={
            <Button variant="secondary" size="sm" icon={<RefreshCw />} loading={live.isFetching} onClick={() => void live.refetch()}>
              {l.refresh}
            </Button>
          }
        />
        <p className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
          {troubled > 0 ? (
            <Badge tone="danger" dot pulse>
              {l.troubled(troubled)}
            </Badge>
          ) : (
            <Badge tone="success">
              <CheckCircle2 className="size-3.5" aria-hidden />
              {l.allGood}
            </Badge>
          )}
          <span>{l.count(events.length)}</span>
          <span className="text-fg-subtle">· {l.updated(new Date(generatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }))}</span>
        </p>
      </Card>
      {events.length === 0 ? (
        <EmptyState icon={RadioTower} title={l.emptyTitle} description={l.empty} />
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {events.map((event) => (
            <li key={event.id}>
              <Card className={cn("flex h-full flex-col gap-3", event.problems.length > 0 && "border-danger/40")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-semibold text-fg">{event.name}</span>
                    <span className="truncate text-sm text-fg-muted">{event.organization}</span>
                  </div>
                  <Badge tone={STATE_TONE[event.state]} dot={event.state === "live"} pulse={event.state === "live"} className="shrink-0">
                    {l.states[event.state]}
                  </Badge>
                </div>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
                  <span className="flex items-center gap-1">
                    <Clock3 className="size-3.5" aria-hidden />
                    {eventDateTime(event.startsAt)}
                  </span>
                  <span className="tabular">{l.entries(event.entries, event.paidTickets, event.kind === "tokens")}</span>
                  <span className="flex items-center gap-1 tabular">
                    <Smartphone className="size-3.5" aria-hidden />
                    {l.devices(event.devicesOnline, event.devices)}
                  </span>
                </p>
                {event.problems.length > 0 && (
                  <ul className="flex flex-col gap-1.5 rounded-xl bg-danger-soft px-3 py-2.5 text-sm text-danger-fg">
                    {event.problems.map((problem, index) => (
                      <li key={`${problem.kind}-${problem.device ?? ""}-${String(index)}`} className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                        {problemText(problem)}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-auto flex flex-wrap gap-2 pt-1">
                  <Link
                    href={`/painel/eventos/${event.id}?aba=ao-vivo`}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg text-sm font-medium text-brand hover:underline pointer-coarse:min-h-11"
                  >
                    {l.open}
                    <ArrowRight className="size-4" aria-hidden />
                  </Link>
                  <Link
                    href={`/painel/admin/organizacoes/${event.organizationId}`}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg text-sm font-medium text-fg-muted hover:text-fg hover:underline pointer-coarse:min-h-11"
                  >
                    {l.organization}
                  </Link>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** How many events around now need a look (the mark of the section). */
export function useLiveProblems(enabled: boolean): number {
  const live = useQuery({
    queryKey: ["admin", "live"],
    queryFn: () => api<AdminLiveDto>("/api/admin/live"),
    enabled,
    refetchInterval: 60_000,
  });
  return live.data?.events.filter((event) => event.problems.length > 0).length ?? 0;
}
