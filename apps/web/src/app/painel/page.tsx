"use client";

import type { EventDto } from "@ingressoimpresso/api-types";
import { useQuery } from "@tanstack/react-query";
import { CalendarPlus, ChevronRight, Clock, MapPin, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { EventFormDialog } from "@/components/panel/event-form";
import { Badge, Button, EmptyState, ErrorMessage, PageHeader, Skeleton, type Tone } from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { dateParts, money } from "@/lib/format";
import { texts } from "@/texts/pt-BR";

const t = texts.panel;

function phase(event: EventDto, now: number): { label: string; tone: Tone } {
  if (event.status === "closed") {
    return { label: texts.event.actions.archivedBadge, tone: "neutral" };
  }
  const start = Date.parse(event.startsAt);
  const end = Date.parse(event.endsAt);
  if (now > end) {
    return { label: t.past, tone: "neutral" };
  }
  if (now >= start) {
    return { label: t.happening, tone: "success" };
  }
  if (new Date(start).toDateString() === new Date(now).toDateString()) {
    return { label: t.today, tone: "warning" };
  }
  return { label: t.upcoming, tone: "brand" };
}

function EventCard({ event, now }: { event: EventDto; now: number }) {
  const date = dateParts(event.startsAt);
  const status = phase(event, now);
  return (
    <Link
      href={`/painel/eventos/${event.id}`}
      className="group flex flex-col gap-5 rounded-2xl border border-border bg-surface p-5 shadow-xs transition hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex w-14 flex-col items-center overflow-hidden rounded-xl border border-border bg-bg text-center">
          <span className="w-full bg-brand-solid py-0.5 text-[11px] font-semibold tracking-wide text-brand-fg uppercase">
            {date.month}
          </span>
          <span className="py-1 text-xl leading-none font-semibold text-fg tabular">{date.day}</span>
          <span className="pb-1 text-[10px] text-fg-subtle uppercase">{date.weekday}</span>
        </div>
        <Badge tone={status.tone} dot pulse={status.tone === "success"}>
          {status.label}
        </Badge>
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <h2 className="truncate text-lg font-semibold tracking-tight text-fg">{event.name}</h2>
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
        </div>
      </div>
      <span className="mt-auto flex items-center gap-1 text-sm font-medium text-brand">
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
  const shown = events.data?.filter((event) => (event.status === "closed") === showArchived) ?? [];

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
            <Skeleton key={item} className="h-56 rounded-2xl" />
          ))}
        </div>
      ) : events.isError ? (
        <ErrorMessage error={events.error} />
      ) : events.data.length === 0 ? (
        <EmptyState icon={CalendarPlus} title={t.emptyTitle} description={t.empty} action={newButton} />
      ) : (
        <div className="flex flex-col gap-4">
          {archived.length > 0 && (
            <div role="radiogroup" aria-label={t.title} className="flex w-fit rounded-full border border-border bg-surface-2 p-0.5">
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
                    "rounded-full px-3 py-1.5 text-sm font-medium transition",
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
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
