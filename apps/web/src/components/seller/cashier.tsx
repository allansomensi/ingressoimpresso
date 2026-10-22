"use client";

import type { CashierClosingDto, SaleMethod, SellerOp, SellerViewDto } from "@ingressoimpresso/api-types";
import { Banknote, Calculator, CreditCard, Lock, Minus, QrCode, Trash2 } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Badge, Button, Dialog, ErrorMessage, Field, Input } from "@/components/ui";
import { api } from "@/lib/api";
import { SALE_METHODS, cartCount, cartRanges, cartTotal, cashierProducts, changeDue, openShift, type Cart } from "@/lib/cashier";
import { cn } from "@/lib/cn";
import { money, parseMoney, shortDateTime } from "@/lib/format";
import { numberCells } from "@/lib/seller-page";
import { common as commonTexts } from "@/texts/pt-BR/common";
import { sellerPage as sellerPageTexts } from "@/texts/pt-BR/seller-page";

const t = sellerPageTexts.cashier;

const METHOD_ICONS: Record<SaleMethod, ReactNode> = {
  cash: <Banknote aria-hidden />,
  pix: <QrCode aria-hidden />,
  card: <CreditCard aria-hidden />,
};

/** Notes a buyer usually hands over, above the total: the quick "Recebi" buttons. */
const NOTES = [500, 1000, 2000, 5000, 10_000, 20_000];

function MoneyField({ value, onChange, label, hint, invalid }: { value: string; onChange: (value: string) => void; label: string; hint?: ReactNode; invalid: boolean }) {
  return (
    <Field label={label} hint={invalid ? <span className="text-danger-fg">{t.invalid}</span> : hint}>
      <span className="relative flex">
        <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-base font-medium text-fg-subtle sm:text-[15px]">
          {commonTexts.currency}
        </span>
        <Input
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          inputMode="decimal"
          autoComplete="off"
          placeholder={t.receivedPlaceholder}
          aria-invalid={invalid}
          className="pl-10 text-lg font-semibold tabular sm:text-lg"
        />
      </span>
    </Field>
  );
}

/**
 * The token cashier's counter (ADR 0098): products as big buttons, how the buyer paid, the change,
 * and the open shift with "Fechar caixa". A sale is an ordinary mark of the offline queue.
 */
