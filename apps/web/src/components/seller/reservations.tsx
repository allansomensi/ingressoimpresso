"use client";

/**
 * Reservations on the seller's page (ADR 0072): who each number is held for and until when, the
 * ones ending within a day first, with the WhatsApp reminder one tap away.
 */
import type { ReservationDto, SellerViewDto } from "@ingressoimpresso/api-types";
import { AlarmClock, BookmarkCheck, Check, ChevronDown, Clock, MessageCircle, Pencil, Trash2, UserRound, X } from "lucide-react";
import { useState } from "react";

import { Badge, Button, Dialog, buttonClass } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatRanges } from "@/lib/number-list";
import { deadlineLabel, isActive, isDueSoon, reminderMessage, timeLeft } from "@/lib/reservations";
import { whatsappLink } from "@/lib/settlement";
import { texts } from "@/texts/pt-BR";

const t = texts.sellerPage.reservations;

type Actions = {
  onOpen: (reservation: ReservationDto) => void;
  onSell: (reservation: ReservationDto) => void;
  onDismiss: (reservation: ReservationDto) => void;
};

/** The reminder link: the person's WhatsApp with the message written. */
function reminderLink(reservation: ReservationDto, view: SellerViewDto, now: Date): string {
  return whatsappLink(
    reservation.holderPhone,
    reminderMessage({ reservation, eventName: view.event.name, seller: view.seller, digits: view.numberDigits, now }),
  );
}

function ReminderButton({ reservation, view, now, className, small }: { reservation: ReservationDto; view: SellerViewDto; now: Date; className: string; small?: boolean }) {
  return (
    <a
      href={reminderLink(reservation, view, now)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t.remindLabel(reservation.holderName)}
      className={buttonClass({
        ...(small === true ? { size: "sm" as const } : {}),
        className: cn("bg-success-solid shadow-none hover:bg-success-solid/90 active:bg-success-solid/80", className),
      })}
    >
      <MessageCircle aria-hidden />
      {t.remind}
    </a>
  );
}

function ActiveCard({ reservation, view, now, canceled, onOpen, onSell }: { reservation: ReservationDto; view: SellerViewDto; now: Date; canceled: boolean } & Omit<Actions, "onDismiss">) {
  const soon = isDueSoon(reservation, now);
  return (
    <li
      className={cn(
        "flex flex-col gap-3 rounded-2xl border p-3.5 transition",
        soon ? "border-warning/40 bg-warning-soft/60" : "border-border bg-surface",
      )}
    >
      <button
        type="button"
        onClick={() => {
          onOpen(reservation);
        }}
        className="-m-1 flex items-start gap-3 rounded-xl p-1 text-left transition hover:bg-surface-2/60 active:bg-surface-2/60"
      >
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-full",
            soon ? "bg-warning-soft text-warning-fg ring-1 ring-warning/30" : "bg-brand-soft text-brand-soft-fg",
          )}
        >
          {soon ? <AlarmClock aria-hidden className="size-5" /> : <UserRound aria-hidden className="size-5" />}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center justify-between gap-2">
            <span className="truncate font-semibold text-fg">{reservation.holderName}</span>
            <span className="shrink-0 font-mono text-sm font-semibold text-fg tabular">{formatRanges(reservation.numbers, view.numberDigits)}</span>
          </span>
          <span className={cn("flex flex-wrap items-center gap-x-1.5 text-xs", soon ? "font-medium text-warning-fg" : "text-fg-muted")}>
            <Clock aria-hidden className="size-3.5" />
            {t.until(deadlineLabel(reservation.expiresAt, now))}
            <span aria-hidden>·</span>
            {timeLeft(reservation.expiresAt, now)}
          </span>
          {reservation.byOrganizer && <span className="text-xs text-fg-subtle">{t.byOrganizer}</span>}
        </span>
      </button>
      {!canceled && (
        <div className="flex gap-2">
          <ReminderButton reservation={reservation} view={view} now={now} className="flex-1" small />
          <Button
            size="sm"
            variant="secondary"
            icon={<Check />}
            aria-label={t.sellLabel(reservation.holderName)}
            className="flex-1"
            onClick={() => {
              onSell(reservation);
            }}
          >
            {t.sell}
          </Button>
        </div>
      )}
    </li>
  );
}

