"use client";

import type { AccountDto, BatchDto, CheckoutDto, CreateBatchBody, EventDto, PricingDto } from "@ingressoimpresso/api-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CreditCard, FileDown, Layers, Lock, MoreHorizontal, Plus, RefreshCw, ShieldCheck, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";

import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorMessage,
  Field,
  Lead,
  LoadingBlock,
  NumberInput,
  Skeleton,
  Menu,
  MenuItem,
  Spinner,
  buttonClass,
  errorMessage,
  useConfirm,
  type Tone,
} from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { money, shortDateTime, ticketNumber } from "@/lib/format";
import { quote } from "@/lib/pricing";
import { useSession } from "@/lib/session";
import { texts } from "@/texts/pt-BR";

import type { SelectTab } from "./tabs";

const t = texts.event.batches;
const MAX_BATCH = 5_000;
/** How long to keep asking after the payer comes back (Pix may confirm a bit later). */
const RETURN_POLL_MS = 3_000;
const RETURN_POLL_FOR_MS = 3 * 60_000;
const PIX_POLL_MS = 10_000;

const STATUS_TONE: Record<BatchDto["status"], Tone> = {
  awaiting_payment: "warning",
  paid: "success",
  canceled: "neutral",
  refunded: "danger",
};

function quantityOf(batch: BatchDto): number {
  return batch.last - batch.first + 1;
}