export function CashierSection({
  view,
  now,
  token,
  online,
  pending,
  canceled,
  enqueue,
  onClosed,
}: {
  view: SellerViewDto;
  now: Date;
  token: string;
  online: boolean;
  pending: number;
  canceled: boolean;
  enqueue: (op: SellerOp) => void;
  onClosed: (view: SellerViewDto) => void;
}) {
  // Every number, not just the tiles the page draws: a cashier may hold thousands of fichas.
  const products = useMemo(() => cashierProducts(view, numberCells(view, now, Number.POSITIVE_INFINITY)), [view, now]);
  const shift = useMemo(() => openShift(view), [view]);
  const [cart, setCart] = useState<Cart>(new Map());
  const [method, setMethod] = useState<SaleMethod>("cash");
  const [received, setReceived] = useState("");
  const [closing, setClosing] = useState(false);
  const cashier = view.cashier;
  if (cashier === null) {
    return null;
  }

  const count = cartCount(cart);
  const total = cartTotal(cart, products);
  const typed = parseMoney(received);
  const receivedCents = typed.ok ? typed.cents : null;
  const change = method === "cash" && receivedCents !== null ? changeDue(total, receivedCents) : null;
  const notes = NOTES.filter((note) => note > total).slice(0, 3);
  const setQuantity = (index: number, quantity: number) => {
    const next = new Map(cart);
    if (quantity <= 0) {
      next.delete(index);
    } else {
      next.set(index, quantity);
    }
    setCart(next);
  };
  const register = () => {
    const ranges = cartRanges(cart, products);
    if (ranges === null || ranges.length === 0) {
      toast.error(t.soldOut);
      return;
    }
    enqueue({ kind: "mark", ranges, buyerName: null, buyerPhone: null, edit: false, reservationId: null, method });
    toast.success(t.soldToast(count, money(total), t.paidWith[method]));
    setCart(new Map());
    setReceived("");
  };
  const anyLeft = products.some((product) => product.available.length > 0);

  return (
    <section aria-labelledby="cashier-title" className="flex flex-col gap-4 rounded-3xl border border-border bg-surface p-4 shadow-xs">
      <header className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-soft-fg">
          <Calculator className="size-5" aria-hidden />
        </span>
        <span className="flex min-w-0 flex-col">
          <h2 id="cashier-title" className="text-lg font-semibold tracking-tight text-fg">
            {t.title}
          </h2>
          <span className="text-[13px] text-fg-muted">{cashier.open.since === null ? t.shiftFirst : t.shiftSince(shortDateTime(cashier.open.since))}</span>
        </span>
      </header>

      {canceled ? null : !anyLeft && count === 0 ? (
        <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm text-fg-muted">{t.empty}</p>
      ) : (
        <>
          <p className="text-[13px] leading-relaxed text-fg-muted">{t.hint}</p>
          <ul className="grid grid-cols-2 gap-2.5">
            {products.map((product, index) => {
              const name = product.name ?? t.single;
              const quantity = cart.get(index) ?? 0;
              const left = product.available.length - quantity;
              return (
                <li key={product.name ?? "-"} className="relative">
                  <button
                    type="button"
                    disabled={left <= 0}
                    aria-label={t.add(name)}
                    onClick={() => {
                      setQuantity(index, quantity + 1);
                    }}
                    className={cn(
                      "flex min-h-24 w-full flex-col items-start justify-between gap-2 rounded-2xl border-2 bg-surface p-3.5 text-left transition select-none",
                      "hover:bg-surface-2 active:scale-[0.98] active:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50",
                      quantity > 0 ? "border-brand ring-2 ring-brand/20" : "border-border",
                    )}
                  >
                    <span className="flex w-full items-center gap-2">
                      {product.color !== null && <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ backgroundColor: product.color }} />}
                      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-fg">{name}</span>
                    </span>
                    <span className="flex w-full items-end justify-between gap-2">
                      <span className="text-lg font-semibold text-fg tabular">{product.priceCents === null ? t.noPrice : money(product.priceCents)}</span>
                      <span className="text-xs text-fg-subtle">{t.available(Math.max(left, 0))}</span>
                    </span>
                  </button>
                  {quantity > 0 && (
                    <>
                      <span className="pointer-events-none absolute -top-2 -right-1.5 flex h-7 min-w-7 items-center justify-center rounded-full bg-brand-solid px-2 text-sm font-bold text-brand-fg shadow-sm tabular">
                        {quantity}
                      </span>
                      <button
                        type="button"
                        aria-label={t.remove(name)}
                        onClick={() => {
                          setQuantity(index, quantity - 1);
                        }}
                        className="touch-target absolute -bottom-2 -left-1.5 flex size-8 items-center justify-center rounded-full border border-border-strong bg-surface text-fg shadow-sm hover:bg-surface-2 active:bg-surface-2"
                      >
                        <Minus className="size-4" aria-hidden />
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>

          {count > 0 && (
            <div className="flex flex-col gap-4 rounded-2xl bg-surface-2 p-3.5 animate-rise">
              <div className="flex items-center justify-between gap-3">
                <span className="text-base font-semibold text-fg tabular">{t.cart(count, money(total))}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Trash2 />}
                  onClick={() => {
                    setCart(new Map());
                    setReceived("");
                  }}
                >
                  {t.clear}
                </Button>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-fg">{t.method}</span>
                <div role="radiogroup" aria-label={t.method} className="grid grid-cols-3 gap-2">
                  {SALE_METHODS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={method === value}
                      onClick={() => {
                        setMethod(value);
                      }}
                      className={cn(
                        // Icon over the word on a phone: "Dinheiro" beside an icon does not fit a third of 360px.
                        "flex h-14 flex-col items-center justify-center gap-1 rounded-xl border px-1 text-[13px] font-semibold transition sm:h-12 sm:flex-row sm:gap-2 sm:px-2 sm:text-sm [&_svg]:size-4",
                        method === value
                          ? "border-brand bg-brand-soft text-brand-soft-fg ring-2 ring-brand/20"
                          : "border-border-strong bg-surface text-fg-muted hover:bg-surface-2 hover:text-fg active:bg-surface-2",
                      )}
                    >
                      {METHOD_ICONS[value]}
                      {t.methods[value]}
                    </button>
                  ))}
                </div>
              </div>
              {method === "cash" && total > 0 && (
                <div className="flex flex-col gap-2">
                  <MoneyField
                    label={t.received}
                    value={received}
                    onChange={setReceived}
                    invalid={received !== "" && !typed.ok}
                    hint={
                      change !== null ? (
                        <span className="text-base font-semibold text-success-fg">{t.change(money(change))}</span>
                      ) : receivedCents !== null ? (
                        <span className="font-medium text-warning-fg">{t.short(money(total - receivedCents))}</span>
                      ) : undefined
                    }
                  />
                  <div className="flex flex-wrap gap-2">
                    {[total, ...notes].map((value, position) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => {
                          setReceived((value / 100).toFixed(2).replace(".", ","));
                        }}
                        className="min-h-9 rounded-full border border-border-strong bg-surface px-3.5 text-[13px] font-semibold text-fg tabular transition hover:bg-surface-2 active:bg-surface-2"
                      >
                        {position === 0 ? t.exact : money(value)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <Button size="lg" className="w-full" onClick={register}>
                {total > 0 ? t.register(money(total)) : t.registerFree}
              </Button>
            </div>
          )}
        </>
      )}

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-semibold text-fg">{t.shift}</span>
          <span className="text-sm text-fg-muted tabular">{t.tokens(shift.tokens)}</span>
        </div>
        {shift.tokens === 0 ? (
          <p className="text-sm text-fg-muted">{t.nothing}</p>
        ) : (
          <dl className="grid grid-cols-2 gap-2">
            <ShiftCell label={t.inDrawer} value={shift.cashCents} strong />
            <ShiftCell label={t.methods.pix} value={shift.pixCents} />
            <ShiftCell label={t.methods.card} value={shift.cardCents} />
            {shift.otherCents > 0 && <ShiftCell label={t.other} value={shift.otherCents} />}
          </dl>
        )}
        <Button
          variant="secondary"
          icon={<Lock />}
          disabled={shift.tokens === 0}
          onClick={() => {
            setClosing(true);
          }}
        >
          {t.close}
        </Button>
        {cashier.closings.length > 0 && <ClosingList closings={cashier.closings} />}
      </div>

      <Dialog
        open={closing}
        onClose={() => {
          setClosing(false);
        }}
        title={t.closeTitle}
        description={t.closeHint}
      >
        {closing && (
          <CloseForm
            token={token}
            expected={shift.cashCents}
            blocked={!online ? t.needsOnline : pending > 0 ? t.needsSync : null}
            onClosed={(next) => {
              setClosing(false);
              onClosed(next);
              toast.success(t.closedToast);
            }}
          />
        )}
      </Dialog>
    </section>
  );
}

function ShiftCell({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={cn("flex flex-col gap-0.5 rounded-xl px-3 py-2.5", strong ? "bg-success-soft text-success-fg" : "bg-surface-2")}>
      <dt className={cn("text-xs", strong ? "font-medium" : "text-fg-muted")}>{label}</dt>
      <dd className={cn("text-base font-semibold tabular", !strong && "text-fg")}>{money(value)}</dd>
    </div>
  );
}

/** The difference of a closing as a badge: confere, faltou, sobrou. */
export function DifferenceBadge({ difference }: { difference: number | null }) {
  if (difference === null) {
    return <Badge>{t.notCounted}</Badge>;
  }
  if (difference === 0) {
    return <Badge tone="success">{t.ok}</Badge>;
  }
  return difference < 0 ? <Badge tone="danger">{t.shortBadge(money(-difference))}</Badge> : <Badge tone="warning">{t.overBadge(money(difference))}</Badge>;
}

function ClosingList({ closings }: { closings: readonly CashierClosingDto[] }) {
  return (
    <details className="group rounded-2xl border border-border">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3.5 text-sm font-medium text-fg">
        {t.closings}
        <span className="text-xs text-fg-muted tabular">{closings.length}</span>
      </summary>
      <ul className="flex flex-col divide-y divide-border border-t border-border">
        {closings.map((item) => (
          <li key={item.id} className="flex flex-col gap-1 px-3.5 py-2.5">
            <span className="flex items-center justify-between gap-2">
              <span className="text-[13px] text-fg">
                {t.closing(shortDateTime(item.closedAt))}
                {item.byOrganizer && <span className="text-fg-muted"> · {t.byOrganizer}</span>}
              </span>
              <DifferenceBadge difference={item.differenceCents} />
            </span>
            <span className="text-xs text-fg-muted tabular">
              {t.tokens(item.tokens)} · {t.methods.cash} {money(item.cashCents)} · {t.methods.pix} {money(item.pixCents)} · {t.methods.card} {money(item.cardCents)}
            </span>
            {item.note !== null && <span className="text-xs text-fg-muted italic">{item.note}</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}

function CloseForm({ token, expected, blocked, onClosed }: { token: string; expected: number; blocked: string | null; onClosed: (view: SellerViewDto) => void }) {
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const typed = parseMoney(counted);
  const countedCents = typed.ok ? typed.cents : null;
  const difference = countedCents === null ? null : countedCents - expected;
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      onClosed(
        await api<SellerViewDto>("/api/seller/cashier/close", {
          method: "POST",
          body: { token, countedCents, note: note.trim() === "" ? null : note.trim() },
        }),
      );
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (typed.ok && blocked === null) {
          void submit();
        }
      }}
    >
      <div className="flex items-baseline justify-between gap-3 rounded-2xl bg-surface-2 px-4 py-3">
        <span className="text-sm text-fg-muted">{t.expected}</span>
        <span className="text-xl font-semibold text-fg tabular">{money(expected)}</span>
      </div>
      <MoneyField
        label={t.counted}
        value={counted}
        onChange={setCounted}
        invalid={counted !== "" && !typed.ok}
        hint={
          difference === null ? (
            t.countedHint
          ) : difference === 0 ? (
            <span className="font-medium text-success-fg">{t.differenceOk}</span>
          ) : difference < 0 ? (
            <span className="font-medium text-danger-fg">{t.differenceShort(money(-difference))}</span>
          ) : (
            <span className="font-medium text-warning-fg">{t.differenceOver(money(difference))}</span>
          )
        }
      />
      <Field label={t.note} optional>
        <Input
          value={note}
          maxLength={200}
          placeholder={t.notePlaceholder}
          onChange={(event) => {
            setNote(event.target.value);
          }}
        />
      </Field>
      {blocked !== null && (
        <p role="alert" className="rounded-xl bg-warning-soft px-3.5 py-3 text-sm text-warning-fg">
          {blocked}
        </p>
      )}
      {error !== null && <ErrorMessage error={error} />}
      <Button type="submit" icon={<Lock />} loading={busy} disabled={blocked !== null || !typed.ok} className="w-full">
        {t.confirm}
      </Button>
    </form>
  );
}
