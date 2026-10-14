"use client";

import type { VerifiedTicketDto, VerifyResultDto } from "@ingressoimpresso/api-types";
import { CalendarClock, CalendarDays, Lock, MapPin, RotateCcw, ShieldCheck, ShieldX, type LucideIcon } from "lucide-react";

import { EventChangeNotice, OrganizationContact, OrganizationLogo } from "@/components/organization/organization";
import { Alert, Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { spokenDate } from "@/lib/event-change";
import { sessionLabel } from "@/lib/series";
import { verdictTone, type VerdictTone } from "@/lib/verify";
import { series as seriesTexts, verifyPage as verifyPageTexts } from "@/texts/pt-BR";

const t = verifyPageTexts;

const TONE: Record<VerdictTone, { icon: LucideIcon; badge: string; ring: string }> = {
  success: { icon: ShieldCheck, badge: "bg-success-solid text-white", ring: "border-success/30 bg-success-soft" },
  warning: { icon: CalendarClock, badge: "bg-surface text-warning-fg ring-1 ring-warning/40", ring: "border-warning/35 bg-warning-soft" },
  danger: { icon: ShieldX, badge: "bg-danger-solid text-white", ring: "border-danger/30 bg-danger-soft" },
  neutral: { icon: Lock, badge: "bg-surface-3 text-fg-muted", ring: "border-border bg-surface-2" },
};

/** The ticket as printed: event, when and where, number and category. */
function TicketSummary({ ticket }: { ticket: VerifiedTicketDto }) {
  const { event, organization } = ticket;
  const where = [event.venue, event.address].filter((part) => part !== null && part !== "").join(" · ");
  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-bg">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <OrganizationLogo organization={organization} className="size-10" />
        <div className="flex min-w-0 flex-col">
          <span className="text-xs text-fg-subtle">{t.organizedBy}</span>
          <span className="truncate text-sm font-semibold text-fg">{organization.name}</span>
        </div>
      </div>
      <div className="flex flex-col gap-3 px-4 py-4">
        <h3 className="text-xl leading-snug font-semibold tracking-tight text-balance text-fg">{event.name}</h3>
        {/* One of several dates (ADR 0077): the ticket enters this session only. */}
        {event.inSeries && (
          <p className="-mt-1 flex flex-col gap-1.5">
            <span className="w-fit rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-semibold text-brand-soft-fg">{sessionLabel(event.startsAt)}</span>
            <span className="text-xs text-fg-muted">{seriesTexts.sessionOnly}</span>
          </p>
        )}
        <dl className="flex flex-col gap-2 text-sm">
          <div className="flex items-start gap-2.5">
            <dt className="sr-only">{t.when}</dt>
            <CalendarDays aria-hidden className="mt-0.5 size-4 shrink-0 text-fg-subtle" />
            <dd className="text-fg first-letter:uppercase">{spokenDate(event.startsAt)}</dd>
          </div>
          {where !== "" && (
            <div className="flex items-start gap-2.5">
              <dt className="sr-only">{t.where}</dt>
              <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-fg-subtle" />
              <dd className="text-fg-muted">{where}</dd>
            </div>
          )}
        </dl>
      </div>
      {/* The stub: a perforated line, then the number and the category. */}
      <div className="relative flex flex-wrap items-end justify-between gap-3 border-t-2 border-dashed border-border px-4 pt-3.5 pb-4">
        <span aria-hidden className="absolute -top-2.5 -left-2.5 size-5 rounded-full border border-border bg-surface" />
        <span aria-hidden className="absolute -top-2.5 -right-2.5 size-5 rounded-full border border-border bg-surface" />
        <div className="flex flex-col">
          <span className="text-xs text-fg-subtle">{t.number}</span>
          <span className="flex items-baseline gap-1 text-fg">
            {ticket.numberPrefix.trim() !== "" && <span className="text-base font-medium text-fg-muted">{ticket.numberPrefix.trim()}</span>}
            <span className="font-mono text-2xl font-semibold tracking-tight tabular">{ticket.numberLabel}</span>
          </span>
        </div>
        {ticket.category !== null && (
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-sm font-medium text-fg">
            <span aria-hidden className="size-3 rounded-full ring-1 ring-black/10" style={{ backgroundColor: ticket.category.color }} />
            <span className="sr-only">{t.category}: </span>
            {ticket.category.name}
          </span>
        )}
      </div>
    </article>
  );
}

/** The answer of the check, most important first, and what it does not say. */
export function VerifyResult({ result, onAgain }: { result: VerifyResultDto; onAgain: () => void }) {
  const tone = verdictTone(result.verdict);
  const { icon: Icon, badge, ring } = TONE[tone];
  const copy = t.verdicts[result.verdict];
  const ticket = result.ticket;
  const buyable = result.verdict === "valid" || result.verdict === "event_postponed";
  return (
    <section aria-label={t.resultLabel} aria-live="polite" className="flex flex-col gap-4 animate-fade-in">
      <div className={cn("flex items-start gap-4 rounded-2xl border p-4", ring)}>
        <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-2xl shadow-sm", badge)}>
          <Icon className="size-6" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-lg leading-snug font-semibold text-fg">{copy.title}</h2>
          <p className="text-sm leading-relaxed text-fg-muted">{copy.body}</p>
        </div>
      </div>
      {ticket !== null && (
        <>
          <TicketSummary ticket={ticket} />
          {(result.verdict === "event_postponed" || result.verdict === "event_canceled") && (
            <EventChangeNotice change={ticket.event.change} startsAt={ticket.event.startsAt} />
          )}
          {buyable && (
            <Alert tone="warning" title={t.copyTitle}>
              {t.copyBody}
            </Alert>
          )}
          <OrganizationContact
            organization={ticket.organization}
            message={t.contactMessage(`${ticket.numberPrefix}${ticket.numberLabel}`.trim(), ticket.event.name)}
          />
        </>
      )}
      <Button variant="secondary" size="lg" icon={<RotateCcw />} onClick={onAgain}>
        {t.again}
      </Button>
    </section>
  );
}