function NewBatch({ eventId, pricing, nextNumber }: { eventId: string; pricing: PricingDto | undefined; nextNumber: number }) {
  const queryClient = useQueryClient();
  const account = useQuery({ queryKey: ["account"], queryFn: () => api<AccountDto>("/api/account") });
  const freeLeft = account.data?.freeTicketsLeft ?? 0;
  const [quantity, setQuantity] = useState(100);
  const [showTable, setShowTable] = useState(false);
  const valid = Number.isInteger(quantity) && quantity >= 1 && quantity <= MAX_BATCH;

  const create = useMutation({
    mutationFn: () => {
      const body: CreateBatchBody = { quantity };
      return api<BatchDto>(`/api/events/${eventId}/batches`, { method: "POST", body });
    },
    onSuccess: (batch) => {
      toast.success(
        batch.status === "paid" ? t.createdFreeToast : pricing?.onlinePayment === true ? t.createdToast : t.createdToastManual,
      );
      void queryClient.invalidateQueries({ queryKey: ["batches", eventId] });
      void queryClient.invalidateQueries({ queryKey: ["account"] });
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate();
  };
  const total = pricing !== undefined && valid ? quote(pricing, quantity, freeLeft) : null;
  const freeHere = valid ? Math.min(freeLeft, quantity) : 0;

  return (
    <Card>
      <CardHeader title={t.newBatch} icon={Plus} />
      {freeLeft > 0 && (
        <Alert tone="success" className="mb-5" title={t.freeTitle(freeLeft)}>
          {t.freeBody}
        </Alert>
      )}
      <form onSubmit={submit} className="grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
        <div className="flex flex-col gap-3">
          <Field label={t.quantity} hint={valid ? t.numbering(nextNumber, nextNumber + quantity - 1) : texts.errors.invalid_quantity}>
            <NumberInput value={quantity} step={1} min={1} max={MAX_BATCH} onChange={setQuantity} />
          </Field>
          <div className="flex flex-wrap gap-2">
            {t.presets.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  setQuantity(preset);
                }}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm font-medium tabular transition",
                  quantity === preset
                    ? "border-brand bg-brand-soft text-brand-soft-fg"
                    : "border-border text-fg-muted hover:border-border-strong hover:text-fg",
                )}
              >
                {preset.toLocaleString("pt-BR")}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-3 rounded-2xl bg-surface-2 p-4 md:min-w-64">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-sm text-fg-muted">{t.total}</span>
            {pricing === undefined ? (
              <Skeleton className="h-7 w-24" />
            ) : (
              <span className="text-2xl font-semibold tracking-tight text-fg tabular">
                {total === null ? "—" : total === 0 ? t.free : money(total)}
              </span>
            )}
          </div>
          {pricing !== undefined && total !== null && (
            <span className="flex flex-col gap-0.5 text-xs text-fg-muted">
              {freeHere > 0 && <span className="font-medium text-success-fg">{t.freeInBatch(freeHere)}</span>}
              {total > 0 &&
                (total === pricing.minimumCents
                  ? t.minimumApplied
                  : t.perTicket(money(Math.round(total / (quantity - freeHere)))))}
            </span>
          )}
          <Button type="submit" disabled={!valid} loading={create.isPending}>
            {create.isPending ? t.creating : total === 0 ? t.createFree : t.create}
          </Button>
        </div>
      </form>
      <ErrorMessage error={create.error} className="mt-4" />
      {pricing !== undefined && (
        <div className="mt-4 border-t border-border pt-4">
          <button
            type="button"
            className="text-sm font-medium text-brand hover:underline"
            aria-expanded={showTable}
            onClick={() => {
              setShowTable(!showTable);
            }}
          >
            {t.priceTable}
          </button>
          {showTable && (
            <ul className="mt-3 grid gap-2 text-sm text-fg-muted sm:grid-cols-2 animate-fade-in">
              {pricing.tiers.map((tier, index) => (
                <li key={tier.upTo} className="rounded-lg bg-surface-2 px-3 py-2 tabular">
                  {t.tier(index === 0 ? 1 : (pricing.tiers[index - 1]?.upTo ?? 0) + 1, tier.upTo, money(tier.unitCents))}
                </li>
              ))}
              <li className="rounded-lg bg-surface-2 px-3 py-2">{texts.landing.pricingMinimum(money(pricing.minimumCents))}</li>
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

function BatchRow({
  batch,
  digits,
  onlinePayment,
  isAdmin,
  eventId,
}: {
  batch: BatchDto;
  digits: number;
  onlinePayment: boolean;
  isAdmin: boolean;
  eventId: string;
}) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["batches", eventId] });

  const pay = useMutation({
    mutationFn: () => api<CheckoutDto>(`/api/batches/${batch.id}/checkout`, { method: "POST" }),
    onSuccess: (checkout) => {
      window.location.assign(checkout.url);
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
  const sync = useMutation({
    mutationFn: () => api<BatchDto>(`/api/batches/${batch.id}/checkout/sync`, { method: "POST" }),
    onSuccess: (updated) => {
      if (updated.status === "paid") {
        toast.success(t.paymentSuccess);
      } else {
        toast.info(t.paymentProcessing);
      }
      void refresh();
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
  const action = useMutation({
    mutationFn: (path: string) => api<BatchDto>(path, { method: "POST" }),
    onSuccess: (updated) => {
      if (updated.status === "canceled") {
        toast.success(t.canceledToast);
      }
      void refresh();
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });

  const cancel = async () => {
    if (await confirm({ title: t.cancelConfirmTitle, description: t.cancelConfirmBody, confirmLabel: t.cancelConfirm })) {
      action.mutate(`/api/batches/${batch.id}/cancel`);
    }
  };
  const markPaid = async () => {
    if (await confirm({ title: t.markPaidConfirmTitle, description: t.markPaidConfirmBody, confirmLabel: t.markPaid, danger: false })) {
      action.mutate(`/api/admin/batches/${batch.id}/mark-paid`);
    }
  };
  const awaiting = batch.status === "awaiting_payment";
  const pending = batch.pendingPayment;

  return (
    <li
      className={cn(
        "flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:px-5",
        batch.status === "canceled" && "opacity-60",
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <span
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-xl",
            batch.status === "paid" ? "bg-success-soft text-success-fg" : "bg-surface-2 text-fg-muted",
          )}
        >
          {batch.status === "paid" ? <CheckCircle2 className="size-5" aria-hidden /> : <Layers className="size-5" aria-hidden />}
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-mono text-[15px] font-semibold text-fg tabular">
            {ticketNumber(batch.first, digits)} – {ticketNumber(batch.last, digits)}
          </span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg-muted">
            {texts.common.tickets(quantityOf(batch))}
            <span aria-hidden>·</span>
            <span className="tabular">{money(batch.priceCents)}</span>
            {batch.paidAt !== null && (
              <>
                <span aria-hidden>·</span>
                {shortDateTime(batch.paidAt)}
              </>
            )}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        {awaiting && pending !== null ? (
          <Badge tone="brand" dot pulse>
            {t.pendingState[pending]}
          </Badge>
        ) : (
          <Badge tone={STATUS_TONE[batch.status]} dot>
            {batch.status === "paid" && batch.paidVia !== null ? t.paidVia[batch.paidVia] : t.status[batch.status]}
          </Badge>
        )}
        {awaiting && pending !== null && (
          <Button
            variant="secondary"
            size="sm"
            icon={<RefreshCw />}
            loading={sync.isPending}
            onClick={() => {
              sync.mutate();
            }}
          >
            {sync.isPending ? t.checking : t.checkPayment}
          </Button>
        )}
        {awaiting && onlinePayment && pending !== "processing" && (
          <Button
            size="sm"
            icon={<CreditCard />}
            loading={pay.isPending}
            onClick={() => {
              pay.mutate();
            }}
          >
            {pay.isPending ? t.redirecting : pending === "open" ? t.continuePayment : t.pay(money(batch.priceCents))}
          </Button>
        )}
        {awaiting && (
          <Menu
            label={t.moreActions}
            disabled={action.isPending}
            triggerClassName={buttonClass({ variant: "ghost", size: "icon" })}
            trigger={action.isPending ? <Spinner /> : <MoreHorizontal aria-hidden />}
          >
            {isAdmin && (
              <MenuItem icon={<ShieldCheck className="text-fg-muted" aria-hidden />} onSelect={() => void markPaid()}>
                {t.markPaid}
              </MenuItem>
            )}
            <MenuItem tone="danger" icon={<X aria-hidden />} onSelect={() => void cancel()}>
              {t.cancelBatch}
            </MenuItem>
          </Menu>
        )}
      </div>
    </li>
  );
}

/** Banner after coming back from Stripe (`?pagamento=sucesso|cancelado&lote=<id>`). */
function PaymentReturn({
  batches,
  eventId,
  onSelect,
}: {
  batches: BatchDto[];
  eventId: string;
  onSelect: SelectTab;
}) {
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const outcome = search.get("pagamento");
  const batchId = search.get("lote");
  const synced = useRef(false);
  const [waited, setWaited] = useState(false);
  const batch = batches.find((item) => item.id === batchId);

  const sync = useMutation({
    mutationFn: (id: string) => api<BatchDto>(`/api/batches/${id}/checkout/sync`, { method: "POST" }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["batches", eventId] }),
  });
  const { mutate } = sync;

  useEffect(() => {
    if (outcome === "sucesso" && batchId !== null && !synced.current) {
      synced.current = true;
      mutate(batchId);
    }
  }, [outcome, batchId, mutate]);

  // After a while, stop showing a spinner and offer to check again.
  useEffect(() => {
    if (outcome !== "sucesso") {
      return;
    }
    const timer = setTimeout(() => {
      setWaited(true);
    }, RETURN_POLL_FOR_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [outcome]);

  if ((outcome !== "sucesso" && outcome !== "cancelado") || batchId === null) {
    return null;
  }
  const dismiss = () => {
    const query = new URLSearchParams(search.toString());
    query.delete("pagamento");
    query.delete("lote");
    router.replace(`${pathname}?${query.toString()}`, { scroll: false });
  };
  const close = (
    <button type="button" aria-label={texts.common.close} onClick={dismiss} className="rounded-md opacity-70 hover:opacity-100">
      <X className="size-4" />
    </button>
  );

  if (outcome === "cancelado") {
    return (
      <Alert tone="warning" action={close}>
        {t.paymentCanceled}
      </Alert>
    );
  }
  if (batch === undefined || batch.status === "canceled") {
    return null;
  }
  if (batch.status === "paid") {
    return (
      <Alert
        tone="success"
        title={t.paymentSuccess}
        action={
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              icon={<FileDown />}
              onClick={() => {
                onSelect("files");
              }}
            >
              {t.goToFiles}
            </Button>
            {close}
          </div>
        }
      />
    );
  }
  const stillWaiting = waited || sync.isError;
  return (
    <Alert
      tone={sync.isError ? "warning" : "brand"}
      title={stillWaiting ? t.paymentNotConfirmed : undefined}
      action={
        <div className="flex items-center gap-3">
          {stillWaiting ? (
            <Button
              size="sm"
              variant="secondary"
              icon={<RefreshCw />}
              loading={sync.isPending}
              onClick={() => {
                sync.mutate(batch.id);
              }}
            >
              {t.checkPayment}
            </Button>
          ) : (
            <Spinner className="mt-0.5" />
          )}
          {close}
        </div>
      }
    >
      {sync.isError ? errorMessage(sync.error) : batch.pendingPayment === "processing" ? t.pixProcessing : t.paymentProcessing}
    </Alert>
  );
}

export function BatchesTab({ eventId, onSelect }: { eventId: string; onSelect: SelectTab }) {
  const { session } = useSession();
  const search = useSearchParams();
  const isAdmin = session.status === "signed-in" && session.user.isAdmin;
  const returnedBatch = search.get("pagamento") === "sucesso" ? search.get("lote") : null;
  const pollUntil = useRef<number | null>(null);
  const pricing = useQuery({ queryKey: ["pricing"], queryFn: () => api<PricingDto>("/api/pricing"), staleTime: 60 * 60_000 });
  const event = useQuery({ queryKey: ["event", eventId], queryFn: () => api<EventDto>(`/api/events/${eventId}`) });
  const closed = event.data?.status === "closed";
  const batches = useQuery({
    queryKey: ["batches", eventId],
    queryFn: () => api<BatchDto[]>(`/api/events/${eventId}/batches`),
    // After the return from Stripe, wait for the webhook (Pix may take a moment).
    refetchInterval: (query) => {
      const data = query.state.data ?? [];
      const waitingReturn =
        returnedBatch !== null &&
        Date.now() < (pollUntil.current ??= Date.now() + RETURN_POLL_FOR_MS) &&
        data.find((batch) => batch.id === returnedBatch)?.status === "awaiting_payment";
      // A Pix being confirmed settles in seconds to minutes: keep the row up to date.
      const pix = data.some((batch) => batch.pendingPayment === "processing");
      return waitingReturn ? RETURN_POLL_MS : pix ? PIX_POLL_MS : false;
    },
  });
  const digits = 4;
  const list = batches.data ?? [];
  const nextNumber = list.filter((batch) => batch.status !== "canceled").reduce((max, batch) => Math.max(max, batch.last + 1), 1);
  const onlinePayment = pricing.data?.onlinePayment ?? false;
  const hasUnpaid = list.some((batch) => batch.status === "awaiting_payment");

  return (
    <div className="flex flex-col gap-6">
      <Lead>{t.intro}</Lead>
      <PaymentReturn batches={list} eventId={eventId} onSelect={onSelect} />
      {closed ? (
        <Alert tone="warning">{texts.event.actions.archivedNote}</Alert>
      ) : (
        <NewBatch eventId={eventId} pricing={pricing.data} nextNumber={nextNumber} />
      )}
      {pricing.data !== undefined && !onlinePayment && hasUnpaid && !isAdmin && <Alert tone="warning">{t.paymentDisabled}</Alert>}
      {batches.isPending ? (
        <LoadingBlock rows={2} />
      ) : batches.isError ? (
        <ErrorMessage error={batches.error} />
      ) : list.length === 0 ? (
        <EmptyState icon={Layers} title={t.emptyTitle} description={t.empty} />
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-xs">
          {list.map((batch) => (
            <BatchRow
              key={batch.id}
              batch={batch}
              digits={digits}
              onlinePayment={onlinePayment}
              isAdmin={isAdmin}
              eventId={eventId}
            />
          ))}
        </ul>
      )}
      {onlinePayment && (
        <p className="flex items-center justify-center gap-2 text-xs text-fg-subtle">
          <Lock className="size-3.5" aria-hidden />
          {t.secure}
        </p>
      )}
    </div>
  );
}