/** The seller's reservations: active ones by deadline, then the recently expired, folded. */
export function ReservationsSection({ view, now, canceled, ...actions }: { view: SellerViewDto; now: Date; canceled: boolean } & Actions) {
  const [showExpired, setShowExpired] = useState(false);
  const active = view.reservations.filter((reservation) => isActive(reservation, now));
  const expired = view.reservations.filter((reservation) => !isActive(reservation, now));
  if (active.length === 0 && expired.length === 0) {
    return null;
  }
  const soon = active.filter((reservation) => isDueSoon(reservation, now));
  const later = active.filter((reservation) => !isDueSoon(reservation, now));
  return (
    <section aria-labelledby="seller-reservations" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="seller-reservations" className="flex items-center gap-2 text-base font-semibold text-fg">
          <BookmarkCheck aria-hidden className="size-[18px] text-brand" />
          {t.title}
        </h2>
        {active.length > 0 && <span className="text-sm text-fg-muted tabular">{active.length}</span>}
      </div>
      {soon.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold tracking-wide text-warning-fg uppercase">{t.dueSoon}</span>
          <ul className="flex flex-col gap-2">
            {soon.map((reservation) => (
              <ActiveCard key={reservation.id} reservation={reservation} view={view} now={now} canceled={canceled} onOpen={actions.onOpen} onSell={actions.onSell} />
            ))}
          </ul>
        </div>
      )}
      {later.length > 0 && (
        <ul className="flex flex-col gap-2">
          {later.map((reservation) => (
            <ActiveCard key={reservation.id} reservation={reservation} view={view} now={now} canceled={canceled} onOpen={actions.onOpen} onSell={actions.onSell} />
          ))}
        </ul>
      )}
      {expired.length > 0 && (
        <div className="flex flex-col gap-2 rounded-2xl border border-dashed border-border-strong p-1">
          <button
            type="button"
            aria-expanded={showExpired}
            onClick={() => {
              setShowExpired(!showExpired);
            }}
            className="flex min-h-11 items-center justify-between gap-2 rounded-xl px-3 text-left text-sm font-medium text-fg-muted transition hover:bg-surface-2 active:bg-surface-2"
          >
            {t.expiredTitle(expired.length)}
            <ChevronDown aria-hidden className={cn("size-4 transition-transform", showExpired && "rotate-180")} />
          </button>
          {showExpired && (
            <div className="flex flex-col gap-2 px-2 pb-2 animate-fade-in">
              <p className="text-xs leading-relaxed text-fg-muted">{t.expiredHint}</p>
              <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface">
                {expired.map((reservation) => (
                  <li key={reservation.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-fg">{reservation.holderName}</span>
                        <span className="font-mono text-xs text-fg-muted tabular">{formatRanges(reservation.numbers, view.numberDigits)}</span>
                      </span>
                      <span className="text-xs text-fg-subtle">{texts.reservations.expired} · {deadlineLabel(reservation.expiresAt, now)}</span>
                    </span>
                    <span className="flex gap-2">
                      {!canceled && (
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={<Check />}
                          className="flex-1 sm:flex-none"
                          onClick={() => {
                            actions.onSell(reservation);
                          }}
                        >
                          {t.sellLate}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Trash2 />}
                        className="flex-1 sm:flex-none"
                        onClick={() => {
                          actions.onDismiss(reservation);
                        }}
                      >
                        {t.dismiss}
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** One reservation: the person, the reminder and what to do with it. */
export function ReservationSheet({
  reservation,
  view,
  now,
  canceled,
  onClose,
  onSell,
  onEdit,
  onCancel,
}: {
  reservation: ReservationDto | null;
  view: SellerViewDto;
  now: Date;
  canceled: boolean;
  onClose: () => void;
  onSell: (reservation: ReservationDto) => void;
  onEdit: (reservation: ReservationDto) => void;
  onCancel: (reservation: ReservationDto) => void;
}) {
  const open = reservation !== null;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={reservation === null ? "" : reservation.holderName}
      description={
        reservation === null
          ? undefined
          : `${t.numbers(formatRanges(reservation.numbers, view.numberDigits))} · ${t.until(deadlineLabel(reservation.expiresAt, now))}`
      }
      footer={
        reservation !== null && (
          <>
            <Button
              variant="danger-ghost"
              icon={<X />}
              onClick={() => {
                onCancel(reservation);
              }}
            >
              {t.cancel}
            </Button>
            {!canceled && (
              <Button
                variant="secondary"
                icon={<Pencil />}
                onClick={() => {
                  onEdit(reservation);
                }}
              >
                {t.edit}
              </Button>
            )}
          </>
        )
      }
    >
      {reservation !== null && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-soft-fg">
              <UserRound aria-hidden className="size-5" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-semibold text-fg">{reservation.holderName}</span>
              <span className="text-sm text-fg-muted">{reservation.holderPhone ?? texts.sellerPage.noBuyer}</span>
            </span>
            {isDueSoon(reservation, now) ? (
              <Badge tone="warning" dot>
                {timeLeft(reservation.expiresAt, now)}
              </Badge>
            ) : (
              <Badge tone="neutral">{timeLeft(reservation.expiresAt, now)}</Badge>
            )}
          </div>
          {reservation.byOrganizer && <p className="text-xs text-fg-muted">{t.byOrganizer}</p>}
          {!canceled && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <ReminderButton reservation={reservation} view={view} now={now} className="sm:flex-1" />
              <Button
                icon={<Check />}
                className="sm:flex-1"
                onClick={() => {
                  onSell(reservation);
                }}
              >
                {t.sellLabel(reservation.holderName.split(/\s+/)[0] ?? reservation.holderName)}
              </Button>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
