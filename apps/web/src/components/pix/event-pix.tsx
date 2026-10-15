"use client";

import type {
  EventPixDto,
  PixAccountBody,
  PixAccountDto,
  PixNumberDto,
  PixReceiptsBody,
  PixReceiver,
  PixSettingsBody,
  SellerDto,
} from "@ingressoimpresso/api-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CheckCircle2, ExternalLink, QrCode, RotateCcw, Search, Store, UserRound } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { useEventKind } from "@/components/event/access";
import { PixAccountForm } from "@/components/pix/pix-account-form";
import { Alert, Badge, Button, Card, CardHeader, Dialog, Input, buttonClass, errorMessage, useConfirm } from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { money, ticketNumber } from "@/lib/format";
import { pixReference } from "@/lib/pix";
import { pix as pixTexts } from "@/texts/pt-BR/pix";

const t = pixTexts;
const RECEIVERS = ["off", "organization", "seller"] as const satisfies readonly PixReceiver[];

export function eventPixKey(eventId: string): readonly unknown[] {
  return ["event-pix", eventId];
}

/** How an event's buyers pay by Pix (ADR 0085). */
export function useEventPix(eventId: string) {
  return useQuery({
    queryKey: eventPixKey(eventId),
    queryFn: () => api<EventPixDto>(`/api/events/${eventId}/pix`),
  });
}

/** Totals of the numbers: confirmed and still to receive (numbers with a price). */
export function pixTotals(numbers: readonly PixNumberDto[]): {
  received: number;
  pending: number;
  pendingCount: number;
} {
  let received = 0;
  let pending = 0;
  let pendingCount = 0;
  for (const row of numbers) {
    if (row.receipt !== null) {
      received += row.receipt.amountCents;
    } else {
      pending += row.amountCents ?? 0;
      pendingCount += 1;
    }
  }
  return { received, pending, pendingCount };
}

/**
 * The Pix card of the Sellers tab: who receives, the organization's key and the review of what
 * arrived. Only the money part of the team changes it (ADR 0055).
 */
