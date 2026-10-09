"use client";

import type { ArtDto, TicketDesign } from "@ingressoimpresso/api-types";
import { ImageIcon, ImageUp, Trash2 } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";

import { Badge, Button, Spinner } from "@/components/ui";
import { cn } from "@/lib/cn";
import { BLEED_MM } from "@/lib/design-rules";
import { texts } from "@/texts/pt-BR";

const t = texts.event.design;
const MM_PER_INCH = 25.4;

/** Effective resolution of the art at final size (it covers the body plus bleed). */
export function artDpi(art: ArtDto, design: TicketDesign): number {
  const widthIn = (design.widthMm + 2 * BLEED_MM) / MM_PER_INCH;
  const heightIn = (design.heightMm + 2 * BLEED_MM) / MM_PER_INCH;
  return Math.round(Math.min(art.widthPx / widthIn, art.heightPx / heightIn));
}

export function ArtPicker({
  art,
  design,
  uploading,
  onFile,
  onRemove,
}: {
  art: ArtDto | null;
  design: TicketDesign;
  uploading: boolean;
  onFile: (file: File) => void;
  onRemove: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const dpi = art === null ? null : artDpi(art, design);
  const drop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    const file = event.dataTransfer.files[0];
    if (file !== undefined) {
      onFile(file);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => {
          setOver(false);
        }}
        onDrop={drop}
        disabled={uploading}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition",
          over ? "border-brand bg-brand-soft" : "border-border-strong bg-surface-2/60 hover:border-brand/60 hover:bg-brand-soft/50",
        )}
      >
        {uploading ? (
          <Spinner className="size-6 text-brand" />
        ) : (
          <span className="flex size-11 items-center justify-center rounded-xl bg-surface text-brand shadow-xs">
            <ImageUp className="size-5" aria-hidden />
          </span>
        )}
        <span className="text-sm font-medium text-fg">
          {uploading ? t.artUploading : art === null ? t.artDrop : t.artReplace}
        </span>
        <span className="text-xs text-fg-muted">{t.artFormats}</span>
      </button>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg"
        className="sr-only"
        aria-label={t.art}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file !== undefined) {
            onFile(file);
          }
          event.target.value = "";
        }}
      />
      <p className="text-xs text-fg-muted">{t.artHint(design.widthMm, design.heightMm)}</p>
      {art === null ? (
        <p className="flex items-center gap-2 text-sm text-fg-muted">
          <ImageIcon className="size-4" aria-hidden />
          {t.noArt}
        </p>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-mono text-fg tabular">
              {art.widthPx} × {art.heightPx} px
            </span>
            {dpi !== null && (
              <Badge tone={dpi < 300 ? "warning" : "success"} dot>
                {t.artDpi(dpi)}
              </Badge>
            )}
          </div>
          <Button variant="danger-ghost" size="sm" icon={<Trash2 />} onClick={onRemove}>
            {t.removeArt}
          </Button>
          {dpi !== null && dpi < 300 && <p className="w-full text-xs text-warning-fg">{t.artLowDpi}</p>}
          {art.moderation === "flagged" && <p className="w-full text-xs leading-relaxed text-warning-fg">{t.artUnderReview}</p>}
          {art.moderation === "rejected" && <p className="w-full text-xs leading-relaxed text-danger-fg">{t.artRejected}</p>}
        </div>
      )}
    </div>
  );
}
