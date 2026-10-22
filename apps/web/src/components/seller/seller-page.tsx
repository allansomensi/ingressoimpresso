"use client";

import type { ReservationDto, SellerOp, SellerTicketBody, SellerViewDto } from "@ingressoimpresso/api-types";
import { AlertTriangle, Award, Bookmark, BookmarkPlus, CalendarDays, Check, CheckCircle2, Copy, Gift, HandCoins, Landmark, MapPin, Megaphone, MessageCircle, Pencil, Plus, RefreshCw, RotateCcw, ShieldCheck, Smartphone, Store, Ticket, UserRound, WifiOff } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { LogoMark } from "@/components/brand";
import { EventChangeNotice, OrganizationContact, OrganizationLogo } from "@/components/organization/organization";
import { CashierSection } from "@/components/seller/cashier";
import { GoalCard } from "@/components/seller/goal-card";
import { MarkSheet, type SheetStart } from "@/components/seller/mark-sheet";
import { ReservationSheet, ReservationsSection } from "@/components/seller/reservations";
import { SalePix, salePixCharge } from "@/components/seller/sale-pix";
import { SellerKind, useSellerTexts } from "@/components/seller/seller-texts";
import { NoticesDialog, PendingList, SyncStatus } from "@/components/seller/sync-status";
import { useSellerSync } from "@/components/seller/use-seller-sync";
import { Button, Dialog, Spinner, buttonClass, segmentTabIndex, segmentedKeys, useConfirm } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { categoryOf } from "@/lib/categories";
import { cn } from "@/lib/cn";
import { changeKind } from "@/lib/event-change";
import { eventDateTime, money, shortDateTime } from "@/lib/format";
import { countNumbers, intersect } from "@/lib/number-list";
import { pendingNumbers } from "@/lib/seller-offline";
import { forKind } from "@/lib/event-kind";
import { numberCells, padNumber, type NumberCell, type NumberState } from "@/lib/seller-page";
import { commissionLabel, whatsappLink } from "@/lib/settlement";
import { copyText } from "@/lib/share";
import { sessionLabel } from "@/lib/series";
import { listNames } from "@/lib/team";
import { textOn } from "@/lib/ticket-pass";
import { brand as brandTexts } from "@/texts/pt-BR/brand";
import { errors as errorsTexts } from "@/texts/pt-BR/errors";
import { event as eventTexts } from "@/texts/pt-BR/event";
import { pix as pixTexts } from "@/texts/pt-BR/pix";
import { sellerPage as sellerPageTexts } from "@/texts/pt-BR/seller-page";


type Filter = "available" | "sold" | "all";

function Centered({ children }: { children: ReactNode }) {
  return <div className="m-auto flex max-w-sm flex-col items-center gap-4 px-6 py-16 text-center animate-rise">{children}</div>;
}

/** What the number grid shows: the numbers still with the seller, the sold ones or all. */
const FILTERS = ["available", "sold", "all"] as const;

const TILE: Record<NumberState, string> = {
  available: "border-border-strong bg-surface text-fg hover:border-brand hover:bg-brand-soft active:border-brand active:bg-brand-soft",
  sold: "border-transparent bg-brand-solid text-brand-fg shadow-sm shadow-brand/25",
  reserved: "border-warning/50 bg-warning-soft text-warning-fg hover:border-warning active:border-warning",
  unsold: "border-dashed border-border bg-transparent text-fg-subtle line-through",
  lost: "border-dashed border-danger/30 bg-danger-soft/40 text-danger-fg line-through",
  revoked: "border-dashed border-border bg-transparent text-fg-subtle line-through",
};

