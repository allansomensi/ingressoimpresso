"use client";

import type { CertificateSettingsBody } from "@ingressoimpresso/api-types";
import { useMutation } from "@tanstack/react-query";
import { Download, FileText, RefreshCw, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button, Dialog, Spinner, errorMessage } from "@/components/ui";
import { fetchBlob, fetchBlobUrl } from "@/lib/api";
import { cn } from "@/lib/cn";
import { sampleFileName, sampleMockup } from "@/lib/sample-image";
import { certificateEditor as texts } from "@/texts/pt-BR/certificate-editor";

const t = texts.preview;

type Side = "front" | "back";
type Picture = { url: string; blob: Blob };

/** Saves a blob URL as a file. */
function download(url: string, name: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
}

/**
 * "Ver como fica" of the certificate (ADR 0118): the server's SAMPLE picture of the design being
 * edited (a sample name, a faint "AMOSTRA"), laid on a table like the ticket's sample, to download
 * or share; the PDF of the same sample is one tap away.
 */
export function CertificatePreview({
  open,
  onClose,
  eventId,
  eventName,
  body,
  hasBack,
}: {
  open: boolean;
  onClose: () => void;
  eventId: string;
  eventName: string;
  /** The draft as it is now: read when the dialog opens and on "Gerar de novo". */
  body: () => CertificateSettingsBody;
  hasBack: boolean;
}) {
  const [side, setSide] = useState<Side>("front");
  const [pictures, setPictures] = useState<Partial<Record<Side, Picture>>>({});
  const render = useMutation({
    mutationFn: async (which: Side) => {
      const raw = await fetchBlob(`/api/events/${eventId}/certificates/sample-image${which === "back" ? "?back=true" : ""}`, body());
      const blob = await sampleMockup(raw);
      return { which, picture: { blob, url: URL.createObjectURL(blob) } };
    },
    onSuccess: ({ which, picture }) => {
      setPictures((current) => {
        const old = current[which];
        if (old !== undefined) {
          URL.revokeObjectURL(old.url);
        }
        return { ...current, [which]: picture };
      });
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
  const pdf = useMutation({
    mutationFn: () => fetchBlobUrl(`/api/events/${eventId}/certificates/sample`, body()),
    onSuccess: (url) => {
      download(url, texts.sampleFile);
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 10_000);
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });

  // A fresh picture each time the dialog opens: the design may have changed since.
  const { mutate } = render;
  useEffect(() => {
    if (open) {
      mutate("front");
    }
  }, [open, mutate]);
  useEffect(
    () => () => {
      for (const picture of Object.values(pictures)) {
        URL.revokeObjectURL(picture.url);
      }
    },
    // Only on unmount: replaced pictures are revoked as they are replaced.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const shown = side === "back" && !hasBack ? "front" : side;
  const picture = pictures[shown];
  const name = sampleFileName(`certificado ${eventName}${shown === "back" ? " verso" : ""}`);
  const file = picture === undefined ? null : new File([picture.blob], name, { type: "image/png" });
  const canShare = file !== null && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
  const busy = render.isPending;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t.title}
      description={t.description}
      size="lg"
      footer={
        <>
          <Button variant="ghost" icon={<FileText />} loading={pdf.isPending} onClick={() => pdf.mutate()}>
            {t.pdf}
          </Button>
          <Button
            variant="ghost"
            icon={<RefreshCw />}
            loading={busy}
            onClick={() => {
              render.mutate(shown);
            }}
          >
            {t.again}
          </Button>
          {canShare && (
            <Button
              variant="secondary"
              icon={<Share2 />}
              onClick={() => {
                if (file !== null) {
                  void navigator.share({ files: [file], title: eventName }).catch(() => undefined);
                }
              }}
            >
              {t.share}
            </Button>
          )}
          <Button
            icon={<Download />}
            disabled={picture === undefined || busy}
            onClick={() => {
              if (picture !== undefined) {
                download(picture.url, name);
              }
            }}
          >
            {t.download}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {hasBack && (
          <div role="radiogroup" aria-label={t.title} className="inline-flex self-start rounded-xl bg-surface-2 p-1">
            {(["front", "back"] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={shown === option}
                onClick={() => {
                  setSide(option);
                  if (pictures[option] === undefined) {
                    render.mutate(option);
                  }
                }}
                className={cn(
                  "rounded-lg px-3.5 py-1.5 text-sm font-medium transition pointer-coarse:py-2.5",
                  shown === option ? "bg-surface text-fg shadow-sm" : "text-fg-muted hover:text-fg active:text-fg",
                )}
              >
                {texts.sides[option]}
              </button>
            ))}
          </div>
        )}
        <div className="relative flex min-h-56 items-center justify-center overflow-hidden rounded-xl border border-border bg-surface-2">
          {picture !== undefined && (
            // eslint-disable-next-line @next/next/no-img-element -- blob URL of a picture drawn here
            <img src={picture.url} alt={t.alt} className={cn("h-auto max-h-[60vh] w-auto max-w-full rounded-lg transition-opacity", busy && "opacity-40")} />
          )}
          {busy && (
            <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-fg-muted">
              <Spinner />
              {t.loading}
            </span>
          )}
        </div>
      </div>
    </Dialog>
  );
}
