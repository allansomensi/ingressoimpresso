"use client";

import type { BatchDto, ChecklistDto, DoorOverviewDto, EventDto, SellerDto } from "@ingressoimpresso/api-types";
import { useQuery } from "@tanstack/react-query";
import { Activity, LogIn, Smartphone, Ticket, Users } from "lucide-react";
import { useState } from "react";

import { Button, Card, CardHeader, ErrorMessage, Skeleton, Stat } from "@/components/ui";
import { isDoorDay } from "@/lib/door-live";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { event as eventTexts } from "@/texts/pt-BR/event";

import { ChecklistCard } from "./checklist";
import { EventResults } from "./event-results";
import { Occupancy, useDoorLive } from "./live";
import type { SelectTab } from "./tabs";

const t = eventTexts.overview;

export function OverviewTab({
  eventId,
  onSelect,
  onEditEvent,
  event,
}: {
  eventId: string;
  onSelect: SelectTab;
  onEditEvent: () => void;
  event?: Pick<EventDto, "startsAt" | "endsAt">;
}) {
  // Judged once, when the tab opens (rendering stays pure).
  const [doorDay] = useState(() => event !== undefined && isDoorDay(event.startsAt, event.endsAt, Date.now()));
  // What is missing is worked out by the API (ADR 0078).
  const checklist = useQuery({ queryKey: ["checklist", eventId], queryFn: () => api<ChecklistDto>(`/api/events/${eventId}/checklist`) });
  const batches = useQuery({ queryKey: ["batches", eventId], queryFn: () => api<BatchDto[]>(`/api/events/${eventId}/batches`) });
  const sellers = useQuery({ queryKey: ["sellers", eventId], queryFn: () => api<SellerDto[]>(`/api/events/${eventId}/sellers`) });
  const door = useQuery({ queryKey: ["door", eventId], queryFn: () => api<DoorOverviewDto>(`/api/events/${eventId}/door`) });

  const paidTickets = (batches.data ?? [])
    .filter((batch) => batch.status === "paid")
    .reduce((sum, batch) => sum + batch.last - batch.first + 1, 0);
  const activeDevices = (door.data?.devices ?? []).filter((device) => device.revokedAt === null).length;
  const queries = [checklist, batches, sellers, door];
  const loading = queries.some((query) => query.isPending);
  const failure = queries.find((query) => query.isError)?.error;
  const count = (value: number) => (loading ? <Skeleton className="h-8 w-14" /> : value.toLocaleString("pt-BR"));
  const list = checklist.data;
  // The list matters until the event is ready; then (or once it is over) the results do.
  const working = list !== undefined && list.applies && list.missing > 0;
  const settled = list !== undefined && !working;

  const stats = (
    <div className={cn("grid grid-cols-2 content-start gap-3 sm:gap-4", working ? "max-lg:order-1 lg:grid-cols-1" : "lg:grid-cols-4")}>
      <Stat label={t.stats.paid} value={count(paidTickets)} icon={Ticket} />
      <Stat label={t.stats.sellers} value={count(sellers.data?.length ?? 0)} icon={Users} />
      <Stat label={t.stats.entries} value={count(door.data?.entryCount ?? 0)} icon={LogIn} tone="success" />
      <Stat label={t.stats.devices} value={count(activeDevices)} icon={Smartphone} />
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      {failure !== undefined && <ErrorMessage error={failure} />}
      {doorDay && <LiveCard eventId={eventId} onSelect={onSelect} />}
      {paidTickets > 0 && settled && <EventResults eventId={eventId} />}
      {list === undefined ? (
        <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <Card className="max-lg:order-2">
            <Skeleton className="mb-3 h-5 w-32" />
            <Skeleton className="mb-6 h-4 w-64 max-w-full" />
            <div className="flex flex-col gap-3">
              {[0, 1, 2, 3].map((item) => (
                <Skeleton key={item} className="h-14 w-full" />
              ))}
            </div>
          </Card>
          {stats}
        </div>
      ) : working ? (
        <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <ChecklistCard list={list} onSelect={onSelect} onEditEvent={onEditEvent} />
          {stats}
        </div>
      ) : (
        <>
          {list.applies && <ChecklistCard list={list} onSelect={onSelect} onEditEvent={onEditEvent} />}
          {stats}
        </>
      )}
      {paidTickets > 0 && working && <EventResults eventId={eventId} />}
    </div>
  );
}

/** On the event's day, the door at a glance (ADR 0071). */
function LiveCard({ eventId, onSelect }: { eventId: string; onSelect: SelectTab }) {
  const live = useDoorLive(eventId);
  if (live.data === undefined || (live.data.devices.length === 0 && live.data.entries === 0)) {
    return null;
  }
  return (
    <Card className="border-brand/30">
      <CardHeader
        title={eventTexts.live.overviewTitle}
        icon={Activity}
        className="mb-4"
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              onSelect("live");
            }}
          >
            {eventTexts.live.overviewOpen}
          </Button>
        }
      />
      <Occupancy data={live.data} compact />
    </Card>
  );
}
