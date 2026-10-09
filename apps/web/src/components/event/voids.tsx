"use client";

import type { CreateVoidBody, VoidDto, VoidReason } from "@ingressoimpresso/api-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, RotateCcw, ShieldX } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import {
  Badge,
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
  Select,
  errorMessage,
  useConfirm,
  type Tone,
} from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { shortDateTime, ticketNumber } from "@/lib/format";
import { texts } from "@/texts/pt-BR";

const t = texts.event.voids;
const REASON_TONE: Record<VoidReason, Tone> = { unsold: "neutral", lost: "danger", revoked: "warning" };

export function VoidsTab({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const key = ["voids", eventId];
  const voids = useQuery({ queryKey: key, queryFn: () => api<VoidDto[]>(`/api/events/${eventId}/voids`) });
  const [first, setFirst] = useState(1);
  const [last, setLast] = useState(1);
  const [reason, setReason] = useState<VoidReason>("unsold");
  const [note, setNote] = useState("");
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });

  const create = useMutation({
    mutationFn: () => {
      const body: CreateVoidBody = { first, last, reason, note: note.trim() === "" ? null : note.trim() };
      return api<VoidDto>(`/api/events/${eventId}/voids`, { method: "POST", body });
    },
    onSuccess: () => {
      setNote("");
      toast.success(t.createdToast);
      void refresh();
    },
  });
  const undo = useMutation({
    mutationFn: (id: string) => api<VoidDto>(`/api/voids/${id}/undo`, { method: "POST" }),
    onSuccess: () => {
      toast.success(t.undoneToast);
      void refresh();
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const range = texts.common.range(first, last);
    if (await confirm({ title: t.createConfirmTitle(range), description: t.createConfirmBody, confirmLabel: t.create })) {
      create.mutate();
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Lead>{t.intro}</Lead>
      <Card>
        <CardHeader title={t.newVoid} icon={Ban} />
        <form onSubmit={(event) => void submit(event)} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
          <Field label={t.note} optional>
            <Input value={note} onChange={(e) => { setNote(e.target.value); }} placeholder={t.notePlaceholder} maxLength={200} />
          </Field>
          <div className="sm:col-span-2 lg:col-span-4">
            <Button type="submit" variant="danger" icon={<Ban />} loading={create.isPending}>
              {t.create}
            </Button>
          </div>
        </form>
        <ErrorMessage error={create.error} className="mt-4" />
      </Card>
      {voids.isPending ? (
        <LoadingBlock rows={2} />
      ) : voids.isError ? (
        <ErrorMessage error={voids.error} />
      ) : voids.data.length === 0 ? (
        <EmptyState icon={ShieldX} title={t.emptyTitle} description={t.empty} />
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-xs">
          {voids.data.map((item) => {
            const undone = item.undoneAt !== null;
            return (
              <li key={item.id} className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 sm:px-5", undone && "opacity-55")}>
                <span className={cn("font-mono text-[15px] font-semibold tabular", undone ? "text-fg-muted line-through" : "text-fg")}>
                  {ticketNumber(item.first)} – {ticketNumber(item.last)}
                </span>
                <Badge tone={undone ? "neutral" : REASON_TONE[item.reason]}>{t.reasons[item.reason]}</Badge>
                <span className="min-w-0 flex-1 truncate text-sm text-fg-muted">
                  {item.note ?? ""}
                  {item.note !== null && " · "}
                  {shortDateTime(item.createdAt)}
                </span>
                {undone ? (
                  <span className="text-sm text-fg-subtle">{t.undone}</span>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<RotateCcw />}
                    loading={undo.isPending && undo.variables === item.id}
                    onClick={() => {
                      undo.mutate(item.id);
                    }}
                  >
                    {t.undo}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
