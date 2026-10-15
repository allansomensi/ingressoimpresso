"use client";

/**
 * Reservations (ADR 0072), goals and ranking (ADR 0073) on the Sellers tab: what the organizer
 * sees and does for each seller, and the ranking of everyone with their goals.
 */
import type {
  EventDto,
  ReportRowDto,
  ReservationBody,
  ReservationDto,
  SellerDto,
  SellerGoalBody,
  SellerGoalsBody,
  SellerGoalsDto,
  SellerSettingsBody,
  SellerSettingsDto,
} from "@ingressoimpresso/api-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlarmClock, Bookmark, BookmarkPlus, Check, Clock, MessageCircle, MoreHorizontal, Pencil, Target, Trophy, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { DeadlinePicker, useDeadline } from "@/components/seller/deadline-picker";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Dialog,
  ErrorMessage,
  Field,
  Input,
  Menu,
  MenuItem,
  NumberInput,
  Switch,
  buttonClass,
  errorMessage,
  useConfirm,
} from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { offsetMinutes } from "@/lib/event-time";
import { initials, ticketNumber } from "@/lib/format";
import { NUMBER_LIST_INPUT, firstOutside, formatRanges, parseNumberList } from "@/lib/number-list";
import { deadlineLabel, isActive, isDueSoon, reminderMessage, timeLeft } from "@/lib/reservations";
import { goalPercent, goalTotals, rankSellers } from "@/lib/seller-goals";
import { whatsappLink } from "@/lib/settlement";
import { common as commonTexts } from "@/texts/pt-BR/common";
import { useEventTexts } from "@/components/event/access";
import { sellerPage as sellerPageTexts } from "@/texts/pt-BR/seller-page";


// Goals ------------------------------------------------------------------------------------------

/** One seller's goal. */
export function GoalDialog({ open, onClose, seller, onSaved }: { open: boolean; onClose: () => void; seller: SellerDto; onSaved: () => void }) {
  const t = useEventTexts().sellers;
  const g = t.goal;
  const [goal, setGoal] = useState(seller.goal ?? 20);
  const save = useMutation({
    mutationFn: (value: number | null) => {
      const body: SellerGoalBody = { goal: value };
      return api<undefined>(`/api/sellers/${seller.id}/goal`, { method: "PUT", body });
    },
    onSuccess: (_, value) => {
      toast.success(value === null ? g.removedToast : g.savedToast);
      onSaved();
      onClose();
    },
  });
  const valid = Number.isInteger(goal) && goal >= 1 && goal <= 100_000;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (valid) {
      save.mutate(goal);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={g.title(seller.name)}
      description={g.description}
      size="sm"
      footer={
        <>
          {seller.goal !== null && (
            <Button
              variant="danger-ghost"
              icon={<X />}
              loading={save.isPending && save.variables === null}
              onClick={() => {
                save.mutate(null);
              }}
            >
              {g.remove}
            </Button>
          )}
          <Button type="submit" form="seller-goal" loading={save.isPending && save.variables !== null} disabled={!valid} icon={<Target />}>
            {g.set}
          </Button>
        </>
      }
    >
      <form id="seller-goal" onSubmit={submit} className="flex flex-col gap-4">
        <Field label={g.field}>
          <NumberInput value={goal} min={1} max={100_000} step={1} onChange={setGoal} required />
        </Field>
        <ErrorMessage error={save.error} />
      </form>
    </Dialog>
  );
}

/** One goal for every seller (box offices aside). */
function GoalsAllDialog({ open, onClose, eventId, onSaved }: { open: boolean; onClose: () => void; eventId: string; onSaved: () => void }) {
  const t = useEventTexts().sellers;
  const g = t.goalsAll;
  const [goal, setGoal] = useState(20);
  const [onlyMissing, setOnlyMissing] = useState(false);
  const save = useMutation({
    mutationFn: () => {
      const body: SellerGoalsBody = { goal, onlyMissing };
      return api<SellerGoalsDto>(`/api/events/${eventId}/sellers/goals`, { method: "POST", body });
    },
    onSuccess: (result) => {
      toast.success(g.savedToast(result.updated));
      onSaved();
      onClose();
    },
  });
  const valid = Number.isInteger(goal) && goal >= 1 && goal <= 100_000;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={g.title}
      description={g.description}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {commonTexts.cancel}
          </Button>
          <Button type="submit" form="sellers-goal" loading={save.isPending} disabled={!valid} icon={<Target />}>
            {g.submit(goal)}
          </Button>
        </>
      }
    >
      <form
        id="sellers-goal"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) {
            save.mutate();
          }
        }}
        className="flex flex-col gap-4"
      >
        <Field label={g.field}>
          <NumberInput value={goal} min={1} max={100_000} step={1} onChange={setGoal} required />
        </Field>
        <Switch checked={onlyMissing} onChange={setOnlyMissing} label={g.onlyMissing} description={onlyMissing ? g.onlyMissingOn : g.onlyMissingHint} />
        <ErrorMessage error={save.error} />
      </form>
    </Dialog>
  );
}

