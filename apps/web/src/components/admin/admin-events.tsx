"use client";

import type { AdminEventSearchDto } from "@ingressoimpresso/api-types";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useState } from "react";

import { SearchBox } from "@/components/admin/admin-views";
import { Badge, EmptyState, ErrorMessage, LoadingBlock } from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { eventDateTime } from "@/lib/format";
import { admin as adminTexts } from "@/texts/pt-BR/admin";
import { event as eventTexts } from "@/texts/pt-BR/event";

const t = adminTexts.events;

/**
 * Events of every organization (ADR 0079): opening one is support mode (ADR 0032), with the
 * organizer's own screens, so an improper name or anything else is fixed there.
 */
export function AdminEvents() {
  const [query, setQuery] = useState("");
  const search = useDeferredValue(query.trim());
  const events = useQuery({
    queryKey: ["admin", "events", search],
    queryFn: () => api<AdminEventSearchDto[]>(`/api/admin/events?q=${encodeURIComponent(search)}`),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-fg-muted">{t.intro}</p>
      <SearchBox value={query} onChange={setQuery} label={t.search} />
      {events.isPending ? (
        <LoadingBlock rows={4} />
      ) : events.isError ? (
        <ErrorMessage error={events.error} onRetry={() => void events.refetch()} />
      ) : events.data.length === 0 ? (
        <EmptyState icon={CalendarDays} title={t.empty} />
      ) : (
        <ul
          className={cn(
            "flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface",
            events.isPlaceholderData && "opacity-60",
          )}
        >
          {events.data.map((event) => (
            <li key={event.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/painel/eventos/${event.id}`}
                    title={adminTexts.organization.openEvent}
                    className="truncate font-semibold text-fg underline-offset-2 hover:text-brand hover:underline"
                  >
                    {event.name}
                  </Link>
                  {event.canceled && (
                    <Badge tone="danger" dot>
                      {t.canceled}
                    </Badge>
                  )}
                  {event.status === "closed" && <Badge>{eventTexts.actions.archivedBadge}</Badge>}
                </span>
                <Link
                  href={`/painel/admin/organizacoes/${event.organizationId}`}
                  className="w-fit truncate text-sm text-brand underline-offset-2 hover:underline"
                >
                  {event.organizationName}
                </Link>
                <span className="text-xs text-fg-subtle">
                  {eventDateTime(event.startsAt)} · {t.tickets(event.paidTickets)}
                </span>
              </div>
              <Link
                href={`/painel/eventos/${event.id}`}
                aria-label={`${adminTexts.organization.openEvent}: ${event.name}`}
                className="relative flex size-9 shrink-0 items-center justify-center rounded-xl text-fg-subtle transition touch-target hover:bg-surface-2 hover:text-fg active:bg-surface-2"
              >
                <ChevronRight className="size-4" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
