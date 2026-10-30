"use client";

import type { CategoryDto, TicketLinksDto, UpdateWaitlistEntryBody, WaitlistDto, WaitlistEntryDto } from "@ingressoimpresso/api-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, Check, ChevronDown, MessageCircle, MoreHorizontal, RotateCcw, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useEventAccess, useEventTexts } from "@/components/event/access";
import { Badge, Card, CardHeader, Menu, MenuItem, buttonClass, errorMessage, useConfirm } from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { phoneLabel, shortDateTime } from "@/lib/format";
import { whatsappUrl } from "@/lib/share";

import { SendDialog } from "./digital-send";

/** People waiting, by category: what another batch would serve. */
function demandByCategory(entries: readonly WaitlistEntryDto[]): Map<string | null, { people: number; tickets: number }> {
  const totals = new Map<string | null, { people: number; tickets: number }>();
  for (const entry of entries) {
    if (entry.doneAt !== null) {
      continue;
    }
    const current = totals.get(entry.categoryId) ?? { people: 0, tickets: 0 };
    totals.set(entry.categoryId, { people: current.people + 1, tickets: current.tickets + entry.quantity });
  }
  return totals;
}

/**
 * The waiting list of the public page (ADR 0124), in Digitais: who is waiting for which
 * category, how many tickets that would take, and a ticket or a message to each one.
 */