/** "Meta: 12 de 20" under a seller, with the way to set or change it. */
export function GoalLine({ seller, sold, editable, onEdit }: { seller: SellerDto; sold: number; editable: boolean; onEdit: () => void }) {
  const t = useEventTexts().sellers;
  const g = t.goal;
  if (seller.goal === null) {
    return editable ? (
      <Button variant="ghost" size="sm" icon={<Target />} className="self-start" onClick={onEdit}>
        {g.set}
      </Button>
    ) : null;
  }
  const percent = goalPercent(sold, seller.goal) ?? 0;
  const reached = sold >= seller.goal;
  return (
    <div className="flex items-center gap-3">
      <Target aria-hidden className={cn("size-4 shrink-0", reached ? "text-success-fg" : "text-brand")} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center justify-between gap-2 text-sm">
          <span className="text-fg-muted">
            <span className="font-medium text-fg">{g.label}</span> · <span className="tabular">{sellerPageTexts.goal.progress(sold, seller.goal)}</span>
          </span>
          {reached && <Badge tone="success">{g.reached}</Badge>}
        </span>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label={g.progress(sold, seller.goal)}
          className="h-1.5 overflow-hidden rounded-full bg-surface-3"
        >
          <div className={cn("h-full rounded-full", reached ? "bg-success" : "bg-brand")} style={{ width: `${String(percent)}%` }} />
        </div>
      </div>
      {editable && (
        <Button variant="ghost" size="icon-sm" aria-label={g.change} onClick={onEdit}>
          <Pencil />
        </Button>
      )}
    </div>
  );
}

