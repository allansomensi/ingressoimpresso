"use client";

import type { RangeBody, RangeDto, SellerBody, SellerDto } from "@ingressoimpresso/api-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { Button, Card, ErrorMessage, Field, Input, NumberInput } from "@/components/ui";
import { api } from "@/lib/api";
import { texts } from "@/texts/pt-BR";

const t = texts.event.sellers;

function AssignForm({ seller, onDone }: { seller: SellerDto; onDone: () => void }) {
  const [first, setFirst] = useState(1);
  const [last, setLast] = useState(50);
  const assign = useMutation({
    mutationFn: () => {
      const body: RangeBody = { first, last };
      return api<RangeDto>(`/api/sellers/${seller.id}/ranges`, { method: "POST", body });
    },
    onSuccess: onDone,
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    assign.mutate();
  };
  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <Field label={texts.common.first}>
        <NumberInput value={first} step={1} min={1} onChange={setFirst} />
      </Field>
      <Field label={texts.common.last}>
        <NumberInput value={last} step={1} min={1} onChange={setLast} />
      </Field>
      <Button type="submit" variant="secondary" disabled={assign.isPending}>
        {t.assign}
      </Button>
      <div className="w-full">
        <ErrorMessage error={assign.error} />
      </div>
    </form>
  );
}

export function SellersTab({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient();
  const key = ["sellers", eventId];
  const sellers = useQuery({ queryKey: key, queryFn: () => api<SellerDto[]>(`/api/events/${eventId}/sellers`) });
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });

  const create = useMutation({
    mutationFn: () => {
      const body: SellerBody = { name, phone: phone.trim() === "" ? null : phone };
      return api<SellerDto>(`/api/events/${eventId}/sellers`, { method: "POST", body });
    },
    onSuccess: () => {
      setName("");
      setPhone("");
      void refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (path: string) => api<undefined>(path, { method: "DELETE" }),
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
          <Field label={t.name}>
            <Input value={name} onChange={(e) => { setName(e.target.value); }} required maxLength={60} />
          </Field>
          <Field label={t.phone}>
            <Input value={phone} onChange={(e) => { setPhone(e.target.value); }} inputMode="tel" maxLength={30} />
          </Field>
          <Button type="submit" disabled={create.isPending}>
            {t.create}
          </Button>
        </form>
        <ErrorMessage error={create.error ?? remove.error} />
      </Card>
      {sellers.isPending ? (
        <p className="text-sm opacity-70">{texts.common.loading}</p>
      ) : sellers.isError ? (
        <ErrorMessage error={sellers.error} />
      ) : sellers.data.length === 0 ? (
        <p className="text-sm opacity-70">{t.empty}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {sellers.data.map((seller) => (
            <li key={seller.id}>
              <Card className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">
                    {seller.name}
                    {seller.phone !== null && <span className="ml-2 text-sm font-normal opacity-70">{seller.phone}</span>}
                  </span>
                  <Button variant="danger" onClick={() => { remove.mutate(`/api/sellers/${seller.id}`); }}>
                    {texts.common.remove}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {seller.ranges.length === 0 && <span className="text-sm opacity-70">{t.noRanges}</span>}
                  {seller.ranges.map((range) => (
                    <span key={range.id} className="flex items-center gap-1 rounded-full bg-black/5 px-3 py-1 font-mono text-sm dark:bg-white/10">
                      {texts.common.range(range.first, range.last)}
                      <button
                        type="button"
                        aria-label={texts.common.remove}
                        className="ml-1 opacity-60 hover:opacity-100"
                        onClick={() => { remove.mutate(`/api/ranges/${range.id}`); }}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <AssignForm seller={seller} onDone={() => void refresh()} />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
