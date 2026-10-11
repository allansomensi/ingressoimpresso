"use client";

import type { EventDto } from "@ingressoimpresso/api-types";
import { useQuery } from "@tanstack/react-query";
import { CalendarPlus, ChevronRight, Clock, MapPin, Plus, UsersRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { EventFormDialog } from "@/components/panel/event-form";
import { Badge, Button, EmptyState, ErrorMessage, PageHeader, Skeleton, type Tone } from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { eventPhase, sortEvents, type EventPhase } from "@/lib/event-list";
import { dateParts, money } from "@/lib/format";
import { areaList } from "@/lib/team";
import { texts } from "@/texts/pt-BR";

const t = texts.panel;

const PHASE: Record<EventPhase, { label: string; tone: Tone }> = {
  happening: { label: t.happening, tone: "success" },
  today: { label: t.today, tone: "warning" },
  upcoming: { label: t.upcoming, tone: "brand" },
  past: { label: t.past, tone: "neutral" },
  archived: { label: texts.event.actions.archivedBadge, tone: "neutral" },
};

/** A card in the grid; on phones, a compact row (date, name, time and place) to scan many at once. */
function EventCard({ event, now }: { event: EventDto; now: number }) {
  const date = dateParts(event.startsAt);
  const status = PHASE[eventPhase(event, now)];
  const badge = (
    <Badge tone={status.tone} dot pulse={status.tone === "success"}>
      {status.label}
    </Badge>
  );
  return (
    <Link
      href={`/painel/eventos/${event.id}`}
      className="group flex items-center gap-4 rounded-2xl border border-border bg-surface p-4 shadow-xs transition active:scale-[0.99] active:bg-surface-2 sm:flex-col sm:items-stretch sm:gap-5 sm:p-5 sm:hover:-translate-y-0.5 sm:hover:border-brand/40 sm:hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3 max-sm:contents">
        <div className="flex w-14 shrink-0 flex-col items-center self-start overflow-hidden rounded-xl border border-border bg-bg text-center">
          <span className="w-full bg-brand-solid py-0.5 text-[11px] font-semibold tracking-wide text-brand-fg uppercase">
            {date.month}
          </span>
          <span className="py-1 text-xl leading-none font-semibold text-fg tabular">{date.day}</span>
          <span className="pb-1 text-[11px] text-fg-muted uppercase">{date.weekday}</span>
        </div>
        <div className="flex flex-col items-end gap-1.5 max-sm:hidden">
          {badge}
          {event.team !== null && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-fg-muted">
              <UsersRound className="size-3.5 text-brand" aria-hidden />
              {texts.event.team.listBadge}
            </span>
          )}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 sm:gap-2">
        <div className="flex flex-wrap items-center gap-2 sm:hidden">
          {badge}
          {event.team !== null && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-fg-muted">
              <UsersRound className="size-3.5 text-brand" aria-hidden />
              {texts.event.team.listBadge}
            </span>
          )}
        </div>
        <h2 className="line-clamp-2 text-base leading-snug font-semibold tracking-tight text-fg sm:truncate sm:text-lg">{event.name}</h2>
        <div className="flex flex-col gap-1 text-sm text-fg-muted">
          <span className="flex items-center gap-2">
            <Clock className="size-4 shrink-0 text-fg-subtle" aria-hidden />
            {date.time}
            {event.ticketPriceCents !== null && ` · ${money(event.ticketPriceCents)}`}
          </span>
          <span className="flex min-w-0 items-center gap-2">
            <MapPin className="size-4 shrink-0 text-fg-subtle" aria-hidden />
            <span className="truncate">{event.venue ?? t.noVenue}</span>
          </span>
          {event.team !== null && (
            <span className="truncate text-xs text-fg-subtle max-sm:hidden">
              {texts.event.team.listLine(event.team.organization, areaList(event.team.areas))}
            </span>
          )}
        </div>
      </div>
      <ChevronRight className="size-5 shrink-0 text-fg-subtle sm:hidden" aria-hidden />
      <span className="mt-auto flex items-center gap-1 text-sm font-medium text-brand max-sm:hidden">
        {texts.event.overview.go}
        <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </span>
    </Link>
  );
}

export default function EventsPage() {
  const router = useRouter();
  const events = useQuery({ queryKey: ["events"], queryFn: () => api<EventDto[]>("/api/events") });
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const now = events.dataUpdatedAt;
  const archived = events.data?.filter((event) => event.status === "closed") ?? [];
  // What happens now and next comes first (ADR 0060), not the order the events were created in.
  const shown = sortEvents(events.data?.filter((event) => (event.status === "closed") === showArchived) ?? [], now);

  const newButton = (
    <Button
      icon={<Plus />}
      onClick={() => {
        setCreating(true);
      }}
    >
      {t.newEvent}
    </Button>
  );

  return (
    <main className="flex flex-col gap-8 animate-fade-in">
      <PageHeader title={t.title} description={t.subtitle} actions={newButton} />
      {events.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <Skeleton key={item} className="h-28 rounded-2xl sm:h-56" />
          ))}
        </div>
      ) : events.isError ? (
        <ErrorMessage error={events.error} />
      ) : events.data.length === 0 ? (
        <EmptyState icon={CalendarPlus} title={t.emptyTitle} description={t.empty} action={newButton} />
      ) : (
        <div className="flex flex-col gap-4">
          {archived.length > 0 && (
            <div role="radiogroup" aria-label={t.title} className="flex w-fit max-w-full overflow-x-auto rounded-full border border-border bg-surface-2 p-0.5 scrollbar-none">
              {[false, true].map((option) => (
                <button
                  key={String(option)}
                  type="button"
                  role="radio"
                  aria-checked={showArchived === option}
                  onClick={() => {
                    setShowArchived(option);
                  }}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap transition pointer-coarse:px-4 pointer-coarse:py-2",
                    showArchived === option ? "bg-surface text-fg shadow-sm ring-1 ring-border" : "text-fg-muted hover:text-fg",
                  )}
                >
                  {option ? t.archivedFilter(archived.length) : t.activeFilter}
                </button>
              ))}
            </div>
          )}
          {shown.length === 0 ? (
            <EmptyState icon={CalendarPlus} title={t.noActiveTitle} description={t.empty} action={newButton} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
              {shown.map((event) => (
                <EventCard key={event.id} event={event} now={now} />
              ))}
            </div>
          )}
        </div>
      )}
      <EventFormDialog
        open={creating}
        onClose={() => {
          setCreating(false);
        }}
        onSaved={(event) => {
          router.push(`/painel/eventos/${event.id}`);
        }}
      />
    </main>
  );
}
