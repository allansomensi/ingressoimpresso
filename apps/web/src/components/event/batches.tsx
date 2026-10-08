"use client";

import type { BatchDto, CreateBatchBody } from "@ingressoimpresso/api-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { Button, Card, ErrorMessage, Field, NumberInput } from "@/components/ui";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { texts } from "@/texts/pt-BR";

const t = texts.event.batches;

export function BatchesTab({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient();
  const { session } = useSession();
  const isAdmin = session.status === "signed-in" && session.user.isAdmin;
  const key = ["batches", eventId];
  const batches = useQuery({ queryKey: key, queryFn: () => api<BatchDto[]>(`/api/events/${eventId}/batches`) });
  const [quantity, setQuantity] = useState(50);
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });

  const create = useMutation({
    mutationFn: () => {
      const body: CreateBatchBody = { quantity };
      return api<BatchDto>(`/api/events/${eventId}/batches`, { method: "POST", body });
    },
    onSuccess: refresh,
  });
  const action = useMutation({
    mutationFn: (path: string) => api<BatchDto>(path, { method: "POST" }),
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
        <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
          <Field label={t.quantity}>
            <NumberInput value={quantity} step={1} min={1} onChange={setQuantity} />
          </Field>
          <Button type="submit" disabled={create.isPending}>
            {t.create}
          </Button>
        </form>
        <ErrorMessage error={create.error ?? action.error} />
      </Card>
      {batches.isPending ? (
        <p className="text-sm opacity-70">{texts.common.loading}</p>
      ) : batches.isError ? (
        <ErrorMessage error={batches.error} />
      ) : batches.data.length === 0 ? (
        <p className="text-sm opacity-70">{t.empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {batches.data.map((batch) => (
            <li key={batch.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-black/10 p-3 dark:border-white/15">
              <span className="font-mono">{texts.common.range(batch.first, batch.last)}</span>
              <span className="text-sm">{t.status[batch.status]}</span>
              {batch.status === "awaiting_payment" && (
                <span className="flex gap-2">
                  {isAdmin && (
                    <Button onClick={() => { action.mutate(`/api/admin/batches/${batch.id}/mark-paid`); }}>{t.markPaid}</Button>
                  )}
                  <Button variant="danger" onClick={() => { action.mutate(`/api/batches/${batch.id}/cancel`); }}>
                    {t.cancelBatch}
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
