"use client";

import { useMemo } from "react";

import { TicketView } from "@/components/ticket/ticket-view";
import { cn } from "@/lib/cn";
import { svgDataUrl } from "@/lib/rasterize";
import { templateById, type TemplateId } from "@/lib/templates/catalog";
import type { EventFields } from "@/lib/ticket-fields";
import { texts } from "@/texts/pt-BR";

/** Sample dates and prices, in the events' wall-clock time. */
const SAMPLE_START = ["2026-11-21T21:00:00-03:00", "2026-06-20T18:30:00-03:00", "2026-12-12T20:00:00-03:00", "2026-09-05T19:30:00-03:00"];
const SAMPLE_PRICE = [3_000, 1_500, 8_000, 2_000];

/** Templates whose main sample has a date of their season (an arraiá in June…). */
const SEASON_START: Partial<Record<TemplateId, string>> = {
  arraia: "2026-06-20T18:30:00-03:00",
  carnival: "2027-02-06T16:00:00-03:00",
  newYear: "2026-12-31T22:00:00-03:00",
  graduation: "2026-12-12T20:00:00-03:00",
};

/** The sample event a template is shown with (its name and venue fit the template). */
export function sampleEvent(id: TemplateId, index: number): EventFields {
  const sample = texts.landing.templateSamples[id];
  const season = index === 0 ? SEASON_START[id] : undefined;
  return {
    name: sample.name,
    venue: sample.venue,
    startsAt: season ?? SAMPLE_START[index % SAMPLE_START.length] ?? "2026-11-21T21:00:00-03:00",
    ticketPriceCents: SAMPLE_PRICE[index % SAMPLE_PRICE.length] ?? null,
  };
}

/**
 * A template filled with its sample event, sized by its container's width (`height` sets a fixed
 * height instead). `capture` marks it for `just template-images` (ADR 0062).
 */
export function TemplateSample({
  id,
  palette = 0,
  index = 0,
  height,
  className,
  capture = false,
}: {
  id: TemplateId;
  palette?: number;
  index?: number;
  height?: string;
  className?: string;
  capture?: boolean;
}) {
  const template = templateById(id);
  const built = useMemo(() => {
    if (template === undefined) {
      return null;
    }
    const chosen = template.palettes[palette % template.palettes.length] ?? template.palettes[0];
    return chosen === undefined ? null : template.build(chosen);
  }, [template, palette]);
  const art = useMemo(() => (built === null ? null : svgDataUrl(built.background)), [built]);
  if (built === null) {
    return null;
  }
  const { design } = built;
  const total = design.widthMm + (design.stub?.widthMm ?? 0);
  return (
    <div
      data-template-capture={capture ? id : undefined}
      className={cn("overflow-hidden", height === undefined && "w-full", className)}
      style={{ aspectRatio: `${String(total)} / ${String(design.heightMm)}`, ...(height === undefined ? {} : { height }) }}
    >
      <TicketView design={design} event={sampleEvent(id, index)} artUrl={art} number={17 + index * 23} />
    </div>
  );
}
