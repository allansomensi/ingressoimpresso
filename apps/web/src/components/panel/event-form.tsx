"use client";

import type { EventBody, EventDto, EventKind, OrganizationProfileDto } from "@ingressoimpresso/api-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Coins, Sparkles, Ticket } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { EventDaysEditor } from "@/components/panel/event-days";
import { Button, Dialog, ErrorMessage, Field, Input, LoadingBlock, Switch } from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { daysProblem, nextDayInput, type DayInput } from "@/lib/event-days";
import { browserOffset, offsetMinutes, wallClockInput, withOffset } from "@/lib/event-time";
import { parseMoney } from "@/lib/format";
import { common as commonTexts } from "@/texts/pt-BR/common";
import { panel as panelTexts } from "@/texts/pt-BR/panel";

const t = panelTexts;

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
      {open && (event === undefined ? <NewEventForm onClose={onClose} onSaved={onSaved} /> : <EventForm event={event} onClose={onClose} onSaved={onSaved} />)}
    </Dialog>
  );
}

/** A mouse (not a finger): the only case where focusing the first field helps. */
function finePointer(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches;
}

/** A new event starts with the venue, address and price of the organization's profile (ADR 0064). */
function NewEventForm({ onClose, onSaved }: { onClose: () => void; onSaved: ((event: EventDto) => void) | undefined }) {
  const profile = useQuery({
    queryKey: ["organization-profile"],
    queryFn: () => api<OrganizationProfileDto>("/api/account/profile"),
    staleTime: 60_000,
    retry: false,
  });
  if (profile.isPending) {
    return <LoadingBlock rows={3} />;
  }
  // Without a profile (an error, or someone only on other teams) the form starts empty.
  return <EventForm event={undefined} defaults={profile.data ?? null} onClose={onClose} onSaved={onSaved} />;
}

