"use client";

import type { AccountDto, MeUser, TourOutcome } from "@ingressoimpresso/api-types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, CalendarPlus, PartyPopper, Printer, QrCode, Ticket, X, type LucideIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { LogoMark } from "@/components/brand";
import { Button } from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { TOUR_STEPS, findAnchor, placeCard, type Box } from "@/lib/tour";
import { tour as tourTexts } from "@/texts/pt-BR/tour";

const t = tourTexts;

/** Room around the element inside the light, in px. */
const HALO = 6;

const HOW_ICONS: readonly LucideIcon[] = [CalendarPlus, Ticket, Printer, QrCode];

/**
 * The welcome tour (ADR 0116): a centred welcome, four stops that light up a part of the panel
 * with a card beside it, and a last card that opens the new-event form. It runs on a native modal
 * `<dialog>` (focus trap and an inert page come from the browser); Escape or "Pular tour" skip it.
 */
export function WelcomeTour({ onEnd }: { onEnd: (outcome: TourOutcome) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [target, setTarget] = useState<Box | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const step = TOUR_STEPS[index] ?? TOUR_STEPS[0];
  const anchored = step?.anchor !== null && step?.anchor !== undefined;
  const last = index === TOUR_STEPS.length - 1;
  // Free tickets make the first event easier to start: the welcome says how many are left.
  const account = useQuery({ queryKey: ["account"], queryFn: () => api<AccountDto>("/api/account") });
  const free = account.data?.freeTicketsLeft ?? 0;

  useEffect(() => {
    const dialog = ref.current;
    if (dialog !== null && !dialog.open) {
      dialog.showModal();
    }
  }, []);

  // Measures the step's element (and scrolls it into view the first time), then the card.
  const measure = useCallback(
    (scroll: boolean) => {
      const element = step?.anchor === null || step?.anchor === undefined ? null : findAnchor(step.anchor);
      if (element !== null && scroll) {
        const box = element.getBoundingClientRect();
        if (box.top < 72 || box.bottom > window.innerHeight - 80) {
          element.scrollIntoView({ block: "center" });
        }
      }
      const box = element?.getBoundingClientRect() ?? null;
      const next = box === null ? null : { top: box.top - HALO, left: box.left - HALO, width: box.width + 2 * HALO, height: box.height + 2 * HALO };
      setTarget(next);
      const size = card.current?.getBoundingClientRect();
      if (size !== undefined) {
        setPosition(placeCard(next, { width: size.width, height: size.height }, { width: window.innerWidth, height: window.innerHeight }));
      }
    },
    [step],
  );

  useLayoutEffect(() => {
    // Measured on the next frame, once the card has its size (fonts, the free-tickets line).
    let second = 0;
    const first = requestAnimationFrame(() => {
      measure(true);
      second = requestAnimationFrame(() => {
        measure(false);
      });
    });
    card.current?.querySelector<HTMLElement>("[data-tour-primary]")?.focus({ preventScroll: true });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [measure, account.data]);

  useEffect(() => {
    const again = () => {
      measure(false);
    };
    window.addEventListener("resize", again);
    window.addEventListener("scroll", again, true);
    return () => {
      window.removeEventListener("resize", again);
      window.removeEventListener("scroll", again, true);
    };
  }, [measure]);

  const go = (next: number) => {
    setPosition(null);
    setIndex(Math.min(Math.max(next, 0), TOUR_STEPS.length - 1));
  };
  const finish = (outcome: TourOutcome) => {
    ref.current?.close();
    onEnd(outcome);
  };
  const createEvent = () => {
    finish("finished");
    // The events page's own button opens its form.
    findAnchor("new-event")?.click();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "ArrowRight" && !last) {
      go(index + 1);
    } else if (event.key === "ArrowLeft" && index > 0) {
      go(index - 1);
    }
  };

  const total = TOUR_STEPS.length - 2;
  const texts = step?.id === "newEvent" ? t.newEvent : step?.id === "results" ? t.results : step?.id === "inbox" ? t.inbox : t.account;

  return (
    <dialog
      ref={ref}
      aria-label={t.label}
      onCancel={(event) => {
        // Escape skips the tour (and is recorded as such) instead of only closing it.
        event.preventDefault();
        finish("skipped");
      }}
      onKeyDown={onKeyDown}
      className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden bg-transparent p-0 text-fg backdrop:bg-transparent backdrop:backdrop-blur-none"
    >
      {/* The light: a hole in the dimmed page around the element, or the whole page dimmed. */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none fixed rounded-2xl motion-safe:transition-all motion-safe:duration-300 motion-safe:ease-out",
          target === null ? "inset-0 bg-black/55 backdrop-blur-[2px]" : "shadow-[0_0_0_9999px_rgb(8_8_16/0.6)] ring-2 ring-white/80",
        )}
        style={target === null ? undefined : { top: target.top, left: target.left, width: target.width, height: target.height }}
      />
      <div
        ref={card}
        role="document"
        className={cn(
          "fixed rounded-2xl border border-border bg-surface shadow-xl outline-none",
          anchored ? "w-[min(22rem,calc(100vw-2rem))]" : "w-[min(30rem,calc(100vw-2rem))]",
          position === null ? "invisible" : "motion-safe:animate-pop",
        )}
        style={position === null ? { top: 0, left: 0 } : { top: position.top, left: position.left }}
      >
        {step?.id === "welcome" ? (
          <Welcome
            free={free}
            onStart={() => {
              go(1);
            }}
            onSkip={() => {
              finish("skipped");
            }}
          />
        ) : last ? (
          <Done
            onCreate={createEvent}
            onExplore={() => {
              finish("finished");
            }}
            onBack={() => {
              go(index - 1);
            }}
          />
        ) : (
          <div className="flex flex-col gap-3 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold tracking-wide text-brand uppercase">{t.progress(index, total)}</span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t.close}
                onClick={() => {
                  finish("skipped");
                }}
                className="-mr-1.5"
              >
                <X />
              </Button>
            </div>
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-semibold tracking-tight text-balance">{texts.title}</h2>
              <p className="text-sm leading-relaxed text-fg-muted">{texts.body}</p>
            </div>
            <Dots index={index} />
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  finish("skipped");
                }}
                className="relative touch-target rounded-lg text-sm font-medium text-fg-muted underline-offset-2 hover:text-fg hover:underline active:text-fg"
              >
                {t.skip}
              </button>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<ArrowLeft />}
                  aria-label={t.back}
                  onClick={() => {
                    go(index - 1);
                  }}
                />
                <Button
                  size="sm"
                  data-tour-primary
                  onClick={() => {
                    go(index + 1);
                  }}
                >
                  {t.next}
                  <ArrowRight />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
}

