"use client";

import type { ChecklistDto, EventDto } from "@ingressoimpresso/api-types";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, CalendarRange, ChevronLeft, Coins, LifeBuoy, MapPin, Pencil, SearchX, Tag, UsersRound } from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type MouseEvent } from "react";

import { AreaGate, EventAccessProvider } from "@/components/event/access";
import { EventActions } from "@/components/event/event-actions";
import { EventChangeBanner } from "@/components/event/event-change";
import { EventNav } from "@/components/event/event-nav";
import { tabHeadingId } from "@/components/event/tab-header";
import { tabFromSlug, tabSlug, tabsOf, type Tab } from "@/components/event/tabs";
import { EventFormDialog } from "@/components/panel/event-form";
import { Badge, Button, ButtonLink, EmptyState, ErrorMessage, LoadingBlock, Skeleton, useConfirm } from "@/components/ui";
import { ApiError, api, isUuid } from "@/lib/api";
import { checklistTarget } from "@/lib/checklist";
import { isDoorDay } from "@/lib/door-live";
import { changeKind } from "@/lib/event-change";
import { dayLabel } from "@/lib/event-days";
import { forKind } from "@/lib/event-kind";
import { eventDateTime, money } from "@/lib/format";
import { positionLabel } from "@/lib/series";
import { areaList, canDo } from "@/lib/team";
import { hasUnsavedChanges } from "@/lib/unsaved";
import { admin as adminTexts } from "@/texts/pt-BR/admin";
import { common as commonTexts } from "@/texts/pt-BR/common";
import { event as eventTexts } from "@/texts/pt-BR/event";
import { eventChange as eventChangeTexts } from "@/texts/pt-BR/event-change";
import { eventDays as dayTexts } from "@/texts/pt-BR/event-days";
import { meta as metaTexts } from "@/texts/pt-BR/meta";
import { panel as panelTexts } from "@/texts/pt-BR/panel";
import { series as seriesTexts } from "@/texts/pt-BR/series";

// Each section is its own chunk: opening an event loads only the one on screen.
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
const CertificatesTab = dynamic(() => import("@/components/event/certificates").then((m) => m.CertificatesTab), { loading: tabLoading });
const CredentialsTab = dynamic(() => import("@/components/event/credentials").then((m) => m.CredentialsTab), { loading: tabLoading });
const LiveTab = dynamic(() => import("@/components/event/live").then((m) => m.LiveTab), { loading: tabLoading });
const GuestsTab = dynamic(() => import("@/components/event/guests").then((m) => m.GuestsTab), { loading: tabLoading });

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
      <div className="mt-4 grid items-start gap-6 lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:gap-10">
        <Skeleton className="h-13 w-full lg:h-96" />
        <LoadingBlock rows={3} />
      </div>
    </div>
  );
}

