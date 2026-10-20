"use client";

import type { EventKind } from "@ingressoimpresso/api-types";
import { Check, ImageUp, LayoutTemplate } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { sampleTag } from "@/components/marketing/template-sample";
import { TicketView } from "@/components/ticket/ticket-view";
import { Badge, Button, Dialog, Spinner, Switch } from "@/components/ui";
import { useNearScreen } from "@/components/ui/near-screen";
import { artWithLogo, brandPalette, flyerColors } from "@/lib/brand-palette";
import { cn } from "@/lib/cn";
import { svgDataUrl } from "@/lib/rasterize";
import { TEMPLATES, type Palette, type TemplateCategory, type TicketTemplate } from "@/lib/templates/catalog";
import type { EventFields } from "@/lib/ticket-fields";
import { templates as templatesTexts } from "@/texts/pt-BR/templates";

const t = templatesTexts;
/** Thumbnail frame proportions (width / height). */
const FRAME_RATIO = 1.75;

/** The palette a card shows: the template's own, or redrawn in the brand colours (ADR 0100). */
function paletteFor(base: Palette, colors: readonly string[] | null): Palette {
  return colors === null || colors.length === 0 ? base : brandPalette(base, colors, `${base.id}-brand`);
}

function TemplateCard({
  template,
  event,
  colors,
  logo,
  applying,
  disabled,
  onApply,
}: {
  template: TicketTemplate;
  event: EventFields;
  /** Brand colours to redraw the template in; `null` keeps its own. */
  colors: readonly string[] | null;
  /** The organization's logo (a data URL) to lay on the art. */
  logo: string | null;
  applying: boolean;
  disabled: boolean;
  onApply: (palette: Palette) => void;
}) {
  const [paletteIndex, setPaletteIndex] = useState(0);
  // Dozens of live previews at once are heavy (fitted texts, layout reads): each one waits until
  // its card is near the dialog's visible part.
  const { attach, near } = useNearScreen("300px", "scroll-parent");
  const base = template.palettes[paletteIndex] ?? template.palettes[0];
  const palette = useMemo(() => (base === undefined ? undefined : paletteFor(base, colors)), [base, colors]);
  const built = useMemo(() => (palette === undefined ? null : template.build(palette)), [template, palette]);
  const art = useMemo(() => (built === null ? null : svgDataUrl(artWithLogo(built.background, built.design, logo))), [built, logo]);
  if (palette === undefined || built === null) {
    return null;
  }
  const { design } = built;
  const total = design.widthMm + (design.stub?.widthMm ?? 0);
  const wide = total / design.heightMm >= FRAME_RATIO;
  const item = t.items[template.id];

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-xs transition hover:border-brand/40 hover:shadow-md">
      <div ref={attach} className="flex items-center justify-center bg-surface-2 bg-dots p-4" style={{ aspectRatio: String(FRAME_RATIO) }}>
        <div
          className="overflow-hidden rounded-[3px] shadow-md ring-1 ring-black/10 transition group-hover:-translate-y-0.5"
          style={wide ? { width: "100%" } : { height: "100%", aspectRatio: `${String(total)} / ${String(design.heightMm)}` }}
        >
          {near ? (
            <TicketView
              design={design}
              event={event}
              artUrl={art}
              number={42}
              // A ficha shows its product's band (ADR 0084).
              tag={template.categories.includes("tokens") ? sampleTag(event, palette) : null}
            />
          ) : (
            <div aria-hidden className="size-full" style={{ aspectRatio: `${String(total)} / ${String(design.heightMm)}`, background: design.backgroundColor }} />
          )}
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
            {template.palettes.map((templateOption, index) => {
              const option = paletteFor(templateOption, colors);
              const checked = index === paletteIndex;
              return (
                <button
                  key={templateOption.id}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  aria-label={t.palettes[templateOption.id] ?? templateOption.id}
                  title={t.palettes[templateOption.id] ?? templateOption.id}
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

type ColorSource = "template" | "organization" | "flyer";

/** The organization's colour first, then the main colours of its logo; empty without either. */
function useOrganizationColors(brandColor: string | null, logo: string | null): string[] {
  const [logoColors, setLogoColors] = useState<{ logo: string; colors: string[] } | null>(null);
  useEffect(() => {
    if (logo === null) {
      return;
    }
    let live = true;
    fetch(logo)
      .then((response) => response.blob())
      .then(flyerColors)
      .then((colors) => {
        if (live) {
          setLogoColors({ logo, colors });
        }
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [logo]);
  return useMemo(() => {
    const fromLogo = logoColors !== null && logoColors.logo === logo ? logoColors.colors : [];
    return [...(brandColor === null ? [] : [brandColor]), ...fromLogo.filter((color) => color !== brandColor)].slice(0, 4);
  }, [brandColor, logo, logoColors]);
}

type Flyer = {
  colors: string[] | null;
  reading: boolean;
  failed: boolean;
  read: (file: File) => void;
  promote: (color: string) => void;
};

/** The colours of a flyer picked on the device (the image never leaves it). */
function useFlyer(): Flyer {
  const [colors, setColors] = useState<string[] | null>(null);
  const [reading, setReading] = useState(false);
  const [failed, setFailed] = useState(false);
  return {
    colors,
    reading,
    failed,
    read: (file) => {
      setReading(true);
      setFailed(false);
      flyerColors(file)
        .then((found) => {
          setColors(found.length === 0 ? null : found);
          setFailed(found.length === 0);
        })
        .catch(() => {
          setFailed(true);
        })
        .finally(() => {
          setReading(false);
        });
    },
    promote: (color) => {
      setColors((current) => (current === null ? null : [color, ...current.filter((other) => other !== color)]));
    },
  };
}

function Swatches({ colors, onPick }: { colors: readonly string[]; onPick?: (color: string) => void }) {
  return (
    <span className="flex items-center gap-1.5">
      {colors.map((color, index) =>
        onPick === undefined ? (
          <span key={color} aria-hidden className="size-6 rounded-full ring-1 ring-black/15" style={{ backgroundColor: color }} />
        ) : (
          <button
            key={color}
            type="button"
            aria-label={t.brand.main(color)}
            aria-pressed={index === 0}
            onClick={() => {
              onPick(color);
            }}
            className={cn(
              "touch-target relative size-7 rounded-full ring-1 ring-black/15 transition",
              index === 0 ? "ring-2 ring-brand ring-offset-2 ring-offset-surface" : "hover:scale-110 active:scale-110",
            )}
            style={{ backgroundColor: color }}
          />
        ),
      )}
    </span>
  );
}

/** Where the template's colours come from: its own, the organization's or a flyer's (ADR 0100). */
function BrandColors({
  source,
  onSource,
  organizationColors,
  flyer,
  logo,
  logoOn,
  onLogoOn,
}: {
  source: ColorSource;
  onSource: (source: ColorSource) => void;
  organizationColors: readonly string[];
  flyer: Flyer;
  logo: string | null;
  logoOn: boolean;
  onLogoOn: (on: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const b = t.brand;
  const options: { value: ColorSource; label: string }[] = [
    { value: "template", label: b.template },
    { value: "organization", label: b.organization },
    { value: "flyer", label: b.flyer },
  ];
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface-2/60 p-3.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-sm font-medium text-fg">{b.label}</span>
        <div role="radiogroup" aria-label={b.label} className="flex gap-1 rounded-xl bg-surface p-1 ring-1 ring-border">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={source === option.value}
              onClick={() => {
                onSource(option.value);
                if (option.value === "flyer" && flyer.colors === null) {
                  input.current?.click();
                }
              }}
              className={cn(
                "min-h-9 rounded-lg px-3 text-sm font-medium transition",
                source === option.value ? "bg-brand-solid text-brand-fg shadow-sm" : "text-fg-muted hover:bg-surface-2 hover:text-fg active:bg-surface-2",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file !== undefined) {
              onSource("flyer");
              flyer.read(file);
            }
          }}
        />
      </div>
      {source === "organization" &&
        (organizationColors.length === 0 ? (
          <p className="text-[13px] text-fg-muted">{b.noOrganization}</p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Swatches colors={organizationColors} />
            <span className="min-w-0 flex-1 text-[13px] text-fg-muted">{b.organizationHint}</span>
          </div>
        ))}
      {source === "flyer" && (
        <div className="flex flex-wrap items-center gap-3">
          {flyer.reading ? (
            <span className="flex items-center gap-2 text-[13px] text-fg-muted">
              <Spinner className="size-4" />
              {b.flyerReading}
            </span>
          ) : (
            flyer.colors !== null && <Swatches colors={flyer.colors} onPick={flyer.promote} />
          )}
          <Button
            variant="secondary"
            size="sm"
            icon={<ImageUp />}
            onClick={() => {
              input.current?.click();
            }}
          >
            {flyer.colors === null ? b.flyerPick : b.flyerChange}
          </Button>
          <span className={cn("basis-full text-[13px]", flyer.failed ? "text-danger-fg" : "text-fg-muted")}>{flyer.failed ? b.flyerFailed : b.flyerHint}</span>
        </div>
      )}
      {source !== "template" && logo !== null && <Switch checked={logoOn} onChange={onLogoOn} label={b.logo} description={b.logoHint} />}
    </section>
  );
}

/** The template gallery, shown with the event's own name, date and venue. */
export function TemplateGallery({
  open,
  onClose,
  event,
  kind = "tickets",
  applying,
  brandColor = null,
  logo = null,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  event: EventFields;
  /** Consumption tokens open on the ficha templates (ADR 0084). */
  kind?: EventKind;
  /** Id of the template being applied. */
  applying: string | null;
  /** The organization's colour (ADR 0064), for the templates in its colours (ADR 0100). */
  brandColor?: string | null;
  /** The organization's logo as a data URL, when it has one. */
  logo?: string | null;
  /** `logo` is the one to lay on the art, or `null`. */
  onApply: (template: TicketTemplate, palette: Palette, logo: string | null) => void;
}) {
  const [category, setCategory] = useState<TemplateCategory | null>(kind === "tokens" ? "tokens" : null);
  const [source, setSource] = useState<ColorSource>("template");
  const [logoOn, setLogoOn] = useState(true);
  const organizationColors = useOrganizationColors(brandColor, logo);
  const flyer = useFlyer();
  const colors = source === "organization" ? organizationColors : source === "flyer" ? flyer.colors : null;
  // The logo goes with the organization's colours, or with a flyer's when asked.
  const cardLogo = source !== "template" && logoOn ? logo : null;
  // A ficha shows its product (`{categoria}`): a sample one when the event has none yet.
  const sample: EventFields = { ...event, categoryName: event.categoryName ?? t.sampleCategory };
  // "All" of a ticket event leaves the fichas out: they print a product, not an entrance.
  const shown =
    category === null
      ? TEMPLATES.filter((template) => kind === "tokens" || !template.categories.includes("tokens"))
      : TEMPLATES.filter((template) => template.categories.includes(category));
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
        <BrandColors
          source={source}
          onSource={setSource}
          organizationColors={organizationColors}
          flyer={flyer}
          logo={logo}
          logoOn={logoOn}
          onLogoOn={setLogoOn}
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              event={sample}
              colors={colors}
              logo={cardLogo}
              applying={applying === template.id}
              disabled={applying !== null}
              onApply={(palette) => {
                onApply(template, palette, cardLogo);
              }}
            />
          ))}
        </div>
      </div>
    </Dialog>
  );
}
