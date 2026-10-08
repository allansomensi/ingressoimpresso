"use client";

import type { EventBody, EventDto } from "@ingressoimpresso/api-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState, type FormEvent } from "react";

import { Button, Card, ErrorMessage, Field, Input } from "@/components/ui";
import { api } from "@/lib/api";
import { texts } from "@/texts/pt-BR";

const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" });

export default function EventsPage() {
  const queryClient = useQueryClient();
  const events = useQuery({ queryKey: ["events"], queryFn: () => api<EventDto[]>("/api/events") });
  const [name, setName] = useState("");
  const [venue, setVenue] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [price, setPrice] = useState("");

  const create = useMutation({
    mutationFn: () => {
      const cents = price.trim() === "" ? null : Math.round(Number(price.replace(",", ".")) * 100);
      const body: EventBody = {
        name,
        venue: venue.trim() === "" ? null : venue,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        ticketPriceCents: cents !== null && Number.isFinite(cents) ? cents : null,
      };
      return api<EventDto>("/api/events", { method: "POST", body });
    },
    onSuccess: () => {
      setName("");
      setVenue("");
      setStartsAt("");
      setEndsAt("");
      setPrice("");
      void queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate();
  };

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{texts.panel.title}</h1>
      {events.isPending ? (
        <p className="text-sm opacity-70">{texts.common.loading}</p>
      ) : events.isError ? (
        <ErrorMessage error={events.error} />
      ) : events.data.length === 0 ? (
        <p className="text-sm opacity-70">{texts.panel.empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {events.data.map((event) => (
            <li key={event.id}>
              <Link
                href={`/painel/eventos/${event.id}`}
                className="flex flex-col rounded-lg border border-black/10 p-4 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
              >
                <span className="font-semibold">{event.name}</span>
                <span className="text-sm opacity-70">
                  {dateFormat.format(new Date(event.startsAt))}
                  {event.venue !== null && ` · ${event.venue}`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Card>
        <h2 className="mb-3 font-semibold">{texts.panel.newEvent}</h2>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Field label={texts.panel.eventName}>
            <Input value={name} onChange={(e) => { setName(e.target.value); }} required maxLength={100} />
          </Field>
          <Field label={texts.panel.venue}>
            <Input value={venue} onChange={(e) => { setVenue(e.target.value); }} maxLength={120} />
          </Field>
          <Field label={texts.panel.startsAt}>
            <Input type="datetime-local" value={startsAt} onChange={(e) => { setStartsAt(e.target.value); }} required />
          </Field>
          <Field label={texts.panel.endsAt}>
            <Input type="datetime-local" value={endsAt} onChange={(e) => { setEndsAt(e.target.value); }} required />
          </Field>
          <Field label={texts.panel.price}>
            <Input inputMode="decimal" value={price} onChange={(e) => { setPrice(e.target.value); }} placeholder="30,00" />
          </Field>
          <div className="flex items-end">
            <Button type="submit" disabled={create.isPending}>
              {texts.panel.create}
            </Button>
          </div>
          <div className="sm:col-span-2">
            <ErrorMessage error={create.error} />
          </div>
        </form>
      </Card>
    </main>
  );
}
