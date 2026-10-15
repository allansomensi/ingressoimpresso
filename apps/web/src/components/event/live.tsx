"use client";

import type { DoorLiveDeviceDto, DoorLiveDto, EventDto } from "@ingressoimpresso/api-types";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  CloudOff,
  DoorOpen,
  ListChecks,
  LogIn,
  LogOut,
  Maximize2,
  Minimize2,
  RotateCcw,
  ShieldX,
  Smartphone,
  Store,
  Tags,
} from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { Badge, Button, Card, CardHeader, EmptyState, ErrorMessage, LoadingBlock, Stat, useScrollLock } from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { agoLabel, deviceHealth, LIVE_REFRESH_MS, occupancy, refusalCount } from "@/lib/door-live";
import { money } from "@/lib/format";
import { useWakeLock } from "@/lib/wake-lock";
import { clockNow, serverClockNow, subscribeClock } from "@/portaria/clock";
import { useEventTexts } from "@/components/event/access";

import { EntriesCurve, Meter } from "./live-chart";
import type { SelectTab } from "./tabs";


function count(value: number): string {
  return value.toLocaleString("pt-BR");
}

function time(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** The door's numbers, refreshed every 10 seconds while the tab is visible (ADR 0071). */
export function useDoorLive(eventId: string, enabled = true) {
  return useQuery({
    queryKey: ["door-live", eventId],
    queryFn: () => api<DoorLiveDto>(`/api/events/${eventId}/door/live`),
    enabled,
    refetchInterval: LIVE_REFRESH_MS,
    // React Query stops polling while the browser tab is hidden.
    refetchIntervalInBackground: false,
  });
}

/** "Ao vivo": entries against sold, the curve, doors, categories, phones and refusals. */
export function LiveTab({ eventId, onSelect }: { eventId: string; onSelect: SelectTab }) {
  const t = useEventTexts().live;
  const live = useDoorLive(eventId);
  const now = useSyncExternalStore(subscribeClock, clockNow, serverClockNow);
  const [fullscreen, setFullscreen] = useState(false);

  if (live.isPending) {
    return <LoadingBlock rows={4} />;
  }
  if (live.isError) {
    return <ErrorMessage error={live.error} />;
  }
  const data = live.data;
  const clock = now === 0 ? live.dataUpdatedAt : now;
  if (data.devices.length === 0 && data.entries === 0) {
    return (
      <EmptyState
        icon={DoorOpen}
        title={t.emptyTitle}
        description={t.empty}
        action={
          <Button
            variant="secondary"
            icon={<Smartphone />}
            onClick={() => {
              onSelect("door");
            }}
          >
            {t.openDoor}
          </Button>
        }
      />
    );
  }
  const stale = data.devices.filter((device) => deviceHealth(device, clock) === "stale");
  const refusals = refusalCount(data.refusals);

  const updated = (
    <p className="flex items-center gap-2 text-sm text-fg-muted" aria-live="polite">
      <span className="relative flex size-2.5">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
        <span className="relative inline-flex size-2.5 rounded-full bg-success" />
      </span>
      {t.updated(agoLabel(clock - live.dataUpdatedAt))}
    </p>
  );

  const board = (
    <div className="flex flex-col gap-6">
      {!fullscreen && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {updated}
          <Button
            variant="secondary"
            size="sm"
            icon={<Maximize2 />}
            onClick={() => {
              setFullscreen(true);
            }}
          >
            {t.fullscreen}
          </Button>
        </div>
      )}

      {stale.length > 0 && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning-fg">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p className="leading-relaxed">{t.staleAlert(stale.map((device) => device.name).join(", "))}</p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.2fr_2fr]">
        <Occupancy data={data} />
        <Card>
          <CardHeader
            title={t.curveTitle}
            description={Date.parse(data.generatedAt) > (data.lastEntryAt === null ? 0 : Date.parse(data.lastEntryAt)) + 3_600_000 && data.lastEntryAt !== null ? t.curveHintAfter : t.curveHint}
            className="mb-3"
            actions={<span className="text-sm font-medium text-fg-muted tabular">{t.curveTotal(count(data.entries))}</span>}
          />
          <EntriesCurve buckets={data.timeline} />
        </Card>
      </div>

      {/* Exit and return (ADR 0083): who is in the room now, not only who ever entered. */}
      {data.reentry !== null && (
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <Stat label={t.insideNow} value={count(data.reentry.inside)} hint={t.insideHint(count(data.entries))} icon={LogIn} tone="success" />
          <Stat
            label={t.outNow}
            value={data.reentry.allowed ? count(data.reentry.out) : "—"}
            hint={data.reentry.allowed ? t.outHint(data.reentry.exits) : t.reentryOff}
            icon={LogOut}
          />
          <Stat label={t.returned} value={count(data.reentry.returns)} hint={t.returnedHint} icon={RotateCcw} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
        <Stat
          label={t.guests}
          value={data.guests.guests === 0 ? "—" : t.guestsValue(count(data.guests.arrivedPeople), count(data.guests.people))}
          hint={data.guests.guests === 0 ? undefined : t.guestsHint(count(data.guests.arrivedGuests), count(data.guests.guests))}
          icon={ListChecks}
        />
        <Stat
          label={t.boxOffice}
          value={!data.boxOffice.enabled ? "—" : data.boxOffice.amountCents === null ? count(data.boxOffice.sold) : money(data.boxOffice.amountCents)}
          hint={data.boxOffice.enabled ? t.boxOfficeHint(data.boxOffice.sold) : undefined}
          icon={Store}
          tone="success"
        />
        <Stat
          label={t.blocked}
          value={count(data.refusals.blockedCopies)}
          hint={t.blockedHint(data.refusals.offlineDuplicates)}
          icon={ShieldX}
          tone={data.refusals.offlineDuplicates > 0 ? "warning" : "brand"}
        />
        <Stat label={t.refusals} value={count(refusals)} hint={t.refusalsHint} icon={AlertTriangle} tone={refusals > 0 ? "warning" : "brand"} />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={t.byDoor} icon={DoorOpen} />
          <BarList
            rows={data.doors.map((door) => ({
              key: door.id,
              label: door.label,
              detail: [door.categories.length === 0 ? t.allCategories : door.categories.join(", "), door.closed ? t.closedDoor : null]
                .filter((part) => part !== null)
                .join(" · "),
              value: door.entries,
              max: Math.max(1, ...data.doors.map((item) => item.entries)),
              muted: door.closed,
            }))}
          />
        </Card>
        {data.categories.length > 0 && (
          <Card>
            <CardHeader title={t.byCategory} icon={Tags} />
            <ul className="flex flex-col gap-4">
              {data.categories.map((category) => (
                <li key={category.name ?? ""} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2 font-medium text-fg">
                      <span
                        className="size-2.5 shrink-0 rounded-full ring-1 ring-black/10"
                        style={{ backgroundColor: category.color ?? "var(--surface-3)" }}
                        aria-hidden
                      />
                      <span className="truncate">{category.name ?? t.noCategory}</span>
                    </span>
                    <span className="shrink-0 text-fg-muted tabular">{t.entriesOf(count(category.entries), count(category.sold))}</span>
                  </div>
                  <Meter value={occupancy(category.entries, category.sold)} label={category.name ?? t.noCategory} className="h-2" />
                </li>
              ))}
            </ul>
          </Card>
        )}
        {/* Without categories the refusals sit beside the doors and the phones take a full row. */}
        {data.categories.length === 0 && <RefusalsCard refusals={data.refusals} />}
        <Card className={cn(data.categories.length === 0 && "lg:col-span-2")}>
          <CardHeader title={t.devices} icon={Smartphone} />
          <DeviceList devices={data.devices} now={clock} />
        </Card>
        {data.categories.length > 0 && <RefusalsCard refusals={data.refusals} />}
      </div>
    </div>
  );

  if (fullscreen) {
    return (
      <LiveFullscreen
        eventId={eventId}
        clock={clock}
        updated={updated}
        onExit={() => {
          setFullscreen(false);
        }}
      >
        {board}
      </LiveFullscreen>
    );
  }
  return board;
}

/**
 * The live board on the whole screen, for a TV or a laptop at the entrance (ADR 0071): the
 * browser's full screen where it exists (not on iPhones), a cover over the panel always, the
 * screen kept on, and Esc or the button to leave.
 */
function LiveFullscreen({
  eventId,
  clock,
  updated,
  onExit,
  children,
}: {
  eventId: string;
  clock: number;
  updated: ReactNode;
  onExit: () => void;
  children: ReactNode;
}) {
  const t = useEventTexts().live;
  const shell = useRef<HTMLDivElement | null>(null);
  // The page above already loaded the event: this reads the same cache.
  const event = useQuery({ queryKey: ["event", eventId], queryFn: () => api<EventDto>(`/api/events/${eventId}`) });
  useWakeLock(true);
  useScrollLock(true);
  // The parent re-renders on every clock tick: leaving must not restart the full screen.
  const exit = useEffectEvent(onExit);

  useEffect(() => {
    const element = shell.current;
    let native = false;
    const onChange = () => {
      if (document.fullscreenElement === null && native) {
        exit();
      }
    };
    const onKey = (keyEvent: globalThis.KeyboardEvent) => {
      if (keyEvent.key === "Escape" && !native) {
        exit();
      }
    };
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("keydown", onKey);
    if (element !== null && typeof element.requestFullscreen === "function" && document.fullscreenEnabled) {
      element.requestFullscreen().then(
        () => {
          native = true;
        },
        () => {
          // Refused (no gesture, iframe): the cover alone does the job.
        },
      );
    }
    element?.focus();
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("keydown", onKey);
      if (document.fullscreenElement !== null) {
        void document.exitFullscreen().catch(() => undefined);
      }
    };
  }, []);

  const time = clock === 0 ? "" : new Date(clock).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return createPortal(
    <div
      ref={shell}
      role="dialog"
      aria-modal="true"
      aria-label={t.fullscreenLabel}
      tabIndex={-1}
      className="fixed inset-0 z-[70] overflow-y-auto overscroll-contain bg-bg px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))] outline-none sm:px-8"
    >
      <div className="mx-auto flex max-w-[1600px] flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-border pb-4">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="truncate text-2xl font-semibold tracking-tight text-fg sm:text-3xl">{event.data?.name ?? t.fullscreenLabel}</h2>
            {updated}
          </div>
          <div className="flex items-center gap-4">
            {time !== "" && <span className="text-3xl font-semibold text-fg tabular sm:text-4xl">{time}</span>}
            <Button variant="secondary" icon={<Minimize2 />} onClick={onExit}>
              {t.exitFullscreen}
            </Button>
          </div>
        </header>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function RefusalsCard({ refusals }: { refusals: DoorLiveDto["refusals"] }) {
  const t = useEventTexts().live;
  const rows = [
    ["blockedCopies", refusals.blockedCopies],
    ["offlineDuplicates", refusals.offlineDuplicates],
    ["invalid", refusals.invalid],
    ["voided", refusals.voided],
    ["voidEntries", refusals.voidEntries],
    ["wrongDoor", refusals.wrongDoor],
    ["wrongDoorAdmitted", refusals.wrongDoorAdmitted],
    ["otherEvent", refusals.otherEvent],
  ] as const;
  return (
    <Card>
      <CardHeader title={t.refusalsTitle} icon={ShieldX} />
      <dl className="flex flex-col divide-y divide-border text-sm">
        {rows.map(([key, value]) => (
          <div key={key} className="flex items-center justify-between gap-3 py-2.5">
            <dt className="text-fg-muted">{t.refusalRows[key]}</dt>
            <dd className={cn("font-semibold tabular", value > 0 ? "text-fg" : "text-fg-subtle")}>{count(value)}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

/** The hero: entries, the occupancy meter and the first and last entry. */
export function Occupancy({ data, compact = false }: { data: DoorLiveDto; compact?: boolean }) {
  const t = useEventTexts().live;
  const share = occupancy(data.entries, data.sold);
  // On the overview it sits inside another card.
  const Frame = compact ? "div" : Card;
  const percent = data.sold === 0 ? "0%" : `${String(Math.round((data.entries / data.sold) * 100))}%`;
  return (
    <Frame className="flex flex-col justify-between gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-fg-muted">{t.entries}</span>
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className={cn("leading-none font-semibold tracking-tight text-fg", compact ? "text-4xl" : "text-5xl")}>{count(data.entries)}</span>
            <span className="text-base text-fg-muted">{t.ofSold(count(data.sold))}</span>
          </span>
        </div>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-success-soft text-success-fg">
          <LogIn className="size-5" aria-hidden />
        </span>
      </div>
      {!compact && (
        <dl className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-0.5 rounded-xl bg-surface-2 px-3 py-2.5">
            <dt className="text-xs font-medium text-fg-muted">{t.missing}</dt>
            <dd className="text-lg font-semibold text-fg tabular">{count(Math.max(0, data.sold - data.entries))}</dd>
          </div>
          <div className="flex flex-col gap-0.5 rounded-xl bg-surface-2 px-3 py-2.5">
            <dt className="text-xs font-medium text-fg-muted">{t.lastHour}</dt>
            <dd className="text-lg font-semibold text-fg tabular">{count(data.timeline.reduce((sum, bucket) => sum + bucket.entries, 0))}</dd>
          </div>
        </dl>
      )}
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="font-medium text-fg">{t.occupancy}</span>
          <span className="font-semibold text-fg tabular">{percent}</span>
        </div>
        <Meter value={share} label={t.occupancyLabel(percent)} />
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-fg-subtle">
          <span>{t.issuedHint(count(data.issued))}</span>
          {data.firstEntryAt === null ? (
            <span>{t.noEntries}</span>
          ) : (
            <>
              <span>{t.firstEntry(time(data.firstEntryAt))}</span>
              {data.lastEntryAt !== null && <span>{t.lastEntry(time(data.lastEntryAt))}</span>}
            </>
          )}
        </p>
      </div>
    </Frame>
  );
}

/** Horizontal bars, one hue: a label and its value at the tip. */
function BarList({
  rows,
}: {
  rows: { key: string; label: string; detail: string; value: number; max: number; muted?: boolean }[];
}) {
  return (
    <ul className="flex flex-col gap-4">
      {rows.map((row) => (
        <li key={row.key} className={cn("flex flex-col gap-1.5", row.muted === true && "opacity-60")}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-medium text-fg">{row.label}</span>
              <span className="truncate text-xs text-fg-subtle">{row.detail}</span>
            </span>
            <span className="shrink-0 font-semibold text-fg tabular">{count(row.value)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-r-[4px] bg-brand transition-[width] duration-700"
              style={{ width: `${String(row.value === 0 ? 0 : Math.max(2, (row.value / row.max) * 100))}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function DeviceList({ devices, now }: { devices: readonly DoorLiveDeviceDto[]; now: number }) {
  const t = useEventTexts().live;
  if (devices.length === 0) {
    return <p className="text-sm text-fg-subtle">{t.noDevices}</p>;
  }
  return (
    <ul className="flex flex-col divide-y divide-border">
      {devices.map((device) => {
        const health = deviceHealth(device, now);
        const last = device.lastSyncAt ?? device.lastSeenAt;
        const ago = last === null ? null : agoLabel(now - Date.parse(last));
        return (
          <li key={device.id} className={cn("flex items-start gap-3 py-3 first:pt-0 last:pb-0", health === "revoked" && "opacity-55")}>
            <span
              className={cn(
                "relative mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl",
                health === "stale" ? "bg-warning-soft text-warning-fg" : "bg-surface-2 text-fg-muted",
              )}
            >
              {health === "stale" ? <CloudOff className="size-4" aria-hidden /> : <Smartphone className="size-4" aria-hidden />}
              {health === "ok" && <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-success ring-2 ring-surface" />}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-medium text-fg">{device.name}</span>
                <span className="shrink-0 text-xs font-semibold text-fg tabular">{t.deviceEntries(device.entries)}</span>
              </span>
              <span className="truncate text-xs text-fg-muted">
                {device.door} ·{" "}
                {health === "revoked"
                  ? t.revoked
                  : ago === null
                    ? t.neverSeen
                    : health === "stale"
                      ? t.stale(ago)
                      : t.seen(ago)}
              </span>
              <span className="flex flex-wrap gap-1">
                {device.rehearsedAt !== null && (
                  <Badge tone="success">
                    <CheckCircle2 className="size-3" aria-hidden />
                    {t.rehearsed}
                  </Badge>
                )}
                {(device.pendingScans ?? 0) > 0 && health !== "revoked" && <Badge tone="warning">{t.pending(device.pendingScans ?? 0)}</Badge>}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
