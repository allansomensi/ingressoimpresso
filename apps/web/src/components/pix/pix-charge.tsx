"use client";

import { Check, ChevronDown, Copy, QrCode as QrCodeIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { QrCode } from "@/components/qr";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import { brCode, pixTxid, type PixCharge as Charge } from "@/lib/pix";
import { copyText } from "@/lib/share";
import { pix as pixTexts } from "@/texts/pt-BR/pix";

const t = pixTexts;

/**
 * A Pix charge (ADR 0085): the amount, who receives, the "copia e cola" code with a copy button and
 * its QR code. Built on the device, so it works offline. `inPerson`: the buyer in front of the
 * seller reads the QR from this screen, so it comes first and the code to copy follows; on the
 * buyer's own phone the code to copy comes first and the QR stays one tap away.
 */
export function PixCharge({ charge, inPerson = false, className }: { charge: Charge; inPerson?: boolean; className?: string }) {
  const code = useMemo(() => brCode(charge), [charge]);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (await copyText(code)) {
      setCopied(true);
      toast.success(t.copied);
    } else {
      toast.error(t.copyFailed);
    }
  };

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="text-xs font-medium tracking-wide text-fg-subtle uppercase">{t.amount}</span>
          <span className="text-2xl font-bold tracking-tight text-fg tabular">
            {charge.amountCents === null || charge.amountCents <= 0 ? t.amountOpen : money(charge.amountCents)}
          </span>
        </div>
        <span className="shrink-0 rounded-lg bg-surface-2 px-2 py-1 font-mono text-[11px] font-medium text-fg-muted">
          {t.reference(pixTxid(charge.reference))}
        </span>
      </div>
      <p className="text-sm text-fg-muted">{t.to(charge.name, charge.city)}</p>
      {inPerson && <PixQr code={code} />}

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-fg-muted">{t.code}</span>
        <button
          type="button"
          onClick={() => void copy()}
          className="max-h-20 overflow-hidden rounded-xl border border-border bg-surface-2 px-3 py-2 text-left font-mono text-xs leading-relaxed break-all text-fg-muted transition select-all hover:border-border-strong active:bg-surface-3"
          aria-label={t.copy}
        >
          {code}
        </button>
        <Button variant={inPerson ? "secondary" : "primary"} icon={copied ? <Check /> : <Copy />} onClick={() => void copy()} className="w-full">
          {t.copy}
        </Button>
      </div>

      {!inPerson && (
        <>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => {
              setOpen(!open);
            }}
            className="relative flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-medium text-fg-muted transition hover:bg-surface-2 hover:text-fg active:bg-surface-2"
          >
            <QrCodeIcon className="size-4" aria-hidden />
            {open ? t.hideQr : t.showQr}
            <ChevronDown className={cn("size-4 transition", open && "rotate-180")} aria-hidden />
          </button>
          {open && <PixQr code={code} className="animate-fade-in" />}
        </>
      )}
    </div>
  );
}

/** The charge's QR code, on a white card so any camera reads it in either theme. */
function PixQr({ code, className }: { code: string; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <div className="w-full max-w-[15rem] rounded-2xl bg-white p-2 ring-1 ring-black/10">
        <QrCode text={code} size={480} label={t.qrLabel} className="h-auto w-full bg-white" />
      </div>
      <p className="max-w-xs text-center text-xs leading-relaxed text-fg-muted">{t.scanHint}</p>
    </div>
  );
}
