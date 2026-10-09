"use client";

import type { RangeBody, RangeDto, SellerBody, SellerDto } from "@ingressoimpresso/api-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Phone, Plus, Trash2, UserPlus, Users, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorMessage,
  Field,
  Input,
  Lead,
  LoadingBlock,
  NumberInput,
  errorMessage,
  useConfirm,
} from "@/components/ui";
import { api } from "@/lib/api";
import { initials, ticketNumber } from "@/lib/format";
import { texts } from "@/texts/pt-BR";

const t = texts.event.sellers;

function AssignForm({ seller, onDone, onCancel }: { seller: SellerDto; onDone: () => void; onCancel: () => void }) {
  const last = seller.ranges.at(-1)?.last;
  const [first, setFirst] = useState(last === undefined ? 1 : last + 1);
  const [lastNumber, setLastNumber] = useState(last === undefined ? 50 : last + 50);
  const assign = useMutation({
    mutationFn: () => {
      const body: RangeBody = { first, last: lastNumber };
      return api<RangeDto>(`/api/sellers/${seller.id}/ranges`, { method: "POST", body });
    },
    onSuccess: () => {
      toast.success(t.assignedToast);
      onDone();
    },
  });
  const valid = Number.isInteger(first) && Number.isInteger(lastNumber) && first >= 1 && lastNumber >= first;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (valid) {
      assign.mutate();
    }
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-xl bg-surface-2 p-3 animate-fade-in sm:p-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
        <Field label={texts.common.first}>
          <NumberInput value={first} step={1} min={1} onChange={setFirst} required />
        </Field>
        <Field label={texts.common.last}>
          <NumberInput value={lastNumber} step={1} min={1} onChange={setLastNumber} required />
        </Field>
        <Button variant="ghost" onClick={onCancel}>
          {texts.common.cancel}
        </Button>
        <Button type="submit" loading={assign.isPending} disabled={!valid}>
          {t.assign}
        </Button>
      </div>
      {!valid && <p className="text-xs text-danger-fg">{texts.errors.invalid_range}</p>}
      <ErrorMessage error={assign.error} />
    </form>
  );
}

function SellerCard({ seller, onChange }: { seller: SellerDto; onChange: () => void }) {
  const confirm = useConfirm();
  const [assigning, setAssigning] = useState(false);
  const remove = useMutation({
    mutationFn: (path: string) => api<undefined>(path, { method: "DELETE" }),
    onSuccess: onChange,
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
  const total = seller.ranges.reduce((sum, range) => sum + range.last - range.first + 1, 0);

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand-soft-fg">
            {initials(seller.name)}
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-semibold text-fg">{seller.name}</span>
            <span className="flex items-center gap-1.5 text-sm text-fg-muted">
              {seller.phone !== null && (
                <>
                  <Phone className="size-3.5" aria-hidden />
                  {seller.phone}
                  <span aria-hidden>·</span>
                </>
              )}
              {t.ticketsCount(total)}
            </span>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`${texts.common.remove} ${seller.name}`}
          onClick={() => {
            void confirm({ title: t.removeConfirmTitle(seller.name), description: t.removeConfirmBody, confirmLabel: texts.common.remove }).then(
              (ok) => {
                if (ok) {
                  remove.mutate(`/api/sellers/${seller.id}`, {
                    onSuccess: () => {
                      toast.success(t.removedToast);
                    },
                  });
                }
              },
            );
          }}
        >
          <Trash2 />
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {seller.ranges.length === 0 && <span className="text-sm text-fg-subtle">{t.noRanges}</span>}
        {seller.ranges.map((range) => {
          const label = texts.common.range(range.first, range.last);
          return (
            <span
              key={range.id}
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-2 py-1 pr-1 pl-2.5 font-mono text-sm text-fg tabular"
            >
              {ticketNumber(range.first)}–{ticketNumber(range.last)}
              <button
                type="button"
                aria-label={t.removeRange(label)}
                className="flex size-5 items-center justify-center rounded-md text-fg-subtle transition hover:bg-danger-soft hover:text-danger-fg"
                onClick={() => {
                  void confirm({ title: t.removeRangeConfirmTitle(label), description: t.removeRangeConfirmBody, confirmLabel: texts.common.remove }).then(
                    (ok) => {
                      if (ok) {
                        remove.mutate(`/api/ranges/${range.id}`, {
                          onSuccess: () => {
                            toast.success(t.rangeRemovedToast);
                          },
                        });
                      }
                    },
                  );
                }}
              >
                <X className="size-3.5" />
              </button>
            </span>
          );
        })}
      </div>
      {assigning ? (
        <AssignForm
          seller={seller}
          onDone={() => {
            setAssigning(false);
            onChange();
          }}
          onCancel={() => {
            setAssigning(false);
          }}
        />
      ) : (
        <Button
          variant="secondary"
          size="sm"
          icon={<Plus />}
          className="w-fit"
          onClick={() => {
            setAssigning(true);
          }}
        >
          {t.assign}
        </Button>
      )}
    </Card>
  );
}

export function SellersTab({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient();
  const key = ["sellers", eventId];
  const sellers = useQuery({ queryKey: key, queryFn: () => api<SellerDto[]>(`/api/events/${eventId}/sellers`) });
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: key });
    void queryClient.invalidateQueries({ queryKey: ["report", eventId] });
  };

  const create = useMutation({
    mutationFn: () => {
      const body: SellerBody = { name: name.trim(), phone: phone.trim() === "" ? null : phone.trim() };
      return api<SellerDto>(`/api/events/${eventId}/sellers`, { method: "POST", body });
    },
    onSuccess: () => {
      setName("");
      setPhone("");
      toast.success(t.createdToast);
      refresh();
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate();
  };

  return (
    <div className="flex flex-col gap-6">
      <Lead>{t.intro}</Lead>
      <Card>
        <CardHeader title={t.newSeller} icon={UserPlus} />
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label={t.name}>
            <Input value={name} onChange={(e) => { setName(e.target.value); }} placeholder={t.namePlaceholder} required maxLength={60} />
          </Field>
          <Field label={t.phone} optional>
            <Input
              value={phone}
              onChange={(e) => { setPhone(e.target.value); }}
              placeholder={t.phonePlaceholder}
              inputMode="tel"
              autoComplete="tel"
              maxLength={30}
            />
          </Field>
          <Button type="submit" loading={create.isPending} icon={<Plus />}>
            {t.create}
          </Button>
        </form>
        <ErrorMessage error={create.error} className="mt-4" />
      </Card>
      {sellers.isPending ? (
        <LoadingBlock rows={2} />
      ) : sellers.isError ? (
        <ErrorMessage error={sellers.error} />
      ) : sellers.data.length === 0 ? (
        <EmptyState icon={Users} title={t.emptyTitle} description={t.empty} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {sellers.data.map((seller) => (
            <SellerCard key={seller.id} seller={seller} onChange={refresh} />
          ))}
        </div>
      )}
    </div>
  );
}
