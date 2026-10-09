"use client";

import { useState } from "react";

import { cn } from "@/lib/cn";

/** A day of a bar chart. */
export interface Bar {
  /** `YYYY-MM-DD`. */
  date: string;
  value: number;
}

const HEIGHT = 140;

function dayLabel(date: string): string {
  const [, month = "", day = ""] = date.split("-");
  return `${day}/${month}`;
}

/** Daily bars with a highlighted bar under the pointer; values and labels formatted by the caller. */
export function BarChart({
  bars,
  format,
  describe,
  label,
}: {
  bars: readonly Bar[];
  format: (value: number) => string;
  describe: (date: string, value: string) => string;
  label: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...bars.map((bar) => bar.value));
  const width = 100 / Math.max(bars.length, 1);
  const shown = active === null ? bars.at(-1) : bars[active];
  const total = bars.reduce((sum, bar) => sum + bar.value, 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-semibold text-fg tabular">{format(total)}</span>
        {shown !== undefined && <span className="text-fg-muted tabular">{describe(dayLabel(shown.date), format(shown.value))}</span>}
      </div>
      <svg
        role="img"
        aria-label={`${label}: ${format(total)}`}
        viewBox={`0 0 100 ${String(HEIGHT)}`}
        preserveAspectRatio="none"
        className="h-36 w-full overflow-visible"
        onPointerLeave={() => {
          setActive(null);
        }}
      >
        <line x1="0" x2="100" y1={HEIGHT} y2={HEIGHT} className="stroke-border" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        {bars.map((bar, index) => {
          const height = bar.value === 0 ? 1.5 : Math.max(3, (bar.value / max) * (HEIGHT - 8));
          return (
            <g
              key={bar.date}
              onPointerEnter={() => {
                setActive(index);
              }}
            >
              <rect x={index * width} y="0" width={width} height={HEIGHT} fill="transparent" />
              <rect
                x={index * width + width * 0.18}
                y={HEIGHT - height}
                width={width * 0.64}
                height={height}
                rx="0.8"
                className={cn(
                  "transition-colors",
                  bar.value === 0 ? "fill-border" : active === index ? "fill-brand-hover" : "fill-brand",
                )}
              >
                <title>{describe(dayLabel(bar.date), format(bar.value))}</title>
              </rect>
            </g>
          );
        })}
      </svg>
      <div className="flex justify-between text-[11px] text-fg-subtle tabular">
        <span>{bars[0] === undefined ? "" : dayLabel(bars[0].date)}</span>
        <span>{bars.at(-1) === undefined ? "" : dayLabel(bars.at(-1)?.date ?? "")}</span>
      </div>
    </div>
  );
}
