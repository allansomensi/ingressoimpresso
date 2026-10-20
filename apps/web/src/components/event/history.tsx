"use client";

import type { ActivityDto, ActivityEntryDto } from "@ingressoimpresso/api-types";
import { useInfiniteQuery } from "@tanstack/react-query";
import { History as HistoryIcon, LifeBuoy } from "lucide-react";
import { useState } from "react";

import { useEventTexts } from "@/components/event/access";
import { Badge, Button, Card, CardHeader, ErrorMessage, LoadingBlock } from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { initials } from "@/lib/format";

type Filter = "all" | "team";

/** "Hoje", "Ontem" or "12 de outubro", for the day headings. */
function dayHeading(iso: string, labels: { today: string; yesterday: string }, now = new Date()): string {
  const day = new Date(iso);
  const start = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diff = Math.round((start(now) - start(day)) / 86_400_000);
  if (diff === 0) {
    return labels.today;
  }
  if (diff === 1) {
    return labels.yesterday;
  }
  return day.toLocaleDateString("pt-BR", { day: "numeric", month: "long", ...(day.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }) });
}

/** Changes grouped by local day, newest first. */
function byDay(entries: readonly ActivityEntryDto[]): [string, ActivityEntryDto[]][] {
  const groups = new Map<string, ActivityEntryDto[]>();
  for (const entry of entries) {
    const date = new Date(entry.at);
    const key = `${String(date.getFullYear())}-${String(date.getMonth())}-${String(date.getDate())}`;
    const list = groups.get(key) ?? [];
    list.push(entry);
    groups.set(key, list);
  }
  return [...groups.values()].map((list) => [list[0]?.at ?? "", list]);
}

/**
 * The event's history (ADR 0099): who of the organization, the team or the platform's support
 * changed what, and when. Seen by who coordinates the event.
 */
export function EventHistory({ eventId }: { eventId: string }) {
  const t = useEventTexts().history;
  const [filter, setFilter] = useState<Filter>("all");
  const history = useInfiniteQuery({
    queryKey: ["activity", eventId],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api<ActivityDto>(`/api/events/${eventId}/activity${pageParam === null ? "" : `?before=${encodeURIComponent(pageParam)}`}`),
    getNextPageParam: (last) => (last.more ? (last.entries.at(-1)?.at ?? null) : null),
  });

  const describe = (entry: ActivityEntryDto): string => {
    const known: Partial<Record<string, string>> = t.actions;
    return known[entry.action] ?? (entry.area === null ? t.fallback : t.fallbackArea(t.areas[entry.area]));
  };

  let body;
  if (history.isPending) {
    body = <LoadingBlock rows={3} />;
  } else if (history.isError) {
    body = <ErrorMessage error={history.error} />;
  } else {
    const entries = history.data.pages.flatMap((page) => page.entries).filter((entry) => filter === "all" || entry.team);
    body =
      entries.length === 0 ? (
        <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm text-fg-muted">{filter === "team" ? t.emptyTeam : t.empty}</p>
      ) : (
        <div className="flex flex-col gap-5">
          {byDay(entries).map(([at, list]) => (
            <section key={at} className="flex flex-col gap-2">
              <h4 className="text-xs font-semibold tracking-wider text-fg-subtle uppercase">{dayHeading(at, t)}</h4>
              <ol className="flex flex-col divide-y divide-border rounded-xl border border-border">
                {list.map((entry) => (
                  <li key={entry.id} className="flex items-start gap-3 px-3.5 py-3">
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                        entry.support ? "bg-surface-2 text-fg-muted" : entry.team ? "bg-brand-soft text-brand-soft-fg" : "bg-surface-3 text-fg",
                      )}
                      aria-hidden
                    >
                      {entry.support ? <LifeBuoy className="size-4" /> : initials(entry.actor)}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-sm text-fg">
                        <span className="font-semibold">{entry.support ? t.support : entry.actor}</span> {describe(entry)}
                      </span>
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-muted">
                        <time dateTime={entry.at}>{new Date(entry.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</time>
                        {entry.email !== null && entry.email !== entry.actor && <span className="truncate">{entry.email}</span>}
                      </span>
                    </span>
                    {entry.team && (
                      <Badge tone="brand" className="shrink-0">
                        {t.teamBadge}
                      </Badge>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          ))}
          {history.hasNextPage && (
            <Button variant="secondary" size="sm" className="w-fit" loading={history.isFetchingNextPage} onClick={() => void history.fetchNextPage()}>
              {t.more}
            </Button>
          )}
        </div>
      );
  }

  return (
    <Card>
      <CardHeader
        title={t.title}
        description={t.description}
        icon={HistoryIcon}
        actions={
          <div role="radiogroup" aria-label={t.filterLabel} className="flex gap-1 rounded-xl bg-surface-2 p-1">
            {(["all", "team"] as const).map((item) => (
              <button
                key={item}
                type="button"
                role="radio"
                aria-checked={filter === item}
                onClick={() => {
                  setFilter(item);
                }}
                className={cn(
                  "min-h-9 rounded-lg px-3 text-sm font-medium transition pointer-coarse:min-h-11",
                  filter === item ? "bg-surface text-fg shadow-xs" : "text-fg-muted hover:text-fg active:bg-surface-3",
                )}
              >
                {t.filters[item]}
              </button>
            ))}
          </div>
        }
      />
      {body}
    </Card>
  );
}
