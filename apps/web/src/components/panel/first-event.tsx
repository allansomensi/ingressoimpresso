"use client";

import type { AccountDto } from "@ingressoimpresso/api-types";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Church,
  Coins,
  GraduationCap,
  HeartHandshake,
  LayoutTemplate,
  Music,
  PartyPopper,
  Plus,
  School,
  Ticket,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui";
import type { EventPreset } from "@/components/panel/event-form";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { TemplateCategory } from "@/lib/templates/catalog";
import { panel as panelTexts } from "@/texts/pt-BR/panel";

const t = panelTexts.firstEvent;

/** A quick start: the kind of event, and the templates the gallery opens on after it. */
export interface FirstEventStart {
  preset: EventPreset;
  /** `null`: every template. */
  category: TemplateCategory | null;
}

type PresetKey = keyof typeof t.presets;

const PRESETS: readonly { key: PresetKey; Icon: LucideIcon; category: TemplateCategory }[] = [
  { key: "music", Icon: Music, category: "music" },
  { key: "party", Icon: PartyPopper, category: "party" },
  { key: "formal", Icon: GraduationCap, category: "formal" },
  { key: "school", Icon: School, category: "school" },
  { key: "church", Icon: Church, category: "church" },
  { key: "charity", Icon: HeartHandshake, category: "charity" },
  { key: "sports", Icon: Trophy, category: "sports" },
  { key: "tokens", Icon: Coins, category: "tokens" },
];

/**
 * The events page of an account without events (ADR 0122): what comes next in three steps, and
 * the kind of event as the first question. A kind opens the event form with an example name; once
 * the event exists, its ticket section opens the gallery on that kind's templates.
 */
export function FirstEvent({ onStart }: { onStart: (start: FirstEventStart | null) => void }) {
  const account = useQuery({ queryKey: ["account"], queryFn: () => api<AccountDto>("/api/account"), staleTime: 60_000 });
  const free = account.data?.freeTicketsLeft ?? 0;
  return (
    <section aria-labelledby="first-event-title" className="overflow-hidden rounded-3xl border border-border bg-surface shadow-xs animate-fade-in">
      <div className="relative overflow-hidden bg-gradient-to-br from-brand-solid to-brand-hover px-5 pt-6 pb-7 text-brand-fg sm:px-8 sm:pt-8 sm:pb-9">
        {/* A few tickets in the corner, like the welcome tour. */}
        <span aria-hidden className="pointer-events-none absolute -top-6 -right-8 flex rotate-12 gap-3 opacity-20 sm:right-4">
          <Ticket className="size-24 sm:size-32" strokeWidth={1.25} />
          <Ticket className="mt-10 size-20 sm:size-24" strokeWidth={1.25} />
        </span>
        <p className="text-xs font-semibold tracking-wide uppercase opacity-90">{t.eyebrow}</p>
        <h2 id="first-event-title" className="mt-2 max-w-xl text-2xl leading-tight font-semibold tracking-tight text-balance sm:text-3xl">
          {t.title}
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed opacity-90 sm:text-base">{t.body}</p>
        {free > 0 && (
          <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-sm font-semibold text-brand-fg ring-1 ring-white/30">
            <PartyPopper className="size-4 shrink-0" aria-hidden />
            {t.free(free)}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-6 px-5 py-6 sm:px-8 sm:py-7">
        <ol aria-label={t.stepsLabel} className="grid grid-cols-3 gap-2 sm:gap-3">
          {t.steps.map((step, index) => (
            <li
              key={step}
              aria-current={index === 0 ? "step" : undefined}
              className={cn(
                "flex flex-col gap-1.5 rounded-xl border px-2.5 py-2 sm:flex-row sm:items-center sm:gap-2.5 sm:px-3",
                index === 0 ? "border-brand/50 bg-brand-soft/60" : "border-border",
              )}
            >
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular",
                  index === 0 ? "bg-brand-solid text-brand-fg" : "bg-surface-2 text-fg-muted",
                )}
              >
                {index + 1}
              </span>
              <span className={cn("text-xs leading-snug font-medium sm:text-sm", index === 0 ? "text-fg" : "text-fg-muted")}>{step}</span>
            </li>
          ))}
        </ol>
        {/* The welcome tour's "Criar meu primeiro evento" brings the focus here. */}
        <div data-first-event className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-fg">{t.pick}</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            {PRESETS.map(({ key, Icon, category }) => {
              const preset = t.presets[key];
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    onStart({ preset: { kind: key === "tokens" ? "tokens" : "tickets", placeholder: preset.placeholder }, category });
                  }}
                  className="group flex min-h-14 items-center gap-3 rounded-xl border border-border bg-surface p-2.5 text-left transition hover:border-brand/50 hover:bg-brand-soft/40 active:scale-[0.98] active:bg-brand-soft/60 sm:min-h-16 sm:p-3"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-fg-muted transition group-hover:bg-brand-solid group-hover:text-brand-fg sm:size-10">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span className="min-w-0 text-sm leading-snug font-medium text-fg">{preset.title}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex flex-col gap-2 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
          <Button
            variant="secondary"
            icon={<Plus />}
            onClick={() => {
              onStart(null);
            }}
          >
            {t.other}
          </Button>
          <Link
            href="/modelos"
            className="relative touch-target inline-flex items-center justify-center gap-1.5 self-center rounded-lg text-sm font-medium text-fg-muted underline-offset-2 hover:text-fg hover:underline active:text-fg"
          >
            <LayoutTemplate className="size-4" aria-hidden />
            {t.seeModels}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}
