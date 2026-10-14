"use client";

import type {
  AssignRemainingBody,
  AvailableNumbersDto,
  CategoryDto,
  EventDto,
  EventReportDto,
  RangeBody,
  RangeDto,
  ReportRowDto,
  ReservationDto,
  SellerBody,
  SellerDto,
  SellerLinkDto,
  SellerPaymentDto,
  SellerSettingsBody,
  SellerSettingsDto,
  TicketSaleDto,
  VoidDto,
} from "@ingressoimpresso/api-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Banknote,
  BookmarkPlus,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  CircleHelp,
  Copy,
  ExternalLink,
  HandCoins,
  Link2,
  Link2Off,
  MessageCircle,
  MoreHorizontal,
  PackageX,
  Phone,
  Plus,
  QrCode,
  RefreshCw,
  RotateCcw,
  Store,
  Tag,
  Ticket,
  Trash2,
  Undo2,
  UserPlus,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";

import { ReadOnlyNotice, useEventAccess } from "@/components/event/access";
import { GoalDialog, GoalLine, RankingCard, ReserveDialog, SellerReservations } from "@/components/event/seller-extras";
import { PaymentDialog, ReturnDialog } from "@/components/event/settlement-dialogs";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  ErrorMessage,
  Field,
  Input,
  Lead,
  LoadingBlock,
  Menu,
  MenuItem,
  Select,
  Skeleton,
  Stat,
  Switch,
  buttonClass,
  errorMessage,
  useConfirm,
  type Tone,
} from "@/components/ui";
import { api, isUuid } from "@/lib/api";
import { cn } from "@/lib/cn";
import { initials, money, shortDateTime, ticketNumber } from "@/lib/format";
import { NUMBER_LIST_INPUT, countNumbers, formatRanges, intersect, parseNumberList, type NumberRange } from "@/lib/number-list";
import { receivedPercent, settlementMessage, settlementState, settlementTotals, shortDay, whatsappLink, type SettlementState } from "@/lib/settlement";
import { common as commonTexts, errors as errorsTexts, event as eventTexts } from "@/texts/pt-BR";

const t = eventTexts.sellers;

type AssignMode = "pick" | "rest";

/**
 * Gives a seller numbers: a list typed or picked from the free ranges ("12, 15, 40-50"), or
 * every number still free at once, optionally of one category (the usual for the box office,
 * which sells whatever the sellers did not take).
 */
