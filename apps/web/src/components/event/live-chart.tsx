"use client";

import type { DoorLiveBucketDto } from "@ingressoimpresso/api-types";
import { useState } from "react";

import { cn } from "@/lib/cn";
import { niceMax } from "@/lib/door-live";
import { texts } from "@/texts/pt-BR";

const t = texts.event.live;
/** Plot height in px (the columns grow from the baseline). */
const PLOT = 160;

function hhmm(iso: string, plusMinutes = 0): string {
  return new Date(Date.parse(iso) + plusMinutes * 60_000).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Entries per 5-minute window over the last hour (ADR 0071): one series, so one colour and no
 * legend; columns at most 24 px with a 4 px rounded end, a hairline grid with clean ticks, the
 * peak labelled on its cap, and a tooltip per column on hover and focus. A hidden table carries
 * every value for screen readers.
 */
export function EntriesCurve({ buckets }: { buckets: readonly DoorLiveBucketDto[] }) {
  const [active, setActive] = useState<number | null>(null);
  const values = buckets.map((bucket) => bucket.entries);
  const peak = Math.max(0, ...values);
  const top = niceMax(peak);
  const ticks = [0, top / 2, top];
  const peakIndex = peak === 0 ? -1 : values.lastIndexOf(peak);
  const shown = active === null ? null : buckets[active];

  return (
    <div className="flex flex-col gap-2">
      <div className="relative flex" onPointerLeave={() => { setActive(null); }}>
        {/* Y axis: clean ticks, recessive. */}
        <div className="relative mr-2 w-7 shrink-0 text-right text-[11px] text-fg-subtle tabular" style={{ height: PLOT }} aria-hidden>
          {ticks.map((tick) => (
            <span key={tick} className="absolute right-0 -translate-y-1/2 leading-none" style={{ top: PLOT - (tick / top) * PLOT }}>
              {tick.toLocaleString("pt-BR")}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1" style={{ height: PLOT }}>
          {ticks.map((tick) => (
            <span
              key={tick}
              aria-hidden
              className={cn("absolute inset-x-0 h-px", tick === 0 ? "bg-border-strong" : "bg-border")}
              style={{ top: PLOT - (tick / top) * PLOT }}
            />
          ))}
          <div className="absolute inset-0 flex items-end">
            {buckets.map((bucket, index) => {
              const height = bucket.entries === 0 ? 0 : Math.max(4, (bucket.entries / top) * PLOT);
              const label = t.curveTooltip(hhmm(bucket.start), hhmm(bucket.start, 5), bucket.entries);
              return (
                <button
                  key={bucket.start}
                  type="button"
                  aria-label={label}
                  onPointerEnter={() => { setActive(index); }}
                  onFocus={() => { setActive(index); }}
                  onBlur={() => { setActive(null); }}
                  onClick={() => { setActive(index); }}
                  className="group relative flex h-full flex-1 cursor-default items-end justify-center outline-none"
                >
                  {index === peakIndex && (
                    <span
                      className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-[11px] font-semibold text-fg-muted tabular"
                      style={{ bottom: height + 4 }}
                      aria-hidden
                    >
                      {bucket.entries}
                    </span>
                  )}
                  <span
                    className={cn(
                      "w-[62%] max-w-6 rounded-t-[4px] transition-colors group-focus-visible:ring-2 group-focus-visible:ring-ring",
                      active === index ? "bg-brand-hover" : "bg-brand",
                    )}
                    style={{ height }}
                  />
                </button>
              );
            })}
          </div>
          {shown !== undefined && shown !== null && active !== null && (
            <div
              role="status"
              className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs whitespace-nowrap shadow-md"
              style={{ left: `${String(((active + 0.5) / buckets.length) * 100)}%` }}
            >
              <span className="flex items-center gap-2">
                <span className="h-0.5 w-3 rounded-full bg-brand" aria-hidden />
                <strong className="text-sm font-semibold text-fg tabular">{shown.entries}</strong>
                <span className="text-fg-muted">
                  {hhmm(shown.start)}–{hhmm(shown.start, 5)}
                </span>
              </span>
            </div>
          )}
        </div>
      </div>
      {/* X axis: a time every 15 minutes. */}
      <div className="ml-9 flex text-[11px] text-fg-subtle tabular" aria-hidden>
        {buckets.map((bucket, index) => (
          <span key={bucket.start} className="flex-1 text-center">
            {index % 3 === 0 ? hhmm(bucket.start) : ""}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>{t.curveTable}</caption>
        <thead>
          <tr>
            <th scope="col">{t.window}</th>
            <th scope="col">{t.entries}</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((bucket) => (
            <tr key={bucket.start}>
              <td>
                {hhmm(bucket.start)}–{hhmm(bucket.start, 5)}
              </td>
              <td>{bucket.entries}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A meter: the fill in the brand, the track a lighter step of the same hue. */
export function Meter({ value, label, className }: { value: number; label: string; className?: string }) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 1000) / 10;
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className={cn("h-2.5 overflow-hidden rounded-full bg-brand-soft", className)}
    >
      <div className="h-full rounded-full bg-brand transition-[width] duration-700" style={{ width: `${String(percent)}%` }} />
    </div>
  );
}
