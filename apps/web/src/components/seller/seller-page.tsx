"use client";

import type { SellerMarkBody, SellerTicketBody, SellerUnmarkBody, SellerViewDto } from "@ingressoimpresso/api-types";
import {
  CalendarDays,
  Check,
  CheckCircle2,
  Copy,
  HandCoins,
  MapPin,
  MessageCircle,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Store,
  Ticket,
  UserRound,
  WifiOff,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";

import { LogoMark } from "@/components/brand";
import { EventChangeNotice, OrganizationContact, OrganizationLogo } from "@/components/organization/organization";
import { Button, Dialog, ErrorMessage, Field, Input, Spinner, buttonClass, useConfirm } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { eventDateTime, money, shortDateTime } from "@/lib/format";
import { firstOutside, firstShared, formatRanges, intersect, parseNumberList } from "@/lib/number-list";
import { nextAvailable, numberCells, padNumber, type NumberCell, type NumberState } from "@/lib/seller-page";
import { whatsappLink } from "@/lib/settlement";
import { copyText } from "@/lib/share";
import { categoryOf } from "@/lib/categories";
import { changeKind } from "@/lib/event-change";
import { textOn } from "@/lib/ticket-pass";
import { listNames } from "@/lib/team";
import { texts } from "@/texts/pt-BR";

const t = texts.sellerPage;

type State =
  | { status: "loading" }
  | { status: "no-token" }
  | { status: "not-found" }
  | { status: "error" }
  | { status: "ready"; view: SellerViewDto };

type Filter = "available" | "sold" | "all";

/** The link's token: everything after `#` (the fragment never reaches a server). */
function readToken(): string | null {
  const token = window.location.hash.replace(/^#/, "").trim();
  return token === "" ? null : token;
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="m-auto flex max-w-sm flex-col items-center gap-4 px-6 py-16 text-center animate-rise">{children}</div>;
}

const TILE: Record<NumberState, string> = {
  available: "border-border-strong bg-surface text-fg hover:border-brand hover:bg-brand-soft",
  sold: "border-transparent bg-brand-solid text-brand-fg shadow-sm shadow-brand/25",
  unsold: "border-dashed border-border bg-transparent text-fg-subtle line-through",
  lost: "border-dashed border-danger/30 bg-danger-soft/40 text-danger-fg/70 line-through",
  revoked: "border-dashed border-border bg-transparent text-fg-subtle line-through",
};

/** Marks one or more numbers as sold, optionally with the buyer. */
function MarkSheet({
  open,
  onClose,
  token,
  view,
  cells,
  initial,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  token: string;
  view: SellerViewDto;
  cells: readonly NumberCell[];
  initial: { numbers: string; name: string; phone: string };
  onSaved: (view: SellerViewDto) => void;
}) {
  const s = t.sheet;
  const [numbers, setNumbers] = useState(initial.numbers);
  const [name, setName] = useState(initial.name);
  const [phone, setPhone] = useState(initial.phone);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const digits = view.numberDigits;
  const pad = (number: number) => padNumber(number, digits);

  const parsed = parseNumberList(numbers);
  const voids = view.voids.map(({ first, last }) => ({ first, last }));
  const soldRanges = view.sales.map((sale) => ({ first: sale.number, last: sale.number }));
  let problem: string | null = null;
  let updating = false;
  if (!parsed.ok) {
    problem = parsed.error === "invalid" ? s.errors.invalid(parsed.token ?? "") : parsed.error === "too_many" ? s.errors.tooMany : null;
  } else {
    const outside = firstOutside(parsed.ranges, view.ranges);
    const voided = outside === null ? firstShared(parsed.ranges, voids) : null;
    problem = outside !== null ? s.errors.outside(pad(outside)) : voided !== null ? s.errors.voided(pad(voided)) : null;
    updating = problem === null && firstShared(parsed.ranges, soldRanges) !== null;
  }
  const valid = parsed.ok && problem === null;
  const next = nextAvailable(cells);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!parsed.ok || !valid) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body: SellerMarkBody = {
        token,
        ranges: parsed.ranges,
        buyerName: name.trim() === "" ? null : name.trim(),
        buyerPhone: phone.trim() === "" ? null : phone.trim(),
      };
      const fresh = await api<SellerViewDto>("/api/seller/sales", { method: "POST", body });
      toast.success(s.savedToast(parsed.count));
      onSaved(fresh);
      onClose();
    } catch (caught) {
      setError(caught);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={s.title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {texts.common.cancel}
          </Button>
          <Button type="submit" form="seller-mark" loading={saving} disabled={!valid} icon={<Check />}>
            {parsed.ok && valid ? s.submit(parsed.count) : s.submitEmpty}
          </Button>
        </>
      }
    >
      <form id="seller-mark" onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Field
            label={parsed.ok && parsed.count > 1 ? s.numbersPlural : s.numbers}
            hint={
              problem !== null ? (
                <span className="text-danger-fg">{problem}</span>
              ) : parsed.ok ? (
                <span className="font-medium text-fg">
                  {s.preview(parsed.count, formatRanges(parsed.ranges, digits))}
                  {updating && <span className="block font-normal text-fg-muted">{s.updating}</span>}
                </span>
              ) : (
                s.numbersHint
              )
            }
          >
            <Input
              value={numbers}
              onChange={(event) => {
                setNumbers(event.target.value);
              }}
              // The seller usually types one number: a number pad that still has the comma for a
              // list ("12,15"); a range can also be written "20 a 25" on a full keyboard.
              inputMode="decimal"
              autoComplete="off"
              enterKeyHint="done"
              aria-invalid={problem !== null}
              className="font-mono text-lg tabular sm:text-lg"
              required
            />
          </Field>
          {next !== null && numbers.trim() === "" && (
            <button
              type="button"
              onClick={() => {
                setNumbers(String(next));
              }}
              className="w-fit rounded-full border border-brand/25 bg-brand-soft px-3 py-1 font-mono text-[13px] font-medium text-brand-soft-fg tabular"
            >
              {s.next(pad(next))}
            </button>
          )}
        </div>
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-fg">
            <UserRound aria-hidden className="size-4 text-fg-subtle" />
            {s.buyer} <span className="text-xs font-normal text-fg-subtle">({texts.common.optional})</span>
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={s.buyerName}>
              <Input
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                }}
                placeholder={s.buyerNamePlaceholder}
                autoComplete="off"
                maxLength={80}
              />
            </Field>
            <Field label={s.buyerPhone}>
              <Input
                value={phone}
                onChange={(event) => {
                  setPhone(event.target.value);
                }}
                placeholder={s.buyerPhonePlaceholder}
                inputMode="tel"
                autoComplete="off"
                maxLength={30}
              />
            </Field>
          </div>
          <p className="text-xs leading-relaxed text-fg-muted">{s.buyerHint}</p>
        </fieldset>
        <ErrorMessage error={error} />
      </form>
    </Dialog>
  );
}

