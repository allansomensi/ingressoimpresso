"use client";

import { AlertTriangle, CheckCircle2, HandHelping, IdCard, LogOut, SearchCheck, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { inkFor } from "@/lib/design-rules";
import { HOLD_MS, dismissPolicy, type ResultView } from "@/portaria/logic";
import { portaria as portariaTexts } from "@/texts/pt-BR/portaria";

const t = portariaTexts;

/**
 * Four tones, one per answer: the whole screen takes it, so the door knows before reading a word.
 * Everything about the ticket goes in one white card below the answer, where any category colour
 * reads well.
 */
const TONE_CLASS = {
  ok: "bg-[#15803d] text-white",
  bad: "bg-[#c62828] text-white",
  warn: "bg-[#f5b301] text-[#1c1917]",
  exit: "bg-[#1d4ed8] text-white",
} as const;

const TONE_ICON = { ok: CheckCircle2, bad: XCircle, warn: AlertTriangle, exit: LogOut } as const;

/** A small tag above the answer: rehearsal, check, checkpoint, repeated reading. */
const TAG_CLASS = "pointer-events-none relative flex items-center gap-1.5 rounded-full bg-black/25 px-3.5 py-1 text-sm font-bold tracking-wide";

/** How often the countdown of a result that leaves by itself moves. */
const TICK_MS = 100;

/**
 * A result. A plain "enter" goes back to the camera by itself, with a visible countdown that
 * stops while the screen is held (and, after a long press, until the next tap); anything else
 * stays until tapped (`dismissPolicy`).
 */
export function Result({ view, onDismiss, onAction }: { view: ResultView; onDismiss: (byUser: boolean) => void; onAction: () => void }) {
  const Icon = TONE_ICON[view.tone];
  const policy = dismissPolicy(view);
  const autoMs = policy.auto ? policy.ms : null;
  const [held, setHeld] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const pressedAt = useRef<number | null>(null);
  const skipClick = useRef(false);
  const dismissed = useRef(false);
  const counting = autoMs !== null && !held && !pinned;

  useEffect(() => {
    if (!counting) {
      return;
    }
    const timer = setInterval(() => {
      setElapsed((current) => current + TICK_MS);
    }, TICK_MS);
    return () => {
      clearInterval(timer);
    };
  }, [counting]);

  useEffect(() => {
    if (autoMs !== null && counting && elapsed >= autoMs && !dismissed.current) {
      dismissed.current = true;
      onDismiss(false);
    }
  }, [autoMs, counting, elapsed, onDismiss]);

  const release = () => {
    if (pressedAt.current !== null && performance.now() - pressedAt.current >= HOLD_MS && autoMs !== null) {
      // A long press means "let me read": keep it until the next tap.
      setPinned(true);
      skipClick.current = true;
    }
    pressedAt.current = null;
    setHeld(false);
  };
  const left = autoMs === null ? 0 : Math.max(0, 1 - elapsed / autoMs);
  const hint = autoMs === null ? t.tapToContinue : held || pinned ? t.result.held : t.result.autoHint;

  const tags = view.rehearsal === true || view.check === true || (view.place ?? null) !== null || view.repeat === true;
  const facts =
    view.number !== null ||
    view.category !== null ||
    view.seat !== null ||
    view.seller !== null ||
    (view.charge ?? null) !== null ||
    (view.document ?? null) !== null ||
    (view.instruction ?? null) !== null;

  return (
    <div
      className={`fixed inset-0 z-30 flex flex-col items-center justify-center gap-5 overflow-x-hidden overflow-y-auto p-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center [&>*]:max-w-full ${TONE_CLASS[view.tone]}`}
      role="alert"
      data-tone={view.tone}
    >
      {/* The whole screen dismisses (holding it stops the countdown); the override button sits above it. */}
      <button
        type="button"
        onPointerDown={() => {
          pressedAt.current = performance.now();
          setHeld(true);
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onPointerLeave={release}
        onContextMenu={(event) => {
          event.preventDefault();
        }}
        onClick={() => {
          if (skipClick.current) {
            skipClick.current = false;
            return;
          }
          dismissed.current = true;
          onDismiss(true);
        }}
        aria-label={t.tapToContinue}
        className="absolute inset-0 cursor-default touch-manipulation select-none [-webkit-touch-callout:none]"
      />
      {tags && (
        <span className="pointer-events-none relative flex flex-wrap items-center justify-center gap-2">
          {/* Rehearsal (ADR 0067) and check (ADR 0090) are never mistaken for an entry. */}
          {view.rehearsal === true && <span className={TAG_CLASS}>{t.rehearsal.note}</span>}
          {view.check === true && (
            <span className={TAG_CLASS}>
              <SearchCheck className="size-4" aria-hidden />
              {t.check.note}
            </span>
          )}
          {/* The checkpoint (ADR 0092): what this screen is about. */}
          {view.place !== undefined && view.place !== null && <span className={`${TAG_CLASS} uppercase`}>{view.place}</span>}
          {view.repeat === true && <span className={TAG_CLASS}>{t.result.repeat}</span>}
        </span>
      )}

      {/* The answer. */}
      <span className="pointer-events-none relative flex flex-col items-center gap-3">
        <Icon className="size-20 animate-pop" strokeWidth={2.25} aria-hidden />
        <span className="text-[clamp(2.25rem,11vw,3rem)] leading-[1.05] font-black tracking-tight text-balance">{view.title}</span>
        {view.detail !== null && <span className="max-w-sm text-xl leading-snug font-medium text-balance opacity-95">{view.detail}</span>}
      </span>

      {/* What the door needs to know about the ticket, in one card. */}
      {facts && (
        <span className="pointer-events-none relative flex w-full max-w-sm flex-col overflow-hidden rounded-3xl bg-white text-left text-[#18181b] shadow-xl shadow-black/15">
          {(view.number !== null || view.category !== null) && (
            <span className="flex items-center justify-between gap-3 px-5 py-4">
              <span className="font-mono text-3xl font-bold tracking-tight tabular-nums">{view.number}</span>
              {view.category !== null && (
                <span
                  className="truncate rounded-xl px-3.5 py-1.5 text-xl font-black tracking-wide uppercase"
                  style={{ backgroundColor: view.category.color, color: inkFor(view.category.color) }}
                >
                  {view.category.name}
                </span>
              )}
            </span>
          )}
          {(view.seat !== null || view.seller !== null) && (
            <span className="flex flex-col gap-0.5 border-t border-black/10 px-5 py-3">
              {view.seat !== null && <span className="text-xl font-bold">{view.seat}</span>}
              {view.seller !== null && <span className="text-base text-[#52525b]">{view.seller}</span>}
            </span>
          )}
          {/* Box office (ADR 0069): what to charge before handing the ticket over. */}
          {view.charge !== undefined && view.charge !== null && (
            <span className="border-t border-black/10 bg-[#ecfdf3] px-5 py-3.5 text-[clamp(1.5rem,7vw,1.875rem)] leading-tight font-black text-[#14532d]">
              {view.charge}
            </span>
          )}
          {/* The category asks for a document (ADR 0082). */}
          {view.document !== undefined && view.document !== null && (
            <span className="flex flex-col gap-1 border-t border-black/10 bg-[#fff7e0] px-5 py-4 text-[#422006]">
              <span className="flex items-center gap-2 text-[clamp(1.25rem,6vw,1.5rem)] leading-tight font-black tracking-tight uppercase">
                <IdCard className="size-6 shrink-0" strokeWidth={2.5} aria-hidden />
                {t.result.documentTitle(view.document.category)}
              </span>
              <span className="text-lg leading-snug font-semibold">{view.document.note ?? t.result.documentAny}</span>
              <span className="text-sm leading-snug text-[#713f12]">{t.result.documentHint}</span>
            </span>
          )}
          {/* What the organizer asks the door to do (ADR 0089), or what a check looks at. */}
          {view.instruction !== undefined && view.instruction !== null && (
            <span className="flex flex-col gap-1 border-t border-black/10 bg-[#f4f4f5] px-5 py-4">
              <span className="flex items-center gap-1.5 text-sm font-bold tracking-wide text-[#52525b] uppercase">
                <HandHelping className="size-5 shrink-0" strokeWidth={2.5} aria-hidden />
                {view.instruction.label}
              </span>
              <span className="text-[clamp(1.5rem,7.5vw,2rem)] leading-tight font-black tracking-tight uppercase">{view.instruction.text}</span>
              {view.check !== true && <span className="text-sm leading-snug text-[#52525b]">{t.result.instructionHint}</span>}
            </span>
          )}
        </span>
      )}

      {view.note !== undefined && view.note !== null && (
        <span className="pointer-events-none relative max-w-sm text-sm leading-snug font-semibold text-balance opacity-90">{view.note}</span>
      )}
      {view.action !== undefined && view.action !== null && (
        <span className="relative flex w-full max-w-sm flex-col items-center gap-1.5">
          <button
            type="button"
            onClick={onAction}
            className="flex min-h-14 w-full items-center justify-center rounded-2xl bg-[#18181b] px-4 text-lg font-bold text-white shadow-lg transition active:scale-[0.98]"
          >
            {view.action.label}
          </button>
          <span className="text-sm font-medium text-balance opacity-85">{view.action.hint}</span>
        </span>
      )}
      <span
        className={`pointer-events-none relative mt-2 overflow-hidden rounded-full px-5 py-2 font-semibold ${autoMs === null ? "bg-black/20 text-base" : "bg-black/15 text-sm"}`}
      >
        {/* The countdown: the bar empties as the screen goes back to the camera. */}
        {autoMs !== null && (
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 bg-black/20 transition-[width] duration-100 ease-linear"
            style={{ width: `${String(left * 100)}%` }}
          />
        )}
        <span className="relative">{hint}</span>
      </span>
    </div>
  );
}
