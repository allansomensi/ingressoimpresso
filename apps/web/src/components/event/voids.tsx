"use client";

import type { CreateVoidBody, VoidDto, VoidReason } from "@ingressoimpresso/api-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { Button, Card, ErrorMessage, Field, Input, NumberInput, Select } from "@/components/ui";
import { api } from "@/lib/api";
import { texts } from "@/texts/pt-BR";

const t = texts.event.voids;

export function VoidsTab({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient();
  const key = ["voids", eventId];
  const voids = useQuery({ queryKey: key, queryFn: () => api<VoidDto[]>(`/api/events/${eventId}/voids`) });
  const [first, setFirst] = useState(1);
  const [last, setLast] = useState(1);
  const [reason, setReason] = useState<VoidReason>("unsold");
  const [note, setNote] = useState("");
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });

  const create = useMutation({
    mutationFn: () => {
      const body: CreateVoidBody = { first, last, reason, note: note.trim() === "" ? null : note };
      return api<VoidDto>(`/api/events/${eventId}/voids`, { method: "POST", body });
    },
    onSuccess: () => {
      setNote("");
      void refresh();
    },
  });
  const undo = useMutation({
    mutationFn: (id: string) => api<VoidDto>(`/api/voids/${id}/undo`, { method: "POST" }),
    onSuccess: refresh,
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate();
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm opacity-80">{t.intro}</p>
      <Card>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-4">
          <Field label={texts.common.first}>
            <NumberInput value={first} step={1} min={1} onChange={setFirst} />
          </Field>
          <Field label={texts.common.last}>
            <NumberInput value={last} step={1} min={1} onChange={setLast} />
          </Field>
          <Field label={t.reason}>
            <Select value={reason} onChange={(e) => { setReason(e.target.value as VoidReason); }}>
              {(Object.keys(t.reasons) as VoidReason[]).map((item) => (
                <option key={item} value={item}>{t.reasons[item]}</option>
              ))}
            </Select>
          </Field>
          <Field label={t.note}>
            <Input value={note} onChange={(e) => { setNote(e.target.value); }} maxLength={200} />
          </Field>
          <div className="sm:col-span-4">
            <Button type="submit" variant="danger" disabled={create.isPending}>
              {t.create}
            </Button>
          </div>
        </form>
        <ErrorMessage error={create.error ?? undo.error} />
      </Card>
      {voids.isPending ? (
        <p className="text-sm opacity-70">{texts.common.loading}</p>
      ) : voids.isError ? (
        <ErrorMessage error={voids.error} />
      ) : voids.data.length === 0 ? (
        <p className="text-sm opacity-70">{t.empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {voids.data.map((item) => (
            <li
              key={item.id}
              className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border border-black/10 p-3 dark:border-white/15 ${item.undoneAt === null ? "" : "opacity-50"}`}
            >
              <span className="font-mono">{texts.common.range(item.first, item.last)}</span>
              <span className="text-sm">
                {t.reasons[item.reason]}
                {item.note !== null && ` · ${item.note}`}
              </span>
              {item.undoneAt === null ? (
                <Button variant="secondary" onClick={() => { undo.mutate(item.id); }}>
                  {t.undo}
                </Button>
              ) : (
                <span className="text-sm">{t.undone}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