/** Everyone's sales and goals, and whether sellers see the ranking. */
export function RankingCard({
  eventId,
  sellers,
  rows,
  editable,
  onChange,
}: {
  eventId: string;
  sellers: readonly SellerDto[];
  rows: ReadonlyMap<string | null, ReportRowDto>;
  editable: boolean;
  onChange: () => void;
}) {
  const t = useEventTexts().sellers;
  const r = t.ranking;
  const queryClient = useQueryClient();
  const [bulk, setBulk] = useState(false);
  const key = ["seller-settings", eventId];
  const settings = useQuery({ queryKey: key, queryFn: () => api<SellerSettingsDto>(`/api/events/${eventId}/seller-settings`) });
  const save = useMutation({
    mutationFn: (body: SellerSettingsBody) => api<SellerSettingsDto>(`/api/events/${eventId}/seller-settings`, { method: "PUT", body }),
    onSuccess: (saved) => {
      queryClient.setQueryData(key, saved);
      toast.success(r.savedToast(saved.ranking));
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
  const ranked = rankSellers(sellers, rows);
  if (ranked.length === 0) {
    return null;
  }
  const totals = goalTotals(ranked);
  const anySale = ranked.some((entry) => entry.sold > 0);
  const showing = save.isPending ? (save.variables.ranking ?? false) : (settings.data?.ranking ?? false);
  return (
    <Card>
      <CardHeader
        title={r.title}
        description={totals.withGoal > 0 ? `${r.description} ${r.goals(totals.reached, totals.withGoal)}.` : r.description}
        icon={Trophy}
        actions={
          editable && (
            <Button
              variant="secondary"
              size="sm"
              icon={<Target />}
              onClick={() => {
                setBulk(true);
              }}
            >
              {t.goalsAll.action}
            </Button>
          )
        }
      />
      {!anySale && <p className="mb-4 rounded-xl bg-surface-2 px-4 py-3 text-sm text-fg-muted">{r.empty}</p>}
      <ol className="flex flex-col divide-y divide-border rounded-xl border border-border">
        {ranked.map((entry) => (
          <li key={entry.seller.id} className="flex items-center gap-3 px-3 py-2.5">
            <span
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular",
                entry.position === 1 ? "bg-warning-soft text-warning-fg ring-1 ring-warning/30" : entry.position === null ? "text-fg-subtle" : "bg-surface-2 text-fg",
              )}
            >
              {entry.position === null ? r.unranked : r.position(entry.position)}
            </span>
            <span className="hidden size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand-soft-fg sm:flex">
              {initials(entry.seller.name)}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-medium text-fg">{entry.seller.name}</span>
                <span className="shrink-0 text-sm text-fg-muted tabular">
                  {entry.seller.goal === null ? r.sold(entry.sold) : t.goal.progress(entry.sold, entry.seller.goal)}
                </span>
              </span>
              {entry.percent !== null && (
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={entry.percent}
                  aria-label={t.goal.progress(entry.sold, entry.seller.goal ?? 0)}
                  className="h-1.5 overflow-hidden rounded-full bg-surface-3"
                >
                  <div className={cn("h-full rounded-full", entry.percent >= 100 ? "bg-success" : "bg-brand")} style={{ width: `${String(entry.percent)}%` }} />
                </div>
              )}
            </span>
          </li>
        ))}
      </ol>
      {sellers.some((seller) => seller.boxOffice) && <p className="mt-2 text-xs text-fg-subtle">{r.boxOfficeOut}</p>}
      {editable && settings.data !== undefined && (
        <div className="mt-4 border-t border-border pt-4">
          <Switch
            checked={showing}
            onChange={(checked) => {
              if (!save.isPending) {
                save.mutate({ ranking: checked });
              }
            }}
            label={r.show}
            description={showing ? r.showOn : r.showOff}
          />
        </div>
      )}
      <GoalsAllDialog
        open={bulk}
        onClose={() => {
          setBulk(false);
        }}
        eventId={eventId}
        onSaved={onChange}
      />
    </Card>
  );
}

// Reservations -----------------------------------------------------------------------------------

/** The organizer reserves numbers of a seller for a person. */
export function ReserveDialog({
  open,
  onClose,
  seller,
  event,
  reservations,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  seller: SellerDto;
  event: EventDto;
  /** The event's reservations, to say which numbers are taken. */
  reservations: readonly ReservationDto[];
  onSaved: () => void;
}) {
  const t = useEventTexts().sellers;
  const r = t.reservations;
  const [now] = useState(() => new Date());
  const [numbers, setNumbers] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const picker = useDeadline(now, offsetMinutes(event.startsAt), event.endsAt);
  const parsed = parseNumberList(numbers);
  let problem: string | null = null;
  if (!parsed.ok) {
    problem = parsed.error === "invalid" ? t.giveBackDialog.errors.invalid(parsed.token ?? "") : parsed.error === "too_many" ? t.giveBackDialog.errors.tooMany : null;
  } else {
    const outside = firstOutside(parsed.ranges, seller.ranges);
    const taken = reservations
      .filter((item) => isActive(item, now))
      .find((item) => parsed.ranges.some((range) => item.numbers.some((other) => range.first <= other.last && other.first <= range.last)));
    problem =
      outside !== null
        ? t.giveBackDialog.errors.outside(ticketNumber(outside))
        : taken !== undefined
          ? sellerPageTexts.sheet.errors.reservedOther(formatRanges(taken.numbers), taken.holderName)
          : null;
  }
  const valid = parsed.ok && problem === null && name.trim() !== "" && picker.error === null && picker.deadline !== null;
  const close = () => {
    setNumbers("");
    setName("");
    setPhone("");
    save.reset();
    onClose();
  };
  const save = useMutation({
    mutationFn: (body: ReservationBody) => api<ReservationDto>(`/api/sellers/${seller.id}/reservations`, { method: "POST", body }),
    onSuccess: () => {
      toast.success(r.savedToast);
      onSaved();
      close();
    },
  });
  const submit = (formEvent: FormEvent) => {
    formEvent.preventDefault();
    if (parsed.ok && valid && picker.deadline !== null) {
      save.mutate({ ranges: parsed.ranges, holderName: name.trim(), holderPhone: phone.trim() === "" ? null : phone.trim(), expiresAt: picker.deadline });
    }
  };
  return (
    <Dialog
      open={open}
      onClose={close}
      title={r.dialogTitle(seller.name)}
      description={r.dialogDescription}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            {commonTexts.cancel}
          </Button>
          <Button type="submit" form="seller-reserve" loading={save.isPending} disabled={!valid} icon={<BookmarkPlus />}>
            {parsed.ok && valid ? r.submit(parsed.count) : r.submitEmpty}
          </Button>
        </>
      }
    >
      <form id="seller-reserve" onSubmit={submit} className="flex flex-col gap-5">
        <Field
          label={r.numbers}
          hint={
            problem !== null ? (
              <span className="text-danger-fg">{problem}</span>
            ) : parsed.ok ? (
              <span className="font-medium text-fg">{sellerPageTexts.sheet.preview(parsed.count, formatRanges(parsed.ranges))}</span>
            ) : (
              r.numbersHint
            )
          }
        >
          <Input
            value={numbers}
            onChange={(event) => {
              setNumbers(event.target.value);
            }}
            placeholder={seller.ranges[0] === undefined ? "" : String(seller.ranges[0].first)}
            {...NUMBER_LIST_INPUT}
            aria-invalid={problem !== null}
            className="font-mono tabular"
            required
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={r.holder}>
            <Input
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
              placeholder={r.holderPlaceholder}
              maxLength={80}
              required
            />
          </Field>
          <Field label={r.phone} optional>
            <Input
              value={phone}
              onChange={(event) => {
                setPhone(event.target.value);
              }}
              placeholder={t.phonePlaceholder}
              inputMode="tel"
              maxLength={30}
            />
          </Field>
        </div>
        <DeadlinePicker state={picker} />
        <ErrorMessage error={save.error} />
      </form>
    </Dialog>
  );
}

