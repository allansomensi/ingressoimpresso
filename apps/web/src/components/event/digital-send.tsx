"use client";

import type {
  CategoryDto,
  CreateTicketLinkBody,
  IssueTicketsBody,
  IssuedTicketsDto,
  MarkTicketsSentBody,
  TicketLinkDto,
  TicketLinksDto,
  UpdateTicketLinkBody,
} from "@ingressoimpresso/api-types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronLeft, ChevronRight, Copy, ExternalLink, Hash, Layers, MessageCircle, Minus, PartyPopper, Plus, Send, TriangleAlert, X } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";

import { useEventTexts } from "@/components/event/access";
import { QrCode } from "@/components/qr";
import { Button, Card, Dialog, ErrorMessage, Field, Input, buttonClass } from "@/components/ui";
import type { ButtonSize } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { MAX_ORDER_QUANTITY, normalizePhone, ticketsMessage, type Recipient } from "@/lib/digital-tickets";
import { phoneLabel } from "@/lib/format";
import { copyText, whatsappUrl } from "@/lib/share";
import { common as commonTexts } from "@/texts/pt-BR/common";
import { errors as errorsTexts } from "@/texts/pt-BR/errors";

/** A category's name by id (`null`: none). */
export type CategoryName = (id: string | null) => string | null;

/** The colour of a number's category, for its chip. */
export type CategoryColor = (id: string | null) => string | null;

/**
 * Marks links as sent (ADR 0123): the list shows it at once and the server keeps it, so the next
 * person on the panel knows who still waits.
 */
export function useMarkSent(eventId: string) {
  const queryClient = useQueryClient();
  const key = ["tickets", eventId];
  return useMutation({
    mutationFn: (ids: readonly string[]) => {
      const body: MarkTicketsSentBody = { ids: [...ids] };
      return api(`/api/events/${eventId}/tickets/sent`, { method: "POST", body });
    },
    onMutate: (ids) => {
      const now = new Date().toISOString();
      queryClient.setQueryData<TicketLinksDto>(key, (data) =>
        data === undefined ? data : { ...data, links: data.links.map((link) => (ids.includes(link.id) ? { ...link, sentAt: now } : link)) },
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

/** The WhatsApp message of a person's tickets, in the event's words. */
export function useTicketsMessage(eventName: string, categoryName: CategoryName) {
  const t = useEventTexts().digital;
  return (name: string | null, links: readonly TicketLinkDto[]) => ticketsMessage(t.words, name, eventName, links, categoryName);
}

/** A ticket number with the colour of its category. */
export function NumberChip({ label, color, className }: { label: string; color: string | null; className?: string }) {
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center overflow-hidden rounded-lg bg-surface-2 py-1.5 pr-2.5 pl-3 font-mono text-sm font-semibold text-fg tabular",
        className,
      )}
    >
      {color !== null && <span aria-hidden className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: color }} />}
      {label}
    </span>
  );
}

/** The WhatsApp button of a person's tickets: a real link (phones open the app), marked as sent. */
export function WhatsappButton({
  message,
  phone,
  ids,
  eventId,
  children,
  className,
  size,
  label,
  onSent,
}: {
  message: string;
  phone: string | null;
  ids: readonly string[];
  eventId: string;
  children: ReactNode;
  className?: string;
  size?: ButtonSize;
  /** The name of an icon-only button. */
  label?: string;
  onSent?: () => void;
}) {
  const markSent = useMarkSent(eventId);
  return (
    <a
      href={whatsappUrl(message, phone ?? undefined)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      onClick={() => {
        markSent.mutate(ids);
        onSent?.();
      }}
      className={buttonClass({
        ...(size === undefined ? {} : { size }),
        className: cn("bg-success-solid shadow-success/25 hover:bg-success-solid/90 active:bg-success-solid/90", className),
      })}
    >
      {children}
    </a>
  );
}

/** − 3 + : how many tickets, with buttons big enough for a thumb. */
function Stepper({ value, max, label, onChange }: { value: number; max: number; label: string; onChange: (value: number) => void }) {
  const clamp = (next: number) => Math.min(Math.max(next, 1), Math.max(max, 1));
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="secondary"
        size="icon"
        aria-label={`${label} −1`}
        disabled={value <= 1}
        onClick={() => {
          onChange(clamp(value - 1));
        }}
      >
        <Minus />
      </Button>
      <Input
        inputMode="numeric"
        aria-label={label}
        value={String(value)}
        className="w-20 text-center text-lg font-semibold tabular"
        onChange={(changeEvent) => {
          const typed = Number(changeEvent.target.value.replace(/\D/g, ""));
          onChange(clamp(Number.isFinite(typed) && typed > 0 ? typed : 1));
        }}
      />
      <Button
        variant="secondary"
        size="icon"
        aria-label={`${label} +1`}
        disabled={value >= max}
        onClick={() => {
          onChange(clamp(value + 1));
        }}
      >
        <Plus />
      </Button>
    </div>
  );
}

