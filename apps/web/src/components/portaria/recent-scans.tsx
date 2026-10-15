"use client";

import { AlertTriangle, Check, CheckCircle2, ChevronDown, CloudOff, LogOut, X, XCircle } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { inkFor } from "@/lib/design-rules";
import type { DoorEngine, DoorState } from "@/portaria/engine";
import { clockTime, doorWords } from "@/portaria/logic";
import { scanTime, type RecentScan, type RecentSummary } from "@/portaria/recent";
import { portaria as portariaTexts } from "@/texts/pt-BR/portaria";

const t = portariaTexts.history;

const TONE_ICON = { ok: CheckCircle2, bad: XCircle, warn: AlertTriangle, exit: LogOut } as const;
const TONE_TEXT = { ok: "text-emerald-300", bad: "text-red-300", warn: "text-amber-300", exit: "text-sky-300" } as const;
const TONE_BORDER = { ok: "border-l-emerald-400", bad: "border-l-red-400", warn: "border-l-amber-300", exit: "border-l-sky-400" } as const;

/**
 * This phone's latest scans, read from IndexedDB (offline): opened from the entries counter, so
 * the doorkeeper can look back at a result that went by, or answer "did I let them in?".
 */
export function RecentScans({ engine, state, onClose }: { engine: DoorEngine; state: DoorState; onClose: () => void }) {
  // A stall's fichas, for consumption tokens (ADR 0084).
  const words = doorWords(state.manifest?.event.kind).history;
  const [data, setData] = useState<{ scans: RecentScan[]; summary: RecentSummary } | null>(null);
  const [failed, setFailed] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const titleId = useId();

  // Read again whenever the door records or syncs something.
  useEffect(() => {
    let live = true;
    engine
      .recent()
      .then((next) => {
        if (live) {
          setData(next);
          setFailed(false);
        }
      })
      .catch(() => {
        if (live) {
          setFailed(true);
        }
      });
    return () => {
      live = false;
    };
  }, [engine, state.pending, state.entryCount, state.insideCount, state.result, state.manifest]);

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

  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-end sm:items-center sm:justify-center sm:p-6">
      <button type="button" aria-hidden tabIndex={-1} className="absolute inset-0 cursor-default bg-black/60" onClick={onClose} />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[88dvh] w-full animate-sheet flex-col rounded-t-3xl border border-white/10 bg-[#17151f] text-neutral-50 shadow-2xl sm:max-w-lg sm:animate-pop sm:rounded-3xl"
      >
        <span aria-hidden className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-white/20 sm:hidden" />
        <header className="flex items-start gap-2 px-4 pt-2 pb-3">
          <div className="min-w-0 flex-1 pt-2">
            <h2 id={titleId} className="text-lg font-bold tracking-tight">
              {words.title}
            </h2>
            {data !== null && (
              <p className="mt-2 flex flex-wrap gap-1.5 text-sm font-semibold tabular-nums">
                <span className="rounded-full bg-emerald-400/15 px-2.5 py-0.5 text-emerald-300">{words.admitted(data.summary.admitted)}</span>
                {data.summary.exits > 0 && (
                  <span className="rounded-full bg-sky-400/15 px-2.5 py-0.5 text-sky-300">{t.exits(data.summary.exits)}</span>
                )}
                <span className="rounded-full bg-red-400/15 px-2.5 py-0.5 text-red-300">{t.refused(data.summary.refused)}</span>
                {data.summary.pending > 0 && (
                  <span className="rounded-full bg-amber-400/15 px-2.5 py-0.5 text-amber-200">{t.pending(data.summary.pending)}</span>
                )}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            autoFocus
            className="-mr-1 flex size-11 shrink-0 items-center justify-center rounded-xl text-white/80 transition active:bg-white/10"
          >
            <X className="size-6" aria-hidden />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto overscroll-contain border-t border-white/10 px-3 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {failed ? (
            <p role="alert" className="my-8 text-center text-red-300">
              {t.failed}
            </p>
          ) : data === null ? (
            <p className="my-8 text-center text-white/60">{t.loading}</p>
          ) : data.scans.length === 0 ? (
            <p className="my-8 text-center text-white/70">{t.empty}</p>
          ) : (
            <>
              <p className="mb-2 px-1 text-xs text-white/55">{t.showing(data.scans.length)}</p>
              <ul className="flex flex-col gap-1.5">
                {data.scans.map((scan) => (
                  <ScanItem
                    key={scan.id}
                    scan={scan}
                    open={openId === scan.id}
                    onToggle={() => {
                      setOpenId(openId === scan.id ? null : scan.id);
                    }}
                  />
                ))}
              </ul>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function ScanItem({ scan, open, onToggle }: { scan: RecentScan; open: boolean; onToggle: () => void }) {
  const Icon = TONE_ICON[scan.tone];
  const detailsId = useId();
  return (
    <li className={`overflow-hidden rounded-2xl border border-l-4 border-white/10 bg-white/[0.04] ${TONE_BORDER[scan.tone]}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={detailsId}
        className="flex min-h-14 w-full items-center gap-3 px-3 py-2.5 text-left transition active:bg-white/10"
      >
        <Icon className={`size-6 shrink-0 ${TONE_TEXT[scan.tone]}`} aria-hidden />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className={`font-bold ${TONE_TEXT[scan.tone]}`}>{scan.label}</span>
            {scan.number !== null && <span className="font-mono font-semibold">{scan.number}</span>}
          </span>
          <span className="flex min-w-0 items-center gap-1.5 text-sm text-white/65">
            <span className="shrink-0 tabular-nums">{clockTime(scan.atMs)}</span>
            {scan.category !== null && (
              <span
                className="shrink-0 rounded-md px-1.5 text-xs font-bold uppercase"
                style={{ backgroundColor: scan.category.color, color: inkFor(scan.category.color) }}
              >
                {scan.category.name}
              </span>
            )}
            {scan.detail !== null && <span className="truncate">{scan.detail}</span>}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {scan.synced ? (
            <Check className="size-4 text-white/40" aria-hidden />
          ) : (
            <CloudOff className="size-4 text-amber-300" aria-hidden />
          )}
          <span className="sr-only">{scan.synced ? t.synced : t.notSynced}</span>
          <ChevronDown className={`size-4 text-white/45 transition ${open ? "rotate-180" : ""}`} aria-hidden />
        </span>
      </button>
      {open && (
        <dl id={detailsId} className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 border-t border-white/10 px-4 py-3 text-sm">
          <Row label={t.readAt} value={scanTime(scan.atMs)} />
          <Row label={t.number} value={scan.number ?? t.noNumber} />
          {scan.detail !== null && <Row label={t.why} value={scan.detail} />}
          {scan.category !== null && <Row label={t.category} value={scan.category.name} />}
          {scan.seat !== null && <Row label={t.seat} value={scan.seat} />}
          {scan.seller !== null && <Row label={t.seller} value={scan.seller} />}
          <Row label={t.sync} value={scan.synced ? t.synced : t.notSynced} />
        </dl>
      )}
    </li>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-white/55">{label}</dt>
      <dd className="min-w-0 break-words text-white/90">{value}</dd>
    </>
  );
}
