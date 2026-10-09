"use client";

import { Check, LayoutTemplate } from "lucide-react";
import { useMemo, useState } from "react";

import { TicketView } from "@/components/ticket/ticket-view";
import { Badge, Button, Dialog } from "@/components/ui";
import { cn } from "@/lib/cn";
import { svgDataUrl } from "@/lib/rasterize";
import { TEMPLATES, type Palette, type TemplateCategory, type TicketTemplate } from "@/lib/templates/catalog";
import type { EventFields } from "@/lib/ticket-fields";
import { texts } from "@/texts/pt-BR";

const t = texts.templates;
/** Thumbnail frame proportions (width / height). */
const FRAME_RATIO = 1.75;

function TemplateCard({
  template,
  event,
  applying,
  disabled,
  onApply,
}: {
  template: TicketTemplate;
  event: EventFields;
  applying: boolean;
  disabled: boolean;
  onApply: (palette: Palette) => void;
}) {
  const [paletteIndex, setPaletteIndex] = useState(0);
  const palette = template.palettes[paletteIndex] ?? template.palettes[0];
  const built = useMemo(() => (palette === undefined ? null : template.build(palette)), [template, palette]);
  const art = useMemo(() => (built === null ? null : svgDataUrl(built.background)), [built]);
  if (palette === undefined || built === null) {
    return null;
  }
  const { design } = built;
  const total = design.widthMm + (design.stub?.widthMm ?? 0);
  const wide = total / design.heightMm >= FRAME_RATIO;
  const item = t.items[template.id];

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-xs transition hover:border-brand/40 hover:shadow-md">
      <div className="flex items-center justify-center bg-surface-2 bg-dots p-4" style={{ aspectRatio: String(FRAME_RATIO) }}>
        <div
          className="overflow-hidden rounded-[3px] shadow-md ring-1 ring-black/10 transition group-hover:-translate-y-0.5"
          style={wide ? { width: "100%" } : { height: "100%", aspectRatio: `${String(total)} / ${String(design.heightMm)}` }}
        >
          <TicketView design={design} event={event} artUrl={art} number={42} />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold tracking-tight text-fg">{item.name}</h3>
            <Badge tone="neutral" className="shrink-0">
              {t.format(design.widthMm, design.heightMm, design.stub !== null)}
            </Badge>
          </div>
          <p className="text-sm leading-relaxed text-fg-muted">{item.description}</p>
        </div>
        <div className="mt-auto flex items-center justify-between gap-3">
          <div role="radiogroup" aria-label={t.colors} className="flex items-center gap-1.5">
            {template.palettes.map((option, index) => {
              const checked = index === paletteIndex;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  aria-label={t.palettes[option.id] ?? option.id}
                  title={t.palettes[option.id] ?? option.id}
                  onClick={() => {
                    setPaletteIndex(index);
                  }}
                  className={cn(
                    "relative size-7 overflow-hidden rounded-full ring-1 ring-black/15 transition",
                    checked ? "ring-2 ring-brand ring-offset-2 ring-offset-surface" : "hover:scale-110",
                  )}
                  style={{ background: `linear-gradient(135deg, ${option.bg} 0 50%, ${option.accent} 50% 100%)` }}
                >
                  {checked && <Check className="absolute inset-0 m-auto size-3.5 text-white drop-shadow" aria-hidden />}
                </button>
              );
            })}
          </div>
          <Button
            size="sm"
            loading={applying}
            disabled={disabled}
            onClick={() => {
              onApply(palette);
            }}
          >
            {applying ? t.applying : t.apply}
          </Button>
        </div>
      </div>
    </article>
  );
}

/** The template gallery, shown with the event's own name, date and venue. */
export function TemplateGallery({
  open,
  onClose,
  event,
  applying,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  event: EventFields;
  /** Id of the template being applied. */
  applying: string | null;
  onApply: (template: TicketTemplate, palette: Palette) => void;
}) {
  const [category, setCategory] = useState<TemplateCategory | null>(null);
  const shown = category === null ? TEMPLATES : TEMPLATES.filter((template) => template.categories.includes(category));
  const categories = Object.keys(t.categories) as TemplateCategory[];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <LayoutTemplate className="size-5 text-brand" aria-hidden />
          {t.title}
        </span>
      }
      description={t.subtitle}
      size="xl"
    >
      <div className="flex flex-col gap-5">
        <div role="radiogroup" aria-label={t.title} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {[null, ...categories].map((option) => {
            const checked = option === category;
            return (
              <button
                key={option ?? "all"}
                type="button"
                role="radio"
                aria-checked={checked}
                onClick={() => {
                  setCategory(option);
                }}
                className={cn(
                  "shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition",
                  checked ? "bg-brand-solid text-brand-fg shadow-sm" : "bg-surface-2 text-fg-muted hover:bg-surface-3 hover:text-fg",
                )}
              >
                {option === null ? t.all : t.categories[option]}
              </button>
            );
          })}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              event={event}
              applying={applying === template.id}
              disabled={applying !== null}
              onApply={(palette) => {
                onApply(template, palette);
              }}
            />
          ))}
        </div>
      </div>
    </Dialog>
  );
}
