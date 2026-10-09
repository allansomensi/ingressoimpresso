"use client";

import type { ArtDto, DesignBody, DesignResponse, FontChoice, StubSide, TextAlign, TicketDesign } from "@ingressoimpresso/api-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Hash, ImageIcon, ImageUp, QrCode, Ruler, Save, Scissors, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { toast } from "sonner";

import {
  Badge,
  Button,
  Card,
  CardHeader,
  ErrorMessage,
  Field,
  Input,
  Lead,
  LoadingBlock,
  NumberInput,
  Select,
  Spinner,
  Switch,
  Textarea,
} from "@/components/ui";
import { api, fetchBlobUrl, upload } from "@/lib/api";
import { cn } from "@/lib/cn";
import { texts } from "@/texts/pt-BR";

const t = texts.event.design;
const BLEED_MM = 3;
const MM_PER_INCH = 25.4;

/** Effective resolution of the art at final size (it covers the body plus bleed). */
function artDpi(art: ArtDto, design: TicketDesign): number {
  const widthIn = (design.widthMm + 2 * BLEED_MM) / MM_PER_INCH;
  const heightIn = (design.heightMm + 2 * BLEED_MM) / MM_PER_INCH;
  return Math.round(Math.min(art.widthPx / widthIn, art.heightPx / heightIn));
}

export function DesignTab({ eventId }: { eventId: string }) {
  const current = useQuery({
    queryKey: ["design", eventId],
    queryFn: () => api<DesignResponse>(`/api/events/${eventId}/design`),
  });
  if (current.isPending) {
    return <LoadingBlock rows={4} />;
  }
  if (current.isError) {
    return <ErrorMessage error={current.error} />;
  }
  // Remount the editor when another version is loaded, so its state starts from the server data.
  return <DesignEditor key={current.data.version} eventId={eventId} initial={current.data} />;
}

function Section({ icon, title, description, children }: { icon: typeof Ruler; title: string; description?: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader icon={icon} title={title} {...(description === undefined ? {} : { description })} />
      {children}
    </Card>
  );
}

function ArtPicker({
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
        </div>
      )}
    </div>
  );
}

