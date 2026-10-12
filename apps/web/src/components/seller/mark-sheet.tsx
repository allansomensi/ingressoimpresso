"use client";

/**
 * The sheet where the seller writes down a sale or a reservation (ADRs 0053, 0072): one or more
 * numbers, the person, and for a reservation the deadline. It checks against what the page knows
 * and hands a change to the queue (ADR 0074); the server checks again when it arrives.
 */
import type { ReservationDto, SellerOp, SellerViewDto } from "@ingressoimpresso/api-types";
import { BookmarkPlus, Check, UserRound } from "lucide-react";
import { useState, type FormEvent } from "react";

import { DeadlinePicker, useDeadline } from "@/components/seller/deadline-picker";
import { Button, Dialog, Field, Input } from "@/components/ui";
import { cn } from "@/lib/cn";
import { firstOutside, firstShared, formatRanges, parseNumberList, type NumberRange } from "@/lib/number-list";
import { newId } from "@/lib/seller-offline";
import { nextAvailable, padNumber, type NumberCell } from "@/lib/seller-page";
import { texts } from "@/texts/pt-BR";

const t = texts.sellerPage;
const s = t.sheet;

export type SheetMode = "sell" | "reserve";

/** What the sheet opens with. */
export type SheetStart = {
  mode: SheetMode;
  numbers: string;
  name: string;
  phone: string;
  /** Editing this reservation (its person or deadline): the mode stays "reserve". */
  reservation?: ReservationDto;
  /** Changing the buyer of numbers sold already. */
  edit?: boolean;
};

/** Every number of `ranges`. */
function each(ranges: readonly NumberRange[]): number[] {
  return ranges.flatMap((range) => Array.from({ length: range.last - range.first + 1 }, (_, index) => range.first + index));
}