/** The sold number's digital ticket (ADR 0061): created on demand, then sent by WhatsApp. */
function SaleTicket({
  cell,
  token,
  label,
  eventName,
  ready,
  onSaved,
}: {
  cell: NumberCell;
  token: string;
  label: string;
  eventName: string;
  /** The sale reached the server and there is a connection: the ticket can be created. */
  ready: boolean;
  onSaved: (view: SellerViewDto) => void;
}) {
  const t = useSellerTexts();
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
      toast.error(error instanceof ApiError ? error.userMessage : errorsTexts.generic);
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
          <p className="text-xs leading-relaxed text-fg-muted">{url === null ? (ready ? t.sale.ticketHint : t.offline.ticketOffline) : t.sale.ticketSent}</p>
        </div>
      </div>
      {url === null ? (
        <Button variant="secondary" icon={ready ? <Smartphone /> : <WifiOff />} loading={busy} disabled={!ready} onClick={() => void create()} className="w-full">
          {ready ? t.sale.ticketCreate : t.offline.needsInternet}
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

/** A sold number: its buyer, the Pix, the digital ticket and the way back. */
function SaleSheet({
  cell,
  view,
  onClose,
  onEdit,
  onUndo,
  token,
  digits,
  eventName,
  canSendTickets,
  ticketReady,
  onSaved,
}: {
  cell: NumberCell | null;
  view: SellerViewDto;
  onClose: () => void;
  /** `null` when sales can no longer change (canceled event). */
  onEdit: ((cell: NumberCell) => void) | null;
  onUndo: (cell: NumberCell) => void;
  token: string;
  digits: number;
  eventName: string;
  canSendTickets: boolean;
  ticketReady: boolean;
  onSaved: (view: SellerViewDto) => void;
}) {
  const t = useSellerTexts();
  const confirm = useConfirm();
  const sale = cell?.sale ?? null;
  const label = cell === null ? "" : padNumber(cell.number, digits);

  const undo = async () => {
    if (cell === null || !(await confirm({ title: t.sale.undoTitle(label), description: t.sale.undoBody, confirmLabel: t.sale.undo }))) {
      return;
    }
    onUndo(cell);
    onClose();
  };

  return (
    <Dialog
      open={cell !== null}
      onClose={onClose}
      title={t.sale.title(label)}
      description={sale === null ? undefined : t.sale.soldAt(shortDateTime(sale.soldAt))}
      footer={
        <>
          {/* A sale whose Pix arrived stays: the organization undoes the receipt first (ADR 0085). */}
          {sale?.pixReceipt == null && (
            <Button variant="danger-ghost" icon={<RotateCcw />} onClick={() => void undo()}>
              {t.sale.undo}
            </Button>
          )}
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
            className="flex size-11 items-center justify-center rounded-full bg-success-solid text-white active:bg-success-solid/80"
          >
            <MessageCircle className="size-5" aria-hidden />
          </a>
        )}
      </div>
      {cell !== null && <SalePix cell={cell} view={view} token={token} label={label} ready={ticketReady} onSaved={onSaved} />}
      {cell !== null && (canSendTickets || (cell.sale?.ticketUrl ?? null) !== null) && (
        <SaleTicket cell={cell} token={token} label={label} eventName={eventName} ready={ticketReady} onSaved={onSaved} />
      )}
    </Dialog>
  );
}

export function SellerPage() {
  const sync = useSellerSync();
  const { token, phase, view, serverView, queue, now, enqueue } = sync;
  // The page provides the kind to its sheets below; its own words come from the data.
  const t = forKind(sellerPageTexts, sellerPageTexts.tokens, view?.event.kind);
  const confirm = useConfirm();
  const [filter, setFilter] = useState<Filter>("available");
  const [sheet, setSheet] = useState<SheetStart | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [reservationId, setReservationId] = useState<string | null>(null);

  const cells = useMemo(() => (view === null ? [] : numberCells(view, now)), [view, now]);
  const pending = useMemo(() => (view === null ? new Set<number>() : pendingNumbers(queue, view)), [queue, view]);
  const eventName = view?.event.name ?? null;
  useEffect(() => {
    if (eventName !== null) {
      document.title = `${sellerPageTexts.metaTitle} · ${eventName}`;
    }
  }, [eventName]);

  if (phase === "loading" || (phase === "ready" && view === null)) {
    return (
      <Centered>
        <div role="status" className="flex flex-col items-center gap-4">
          <Spinner />
          <p className="text-sm text-fg-muted">{t.loading}</p>
        </div>
      </Centered>
    );
  }
  if (phase !== "ready" || token === null || view === null) {
    // The server answered with a failure (maintenance, an error): not "no internet".
    const server = phase === "error" && sync.problem !== null;
    const title = phase === "not-found" ? t.notFoundTitle : phase === "error" ? (server ? t.errorServerTitle : t.errorTitle) : t.noTokenTitle;
    const body =
      phase === "not-found"
        ? t.notFound
        : phase === "error"
          ? sync.problem === "maintenance"
            ? errorsTexts.maintenance
            : server
              ? t.errorServer
              : t.error
          : t.noToken;
    return (
      <Centered>
        <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-soft text-brand-soft-fg">
          {phase === "error" ? (
            server ? (
              <AlertTriangle className="size-7" aria-hidden />
            ) : (
              <WifiOff className="size-7" aria-hidden />
            )
          ) : (
            <Ticket className="size-7" aria-hidden />
          )}
        </span>
        <h1 className="text-xl font-semibold tracking-tight text-fg">{title}</h1>
        <p className="text-[15px] leading-relaxed text-fg-muted">{body}</p>
        {phase === "error" && (
          <Button variant="secondary" icon={<RefreshCw />} onClick={() => void sync.sync()} loading={sync.syncing}>
            {t.retry}
          </Button>
        )}
        {phase === "not-found" && <PendingList queue={queue} view={serverView} />}
      </Centered>
    );
  }

  const s = view.summary;
  const digits = view.numberDigits;
  const pad = (number: number) => padNumber(number, digits);
  const percent = s.tickets === 0 ? 0 : Math.round((s.sold / s.tickets) * 100);
  // Only the categories of the seller's own numbers.
  const legend = view.categories.filter((category) => intersect(category.ranges, view.ranges).length > 0);
  // "Com você" is everything still in the seller's hands, reserved or not.
  const shown = cells.filter((cell) =>
    filter === "all" ? true : filter === "sold" ? cell.state === "sold" : cell.state === "available" || cell.state === "reserved",
  );
  const firstName = view.seller.trim().split(/\s+/)[0] ?? view.seller;
  // A canceled event takes no more sales (ADR 0065): the page only shows what was done.
  const canceled = changeKind(view.event.change, view.event.startsAt) === "canceled";
  // A box office sells at the door (ADR 0069): no reservations, no goal.
  const canReserve = !view.boxOffice && !canceled;
  // The organization's colour (ADR 0064) when white text reads on it; the site's otherwise.
  const brand = view.organization.brandColor;
  const heroColor = brand !== null && textOn(brand) === "#ffffff" ? brand : null;
  const withYou = s.available + s.reserved;
  // Courtesies (ADR 0096) are a line of their own; what is paid is the rest.
  const paidLines = s.dueLines.filter((line) => !line.courtesy);
  const hasCategories = s.dueLines.some((line) => line.category !== null);
  const selectedCell = selected === null ? null : (cells.find((cell) => cell.number === selected && cell.state === "sold") ?? null);
  const reservation = view.reservations.find((item) => item.id === reservationId) ?? null;
  // The digital ticket and the Pix receipt need the sale on the server and a connection.
  const ticketReady =
    sync.online && selectedCell !== null && serverView?.sales.some((sale) => sale.number === selectedCell.number) === true && !pending.has(selectedCell.number);

  const submit = (op: SellerOp, done: string) => {
    enqueue(op);
    toast.success(done);
  };
  // Selling one number of an event that charges by Pix opens it, with the QR for the buyer.
  const submitSale = (op: SellerOp, done: string) => {
    submit(op, done);
    const first = op.kind === "mark" && !op.edit && countNumbers(op.ranges) === 1 ? op.ranges[0]?.first : undefined;
    if (first !== undefined && salePixCharge(view, first, pad(first)) !== null) {
      setSelected(first);
    }
  };
  const openSheet = (start: Partial<SheetStart> & Pick<SheetStart, "mode">) => {
    setSelected(null);
    setReservationId(null);
    setSheet({ numbers: "", name: "", phone: "", ...start });
  };
  const sellReservation = (item: ReservationDto) => {
    setReservationId(null);
    submit(
      { kind: "mark", ranges: item.numbers, buyerName: item.holderName, buyerPhone: item.holderPhone, edit: false, reservationId: item.id },
      t.reservations.sold(item.numbers.reduce((sum, range) => sum + range.last - range.first + 1, 0)),
    );
  };
  const cancelReservation = async (item: ReservationDto, dismiss: boolean) => {
    if (!dismiss && !(await confirm({ title: t.reservations.cancelTitle(item.holderName), description: t.reservations.cancelBody, confirmLabel: t.reservations.cancel }))) {
      return;
    }
    setReservationId(null);
    submit({ kind: "cancel_reservation", reservationId: item.id }, dismiss ? t.reservations.dismissedToast : t.reservations.canceledToast);
  };

  const page = (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5 px-4 pt-5 pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <header className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-semibold text-fg-muted">
          <LogoMark className="size-6" />
          {brandTexts.name}
        </span>
        <Button variant="ghost" size="sm" icon={<RefreshCw />} loading={sync.syncing} disabled={!sync.online} onClick={() => void sync.sync()}>
          {t.refresh}
        </Button>
      </header>

      <SyncStatus
        online={sync.online}
        syncing={sync.syncing}
        pending={queue.length}
        savedAt={sync.savedAt}
        problem={sync.problem}
        onRetry={() => void sync.sync()}
      />

      <EventChangeNotice change={view.event.change} startsAt={view.event.startsAt} kind={view.event.kind} forSeller />

      {/* The organizer's notice to every seller (ADR 0096), pinned on top. */}
      {view.notice !== null && (
        <section role="note" aria-label={t.notice.title} className="flex items-start gap-3 rounded-2xl border border-warning/30 bg-warning-soft px-4 py-3.5 text-warning-fg">
          <Megaphone aria-hidden className="mt-0.5 size-5 shrink-0" />
          <span className="flex min-w-0 flex-col gap-1">
            <span className="text-xs font-semibold tracking-wide uppercase opacity-85">{t.notice.title}</span>
            <span className="text-[15px] leading-relaxed font-medium break-words whitespace-pre-line">{view.notice.text}</span>
          </span>
        </section>
      )}

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
          {/* One of several dates (ADR 0077): this link sells this session only. */}
          {view.event.inSeries === true && (
            <span className="mt-1 w-fit rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold tracking-wide ring-1 ring-white/30">
              {sessionLabel(view.event.startsAt)}
            </span>
          )}
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
            <span className="text-3xl font-semibold tracking-tight tabular">{withYou === 0 && s.sold > 0 ? t.allSold : t.soldOf(s.sold, s.tickets)}</span>
            <span className="text-sm font-medium text-white/90 tabular">{percent}%</span>
          </div>
          <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={t.soldOf(s.sold, s.tickets)} className="h-2.5 overflow-hidden rounded-full bg-white/20">
            <div className="h-full rounded-full bg-white transition-[width] duration-500" style={{ width: `${String(percent)}%` }} />
          </div>
          <span className="flex flex-wrap gap-2 pt-1">
            <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium">{t.withYou(withYou)}</span>
            {s.reserved > 0 && <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium">{t.reservedCount(s.reserved)}</span>}
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

      {/* The token cashier (ADR 0098): the counter before the list of numbers. */}
      <CashierSection
        view={view}
        now={now}
        token={token}
        online={sync.online}
        pending={queue.length}
        canceled={canceled}
        enqueue={enqueue}
        onClosed={sync.replaceView}
      />

      <GoalCard goal={view.goal} sold={s.sold} ranking={view.ranking} />

      <ReservationsSection
        view={view}
        now={now}
        canceled={canceled}
        onOpen={(item) => {
          setReservationId(item.id);
        }}
        onSell={sellReservation}
        onDismiss={(item) => void cancelReservation(item, true)}
      />

      {s.amountDueCents !== null && s.balanceCents !== null && (
        <section className="flex flex-col gap-3 rounded-3xl border border-border bg-surface p-5 shadow-xs">
          <h2 className="flex items-center gap-2 text-base font-semibold text-fg">
            <HandCoins aria-hidden className="size-[18px] text-brand" />
            {t.money.title}
          </h2>
          {view.receivers.length > 0 && <p className="-mt-1 text-sm text-fg-muted">{t.money.receiver(listNames(view.receivers))}</p>}
          {/* One amount per row on a phone; three boxes side by side once they fit (R$ 1.234,00). */}
          <dl className="grid gap-2 min-[420px]:grid-cols-3 min-[420px]:text-center">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 rounded-2xl bg-surface-2 p-3 min-[420px]:flex-col min-[420px]:flex-nowrap min-[420px]:items-center min-[420px]:justify-start">
              <dt className="text-xs font-medium text-fg-muted min-[420px]:text-[11px]">{t.money.due}</dt>
              <dd className="text-base font-semibold text-fg tabular">{money(s.amountDueCents)}</dd>
              <dd className="w-full text-[11px] text-fg-subtle tabular min-[420px]:w-auto">
                {paidLines.length === 1 && paidLines[0]?.priceCents != null
                  ? t.money.dueHint(paidLines[0].tickets, money(paidLines[0].priceCents))
                  : t.money.byCategory}
              </dd>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 rounded-2xl bg-surface-2 p-3 min-[420px]:flex-col min-[420px]:flex-nowrap min-[420px]:items-center min-[420px]:justify-start">
              <dt className="text-xs font-medium text-fg-muted min-[420px]:text-[11px]">{t.money.received}</dt>
              <dd className="text-base font-semibold text-success-fg tabular">{money(s.receivedCents)}</dd>
            </div>
            <div className={cn("flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 rounded-2xl p-3 min-[420px]:flex-col min-[420px]:flex-nowrap min-[420px]:items-center min-[420px]:justify-start", s.balanceCents > 0 ? "bg-warning-soft" : "bg-success-soft")}>
              <dt className="text-xs font-medium text-fg-muted min-[420px]:text-[11px]">{t.money.outstanding}</dt>
              <dd className={cn("text-base font-semibold tabular", s.balanceCents > 0 ? "text-warning-fg" : "text-success-fg")}>{money(Math.max(s.balanceCents, 0))}</dd>
            </div>
          </dl>
          {s.dueLines.length > 1 && (
            <ul className="flex flex-col gap-1.5 rounded-2xl bg-surface-2 px-3 py-2.5 text-xs">
              {s.dueLines.map((line) => (
                <li key={`${line.category ?? ""}-${String(line.courtesy)}`} className="flex items-center justify-between gap-2 tabular">
                  <span className="flex min-w-0 items-center gap-1.5 text-fg">
                    {line.courtesy ? (
                      <Gift className="size-3 shrink-0 text-fg-muted" aria-hidden />
                    ) : (
                      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: line.color ?? "var(--border-strong)" }} aria-hidden />
                    )}
                    <span className="truncate">
                      {line.courtesy
                        ? t.money.courtesies(line.tickets, line.category)
                        : line.category === null && !hasCategories
                          ? t.money.tickets(line.tickets)
                          : `${line.tickets.toLocaleString("pt-BR")} ${line.category ?? t.money.noCategory}`}
                    </span>
                  </span>
                  <span className="shrink-0 text-fg-muted">
                    {line.courtesy ? t.money.courtesyFree : line.priceCents === null ? "—" : line.priceCents === 0 ? t.money.free : `× ${money(line.priceCents)}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {/* What the seller keeps (ADR 0096): already off what is left to hand over. */}
          {view.commission !== null && s.commissionCents !== null && s.commissionCents > 0 && (
            <p className="flex items-center gap-1.5 rounded-2xl bg-success-soft px-3 py-2 text-xs font-medium text-success-fg">
              <Award aria-hidden className="size-3.5 shrink-0" />
              {t.money.commission(commissionLabel(view.commission, t.money.perUnit), money(s.commissionCents))}
            </p>
          )}
          {s.pixCents > 0 && (
            <p className="flex items-center gap-1.5 text-xs text-fg-muted">
              <Landmark aria-hidden className="size-3.5 shrink-0 text-success-fg" />
              {pixTexts.summaryPix(money(s.pixCents))}
            </p>
          )}
          <p className="flex items-start gap-1.5 text-xs leading-relaxed text-fg-muted">
            {s.balanceCents <= 0 && s.dueTickets > 0 && <CheckCircle2 aria-hidden className="mt-px size-3.5 shrink-0 text-success-fg" />}
            {s.balanceCents < 0 ? t.money.overpaid(money(-s.balanceCents)) : s.balanceCents === 0 && s.dueTickets > 0 ? t.money.settled : t.money.explain}
          </p>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <div
          role="radiogroup"
          aria-label={t.filtersLabel}
          onKeyDown={segmentedKeys(FILTERS, filter, setFilter)}
          className="grid grid-cols-3 gap-1 rounded-2xl border border-border bg-surface p-1"
        >
          {FILTERS.map((option) => {
            const count = option === "available" ? withYou : option === "sold" ? s.sold : s.tickets;
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={filter === option}
                tabIndex={segmentTabIndex(FILTERS, filter, option)}
                onClick={() => {
                  setFilter(option);
                }}
                className={cn(
                  "rounded-xl px-2 py-2 text-sm font-medium transition pointer-coarse:min-h-11 pointer-coarse:py-2.5",
                  filter === option ? "bg-surface-2 text-fg shadow-xs ring-1 ring-border" : "text-fg-muted hover:text-fg active:text-fg",
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
                      setSelected(cell.number);
                    }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface-2 active:bg-surface-2"
                  >
                    <span className="rounded-lg bg-brand-soft px-2 py-1 font-mono text-sm font-semibold text-brand-soft-fg tabular">{pad(cell.number)}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-fg">{cell.sale?.buyerName ?? <span className="text-fg-subtle">{t.noBuyer}</span>}</span>
                    {cell.sale?.pixReceipt != null && (
                      <span
                        title={pixTexts.sellerPaidChipLabel}
                        className="flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-semibold text-success-fg"
                      >
                        <CheckCircle2 aria-hidden className="size-3" />
                        {pixTexts.sellerPaidChip}
                        <span className="sr-only">{` · ${pixTexts.sellerPaidChipLabel}`}</span>
                      </span>
                    )}
                    {pending.has(cell.number) && (
                      <span className="flex items-center gap-1 text-xs text-warning-fg">
                        <WifiOff aria-hidden className="size-3.5" />
                        <span className="sr-only">{t.offline.pendingTile}</span>
                      </span>
                    )}
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
                const tappable = (cell.state === "available" && !canceled) || cell.state === "sold" || cell.state === "reserved";
                const category = categoryOf(view.categories, cell.number);
                const waiting = pending.has(cell.number);
                const state = cell.state === "reserved" && cell.reservation !== null ? `${t.states.reserved} · ${cell.reservation.holderName}` : t.states[cell.state];
                return (
                  <li key={cell.number}>
                    <button
                      type="button"
                      disabled={!tappable}
                      title={category === null ? state : `${category.name} · ${state}`}
                      aria-label={`${pad(cell.number)} · ${category === null ? "" : `${category.name} · `}${state}${waiting ? ` · ${t.offline.pendingTile}` : ""}`}
                      onClick={() => {
                        if (cell.state === "sold") {
                          setSelected(cell.number);
                        } else if (cell.state === "reserved" && cell.reservation !== null) {
                          setReservationId(cell.reservation.id);
                        } else {
                          openSheet({ mode: "sell", numbers: String(cell.number) });
                        }
                      }}
                      className={cn(
                        "relative flex h-12 w-full items-center justify-center rounded-xl border font-mono text-sm font-semibold tabular transition active:scale-95 disabled:cursor-default",
                        TILE[cell.state],
                      )}
                    >
                      {pad(cell.number)}
                      {cell.state === "sold" && <Check aria-hidden className="absolute top-1 right-1 size-3" strokeWidth={3} />}
                      {cell.state === "reserved" && <Bookmark aria-hidden className="absolute top-1 right-1 size-3" strokeWidth={2.5} />}
                      {waiting && <span aria-hidden className="absolute top-1 left-1 size-1.5 animate-pulse rounded-full bg-warning" />}
                      {category !== null && <span aria-hidden className="absolute inset-x-2 bottom-1 h-[3px] rounded-full" style={{ backgroundColor: category.color }} />}
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
                  {eventTexts.sellers.methods[payment.method]} · {payment.receivedOn.split("-").reverse().slice(0, 2).join("/")}
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
          <div className="mx-auto flex max-w-xl gap-2">
            {canReserve && (
              <Button
                size="lg"
                variant="secondary"
                icon={<BookmarkPlus />}
                className="flex-1"
                onClick={() => {
                  openSheet({ mode: "reserve" });
                }}
              >
                {t.reserve}
              </Button>
            )}
            <Button
              size="lg"
              icon={<Plus />}
              className={canReserve ? "flex-[1.4]" : "w-full"}
              onClick={() => {
                openSheet({ mode: "sell" });
              }}
            >
              {t.mark}
            </Button>
          </div>
        </div>
      )}

      {/* Mounted only while open, so each opening starts from its own values. */}
      {sheet !== null && (
        <MarkSheet
          key={`${sheet.mode}|${sheet.numbers}|${sheet.name}|${sheet.reservation?.id ?? ""}`}
          view={view}
          cells={cells}
          start={sheet}
          canReserve={canReserve}
          now={now}
          onClose={() => {
            setSheet(null);
          }}
          onSubmit={submitSale}
        />
      )}
      <SaleSheet
        cell={selectedCell}
        view={view}
        onClose={() => {
          setSelected(null);
        }}
        onEdit={
          canceled
            ? null
            : (cell) => {
                openSheet({ mode: "sell", numbers: String(cell.number), name: cell.sale?.buyerName ?? "", phone: cell.sale?.buyerPhone ?? "", edit: true });
              }
        }
        onUndo={(cell) => {
          submit({ kind: "unmark", number: cell.number }, t.sale.undoneToast);
        }}
        token={token}
        digits={digits}
        eventName={view.event.name}
        canSendTickets={view.canSendTickets && !canceled}
        ticketReady={ticketReady}
        onSaved={sync.replaceView}
      />
      <ReservationSheet
        reservation={reservation}
        view={view}
        now={now}
        canceled={canceled}
        onClose={() => {
          setReservationId(null);
        }}
        onSell={sellReservation}
        onEdit={(item) => {
          openSheet({
            mode: "reserve",
            numbers: item.numbers.map((range) => (range.first === range.last ? String(range.first) : `${String(range.first)}-${String(range.last)}`)).join(", "),
            name: item.holderName,
            phone: item.holderPhone ?? "",
            reservation: item,
          });
        }}
        onCancel={(item) => void cancelReservation(item, false)}
      />
      <NoticesDialog notices={sync.notices} onClose={sync.dismissNotices} />
    </div>
  );
  // The sheets speak of fichas on a consumption-token event (ADR 0086).
  return <SellerKind.Provider value={view.event.kind}>{page}</SellerKind.Provider>;
}
