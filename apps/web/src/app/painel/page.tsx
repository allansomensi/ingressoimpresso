"use client";

import type { EventDto } from "@ingressoimpresso/api-types";
import { useQuery } from "@tanstack/react-query";
import { CalendarPlus, CalendarRange, ChevronDown, ChevronRight, Clock, MapPin, Plus, UsersRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { EventFormDialog } from "@/components/panel/event-form";
import { MissingBadge, PhaseBadge } from "@/components/panel/event-phase";
import { Badge, Button, EmptyState, ErrorMessage, PageHeader, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { eventPhase, groupSeries, sortEvents, type ListEntry } from "@/lib/event-list";
import { dateParts, money } from "@/lib/format";
import { dayLabel, hourLabel } from "@/lib/series";
import { areaList } from "@/lib/team";
import { event as eventTexts } from "@/texts/pt-BR/event";
import { eventChange as eventChangeTexts } from "@/texts/pt-BR/event-change";
import { panel as panelTexts } from "@/texts/pt-BR/panel";
import { series as seriesTexts } from "@/texts/pt-BR/series";

const t = panelTexts;

/** Phase, postponement and what the checklist still misses (ADR 0078). */
function EventBadges({ event, now }: { event: EventDto; now: number }) {
  const phase = eventPhase(event, now);
  // A postponed event (ADR 0065) says so next to its phase, until it ends.
  const postponed = event.change.postponedFromStartsAt !== null && (phase === "upcoming" || phase === "today");
  return (
    <span className="flex flex-wrap items-center justify-end gap-1.5">
      <PhaseBadge phase={phase} />
      {event.kind === "tokens" && <Badge tone="brand">{t.tokensBadge}</Badge>}
      {postponed && <Badge tone="warning">{eventChangeTexts.postponedBadge}</Badge>}
      <MissingBadge count={event.checklistMissing} />
    </span>
  );
}

function TeamLine({ event }: { event: EventDto }) {
  if (event.team === null) {
    return null;
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-fg-muted">
      <UsersRound className="size-3.5 text-brand" aria-hidden />
      {eventTexts.team.listBadge}
    </span>
  );
}

/** The calendar leaf of a date; a series shows it stacked (ADR 0077). */
function DateLeaf({ iso, stacked = false }: { iso: string; stacked?: boolean }) {
  const date = dateParts(iso);
  return (
    <div
      className={cn(
        "flex w-14 shrink-0 flex-col items-center self-start overflow-hidden rounded-xl border border-border bg-bg text-center",
        // Two leaves behind it, drawn as shadows: they take no room, so the text lines up with the other cards.
        stacked && "shadow-[3px_3px_0_-1px_var(--surface),3px_3px_0_0_var(--border),6px_6px_0_-1px_var(--surface),6px_6px_0_0_var(--border)]",
      )}
    >
      <span className="w-full bg-brand-solid py-0.5 text-[11px] font-semibold tracking-wide text-brand-fg uppercase">{date.month}</span>
      <span className="py-1 text-xl leading-none font-semibold text-fg tabular">{date.day}</span>
      <span className="pb-1 text-[11px] text-fg-muted uppercase">{date.weekday}</span>
    </div>
  );
}

/** A card in the grid; on phones, a compact row (date, name, time and place) to scan many at once. */
function EventCard({ event, now }: { event: EventDto; now: number }) {
  const date = dateParts(event.startsAt);
  const badge = <EventBadges event={event} now={now} />;
  return (
    <Link
      href={`/painel/eventos/${event.id}`}
      className="group flex items-center gap-4 rounded-2xl border border-border bg-surface p-4 shadow-xs transition active:scale-[0.99] active:bg-surface-2 sm:flex-col sm:items-stretch sm:gap-5 sm:p-5 sm:hover:-translate-y-0.5 sm:hover:border-brand/40 sm:hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3 max-sm:contents">
        <DateLeaf iso={event.startsAt} />
        <div className="flex flex-col items-end gap-1.5 max-sm:hidden">
          {badge}
          <TeamLine event={event} />
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 sm:gap-2">
        <div className="flex flex-wrap items-center gap-2 sm:hidden">
          {badge}
          <TeamLine event={event} />
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
              {eventTexts.team.listLine(event.team.organization, areaList(event.team.areas))}
            </span>
          )}
        </div>
      </div>
      <ChevronRight className="size-5 shrink-0 text-fg-subtle sm:hidden" aria-hidden />
      <span className="mt-auto flex items-center gap-1 text-sm font-medium text-brand max-sm:hidden">
        {eventTexts.overview.go}
        <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </span>
    </Link>
  );
}

