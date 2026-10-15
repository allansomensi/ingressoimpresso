"use client";

import type { CreateVoidBody, VoidDto, VoidReason } from "@ingressoimpresso/api-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, RotateCcw, ShieldX, Smartphone } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  ErrorMessage,
  Field,
  Input,
  LoadingBlock,
  NumberInput,
  Select,
  errorMessage,
  type Tone,
} from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { shortDateTime, ticketNumber } from "@/lib/format";
import { common as commonTexts } from "@/texts/pt-BR/common";
import { errors as errorsTexts } from "@/texts/pt-BR/errors";
import { useEventTexts } from "@/components/event/access";

import { TabHeader } from "./tab-header";
import type { SelectTab } from "./tabs";

const REASON_TONE: Record<VoidReason, Tone> = { unsold: "neutral", lost: "danger", revoked: "warning" };

/** Cancels a range of numbers: the dialog itself asks for the confirmation (ADR 0087). */
function VoidDialog({ eventId, open, onClose, onSaved }: { eventId: string; open: boolean; onClose: () => void; onSaved: () => void }) {
  const t = useEventTexts().voids;
  const [first, setFirst] = useState(1);
  const [last, setLast] = useState(1);
  const [reason, setReason] = useState<VoidReason>("unsold");
  const [note, setNote] = useState("");
  const create = useMutation({
    mutationFn: () => {
      const body: CreateVoidBody = { first, last, reason, note: note.trim() === "" ? null : note.trim() };
      return api<VoidDto>(`/api/events/${eventId}/voids`, { method: "POST", body });
    },
    onSuccess: () => {
      toast.success(t.createdToast);
      onSaved();
      onClose();
    },
  });
  const valid = Number.isInteger(first) && Number.isInteger(last) && first >= 1 && last >= first;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (valid) {
      create.mutate();
    }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t.newVoid}
      description={t.createConfirmBody}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {commonTexts.cancel}
          </Button>
          <Button type="submit" form="void-form" variant="danger" icon={<Ban />} loading={create.isPending} disabled={!valid}>
            {valid ? t.createRange(commonTexts.range(first, last)) : t.create}
          </Button>
        </>
      }
    >
      {/* First and last number side by side even on phones: two short numbers, one range. */}
      <form id="void-form" onSubmit={submit} className="grid grid-cols-2 gap-4">
        <Field label={commonTexts.first}>
          <NumberInput value={first} step={1} min={1} onChange={setFirst} required />
        </Field>
        <Field label={commonTexts.last}>
          <NumberInput value={last} step={1} min={1} onChange={setLast} required />
        </Field>
        <Field label={t.reason} className="col-span-2">
          <Select
            value={reason}
            onChange={(e) => {
              setReason(e.target.value as VoidReason);
            }}
          >
            {(Object.keys(t.reasons) as VoidReason[]).map((item) => (
              <option key={item} value={item}>
                {t.reasons[item]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t.note} optional className="col-span-2">
          <Input
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
            }}
            placeholder={t.notePlaceholder}
            maxLength={200}
          />
        </Field>
        {!valid && <p className="col-span-2 text-xs text-danger-fg">{errorsTexts.invalid_range}</p>}
        <ErrorMessage error={create.error} className="col-span-2" />
      </form>
    </Dialog>
  );
}

export function VoidsTab({ eventId, onSelect }: { eventId: string; onSelect: SelectTab }) {
  const t = useEventTexts().voids;
  const queryClient = useQueryClient();
  const key = ["voids", eventId];
  const voids = useQuery({ queryKey: key, queryFn: () => api<VoidDto[]>(`/api/events/${eventId}/voids`) });
  const [creating, setCreating] = useState(false);
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: key }),
      queryClient.invalidateQueries({ queryKey: ["report", eventId] }),
    ]);

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

  return (
    <div className="flex flex-col gap-6">
      <TabHeader
        tab="voids"
        help={t.intro}
        actions={
          <Button
            variant="secondary"
            icon={<Ban />}
            onClick={() => {
              setCreating(true);
            }}
          >
            {t.newVoid}
          </Button>
        }
      />
      <p className="-mt-2 text-sm text-fg-muted">
        {t.replaceTip}{" "}
        <button
          type="button"
          onClick={() => {
            onSelect("digital");
          }}
          className="relative font-medium text-brand-soft-fg underline underline-offset-2 touch-target hover:text-fg"
        >
          {t.replaceTipLink}
        </button>
      </p>
      <VoidDialog
        eventId={eventId}
        open={creating}
        onClose={() => {
          setCreating(false);
        }}
        onSaved={() => {
          void refresh();
        }}
      />
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
                {item.replacedBy !== null && (
                  <button
                    type="button"
                    title={t.replacedHint}
                    onClick={() => {
                      onSelect("digital");
                    }}
                    className="relative inline-flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-medium text-brand-soft-fg touch-target hover:bg-brand-soft/70 active:bg-brand-soft/60"
                  >
                    <Smartphone aria-hidden className="size-3.5" />
                    {t.replacedBy(ticketNumber(item.replacedBy))}
                  </button>
                )}
                <span className="min-w-0 flex-1 truncate text-sm text-fg-muted">
                  {item.note ?? ""}
                  {item.note !== null && " · "}
                  {shortDateTime(item.createdAt)}
                </span>
                {undone ? (
                  <span className="text-sm text-fg-subtle">{t.undone}</span>
                ) : item.locked ? (
                  <span className="text-sm text-fg-subtle" title={t.lockedHint}>
                    {t.locked}
                  </span>
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
