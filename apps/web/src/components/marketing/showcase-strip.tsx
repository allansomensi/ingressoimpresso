"use client";

import { Pause, Play } from "lucide-react";
import { useState, type ReactNode } from "react";

/**
 * The frame of the sliding template rows: a list of pictures with one button that stops and
 * restarts the movement for everyone, keyboard and touch included (the rows only pause by
 * themselves under the mouse or around the focus). Hidden when the system asks for less motion:
 * the rows do not move then.
 */
export function ShowcaseStrip({ label, pause, play, children }: { label: string; pause: string; play: string; children: ReactNode }) {
  const [paused, setPaused] = useState(false);
  return (
    <div role="group" aria-label={label} data-paused={paused} className="group/strip relative flex flex-col gap-4">
      {children}
      <div className="flex justify-center px-4 motion-reduce:hidden">
        <button
          type="button"
          aria-pressed={paused}
          onClick={() => {
            setPaused(!paused);
          }}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-surface px-4 text-sm font-medium text-fg-muted shadow-xs transition hover:text-fg active:bg-surface-2"
        >
          {paused ? <Play className="size-4" aria-hidden /> : <Pause className="size-4" aria-hidden />}
          {paused ? play : pause}
        </button>
      </div>
    </div>
  );
}
