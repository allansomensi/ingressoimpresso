"use client";

import type { BatchDto, DesignResponse, DoorOverviewDto, ExportDto, SellerDto } from "@ingressoimpresso/api-types";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronRight, LogIn, Smartphone, Ticket, Users } from "lucide-react";

import { Card, CardHeader, ErrorMessage, Skeleton, Stat } from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { texts } from "@/texts/pt-BR";

import { EventResults } from "./event-results";
import type { SelectTab, Tab } from "./tabs";

const t = texts.event.overview;
const STEPS = ["design", "batches", "sellers", "files", "door"] as const satisfies readonly Tab[];

export function OverviewTab({ eventId, onSelect }: { eventId: string; onSelect: SelectTab }) {
  const design = useQuery({
    queryKey: ["design", eventId],
    queryFn: () => api<DesignResponse>(`/api/events/${eventId}/design`),
  });
  const batches = useQuery({ queryKey: ["batches", eventId], queryFn: () => api<BatchDto[]>(`/api/events/${eventId}/batches`) });
  const sellers = useQuery({ queryKey: ["sellers", eventId], queryFn: () => api<SellerDto[]>(`/api/events/${eventId}/sellers`) });
  const exports = useQuery({ queryKey: ["exports", eventId], queryFn: () => api<ExportDto[]>(`/api/events/${eventId}/exports`) });
  const door = useQuery({ queryKey: ["door", eventId], queryFn: () => api<DoorOverviewDto>(`/api/events/${eventId}/door`) });

  const paidTickets = (batches.data ?? [])
    .filter((batch) => batch.status === "paid")
    .reduce((sum, batch) => sum + batch.last - batch.first + 1, 0);
  const activeDevices = (door.data?.devices ?? []).filter((device) => device.revokedAt === null).length;
  const done: Record<(typeof STEPS)[number], boolean> = {
    design: (design.data?.version ?? 0) > 0,
    batches: paidTickets > 0,
    sellers: (sellers.data ?? []).some((seller) => seller.ranges.length > 0),
    files: (exports.data ?? []).some((item) => item.status === "done"),
    door: activeDevices > 0,
  };
  const queries = [design, batches, sellers, exports, door];
  const loading = queries.some((query) => query.isPending);
  const failure = queries.find((query) => query.isError)?.error;
  const count = (value: number) => (loading ? <Skeleton className="h-8 w-14" /> : value.toLocaleString("pt-BR"));
  const doneCount = STEPS.filter((step) => done[step]).length;
  const nextStep = STEPS.find((step) => !done[step]);

  return (
    <div className="flex flex-col gap-6">
    {failure !== undefined && (
      <ErrorMessage error={failure} />
    )}
    {/* Once everything is done, the results matter most; until then, the next step does. */}
    {paidTickets > 0 && doneCount === STEPS.length && <EventResults eventId={eventId} />}
    <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
      <Card className="max-lg:order-2">
        <CardHeader
          title={t.title}
          description={t.subtitle}
          actions={!loading && <span className="text-sm font-medium text-fg-muted tabular">{t.progress(doneCount, STEPS.length)}</span>}
        />
        <div className="mb-5 h-1.5 overflow-hidden rounded-full bg-surface-3">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand to-brand-hover transition-[width] duration-500"
            style={{ width: `${String((doneCount / STEPS.length) * 100)}%` }}
          />
        </div>
        {loading ? (
          <div className="flex flex-col gap-3">
            {STEPS.map((step) => (
              <Skeleton key={step} className="h-16 w-full" />
            ))}
          </div>
        ) : (
          <ol className="flex flex-col gap-2">
            {STEPS.map((step, index) => {
              const isDone = done[step];
              const isNext = step === nextStep;
              return (
                <li key={step}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(step);
                    }}
                    className={cn(
                      "group flex w-full items-center gap-4 rounded-xl border px-4 py-3.5 text-left transition",
                      isNext
                        ? "border-brand/40 bg-brand-soft/60 hover:bg-brand-soft"
                        : "border-transparent hover:border-border hover:bg-surface-2",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                        isDone
                          ? "bg-success-solid text-white"
                          : isNext
                            ? "bg-brand-solid text-brand-fg"
                            : "bg-surface-3 text-fg-muted",
                      )}
                    >
                      {isDone ? <Check className="size-4" strokeWidth={3} aria-label={t.done} /> : index + 1}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className={cn("font-medium", isDone ? "text-fg-muted line-through decoration-fg-subtle/50" : "text-fg")}>
                        {t.steps[step].title}
                      </span>
                      <span className="text-sm text-fg-muted">{t.steps[step].body}</span>
                    </span>
                    <ChevronRight
                      className="size-4 shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </Card>
      <div className="grid grid-cols-2 content-start gap-3 max-lg:order-1 sm:gap-4 lg:grid-cols-1">
        <Stat label={t.stats.paid} value={count(paidTickets)} icon={Ticket} />
        <Stat label={t.stats.sellers} value={count(sellers.data?.length ?? 0)} icon={Users} />
        <Stat label={t.stats.entries} value={count(door.data?.entryCount ?? 0)} icon={LogIn} tone="success" />
        <Stat label={t.stats.devices} value={count(activeDevices)} icon={Smartphone} />
      </div>
    </div>
    {paidTickets > 0 && doneCount < STEPS.length && <EventResults eventId={eventId} />}
    </div>
  );
}
