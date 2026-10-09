"use client";

import { useMemo } from "react";

import { TicketView } from "@/components/ticket/ticket-view";
import { svgDataUrl } from "@/lib/rasterize";
import { TEMPLATES, type TicketTemplate } from "@/lib/templates/catalog";
import type { EventFields } from "@/lib/ticket-fields";
import { texts } from "@/texts/pt-BR";

const t = texts.landing;
/** Sample dates and prices, in the events' wall-clock time. */
const SAMPLE_START = ["2026-11-21T21:00:00-03:00", "2026-06-20T18:30:00-03:00", "2026-12-12T20:00:00-03:00", "2026-09-05T19:30:00-03:00"];
const SAMPLE_PRICE = [3_000, 1_500, 8_000, 2_000];

function Sample({ template, index }: { template: TicketTemplate; index: number }) {
  const built = useMemo(() => {
    const palette = template.palettes[index % template.palettes.length] ?? template.palettes[0];
    return palette === undefined ? null : template.build(palette);
  }, [template, index]);
  const art = useMemo(() => (built === null ? null : svgDataUrl(built.background)), [built]);
  if (built === null) {
    return null;
  }
  const { design } = built;
  const sample = t.templateSamples[template.id];
  const event: EventFields = {
    name: sample.name,
    venue: sample.venue,
    startsAt: SAMPLE_START[index % SAMPLE_START.length] ?? "2026-11-21T21:00:00-03:00",
    ticketPriceCents: SAMPLE_PRICE[index % SAMPLE_PRICE.length] ?? null,
  };
  const total = design.widthMm + (design.stub?.widthMm ?? 0);
  return (
    <div
      className="h-32 shrink-0 overflow-hidden rounded-[3px] shadow-lg ring-1 ring-black/10 sm:h-40"
      style={{ aspectRatio: `${String(total)} / ${String(design.heightMm)}` }}
    >
      <TicketView design={design} event={event} artUrl={art} number={17 + index * 23} />
    </div>
  );
}

function Row({ templates, reverse, offset }: { templates: readonly TicketTemplate[]; reverse?: boolean; offset: number }) {
  return (
    <div className="flex overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)] motion-reduce:overflow-x-auto">
      <div className={`flex w-max animate-marquee gap-6 pr-6 hover:[animation-play-state:paused] ${reverse === true ? "[animation-direction:reverse]" : ""}`}>
        {/* Twice, so the loop is seamless. */}
        {[0, 1].map((copy) =>
          templates.map((template, index) => (
            <div key={`${String(copy)}-${template.id}`} aria-hidden={copy === 1 ? true : undefined}>
              <Sample template={template} index={index + offset} />
            </div>
          )),
        )}
      </div>
    </div>
  );
}

/** Two rows of templates sliding by, filled with sample events. */
export function TemplateShowcase() {
  const half = Math.ceil(TEMPLATES.length / 2);
  return (
    <div className="flex flex-col gap-6 py-2" role="img" aria-label={t.templatesTitle}>
      <Row templates={TEMPLATES.slice(0, half)} offset={0} />
      <Row templates={TEMPLATES.slice(half)} reverse offset={1} />
    </div>
  );
}