export function WaitlistCard({
  eventId,
  eventName,
  data,
  categories,
  onIssued,
  onNewBatch,
}: {
  eventId: string;
  eventName: string;
  data: TicketLinksDto;
  categories: readonly CategoryDto[];
  onIssued: Parameters<typeof SendDialog>[0]["onIssued"];
  onNewBatch: () => void;
}) {
  const t = useEventTexts().digital.waitlist;
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const delivers = useEventAccess().can("delivery");
  const key = ["waitlist", eventId];
  const waitlist = useQuery({ queryKey: key, queryFn: () => api<WaitlistDto>(`/api/events/${eventId}/waitlist`) });
  const [sending, setSending] = useState<WaitlistEntryDto | null>(null);
  const [showDone, setShowDone] = useState(false);
  const update = useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) => {
      const body: UpdateWaitlistEntryBody = { done };
      return api(`/api/waitlist-entries/${id}`, { method: "PUT", body });
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: key }),
    onError: (error) => toast.error(errorMessage(error)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/waitlist-entries/${id}`, { method: "DELETE" }),
    onSuccess: () => toast.success(t.removed),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: key }),
    onError: (error) => toast.error(errorMessage(error)),
  });

  const list = waitlist.data;
  if (list === undefined || (list.entries.length === 0 && !list.open)) {
    return null;
  }
  const waiting = list.entries.filter((entry) => entry.doneAt === null);
  const done = list.entries.filter((entry) => entry.doneAt !== null);
  const demand = demandByCategory(list.entries);
  const category = (id: string | null) => categories.find((item) => item.id === id) ?? null;
  const free = (id: string | null) => data.stock.find((stock) => stock.categoryId === id)?.free ?? 0;

  return (
    <Card>
      <CardHeader
        title={t.title}
        icon={BellRing}
        description={waiting.length === 0 ? (list.open ? t.emptyOpen : t.emptyClosed) : t.description(waiting.length)}
        actions={!list.enabled && <Badge tone="neutral">{t.off}</Badge>}
      />
      {demand.size > 0 && (
        <ul className="mb-4 flex flex-wrap gap-2" aria-label={t.demandLabel}>
          {[...demand].map(([id, totals]) => {
            const item = category(id);
            const available = free(id);
            return (
              <li key={id ?? "none"} className="relative flex items-center gap-2 overflow-hidden rounded-xl border border-border bg-surface-2/60 py-2 pr-3 pl-4 text-sm">
                <span aria-hidden className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: item?.color ?? "var(--border-strong)" }} />
                <span className="font-medium text-fg">{item?.name ?? t.anyCategory}</span>
                <span className="text-fg-muted tabular">{t.demand(totals.people, totals.tickets)}</span>
                {available > 0 && <Badge tone="success">{t.available(available)}</Badge>}
              </li>
            );
          })}
        </ul>
      )}
      {waiting.length > 0 && (
        <ol className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border">
          {waiting.map((entry, index) => {
            const item = category(entry.categoryId);
            const canSend = delivers && free(entry.categoryId) >= entry.quantity;
            return (
              <li key={entry.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold text-fg-muted tabular">
                    {index + 1}
                  </span>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-sm font-medium text-fg">{entry.name}</span>
                    <span className="truncate text-xs text-fg-muted">
                      {[entry.phone === "" ? null : phoneLabel(entry.phone), item?.name ?? null, t.tickets(entry.quantity)].filter((part) => part !== null).join(" · ")}
                    </span>
                    <span className="text-xs text-fg-subtle">{t.since(shortDateTime(entry.createdAt))}</span>
                  </div>
                </div>
                {delivers && (
                  <div className="flex shrink-0 items-center gap-1">
                    {canSend ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSending(entry);
                        }}
                        className={buttonClass({ size: "sm" })}
                      >
                        <Send />
                        <span className="max-sm:sr-only">{t.send}</span>
                      </button>
                    ) : (
                      <a
                        href={whatsappUrl(t.message(entry.name.split(" ")[0] ?? entry.name, eventName), entry.phone)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={buttonClass({ size: "sm", variant: "secondary" })}
                      >
                        <MessageCircle />
                        <span className="max-sm:sr-only">{t.notify}</span>
                      </a>
                    )}
                    <Menu label={t.actions(entry.name)} trigger={<MoreHorizontal className="size-4" aria-hidden />} triggerClassName={buttonClass({ variant: "ghost", size: "icon" })}>
                      {canSend && (
                        <MenuItem
                          icon={<MessageCircle />}
                          onSelect={() => {
                            window.open(whatsappUrl(t.message(entry.name.split(" ")[0] ?? entry.name, eventName), entry.phone), "_blank", "noopener,noreferrer");
                          }}
                        >
                          {t.notify}
                        </MenuItem>
                      )}
                      <MenuItem
                        icon={<Check />}
                        onSelect={() => {
                          update.mutate({ id: entry.id, done: true }, { onSuccess: () => toast.success(t.markedDone) });
                        }}
                      >
                        {t.markDone}
                      </MenuItem>
                      <MenuItem
                        tone="danger"
                        icon={<Trash2 />}
                        onSelect={() => {
                          void confirm({ title: t.removeTitle(entry.name), description: t.removeBody, confirmLabel: t.remove }).then((ok) => {
                            if (ok) {
                              remove.mutate(entry.id);
                            }
                          });
                        }}
                      >
                        {t.remove}
                      </MenuItem>
                    </Menu>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {waiting.length > 0 && [...demand].some(([id, totals]) => free(id) < totals.tickets) && (
        <p className="mt-3 text-xs leading-relaxed text-fg-muted">
          {t.batchHint}{" "}
          <button type="button" onClick={onNewBatch} className="relative font-semibold text-brand touch-target hover:underline active:underline">
            {t.newBatch}
          </button>
        </p>
      )}
      {done.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            aria-expanded={showDone}
            onClick={() => {
              setShowDone(!showDone);
            }}
            className="relative flex items-center gap-1.5 text-sm font-medium text-fg-muted touch-target hover:text-fg active:text-fg"
          >
            <ChevronDown className={cn("size-4 transition-transform", showDone && "rotate-180")} aria-hidden />
            {t.doneList(done.length)}
          </button>
          {showDone && (
            <ul className="mt-2 flex flex-col divide-y divide-border rounded-xl border border-border">
              {done.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <span className="min-w-0 truncate text-fg-muted">
                    {entry.name} · {category(entry.categoryId)?.name ?? t.anyCategory} · {t.tickets(entry.quantity)}
                  </span>
                  {delivers && (
                    <button
                      type="button"
                      onClick={() => {
                        update.mutate({ id: entry.id, done: false });
                      }}
                      className={buttonClass({ size: "sm", variant: "ghost" })}
                    >
                      <RotateCcw />
                      {t.undo}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {sending !== null && (
        <SendDialog
          key={sending.id}
          eventId={eventId}
          open
          data={data}
          categories={categories}
          initial={{ categoryId: sending.categoryId, quantity: sending.quantity, holder: sending.name, phone: phoneLabel(sending.phone) }}
          onClose={() => {
            setSending(null);
          }}
          onIssued={(issued) => {
            update.mutate({ id: sending.id, done: true });
            onIssued(issued);
          }}
          onNewBatch={onNewBatch}
        />
      )}
    </Card>
  );
}