function EventForm({
  event,
  defaults = null,
  onClose,
  onSaved,
}: {
  event: EventDto | undefined;
  defaults?: OrganizationProfileDto | null;
  onClose: () => void;
  onSaved: ((event: EventDto) => void) | undefined;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(event?.name ?? "");
  const [venue, setVenue] = useState(event?.venue ?? defaults?.defaultVenue ?? "");
  const [address, setAddress] = useState(event?.address ?? defaults?.defaultAddress ?? "");
  const fromProfile =
    event === undefined &&
    defaults !== null &&
    (defaults.defaultVenue !== null || defaults.defaultAddress !== null || defaults.defaultTicketPriceCents !== null);
  // Times are typed in the event's own wall-clock time (ADR 0025).
  const [startsAt, setStartsAt] = useState(event === undefined ? "" : wallClockInput(event.startsAt));
  const [endsAt, setEndsAt] = useState(event === undefined ? "" : wallClockInput(event.endsAt));
  const [price, setPrice] = useState(priceText(event === undefined ? (defaults?.defaultTicketPriceCents ?? null) : event.ticketPriceCents));
  const [kind, setKind] = useState<EventKind>(event?.kind ?? "tickets");
  // The end follows the start (+5 h) until it is edited by hand.
  const [endTouched, setEndTouched] = useState(event !== undefined);
  // An event of several days (ADR 0091): its days replace the start and the end.
  const hadDays = (event?.days.length ?? 0) > 1;
  const [multiDay, setMultiDay] = useState(hadDays);
  const [days, setDays] = useState<DayInput[]>(
    event?.days.map((day) => ({ startsAt: wallClockInput(day.startsAt), endsAt: wallClockInput(day.endsAt) })) ?? [],
  );
  const [triedSave, setTriedSave] = useState(false);
  const severalDays = multiDay && kind === "tickets";
  const problem = severalDays ? daysProblem(days) : null;
  const parsedPrice = parseMoney(price);
  const timeZone =
    event === undefined ? t.timeZoneHint(Intl.DateTimeFormat().resolvedOptions().timeZone) : t.eventTimeZoneHint(offsetMinutes(event.startsAt));

  const save = useMutation({
    mutationFn: () => {
      // An edited event keeps its offset; a new one takes the browser's.
      const first = severalDays ? days[0] : undefined;
      const last = severalDays ? days.at(-1) : undefined;
      const start = first?.startsAt ?? startsAt;
      const offset = event === undefined ? browserOffset(start) : offsetMinutes(event.startsAt);
      const body: EventBody = {
        name: name.trim(),
        venue: venue.trim() === "" ? null : venue.trim(),
        address: address.trim() === "" ? null : address.trim(),
        startsAt: withOffset(start, offset),
        endsAt: withOffset(last?.endsAt ?? endsAt, offset),
        ticketPriceCents: parsedPrice.ok ? parsedPrice.cents : null,
        kind,
        // Days set, or taken away (the event is of one day again); otherwise left as they are.
        ...(severalDays
          ? { days: days.map((day) => ({ startsAt: withOffset(day.startsAt, offset), endsAt: withOffset(day.endsAt, offset) })) }
          : hadDays
            ? { days: [] }
            : {}),
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
    setTriedSave(true);
    if (problem !== null) {
      return;
    }
    save.mutate();
  };

  const toggleDays = (on: boolean) => {
    setMultiDay(on);
    if (on && days.length < 2) {
      // The first day is the event as typed so far; the second, the day after at the same times.
      const day = { startsAt, endsAt };
      setDays([day, nextDayInput(day)]);
    } else if (!on && days[0] !== undefined) {
      // Back to one day: the first one.
      setStartsAt(days[0].startsAt);
      setEndsAt(days[0].endsAt);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <KindPicker
        value={kind}
        onChange={(next) => {
          setKind(next);
          // The organization's default is a ticket price: a new token event starts without it
          // (each product has its own), and gets it back if it turns into tickets again.
          const fallback = defaults?.defaultTicketPriceCents ?? null;
          if (event === undefined && fallback !== null && (price === priceText(fallback) || price === "")) {
            setPrice(next === "tokens" ? "" : priceText(fallback));
          }
        }}
      />
      <Field label={t.eventName}>
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          placeholder={t.eventNamePlaceholder}
          required
          maxLength={100}
          autoComplete="off"
          enterKeyHint="next"
          // On a phone the keyboard would cover the first question (what it prints).
          autoFocus={finePointer()}
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
          autoComplete="off"
          enterKeyHint="next"
        />
      </Field>
      <Field label={t.address} optional hint={kind === "tokens" ? t.tokenAddressHint : t.addressHint}>
        <Input
          value={address}
          onChange={(e) => {
            setAddress(e.target.value);
          }}
          placeholder={t.addressPlaceholder}
          maxLength={200}
          autoComplete="street-address"
          enterKeyHint="next"
        />
      </Field>
      {kind === "tickets" && <Switch checked={multiDay} onChange={toggleDays} label={t.days.toggle} description={t.days.toggleHint} />}
      {severalDays ? (
        <EventDaysEditor days={days} onChange={setDays} problem={triedSave ? problem : null} />
      ) : (
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
      )}
      <p className="-mt-2 text-xs text-fg-muted">{timeZone}</p>
      <Field
        label={kind === "tokens" ? t.tokenPrice : t.price}
        optional
        hint={parsedPrice.ok ? (kind === "tokens" ? t.tokenPriceHint : t.priceHint) : <span className="text-danger-fg">{t.priceInvalid}</span>}
      >
        <span className="relative flex">
          <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-sm text-fg-muted">{commonTexts.currency}</span>
          <Input
            inputMode="decimal"
            value={price}
            onChange={(e) => {
              setPrice(e.target.value);
            }}
            placeholder={t.pricePlaceholder}
            enterKeyHint="done"
            aria-invalid={!parsedPrice.ok || undefined}
            className="pl-10"
          />
        </span>
      </Field>
      {fromProfile && (
        <p className="flex items-center gap-2 text-xs text-fg-muted">
          <Sparkles aria-hidden className="size-3.5 shrink-0 text-brand" />
          {t.fromProfile}
        </p>
      )}
      <ErrorMessage error={save.error} />
      {/* Stuck to the bottom of the dialog: on a phone the long form keeps "Criar" in reach. */}
      <div className="sticky -bottom-4 z-10 -mx-5 flex flex-col-reverse gap-2 border-t border-border bg-surface px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:static sm:mx-0 sm:flex-row sm:justify-end sm:border-0 sm:px-0 sm:pt-2 sm:pb-0">
        <Button variant="secondary" onClick={onClose}>
          {commonTexts.cancel}
        </Button>
        <Button type="submit" loading={save.isPending} disabled={!parsedPrice.ok}>
          {event === undefined ? t.create : commonTexts.save}
        </Button>
      </div>
    </form>
  );
}

/** Tickets or consumption tokens (ADR 0084): two cards, the first thing the form asks. */
function KindPicker({ value, onChange }: { value: EventKind; onChange: (kind: EventKind) => void }) {
  const options = [
    { kind: "tickets", Icon: Ticket },
    { kind: "tokens", Icon: Coins },
  ] as const satisfies readonly { kind: EventKind; Icon: typeof Ticket }[];
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-sm font-medium text-fg">{t.kind}</legend>
      <div className="grid grid-cols-2 gap-2">
        {options.map(({ kind, Icon }) => {
          const selected = value === kind;
          return (
            <label
              key={kind}
              className={cn(
                "relative flex cursor-pointer flex-col gap-1.5 rounded-xl border p-3 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand",
                selected ? "border-brand bg-brand-soft/60" : "border-border hover:border-border-strong active:bg-surface-2",
              )}
            >
              <input
                type="radio"
                name="event-kind"
                className="sr-only"
                checked={selected}
                onChange={() => {
                  onChange(kind);
                }}
              />
              <span className="flex items-center gap-2 text-sm font-semibold text-fg">
                <span className={cn("flex size-8 items-center justify-center rounded-lg", selected ? "bg-brand-solid text-white" : "bg-surface-2 text-fg-muted")}>
                  <Icon className="size-4" aria-hidden />
                </span>
                {t.kinds[kind].title}
              </span>
              <span className="text-xs leading-relaxed text-fg-muted">{t.kinds[kind].body}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