/**
 * The dates of a series together (ADR 0077), in the place of the date that needs attention
 * first. The card opens the series page; the dates unfold below, each with its own phase and
 * checklist.
 */
function SeriesCard({ entry, now }: { entry: Extract<ListEntry<EventDto>, { kind: "series" }>; now: number }) {
  const [open, setOpen] = useState(false);
  const lead = entry.lead;
  const leadPhase = eventPhase(lead, now);
  const when = `${dayLabel(lead.startsAt)} ${hourLabel(lead.startsAt)}`;
  const s = seriesTexts;
  const badges = (
    <span className="flex flex-wrap items-center justify-end gap-1.5">
      <PhaseBadge phase={leadPhase} />
      <MissingBadge count={entry.missing} />
    </span>
  );
  const panel = `series-${entry.id}`;
  return (
    <div className="flex flex-col rounded-2xl border border-border bg-surface shadow-xs transition sm:hover:border-brand/40 sm:hover:shadow-md">
      <div className="flex items-center gap-2 p-4 pr-2 sm:flex-col sm:items-stretch sm:gap-5 sm:p-5">
        <Link
          href={`/painel/series/${entry.id}`}
          className="group flex min-w-0 flex-1 items-center gap-4 rounded-xl transition active:opacity-80 sm:flex-col sm:items-stretch sm:gap-5"
        >
          <div className="flex items-start justify-between gap-3 max-sm:contents">
            <DateLeaf iso={lead.startsAt} stacked />
            <div className="flex flex-col items-end gap-1.5 max-sm:hidden">
              {badges}
              <TeamLine event={lead} />
            </div>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1 sm:gap-2">
            <div className="flex flex-wrap items-center gap-2 sm:hidden">{badges}</div>
            <h2 className="line-clamp-2 text-base leading-snug font-semibold tracking-tight text-fg group-hover:text-brand sm:truncate sm:text-lg">
              {entry.name}
            </h2>
            <div className="flex flex-col gap-1 text-sm text-fg-muted">
              <span className="flex items-center gap-2">
                <CalendarRange className="size-4 shrink-0 text-fg-subtle" aria-hidden />
                <span className="truncate">
                  {s.dates(entry.dates.length)} ·{" "}
                  {leadPhase === "past" || leadPhase === "canceled" || leadPhase === "archived" ? s.listLast(when) : s.listNext(when)}
                </span>
              </span>
              <span className="flex min-w-0 items-center gap-2">
                <MapPin className="size-4 shrink-0 text-fg-subtle" aria-hidden />
                <span className="truncate">{lead.venue ?? t.noVenue}</span>
              </span>
            </div>
          </div>
        </Link>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panel}
          onClick={() => {
            setOpen((value) => !value);
          }}
          className="inline-flex size-11 shrink-0 items-center justify-center gap-1.5 self-center rounded-lg text-sm font-medium text-fg-muted transition hover:bg-surface-2 hover:text-fg active:bg-surface-2 sm:mt-auto sm:size-auto sm:min-h-9 sm:self-start sm:px-2 sm:-ml-2 pointer-coarse:sm:min-h-11"
        >
          <ChevronDown aria-hidden className={cn("size-5 transition-transform sm:size-4", open && "rotate-180")} />
          <span className="max-sm:sr-only">{open ? s.hideDates : s.showDates(entry.dates.length)}</span>
        </button>
      </div>
      {open && (
        <ul id={panel} className="flex flex-col border-t border-border p-2 animate-fade-in">
          {entry.dates.map((date) => {
            return (
              <li key={date.id}>
                <Link
                  href={`/painel/eventos/${date.id}`}
                  className="group flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm transition hover:bg-surface-2 active:bg-surface-2"
                >
                  <span className="w-24 shrink-0 font-medium text-fg tabular">
                    {dayLabel(date.startsAt)} · {hourLabel(date.startsAt)}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                    <PhaseBadge phase={eventPhase(date, now)} dot={false} />
                    <MissingBadge count={date.checklistMissing} />
                  </span>
                  <ChevronRight aria-hidden className="size-4 shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
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
  // The dates of a series go together, in the place of the one that needs attention first (ADR 0077).
  const entries = groupSeries(shown);

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
              {entries.map((entry) =>
                entry.kind === "event" ? (
                  <EventCard key={entry.event.id} event={entry.event} now={now} />
                ) : (
                  <SeriesCard key={entry.id} entry={entry} now={now} />
                ),
              )}
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
