"use client";

import type { CancelEventBody, EventDto, OrganizationProfileDto, PostponeEventBody } from "@ingressoimpresso/api-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Copy, MessageCircle, MessageSquareText, RotateCcw, XCircle } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Alert, Button, Dialog, ErrorMessage, Field, Input, Textarea, errorMessage, useConfirm } from "@/components/ui";
import { api } from "@/lib/api";
import { changeKind, sellerMessage, spokenDate } from "@/lib/event-change";
import { offsetMinutes, wallClockInput, withOffset } from "@/lib/event-time";
import { eventDateTime, shortDateTime } from "@/lib/format";
import { copyText, whatsappUrl } from "@/lib/share";
import { canDo } from "@/lib/team";
import { texts } from "@/texts/pt-BR";

const t = texts.eventChange;
const MAX_REASON = 200;

/** Minutes between two `datetime-local` values (plain calendar arithmetic). */
function minutesBetween(start: string, end: string): number | null {
  const a = Date.parse(`${start}:00Z`);
  const b = Date.parse(`${end}:00Z`);
  return Number.isNaN(a) || Number.isNaN(b) ? null : Math.round((b - a) / 60_000);
}

function addMinutes(local: string, minutes: number): string | null {
  const time = Date.parse(`${local}:00Z`);
  return Number.isNaN(time) ? null : new Date(time + minutes * 60_000).toISOString().slice(0, 16);
}

function useSaved(onDone: (event: EventDto) => void) {
  const queryClient = useQueryClient();
  return (saved: EventDto) => {
    queryClient.setQueryData(["event", saved.id], saved);
    void queryClient.invalidateQueries({ queryKey: ["events"] });
    void queryClient.invalidateQueries({ queryKey: ["report", saved.id] });
    void queryClient.invalidateQueries({ queryKey: ["door", saved.id] });
    onDone(saved);
  };
}

/** New date (the end keeps the event's length until it is edited) and an optional reason. */
export function PostponeDialog({ event, open, onClose, onDone }: { event: EventDto; open: boolean; onClose: () => void; onDone: (event: EventDto) => void }) {
  return (
    <Dialog open={open} onClose={onClose} title={t.postponeTitle} description={t.postponeDescription}>
      {open && <PostponeForm event={event} onClose={onClose} onDone={onDone} />}
    </Dialog>
  );
}

function PostponeForm({ event, onClose, onDone }: { event: EventDto; onClose: () => void; onDone: (event: EventDto) => void }) {
  const [startsAt, setStartsAt] = useState(wallClockInput(event.startsAt));
  const [endsAt, setEndsAt] = useState(wallClockInput(event.endsAt));
  const [endTouched, setEndTouched] = useState(false);
  const [reason, setReason] = useState("");
  const length = minutesBetween(wallClockInput(event.startsAt), wallClockInput(event.endsAt)) ?? 300;
  const offset = offsetMinutes(event.startsAt);
  const saved = useSaved(onDone);
  const same = startsAt === wallClockInput(event.startsAt) && endsAt === wallClockInput(event.endsAt);
  const save = useMutation({
    mutationFn: () => {
      const body: PostponeEventBody = {
        startsAt: withOffset(startsAt, offset),
        endsAt: withOffset(endsAt, offset),
        reason: reason.trim() === "" ? null : reason.trim(),
      };
      return api<EventDto>(`/api/events/${event.id}/postpone`, { method: "POST", body });
    },
    onSuccess: (event) => {
      toast.success(t.postponed);
      saved(event);
    },
  });
  const submit = (formEvent: FormEvent) => {
    formEvent.preventDefault();
    if (!same) {
      save.mutate();
    }
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.newStart}>
          <Input
            type="datetime-local"
            value={startsAt}
            required
            autoFocus
            onChange={(e) => {
              setStartsAt(e.target.value);
              const end = addMinutes(e.target.value, length);
              if (!endTouched && end !== null) {
                setEndsAt(end);
              }
            }}
          />
        </Field>
        <Field label={t.newEnd}>
          <Input
            type="datetime-local"
            value={endsAt}
            min={startsAt}
            required
            onChange={(e) => {
              setEndsAt(e.target.value);
              setEndTouched(true);
            }}
          />
        </Field>
      </div>
      <p className="-mt-2 text-xs text-fg-muted">{texts.panel.eventTimeZoneHint(offset)}</p>
      <Field label={t.reason} optional hint={t.reasonHint}>
        <Input
          value={reason}
          maxLength={MAX_REASON}
          placeholder={t.reasonPlaceholder}
          enterKeyHint="done"
          onChange={(e) => {
            setReason(e.target.value);
          }}
        />
      </Field>
      <Alert tone="warning">{t.printedNote}</Alert>
      {same && <p className="text-xs text-fg-muted">{t.sameDates}</p>}
      <ErrorMessage error={save.error} />
      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose}>
          {t.keep}
        </Button>
        <Button type="submit" icon={<CalendarClock />} loading={save.isPending} disabled={same}>
          {t.postponeConfirm}
        </Button>
      </div>
    </form>
  );
}

