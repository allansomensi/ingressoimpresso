"use client";

import { ChevronRight, Ticket, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { OrganizationLogo } from "@/components/organization/organization";
import { Button, Spinner, useConfirm } from "@/components/ui";
import { cn } from "@/lib/cn";
import { inkFor } from "@/lib/design-rules";
import { changeKind } from "@/lib/event-change";
import { forKind } from "@/lib/event-kind";
import { forgetLink, myTickets, sortMyTickets, type MyTicket } from "@/lib/my-tickets";
import { forgetStoredPass, passDate } from "@/lib/ticket-pass";
import { ticket as ticketTexts } from "@/texts/pt-BR/ticket";

const t = ticketTexts.mine;

/** The tickets this phone keeps; `null` while reading them. */
export function useMyTickets(): { tickets: MyTicket[] | null; reload: () => void } {
  const [tickets, setTickets] = useState<MyTicket[] | null>(null);
  const reload = useCallback(() => {
    void myTickets().then(setTickets);
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);
  return { tickets, reload };
}

function Row({ ticket, past, onOpen, onRemove }: { ticket: MyTicket; past: boolean; onOpen: () => void; onRemove: () => void }) {
  const { pass } = ticket;
  const words = forKind(ticketTexts, ticketTexts.tokens, pass.event.kind);
  const canceled = changeKind(pass.event.change, pass.event.startsAt) === "canceled";
  const status =
    pass.state === "voided" ? t.voided(words.number) : pass.state === "entered" ? t.used : canceled ? t.canceled : past ? t.past : null;
  const prefix = pass.numberPrefix.trim() === "" ? "Nº" : pass.numberPrefix.trim();
  return (
    <li className="flex items-stretch overflow-hidden rounded-2xl border border-border bg-surface shadow-xs">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left transition hover:bg-surface-2 active:bg-surface-2"
      >
        <OrganizationLogo organization={pass.organization} className={cn("size-11 rounded-xl", past && "opacity-60")} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className={cn("truncate font-semibold text-fg", past && "text-fg-muted")}>{pass.event.name}</span>
          <span className="truncate text-xs text-fg-muted first-letter:uppercase">{passDate(pass.event.startsAt)}</span>
          <span className="flex flex-wrap items-center gap-1.5 pt-0.5 text-xs">
            <span className="font-mono font-semibold text-fg tabular">
              {words.number} {prefix} {pass.numberLabel}
            </span>
            {pass.category !== null && (
              <span
                className="rounded-full px-2 py-px text-[11px] font-bold tracking-wide uppercase"
                style={{ backgroundColor: pass.category.color, color: inkFor(pass.category.color) }}
              >
                {pass.category.name}
              </span>
            )}
            {status !== null && <span className="rounded-full bg-surface-2 px-2 py-px font-medium text-fg-muted">{status}</span>}
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-fg-subtle" aria-hidden />
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={t.remove(pass.event.name)}
        className="flex w-12 shrink-0 items-center justify-center border-l border-border text-fg-subtle transition hover:bg-surface-2 hover:text-danger active:bg-surface-2"
      >
        <Trash2 className="size-4" aria-hidden />
      </button>
    </li>
  );
}

/**
 * "Meus ingressos" (ADR 0097): what `/ingresso` shows without a link. Tickets still ahead come
 * first; opening one uses its kept link (fresh data) or, without it, the copy saved here.
 */
export function MyTicketsList({ onOpen }: { onOpen: (ticket: MyTicket) => void }) {
  const { tickets, reload } = useMyTickets();
  const confirm = useConfirm();
  const [now] = useState(() => Date.now());

  if (tickets === null) {
    return (
      <div className="m-auto flex flex-col items-center gap-4 py-16">
        <Spinner />
      </div>
    );
  }
  if (tickets.length === 0) {
    return (
      <div className="m-auto flex max-w-sm flex-col items-center gap-4 px-6 py-16 text-center animate-rise">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-soft text-brand-soft-fg">
          <Ticket className="size-7" aria-hidden />
        </span>
        <h1 className="text-xl font-semibold tracking-tight text-fg">{t.title}</h1>
        <p className="leading-relaxed text-fg-muted">{t.empty}</p>
      </div>
    );
  }
  const { upcoming, past } = sortMyTickets(tickets, now);
  const remove = async (ticket: MyTicket) => {
    if (!(await confirm({ title: t.removeTitle, description: t.removeBody, confirmLabel: t.removeConfirm }))) {
      return;
    }
    forgetStoredPass(ticket.key);
    await forgetLink(ticket.key);
    reload();
  };
  const list = (items: readonly MyTicket[], isPast: boolean) => (
    <ul className="flex flex-col gap-2">
      {items.map((ticket) => (
        <Row
          key={ticket.key}
          ticket={ticket}
          past={isPast}
          onOpen={() => {
            onOpen(ticket);
          }}
          onRemove={() => void remove(ticket)}
        />
      ))}
    </ul>
  );
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 pt-8 pb-[max(2rem,env(safe-area-inset-bottom))] animate-rise">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-fg">{t.title}</h1>
        <p className="text-sm leading-relaxed text-fg-muted">{t.lead}</p>
      </header>
      {upcoming.length > 0 && list(upcoming, false)}
      {past.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="px-1 text-sm font-semibold text-fg-muted">{t.pastTitle}</h2>
          {list(past, true)}
        </section>
      )}
      <p className="px-1 text-xs leading-relaxed text-fg-subtle">{t.privacy}</p>
    </div>
  );
}

/** "Meus ingressos (3)" under a ticket, when the phone keeps others. */
export function MyTicketsLink({ onClick }: { onClick: () => void }) {
  const { tickets } = useMyTickets();
  if (tickets === null || tickets.length < 2) {
    return null;
  }
  return (
    <Button variant="ghost" icon={<Ticket />} onClick={onClick} className="mx-auto">
      {t.link(tickets.length)}
    </Button>
  );
}
