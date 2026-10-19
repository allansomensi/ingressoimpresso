"use client";

import { CalendarPlus, Trash2 } from "lucide-react";

import { Button, Field, Input } from "@/components/ui";
import { MAX_DAYS, dayInputLabel, laterLocal, nextDayInput, type DayInput, type DaysProblem } from "@/lib/event-days";
import { panel as panelTexts } from "@/texts/pt-BR/panel";

const t = panelTexts.days;

/**
 * The days of an event of several days (ADR 0091), in the event form: one row per day with its
 * start and end, "add a day" suggesting the next one at the same times. At least two days.
 */
export function EventDaysEditor({
  days,
  onChange,
  problem,
}: {
  days: readonly DayInput[];
  onChange: (days: DayInput[]) => void;
  /** The first problem, shown under its day once the organizer tried to save. */
  problem: DaysProblem | null;
}) {
  const update = (index: number, patch: Partial<DayInput>) => {
    onChange(days.map((day, at) => (at === index ? { ...day, ...patch } : day)));
  };
  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-3">
        {days.map((day, index) => {
          const position = index + 1;
          const label = dayInputLabel(day);
          const wrong = problem?.day === position;
          return (
            <li key={position} className="rounded-xl border border-border bg-surface-2/40 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-fg">
                  {t.day(position)}
                  {label !== null && <span className="font-normal text-fg-muted"> · {label}</span>}
                </span>
                {days.length > 2 && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t.remove(position)}
                    onClick={() => {
                      onChange(days.filter((_, at) => at !== index));
                    }}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={panelTexts.startsAt}>
                  <Input
                    type="datetime-local"
                    value={day.startsAt}
                    aria-invalid={wrong || undefined}
                    onChange={(event) => {
                      const startsAt = event.target.value;
                      // The end follows a new start while it is empty or before it (+5 h).
                      const end = day.endsAt === "" || day.endsAt <= startsAt ? laterLocal(startsAt, 5) : day.endsAt;
                      update(index, { startsAt, endsAt: end });
                    }}
                    required
                  />
                </Field>
                <Field label={panelTexts.endsAt}>
                  <Input
                    type="datetime-local"
                    value={day.endsAt}
                    min={day.startsAt}
                    aria-invalid={wrong || undefined}
                    onChange={(event) => {
                      update(index, { endsAt: event.target.value });
                    }}
                    required
                  />
                </Field>
              </div>
              {wrong && (
                <p role="alert" className="mt-2 text-sm text-danger-fg">
                  {t.problems[problem.kind](problem.day)}
                </p>
              )}
            </li>
          );
        })}
      </ol>
      <Button
        variant="secondary"
        size="sm"
        className="self-start"
        disabled={days.length >= MAX_DAYS}
        icon={<CalendarPlus aria-hidden />}
        onClick={() => {
          onChange([...days, nextDayInput(days.at(-1))]);
        }}
      >
        {t.add}
      </Button>
      <p className="text-xs leading-relaxed text-fg-muted">
        {t.hint} {days.length >= MAX_DAYS ? t.max : t.seriesHint}
      </p>
    </div>
  );
}