/** The progress of the four stops. */
function Dots({ index }: { index: number }) {
  return (
    <div aria-hidden className="flex gap-1.5">
      {TOUR_STEPS.slice(1, -1).map((step, at) => (
        <span
          key={step.id}
          className={cn("h-1.5 rounded-full transition-all", at + 1 === index ? "w-5 bg-brand-solid" : at + 1 < index ? "w-1.5 bg-brand/60" : "w-1.5 bg-border-strong")}
        />
      ))}
    </div>
  );
}

function Welcome({ free, onStart, onSkip }: { free: number; onStart: () => void; onSkip: () => void }) {
  const w = t.welcome;
  return (
    <div className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-y-auto overscroll-contain">
      <div className="relative overflow-hidden rounded-t-2xl bg-gradient-to-br from-brand-solid to-brand-hover px-5 pt-5 pb-6 text-brand-fg sm:px-6">
        {/* A few tickets in the corner, like a stack on the table. */}
        <span aria-hidden className="pointer-events-none absolute -top-4 -right-6 flex rotate-12 gap-2 opacity-25">
          <Ticket className="size-20" strokeWidth={1.25} />
          <Ticket className="mt-8 size-16" strokeWidth={1.25} />
        </span>
        <span className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-white/95 shadow-sm">
            <LogoMark className="size-7" />
          </span>
          <span className="text-xs font-semibold tracking-wide uppercase opacity-90">{w.eyebrow}</span>
        </span>
        <h2 className="mt-4 text-xl leading-snug font-semibold tracking-tight text-balance">{w.title}</h2>
        <p className="mt-2 text-sm leading-relaxed opacity-90">{w.body}</p>
      </div>
      <div className="flex flex-col gap-4 px-5 py-5 sm:px-6">
        {free > 0 && (
          <p className="flex items-center gap-2 rounded-xl bg-success-soft px-3 py-2 text-sm font-medium text-success-fg">
            <PartyPopper className="size-4 shrink-0" aria-hidden />
            {w.free(free)}
          </p>
        )}
        <div className="flex flex-col gap-2.5">
          <span className="text-xs font-semibold tracking-wide text-fg-subtle uppercase">{w.how}</span>
          <ol className="grid gap-2 sm:grid-cols-2">
            {w.steps.map((item, at) => {
              const Icon = HOW_ICONS[at] ?? Ticket;
              return (
                <li key={item.title} className="flex items-start gap-2.5 rounded-xl border border-border bg-surface-2/60 p-2.5">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-soft-fg">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="text-sm font-semibold text-fg">
                      <span className="text-fg-subtle tabular">{at + 1}.</span> {item.title}
                    </span>
                    <span className="text-xs leading-snug text-fg-muted">{item.body}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
      <div className="flex flex-col-reverse gap-2 border-t border-border px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:px-6 sm:pb-4">
        <Button variant="ghost" onClick={onSkip}>
          {w.later}
        </Button>
        <Button data-tour-primary onClick={onStart}>
          {w.start}
          <ArrowRight />
        </Button>
      </div>
    </div>
  );
}

function Done({ onCreate, onExplore, onBack }: { onCreate: () => void; onExplore: () => void; onBack: () => void }) {
  const d = t.done;
  return (
    <div className="flex flex-col items-center gap-4 px-5 pt-6 pb-5 text-center sm:px-6">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-soft text-brand-soft-fg">
        <CalendarPlus className="size-7" aria-hidden />
      </span>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-lg font-semibold tracking-tight text-balance">{d.title}</h2>
        <p className="text-sm leading-relaxed text-fg-muted">{d.body}</p>
      </div>
      <Dots index={TOUR_STEPS.length - 1} />
      <div className="flex w-full flex-col gap-2 sm:flex-row-reverse">
        <Button data-tour-primary className="sm:flex-1" icon={<CalendarPlus />} onClick={onCreate}>
          {d.create}
        </Button>
        <Button variant="secondary" className="sm:flex-1" onClick={onExplore}>
          {d.explore}
        </Button>
      </div>
      <button
        type="button"
        onClick={onBack}
        className="relative touch-target inline-flex items-center gap-1 rounded-lg text-sm font-medium text-fg-muted hover:text-fg active:text-fg"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t.back}
      </button>
    </div>
  );
}

/**
 * Shows the tour, on the events page, to an account that has not finished nor skipped it
 * (`tourPending`), and records how it ended. While it shows, `children` (the announcements'
 * window) waits, so the two never stack.
 */
export function TourGate({ user, blocked, children }: { user: MeUser; blocked: boolean; children: ReactNode }) {
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const [ended, setEnded] = useState(false);
  const open = pathname === "/painel" && !blocked && user.tourPending && !ended;

  const end = (outcome: TourOutcome) => {
    setEnded(true);
    queryClient.setQueriesData<MeUser>({ queryKey: ["me"] }, (old) => (old === undefined ? old : { ...old, tourPending: false }));
    // A failure only means the tour shows again on the next visit.
    void api<undefined>("/api/account/tour", { method: "POST", body: { outcome } }).catch(() => undefined);
  };
  return open ? <WelcomeTour onEnd={end} /> : children;
}
