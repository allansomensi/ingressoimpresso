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
  UsersRound,
  Layers,
  Tags,
  LifeBuoy,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { Suspense, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";

import { AreaGate, EventAccessProvider } from "@/components/event/access";
import { SectionsSheet } from "@/components/event/sections-sheet";
import { STRIP_TABS, tabFromSlug, tabSlug, type Tab } from "@/components/event/tabs";
import { EventActions } from "@/components/event/event-actions";
import { EventFormDialog } from "@/components/panel/event-form";
import { Badge, Button, ButtonLink, EmptyState, ErrorMessage, LoadingBlock, Skeleton, useConfirm } from "@/components/ui";
import { ApiError, api, isUuid } from "@/lib/api";
import { cn } from "@/lib/cn";
import { eventDateTime, money } from "@/lib/format";
import { areaList, canDo, isOwner } from "@/lib/team";
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
const CategoriesTab = dynamic(() => import("@/components/event/categories").then((m) => m.CategoriesTab), { loading: tabLoading });
const TeamTab = dynamic(() => import("@/components/event/team").then((m) => m.TeamTab), { loading: tabLoading });

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
      ArrowRight: (index + 1) % STRIP_TABS.length,
      ArrowLeft: (index - 1 + STRIP_TABS.length) % STRIP_TABS.length,
      Home: 0,
      End: STRIP_TABS.length - 1,
    };
    const next = targets[keyEvent.key];
    const target = next === undefined ? undefined : STRIP_TABS[next];
    if (next === undefined || target === undefined) {
      return;
    }
    keyEvent.preventDefault();
    tabRefs.current[next]?.focus();
    void select(target);
  };

  // The selected tab stays visible in the scrollable strip (phones, deep links like ?aba=relatorio).
  useEffect(() => {
    tabRefs.current[STRIP_TABS.indexOf(tab)]?.scrollIntoView({ block: "nearest", inline: "nearest" });
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
    <EventAccessProvider event={data}>
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
      {/* Phones: back link and actions share the first row, and the actions are icons, so the
          tab content starts higher (ADR 0060). Larger screens keep the actions beside the title. */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 sm:gap-y-3">
        <Link
          href="/painel"
          onClick={back}
          className="col-start-1 row-start-1 -ml-1.5 inline-flex min-h-9 w-fit items-center gap-1 rounded-lg px-1.5 text-sm font-medium text-fg-muted transition hover:text-fg active:bg-surface-2 pointer-coarse:min-h-10"
        >
          <ChevronLeft className="size-4" aria-hidden />
          {texts.event.backToEvents}
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
            <span className="max-sm:sr-only">{texts.event.tabs.team}</span>
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
              <span className="max-sm:sr-only">{texts.panel.editEvent}</span>
            </Button>
          )}
          {isOwner(data) && <EventActions event={data} />}
        </div>
        <div className="col-span-2 col-start-1 row-start-2 flex min-w-0 flex-col gap-2 sm:col-span-1">
          <h1 className="text-[1.375rem] leading-tight font-semibold tracking-tight text-balance text-fg sm:text-3xl">
            {data.name}
            {data.status === "closed" && (
              <Badge tone="neutral" className="ml-3 align-middle">
                {texts.event.actions.archivedBadge}
              </Badge>
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
              <span className="truncate">{data.venue ?? texts.panel.noVenue}</span>
            </span>
            {data.ticketPriceCents !== null && (
              <span className="flex items-center gap-1.5">
                <Tag className="size-4 shrink-0 text-fg-subtle" aria-hidden />
                {texts.event.priceLabel(money(data.ticketPriceCents))}
              </span>
            )}
          </div>
          {data.team !== null && (
            <button
              type="button"
              onClick={() => {
                void select("team");
              }}
              className="flex w-fit max-w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-full border border-border bg-surface px-3 py-1 text-xs text-fg-muted transition hover:border-border-strong hover:text-fg active:bg-surface-2"
            >
              <UsersRound className="size-3.5 text-brand" aria-hidden />
              <span className="font-medium text-fg">{texts.event.team.teamOf(data.team.organization)}</span>
              <span aria-hidden>·</span>
              <span>{texts.event.team.yourParts(areaList(data.team.areas))}</span>
            </button>
          )}
        </div>
      </div>

      {/* Under the panel header, which is taller by the safe area in an installed iPhone app. */}
      <div className="sticky top-[calc(4rem+env(safe-area-inset-top))] z-30 -mx-4 border-b border-border bg-bg/85 backdrop-blur-xl sm:-mx-6 sm:px-6">
        <nav
          role="tablist"
          aria-label={data.name}
          // Until the strip fits (xl), it fades under the sections button: there are more tabs.
          className="-mb-px flex scroll-pl-4 gap-0.5 overflow-x-auto pl-4 scrollbar-none max-xl:scroll-pr-20 max-xl:pr-20 max-xl:[mask-image:linear-gradient(to_right,black_calc(100%-5rem),transparent_calc(100%-2.75rem))] sm:scroll-pl-0 sm:pl-0"
        >
          {STRIP_TABS.map((item, index) => {
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
                <Icon aria-hidden className={cn("size-4", selected ? "text-brand" : "text-fg-subtle")} />
                {texts.event.tabs[item]}
              </button>
            );
          })}
        </nav>
        <div className="absolute inset-y-0 right-2 flex items-center sm:right-4 xl:hidden">
          <SectionsSheet
            current={tab}
            icons={ICONS}
            onSelect={(next) => {
              void select(next);
            }}
          />
        </div>
      </div>

      <section
        key={tab}
        role="tabpanel"
        id={`panel-${tab}`}
        aria-label={tab === "team" ? texts.event.tabs.team : undefined}
        aria-labelledby={tab === "team" ? undefined : `tab-${tab}`}
        className="animate-fade-in"
      >
        {tab === "overview" && <OverviewTab eventId={eventId} onSelect={select} />}
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
            <DoorTab eventId={eventId} />
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