/** What a send made: the links, and who they are for. */
export interface Issued {
  links: TicketLinkDto[];
  name: string | null;
  phone: string | null;
}

/**
 * Tickets for one person (ADR 0123): the category, how many, the name, the WhatsApp and a note.
 * The numbers are the next free ones of the category; a specific number is one tap away.
 */
export function SendDialog({
  eventId,
  open,
  data,
  categories,
  onClose,
  onIssued,
  onNewBatch,
  initial,
}: {
  eventId: string;
  open: boolean;
  data: TicketLinksDto;
  categories: readonly CategoryDto[];
  onClose: () => void;
  onIssued: (issued: Issued) => void;
  onNewBatch: () => void;
  /** Filled in from someone of the waiting list (ADR 0124). */
  initial?: { categoryId: string | null; quantity: number; holder: string; phone: string } | undefined;
}) {
  const t = useEventTexts().digital;
  const queryClient = useQueryClient();
  const options = data.stock.map((stock) => ({ stock, category: categories.find((category) => category.id === stock.categoryId) ?? null }));
  const firstFree = options.find((option) => option.stock.free > 0)?.stock.categoryId;
  const [chosen, setChosen] = useState<string | null | undefined>(initial?.categoryId);
  const categoryId = chosen === undefined ? (firstFree ?? null) : chosen;
  const selected = options.find((option) => option.stock.categoryId === categoryId) ?? null;
  const free = selected?.stock.free ?? 0;
  const [quantity, setQuantity] = useState(initial?.quantity ?? 1);
  const [holder, setHolder] = useState(initial?.holder ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [note, setNote] = useState("");
  const [byNumber, setByNumber] = useState(false);
  const [number, setNumber] = useState("");
  const phoneDigits = normalizePhone(phone);
  const amount = byNumber ? 1 : Math.min(quantity, Math.max(free, 1));
  const label = (value: number) => String(value).padStart(data.numberDigits, "0");
  const totalFree = data.stock.reduce((sum, stock) => sum + stock.free, 0);
  const picker = categories.length > 0;

  const reset = () => {
    setQuantity(1);
    setHolder("");
    setPhone("");
    setNote("");
    setNumber("");
    setByNumber(false);
  };

  const create = useMutation({
    mutationFn: async (): Promise<TicketLinkDto[]> => {
      const name = holder.trim() === "" ? null : holder.trim();
      const digits = phoneDigits === false ? null : phoneDigits;
      const memo = note.trim() === "" ? null : note.trim();
      if (byNumber) {
        const body: CreateTicketLinkBody = { number: number === "" ? null : Number(number), holderName: name };
        let link = await api<TicketLinkDto>(`/api/events/${eventId}/tickets`, { method: "POST", body });
        if (digits !== null || memo !== null) {
          const update: UpdateTicketLinkBody = { holderName: name, holderPhone: digits ?? "", note: memo ?? "" };
          link = await api<TicketLinkDto>(`/api/ticket-links/${link.id}`, { method: "PUT", body: update });
        }
        return [link];
      }
      const body: IssueTicketsBody = { orders: [{ categoryId, quantity: amount, holderName: name, holderPhone: digits, note: memo }] };
      const issued = await api<IssuedTicketsDto>(`/api/events/${eventId}/tickets/issue`, { method: "POST", body });
      return issued.orders[0]?.links ?? [];
    },
    onSuccess: (links) => {
      onIssued({ links, name: links[0]?.holderName ?? null, phone: links[0]?.holderPhone ?? null });
      reset();
      void queryClient.invalidateQueries({ queryKey: ["tickets", eventId] });
      onClose();
    },
  });

  const canSubmit = phoneDigits !== false && (byNumber ? number !== "" || data.nextNumber !== null : free > 0);
  const submit = (formEvent: FormEvent) => {
    formEvent.preventDefault();
    if (canSubmit) {
      create.mutate();
    }
  };

  if (totalFree === 0 && !byNumber) {
    return (
      <Dialog
        open={open}
        onClose={onClose}
        size="sm"
        title={t.soldOutTitle}
        description={t.soldOut}
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              {commonTexts.close}
            </Button>
            <Button
              icon={<Layers />}
              onClick={() => {
                onClose();
                onNewBatch();
              }}
            >
              {t.newBatch}
            </Button>
          </>
        }
      />
    );
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t.sendTitle}
      description={t.sendHint}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {commonTexts.cancel}
          </Button>
          <Button type="submit" form="send-ticket-form" icon={<Send />} loading={create.isPending} disabled={!canSubmit}>
            {t.createMany(amount)}
          </Button>
        </>
      }
    >
      <form id="send-ticket-form" onSubmit={submit} className="flex flex-col gap-5">
        {byNumber ? (
          <Field label={t.number} hint={data.nextNumber === null ? t.numberNone : number === "" ? t.numberHint(label(data.nextNumber)) : undefined}>
            <Input
              inputMode="numeric"
              value={number}
              data-autofocus
              placeholder={data.nextNumber === null ? "" : label(data.nextNumber)}
              onChange={(changeEvent) => {
                setNumber(changeEvent.target.value.replace(/\D/g, ""));
                create.reset();
              }}
            />
          </Field>
        ) : (
          <>
            {picker && (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1.5 text-sm font-medium text-fg">{t.category}</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {options.map(({ stock, category }) => {
                    const id = stock.categoryId;
                    const checked = id === categoryId;
                    const soldOut = stock.free === 0;
                    return (
                      <label
                        key={id ?? "none"}
                        className={cn(
                          "relative flex min-h-14 cursor-pointer items-center gap-3 overflow-hidden rounded-xl border py-2.5 pr-3 pl-4 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand",
                          checked ? "border-brand bg-brand-soft/60" : "border-border hover:border-border-strong active:bg-surface-2",
                          soldOut && "cursor-not-allowed opacity-50",
                        )}
                      >
                        <span aria-hidden className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: category?.color ?? "transparent" }} />
                        <input
                          type="radio"
                          name="ticket-category"
                          className="sr-only"
                          checked={checked}
                          disabled={soldOut}
                          onChange={() => {
                            setChosen(id);
                            setQuantity((current) => Math.min(current, Math.max(stock.free, 1)));
                            create.reset();
                          }}
                        />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-sm font-semibold text-fg">{category?.name ?? t.categoryOther}</span>
                          <span className={cn("text-xs tabular", soldOut ? "text-danger-fg" : "text-fg-muted")}>{t.categoryFree(stock.free)}</span>
                        </span>
                        <span
                          aria-hidden
                          className={cn(
                            "flex size-5 shrink-0 items-center justify-center rounded-full border-2",
                            checked ? "border-brand bg-brand-solid text-white" : "border-border-strong",
                          )}
                        >
                          {checked && <Check className="size-3" strokeWidth={3} />}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            )}
            <Field label={t.quantity} hint={free > 1 ? t.quantityHint(free) : undefined}>
              <Stepper value={amount} max={Math.min(free, MAX_ORDER_QUANTITY)} label={t.quantity} onChange={setQuantity} />
            </Field>
          </>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.holder} optional>
            <Input
              value={holder}
              maxLength={80}
              autoComplete="off"
              placeholder={t.holderPlaceholder}
              onChange={(changeEvent) => {
                setHolder(changeEvent.target.value);
              }}
            />
          </Field>
          <Field
            label={t.phone}
            optional
            hint={phoneDigits === false ? <span className="text-danger-fg">{errorsTexts.invalid_whatsapp}</span> : t.phoneHint}
          >
            <Input
              type="tel"
              inputMode="tel"
              autoComplete="off"
              value={phone}
              aria-invalid={phoneDigits === false || undefined}
              placeholder={t.phonePlaceholder}
              onChange={(changeEvent) => {
                setPhone(changeEvent.target.value);
              }}
            />
          </Field>
        </div>
        <Field label={t.note} optional hint={t.noteHint}>
          <Input
            value={note}
            maxLength={200}
            autoComplete="off"
            placeholder={t.notePlaceholder}
            onChange={(changeEvent) => {
              setNote(changeEvent.target.value);
            }}
          />
        </Field>
        <button
          type="button"
          onClick={() => {
            setByNumber(!byNumber);
            create.reset();
          }}
          className="relative flex w-fit items-center gap-1.5 text-sm font-medium text-brand transition touch-target hover:underline active:underline"
        >
          <Hash className="size-4" aria-hidden />
          {byNumber ? t.autoNumber : t.pickNumber}
        </button>
        {byNumber && (
          <p className="flex items-start gap-2 text-xs leading-relaxed text-fg-muted">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
            {t.paperWarning}
          </p>
        )}
        <ErrorMessage error={create.error} />
      </form>
    </Dialog>
  );
}

