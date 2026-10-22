"use client";

import type { PublicCertificateDto } from "@ingressoimpresso/api-types";
import { useMutation } from "@tanstack/react-query";
import { Award, Download, Link2Off, RefreshCw, ShieldCheck, WifiOff } from "lucide-react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { Logo } from "@/components/brand";
import { Badge, Button, Card, Spinner, errorMessage } from "@/components/ui";
import { ApiError, api, fetchBlobUrl } from "@/lib/api";
import { certificate as certificateTexts } from "@/texts/pt-BR/certificate";
import { common as commonTexts } from "@/texts/pt-BR/common";

const t = certificateTexts;

/**
 * A certificate's private link (ADR 0113): the token stays in the fragment (never in the server's
 * logs) and in the request body. The QR printed on the PDF opens this same page, so whoever
 * receives the certificate can confirm it.
 */
export function CertificatePage() {
  const token = useRef("");
  const view = useMutation({
    mutationFn: () => api<PublicCertificateDto>("/api/certificates/view", { method: "POST", body: { token: token.current } }),
  });
  const download = useMutation({
    mutationFn: () => fetchBlobUrl("/api/certificates/pdf", { token: token.current }),
    onSuccess: (url) => {
      const link = document.createElement("a");
      link.href = url;
      link.download = t.file(view.data?.code ?? "");
      link.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 60_000);
    },
    onError: () => {
      toast.error(t.downloadFailed);
    },
  });
  const { mutate } = view;

  useEffect(() => {
    if (token.current === "") {
      token.current = window.location.hash.slice(1).trim();
    }
    mutate();
  }, [mutate]);

  const data = view.data;
  // Only a token the server does not know is an invalid link: a network failure or maintenance
  // must never read as "this certificate is not real" to whoever is checking it.
  const invalid = view.isError && view.error instanceof ApiError && (view.error.status === 404 || view.error.status === 400);
  return (
    <div className="flex w-full max-w-lg flex-col items-center gap-6">
      <Logo />
      <Card className="flex w-full flex-col gap-5">
        {invalid ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-danger-soft text-danger-fg">
              <Link2Off className="size-6" aria-hidden />
            </span>
            <h1 className="text-xl font-semibold text-fg">{t.invalidTitle}</h1>
            <p className="text-sm text-fg-muted">{t.invalidBody}</p>
          </div>
        ) : view.isError ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-warning-soft text-warning-fg">
              <WifiOff className="size-6" aria-hidden />
            </span>
            <h1 className="text-xl font-semibold text-fg">{t.unavailableTitle}</h1>
            <p className="text-sm text-fg-muted">{errorMessage(view.error)}</p>
            <Button
              variant="secondary"
              icon={<RefreshCw />}
              onClick={() => {
                view.mutate();
              }}
            >
              {commonTexts.retry}
            </Button>
          </div>
        ) : data === undefined ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-fg-muted" role="status">
            <Spinner />
            {t.loading}
          </div>
        ) : (
          <>
            <div className="flex flex-col items-center gap-3 text-center">
              <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-soft text-brand-soft-fg">
                <Award className="size-7" aria-hidden />
              </span>
              <Badge tone="success" dot>
                <ShieldCheck className="size-3.5" aria-hidden />
                {t.validBadge}
              </Badge>
              <p className="text-sm font-medium text-fg-muted">{data.title}</p>
              <div className="flex flex-col gap-1">
                <span className="text-xs tracking-wide text-fg-subtle uppercase">{t.awardedTo}</span>
                <h1 className="text-2xl font-bold tracking-tight text-fg">{data.name}</h1>
              </div>
            </div>
            <dl className="grid gap-3 rounded-2xl bg-surface-2 p-4 text-sm sm:grid-cols-2">
              {(
                [
                  [t.event, data.event],
                  [t.when, data.date],
                  [t.where, data.venue],
                  [t.organizer, data.organization],
                  [t.workload, data.workload],
                  [t.code, data.code],
                ] satisfies [string, string | null][]
              )
                .flatMap(([label, value]) => (value === null || value === "" ? [] : [[label, value] as const]))
                .map(([label, value]) => (
                  <div key={label} className="flex flex-col gap-0.5">
                    <dt className="text-xs text-fg-subtle">{label}</dt>
                    <dd className="font-medium text-fg">{value}</dd>
                  </div>
                ))}
            </dl>
            <Button
              icon={<Download />}
              loading={download.isPending}
              onClick={() => {
                download.mutate();
              }}
            >
              {download.isPending ? t.downloading : t.download}
            </Button>
            <p className="text-center text-xs text-fg-subtle">{t.validHint}</p>
          </>
        )}
      </Card>
    </div>
  );
}
