"use client";

import type { ArtDto, DesignBody, DesignResponse, FontChoice, StubSide, TextAlign, TicketDesign } from "@ingressoimpresso/api-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { Button, Card, ErrorMessage, Field, Input, NumberInput, Select } from "@/components/ui";
import { api, fetchBlobUrl, upload } from "@/lib/api";
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
    return <p className="text-sm opacity-70">{texts.common.loading}</p>;
  }
  if (current.isError) {
    return <ErrorMessage error={current.error} />;
  }
  // Remount the editor when another version is loaded, so its state starts from the server data.
  return <DesignEditor key={current.data.version} eventId={eventId} initial={current.data} />;
}

function DesignEditor({ eventId, initial }: { eventId: string; initial: DesignResponse }) {
  const queryClient = useQueryClient();
  const [design, setDesign] = useState<TicketDesign>(initial.design);
  const [art, setArt] = useState<ArtDto | null>(initial.art);
  const [preview, setPreview] = useState<string | null>(null);
  const [savedVersion, setSavedVersion] = useState(initial.version);

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
    },
  });
  const save = useMutation({
    mutationFn: (payload: DesignBody) => api<DesignResponse>(`/api/events/${eventId}/design`, { method: "PUT", body: payload }),
    onSuccess: (saved) => {
      // Keep editing in place; the cache is refreshed for the next visit.
      setSavedVersion(saved.version);
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
  };
  const dpi = art === null ? null : artDpi(art, design);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm opacity-80">{t.intro}</p>
      <Card className="flex flex-col gap-3">
        <h2 className="font-semibold">{t.art}</h2>
        <p className="text-xs opacity-70">{t.artHint(design.widthMm, design.heightMm)}</p>
        <input
          type="file"
          accept="image/png,image/jpeg"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file !== undefined) {
              uploadArt.mutate(file);
            }
          }}
        />
        {art === null ? (
          <p className="text-sm opacity-70">{t.noArt}</p>
        ) : (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>
              {art.widthPx} × {art.heightPx} px
            </span>
            {dpi !== null && <span className={dpi < 300 ? "font-semibold text-amber-700" : ""}>{t.artDpi(dpi)}</span>}
            {dpi !== null && dpi < 300 && <span className="text-amber-700">{t.artLowDpi}</span>}
            <Button
              variant="danger"
              onClick={() => {
                setArt(null);
              }}
            >
              {t.removeArt}
            </Button>
          </div>
        )}
        <ErrorMessage error={uploadArt.error} />
      </Card>

      <Card className="grid gap-3 sm:grid-cols-3">
        <h2 className="font-semibold sm:col-span-3">{t.size}</h2>
        <Field label={t.width}>
          <NumberInput value={design.widthMm} onChange={(widthMm) => { update((d) => ({ ...d, widthMm })); }} />
        </Field>
        <Field label={t.height}>
          <NumberInput value={design.heightMm} onChange={(heightMm) => { update((d) => ({ ...d, heightMm })); }} />
        </Field>
        <Field label={t.background}>
          <Input type="color" value={design.backgroundColor} onChange={(e) => { update((d) => ({ ...d, backgroundColor: e.target.value })); }} />
        </Field>
      </Card>

      <Card className="grid gap-3 sm:grid-cols-4">
        <h2 className="font-semibold sm:col-span-4">{t.number}</h2>
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
        <Field label={t.font}>
          <Select value={design.number.font} onChange={(e) => { update((d) => ({ ...d, number: { ...d.number, font: e.target.value as FontChoice } })); }}>
            {(Object.keys(t.fonts) as FontChoice[]).map((font) => (
              <option key={font} value={font}>{t.fonts[font]}</option>
            ))}
          </Select>
        </Field>
        <Field label={t.fontSize}>
          <NumberInput value={design.number.sizePt} step={1} onChange={(sizePt) => { update((d) => ({ ...d, number: { ...d.number, sizePt } })); }} />
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
      </Card>

      <Card className="grid gap-3 sm:grid-cols-3">
        <h2 className="font-semibold sm:col-span-3">{t.qr}</h2>
        <Field label={t.x}>
          <NumberInput value={design.qr.xMm} onChange={(xMm) => { update((d) => ({ ...d, qr: { ...d.qr, xMm } })); }} />
        </Field>
        <Field label={t.y}>
          <NumberInput value={design.qr.yMm} onChange={(yMm) => { update((d) => ({ ...d, qr: { ...d.qr, yMm } })); }} />
        </Field>
        <Field label={t.qrSize}>
          <NumberInput value={design.qr.sizeMm} min={22} onChange={(sizeMm) => { update((d) => ({ ...d, qr: { ...d.qr, sizeMm } })); }} />
        </Field>
      </Card>

      <Card className="grid gap-3 sm:grid-cols-3">
        <h2 className="font-semibold sm:col-span-3">{t.stub}</h2>
        <label className="flex items-center gap-2 text-sm sm:col-span-3">
          <input
            type="checkbox"
            checked={design.stub !== null}
            onChange={(e) => {
              update((d) => ({ ...d, stub: e.target.checked ? { side: "left", widthMm: 40, fields: ["Nome", "Telefone"] } : null }));
            }}
          />
          {t.hasStub}
        </label>
        {design.stub !== null && (
          <>
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
              />
            </Field>
            <Field label={t.stubFields}>
              <textarea
                className="rounded-md border border-black/20 bg-white px-3 py-2 text-base text-ink dark:border-white/20 dark:bg-black/30 dark:text-paper"
                rows={3}
                value={design.stub.fields.join("\n")}
                onChange={(e) => {
                  const fields = e.target.value.split("\n").map((line) => line.trim()).filter((line) => line !== "");
                  update((d) => (d.stub === null ? d : { ...d, stub: { ...d.stub, fields } }));
                }}
              />
            </Field>
          </>
        )}
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          disabled={renderPreview.isPending}
          onClick={() => {
            renderPreview.mutate(body());
          }}
        >
          {renderPreview.isPending ? t.previewing : t.preview}
        </Button>
        <Button
          disabled={save.isPending}
          onClick={() => {
            save.mutate(body());
          }}
        >
          {save.isPending ? texts.common.saving : texts.common.save}
        </Button>
        <span className="text-sm opacity-70">{savedVersion === 0 ? t.unsaved : t.saved(savedVersion)}</span>
      </div>
      <ErrorMessage error={save.error ?? renderPreview.error} />
      {preview !== null && (
        // eslint-disable-next-line @next/next/no-img-element -- blob URL of a server-rendered preview
        <img src={preview} alt={t.preview} className="w-full max-w-xl rounded border border-black/10 bg-white shadow" />
      )}
    </div>
  );
}