function DesignEditor({ eventId, initial }: { eventId: string; initial: DesignResponse }) {
  const queryClient = useQueryClient();
  const [design, setDesign] = useState<TicketDesign>(initial.design);
  const [art, setArt] = useState<ArtDto | null>(initial.art);
  const [preview, setPreview] = useState<string | null>(null);
  const [savedVersion, setSavedVersion] = useState(initial.version);
  const [dirty, setDirty] = useState(false);

  useEffect(
    () => () => {
      if (preview !== null) {
        URL.revokeObjectURL(preview);
      }
    },
    [preview],
  );

  const body = (): DesignBody => ({ design, artId: art?.id ?? null });

  const uploadArt = useMutation({
    mutationFn: (file: File) => upload<ArtDto>(`/api/events/${eventId}/art`, file),
    onSuccess: (uploaded) => {
      setArt(uploaded);
      setDirty(true);
    },
  });
  const save = useMutation({
    mutationFn: (payload: DesignBody) => api<DesignResponse>(`/api/events/${eventId}/design`, { method: "PUT", body: payload }),
    onSuccess: (saved) => {
      // Keep editing in place; the cache is refreshed for the next visit.
      setSavedVersion(saved.version);
      setDirty(false);
      toast.success(t.savedToast(saved.version));
      void queryClient.invalidateQueries({ queryKey: ["design", eventId], refetchType: "none" });
    },
  });
  const renderPreview = useMutation({
    mutationFn: (payload: DesignBody) => fetchBlobUrl(`/api/events/${eventId}/design/preview`, payload),
    onSuccess: (url) => {
      setPreview(url);
    },
  });

  const update = (change: (draft: TicketDesign) => TicketDesign) => {
    setDesign(change(design));
    setDirty(true);
  };
  const status =
    dirty ? (
      <Badge tone="warning" dot>
        {t.dirty}
      </Badge>
    ) : savedVersion === 0 ? (
      <Badge tone="neutral" dot>
        {t.unsaved}
      </Badge>
    ) : (
      <Badge tone="success" dot>
        {t.saved(savedVersion)}
      </Badge>
    );

  return (
    <div className="flex flex-col gap-6">
      <Lead>{t.intro}</Lead>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <div className="flex flex-col gap-6">
          <Section icon={ImageUp} title={t.art}>
            <ArtPicker
              art={art}
              design={design}
              uploading={uploadArt.isPending}
              onFile={(file) => {
                uploadArt.mutate(file);
              }}
              onRemove={() => {
                setArt(null);
                setDirty(true);
              }}
            />
            <ErrorMessage error={uploadArt.error} className="mt-3" />
          </Section>

          <Section icon={Ruler} title={t.size} description={t.sizeHint}>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t.width}>
                <NumberInput value={design.widthMm} onChange={(widthMm) => { update((d) => ({ ...d, widthMm })); }} suffix="mm" />
              </Field>
              <Field label={t.height}>
                <NumberInput value={design.heightMm} onChange={(heightMm) => { update((d) => ({ ...d, heightMm })); }} suffix="mm" />
              </Field>
              <Field label={t.background}>
                <Input type="color" value={design.backgroundColor} onChange={(e) => { update((d) => ({ ...d, backgroundColor: e.target.value })); }} />
              </Field>
            </div>
          </Section>

          <Section icon={Hash} title={t.number} description={t.numberHint}>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Field label={t.x}>
                <NumberInput value={design.number.xMm} onChange={(xMm) => { update((d) => ({ ...d, number: { ...d.number, xMm } })); }} />
              </Field>
              <Field label={t.y}>
                <NumberInput value={design.number.yMm} onChange={(yMm) => { update((d) => ({ ...d, number: { ...d.number, yMm } })); }} />
              </Field>
              <Field label={t.boxWidth}>
                <NumberInput value={design.number.widthMm} onChange={(widthMm) => { update((d) => ({ ...d, number: { ...d.number, widthMm } })); }} />
              </Field>
              <Field label={t.boxHeight}>
                <NumberInput value={design.number.heightMm} onChange={(heightMm) => { update((d) => ({ ...d, number: { ...d.number, heightMm } })); }} />
              </Field>
              <Field label={t.font} className="sm:col-span-2">
                <Select value={design.number.font} onChange={(e) => { update((d) => ({ ...d, number: { ...d.number, font: e.target.value as FontChoice } })); }}>
                  {(Object.keys(t.fonts) as FontChoice[]).map((font) => (
                    <option key={font} value={font}>{t.fonts[font]}</option>
                  ))}
                </Select>
              </Field>
              <Field label={t.fontSize}>
                <NumberInput value={design.number.sizePt} step={1} onChange={(sizePt) => { update((d) => ({ ...d, number: { ...d.number, sizePt } })); }} suffix="pt" />
              </Field>
              <Field label={t.color}>
                <Input type="color" value={design.number.color} onChange={(e) => { update((d) => ({ ...d, number: { ...d.number, color: e.target.value } })); }} />
              </Field>
              <Field label={t.align}>
                <Select value={design.number.align} onChange={(e) => { update((d) => ({ ...d, number: { ...d.number, align: e.target.value as TextAlign } })); }}>
                  {(Object.keys(t.aligns) as TextAlign[]).map((align) => (
                    <option key={align} value={align}>{t.aligns[align]}</option>
                  ))}
                </Select>
              </Field>
              <Field label={t.prefix}>
                <Input value={design.number.prefix} maxLength={12} onChange={(e) => { update((d) => ({ ...d, number: { ...d.number, prefix: e.target.value } })); }} />
              </Field>
              <Field label={t.digits}>
                <NumberInput value={design.number.digits} step={1} min={1} onChange={(digits) => { update((d) => ({ ...d, number: { ...d.number, digits } })); }} />
              </Field>
            </div>
          </Section>

          <Section icon={QrCode} title={t.qr} description={t.qrHint}>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t.x}>
                <NumberInput value={design.qr.xMm} onChange={(xMm) => { update((d) => ({ ...d, qr: { ...d.qr, xMm } })); }} />
              </Field>
              <Field label={t.y}>
                <NumberInput value={design.qr.yMm} onChange={(yMm) => { update((d) => ({ ...d, qr: { ...d.qr, yMm } })); }} />
              </Field>
              <Field label={t.qrSize}>
                <NumberInput value={design.qr.sizeMm} min={22} onChange={(sizeMm) => { update((d) => ({ ...d, qr: { ...d.qr, sizeMm } })); }} suffix="mm" />
              </Field>
            </div>
          </Section>

          <Section icon={Scissors} title={t.stub} description={t.stubHint}>
            <div className="flex flex-col gap-4">
              <Switch
                label={t.hasStub}
                checked={design.stub !== null}
                onChange={(checked) => {
                  update((d) => ({ ...d, stub: checked ? { side: "left", widthMm: 40, fields: ["Nome", "Telefone"] } : null }));
                }}
              />
              {design.stub !== null && (
                <div className="grid gap-4 sm:grid-cols-2 animate-fade-in">
                  <Field label={t.stubSide}>
                    <Select
                      value={design.stub.side}
                      onChange={(e) => {
                        update((d) => (d.stub === null ? d : { ...d, stub: { ...d.stub, side: e.target.value as StubSide } }));
                      }}
                    >
                      {(Object.keys(t.sides) as StubSide[]).map((side) => (
                        <option key={side} value={side}>{t.sides[side]}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={t.stubWidth}>
                    <NumberInput
                      value={design.stub.widthMm}
                      onChange={(widthMm) => {
                        update((d) => (d.stub === null ? d : { ...d, stub: { ...d.stub, widthMm } }));
                      }}
                      suffix="mm"
                    />
                  </Field>
                  <Field label={t.stubFields} hint={t.stubFieldsHint} className="sm:col-span-2">
                    <Textarea
                      rows={3}
                      value={design.stub.fields.join("\n")}
                      onChange={(e) => {
                        const fields = e.target.value.split("\n").map((line) => line.trim()).filter((line) => line !== "");
                        update((d) => (d.stub === null ? d : { ...d, stub: { ...d.stub, fields } }));
                      }}
                    />
                  </Field>
                </div>
              )}
            </div>
          </Section>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-36">
          <Card>
            <CardHeader icon={Eye} title={t.previewTitle} actions={status} />
            <div className="relative flex aspect-[210/297] items-center justify-center overflow-hidden rounded-xl border border-border bg-surface-2">
              {preview === null ? (
                <p className="max-w-56 px-4 text-center text-sm text-fg-muted">{t.previewEmpty}</p>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- blob URL of a server-rendered preview
                <img src={preview} alt={t.previewAlt} className="size-full bg-white object-contain" />
              )}
              {renderPreview.isPending && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface/80 text-sm font-medium text-fg-muted backdrop-blur-sm">
                  <Spinner className="size-6 text-brand" />
                  {t.previewing}
                </div>
              )}
            </div>
            <ErrorMessage error={save.error ?? renderPreview.error} className="mt-4" />
            {savedVersion === 0 && !dirty && <p className="mt-3 text-xs text-fg-muted">{t.unsavedHint}</p>}
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <Button
                variant="secondary"
                icon={<Eye />}
                loading={renderPreview.isPending}
                onClick={() => {
                  renderPreview.mutate(body());
                }}
              >
                {t.preview}
              </Button>
              <Button
                icon={<Save />}
                loading={save.isPending}
                onClick={() => {
                  save.mutate(body());
                }}
              >
                {save.isPending ? texts.common.saving : texts.common.save}
              </Button>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