export function PixCard({ eventId, editable }: { eventId: string; editable: boolean }) {
  const kind = useEventKind();
  const queryClient = useQueryClient();
  const pix = useEventPix(eventId);
  const [reviewing, setReviewing] = useState(false);
  const save = useMutation({
    mutationFn: (receiver: PixReceiver) => {
      const body: PixSettingsBody = { receiver };
      return api<EventPixDto>(`/api/events/${eventId}/pix-settings`, {
        method: "PUT",
        body,
      });
    },
    onSuccess: (data) => {
      queryClient.setQueryData(eventPixKey(eventId), data);
      toast.success(t.receiverSaved);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  if (pix.data === undefined) {
    return null;
  }
  const data = pix.data;
  const receiver = save.isPending ? save.variables : data.receiver;
  const withoutKey = data.sellers.filter((seller) => seller.account === null).length;
  const totals = pixTotals(data.numbers);

  return (
    <Card>
      <CardHeader
        icon={QrCode}
        title={t.settingsTitle}
        description={t.settingsDescription}
        actions={
          data.numbers.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              icon={<CheckCircle2 />}
              onClick={() => {
                setReviewing(true);
              }}
            >
              {t.review}
              {totals.pendingCount > 0 && (
                <span className="ml-1 rounded-full bg-warning-soft px-1.5 text-xs font-semibold text-warning-fg tabular">{totals.pendingCount}</span>
              )}
            </Button>
          )
        }
      />
      <fieldset disabled={!editable} className="grid gap-2 sm:grid-cols-3">
        <legend className="sr-only">{t.settingsTitle}</legend>
        {RECEIVERS.map((option) => {
          const selected = receiver === option;
          return (
            <label
              key={option}
              className={cn(
                "flex cursor-pointer flex-col gap-1 rounded-xl border p-3 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand has-[:disabled]:cursor-default",
                selected ? "border-brand bg-brand-soft/60" : "border-border hover:border-border-strong active:bg-surface-2",
              )}
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-fg">
                <input
                  type="radio"
                  name={`pix-receiver-${eventId}`}
                  className="size-4 accent-brand"
                  checked={selected}
                  onChange={() => {
                    save.mutate(option);
                  }}
                />
                {t.receivers[option].title}
              </span>
              <span className="pl-6 text-xs leading-relaxed text-fg-muted">
                {option === "off" && kind === "tokens" ? t.receivers.offTokens : t.receivers[option].body}
              </span>
            </label>
          );
        })}
      </fieldset>

      {receiver !== "off" && (
        <div className="mt-4 flex flex-col gap-3">
          {data.organization === null ? (
            <Alert
              tone="warning"
              action={
                <Link href="/painel/organizacao#pix" className={buttonClass({ variant: "secondary", size: "sm" })}>
                  <ExternalLink />
                  {t.addOrganizationKey}
                </Link>
              }
            >
              {t.noOrganizationKey}
            </Alert>
          ) : (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg-muted">
              <span className="font-medium text-fg">{t.payeeOrganization}:</span>
              <span>{t.keyTypes[data.organization.keyType]}</span>
              <span className="font-mono text-xs">{data.organization.key}</span>
              <Link href="/painel/organizacao#pix" className="text-xs font-medium text-brand hover:underline">
                {t.settingsEdit}
              </Link>
            </p>
          )}
          {receiver === "seller" && withoutKey > 0 && <p className="text-xs leading-relaxed text-fg-muted">{t.sellersWithoutKey(withoutKey)}</p>}
          {data.numbers.length > 0 && (
            <p className="flex flex-wrap gap-2 text-sm">
              <Badge tone="success">{t.receivedTotal(money(totals.received))}</Badge>
              {totals.pending > 0 && <Badge tone="warning">{t.pendingTotal(money(totals.pending))}</Badge>}
            </p>
          )}
        </div>
      )}

      {reviewing && (
        <PixReview
          eventId={eventId}
          data={data}
          editable={editable}
          onClose={() => {
            setReviewing(false);
          }}
        />
      )}
    </Card>
  );
}

type Filter = "pending" | "paid" | "all";

/** The numbers someone may pay, to mark what the bank statement shows (ADR 0085). */
function PixReview({ eventId, data, editable, onClose }: { eventId: string; data: EventPixDto; editable: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>("pending");
  const [query, setQuery] = useState("");
  const mark = useMutation({
    mutationFn: (body: PixReceiptsBody) =>
      api<EventPixDto>(`/api/events/${eventId}/pix/receipts`, {
        method: "POST",
        body,
      }),
    onSuccess: (fresh) => {
      queryClient.setQueryData(eventPixKey(eventId), fresh);
      // The seller's settlement changes with what the organization received.
      for (const key of ["report", "accountability"]) {
        void queryClient.invalidateQueries({ queryKey: [key, eventId] });
      }
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase().replace(/\s+/g, " ");
    // A number only when the search is a number: an identifier has digits of its own.
    const digits = /^\d+$/.test(needle) ? needle : "";
    return data.numbers.filter((row) => {
      if ((filter === "pending" && row.receipt !== null) || (filter === "paid" && row.receipt === null)) {
        return false;
      }
      if (needle === "") {
        return true;
      }
      const reference = pixReference(eventId, row.number).toLowerCase();
      return (
        (digits !== "" && String(row.number) === String(Number(digits))) ||
        reference.includes(needle.replace(/\s/g, "")) ||
        (row.buyer ?? "").toLowerCase().includes(needle) ||
        (row.seller ?? "").toLowerCase().includes(needle)
      );
    });
  }, [data.numbers, eventId, filter, query]);
  const totals = pixTotals(data.numbers);

  return (
    <Dialog open onClose={onClose} title={t.reviewTitle} description={t.reviewDescription} size="lg">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2 text-sm">
          <Badge tone="success">{t.receivedTotal(money(totals.received))}</Badge>
          {totals.pending > 0 && <Badge tone="warning">{t.pendingTotal(money(totals.pending))}</Badge>}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <span className="relative flex flex-1">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-fg-subtle" />
            <Input
              type="search"
              value={query}
              aria-label={t.search}
              placeholder={t.search}
              className="pl-10"
              onChange={(event) => {
                setQuery(event.target.value);
              }}
            />
          </span>
          <div role="radiogroup" aria-label={t.reviewTitle} className="flex shrink-0 rounded-full border border-border bg-surface-2 p-0.5">
            {(["pending", "paid", "all"] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={filter === option}
                onClick={() => {
                  setFilter(option);
                }}
                className={cn(
                  "relative min-h-9 rounded-full px-3.5 text-sm font-medium transition touch-target",
                  filter === option ? "bg-surface text-fg shadow-sm" : "text-fg-muted hover:text-fg active:text-fg",
                )}
              >
                {t.filters[option]}
              </button>
            ))}
          </div>
        </div>

        {data.numbers.length === 0 ? (
          <p className="py-8 text-center text-sm text-fg-muted">{t.empty}</p>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-fg-muted">{t.emptyFilter}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
            {rows.map((row) => {
              const label = ticketNumber(row.number);
              const busy = mark.isPending && mark.variables.numbers.includes(row.number);
              return (
                <li key={row.number} className="flex items-center gap-3 px-3 py-3">
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-mono text-base font-semibold text-fg tabular">{label}</span>
                      <span className="font-mono text-[11px] text-fg-subtle">{pixReference(eventId, row.number)}</span>
                    </span>
                    <span className="flex min-w-0 items-center gap-1.5 text-xs text-fg-muted">
                      <UserRound aria-hidden className="size-3.5 shrink-0" />
                      <span className="truncate">{row.buyer ?? t.buyerUnknown}</span>
                      {row.seller !== null && (
                        <>
                          <span aria-hidden>·</span>
                          <Store aria-hidden className="size-3.5 shrink-0" />
                          <span className="truncate">{row.seller}</span>
                        </>
                      )}
                    </span>
                    {row.receipt === null ? (
                      row.payee === "seller" && <span className="text-xs text-fg-subtle">{t.payeeSeller(row.seller ?? "")}</span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs font-medium text-success-fg">
                        <Check aria-hidden className="size-3.5" />
                        {row.receipt.receivedBy === "seller" ? t.receivedBySeller : t.receivedByOrganization}
                      </span>
                    )}
                  </span>
                  {/* On phones the amount sits above its button, so the number keeps the width. */}
                  <span className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                    <span className="text-sm font-semibold text-fg tabular">{row.amountCents === null ? "—" : money(row.amountCents)}</span>
                    {editable &&
                      (row.receipt === null ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={<Check />}
                          loading={busy}
                          aria-label={t.markPaidLabel(label)}
                          onClick={() => {
                            mark.mutate({ numbers: [row.number], paid: true });
                          }}
                        >
                          {t.markPaid}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<RotateCcw />}
                          loading={busy}
                          aria-label={t.undoPaidLabel(label)}
                          onClick={() => {
                            mark.mutate({ numbers: [row.number], paid: false });
                          }}
                        >
                          {t.undoPaid}
                        </Button>
                      ))}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Dialog>
  );
}

/** A seller's own Pix key (ADR 0085): their buyers pay them, and they confirm on their link. */
export function SellerPixDialog({ eventId, seller, onClose, onSaved }: { eventId: string; seller: SellerDto; onClose: () => void; onSaved: () => void }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const done = () => {
    void queryClient.invalidateQueries({ queryKey: eventPixKey(eventId) });
    onSaved();
    onClose();
  };
  const save = useMutation({
    mutationFn: (body: PixAccountBody) =>
      api<PixAccountDto>(`/api/sellers/${seller.id}/pix`, {
        method: "PUT",
        body,
      }),
    onSuccess: () => {
      toast.success(t.saved);
      done();
    },
  });
  const remove = useMutation({
    mutationFn: () => api(`/api/sellers/${seller.id}/pix`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success(t.removed);
      done();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <Dialog open onClose={onClose} title={t.sellerKeyTitle(seller.name)} description={t.sellerKeyDescription}>
      <PixAccountForm
        initial={seller.pix}
        defaultName={seller.name}
        saving={save.isPending}
        removing={remove.isPending}
        error={save.error}
        onSave={(body) => {
          save.mutate(body);
        }}
        onRemove={() => {
          void confirm({
            title: t.removeTitle,
            description: t.sellerRemoveBody,
            confirmLabel: t.remove,
          }).then((ok) => {
            if (ok) {
              remove.mutate();
            }
          });
        }}
      />
    </Dialog>
  );
}