export function MarkSheet({
  view,
  cells,
  start,
  canReserve,
  now,
  onClose,
  onSubmit,
}: {
  view: SellerViewDto;
  cells: readonly NumberCell[];
  start: SheetStart;
  canReserve: boolean;
  now: Date;
  onClose: () => void;
  /** The change, and the toast that says it was written down. */
  onSubmit: (op: SellerOp, done: string) => void;
}) {
  const editing = start.reservation;
  const [mode, setMode] = useState<SheetMode>(editing === undefined ? start.mode : "reserve");
  const [numbers, setNumbers] = useState(start.numbers);
  const [name, setName] = useState(start.name);
  const [phone, setPhone] = useState(start.phone);
  const picker = useDeadline(now, view.event.utcOffsetMinutes, view.event.endsAt, editing?.expiresAt);
  const { deadline, error: deadlineError } = picker;
  const digits = view.numberDigits;
  const pad = (number: number) => padNumber(number, digits);
  const reserving = mode === "reserve";

  const parsed = parseNumberList(numbers);
  const byNumber = new Map(cells.map((cell) => [cell.number, cell]));
  const voids = view.voids.map(({ first, last }) => ({ first, last }));
  let problem: string | null = null;
  let updating = false;
  let reservation: ReservationDto | null = null;
  if (!parsed.ok) {
    problem = parsed.error === "invalid" ? s.errors.invalid(parsed.token ?? "") : parsed.error === "too_many" ? s.errors.tooMany : null;
  } else {
    const outside = firstOutside(parsed.ranges, view.ranges);
    const voided = outside === null ? firstShared(parsed.ranges, voids) : null;
    problem = outside !== null ? s.errors.outside(pad(outside)) : voided !== null ? s.errors.voided(pad(voided)) : null;
    if (problem === null) {
      const touched = each(parsed.ranges).map((number) => byNumber.get(number));
      const held = new Map<string, ReservationDto>();
      for (const cell of touched) {
        if (cell?.reservation != null && cell.reservation.id !== editing?.id) {
          held.set(cell.reservation.id, cell.reservation);
        }
      }
      if (reserving) {
        const sold = touched.find((cell) => cell?.state === "sold");
        const other = touched.find((cell) => cell?.reservation != null && cell.reservation.id !== editing?.id);
        problem =
          sold !== undefined
            ? s.errors.sold(pad(sold.number))
            : other?.reservation != null
              ? s.errors.reservedOther(pad(other.number), other.reservation.holderName)
              : null;
      } else {
        updating = touched.some((cell) => cell?.state === "sold");
        if (held.size > 1) {
          problem = s.errors.manyReservations;
        } else {
          reservation = [...held.values()][0] ?? null;
        }
      }
    }
  }

  const holderMissing = reserving && name.trim() === "";
  const valid = parsed.ok && problem === null && (!reserving || (!holderMissing && deadlineError === null));
  const next = nextAvailable(cells);
  const count = parsed.ok ? parsed.count : 0;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!parsed.ok || !valid) {
      return;
    }
    const buyerName = name.trim() === "" ? (reservation?.holderName ?? null) : name.trim();
    const buyerPhone = phone.trim() === "" ? (reservation?.holderPhone ?? null) : phone.trim();
    if (reserving && deadline !== null) {
      onSubmit(
        {
          kind: "reserve",
          reservationId: editing?.id ?? newId(),
          ranges: parsed.ranges,
          holderName: name.trim(),
          holderPhone: phone.trim() === "" ? null : phone.trim(),
          expiresAt: deadline,
        },
        editing === undefined ? t.reservations.savedToast(count) : t.reservations.updatedToast,
      );
    } else {
      onSubmit(
        {
          kind: "mark",
          ranges: parsed.ranges,
          buyerName,
          buyerPhone,
          edit: start.edit === true || updating,
          reservationId: reservation?.id ?? null,
        },
        s.savedToast(count),
      );
    }
    onClose();
  };

  const label = reserving
    ? count > 1
      ? s.reserveNumbersPlural
      : s.reserveNumbers
    : count > 1
      ? s.numbersPlural
      : s.numbers;

  return (
    <Dialog
      open
      onClose={onClose}
      title={reserving ? s.reserveTitle : s.title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {texts.common.cancel}
          </Button>
          <Button type="submit" form="seller-mark" disabled={!valid} icon={reserving ? <BookmarkPlus /> : <Check />}>
            {reserving
              ? parsed.ok && valid
                ? s.reserveSubmit(count)
                : s.reserveSubmitEmpty
              : parsed.ok && valid
                ? s.submit(count)
                : s.submitEmpty}
          </Button>
        </>
      }
    >
      <form id="seller-mark" onSubmit={submit} className="flex flex-col gap-5">
        {canReserve && editing === undefined && start.edit !== true && (
          <div role="radiogroup" aria-label={s.modesLabel} className="grid grid-cols-2 gap-1 rounded-2xl bg-surface-2 p-1">
            {(["sell", "reserve"] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={mode === option}
                onClick={() => {
                  setMode(option);
                }}
                className={cn(
                  "flex h-10 items-center justify-center gap-2 rounded-xl text-sm font-medium transition pointer-coarse:h-11 [&_svg]:size-4",
                  mode === option ? "bg-surface text-fg shadow-xs ring-1 ring-border" : "text-fg-muted hover:text-fg active:text-fg",
                )}
              >
                {option === "sell" ? <Check aria-hidden /> : <BookmarkPlus aria-hidden />}
                {s.modes[option]}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-col gap-2">
          <Field
            label={label}
            hint={
              problem !== null ? (
                <span className="text-danger-fg">{problem}</span>
              ) : parsed.ok ? (
                <span className="font-medium text-fg">
                  {s.preview(parsed.count, formatRanges(parsed.ranges, digits))}
                  {!reserving && reservation !== null && (
                    <span className="block font-normal text-brand-soft-fg">{s.reservedFor(reservation.holderName)}</span>
                  )}
                  {!reserving && updating && <span className="block font-normal text-fg-muted">{s.updating}</span>}
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
              readOnly={editing !== undefined}
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
              className="relative w-fit rounded-full border border-brand/25 bg-brand-soft px-3 py-1 font-mono text-[13px] font-medium text-brand-soft-fg tabular touch-target active:border-brand/50"
            >
              {s.next(pad(next))}
            </button>
          )}
        </div>
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-fg">
            <UserRound aria-hidden className="size-4 text-fg-subtle" />
            {reserving ? s.holder : s.buyer}
            {!reserving && <span className="text-xs font-normal text-fg-subtle">({texts.common.optional})</span>}
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={reserving ? s.holderName : s.buyerName}>
              <Input
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                }}
                placeholder={reserving ? s.holderPlaceholder : (reservation?.holderName ?? s.buyerNamePlaceholder)}
                autoComplete="off"
                maxLength={80}
                required={reserving}
              />
            </Field>
            <Field label={reserving ? s.holderPhone : s.buyerPhone}>
              <Input
                value={phone}
                onChange={(event) => {
                  setPhone(event.target.value);
                }}
                placeholder={reservation?.holderPhone ?? s.buyerPhonePlaceholder}
                inputMode="tel"
                autoComplete="off"
                maxLength={30}
              />
            </Field>
          </div>
          <p className="text-xs leading-relaxed text-fg-muted">{reserving ? s.holderHint : s.buyerHint}</p>
        </fieldset>
        {reserving && <DeadlinePicker state={picker} />}
      </form>
    </Dialog>
  );
}
