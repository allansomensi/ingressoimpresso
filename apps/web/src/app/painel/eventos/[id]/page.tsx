"use client";

import type { EventDto } from "@ingressoimpresso/api-types";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Ban,
  CalendarDays,
  ChevronLeft,
  FileDown,
  LayoutDashboard,
  MapPin,
  Pencil,
  Smartphone,
  Tag,
  Ticket,
  Users,
  Layers,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useRef, useState, type KeyboardEvent } from "react";

import { BatchesTab } from "@/components/event/batches";
import { DesignTab } from "@/components/event/design";
import { DoorTab } from "@/components/event/door";
import { FilesTab } from "@/components/event/files";
import { OverviewTab } from "@/components/event/overview";
import { ReportTab } from "@/components/event/report";
import { SellersTab } from "@/components/event/sellers";
import { TABS, tabFromSlug, tabSlug, type Tab } from "@/components/event/tabs";
import { VoidsTab } from "@/components/event/voids";
import { EventFormDialog } from "@/components/panel/event-form";
import { Button, ErrorMessage, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { dateTime, money } from "@/lib/format";
import { texts } from "@/texts/pt-BR";

const ICONS: Record<Tab, LucideIcon> = {
  overview: LayoutDashboard,
  design: Ticket,
  batches: Layers,
  sellers: Users,
  voids: Ban,
  files: FileDown,
  door: Smartphone,
  report: BarChart3,
};

export default function EventPage() {
  return (
    <Suspense fallback={<HeaderSkeleton />}>
      <EventView />
    </Suspense>
  );
}

function HeaderSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label={texts.common.loading}>
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-9 w-72 max-w-full" />
      <Skeleton className="h-5 w-96 max-w-full" />
      <Skeleton className="mt-4 h-11 w-full" />
    </div>
  );
}

function EventView() {
  const params = useParams<{ id: string }>();
  const eventId = params.id;
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab = tabFromSlug(search.get("aba"));
  const [editing, setEditing] = useState(false);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const event = useQuery({ queryKey: ["event", eventId], queryFn: () => api<EventDto>(`/api/events/${eventId}`) });

  const select = (next: Tab) => {
    const query = new URLSearchParams(search.toString());
    query.set("aba", tabSlug(next));
    // Payment return parameters belong to the batches tab only.
    if (next !== "batches") {
      query.delete("pagamento");
      query.delete("lote");
    }
    router.replace(`${pathname}?${query.toString()}`, { scroll: false });
  };

  const keyDown = (keyEvent: KeyboardEvent, index: number) => {
    const delta = keyEvent.key === "ArrowRight" ? 1 : keyEvent.key === "ArrowLeft" ? -1 : 0;
    if (delta === 0) {
      return;
    }
    keyEvent.preventDefault();
    const next = (index + delta + TABS.length) % TABS.length;
    const target = TABS[next];
    if (target !== undefined) {
      select(target);
      tabRefs.current[next]?.focus();
    }
  };

  if (event.isPending) {
    return <HeaderSkeleton />;
  }
  if (event.isError) {
    return <ErrorMessage error={event.error} />;
  }
  const data = event.data;

  return (
    <main className="flex flex-col gap-6 animate-fade-in">
      <div className="flex flex-col gap-3">
        <Link
          href="/painel"
          className="inline-flex w-fit items-center gap-1 rounded-md text-sm font-medium text-fg-muted transition hover:text-fg"
        >
          <ChevronLeft className="size-4" aria-hidden />
          {texts.event.backToEvents}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-balance text-fg sm:text-3xl">{data.name}</h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-fg-muted">
              <span className="flex items-center gap-1.5">
                <CalendarDays className="size-4 text-fg-subtle" aria-hidden />
                {dateTime(data.startsAt)}
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin className="size-4 text-fg-subtle" aria-hidden />
                {data.venue ?? texts.panel.noVenue}
              </span>
              {data.ticketPriceCents !== null && (
                <span className="flex items-center gap-1.5">
                  <Tag className="size-4 text-fg-subtle" aria-hidden />
                  {texts.event.priceLabel(money(data.ticketPriceCents))}
                </span>
              )}
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            icon={<Pencil />}
            onClick={() => {
              setEditing(true);
            }}
          >
            {texts.panel.editEvent}
          </Button>
        </div>
      </div>

      <div className="sticky top-16 z-30 -mx-4 border-b border-border bg-bg/85 px-4 backdrop-blur-xl sm:-mx-6 sm:px-6">
        <nav
          role="tablist"
          aria-label={data.name}
          className="-mb-px flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {TABS.map((item, index) => {
            const Icon = ICONS[item];
            const selected = tab === item;
            return (
              <button
                key={item}
                ref={(element) => {
                  tabRefs.current[index] = element;
                }}
                type="button"
                role="tab"
                id={`tab-${item}`}
                aria-selected={selected}
                aria-controls={`panel-${item}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => {
                  select(item);
                }}
                onKeyDown={(keyEvent) => {
                  keyDown(keyEvent, index);
                }}
                className={cn(
                  "flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium whitespace-nowrap transition",
                  selected
                    ? "border-brand text-fg"
                    : "border-transparent text-fg-muted hover:border-border-strong hover:text-fg",
                )}
              >
                <Icon aria-hidden className={cn("size-4", selected ? "text-brand" : "text-fg-subtle")} />
                {texts.event.tabs[item]}
              </button>
            );
          })}
        </nav>
      </div>

      <section role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} key={tab} className="animate-fade-in">
        {tab === "overview" && <OverviewTab eventId={eventId} onSelect={select} />}
        {tab === "design" && <DesignTab eventId={eventId} />}
        {tab === "batches" && <BatchesTab eventId={eventId} onSelect={select} />}
        {tab === "sellers" && <SellersTab eventId={eventId} />}
        {tab === "voids" && <VoidsTab eventId={eventId} />}
        {tab === "files" && <FilesTab eventId={eventId} onSelect={select} />}
        {tab === "door" && <DoorTab eventId={eventId} />}
        {tab === "report" && <ReportTab eventId={eventId} />}
      </section>

      <EventFormDialog
        open={editing}
        onClose={() => {
          setEditing(false);
        }}
        event={data}
      />
    </main>
  );
}
