"use client";

import { Check } from "lucide-react";
import { useState, type ReactNode } from "react";

import { CertificateView } from "@/components/certificate/certificate-view";
import { Dialog } from "@/components/ui";
import {
  BACK_TEMPLATES,
  CERTIFICATE_PALETTES,
  FRONT_TEMPLATES,
  type BackTemplate,
  type CertificatePalette,
  type FrontTemplate,
  type TemplateInput,
} from "@/lib/certificate-templates";
import type { CertificateFields } from "@/lib/certificates";
import { cn } from "@/lib/cn";
import type { PageOrientation } from "@ingressoimpresso/api-types";
import { certificateEditor as texts } from "@/texts/pt-BR/certificate-editor";

const g = texts.templates;

/** The templates of the certificate in a palette: fronts, and backs for the current orientation. */
export function CertificateGallery({
  open,
  side,
  orientation,
  input,
  fields,
  imageUrls,
  logoUrl,
  onClose,
  onFront,
  onBack,
}: {
  open: boolean;
  /** Which list comes first. */
  side: "front" | "back";
  orientation: PageOrientation;
  /** What the templates keep (the certificate's name and who signs); the palette is chosen here. */
  input: Omit<TemplateInput, "palette">;
  fields: CertificateFields;
  imageUrls: readonly (string | null)[];
  logoUrl: string | null;
  onClose: () => void;
  onFront: (template: FrontTemplate, palette: CertificatePalette) => void;
  onBack: (template: BackTemplate, palette: CertificatePalette) => void;
}) {
  const [palette, setPalette] = useState<CertificatePalette>(CERTIFICATE_PALETTES[0] ?? { id: "navy", name: "", accent: "#1f3a5f", detail: "#b8892b" });
  const full = { ...input, palette };
  const card = (key: string, name: string, description: string, onPick: () => void, preview: ReactNode) => (
    <li key={key}>
      <button
        type="button"
        onClick={onPick}
        className="group flex w-full flex-col gap-2 rounded-2xl border border-border p-2 text-left transition hover:border-brand/60 hover:bg-surface-2 active:bg-surface-2 focus-visible:outline-2 focus-visible:outline-brand"
      >
        <div aria-hidden className="pointer-events-none overflow-hidden rounded-lg shadow-sm ring-1 ring-black/10">{preview}</div>
        <span className="px-1">
          <span className="block text-sm font-semibold text-fg">{name}</span>
          <span className="block text-xs leading-relaxed text-fg-muted">{description}</span>
        </span>
      </button>
    </li>
  );
  const fronts = (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-fg">{g.front}</h3>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {FRONT_TEMPLATES.map((template) =>
          card(
            template.id,
            template.name,
            template.description,
            () => {
              onFront(template, palette);
            },
            <CertificateView page={template.build(full)} orientation={template.orientation} fields={fields} imageUrls={imageUrls} logoUrl={logoUrl} brand={false} />,
          ),
        )}
      </ul>
    </section>
  );
  const backs = (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-fg">{g.back}</h3>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {BACK_TEMPLATES.map((template) =>
          card(
            template.id,
            template.name,
            template.description,
            () => {
              onBack(template, palette);
            },
            <CertificateView page={template.build(full, orientation)} orientation={orientation} fields={fields} imageUrls={imageUrls} logoUrl={logoUrl} brand={false} />,
          ),
        )}
      </ul>
    </section>
  );
  return (
    <Dialog open={open} onClose={onClose} title={g.title} description={g.description} size="xl">
      <div className="flex flex-col gap-6">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium text-fg">{g.color}</legend>
          <div className="flex flex-wrap gap-2">
            {CERTIFICATE_PALETTES.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-label={option.name}
                title={option.name}
                aria-pressed={palette.id === option.id}
                onClick={() => {
                  setPalette(option);
                }}
                className={cn(
                  "relative flex size-10 items-center justify-center overflow-hidden rounded-full ring-offset-2 ring-offset-surface transition touch-target pointer-coarse:size-11",
                  palette.id === option.id ? "ring-2 ring-brand" : "ring-1 ring-black/10",
                )}
                style={{ background: `linear-gradient(135deg, ${option.accent} 0 60%, ${option.detail} 60% 100%)` }}
              >
                {palette.id === option.id && <Check className="size-4 text-white drop-shadow" aria-hidden />}
              </button>
            ))}
          </div>
        </fieldset>
        {side === "front" ? (
          <>
            {fronts}
            {backs}
          </>
        ) : (
          <>
            {backs}
            {fronts}
          </>
        )}
      </div>
    </Dialog>
  );
}
