"use client";

import type { EventBody, EventDto } from "@ingressoimpresso/api-types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button, Dialog, ErrorMessage, Field, Input } from "@/components/ui";
import { api } from "@/lib/api";
import { parseMoney } from "@/lib/format";
import { texts } from "@/texts/pt-BR";

const t = texts.panel;

/** `datetime-local` value (local time, minutes) of an ISO instant. */
function toLocalInput(iso: string): string {
  const date = new Date(iso);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
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
  const [startsAt, setStartsAt] = useState(event === undefined ? "" : toLocalInput(event.startsAt));
  const [endsAt, setEndsAt] = useState(event === undefined ? "" : toLocalInput(event.endsAt));
  const [price, setPrice] = useState(priceText(event?.ticketPriceCents ?? null));

  const save = useMutation({
    mutationFn: () => {
      const body: EventBody = {
        name: name.trim(),
        venue: venue.trim() === "" ? null : venue.trim(),
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        ticketPriceCents: parseMoney(price),
      };
      return event === undefined
        ? api<EventDto>("/api/events", { method: "POST", body })
        : api<EventDto>(`/api/events/${event.id}`, { method: "PUT", body });
    },
    onSuccess: (saved) => {
      toast.success(event === undefined ? t.created : t.updated);
      queryClient.setQueryData(["event", saved.id], saved);
      void queryClient.invalidateQueries({ queryKey: ["events"] });
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
              if (endsAt === "" && e.target.value !== "") {
                // Suggest a five-hour event.
                const end = new Date(new Date(e.target.value).getTime() + 5 * 3_600_000);
                setEndsAt(toLocalInput(end.toISOString()));
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
            }}
            required
          />
        </Field>
      </div>
      <Field label={t.price} optional hint={t.priceHint}>
        <span className="relative flex">
          <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-sm text-fg-subtle">R$</span>
          <Input
            inputMode="decimal"
            value={price}
            onChange={(e) => {
              setPrice(e.target.value);
            }}
            placeholder="30,00"
            className="pl-10"
          />
        </span>
      </Field>
      <ErrorMessage error={save.error} />
      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose}>
          {texts.common.cancel}
        </Button>
        <Button type="submit" loading={save.isPending}>
          {event === undefined ? t.create : texts.common.save}
        </Button>
      </div>
    </form>
  );
}
