"use client";

/**
 * The deadline of a reservation (ADR 0072): "Amanhã", "3 dias", "Sexta" or a chosen date and time,
 * always in the event's time. Used on the seller's page and on the panel.
 */
import { CalendarClock } from "lucide-react";
import { useState } from "react";

import { Input } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  SHORTCUTS,
  deadlineFromInput,
  deadlineInput,
  deadlineLabel,
  deadlineProblem,
  eventNowInput,
  shortcutDeadline,
  type DeadlineShortcut,
} from "@/lib/reservations";
import { sellerPage as sellerPageTexts } from "@/texts/pt-BR";

const s = sellerPageTexts.sheet;

type Choice = DeadlineShortcut | "custom";

/** The picker's state: the chosen deadline (RFC 3339 in the event's offset) and what is wrong. */
export function useDeadline(now: Date, offset: number, endsAt: string, initial?: string) {
  const [choice, setChoice] = useState<Choice>(initial === undefined ? "tomorrow" : "custom");
  const [custom, setCustom] = useState(() => deadlineInput(initial ?? shortcutDeadline("three_days", now, offset)));
  const deadline = choice === "custom" ? deadlineFromInput(custom, offset) : shortcutDeadline(choice, now, offset);
  const error = deadline === null ? "past" : deadlineProblem(deadline, now, endsAt);
  return { choice, setChoice, custom, setCustom, deadline, error, now, offset, endsAt };
}

export function DeadlinePicker({ state }: { state: ReturnType<typeof useDeadline> }) {
  const { choice, setChoice, custom, setCustom, deadline, error, now, offset, endsAt } = state;
  return (
    <fieldset className="flex flex-col gap-2.5">
      <legend className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-fg">
        <CalendarClock aria-hidden className="size-4 text-fg-subtle" />
        {s.deadline}
      </legend>
      <div role="radiogroup" aria-label={s.deadline} className="grid grid-cols-4 gap-1.5">
        {[...SHORTCUTS, "custom" as const].map((option) => {
          const blocked = option !== "custom" && deadlineProblem(shortcutDeadline(option, now, offset), now, endsAt) !== null;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={choice === option}
              disabled={blocked}
              onClick={() => {
                setChoice(option);
              }}
              className={cn(
                "h-10 rounded-xl border px-1 text-[13px] font-medium transition pointer-coarse:h-11 disabled:opacity-40",
                choice === option
                  ? "border-brand bg-brand-soft text-brand-soft-fg ring-2 ring-brand/20"
                  : "border-border-strong bg-surface text-fg-muted hover:bg-surface-2 hover:text-fg active:bg-surface-2",
              )}
            >
              {s.shortcuts[option]}
            </button>
          );
        })}
      </div>
      {choice === "custom" && (
        <Input
          type="datetime-local"
          aria-label={s.deadline}
          value={custom}
          min={eventNowInput(now, offset)}
          max={deadlineInput(endsAt)}
          onChange={(event) => {
            setCustom(event.target.value);
          }}
        />
      )}
      <p className={cn("text-xs leading-relaxed", error === null ? "text-fg-muted" : "text-danger-fg")}>
        {error !== null
          ? s.deadlineErrors[error]
          : deadline !== null && (
              <>
                <span className="font-medium text-fg">{s.deadlinePreview(deadlineLabel(deadline, now))}</span>
                <span className="block">{s.deadlineHint}</span>
              </>
            )}
      </p>
    </fieldset>
  );
}
