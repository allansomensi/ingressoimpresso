"use client";

import type { EventBody, EventDto } from "@ingressoimpresso/api-types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button, Dialog, ErrorMessage, Field, Input } from "@/components/ui";
import { api } from "@/lib/api";
import { browserOffset, offsetMinutes, wallClockInput, withOffset } from "@/lib/event-time";
import { parseMoney } from "@/lib/format";
import { texts } from "@/texts/pt-BR";

const t = texts.panel;

/** A `datetime-local` value `hours` later (plain calendar arithmetic, no time zone). */
function addHours(local: string, hours: number): string | null {
  const time = Date.parse(`${local}:00Z`);
  return Number.isNaN(time) ? null : new Date(time + hours * 3_600_000).toISOString().slice(0, 16);
}

function priceText(cents: number | null): string {
  return cents === null ? "" : (cents / 100).toFixed(2).replace(".", ",");
}

/** Create (no `event`) or edit an event, in a dialog. */
export function EventFormDialog({
  open,
  onClose,
  event,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  event?: EventDto;
  onSaved?: (event: EventDto) => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={event === undefined ? t.newEvent : t.editEvent}
      description={t.newEventDescription}
    >
      {/* Remount on open so the fields start from the current values. */}
      {open && <EventForm event={event} onClose={onClose} onSaved={onSaved} />}
    </Dialog>
  );
}

function EventForm({
  event,
  onClose,
  onSaved,
}: {
  event: EventDto | undefined;
  onClose: () => void;
  onSaved: ((event: EventDto) => void) | undefined;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(event?.name ?? "");
  const [venue, setVenue] = useState(event?.venue ?? "");
  // Times are typed in the event's own wall-clock time (ADR 0025).
  const [startsAt, setStartsAt] = useState(event === undefined ? "" : wallClockInput(event.startsAt));
  const [endsAt, setEndsAt] = useState(event === undefined ? "" : wallClockInput(event.endsAt));
  const [price, setPrice] = useState(priceText(event?.ticketPriceCents ?? null));
  // The end follows the start (+5 h) until it is edited by hand.
  const [endTouched, setEndTouched] = useState(event !== undefined);
  const parsedPrice = parseMoney(price);
  const timeZone =
    event === undefined ? t.timeZoneHint(Intl.DateTimeFormat().resolvedOptions().timeZone) : t.eventTimeZoneHint(offsetMinutes(event.startsAt));

  const save = useMutation({
    mutationFn: () => {
      // An edited event keeps its offset; a new one takes the browser's.
      const offset = event === undefined ? browserOffset(startsAt) : offsetMinutes(event.startsAt);
      const body: EventBody = {
        name: name.trim(),
        venue: venue.trim() === "" ? null : venue.trim(),
        startsAt: withOffset(startsAt, offset),
        endsAt: withOffset(endsAt, offset),
        ticketPriceCents: parsedPrice.ok ? parsedPrice.cents : null,
      };
      return event === undefined
        ? api<EventDto>("/api/events", { method: "POST", body })
        : api<EventDto>(`/api/events/${event.id}`, { method: "PUT", body });
    },
    onSuccess: (saved) => {
      toast.success(event === undefined ? t.created : t.updated);
      queryClient.setQueryData(["event", saved.id], saved);
      void queryClient.invalidateQueries({ queryKey: ["events"] });
      void queryClient.invalidateQueries({ queryKey: ["report", saved.id] });
      onSaved?.(saved);
      onClose();
    },
  });

  const submit = (formEvent: FormEvent) => {
    formEvent.preventDefault();
    save.mutate();
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label={t.eventName}>
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          placeholder={t.eventNamePlaceholder}
          required
          maxLength={100}
          autoFocus
        />
      </Field>
      <Field label={t.venue} optional>
        <Input
          value={venue}
          onChange={(e) => {
            setVenue(e.target.value);
          }}
          placeholder={t.venuePlaceholder}
          maxLength={120}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.startsAt}>
          <Input
            type="datetime-local"
            value={startsAt}
            onChange={(e) => {
              setStartsAt(e.target.value);
              const end = addHours(e.target.value, 5);
              if (!endTouched && end !== null) {
                // Suggest a five-hour event.
                setEndsAt(end);
              }
            }}
            required
          />
        </Field>
        <Field label={t.endsAt}>
          <Input
            type="datetime-local"
            value={endsAt}
            min={startsAt}
            onChange={(e) => {
              setEndsAt(e.target.value);
              setEndTouched(true);
            }}
            required
          />
        </Field>
      </div>
      <p className="-mt-2 text-xs text-fg-muted">{timeZone}</p>
      <Field label={t.price} optional hint={parsedPrice.ok ? t.priceHint : <span className="text-danger-fg">{t.priceInvalid}</span>}>
        <span className="relative flex">
          <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-sm text-fg-muted">{texts.common.currency}</span>
          <Input
            inputMode="decimal"
            value={price}
            onChange={(e) => {
              setPrice(e.target.value);
            }}
            placeholder={t.pricePlaceholder}
            aria-invalid={!parsedPrice.ok || undefined}
            className="pl-10"
          />
        </span>
      </Field>
      <ErrorMessage error={save.error} />
      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose}>
          {texts.common.cancel}
        </Button>
        <Button type="submit" loading={save.isPending} disabled={!parsedPrice.ok}>
          {event === undefined ? t.create : texts.common.save}
        </Button>
      </div>
    </form>
  );
}