/** A seller's reservations on their card: who, which numbers, until when, and what to do. */
export function SellerReservations({
  seller,
  event,
  reservations,
  editable,
  onChange,
}: {
  seller: SellerDto;
  event: EventDto;
  reservations: readonly ReservationDto[];
  editable: boolean;
  onChange: () => void;
}) {
  const t = useEventTexts().sellers;
  const r = t.reservations;
  const confirm = useConfirm();
  const [now] = useState(() => new Date());
  const sell = useMutation({
    mutationFn: (id: string) => api<undefined>(`/api/reservations/${id}/sell`, { method: "POST" }),
    onSuccess: () => {
      toast.success(r.soldToast);
      onChange();
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api<undefined>(`/api/reservations/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success(r.canceledToast);
      onChange();
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
  const active = reservations.filter((item) => isActive(item, now));
  if (active.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-2">
      <span className="flex items-center gap-1.5 text-xs font-medium text-fg-muted">
        <Bookmark aria-hidden className="size-3.5" />
        {r.title} ({active.length})
      </span>
      <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
        {active.map((item) => {
          const soon = isDueSoon(item, now);
          return (
            <li key={item.id} className={cn("flex items-center gap-3 px-3 py-2.5", soon && "bg-warning-soft/50")}>
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full",
                  soon ? "bg-warning-soft text-warning-fg" : "bg-surface-2 text-fg-muted",
                )}
              >
                {soon ? <AlarmClock aria-hidden className="size-4" /> : <Clock aria-hidden className="size-4" />}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-baseline gap-2">
                  <span className="truncate text-sm font-medium text-fg">{item.holderName}</span>
                  <span className="shrink-0 font-mono text-xs text-fg-muted tabular">{formatRanges(item.numbers)}</span>
                </span>
                <span className={cn("truncate text-xs", soon ? "font-medium text-warning-fg" : "text-fg-muted")}>
                  {sellerPageTexts.reservations.until(deadlineLabel(item.expiresAt, now))} · {timeLeft(item.expiresAt, now)}
                  {item.byOrganizer && ` · ${r.byOrganizer}`}
                </span>
              </span>
              <Menu label={item.holderName} trigger={<MoreHorizontal />} triggerClassName={buttonClass({ variant: "ghost", size: "icon-sm" })}>
                <MenuItem
                  icon={<MessageCircle />}
                  onSelect={() => {
                    window.open(
                      whatsappLink(item.holderPhone, reminderMessage({ reservation: item, eventName: event.name, seller: seller.name, digits: 4, now })),
                      "_blank",
                      "noopener,noreferrer",
                    );
                  }}
                >
                  {r.remind}
                </MenuItem>
                {editable && (
                  <MenuItem
                    icon={<Check />}
                    onSelect={() => {
                      sell.mutate(item.id);
                    }}
                  >
                    {r.sell}
                  </MenuItem>
                )}
                {editable && (
                  <MenuItem
                    icon={<X />}
                    tone="danger"
                    onSelect={() => {
                      void confirm({ title: r.cancelTitle(item.holderName), description: r.cancelBody, confirmLabel: r.cancel }).then((ok) => {
                        if (ok) {
                          cancel.mutate(item.id);
                        }
                      });
                    }}
                  >
                    {r.cancel}
                  </MenuItem>
                )}
              </Menu>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