/** Sections where the checklist still misses something the user can do there (ADR 0078). */
function attentionTabs(list: ChecklistDto | undefined): Set<Tab> {
  const tabs = new Set<Tab>();
  for (const item of list?.items ?? []) {
    const target = checklistTarget(item.key);
    if (item.state === "missing" && item.canAct && target.kind === "tab") {
      tabs.add(target.tab);
    }
  }
  return tabs;
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
  const contentRef = useRef<HTMLElement | null>(null);
  const scrollOnChange = useRef(false);
  const event = useQuery({
    queryKey: ["event", eventId],
    queryFn: () => (eventId === "" ? Promise.reject(new ApiError(404, "not_found")) : api<EventDto>(`/api/events/${eventId}`)),
  });
  // The list of what is missing marks the sections in the navigation; the overview shares it.
  const checklist = useQuery({
    queryKey: ["checklist", eventId],
    queryFn: () => api<ChecklistDto>(`/api/events/${eventId}/checklist`),
    enabled: event.isSuccess,
  });
  // Consumption tokens have fewer sections (ADR 0084); a link to a missing one opens the overview.
  const kind = event.data?.kind;
  // The header and the leave dialog are outside the sections' provider: they read the words here.
  const words = forKind(eventTexts, eventTexts.tokens, kind);
  const tab = tabsOf(kind).includes(requested) ? requested : "overview";

  const confirm = useConfirm();
  const leaveAllowed = async () =>
    !hasUnsavedChanges() ||
    confirm({
      title: words.design.leaveConfirmTitle,
      description: words.design.leaveConfirmBody,
      confirmLabel: words.design.leaveConfirm,
    });

  const select = async (next: Tab) => {
    if (next === tab || !(await leaveAllowed())) {
      return;
    }
    const query = new URLSearchParams(search.toString());
    query.set("aba", tabSlug(next));
    // Payment return parameters belong to the batches section only.
    if (next !== "batches") {
      query.delete("pagamento");
      query.delete("lote");
    }
    scrollOnChange.current = true;
    router.replace(`${pathname}?${query.toString()}`, { scroll: false });
  };

  // A section picked further down a long page starts under the bars, not where the old one was.
  useEffect(() => {
    const content = contentRef.current;
    if (!scrollOnChange.current || content === null) {
      return;
    }
    scrollOnChange.current = false;
    const margin = Number.parseFloat(getComputedStyle(content).scrollMarginTop) || 0;
    if (content.getBoundingClientRect().top < margin - 1) {
      content.scrollIntoView({ block: "start" });
    }
  }, [tab]);

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
  const change = changeKind(data.change, data.startsAt);
  const openEditor = () => {
    setEditing(true);
  };

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
            content starts higher (ADR 0060). Larger screens keep the actions beside the title. */}
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
            {canDo(data, "manage") && (
              <Button variant="secondary" size="sm" icon={<Pencil />} onClick={openEditor}>
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
              {change === "canceled" ? (
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
                {/* An event of several days (ADR 0091): how many, and which. */}
                {data.days.length > 1 && (
                  <Badge tone="brand" className="ml-1">
                    <span title={dayTexts.list(data.days.map((day) => dayLabel(day.startsAt)))}>{panelTexts.days.badge(data.days.length)}</span>
                  </Badge>
                )}
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
                  {words.priceLabel(money(data.ticketPriceCents))}
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
                    className="flex w-fit max-w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-full border border-border bg-surface px-3 py-1 text-xs text-fg-muted transition hover:border-border-strong hover:text-fg active:bg-surface-2 pointer-coarse:py-1.5"
                  >
                    <UsersRound className="size-3.5 text-brand" aria-hidden />
                    <span className="font-medium text-fg">{eventTexts.team.teamOf(data.team.organization)}</span>
                    <span aria-hidden>·</span>
                    <span>{words.team.yourParts(areaList(data.team.areas, data.kind))}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <EventChangeBanner event={data} />

        {/* The sections down the side on larger screens, a bar that opens them on smaller ones. */}
        <div className="grid items-start gap-6 lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:gap-10">
          <div className="lg:sticky lg:top-[calc(5rem+env(safe-area-inset-top))] lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto">
            <EventNav
              kind={kind}
              current={tab}
              attention={attentionTabs(checklist.data)}
              live={isDoorDay(data.startsAt, data.endsAt, event.dataUpdatedAt)}
              onSelect={(next) => {
                void select(next);
              }}
            />
          </div>
          <section
            key={tab}
            ref={contentRef}
            aria-labelledby={tabHeadingId(tab)}
            // Under the panel header and the section bar (which is taller by the safe area in an
            // installed iPhone app); under the header alone with the sections down the side.
            className="flex min-w-0 scroll-mt-[calc(8.25rem+env(safe-area-inset-top))] flex-col gap-6 animate-fade-in lg:scroll-mt-24"
          >
            {tab === "overview" && <OverviewTab eventId={eventId} onSelect={select} event={data} onEditEvent={openEditor} />}
            {tab === "design" && <DesignTab eventId={eventId} />}
            {tab === "batches" && (
              <AreaGate eventId={eventId} area="manage">
                <BatchesTab eventId={eventId} onSelect={select} />
              </AreaGate>
            )}
            {tab === "sellers" && <SellersTab eventId={eventId} event={data} onEditEvent={openEditor} />}
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
                <DoorTab eventId={eventId} kind={data.kind} days={data.days} />
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
            {tab === "credentials" && <CredentialsTab eventId={eventId} />}
            {tab === "certificates" && <CertificatesTab eventId={eventId} event={data} />}
          </section>
        </div>

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
