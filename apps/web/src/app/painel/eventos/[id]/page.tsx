"use client";

import type { EventDto } from "@ingressoimpresso/api-types";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BarChart3,
  SearchX,
  Ban,
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Coins,
  FileDown,
  LayoutDashboard,
  MapPin,
  Pencil,
  Send,
  Smartphone,
  Tag,
  Ticket,
  Users,
  UsersRound,
  Layers,
  Tags,
  LifeBuoy,
  Activity,
  ListChecks,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { Suspense, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";

import { AreaGate, EventAccessProvider } from "@/components/event/access";
import { SectionsSheet } from "@/components/event/sections-sheet";
import { tabFromSlug, tabLabel, tabSlug, tabsOf, type Tab } from "@/components/event/tabs";
import { EventActions } from "@/components/event/event-actions";
import { EventChangeBanner } from "@/components/event/event-change";
import { EventFormDialog } from "@/components/panel/event-form";
import { Badge, Button, ButtonLink, EmptyState, ErrorMessage, LoadingBlock, Skeleton, useConfirm, useScrollEdges } from "@/components/ui";
import { ApiError, api, isUuid } from "@/lib/api";
import { cn } from "@/lib/cn";
import { eventDateTime, money } from "@/lib/format";
import { changeKind } from "@/lib/event-change";
import { positionLabel } from "@/lib/series";
import { areaList, canDo } from "@/lib/team";
import { hasUnsavedChanges } from "@/lib/unsaved";
import { admin as adminTexts } from "@/texts/pt-BR/admin";
import { common as commonTexts } from "@/texts/pt-BR/common";
import { event as eventTexts } from "@/texts/pt-BR/event";
import { eventChange as eventChangeTexts } from "@/texts/pt-BR/event-change";
import { meta as metaTexts } from "@/texts/pt-BR/meta";
import { panel as panelTexts } from "@/texts/pt-BR/panel";
import { series as seriesTexts } from "@/texts/pt-BR/series";

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
const CategoriesTab = dynamic(() => import("@/components/event/categories").then((m) => m.CategoriesTab), { loading: tabLoading });
const TeamTab = dynamic(() => import("@/components/event/team").then((m) => m.TeamTab), { loading: tabLoading });
const LiveTab = dynamic(() => import("@/components/event/live").then((m) => m.LiveTab), { loading: tabLoading });
const GuestsTab = dynamic(() => import("@/components/event/guests").then((m) => m.GuestsTab), { loading: tabLoading });

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
  categories: Tags,
  team: UsersRound,
  live: Activity,
  guests: ListChecks,
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
    <div className="flex flex-col gap-4" aria-busy="true" aria-label={commonTexts.loading}>
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
  const requested = tabFromSlug(search.get("aba"));
  const [editing, setEditing] = useState(false);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const { attach: attachStrip, ...edges } = useScrollEdges();
  const event = useQuery({
    queryKey: ["event", eventId],
    queryFn: () => (eventId === "" ? Promise.reject(new ApiError(404, "not_found")) : api<EventDto>(`/api/events/${eventId}`)),
  });
  // Consumption tokens have fewer tabs (ADR 0084); a link to a missing one opens the overview.
  const kind = event.data?.kind;
  const strip = tabsOf(kind);
  const tab = requested === "team" || strip.includes(requested) ? requested : "overview";

  const confirm = useConfirm();
  const leaveAllowed = async () =>
    !hasUnsavedChanges() ||
    confirm({
      title: eventTexts.design.leaveConfirmTitle,
      description: eventTexts.design.leaveConfirmBody,
      confirmLabel: eventTexts.design.leaveConfirm,
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
      ArrowRight: (index + 1) % strip.length,
      ArrowLeft: (index - 1 + strip.length) % strip.length,
      Home: 0,
      End: strip.length - 1,
    };
    const next = targets[keyEvent.key];
    const target = next === undefined ? undefined : strip[next];
    if (next === undefined || target === undefined) {
      return;
    }
    keyEvent.preventDefault();
    tabRefs.current[next]?.focus();
    void select(target);
  };

  // The selected tab stays visible in the scrollable strip (phones, deep links like ?aba=relatorio).
  useEffect(() => {
    tabRefs.current[tabsOf(kind).indexOf(tab)]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [tab, event.isSuccess, kind]);

  // The browser tab shows the event name.
  const name = event.data?.name;
  useEffect(() => {
    if (name !== undefined) {
      document.title = `${name} · ${metaTexts.title}`;
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
          title={eventTexts.notFoundTitle}
          description={eventTexts.notFound}
          action={
            <ButtonLink href="/painel" variant="secondary" icon={<ArrowLeft />}>
              {eventTexts.backToEvents}
            </ButtonLink>
          }
        />
      );
    }
    return <ErrorMessage error={event.error} />;
  }
  const data = event.data;

  return (
    <EventAccessProvider event={data}>
    <main className="flex flex-col gap-6 animate-fade-in">
      {data.supportAccess && (
        <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning-fg">
          <LifeBuoy className="size-4 shrink-0" aria-hidden />
          <span className="flex-1">{adminTexts.support.banner}</span>
          <Link href="/painel/admin?aba=eventos" className="font-semibold underline-offset-2 hover:underline">
            {adminTexts.support.backToAdmin}
          </Link>
        </div>
      )}
      {/* Phones: back link and actions share the first row, and the actions are icons, so the
          tab content starts higher (ADR 0060). Larger screens keep the actions beside the title. */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 sm:gap-y-3">
        <Link
          href="/painel"
          onClick={back}
          className="col-start-1 row-start-1 -ml-1.5 inline-flex min-h-9 w-fit items-center gap-1 rounded-lg px-1.5 text-sm font-medium text-fg-muted transition hover:text-fg active:bg-surface-2 pointer-coarse:min-h-10"
        >
          <ChevronLeft className="size-4" aria-hidden />
          {eventTexts.backToEvents}
        </Link>
        <div className="col-start-2 row-start-1 flex items-center gap-2 sm:row-start-2 sm:self-start">
          <Button
            variant={tab === "team" ? "primary" : "secondary"}
            size="sm"
            icon={<UsersRound />}
            aria-pressed={tab === "team"}
            onClick={() => {
              void select("team");
            }}
          >
            <span className="max-sm:sr-only">{eventTexts.tabs.team}</span>
          </Button>
          {canDo(data, "manage") && (
            <Button
              variant="secondary"
              size="sm"
              icon={<Pencil />}
              onClick={() => {
                setEditing(true);
              }}
            >
              <span className="max-sm:sr-only">{panelTexts.editEvent}</span>
            </Button>
          )}
          <EventActions event={data} />
        </div>
        <div className="col-span-2 col-start-1 row-start-2 flex min-w-0 flex-col gap-2 sm:col-span-1">
          <h1 className="text-[1.375rem] leading-tight font-semibold tracking-tight text-balance text-fg sm:text-3xl">
            {data.name}
            {data.kind === "tokens" && (
              <Badge tone="brand" className="ml-3 align-middle">
                <Coins className="size-3.5" aria-hidden />
                {eventTexts.tokens.badge}
              </Badge>
            )}
            {data.status === "closed" && (
              <Badge tone="neutral" className="ml-3 align-middle">
                {eventTexts.actions.archivedBadge}
              </Badge>
            )}
            {changeKind(data.change, data.startsAt) === "canceled" ? (
              <Badge tone="danger" className="ml-3 align-middle">
                {eventChangeTexts.canceledBadge}
              </Badge>
            ) : (
              data.change.postponedFromStartsAt !== null && (
                <Badge tone="warning" className="ml-3 align-middle">
                  {eventChangeTexts.postponedBadge}
                </Badge>
              )
            )}
          </h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-fg-muted sm:text-sm">
            <span className="flex items-center gap-1.5">
              <CalendarDays className="size-4 shrink-0 text-fg-subtle" aria-hidden />
              {eventDateTime(data.startsAt)}
            </span>
            {/* On phones the place takes a line of its own (and is cut if too long). */}
            <span className="flex min-w-0 items-center gap-1.5 max-sm:order-last max-sm:w-full">
              <MapPin className="size-4 shrink-0 text-fg-subtle" aria-hidden />
              <span className="truncate">
                {data.venue ?? panelTexts.noVenue}
                {data.address !== null && <span className="text-fg-subtle"> · {data.address}</span>}
              </span>
            </span>
            {data.ticketPriceCents !== null && (
              <span className="flex items-center gap-1.5">
                <Tag className="size-4 shrink-0 text-fg-subtle" aria-hidden />
                {eventTexts.priceLabel(money(data.ticketPriceCents))}
              </span>
            )}
          </div>
          {(data.team !== null || data.series !== null) && (
            <div className="flex flex-wrap items-center gap-2">
              {data.series !== null && (
                <Link
                  href={`/painel/series/${data.series.id}`}
                  className="flex w-fit max-w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-full border border-border bg-surface px-3 py-1 text-xs text-fg-muted transition hover:border-border-strong hover:text-fg active:bg-surface-2 pointer-coarse:py-1.5"
                >
                  <CalendarRange className="size-3.5 text-brand" aria-hidden />
                  <span className="font-medium text-fg">{positionLabel(data.series)}</span>
                  <span aria-hidden>·</span>
                  <span>{seriesTexts.seeAll}</span>
                </Link>
              )}
              {data.team !== null && (
                <button
                  type="button"
                  onClick={() => {
                    void select("team");
                  }}
                  className="flex w-fit max-w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-full border border-border bg-surface px-3 py-1 text-xs text-fg-muted transition hover:border-border-strong hover:text-fg active:bg-surface-2"
                >
                  <UsersRound className="size-3.5 text-brand" aria-hidden />
                  <span className="font-medium text-fg">{eventTexts.team.teamOf(data.team.organization)}</span>
                  <span aria-hidden>·</span>
                  <span>{eventTexts.team.yourParts(areaList(data.team.areas))}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <EventChangeBanner event={data} />

      {/* Under the panel header, which is taller by the safe area in an installed iPhone app. */}
      <div className="sticky top-[calc(4rem+env(safe-area-inset-top))] z-30 -mx-4 flex items-center border-b border-border bg-bg/85 backdrop-blur-xl sm:-mx-6 sm:px-6">
        <div className="relative min-w-0 flex-1">
          <nav
            ref={attachStrip}
            role="tablist"
            aria-label={data.name}
            // The edges that hide tabs fade out, so there is visibly more to scroll to.
            className={cn(
              "-mb-px flex scroll-px-12 gap-0.5 overflow-x-auto pl-4 scrollbar-none sm:pl-0",
              edges.before && edges.after
                ? "[mask-image:linear-gradient(to_right,transparent,black_3rem,black_calc(100%-3rem),transparent)]"
                : edges.before
                  ? "[mask-image:linear-gradient(to_right,transparent,black_3rem)]"
                  : edges.after
                    ? "[mask-image:linear-gradient(to_left,transparent,black_3rem)]"
                    : undefined,
            )}
          >
            {strip.map((item, index) => {
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
                  // The team opens from the header: the strip still needs one tab to Tab into.
                  tabIndex={selected || (tab === "team" && index === 0) ? 0 : -1}
                  onClick={() => {
                    void select(item);
                  }}
                  onKeyDown={(keyEvent) => {
                    keyDown(keyEvent, index);
                  }}
                  className={cn(
                    "flex shrink-0 items-center gap-2 border-b-2 px-2.5 py-3 text-sm font-medium whitespace-nowrap transition pointer-coarse:py-3.5",
                    selected
                      ? "border-brand text-fg"
                      : "border-transparent text-fg-muted hover:border-border-strong hover:text-fg active:text-fg",
                  )}
                >
                  <Icon aria-hidden className={cn("size-4 shrink-0", selected ? "text-brand" : "text-fg-subtle")} />
                  {tabLabel(item, kind)}
                </button>
              );
            })}
          </nav>
          {/* A mouse has no sideways swipe: arrows page the strip (touch screens swipe it). */}
          {edges.before && (
            <StripArrow
              side="before"
              onClick={() => {
                edges.page(-1);
              }}
            />
          )}
          {edges.after && (
            <StripArrow
              side="after"
              onClick={() => {
                edges.page(1);
              }}
            />
          )}
        </div>
        {edges.overflow && (
          <div className="shrink-0 pr-2 pl-1 sm:pr-0">
            <SectionsSheet
              current={tab}
              icons={ICONS}
              {...(kind === undefined ? {} : { kind })}
              onSelect={(next) => {
                void select(next);
              }}
            />
          </div>
        )}
      </div>

      <section
        key={tab}
        role="tabpanel"
        id={`panel-${tab}`}
        aria-label={tab === "team" ? eventTexts.tabs.team : undefined}
        aria-labelledby={tab === "team" ? undefined : `tab-${tab}`}
        className="animate-fade-in"
      >
        {tab === "overview" && (
          <OverviewTab
            eventId={eventId}
            onSelect={select}
            event={data}
            onEditEvent={() => {
              setEditing(true);
            }}
          />
        )}
        {tab === "design" && <DesignTab eventId={eventId} />}
        {tab === "batches" && (
          <AreaGate eventId={eventId} area="manage">
            <BatchesTab eventId={eventId} onSelect={select} />
          </AreaGate>
        )}
        {tab === "sellers" && (
          <SellersTab
            eventId={eventId}
            event={data}
            onEditEvent={() => {
              setEditing(true);
            }}
          />
        )}
        {tab === "digital" && (
          <AreaGate eventId={eventId} area="delivery">
            <DigitalTab eventId={eventId} onSelect={select} />
          </AreaGate>
        )}
        {tab === "voids" && (
          <AreaGate eventId={eventId} area="delivery">
            <VoidsTab eventId={eventId} onSelect={select} />
          </AreaGate>
        )}
        {tab === "files" && <FilesTab eventId={eventId} onSelect={select} />}
        {tab === "door" && (
          <AreaGate eventId={eventId} area="door">
            <DoorTab eventId={eventId} kind={data.kind} />
          </AreaGate>
        )}
        {tab === "live" && <LiveTab eventId={eventId} onSelect={select} />}
        {tab === "guests" && (
          <AreaGate eventId={eventId} area="door">
            <GuestsTab eventId={eventId} />
          </AreaGate>
        )}
        {tab === "report" && <ReportTab eventId={eventId} onSelect={select} />}
        {tab === "categories" && <CategoriesTab eventId={eventId} event={data} onSelect={select} />}
        {tab === "team" && <TeamTab eventId={eventId} event={data} />}
      </section>

      <EventFormDialog
        open={editing}
        onClose={() => {
          setEditing(false);
        }}
        event={data}
      />
    </main>
    </EventAccessProvider>
  );
}

/** Pages the tab strip on computers; hidden on touch screens, where the strip is swiped. */
function StripArrow({ side, onClick }: { side: "before" | "after"; onClick: () => void }) {
  const Icon = side === "before" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      // The tabs stay reachable by keyboard (arrow keys); this only helps the pointer.
      tabIndex={-1}
      aria-label={side === "before" ? eventTexts.tabsBefore : eventTexts.tabsAfter}
      onClick={onClick}
      className={cn(
        "absolute top-1/2 hidden size-8 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-surface text-fg-muted shadow-sm transition hover:border-border-strong hover:text-fg active:bg-surface-2 pointer-fine:flex",
        side === "before" ? "left-0" : "right-0",
      )}
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}