/** A sold number: its buyer, and the way back. */
/** The sold number's digital ticket (ADR 0061): created on demand, then sent by WhatsApp. */
function SaleTicket({
  cell,
  token,
  label,
  eventName,
  onSaved,
}: {
  cell: NumberCell;
  token: string;
  label: string;
  eventName: string;
  onSaved: (view: SellerViewDto) => void;
}) {
  const [busy, setBusy] = useState(false);
  const sale = cell.sale;
  if (sale === null) {
    return null;
  }
  const url = sale.ticketUrl;

  const create = async () => {
    setBusy(true);
    try {
      const body: SellerTicketBody = { token, number: cell.number };
      onSaved(await api<SellerViewDto>("/api/seller/tickets", { method: "POST", body }));
      toast.success(t.sale.ticketReady);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.userMessage : texts.errors.generic);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="sale-ticket" className="mt-4 flex flex-col gap-3 rounded-2xl border border-border p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-soft-fg">
          <Smartphone aria-hidden className="size-[18px]" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 id="sale-ticket" className="text-sm font-semibold text-fg">
            {t.sale.ticketTitle}
          </h3>
          <p className="text-xs leading-relaxed text-fg-muted">{url === null ? t.sale.ticketHint : t.sale.ticketSent}</p>
        </div>
      </div>
      {url === null ? (
        <Button variant="secondary" icon={<Smartphone />} loading={busy} onClick={() => void create()} className="w-full">
          {t.sale.ticketCreate}
        </Button>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <a
            href={whatsappLink(sale.buyerPhone, t.sale.ticketMessage(sale.buyerName, eventName, label, url))}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClass({ className: "sm:flex-1 bg-success-solid shadow-success/25 hover:bg-success-solid/90 active:bg-success-solid/80" })}
          >
            <MessageCircle />
            {t.sale.ticketSend}
          </a>
          <Button
            variant="secondary"
            icon={<Copy />}
            onClick={async () => {
              if (await copyText(url)) {
                toast.success(t.sale.ticketCopied);
              } else {
                toast.error(t.sale.ticketCopyFailed);
              }
            }}
          >
            {t.sale.ticketCopy}
          </Button>
        </div>
      )}
      <p className="text-xs text-fg-subtle">{t.sale.ticketPaper}</p>
    </section>
  );
}