/** What a send just made, ready to go: WhatsApp to the person, the message, another send. */
export function IssuedCard({
  eventId,
  issued,
  title,
  message,
  color,
  onClose,
  onAnother,
}: {
  eventId: string;
  issued: Issued;
  title: ReactNode;
  message: string;
  color: CategoryColor;
  onClose: () => void;
  onAnother?: () => void;
}) {
  const t = useEventTexts().digital;
  const markSent = useMarkSent(eventId);
  const [copied, setCopied] = useState(false);
  const ids = issued.links.map((link) => link.id);
  const single = issued.links.length === 1 ? issued.links[0] : undefined;
  return (
    <Card className="border-brand/40 ring-4 ring-brand/10 animate-pop">
      <div className="flex flex-col gap-5 md:flex-row md:items-start">
        {single !== undefined && (
          // The QR of the link: the buyer standing at the table scans it with their own phone.
          <div className="hidden shrink-0 rounded-2xl border border-border bg-white p-3 shadow-sm md:block">
            <QrCode text={single.url} size={150} label={t.qrLabel} className="bg-white" />
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <h3 className="text-lg font-semibold tracking-tight text-fg">{title}</h3>
              {issued.phone !== null && <p className="text-sm text-fg-muted tabular">{phoneLabel(issued.phone)}</p>}
            </div>
            <Button variant="ghost" size="icon" aria-label={commonTexts.close} onClick={onClose}>
              <X />
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {issued.links.map((link) => (
              <NumberChip key={link.id} label={link.numberLabel} color={color(link.categoryId)} />
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <WhatsappButton message={message} phone={issued.phone} ids={ids} eventId={eventId} size="lg" className="sm:h-11 sm:text-sm">
              <MessageCircle />
              {t.whatsapp}
            </WhatsappButton>
            <Button
              variant="secondary"
              icon={copied ? <Check /> : <Copy />}
              onClick={async () => {
                const ok = await copyText(message);
                setCopied(ok);
                if (ok) {
                  markSent.mutate(ids);
                  toast.success(t.messageCopied);
                } else {
                  toast.error(t.copyFailed);
                }
              }}
            >
              {t.copyMessage}
            </Button>
            {single !== undefined && (
              <a href={single.url} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: "ghost" })}>
                <ExternalLink />
                {t.open}
              </a>
            )}
            {onAnother !== undefined && (
              <Button variant="ghost" icon={<Plus />} onClick={onAnother} className="sm:ml-auto">
                {t.sendAnother}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

/**
 * Everyone waiting for a ticket, one at a time (ADR 0123): the person, their numbers and the
 * WhatsApp button; opening WhatsApp marks it sent, and "Próximo" goes on. The list is the one of
 * the moment it opened, so nobody moves while it is being worked through.
 */
export function SendQueue({
  eventId,
  recipients,
  message,
  color,
  categoryName,
  onClose,
}: {
  eventId: string;
  recipients: readonly Recipient[];
  message: (name: string | null, links: readonly TicketLinkDto[]) => string;
  color: CategoryColor;
  categoryName: CategoryName;
  onClose: () => void;
}) {
  const t = useEventTexts().digital;
  const q = t.queue;
  const markSent = useMarkSent(eventId);
  const [index, setIndex] = useState(0);
  const [sent, setSent] = useState<ReadonlySet<string>>(new Set());
  const current = recipients[index];
  const done = current === undefined;
  const total = recipients.length;
  const markCurrent = () => {
    if (current !== undefined) {
      setSent(new Set(sent).add(current.key));
    }
  };
  const isSent = current !== undefined && sent.has(current.key);
  const note = current?.links[0]?.note ?? null;
  const categories = current === undefined ? [] : [...new Set(current.links.map((link) => categoryName(link.categoryId)).filter((name) => name !== null))];

  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={done ? q.doneTitle : q.title}
      description={done ? q.done : q.progress(index + 1, total)}
      footer={
        done ? (
          <Button onClick={onClose}>{q.close}</Button>
        ) : (
          <>
            <Button
              variant="secondary"
              icon={<ChevronLeft />}
              disabled={index === 0}
              onClick={() => {
                setIndex(index - 1);
              }}
            >
              {q.back}
            </Button>
            <Button
              variant={isSent ? "primary" : "secondary"}
              onClick={() => {
                setIndex(index + 1);
              }}
            >
              {isSent ? q.next : q.skip}
              <ChevronRight />
            </Button>
          </>
        )
      }
    >
      {done ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center" role="status">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-success-soft text-success-fg">
            <PartyPopper className="size-7" aria-hidden />
          </span>
          <p className="text-sm text-fg-muted">{q.progress(sent.size, total)}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <div
            className="h-1.5 overflow-hidden rounded-full bg-surface-2"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={index + 1}
            aria-label={q.progress(index + 1, total)}
          >
            <div className="h-full rounded-full bg-brand-solid transition-all" style={{ width: `${String(((index + 1) / total) * 100)}%` }} />
          </div>
          <div className="flex flex-col gap-1">
            <p className={cn("text-xl font-semibold tracking-tight", current.name === null ? "text-fg-subtle" : "text-fg")}>{current.name ?? q.noName}</p>
            <p className="text-sm text-fg-muted tabular">{current.phone === null ? q.noPhone : phoneLabel(current.phone)}</p>
            {categories.length > 0 && <p className="text-sm text-fg-muted">{categories.join(" · ")}</p>}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {current.links.map((link) => (
              <NumberChip key={link.id} label={link.numberLabel} color={color(link.categoryId)} />
            ))}
          </div>
          {note !== null && <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-fg-muted">{note}</p>}
          <WhatsappButton
            key={current.key}
            message={message(current.name, current.links)}
            phone={current.phone}
            ids={current.links.map((link) => link.id)}
            eventId={eventId}
            size="lg"
            className="w-full"
            onSent={markCurrent}
          >
            {isSent ? <Check /> : <MessageCircle />}
            {isSent ? q.sent : q.send}
          </WhatsappButton>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-fg-muted">{q.sendHint}</p>
            <Button
              variant="ghost"
              size="sm"
              icon={<Copy />}
              onClick={async () => {
                if (await copyText(message(current.name, current.links))) {
                  markSent.mutate(current.links.map((link) => link.id));
                  markCurrent();
                  toast.success(t.messageCopied);
                } else {
                  toast.error(t.copyFailed);
                }
              }}
            >
              {t.copyMessage}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

/** The holder's name, WhatsApp and the team's note on one link. */
export function EditDialog({ link, eventId, onClose }: { link: TicketLinkDto; eventId: string; onClose: () => void }) {
  const t = useEventTexts().digital;
  const queryClient = useQueryClient();
  const [name, setName] = useState(link.holderName ?? "");
  const [phone, setPhone] = useState(link.holderPhone === null ? "" : phoneLabel(link.holderPhone));
  const [note, setNote] = useState(link.note ?? "");
  const digits = normalizePhone(phone);
  const save = useMutation({
    mutationFn: () => {
      const body: UpdateTicketLinkBody = {
        holderName: name.trim() === "" ? null : name.trim(),
        holderPhone: digits === false || digits === null ? "" : digits,
        note: note.trim(),
      };
      return api<TicketLinkDto>(`/api/ticket-links/${link.id}`, { method: "PUT", body });
    },
    onSuccess: () => {
      toast.success(t.edited);
      void queryClient.invalidateQueries({ queryKey: ["tickets", eventId] });
      onClose();
    },
  });
  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={t.editTitle}
      description={t.issuedNumbers(link.numberLabel)}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {commonTexts.cancel}
          </Button>
          <Button type="submit" form="edit-ticket-link" loading={save.isPending} disabled={digits === false}>
            {commonTexts.save}
          </Button>
        </>
      }
    >
      <form
        id="edit-ticket-link"
        className="flex flex-col gap-4"
        onSubmit={(formEvent) => {
          formEvent.preventDefault();
          if (digits !== false) {
            save.mutate();
          }
        }}
      >
        <Field label={t.holder} optional>
          <Input
            value={name}
            maxLength={80}
            data-autofocus
            placeholder={t.holderPlaceholder}
            onChange={(changeEvent) => {
              setName(changeEvent.target.value);
            }}
          />
        </Field>
        <Field label={t.phone} optional hint={digits === false ? <span className="text-danger-fg">{errorsTexts.invalid_whatsapp}</span> : t.phoneHint}>
          <Input
            type="tel"
            inputMode="tel"
            autoComplete="off"
            value={phone}
            aria-invalid={digits === false || undefined}
            placeholder={t.phonePlaceholder}
            onChange={(changeEvent) => {
              setPhone(changeEvent.target.value);
            }}
          />
        </Field>
        <Field label={t.note} optional hint={t.noteHint}>
          <Input
            value={note}
            maxLength={200}
            placeholder={t.notePlaceholder}
            onChange={(changeEvent) => {
              setNote(changeEvent.target.value);
            }}
          />
        </Field>
        <ErrorMessage error={save.error} />
      </form>
    </Dialog>
  );
}
