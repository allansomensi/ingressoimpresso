"use client";

import { CheckCircle2, CloudOff, CloudUpload, X } from "lucide-react";
import { useEffect, useId, useState } from "react";

import type { DoorEngine, DoorState } from "@/portaria/engine";
import { clockTime, doorWords } from "@/portaria/logic";
import type { EndSummary } from "@/portaria/recent";

/** One figure of the sheet. */
function Figure({ label, value, hint, tone = "plain" }: { label: string; value: number; hint?: string; tone?: "plain" | "good" | "bad" }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-2xl bg-white/[0.05] px-4 py-3">
      <dt className="text-xs font-medium text-white/60">{label}</dt>
      <dd
        className={
          tone === "good" ? "text-2xl font-bold text-emerald-300 tabular-nums" : tone === "bad" ? "text-2xl font-bold text-red-300 tabular-nums" : "text-2xl font-bold tabular-nums"
        }
      >
        {value.toLocaleString("pt-BR")}
      </dd>
      {hint !== undefined && <dd className="text-xs text-white/50">{hint}</dd>}
    </div>
  );
}

/**
 * "Fim do evento" (ADR 0101): what this phone did and whether everything reached the server, with
 * a button to send what is left. Read from IndexedDB, so it opens offline; the summary is the
 * phone's own, the entries count is every phone's as last synced.
 */
export function EndOfEvent({ engine, state, onClose }: { engine: DoorEngine; state: DoorState; onClose: () => void }) {
  const words = doorWords(state.manifest?.event.kind).end;
  const titleId = useId();
  const [summary, setSummary] = useState<EndSummary | null>(null);
  const [sending, setSending] = useState(false);
  // The last try to send, to say whether it worked.
  const [tried, setTried] = useState<"ok" | "failed" | null>(null);
  const checkpoint = engine.checkpoint !== null;
  const reentry = state.manifest?.event.reentry === true && !checkpoint;
  const guests = (state.manifest?.guests?.length ?? 0) > 0 && !checkpoint;
  const arrivedPeople = state.arrivals.filter((arrival) => arrival.undoneAtMs === null).reduce((sum, arrival) => sum + arrival.people, 0);

  useEffect(() => {
    let live = true;
    void engine.endSummary().then((next) => {
      if (live) {
        setSummary(next);
      }
    });
    return () => {
      live = false;
    };
  }, [engine, state.pending, state.entryCount, state.lastSyncOkAt]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const send = async () => {
    setSending(true);
    const before = state.lastSyncOkAt;
    try {
      await engine.syncNow();
    } finally {
      setSending(false);
    }
    // `syncNow` keeps the door working when the network fails: the last success tells.
    const after = engine.getSnapshot().lastSyncOkAt;
    setTried(after !== before && after !== null ? "ok" : "failed");
  };

  const pending = state.pending;
  const synced = state.lastSyncOkAt === null ? null : clockTime(state.lastSyncOkAt);

  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-end sm:items-center sm:justify-center sm:p-6">
      <button type="button" aria-hidden tabIndex={-1} className="absolute inset-0 cursor-default bg-black/60" onClick={onClose} />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[92dvh] w-full animate-sheet flex-col overflow-y-auto rounded-t-3xl border border-white/10 bg-[#18181d] text-neutral-50 shadow-2xl sm:max-w-lg sm:animate-pop sm:rounded-3xl"
      >
        <span aria-hidden className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-white/20 sm:hidden" />
        <header className="flex items-start gap-2 px-5 pt-3 pb-2">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-xl font-bold tracking-tight">
              {words.title}
            </h2>
            {state.manifest !== null && <p className="truncate text-sm text-white/60">{state.manifest.event.name}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={words.close}
            className="-mr-1 flex size-11 shrink-0 items-center justify-center rounded-full text-white/70 active:bg-white/10"
          >
            <X className="size-5" aria-hidden />
          </button>
        </header>

        <div className="flex flex-col gap-4 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {pending > 0 ? (
            <div className="flex flex-col gap-3 rounded-2xl border border-amber-300/30 bg-amber-400/10 p-4" data-pending={pending}>
              <p className="flex items-start gap-2.5 text-amber-100">
                <CloudOff className="mt-0.5 size-5 shrink-0 text-amber-300" aria-hidden />
                <span className="flex flex-col gap-0.5">
                  <span className="font-semibold">{words.pending(pending)}</span>
                  <span className="text-sm text-amber-100/80">{words.pendingHint}</span>
                </span>
              </p>
              <button
                type="button"
                disabled={sending}
                onClick={() => void send()}
                className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white text-lg font-bold text-[#0c0c10] transition active:scale-[0.99] disabled:opacity-60"
              >
                {sending ? (
                  <span className="size-5 animate-spin rounded-full border-2 border-black/20 border-t-black" aria-hidden />
                ) : (
                  <CloudUpload className="size-5" aria-hidden />
                )}
                {sending ? words.sending : words.send}
              </button>
              {tried === "failed" && !sending && (
                <p role="alert" className="text-sm font-medium text-red-300">
                  {words.failed}
                </p>
              )}
            </div>
          ) : (
            <p
              role="status"
              className="flex items-start gap-2.5 rounded-2xl border border-emerald-300/30 bg-emerald-400/10 p-4 text-emerald-100"
              data-pending="0"
            >
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-300" aria-hidden />
              <span className="flex flex-col gap-0.5">
                <span className="font-semibold">{words.allSent}</span>
                <span className="text-sm text-emerald-100/80">{synced === null ? words.allSentHint : words.syncedAt(synced)}</span>
              </span>
            </p>
          )}

          <dl className="grid grid-cols-2 gap-2">
            <Figure label={checkpoint ? words.usesAll : words.entriesAll} value={state.entryCount} hint={words.allPhones} tone="good" />
            <Figure label={words.thisPhone} value={summary?.admitted ?? 0} />
            <Figure label={words.copies} value={summary?.copies ?? 0} hint={words.copiesHint} tone={(summary?.copies ?? 0) > 0 ? "bad" : "plain"} />
            <Figure label={words.refused} value={summary?.refused ?? 0} hint={words.refusedHint} />
            {reentry && <Figure label={words.exits} value={summary?.exits ?? 0} hint={words.inside(state.insideCount)} />}
            {guests && <Figure label={words.guests} value={arrivedPeople} />}
            {state.boxOffice !== null && <Figure label={words.boxOffice} value={state.boxOffice.mine.count} />}
          </dl>
          <p className="text-xs leading-relaxed text-white/50">{words.note}</p>
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-12 w-full items-center justify-center rounded-2xl border border-white/15 text-base font-semibold text-white/85 active:bg-white/10"
          >
            {words.back}
          </button>
        </div>
      </section>
    </div>
  );
}