function SaleSheet({
  cell,
  onClose,
  onEdit,
  token,
  digits,
  eventName,
  canSendTickets,
  onSaved,
}: {
  cell: NumberCell | null;
  onClose: () => void;
  /** `null` when sales can no longer change (canceled event). */
  onEdit: ((cell: NumberCell) => void) | null;
  token: string;
  digits: number;
  eventName: string;
  canSendTickets: boolean;
  onSaved: (view: SellerViewDto) => void;
}) {
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const sale = cell?.sale ?? null;
  const label = cell === null ? "" : padNumber(cell.number, digits);

  const undo = async () => {
    if (cell === null || !(await confirm({ title: t.sale.undoTitle(label), description: t.sale.undoBody, confirmLabel: t.sale.undo }))) {
      return;
    }
    setBusy(true);
    try {
      const body: SellerUnmarkBody = { token, number: cell.number };
      onSaved(await api<SellerViewDto>("/api/seller/sales/undo", { method: "POST", body }));
      toast.success(t.sale.undoneToast);
      onClose();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.userMessage : texts.errors.generic);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={cell !== null}
      onClose={onClose}
      title={t.sale.title(label)}
      description={sale === null ? undefined : t.sale.soldAt(shortDateTime(sale.soldAt))}
      footer={
        <>
          <Button variant="danger-ghost" icon={<RotateCcw />} loading={busy} onClick={() => void undo()}>
            {t.sale.undo}
          </Button>
          {onEdit !== null && (
            <Button
              variant="secondary"
              icon={<Pencil />}
              onClick={() => {
                if (cell !== null) {
                  onEdit(cell);
                }
              }}
            >
              {t.sale.edit}
            </Button>
          )}
        </>
      }
    >
      <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-soft-fg">
          <UserRound aria-hidden className="size-5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-semibold text-fg">{sale?.buyerName ?? t.noBuyer}</span>
          {sale?.buyerPhone !== null && sale?.buyerPhone !== undefined && <span className="text-sm text-fg-muted">{sale.buyerPhone}</span>}
        </div>
        {sale?.buyerPhone !== null && sale?.buyerPhone !== undefined && (
          <a
            href={whatsappLink(sale.buyerPhone, "")}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t.sale.call}
            className="flex size-10 items-center justify-center rounded-full bg-success-solid text-white"
          >
            <MessageCircle className="size-5" aria-hidden />
          </a>
        )}
      </div>
      {cell !== null && (canSendTickets || (cell.sale?.ticketUrl ?? null) !== null) && (
        <SaleTicket cell={cell} token={token} label={label} eventName={eventName} onSaved={onSaved} />
      )}
    </Dialog>
  );
}

