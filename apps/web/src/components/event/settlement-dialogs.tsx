"use client";

import type {
  RangeDto,
  ReportRowDto,
  ReservationDto,
  SellerDto,
  SellerPaymentBody,
  SellerPaymentDto,
  SellerPaymentMethod,
  SellerReturnBody,
  TicketSaleDto,
  VoidDto,
} from "@ingressoimpresso/api-types";
import { useMutation } from "@tanstack/react-query";
import { Banknote, CircleHelp, PackageX, QrCode, Undo2 } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";

import { Button, Dialog, ErrorMessage, Field, Input } from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { money, parseMoney, ticketNumber } from "@/lib/format";
import { NUMBER_LIST_INPUT, countNumbers, firstOutside, firstShared, formatRanges, intersect, mergeRanges, parseNumberList, subtract, type NumberRange } from "@/lib/number-list";
import { todayIso } from "@/lib/settlement";
import { common as commonTexts } from "@/texts/pt-BR/common";
import { event as eventTexts } from "@/texts/pt-BR/event";

const t = eventTexts.sellers;
const MAX_AMOUNT_CENTS = 100_000_000;

/** A row of mutually exclusive choices, as big touch targets. */
function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string; icon: ReactNode }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-fg">{label}</span>
      <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-2">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => {
                onChange(option.value);
              }}
              className={cn(
                "flex h-11 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-medium transition [&_svg]:size-4",
                selected
                  ? "border-brand bg-brand-soft text-brand-soft-fg ring-2 ring-brand/20"
                  : "border-border-strong bg-surface text-fg-muted hover:bg-surface-2 active:bg-surface-2 hover:text-fg",
              )}
            >
              {option.icon}
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const METHOD_ICONS: Record<SellerPaymentMethod, ReactNode> = {
  pix: <QrCode aria-hidden />,
  cash: <Banknote aria-hidden />,
  other: <CircleHelp aria-hidden />,
};

/** `150,00` for the amount field. */
function amountText(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Records money a seller handed over; opens with the balance one tap away. */
export function PaymentDialog({
  open,
  onClose,
  seller,
  row,
  priceCents,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  seller: SellerDto;
  row: ReportRowDto | undefined;
  priceCents: number | null;
  onSaved: () => void;
}) {
  const p = t.payment;
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<SellerPaymentMethod>("pix");
  const [day, setDay] = useState(todayIso);
  const [note, setNote] = useState("");
  const parsed = parseMoney(amount);
  const cents = parsed.ok ? parsed.cents : null;
  const valid = cents !== null && cents >= 1 && cents <= MAX_AMOUNT_CENTS && day !== "";
  const balance = row?.balanceCents ?? null;

  const reset = () => {
    setAmount("");
    setMethod("pix");
    setDay(todayIso());
    setNote("");
    save.reset();
  };
  const close = () => {
    reset();
    onClose();
  };

  const save = useMutation({
    mutationFn: (body: SellerPaymentBody) =>
      api<SellerPaymentDto>(`/api/sellers/${seller.id}/payments`, { method: "POST", body }),
    onSuccess: (payment) => {
      const settles = balance !== null && balance > 0 && payment.amountCents >= balance;
      toast.success(settles ? p.settledToast(seller.name) : p.savedToast(seller.name, money(payment.amountCents)));
      onSaved();
      close();
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (valid) {
      save.mutate({ amountCents: cents, method, receivedOn: day, note: note.trim() === "" ? null : note.trim() });
    }
  };

  const description =
    priceCents === null ? p.noPrice : balance !== null && balance > 0 ? p.owing(money(balance)) : balance !== null ? p.settled : undefined;
  const after =
    cents === null || balance === null || balance <= 0
      ? null
      : cents < balance
        ? p.after.owing(money(balance - cents))
        : cents === balance
          ? p.after.settled
          : p.after.overpaid(money(cents - balance));
  const equalsTickets = cents !== null && priceCents !== null && priceCents > 0 && cents % priceCents === 0 ? cents / priceCents : null;

  return (
    <Dialog
      open={open}
      onClose={close}
      title={p.title(seller.name)}
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            {commonTexts.cancel}
          </Button>
          <Button type="submit" form="seller-payment" loading={save.isPending} disabled={!valid}>
            {valid ? p.submit(money(cents)) : p.submitEmpty}
          </Button>
        </>
      }
    >
      <form id="seller-payment" onSubmit={submit} className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Field
            label={p.amount}
            hint={
              amount !== "" && !parsed.ok ? (
                <span className="text-danger-fg">{p.invalid}</span>
              ) : (
                (after ?? (equalsTickets === null ? undefined : p.equals(equalsTickets)))
              )
            }
          >
            <span className="relative flex">
              <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-base font-medium text-fg-subtle sm:text-[15px]">
                {commonTexts.currency}
              </span>
              <Input
                value={amount}
                onChange={(event) => {
                  setAmount(event.target.value);
                }}
                inputMode="decimal"
                autoComplete="off"
                placeholder={p.amountPlaceholder}
                aria-invalid={amount !== "" && !parsed.ok}
                className="pl-10 text-lg font-semibold tabular sm:text-lg"
                required
              />
            </span>
          </Field>
          {balance !== null && balance > 0 && cents !== balance && (
            <button
              type="button"
              onClick={() => {
                setAmount(amountText(balance));
              }}
              className="w-fit rounded-full border border-brand/25 bg-brand-soft px-3 py-1 text-[13px] font-medium text-brand-soft-fg transition hover:border-brand/50"
            >
              {p.all(money(balance))}
            </button>
          )}
        </div>
        <Choice
          label={p.method}
          value={method}
          onChange={setMethod}
          options={(["pix", "cash", "other"] as const).map((value) => ({ value, label: t.methods[value], icon: METHOD_ICONS[value] }))}
        />
        <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
          <Field label={p.date}>
            <Input
              type="date"
              value={day}
              max={todayIso()}
              onChange={(event) => {
                setDay(event.target.value);
              }}
              required
            />
          </Field>
          <Field label={p.note} optional>
            <Input
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
              }}
              placeholder={p.notePlaceholder}
              maxLength={200}
            />
          </Field>
        </div>
        <ErrorMessage error={save.error} />
      </form>
    </Dialog>
  );
}