function AssignForm({ seller, event, onDone, onCancel }: { seller: SellerDto; event: EventDto; onDone: () => void; onCancel: () => void }) {
  const [mode, setMode] = useState<AssignMode>(seller.boxOffice ? "rest" : "pick");
  const [text, setText] = useState("");
  const [category, setCategory] = useState("");
  const categories = useQuery({
    queryKey: ["categories", event.id],
    queryFn: () => api<CategoryDto[]>(`/api/events/${event.id}/categories`),
  });
  const available = useQuery({
    queryKey: ["available-numbers", event.id, mode === "rest" ? category : ""],
    queryFn: () => {
      const query = mode === "rest" && category !== "" && isUuid(category) ? `?category=${category}` : "";
      return api<AvailableNumbersDto>(`/api/events/${event.id}/available-numbers${query}`);
    },
  });
  const parsed = parseNumberList(text);
  const assign = useMutation({
    mutationFn: async () => {
      if (mode === "rest") {
        const body: AssignRemainingBody = { categoryId: category === "" ? null : category };
        const created = await api<RangeDto[]>(`/api/sellers/${seller.id}/ranges/remaining`, { method: "POST", body });
        return countNumbers(created);
      }
      if (!parsed.ok) {
        return 0;
      }
      for (const range of parsed.ranges) {
        const body: RangeBody = range;
        await api<RangeDto>(`/api/sellers/${seller.id}/ranges`, { method: "POST", body });
      }
      return parsed.count;
    },
    onSuccess: (count) => {
      toast.success(t.assignedCount(count));
      onDone();
    },
    // A list stops at the first taken number: what went through is shown.
    onError: onDone,
  });
  const free = available.data;
  const restCount = free?.count ?? 0;
  const valid = mode === "rest" ? restCount > 0 : parsed.ok && parsed.count > 0;
  const submit = (formEvent: FormEvent) => {
    formEvent.preventDefault();
    if (valid) {
      assign.mutate();
    }
  };
  const append = (range: NumberRange) => {
    const piece = range.first === range.last ? String(range.first) : `${String(range.first)}-${String(range.last)}`;
    setText((current) => (current.trim() === "" ? piece : `${current.trim().replace(/,$/, "")}, ${piece}`));
  };
  const modes: { value: AssignMode; label: string }[] = [
    { value: "pick", label: t.assignPick },
    { value: "rest", label: t.assignRest },
  ];

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-xl bg-surface-2 p-3 animate-fade-in sm:p-4">
      <div role="radiogroup" aria-label={t.assign} className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-surface p-1">
        {modes.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={mode === option.value}
            onClick={() => {
              setMode(option.value);
            }}
            className={cn(
              "min-h-9 rounded-lg px-3 text-sm font-medium transition pointer-coarse:min-h-11",
              mode === option.value ? "bg-brand-soft text-brand-soft-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg active:bg-surface-2",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {mode === "pick" ? (
        <>
          <Field label={t.assignNumbers} hint={t.assignNumbersHint}>
            <Input
              value={text}
              placeholder={free?.ranges[0] === undefined ? "1-50" : `${String(free.ranges[0].first)}-${String(free.ranges[0].last)}`}
              autoFocus
              {...NUMBER_LIST_INPUT}
              onChange={(changeEvent) => {
                setText(changeEvent.target.value);
              }}
            />
          </Field>
          {free !== undefined && free.ranges.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-fg-muted">{t.assignFree(free.count)}</span>
              <div className="flex flex-wrap gap-1.5">
                {free.ranges.slice(0, FREE_CHIPS).map((range) => (
                  <button
                    key={range.first}
                    type="button"
                    aria-label={t.assignAdd(formatRanges([range]))}
                    onClick={() => {
                      append(range);
                    }}
                    className="relative inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1 font-mono text-xs text-fg tabular transition touch-target hover:border-brand hover:text-brand active:bg-brand-soft"
                  >
                    <Plus className="size-3" aria-hidden />
                    {formatRanges([range])}
                  </button>
                ))}
                {free.ranges.length > FREE_CHIPS && (
                  <span className="self-center text-xs text-fg-subtle">{t.assignMoreRanges(free.ranges.length - FREE_CHIPS)}</span>
                )}
              </div>
            </div>
          )}
          {text.trim() !== "" && !parsed.ok && <p className="text-xs text-danger-fg">{errorsTexts.invalid_range}</p>}
          {parsed.ok && parsed.count > 0 && <p className="text-xs text-fg-muted">{commonTexts.tickets(parsed.count)}</p>}
        </>
      ) : (
        <>
          {(categories.data ?? []).length > 0 && (
            <Field label={t.assignCategory}>
              <Select
                value={category}
                onChange={(changeEvent) => {
                  setCategory(changeEvent.target.value);
                }}
              >
                <option value="">{t.assignAllCategories}</option>
                {(categories.data ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {available.isPending ? (
            <Skeleton className="h-12" />
          ) : restCount === 0 ? (
            <p className="text-sm text-fg-muted">{t.assignNoneFree}</p>
          ) : (
            <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface px-3 py-2.5">
              <span className="text-sm font-semibold text-fg">{t.assignRestSummary(restCount)}</span>
              <span className="text-xs leading-relaxed break-words text-fg-muted tabular">
                {formatRanges((free?.ranges ?? []).slice(0, 8))}
                {(free?.ranges.length ?? 0) > 8 && " …"}
              </span>
            </div>
          )}
          <p className="text-xs leading-relaxed text-fg-muted">{t.assignRestHint}</p>
        </>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onCancel}>
          {commonTexts.cancel}
        </Button>
        <Button type="submit" loading={assign.isPending} disabled={!valid}>
          {mode === "rest" && restCount > 0 ? t.assignRestButton(restCount) : t.assign}
        </Button>
      </div>
      <ErrorMessage error={assign.error} />
    </form>
  );
}

/** Free ranges offered as shortcuts in the assign form. */
const FREE_CHIPS = 12;

const STATE_TONE: Record<SettlementState["kind"], Tone> = {
  empty: "neutral",
  no_price: "neutral",
  settled: "success",
  owing: "warning",
  overpaid: "brand",
};

function stateLabel(state: SettlementState): string {
  switch (state.kind) {
    case "empty":
      return t.state.empty;
    case "no_price":
      return t.state.noPrice;
    case "settled":
      return t.state.settled;
    case "owing":
      return t.state.owing(money(state.cents));
    case "overpaid":
      return t.state.overpaid(money(state.cents));
  }
}

/** "Levou 40 − Devolveu 5 − Perdeu 1 = Acerta 34", as chips; "Levou 20 → Entraram 8" at the box office. */
function Equation({ row }: { row: ReportRowDto }) {
  const part = (label: string, value: number, strong = false) => (
    <span
      className={cn(
        "flex min-w-0 flex-col items-center rounded-lg px-2 py-1.5 leading-tight",
        strong ? "bg-brand-soft text-brand-soft-fg" : "bg-surface-2",
      )}
    >
      {/* A zero is quieter than a number that counts, but still readable. */}
      <span className={cn("text-base font-semibold tabular", !strong && value === 0 && "text-fg-subtle")}>{value.toLocaleString("pt-BR")}</span>
      <span className="text-[11px] font-medium text-fg-muted">{label}</span>
    </span>
  );
  const sign = (text: string) => (
    <span aria-hidden className="text-sm font-medium text-fg-subtle">
      {text}
    </span>
  );
  if (row.boxOffice) {
    return (
      <div
        role="img"
        aria-label={t.boxOffice.equationLabel(row.tickets, row.declaredSold)}
        className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-1 text-center"
      >
        {part(t.equation.took, row.tickets)}
        {sign("→")}
        {part(t.boxOffice.entered, row.declaredSold)}
        {sign("=")}
        {part(t.equation.due, row.declaredSold, true)}
      </div>
    );
  }
  return (
    <div
      role="img"
      aria-label={t.equationLabel(row.tickets, row.unsold, row.lost, row.declaredSold)}
      className="grid grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] items-center gap-1 text-center"
    >
      {part(t.equation.took, row.tickets)}
      {sign("−")}
      {part(t.equation.unsold, row.unsold)}
      {sign("−")}
      {part(t.equation.lost, row.lost)}
      {sign("=")}
      {part(t.equation.due, row.declaredSold, true)}
    </div>
  );
}

function StateBadge({ state }: { state: SettlementState }) {
  if (state.kind === "empty" || state.kind === "no_price") {
    return null;
  }
  return (
    <Badge tone={STATE_TONE[state.kind]} dot={state.kind === "owing"}>
      {state.kind === "settled" && <CheckCircle2 aria-hidden className="size-3.5" />}
      {stateLabel(state)}
    </Badge>
  );
}

function MoneyBar({ row }: { row: ReportRowDto }) {
  const state = settlementState(row);
  const percent = receivedPercent(row);
  if (row.amountDueCents === null) {
    return <p className="text-sm text-fg-muted">{t.receivedOnly(money(row.receivedCents))}</p>;
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-fg-muted">
          <span className="font-semibold text-fg tabular">{money(row.receivedCents)}</span>
          <span className="tabular"> / {money(row.amountDueCents)}</span>
        </span>
        <StateBadge state={state} />
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={t.progressLabel(money(row.receivedCents), money(row.amountDueCents))}
        className="h-2 overflow-hidden rounded-full bg-surface-3"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500",
            state.kind === "settled" || state.kind === "overpaid" ? "bg-success" : "bg-brand",
          )}
          style={{ width: `${String(percent)}%` }}
        />
      </div>
    </div>
  );
}

const METHOD_ICONS: Record<SellerPaymentDto["method"], LucideIcon> = { pix: QrCode, cash: Banknote, other: CircleHelp };

type HistoryItem =
  | { kind: "payment"; key: string; sort: string; payment: SellerPaymentDto }
  | { kind: "return"; key: string; sort: string; item: VoidDto; numbers: NumberRange[]; whole: boolean };

function History({
  seller,
  payments,
  voids,
  editable,
  onChange,
}: {
  seller: SellerDto;
  payments: readonly SellerPaymentDto[];
  voids: readonly VoidDto[];
  /** Whether the user takes care of the money (ADR 0055): only then can entries be undone. */
  editable: boolean;
  onChange: () => void;
}) {
  const confirm = useConfirm();
  const holding = seller.ranges.map(({ first, last }) => ({ first, last }));
  const items: HistoryItem[] = [
    ...payments.map((payment): HistoryItem => ({ kind: "payment", key: payment.id, sort: `${payment.receivedOn}T${payment.createdAt}`, payment })),
    ...voids.flatMap((item): HistoryItem[] => {
      if (item.undoneAt !== null || item.reason === "revoked") {
        return [];
      }
      const numbers = intersect([{ first: item.first, last: item.last }], holding);
      if (numbers.length === 0) {
        return [];
      }
      const whole = countNumbers(numbers) === item.last - item.first + 1;
      return [{ kind: "return", key: item.id, sort: item.createdAt, item, numbers, whole }];
    }),
  ].sort((a, b) => b.sort.localeCompare(a.sort));

  const removePayment = useMutation({
    mutationFn: (id: string) => api<undefined>(`/api/seller-payments/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success(t.paymentDeletedToast);
      onChange();
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
  const undo = useMutation({
    mutationFn: (id: string) => api<VoidDto>(`/api/voids/${id}/undo`, { method: "POST" }),
    onSuccess: () => {
      toast.success(t.returnUndoneToast);
      onChange();
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });

  if (items.length === 0) {
    return <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm text-fg-muted animate-fade-in">{t.historyEmpty}</p>;
  }
  return (
    <ul className="flex flex-col divide-y divide-border rounded-xl border border-border animate-fade-in">
      {items.map((entry) => {
        if (entry.kind === "payment") {
          const { payment } = entry;
          const Icon = METHOD_ICONS[payment.method];
          const amount = money(payment.amountCents);
          return (
            <li key={entry.key} className="flex items-center gap-3 px-3 py-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-success-soft text-success-fg">
                <Icon aria-hidden className="size-4" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-medium text-fg tabular">{t.historyPayment(amount)}</span>
                <span className="truncate text-xs text-fg-muted">
                  {t.methods[payment.method]} · {shortDay(payment.receivedOn)}
                  {payment.note !== null && ` · ${payment.note}`}
                </span>
              </span>
              {editable && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t.deletePayment(amount)}
                loading={removePayment.isPending && removePayment.variables === payment.id}
                onClick={() => {
                  void confirm({ title: t.deletePaymentTitle(amount), description: t.deletePaymentBody, confirmLabel: t.deletePaymentConfirm }).then(
                    (ok) => {
                      if (ok) {
                        removePayment.mutate(payment.id);
                      }
                    },
                  );
                }}
              >
                <Trash2 />
              </Button>
              )}
            </li>
          );
        }
        const { item, numbers, whole } = entry;
        const label = formatRanges(numbers);
        const reason = item.reason === "lost" ? "lost" : "unsold";
        return (
          <li key={entry.key} className="flex items-center gap-3 px-3 py-2.5">
            <span
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-full",
                reason === "lost" ? "bg-danger-soft text-danger-fg" : "bg-surface-2 text-fg-muted",
              )}
            >
              {reason === "lost" ? <PackageX aria-hidden className="size-4" /> : <Undo2 aria-hidden className="size-4" />}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-medium [overflow-wrap:anywhere] text-fg">
                {t.historyReturn(reason, label)} <span className="font-normal text-fg-muted">· {commonTexts.tickets(countNumbers(numbers))}</span>
              </span>
              <span className="truncate text-xs text-fg-muted">
                {shortDay(item.createdAt.slice(0, 10))}
                {item.note !== null && ` · ${item.note}`}
                {!whole && ` · ${t.returnPartial}`}
              </span>
            </span>
            {editable && whole && !item.locked && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t.undoReturn}
                loading={undo.isPending && undo.variables === item.id}
                onClick={() => {
                  void confirm({ title: t.undoReturnTitle(label), description: t.undoReturnBody, confirmLabel: t.undoReturnConfirm, danger: false }).then(
                    (ok) => {
                      if (ok) {
                        undo.mutate(item.id);
                      }
                    },
                  );
                }}
              >
                <RotateCcw />
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** The seller's private link (ADR 0053): create it, send it, copy it. */
function SellerLink({ seller, event, onChange }: { seller: SellerDto; event: EventDto; onChange: () => void }) {
  const l = t.link;
  const confirm = useConfirm();
  const create = useMutation({
    mutationFn: () => api<SellerLinkDto>(`/api/sellers/${seller.id}/link`, { method: "POST" }),
    onSuccess: (_, regenerate: boolean) => {
      toast.success(regenerate ? l.regeneratedToast : l.createdToast);
      onChange();
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
  const revoke = useMutation({
    mutationFn: () => api<undefined>(`/api/sellers/${seller.id}/link`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success(l.revokedToast);
      onChange();
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
  const link = seller.link;
  const firstName = seller.name.trim().split(/\s+/)[0] ?? seller.name;

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-surface-2 p-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg",
            link === null ? "bg-surface-3 text-fg-subtle" : "bg-brand-soft text-brand-soft-fg",
          )}
        >
          <Link2 aria-hidden className="size-4" />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-sm font-medium text-fg">{l.title}</span>
          <span className="text-xs leading-relaxed text-fg-muted">
            {link === null ? l.none : link.lastOpenedAt === null ? l.neverOpened : l.openedAt(shortDateTime(link.lastOpenedAt))}
          </span>
        </span>
      </div>
      {link === null ? (
        <Button variant="secondary" size="sm" icon={<Link2 />} loading={create.isPending} onClick={() => { create.mutate(false); }}>
          {l.create}
        </Button>
      ) : (
        <div className="flex items-center gap-1.5">
          <a
            href={whatsappLink(seller.phone, l.message(firstName, event.name, link.url))}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={l.sendLabel(seller.name)}
            className={buttonClass({ size: "sm", className: "bg-success-solid shadow-none hover:bg-success-solid/90" })}
          >
            <MessageCircle aria-hidden />
            {l.send}
          </a>
          <Button
            variant="secondary"
            size="sm"
            icon={<Copy />}
            onClick={() => {
              void navigator.clipboard.writeText(link.url).then(
                () => toast.success(l.copied),
                () => toast.error(errorsTexts.generic),
              );
            }}
          >
            {l.copy}
          </Button>
          <Menu
            label={l.title}
            trigger={<MoreHorizontal />}
            triggerClassName={buttonClass({ variant: "ghost", size: "icon-sm" })}
          >
            <MenuItem
              icon={<ExternalLink />}
              onSelect={() => {
                window.open(link.url, "_blank", "noopener,noreferrer");
              }}
            >
              {l.open}
            </MenuItem>
            <MenuItem
              icon={<RefreshCw />}
              onSelect={() => {
                void confirm({ title: l.regenerateTitle, description: l.regenerateBody, confirmLabel: l.regenerate, danger: false }).then((ok) => {
                  if (ok) {
                    create.mutate(true);
                  }
                });
              }}
            >
              {l.regenerate}
            </MenuItem>
            <MenuItem
              icon={<Link2Off />}
              tone="danger"
              onSelect={() => {
                void confirm({ title: l.revokeTitle, description: l.revokeBody, confirmLabel: l.revoke }).then((ok) => {
                  if (ok) {
                    revoke.mutate();
                  }
                });
              }}
            >
              {l.revoke}
            </MenuItem>
          </Menu>
        </div>
      )}
    </div>
  );
}

/**
 * Whether the seller still holds a number to reserve: paid, not given back, lost or canceled, not
 * sold nor reserved yet (ADR 0072). Before the report loads, having numbers is enough.
 */
function canReserve(seller: SellerDto, row: ReportRowDto | undefined): boolean {
  if (seller.ranges.length === 0) {
    return false;
  }
  return row === undefined || row.tickets - row.unsold - row.lost - row.revoked - row.markedSold - row.reserved > 0;
}

function SellerCard({
  seller,
  row,
  payments,
  voids,
  sales,
  reservations,
  allReservations,
  event,
  onChange,
}: {
  seller: SellerDto;
  row: ReportRowDto | undefined;
  payments: readonly SellerPaymentDto[];
  voids: readonly VoidDto[];
  sales: readonly TicketSaleDto[];
  /** This seller's reservations (ADR 0072). */
  reservations: readonly ReservationDto[];
  /** Every reservation of the event (numbers taken). */
  allReservations: readonly ReservationDto[];
  event: EventDto;
  onChange: () => void;
}) {
  const confirm = useConfirm();
  const { can } = useEventAccess();
  const delivery = can("delivery");
  const cash = can("money");
  const [assigning, setAssigning] = useState(false);
  const [dialog, setDialog] = useState<"payment" | "return" | "goal" | "reserve" | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const remove = useMutation({
    mutationFn: (path: string) => api<undefined>(path, { method: "DELETE" }),
    onSuccess: onChange,
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
  const boxOffice = useMutation({
    mutationFn: (on: boolean) => {
      const body: SellerBody = { name: seller.name, phone: seller.phone, boxOffice: on };
      return api<undefined>(`/api/sellers/${seller.id}`, { method: "PUT", body });
    },
    onSuccess: (_, on) => {
      toast.success(t.boxOffice.saved(on));
      onChange();
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
  const total = seller.ranges.reduce((sum, range) => sum + range.last - range.first + 1, 0);
  const historyCount =
    payments.length +
    voids.filter(
      (item) =>
        item.undoneAt === null && item.reason !== "revoked" && intersect([{ first: item.first, last: item.last }], seller.ranges).length > 0,
    ).length;
  const message =
    row === undefined
      ? ""
      : settlementMessage({ seller: seller.name, eventName: event.name, ranges: seller.ranges, row, priceCents: event.ticketPriceCents });

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand-soft-fg">
            {initials(seller.name)}
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate font-semibold text-fg">{seller.name}</span>
              {seller.boxOffice && (
                <Badge tone="brand" className="shrink-0">
                  <Store className="size-3" aria-hidden />
                  {t.boxOffice.badge}
                </Badge>
              )}
            </span>
            <span className="flex min-w-0 items-center gap-1.5 text-sm text-fg-muted">
              {seller.phone !== null && (
                <>
                  <Phone className="size-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{seller.phone}</span>
                </>
              )}
              {/* With numbers, "Levou" below already says how many. */}
              {seller.phone !== null && total > 0 ? null : (
                <span className="whitespace-nowrap">
                  {seller.phone !== null && <span aria-hidden>· </span>}
                  {t.ticketsCount(total)}
                </span>
              )}
            </span>
          </div>
        </div>
        {(delivery || (row !== undefined && total > 0)) && (
        <div className="flex shrink-0 items-center">
          <Menu
            label={t.menu(seller.name)}
            trigger={<MoreHorizontal />}
            triggerClassName={buttonClass({ variant: "ghost", size: "icon-sm" })}
          >
            {row !== undefined && total > 0 && (
              <>
                <MenuItem
                  icon={<MessageCircle />}
                  onSelect={() => {
                    window.open(whatsappLink(seller.phone, message), "_blank", "noopener,noreferrer");
                  }}
                >
                  {t.share}
                </MenuItem>
                <MenuItem
                  icon={<Copy />}
                  onSelect={() => {
                    void navigator.clipboard.writeText(message).then(
                      () => toast.success(t.summaryCopied),
                      () => toast.error(errorsTexts.generic),
                    );
                  }}
                >
                  {t.copySummary}
                </MenuItem>
              </>
            )}
            {/* The box office changes what the seller owes: the money part's call (ADR 0069). */}
            {delivery && cash && (
              <MenuItem
                icon={<Store />}
                onSelect={() => {
                  boxOffice.mutate(!seller.boxOffice);
                }}
              >
                {seller.boxOffice ? t.boxOffice.turnOff : t.boxOffice.turnOn}
              </MenuItem>
            )}
            {delivery && (
            <MenuItem
              icon={<Trash2 />}
              tone="danger"
              onSelect={() => {
                void confirm({ title: t.removeConfirmTitle(seller.name), description: t.removeConfirmBody, confirmLabel: commonTexts.remove }).then(
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
              {t.remove}
            </MenuItem>
            )}
          </Menu>
        </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {seller.ranges.length === 0 && <span className="text-sm text-fg-subtle">{t.noRanges}</span>}
        {seller.ranges.map((range) => {
          const label = formatRanges([range]);
          return (
            <span
              key={range.id}
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-2 py-1 pr-1 pl-2.5 font-mono text-sm text-fg tabular"
            >
              {ticketNumber(range.first)}–{ticketNumber(range.last)}
              {delivery && (
              <button
                type="button"
                aria-label={t.removeRange(label)}
                className="relative flex size-5 items-center justify-center rounded-md text-fg-subtle transition touch-target hover:bg-danger-soft hover:text-danger-fg active:bg-danger-soft active:text-danger-fg"
                onClick={() => {
                  void confirm({ title: t.removeRangeConfirmTitle(label), description: t.removeRangeConfirmBody, confirmLabel: commonTexts.remove }).then(
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
              )}
            </span>
          );
        })}
        {delivery && !assigning && (
          <Button
            variant={seller.ranges.length === 0 ? "secondary" : "ghost"}
            size="sm"
            icon={<Plus />}
            onClick={() => {
              setAssigning(true);
            }}
          >
            {seller.ranges.length === 0 ? t.assign : t.assignMore}
          </Button>
        )}
      </div>
      {assigning && (
        <AssignForm
          seller={seller}
          event={event}
          onDone={() => {
            setAssigning(false);
            onChange();
          }}
          onCancel={() => {
            setAssigning(false);
          }}
        />
      )}

      {total > 0 &&
        (row === undefined ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <div className="flex flex-col gap-4 border-t border-border pt-4">
            <Equation row={row} />
            {!row.boxOffice && (seller.link !== null || row.markedSold > 0) && (
              <p className="flex items-center gap-2 text-sm text-fg-muted">
                <CheckCircle2 aria-hidden className="size-4 shrink-0 text-brand" />
                {t.marked(row.markedSold, row.declaredSold)}
              </p>
            )}
            {!row.boxOffice && (
              <GoalLine
                seller={seller}
                sold={row.markedSold}
                editable={delivery}
                onEdit={() => {
                  setDialog("goal");
                }}
              />
            )}
            {!row.boxOffice && (
              <SellerReservations seller={seller} event={event} reservations={reservations} editable={delivery} onChange={onChange} />
            )}
            <MoneyBar row={row} />
            <div className="flex flex-wrap items-center gap-2">
              {cash && (
              <>
              <Button
                size="sm"
                icon={<HandCoins />}
                className="flex-1 sm:flex-none"
                onClick={() => {
                  setDialog("payment");
                }}
              >
                {t.pay}
              </Button>
              {!seller.boxOffice && (
              <Button
                variant="secondary"
                size="sm"
                icon={<Undo2 />}
                className="flex-1 sm:flex-none"
                onClick={() => {
                  setDialog("return");
                }}
              >
                {t.giveBack}
              </Button>
              )}
              </>
              )}
              {delivery && !seller.boxOffice && event.change.canceledAt === null && canReserve(seller, row) && (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<BookmarkPlus />}
                  className="flex-1 sm:flex-none"
                  onClick={() => {
                    setDialog("reserve");
                  }}
                >
                  {t.reservations.new}
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                aria-expanded={showHistory}
                className="w-full sm:ml-auto sm:w-auto"
                onClick={() => {
                  setShowHistory(!showHistory);
                }}
              >
                {historyCount > 0 ? t.historyCount(historyCount) : t.history}
                <ChevronDown aria-hidden className={cn("transition-transform", showHistory && "rotate-180")} />
              </Button>
            </div>
            {showHistory && <History seller={seller} payments={payments} voids={voids} editable={cash} onChange={onChange} />}
          </div>
        ))}

      {seller.boxOffice && (
        <p className="flex items-start gap-2.5 rounded-xl bg-brand-soft px-3.5 py-3 text-sm leading-relaxed text-brand-soft-fg">
          <Store aria-hidden className="mt-0.5 size-4 shrink-0" />
          {t.boxOffice.toggleOn}
        </p>
      )}

      {delivery && total > 0 && <SellerLink seller={seller} event={event} onChange={onChange} />}

      <PaymentDialog
        open={dialog === "payment"}
        onClose={() => {
          setDialog(null);
        }}
        seller={seller}
        row={row}
        priceCents={event.ticketPriceCents}
        onSaved={onChange}
      />
      <ReturnDialog
        open={dialog === "return"}
        onClose={() => {
          setDialog(null);
        }}
        seller={seller}
        voids={voids}
        sales={sales}
        reservations={reservations}
        onSaved={onChange}
      />
      {dialog === "goal" && (
        <GoalDialog
          open
          onClose={() => {
            setDialog(null);
          }}
          seller={seller}
          onSaved={onChange}
        />
      )}
      <ReserveDialog
        open={dialog === "reserve"}
        onClose={() => {
          setDialog(null);
        }}
        seller={seller}
        event={event}
        reservations={allReservations}
        onSaved={onChange}
      />
    </Card>
  );
}

/** The whole event at a glance: what sellers owe, what came in, what is missing. */
function SettlementSummary({ rows }: { rows: readonly ReportRowDto[] }) {
  const s = t.summary;
  const totals = settlementTotals(rows);
  const percent = receivedPercent({ amountDueCents: totals.dueCents, receivedCents: totals.receivedCents });
  return (
    <Card>
      <CardHeader title={t.summaryTitle} description={t.summaryHint} icon={Wallet} />
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <Stat label={s.due} value={money(totals.dueCents)} hint={s.dueHint} icon={CircleDollarSign} />
          <Stat label={s.received} value={money(totals.receivedCents)} hint={s.receivedHint(percent)} icon={HandCoins} tone="success" />
          <Stat
            label={s.outstanding}
            value={money(totals.outstandingCents)}
            hint={
              totals.overpaidCents > 0
                ? s.overpaidHint(money(totals.overpaidCents))
                : totals.outstandingCents === 0 && totals.active > 0
                  ? s.outstandingDone
                  : undefined
            }
            icon={Wallet}
            tone={totals.outstandingCents === 0 ? "success" : "warning"}
          />
          <Stat label={s.settled} value={s.settledValue(totals.settled, totals.active)} icon={CheckCircle2} tone="success" />
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label={t.progressLabel(money(totals.receivedCents), money(totals.dueCents))}
          className="h-2.5 overflow-hidden rounded-full bg-surface-3"
        >
          <div
            className={cn("h-full rounded-full transition-[width] duration-500", percent >= 100 ? "bg-success" : "bg-brand")}
            style={{ width: `${String(percent)}%` }}
          />
        </div>
      </div>
    </Card>
  );
}

const HOW_ICONS: readonly LucideIcon[] = [UserPlus, Ticket, HandCoins, CheckCircle2];

/** Four steps, for an event without sellers yet. */
/** Whether sellers send digital tickets from their page (ADR 0061). */
function SellerSettings({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient();
  const key = ["seller-settings", eventId];
  const settings = useQuery({ queryKey: key, queryFn: () => api<SellerSettingsDto>(`/api/events/${eventId}/seller-settings`) });
  const save = useMutation({
    mutationFn: (body: SellerSettingsBody) => api<SellerSettingsDto>(`/api/events/${eventId}/seller-settings`, { method: "PUT", body }),
    onSuccess: (saved) => {
      queryClient.setQueryData(key, saved);
      toast.success(t.sendTicketsSaved(saved.sendTickets));
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
  if (settings.data === undefined) {
    return null;
  }
  const on = save.isPending ? (save.variables.sendTickets ?? settings.data.sendTickets) : settings.data.sendTickets;
  return (
    <Card>
      <Switch
        checked={on}
        onChange={(checked) => {
          if (!save.isPending) {
            save.mutate({ sendTickets: checked });
          }
        }}
        label={t.sendTickets}
        description={on ? t.sendTicketsOn : t.sendTicketsOff}
      />
    </Card>
  );
}

function HowItWorks() {
  return (
    <Card>
      <CardHeader title={t.howTitle} description={t.empty} icon={Users} />
      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {t.how.map((step, index) => {
          const Icon = HOW_ICONS[index] ?? Ticket;
          return (
            <li key={step.title} className="relative flex flex-col gap-2 rounded-xl bg-surface-2 p-4">
              <span className="flex items-center justify-between">
                <span className="flex size-9 items-center justify-center rounded-xl bg-brand-solid text-brand-fg shadow-sm shadow-brand/25">
                  <Icon aria-hidden className="size-[18px]" />
                </span>
                <span className="font-mono text-xs font-semibold text-fg-subtle">0{index + 1}</span>
              </span>
              <span className="text-sm font-semibold text-fg">{step.title}</span>
              <span className="text-[13px] leading-relaxed text-fg-muted">{step.body}</span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function NoPriceNotice({ onEditEvent }: { onEditEvent: () => void }) {
  return (
    <Alert
      tone="warning"
      title={t.noPriceTitle}
      action={
        <Button variant="secondary" size="sm" icon={<Tag />} onClick={onEditEvent} className="self-center">
          {t.setPrice}
        </Button>
      }
    >
      {t.noPriceBody}
    </Alert>
  );
}

/** The new-seller form: a card on its own while there are no sellers, a tile in the grid after. */
function NewSeller({ eventId, onCreated, tile }: { eventId: string; onCreated: () => void; tile: boolean }) {
  const { can } = useEventAccess();
  const [open, setOpen] = useState(!tile);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [boxOffice, setBoxOffice] = useState(false);
  const create = useMutation({
    mutationFn: () => {
      const body: SellerBody = { name: name.trim(), phone: phone.trim() === "" ? null : phone.trim(), boxOffice };
      return api<SellerDto>(`/api/events/${eventId}/sellers`, { method: "POST", body });
    },
    onSuccess: () => {
      setName("");
      setPhone("");
      setBoxOffice(false);
      toast.success(t.createdToast);
      onCreated();
    },
  });
  const submit = (formEvent: FormEvent) => {
    formEvent.preventDefault();
    create.mutate();
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
        className="group flex min-h-40 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border-strong p-6 text-center transition hover:border-brand/50 hover:bg-brand-soft/40"
      >
        <span className="flex size-10 items-center justify-center rounded-full bg-brand-soft text-brand-soft-fg transition group-hover:scale-105">
          <UserPlus aria-hidden className="size-5" />
        </span>
        <span className="font-semibold text-fg">{t.newSeller}</span>
        <span className="text-sm text-fg-muted">{t.newSellerHint}</span>
      </button>
    );
  }
  return (
    <Card className={cn(tile && "animate-fade-in")}>
      <CardHeader title={t.newSeller} icon={UserPlus} />
      <form onSubmit={submit} className={cn("grid gap-4", tile ? "" : "sm:grid-cols-[1fr_1fr_auto] sm:items-end")}>
        <Field label={t.name}>
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
            }}
            placeholder={t.namePlaceholder}
            required
            maxLength={60}
            autoFocus={tile}
          />
        </Field>
        {/* In the wide row the hint goes under the whole form, so the fields stay aligned. */}
        <Field label={t.phone} optional hint={tile ? t.phoneHint : undefined}>
          <Input
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
            }}
            placeholder={t.phonePlaceholder}
            inputMode="tel"
            autoComplete="tel"
            maxLength={30}
          />
        </Field>
        <div className={cn("flex gap-2", tile && "justify-end")}>
          {tile && (
            <Button
              variant="ghost"
              onClick={() => {
                setOpen(false);
                create.reset();
              }}
            >
              {commonTexts.cancel}
            </Button>
          )}
          <Button type="submit" loading={create.isPending} icon={<Plus />}>
            {t.create}
          </Button>
        </div>
        {can("money") && (
          <div className="sm:col-span-full">
            <Switch checked={boxOffice} onChange={setBoxOffice} label={t.boxOffice.newLabel} description={t.boxOffice.newHint} />
          </div>
        )}
      </form>
      {!tile && <p className="mt-3 text-xs text-fg-muted">{t.phoneHint}</p>}
      <ErrorMessage error={create.error} className="mt-4" />
    </Card>
  );
}

export function SellersTab({ eventId, event, onEditEvent }: { eventId: string; event: EventDto; onEditEvent: () => void }) {
  const queryClient = useQueryClient();
  const { can } = useEventAccess();
  const delivery = can("delivery");
  const sellers = useQuery({ queryKey: ["sellers", eventId], queryFn: () => api<SellerDto[]>(`/api/events/${eventId}/sellers`) });
  const report = useQuery({ queryKey: ["report", eventId], queryFn: () => api<EventReportDto>(`/api/events/${eventId}/report`) });
  const payments = useQuery({
    queryKey: ["seller-payments", eventId],
    queryFn: () => api<SellerPaymentDto[]>(`/api/events/${eventId}/seller-payments`),
  });
  const voids = useQuery({ queryKey: ["voids", eventId], queryFn: () => api<VoidDto[]>(`/api/events/${eventId}/voids`) });
  const sales = useQuery({
    queryKey: ["ticket-sales", eventId],
    queryFn: () => api<TicketSaleDto[]>(`/api/events/${eventId}/ticket-sales`),
  });
  const reservations = useQuery({
    queryKey: ["reservations", eventId],
    queryFn: () => api<ReservationDto[]>(`/api/events/${eventId}/reservations`),
  });
  const refresh = () => {
    for (const key of ["sellers", "report", "seller-payments", "voids", "ticket-sales", "reservations", "analytics"]) {
      void queryClient.invalidateQueries({ queryKey: [key, eventId] });
    }
  };

  const rows = new Map((report.data?.sellers ?? []).map((row) => [row.sellerId, row]));
  const list = sellers.data ?? [];
  const holding = list.some((seller) => seller.ranges.length > 0);
  let content: ReactNode;
  if (sellers.isPending) {
    content = <LoadingBlock rows={2} />;
  } else if (sellers.isError) {
    content = <ErrorMessage error={sellers.error} />;
  } else if (list.length === 0) {
    content = (
      <>
        {delivery && <NewSeller eventId={eventId} onCreated={refresh} tile={false} />}
        <HowItWorks />
      </>
    );
  } else {
    content = (
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {list.map((seller) => (
          <SellerCard
            key={seller.id}
            seller={seller}
            row={rows.get(seller.id)}
            payments={(payments.data ?? []).filter((payment) => payment.sellerId === seller.id)}
            sales={(sales.data ?? []).filter((sale) => sale.sellerId === seller.id)}
            reservations={(reservations.data ?? []).filter((item) => item.sellerId === seller.id)}
            allReservations={reservations.data ?? []}
            voids={voids.data ?? []}
            event={event}
            onChange={refresh}
          />
        ))}
        {delivery && <NewSeller eventId={eventId} onCreated={refresh} tile />}
      </div>
    );
  }
  if (list.length > 0 && delivery && event.status !== "closed") {
    content = (
      <>
        {content}
        <SellerSettings eventId={eventId} />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Lead>{t.intro}</Lead>
      {!delivery && !can("money") && <ReadOnlyNotice eventId={eventId} area="delivery" />}
      {holding && event.ticketPriceCents === null && can("manage") && <NoPriceNotice onEditEvent={onEditEvent} />}
      {holding && report.data !== undefined && event.ticketPriceCents !== null && <SettlementSummary rows={report.data.sellers} />}
      {holding && report.data !== undefined && (
        <RankingCard eventId={eventId} sellers={list} rows={rows} editable={delivery && event.status !== "closed"} onChange={refresh} />
      )}
      {content}
    </div>
  );
}
