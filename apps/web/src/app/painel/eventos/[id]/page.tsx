"use client";

import type { EventDto } from "@ingressoimpresso/api-types";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BarChart3,
  SearchX,
  Ban,
  CalendarDays,
  ChevronLeft,
  FileDown,
  LayoutDashboard,
  MapPin,
  Pencil,
  Send,
  Smartphone,
  Tag,
  Ticket,
  Users,
  Layers,
  LifeBuoy,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { Suspense, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";

import { TABS, tabFromSlug, tabSlug, type Tab } from "@/components/event/tabs";
import { EventActions } from "@/components/event/event-actions";
import { EventFormDialog } from "@/components/panel/event-form";
import { Badge, Button, ButtonLink, EmptyState, ErrorMessage, LoadingBlock, Skeleton, useConfirm } from "@/components/ui";
import { ApiError, api, isUuid } from "@/lib/api";
import { cn } from "@/lib/cn";
import { eventDateTime, money } from "@/lib/format";
import { hasUnsavedChanges } from "@/lib/unsaved";
import { texts } from "@/texts/pt-BR";

// Each tab is its own chunk: opening an event loads only the tab on screen.
const tabLoading = () => <LoadingBlock rows={3} />;
const OverviewTab = dynamic(() => import("@/components/event/overview").then((m) => m.OverviewTab), { loading: tabLoading });
const DesignTab = dynamic(() => import("@/components/event/design").then((m) => m.DesignTab), { loading: tabLoading });
const BatchesTab = dynamic(() => import("@/components/event/batches").then((m) => m.BatchesTab), { loading: tabLoading });
const SellersTab = dynamic(() => import("@/components/event/sellers").then((m) => m.SellersTab), { loading: tabLoading });
const DigitalTab = dynamic(() => import("@/components/event/digital").then((m) => m.DigitalTab), { loading: tabLoading });
const VoidsTab = dynamic(() => import("@/components/event/voids").then((m) => m.VoidsTab), { loading: tabLoading });
const FilesTab = dynamic(() => import("@/components/event/files").then((m) => m.FilesTab), { loading: tabLoading });
const DoorTab = dynamic(() => import("@/components/event/door").then((m) => m.DoorTab), { loading: tabLoading });
const ReportTab = dynamic(() => import("@/components/event/report").then((m) => m.ReportTab), { loading: tabLoading });

const ICONS: Record<Tab, LucideIcon> = {
  overview: LayoutDashboard,
  design: Ticket,
  batches: Layers,
  sellers: Users,
  digital: Send,
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
  // Anything but an id never reaches the API (a crafted address could aim at another endpoint).
  const eventId = isUuid(params.id) ? params.id : "";
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab = tabFromSlug(search.get("aba"));
  const [editing, setEditing] = useState(false);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const event = useQuery({
    queryKey: ["event", eventId],
    queryFn: () => (eventId === "" ? Promise.reject(new ApiError(404, "not_found")) : api<EventDto>(`/api/events/${eventId}`)),
  });

  const confirm = useConfirm();
  const leaveAllowed = async () =>
    !hasUnsavedChanges() ||
    confirm({
      title: texts.event.design.leaveConfirmTitle,
      description: texts.event.design.leaveConfirmBody,
      confirmLabel: texts.event.design.leaveConfirm,
    });

  const select = async (next: Tab) => {
    if (next === tab || !(await leaveAllowed())) {
      return;
    }
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
    const targets: Partial<Record<string, number>> = {
      ArrowRight: (index + 1) % TABS.length,
      ArrowLeft: (index - 1 + TABS.length) % TABS.length,
      Home: 0,
      End: TABS.length - 1,
    };
    const next = targets[keyEvent.key];
    const target = next === undefined ? undefined : TABS[next];
    if (next === undefined || target === undefined) {
      return;
    }
    keyEvent.preventDefault();
    tabRefs.current[next]?.focus();
    void select(target);
  };

  // The selected tab stays visible in the scrollable strip (phones, deep links like ?aba=relatorio).
  useEffect(() => {
    tabRefs.current[TABS.indexOf(tab)]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [tab, event.isSuccess]);

  // The browser tab shows the event name.
  const name = event.data?.name;
  useEffect(() => {
    if (name !== undefined) {
      document.title = `${name} · ${texts.meta.title}`;
    }
  }, [name]);

  const back = (clickEvent: MouseEvent<HTMLAnchorElement>) => {
    if (hasUnsavedChanges()) {
      clickEvent.preventDefault();
      void leaveAllowed().then((ok) => {
        if (ok) {
          router.push("/painel");
        }
      });
    }
  };

  if (event.isPending) {
    return <HeaderSkeleton />;
  }
  if (event.isError) {
    if (event.error instanceof ApiError && event.error.status === 404) {
      return (
        <EmptyState
          icon={SearchX}
          title={texts.event.notFoundTitle}
          description={texts.event.notFound}
          action={
            <ButtonLink href="/painel" variant="secondary" icon={<ArrowLeft />}>
              {texts.event.backToEvents}
            </ButtonLink>
          }
        />
      );
    }
    return <ErrorMessage error={event.error} />;
  }
  const data = event.data;

  return (
    <main className="flex flex-col gap-6 animate-fade-in">
      {data.supportAccess && (
        <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning-fg">
          <LifeBuoy className="size-4 shrink-0" aria-hidden />
          <span className="flex-1">{texts.admin.support.banner}</span>
          <Link href="/painel/admin?aba=organizacoes" className="font-semibold underline-offset-2 hover:underline">
            {texts.admin.support.backToAdmin}
          </Link>
        </div>
      )}
      <div className="flex flex-col gap-3">
        <Link
          href="/painel"
          onClick={back}
          className="inline-flex w-fit items-center gap-1 rounded-md text-sm font-medium text-fg-muted transition hover:text-fg"
        >
          <ChevronLeft className="size-4" aria-hidden />
          {texts.event.backToEvents}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-balance text-fg sm:text-3xl">
              {data.name}
              {data.status === "closed" && (
                <Badge tone="neutral" className="ml-3 align-middle">
                  {texts.event.actions.archivedBadge}
                </Badge>
              )}
            </h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-fg-muted">
              <span className="flex items-center gap-1.5">
                <CalendarDays className="size-4 text-fg-subtle" aria-hidden />
                {eventDateTime(data.startsAt)}
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
          <div className="flex items-center gap-2">
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
            <EventActions event={data} />
          </div>
        </div>
      </div>

      <div className="sticky top-16 z-30 -mx-4 border-b border-border bg-bg/85 px-4 backdrop-blur-xl sm:-mx-6 sm:px-6">
        <nav
          role="tablist"
          aria-label={data.name}
          // On small screens the strip fades at the edge: there are more tabs to scroll to.
          className="-mb-px flex gap-1 overflow-x-auto [mask-image:linear-gradient(to_right,black_85%,transparent)] [scrollbar-width:none] sm:[mask-image:none] [&::-webkit-scrollbar]:hidden"
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
                aria-controls={selected ? `panel-${item}` : undefined}
                tabIndex={selected ? 0 : -1}
                onClick={() => {
                  void select(item);
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
        {tab === "digital" && <DigitalTab eventId={eventId} onSelect={select} />}
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