/** Ranges of the seller, merged, as plain numbers. */
function held(ranges: readonly RangeDto[]): NumberRange[] {
  return ranges.map(({ first, last }) => ({ first, last }));
}

/** Records numbers a seller gave back (or lost): typed freely, checked as you type. */
export function ReturnDialog({
  open,
  onClose,
  seller,
  voids,
  sales,
  reservations,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  seller: SellerDto;
  voids: readonly VoidDto[];
  /** This seller's numbers marked as sold on their link (ADR 0053). */
  sales: readonly TicketSaleDto[];
  /** This seller's reservations (ADR 0072): reserved numbers are not "what was left". */
  reservations: readonly ReservationDto[];
  onSaved: () => void;
}) {
  const g = t.giveBackDialog;
  const [numbers, setNumbers] = useState("");
  const [reason, setReason] = useState<"unsold" | "lost">("unsold");
  const [note, setNote] = useState("");
  const parsed = parseNumberList(numbers);
  const holding = held(seller.ranges);
  const active = voids.filter((item) => item.undoneAt === null).map(({ first, last }) => ({ first, last }));
  // What the seller still has: their numbers minus everything returned, lost or voided.
  const remaining = subtract(holding, active);
  const sold = mergeRanges(sales.map((sale) => ({ first: sale.number, last: sale.number })));
  // Numbers someone is still going to pay for stay with the seller.
  const reserved = mergeRanges(reservations.filter((item) => item.active).flatMap((item) => item.numbers));
  const keptReserved = countNumbers(intersect(subtract(remaining, sold), reserved));
  // With marks on the link, what was not marked (nor reserved) is what should come back.
  const unsold = sold.length === 0 ? [] : subtract(subtract(remaining, sold), reserved);
  const clearing = parsed.ok ? countNumbers(intersect(parsed.ranges, sold)) : 0;
  const clearingReserved = parsed.ok ? countNumbers(intersect(parsed.ranges, reserved)) : 0;

  let problem: string | null = null;
  if (!parsed.ok) {
    problem = parsed.error === "invalid" ? g.errors.invalid(parsed.token ?? "") : parsed.error === "too_many" ? g.errors.tooMany : null;
  } else {
    const outside = firstOutside(parsed.ranges, holding);
    const voided = outside === null ? firstShared(parsed.ranges, active) : null;
    problem = outside !== null ? g.errors.outside(ticketNumber(outside)) : voided !== null ? g.errors.voided(ticketNumber(voided)) : null;
  }
  const valid = parsed.ok && problem === null;

  const close = () => {
    setNumbers("");
    setReason("unsold");
    setNote("");
    save.reset();
    onClose();
  };

  const save = useMutation({
    mutationFn: (body: SellerReturnBody) => api<VoidDto[]>(`/api/sellers/${seller.id}/returns`, { method: "POST", body }),
    onSuccess: (_, body) => {
      toast.success(g.savedToast(body.ranges.reduce((sum, range) => sum + range.last - range.first + 1, 0)));
      onSaved();
      close();
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (parsed.ok && valid) {
      save.mutate({ ranges: parsed.ranges, reason, note: note.trim() === "" ? null : note.trim() });
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title={g.title(seller.name)}
      description={g.description}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            {commonTexts.cancel}
          </Button>
          <Button type="submit" form="seller-return" loading={save.isPending} disabled={!valid}>
            {parsed.ok && valid ? g.submit(parsed.count) : g.submitEmpty}
          </Button>
        </>
      }
    >
      <form id="seller-return" onSubmit={submit} className="flex flex-col gap-5">
        <Field
          label={g.numbers}
          hint={
            problem !== null ? (
              <span className="text-danger-fg">{problem}</span>
            ) : parsed.ok ? (
              <span className="font-medium text-fg">
                {g.preview(parsed.count, formatRanges(parsed.ranges))}
                {clearing > 0 && <span className="block font-normal text-warning-fg">{g.clearsMarks(clearing)}</span>}
                {clearingReserved > 0 && (
                  <span className="block font-normal text-warning-fg">{eventTexts.sellers.reservations.returnClears(clearingReserved)}</span>
                )}
              </span>
            ) : (
              g.numbersHint
            )
          }
        >
          <Input
            value={numbers}
            onChange={(event) => {
              setNumbers(event.target.value);
            }}
            placeholder={g.numbersPlaceholder}
            {...NUMBER_LIST_INPUT}
            aria-invalid={problem !== null}
            className="font-mono tabular"
            required
          />
        </Field>
        {unsold.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setNumbers(unsold.map((range) => (range.first === range.last ? String(range.first) : `${String(range.first)}-${String(range.last)}`)).join(", "));
              setReason("unsold");
            }}
            className="flex w-fit items-center gap-2 rounded-full border border-brand/25 bg-brand-soft px-3 py-1.5 text-[13px] font-medium text-brand-soft-fg transition hover:border-brand/50"
          >
            <Undo2 aria-hidden className="size-3.5" />
            {g.unsoldShortcut(countNumbers(unsold))}
          </button>
        )}
        {unsold.length > 0 && keptReserved > 0 && (
          <p className="-mt-3 text-xs text-fg-muted">{eventTexts.sellers.reservations.returnKeeps(keptReserved)}</p>
        )}
        {remaining.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-fg-muted">
              {g.held} · <span className="font-normal text-fg-subtle">{g.heldHint}</span>
            </span>
            <div className="flex flex-wrap gap-2">
              {remaining.map((range) => (
                <button
                  key={range.first}
                  type="button"
                  onClick={() => {
                    setNumbers(range.first === range.last ? String(range.first) : `${String(range.first)}-${String(range.last)}`);
                  }}
                  className="rounded-lg border border-border bg-surface-2 px-2.5 py-1 font-mono text-sm text-fg tabular transition hover:border-brand/40 hover:bg-brand-soft"
                >
                  {formatRanges([range])}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <Choice
            label={g.reason}
            value={reason}
            onChange={setReason}
            options={[
              { value: "unsold", label: g.reasons.unsold, icon: <Undo2 aria-hidden /> },
              { value: "lost", label: g.reasons.lost, icon: <PackageX aria-hidden /> },
            ]}
          />
          <span className="text-xs leading-relaxed text-fg-muted">{g.reasonHints[reason]}</span>
        </div>
        <Field label={g.note} optional>
          <Input
            value={note}
            onChange={(event) => {
              setNote(event.target.value);
            }}
            placeholder={g.notePlaceholder}
            maxLength={200}
          />
        </Field>
        <ErrorMessage error={save.error} />
      </form>
    </Dialog>
  );
}
