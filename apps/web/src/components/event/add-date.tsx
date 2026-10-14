"use client";

import type { EventDto, NewDateBody } from "@ingressoimpresso/api-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, Check, Layers } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button, Dialog, ErrorMessage, Field, Input, LoadingBlock } from "@/components/ui";
import { api } from "@/lib/api";
import { offsetMinutes, wallClockInput, withOffset } from "@/lib/event-time";
import { addDays, nextDateStart } from "@/lib/series";
import { common as commonTexts } from "@/texts/pt-BR/common";
import { panel as panelTexts } from "@/texts/pt-BR/panel";
import { series as seriesTexts } from "@/texts/pt-BR/series";

const t = seriesTexts;

/** Minutes between two `datetime-local` values (plain calendar arithmetic). */
function minutesBetween(start: string, end: string): number {
  const a = Date.parse(`${start}:00Z`);
  const b = Date.parse(`${end}:00Z`);
  return Number.isNaN(a) || Number.isNaN(b) ? 300 : Math.round((b - a) / 60_000);
}

function addMinutes(local: string, minutes: number): string | null {
  return addDays(local, minutes / 1440);
}

/**
 * Another date of the event (ADR 0077): a new session with the setup of this one. Only the
 * organization's people add dates (like duplicating, ADR 0027).
 */
export function AddDateDialog({ event, open, onClose }: { event: EventDto; open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title={t.addDate} description={t.addDateDescription}>
      {open && <AddDateLoader event={event} onClose={onClose} />}
    </Dialog>
  );
}

/** The other dates of the series come from the event list, so the default lands on a free day. */
function AddDateLoader({ event, onClose }: { event: EventDto; onClose: () => void }) {
  const events = useQuery({ queryKey: ["events"], queryFn: () => api<EventDto[]>("/api/events") });
  if (events.isPending) {
    return <LoadingBlock rows={2} />;
  }
  const siblings = (events.data ?? []).filter((item) => event.series !== null && item.series?.id === event.series.id).map((item) => item.startsAt);
  return <AddDateForm event={event} siblings={siblings} onClose={onClose} />;
}

function AddDateForm({ event, siblings, onClose }: { event: EventDto; siblings: string[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const length = minutesBetween(wallClockInput(event.startsAt), wallClockInput(event.endsAt));
  const [startsAt, setStartsAt] = useState(() => nextDateStart(siblings, event.startsAt));
  const [endsAt, setEndsAt] = useState(() => addMinutes(nextDateStart(siblings, event.startsAt), length) ?? "");
  const [endTouched, setEndTouched] = useState(false);
  const offset = offsetMinutes(event.startsAt);

  const save = useMutation({
    mutationFn: () => {
      const body: NewDateBody = { startsAt: withOffset(startsAt, offset), endsAt: withOffset(endsAt, offset) };
      return api<EventDto>(`/api/events/${event.id}/dates`, { method: "POST", body });
    },
    onSuccess: (created) => {
      toast.success(t.added);
      queryClient.setQueryData(["event", created.id], created);
      void queryClient.invalidateQueries({ queryKey: ["events"] });
      void queryClient.invalidateQueries({ queryKey: ["event", event.id] });
      void queryClient.invalidateQueries({ queryKey: ["series"] });
      onClose();
      router.push(`/painel/eventos/${created.id}`);
    },
  });
  const submit = (formEvent: FormEvent) => {
    formEvent.preventDefault();
    save.mutate();
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.newStart}>
          <Input
            type="datetime-local"
            value={startsAt}
            required
            onChange={(e) => {
              setStartsAt(e.target.value);
              const end = addMinutes(e.target.value, length);
              if (!endTouched && end !== null) {
                setEndsAt(end);
              }
            }}
          />
        </Field>
        <Field label={t.newEnd}>
          <Input
            type="datetime-local"
            value={endsAt}
            min={startsAt}
            required
            onChange={(e) => {
              setEndsAt(e.target.value);
              setEndTouched(true);
            }}
          />
        </Field>
      </div>
      <p className="-mt-2 text-xs text-fg-muted">{panelTexts.eventTimeZoneHint(offset)}</p>
      <div className="grid gap-3 rounded-xl border border-border bg-surface-2 p-4 text-sm sm:grid-cols-2 sm:gap-5">
        <div className="flex flex-col gap-2">
          <p className="flex items-center gap-2 font-medium text-fg">
            <Layers className="size-4 text-brand" aria-hidden />
            {t.comesAlong}
          </p>
          <ul className="flex flex-col gap-1.5 text-fg-muted">
            {t.comesAlongItems.map((item) => (
              <li key={item} className="flex gap-2">
                <Check className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-2 border-border max-sm:border-t max-sm:pt-3">
          <p className="flex items-center gap-2 font-medium text-fg">
            <CalendarPlus className="size-4 text-brand" aria-hidden />
            {t.ownTitle}
          </p>
          <ul className="flex flex-col gap-1.5 text-fg-muted">
            {t.ownItems.map((item) => (
              <li key={item} className="flex gap-2">
                <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-fg-subtle" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs leading-relaxed text-fg-muted sm:col-span-2">{t.ownNote}</p>
      </div>
      <ErrorMessage error={save.error} />
      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose}>
          {commonTexts.cancel}
        </Button>
        <Button type="submit" icon={<CalendarPlus />} loading={save.isPending}>
          {t.add}
        </Button>
      </div>
    </form>
  );
}