export function SellerPage() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [token, setToken] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>("available");
  const [marking, setMarking] = useState<{ numbers: string; name: string; phone: string } | null>(null);
  const [selected, setSelected] = useState<NumberCell | null>(null);

  const load = useCallback(async (current: string) => {
    try {
      const view = await api<SellerViewDto>("/api/seller", { method: "POST", body: { token: current } });
      setState({ status: "ready", view });
    } catch (error) {
      setState(error instanceof ApiError && error.status === 404 ? { status: "not-found" } : { status: "error" });
    }
  }, []);

  useEffect(() => {
    const read = () => {
      const current = readToken();
      setToken(current);
      if (current === null) {
        setState({ status: "no-token" });
      } else {
        void load(current);
      }
    };
    read();
    window.addEventListener("hashchange", read);
    return () => {
      window.removeEventListener("hashchange", read);
    };
  }, [load]);

  const view = state.status === "ready" ? state.view : null;
  const cells = useMemo(() => (view === null ? [] : numberCells(view)), [view]);
  useEffect(() => {
    if (view !== null) {
      document.title = `${t.metaTitle} · ${view.event.name}`;
    }
  }, [view]);

  const refresh = async () => {
    if (token === null) {
      return;
    }
    setRefreshing(true);
    await load(token);
    setRefreshing(false);
  };

  if (state.status === "loading") {
    return (
      <Centered>
        <Spinner />
        <p className="text-sm text-fg-muted">{t.loading}</p>
      </Centered>
    );
  }
  if (state.status !== "ready" || token === null || view === null) {
    const title = state.status === "not-found" ? t.notFoundTitle : state.status === "error" ? t.errorTitle : t.noTokenTitle;
    const body = state.status === "not-found" ? t.notFound : state.status === "error" ? t.error : t.noToken;
    return (
      <Centered>
        <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-soft text-brand-soft-fg">
          {state.status === "error" ? <WifiOff className="size-7" aria-hidden /> : <Ticket className="size-7" aria-hidden />}
        </span>
        <h1 className="text-xl font-semibold tracking-tight text-fg">{title}</h1>
        <p className="text-[15px] leading-relaxed text-fg-muted">{body}</p>
        {state.status === "error" && (
          <Button variant="secondary" icon={<RefreshCw />} onClick={() => void refresh()} loading={refreshing}>
            {t.retry}
          </Button>
        )}
      </Centered>
    );
  }

  const s = view.summary;
  const digits = view.numberDigits;
  const pad = (number: number) => padNumber(number, digits);
  const percent = s.tickets === 0 ? 0 : Math.round((s.sold / s.tickets) * 100);
  // Only the categories of the seller's own numbers.
  const legend = view.categories.filter((category) => intersect(category.ranges, view.ranges).length > 0);
  const shown = cells.filter((cell) => filter === "all" || cell.state === filter);
  const firstName = view.seller.trim().split(/\s+/)[0] ?? view.seller;
  // A canceled event takes no more sales (ADR 0065): the page only shows what was done.
  const canceled = changeKind(view.event.change, view.event.startsAt) === "canceled";
  // The organization's colour (ADR 0064) when white text reads on it; the site's otherwise.
  const brand = view.organization.brandColor;
  const heroColor = brand !== null && textOn(brand) === "#ffffff" ? brand : null;
  const openMark = (numbers = "", name = "", phone = "") => {
    setSelected(null);
    setMarking({ numbers, name, phone });
  };

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5 px-4 pt-5 pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <header className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-semibold text-fg-muted">
          <LogoMark className="size-6" />
          {texts.brand.name}
        </span>
        <Button variant="ghost" size="sm" icon={<RefreshCw />} loading={refreshing} onClick={() => void refresh()}>
          {t.refresh}
        </Button>
      </header>

      <EventChangeNotice change={view.event.change} startsAt={view.event.startsAt} forSeller />

      <section
        className={cn("relative overflow-hidden rounded-3xl bg-brand-solid p-5 text-white shadow-lg", heroColor === null && "shadow-brand/25")}
        style={heroColor === null ? undefined : { backgroundColor: heroColor }}
      >
        <div aria-hidden className="absolute -top-16 -right-16 size-48 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex flex-col gap-1">
          <span className="mb-2 flex items-center gap-2.5">
            <OrganizationLogo organization={view.organization} className="size-9 rounded-lg" />
            <span className="text-xs font-semibold tracking-[0.14em] text-white/90 uppercase">{t.by(view.organization.name)}</span>
          </span>
          <span className="text-sm text-white/90">{t.hello(firstName)}</span>
          <h1 className="text-2xl leading-tight font-semibold tracking-tight text-balance">{view.event.name}</h1>
          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-white/90">
            <span className="flex items-center gap-1">
              <CalendarDays aria-hidden className="size-3.5" />
              {eventDateTime(view.event.startsAt)}
            </span>
            {view.event.venue !== null && (
              <span className="flex items-center gap-1">
                <MapPin aria-hidden className="size-3.5" />
                {view.event.venue}
              </span>
            )}
            {view.event.address !== null && <span className="basis-full text-white/80">{view.event.address}</span>}
          </span>
        </div>
        <div className="relative mt-5 flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-3xl font-semibold tracking-tight tabular">{s.available === 0 && s.sold > 0 ? t.allSold : t.soldOf(s.sold, s.tickets)}</span>
            <span className="text-sm font-medium text-white/90 tabular">{percent}%</span>
          </div>
          <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={t.soldOf(s.sold, s.tickets)} className="h-2.5 overflow-hidden rounded-full bg-white/20">
            <div className="h-full rounded-full bg-white transition-[width] duration-500" style={{ width: `${String(percent)}%` }} />
          </div>
          <span className="flex flex-wrap gap-2 pt-1">
            <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium">{t.withYou(s.available)}</span>
            {s.unsold > 0 && <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium">{t.returned(s.unsold)}</span>}
            {s.lost > 0 && <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium">{t.lost(s.lost)}</span>}
          </span>
        </div>
      </section>

      {view.boxOffice && (
        <p role="note" className="flex items-start gap-3 rounded-2xl border border-brand/30 bg-brand-soft px-4 py-3 text-sm leading-relaxed text-brand-soft-fg">
          <Store aria-hidden className="mt-0.5 size-4 shrink-0" />
          {t.boxOffice}
        </p>
      )}

      {s.amountDueCents !== null && s.balanceCents !== null && (
        <section className="flex flex-col gap-3 rounded-3xl border border-border bg-surface p-5 shadow-xs">
          <h2 className="flex items-center gap-2 text-base font-semibold text-fg">
            <HandCoins aria-hidden className="size-[18px] text-brand" />
            {t.money.title}
          </h2>
          {view.receivers.length > 0 && (
            <p className="-mt-1 text-sm text-fg-muted">{t.money.receiver(listNames(view.receivers))}</p>
          )}
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div className="flex flex-col gap-0.5 rounded-2xl bg-surface-2 p-3">
              <dt className="text-[11px] font-medium text-fg-muted">{t.money.due}</dt>
              <dd className="text-base font-semibold text-fg tabular">{money(s.amountDueCents)}</dd>
              <dd className="text-[10px] text-fg-subtle tabular">
                {s.dueLines.length === 1 && s.dueLines[0]?.priceCents != null
                  ? t.money.dueHint(s.dueTickets, money(s.dueLines[0].priceCents))
                  : t.money.byCategory}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5 rounded-2xl bg-surface-2 p-3">
              <dt className="text-[11px] font-medium text-fg-muted">{t.money.received}</dt>
              <dd className="text-base font-semibold text-success-fg tabular">{money(s.receivedCents)}</dd>
            </div>
            <div className={cn("flex flex-col gap-0.5 rounded-2xl p-3", s.balanceCents > 0 ? "bg-warning-soft" : "bg-success-soft")}>
              <dt className="text-[11px] font-medium text-fg-muted">{t.money.outstanding}</dt>
              <dd className={cn("text-base font-semibold tabular", s.balanceCents > 0 ? "text-warning-fg" : "text-success-fg")}>
                {money(Math.max(s.balanceCents, 0))}
              </dd>
            </div>
          </dl>
          {s.dueLines.length > 1 && (
            <ul className="flex flex-col gap-1.5 rounded-2xl bg-surface-2 px-3 py-2.5 text-xs">
              {s.dueLines.map((line) => (
                <li key={line.category ?? ""} className="flex items-center justify-between gap-2 tabular">
                  <span className="flex min-w-0 items-center gap-1.5 text-fg">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: line.color ?? "var(--border-strong)" }} aria-hidden />
                    <span className="truncate">
                      {line.tickets.toLocaleString("pt-BR")} {line.category ?? t.money.noCategory}
                    </span>
                  </span>
                  <span className="shrink-0 text-fg-muted">
                    {line.priceCents === null ? "—" : line.priceCents === 0 ? t.money.free : `× ${money(line.priceCents)}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="flex items-start gap-1.5 text-xs leading-relaxed text-fg-muted">
            {s.balanceCents <= 0 && s.dueTickets > 0 && <CheckCircle2 aria-hidden className="mt-px size-3.5 shrink-0 text-success-fg" />}
            {s.balanceCents < 0 ? t.money.overpaid(money(-s.balanceCents)) : s.balanceCents === 0 && s.dueTickets > 0 ? t.money.settled : t.money.explain}
          </p>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <div role="radiogroup" aria-label={t.metaTitle} className="grid grid-cols-3 gap-1 rounded-2xl border border-border bg-surface p-1">
          {(["available", "sold", "all"] as const).map((option) => {
            const count = option === "available" ? s.available : option === "sold" ? s.sold : s.tickets;
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={filter === option}
                onClick={() => {
                  setFilter(option);
                }}
                className={cn(
                  "rounded-xl px-2 py-2 text-sm font-medium transition pointer-coarse:py-2.5",
                  filter === option ? "bg-surface-2 text-fg shadow-xs ring-1 ring-border" : "text-fg-muted hover:text-fg",
                )}
              >
                {t.filters[option]} <span className="text-fg-subtle tabular">{count}</span>
              </button>
            );
          })}
        </div>

        {filter === "sold" ? (
          shown.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border-strong px-4 py-8 text-center text-sm text-fg-muted">{t.emptySold}</p>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
              {shown.map((cell) => (
                <li key={cell.number}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(cell);
                    }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface-2 active:bg-surface-2"
                  >
                    <span className="rounded-lg bg-brand-soft px-2 py-1 font-mono text-sm font-semibold text-brand-soft-fg tabular">{pad(cell.number)}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-fg">{cell.sale?.buyerName ?? <span className="text-fg-subtle">{t.noBuyer}</span>}</span>
                    {cell.sale?.buyerPhone !== null && cell.sale?.buyerPhone !== undefined && (
                      <span className="hidden text-xs text-fg-muted sm:block">{cell.sale.buyerPhone}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : shown.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border-strong px-4 py-8 text-center text-sm text-fg-muted">{t.emptyAvailable}</p>
        ) : (
          <>
            <p className={cn("text-xs", canceled ? "font-medium text-danger-fg" : "text-fg-muted")}>{canceled ? t.canceledNoSales : t.gridHint}</p>
            {legend.length > 0 && (
              <ul aria-label={t.categoriesLegend} className="flex flex-wrap gap-1.5">
                {legend.map((category) => (
                  <li key={category.name} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-fg-muted">
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: category.color }} aria-hidden />
                    {category.name}
                    {category.priceCents !== null && <span className="text-fg-subtle">{category.priceCents === 0 ? t.money.free : money(category.priceCents)}</span>}
                  </li>
                ))}
              </ul>
            )}
            <ul className="grid grid-cols-5 gap-2 sm:grid-cols-8">
              {shown.map((cell) => {
                const tappable = (cell.state === "available" && !canceled) || cell.state === "sold";
                const category = categoryOf(view.categories, cell.number);
                return (
                  <li key={cell.number}>
                    <button
                      type="button"
                      disabled={!tappable}
                      title={category === null ? t.states[cell.state] : `${category.name} · ${t.states[cell.state]}`}
                      aria-label={`${pad(cell.number)} · ${category === null ? "" : `${category.name} · `}${t.states[cell.state]}`}
                      onClick={() => {
                        if (cell.state === "sold") {
                          setSelected(cell);
                        } else {
                          openMark(String(cell.number));
                        }
                      }}
                      className={cn(
                        "relative flex h-12 w-full items-center justify-center rounded-xl border font-mono text-sm font-semibold tabular transition active:scale-95 disabled:cursor-default",
                        TILE[cell.state],
                      )}
                    >
                      {pad(cell.number)}
                      {cell.state === "sold" && <Check aria-hidden className="absolute top-1 right-1 size-3" strokeWidth={3} />}
                      {category !== null && (
                        <span aria-hidden className="absolute inset-x-2 bottom-1 h-[3px] rounded-full" style={{ backgroundColor: category.color }} />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
            {cells.length >= 2_000 && <p className="text-xs text-fg-subtle">{t.tooMany(cells.length)}</p>}
          </>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-fg">{t.payments}</h2>
        {view.payments.length === 0 ? (
          <p className="text-sm text-fg-muted">{t.paymentsEmpty}</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {view.payments.map((payment, index) => (
              <li key={`${payment.receivedOn}-${String(index)}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="text-fg-muted">
                  {texts.event.sellers.methods[payment.method]} · {payment.receivedOn.split("-").reverse().slice(0, 2).join("/")}
                </span>
                <span className="font-semibold text-fg tabular">{money(payment.amountCents)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <OrganizationContact organization={view.organization} message={t.contactMessage(view.event.name, view.seller)} />

      <footer className="flex flex-col items-center gap-1 pt-2 text-center text-xs text-fg-subtle">
        <span className="flex items-center gap-1.5">
          <ShieldCheck aria-hidden className="size-3.5" />
          {t.privacy}
        </span>
        <span>{t.by(view.organization.name)}</span>
      </footer>

      {s.available > 0 && !canceled && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg/90 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl">
          <div className="mx-auto max-w-xl">
            <Button
              size="lg"
              icon={<Plus />}
              className="w-full"
              onClick={() => {
                openMark();
              }}
            >
              {t.mark}
            </Button>
          </div>
        </div>
      )}

      {/* Mounted only while open, so each opening starts from its own values. */}
      {marking !== null && (
        <MarkSheet
          key={`${marking.numbers}|${marking.name}|${marking.phone}`}
          open
          onClose={() => {
            setMarking(null);
          }}
          token={token}
          view={view}
          cells={cells}
          initial={marking}
          onSaved={(fresh) => {
            setState({ status: "ready", view: fresh });
          }}
        />
      )}
      <SaleSheet
        cell={selected === null ? null : (cells.find((cell) => cell.number === selected.number && cell.state === "sold") ?? null)}
        onClose={() => {
          setSelected(null);
        }}
        onEdit={
          canceled
            ? null
            : (cell) => {
                openMark(String(cell.number), cell.sale?.buyerName ?? "", cell.sale?.buyerPhone ?? "");
              }
        }
        token={token}
        digits={digits}
        eventName={view.event.name}
        canSendTickets={view.canSendTickets && !canceled}
        onSaved={(fresh) => {
          setState({ status: "ready", view: fresh });
        }}
      />
    </div>
  );
}