/** What canceling does, an optional reason, and the red button. */
export function CancelDialog({ event, open, onClose, onDone }: { event: EventDto; open: boolean; onClose: () => void; onDone: (event: EventDto) => void }) {
  const [reason, setReason] = useState("");
  const saved = useSaved(onDone);
  const save = useMutation({
    mutationFn: () => {
      const body: CancelEventBody = { reason: reason.trim() === "" ? null : reason.trim() };
      return api<EventDto>(`/api/events/${event.id}/cancel`, { method: "POST", body });
    },
    onSuccess: (event) => {
      toast.success(t.canceled);
      setReason("");
      saved(event);
    },
  });
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title={
        <span className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-danger-soft text-danger-fg">
            <XCircle aria-hidden className="size-[18px]" />
          </span>
          {t.cancelTitle}
        </span>
      }
      footer={
        <>
          <Button variant="secondary" autoFocus onClick={onClose}>
            {t.keep}
          </Button>
          <Button variant="danger" icon={<XCircle />} loading={save.isPending} onClick={() => save.mutate()}>
            {t.cancelConfirm}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 text-sm leading-relaxed text-fg-muted">
          <p>{t.cancelDescription}</p>
          <ul className="flex list-disc flex-col gap-1 pl-5 marker:text-fg-subtle">
            {t.cancelEffects.map((effect) => (
              <li key={effect}>{effect}</li>
            ))}
          </ul>
        </div>
        <Field label={t.reason} optional hint={t.reasonHint}>
          <Textarea
            value={reason}
            maxLength={MAX_REASON}
            rows={2}
            className="min-h-0"
            placeholder={t.cancelReasonPlaceholder}
            onChange={(e) => {
              setReason(e.target.value.replace(/[\r\n]+/g, " "));
            }}
          />
        </Field>
        <ErrorMessage error={save.error} />
      </div>
    </Dialog>
  );
}

/** The ready-made message for the sellers: copy it or open WhatsApp with it. */
export function ChangeMessageDialog({ event, open, onClose }: { event: EventDto; open: boolean; onClose: () => void }) {
  // The organization's own people get its WhatsApp in the message; a team member does not
  // see the profile of an organization that is not theirs.
  const profile = useQuery({
    queryKey: ["organization-profile"],
    queryFn: () => api<OrganizationProfileDto>("/api/account/profile"),
    enabled: open && event.team === null && !event.supportAccess,
    staleTime: 60_000,
    retry: false,
  });
  const organization = event.team === null && !event.supportAccess && profile.data !== undefined ? { name: profile.data.organizationName, whatsapp: profile.data.whatsapp } : null;
  const message = sellerMessage({
    eventName: event.name,
    startsAt: event.startsAt,
    venue: event.venue,
    address: event.address,
    change: event.change,
    organization,
  });
  const copy = async () => {
    if (await copyText(message)) {
      toast.success(t.messageCopied);
    } else {
      toast.error(t.messageCopyFailed);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t.message}
      description={t.messageHint}
      footer={
        <>
          <Button variant="secondary" icon={<Copy />} onClick={() => void copy()}>
            {t.messageCopy}
          </Button>
          <a href={whatsappUrl(message)} target="_blank" rel="noopener noreferrer" className={buttonLike}>
            <MessageCircle />
            {t.messageWhatsapp}
          </a>
        </>
      }
    >
      <p className="rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm leading-relaxed whitespace-pre-line text-fg">{message}</p>
    </Dialog>
  );
}

const buttonLike =
  "inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-success-solid px-4 text-sm font-semibold whitespace-nowrap text-white shadow-sm transition hover:opacity-90 active:translate-y-px active:opacity-85 pointer-coarse:h-11 [&_svg]:size-4";

/** The notice on the event's page: what changed, the message for the sellers, undo. */
export function EventChangeBanner({ event }: { event: EventDto }) {
  const kind = changeKind(event.change, event.startsAt);
  const [messageOpen, setMessageOpen] = useState(false);
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const undo = useMutation({
    mutationFn: () => api<EventDto>(`/api/events/${event.id}/cancel/undo`, { method: "POST" }),
    onSuccess: (saved) => {
      toast.success(t.undone);
      queryClient.setQueryData(["event", saved.id], saved);
      void queryClient.invalidateQueries({ queryKey: ["events"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  if (kind === null) {
    return null;
  }
  const canceled = kind === "canceled";
  const reason = canceled ? event.change.cancelReason : event.change.postponeReason;
  return (
    <>
      <Alert
        tone={canceled ? "danger" : "warning"}
        title={
          canceled
            ? t.panelCanceled(shortDateTime(event.change.canceledAt ?? event.startsAt))
            : t.panelPostponed(event.change.postponedFromStartsAt === null ? "" : eventDateTime(event.change.postponedFromStartsAt))
        }
        action={
          <>
            <Button
              size="sm"
              variant="secondary"
              icon={<MessageSquareText />}
              onClick={() => {
                setMessageOpen(true);
              }}
            >
              {t.messageOpen}
            </Button>
            {canceled && canDo(event, "manage") && (
              <Button
                size="sm"
                variant="secondary"
                icon={<RotateCcw />}
                loading={undo.isPending}
                onClick={() => {
                  void confirm({ title: t.undoTitle, description: t.undoBody, confirmLabel: t.undoConfirm, danger: false }).then((ok) => {
                    if (ok) {
                      undo.mutate();
                    }
                  });
                }}
              >
                {t.undo}
              </Button>
            )}
          </>
        }
      >
        {!canceled && <p>{texts.eventChange.notice.now(spokenDate(event.startsAt))}</p>}
        {reason !== null && <p>{t.reasonLine(reason)}</p>}
      </Alert>
      <ChangeMessageDialog
        event={event}
        open={messageOpen}
        onClose={() => {
          setMessageOpen(false);
        }}
      />
    </>
  );
}
