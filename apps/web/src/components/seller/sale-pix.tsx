"use client";

/**
 * The Pix of a sold number on the seller's page (ADR 0085): the "copia e cola" code and its QR
 * for the buyer in front of the seller, the same code by WhatsApp, and, when the money goes to
 * the seller's own key, "Recebi o Pix". Money paid to the organization is confirmed by it.
 */
import type { SellerPixBody, SellerViewDto } from "@ingressoimpresso/api-types";
import { CheckCircle2, Landmark, MessageCircle, RotateCcw, WifiOff } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { PixCharge } from "@/components/pix/pix-charge";
import { Button, buttonClass } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { money, shortDateTime } from "@/lib/format";
import { brCode, numberPrice, pixReference, type PixCharge as Charge } from "@/lib/pix";
import type { NumberCell } from "@/lib/seller-page";
import { whatsappLink } from "@/lib/settlement";
import { errors as errorsTexts } from "@/texts/pt-BR/errors";
import { pix as pixTexts } from "@/texts/pt-BR/pix";
import { sellerPage as sellerPageTexts } from "@/texts/pt-BR/seller-page";

const t = pixTexts;

/** What the buyer of `number` pays by Pix; `null` when the event does not charge by Pix or it is free. */
export function salePixCharge(view: SellerViewDto, number: number, label: string): Charge | null {
  if (view.pix === null) {
    return null;
  }
  const amountCents = numberPrice(view.categories, view.event.ticketPriceCents, number);
  if (amountCents === 0) {
    return null;
  }
  return {
    ...view.pix.account,
    amountCents,
    reference: pixReference(view.pix.eventId, number),
    description: t.describe(label, view.event.kind === "tokens"),
  };
}

export function SalePix({
  cell,
  view,
  token,
  label,
  ready,
  onSaved,
}: {
  cell: NumberCell;
  view: SellerViewDto;
  token: string;
  label: string;
  /** The sale reached the server and there is a connection: the receipt can be written. */
  ready: boolean;
  onSaved: (view: SellerViewDto) => void;
}) {
  const [busy, setBusy] = useState(false);
  const charge = useMemo(() => salePixCharge(view, cell.number, label), [view, cell.number, label]);
  const code = useMemo(() => (charge === null ? "" : brCode(charge)), [charge]);
  const sale = cell.sale;
  if (charge === null || view.pix === null || sale === null) {
    return null;
  }
  const own = view.pix.payee === "seller";
  const receipt = sale.pixReceipt;
  const amount = charge.amountCents === null ? t.amountOpen : money(charge.amountCents);

  const mark = async (paid: boolean) => {
    setBusy(true);
    try {
      const body: SellerPixBody = { token, number: cell.number, paid };
      onSaved(await api<SellerViewDto>("/api/seller/pix", { method: "POST", body }));
      toast.success(paid ? t.sellerConfirmed : t.sellerUndone);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.userMessage : errorsTexts.generic);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="sale-pix" className="mt-4 flex flex-col gap-4 rounded-2xl border border-border p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-soft-fg">
          <Landmark aria-hidden className="size-[18px]" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 id="sale-pix" className="text-sm font-semibold text-fg">
            {t.sellerTitle}
          </h3>
          <p className="text-xs leading-relaxed text-fg-muted">{own ? t.sellerHintSeller : t.sellerHintOrganization}</p>
        </div>
      </div>

      {receipt !== null ? (
        <div className="flex flex-col gap-3">
          <p role="status" className="flex items-start gap-2.5 rounded-xl bg-success-soft px-3 py-2.5 text-sm text-success-fg">
            <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span className="flex flex-col gap-0.5">
              <span className="font-semibold">
                {receipt.amountCents > 0
                  ? t.sellerReceived(money(receipt.amountCents), shortDateTime(receipt.confirmedAt))
                  : t.sellerReceivedOpen(shortDateTime(receipt.confirmedAt))}
              </span>
              <span className="text-xs leading-relaxed opacity-90">
                {receipt.receivedBy === "seller" ? t.sellerReceivedBySeller : t.sellerReceivedByOrganization}
              </span>
            </span>
          </p>
          {receipt.receivedBy === "seller" && own && (
            <Button
              variant="ghost"
              size="sm"
              icon={ready ? <RotateCcw /> : <WifiOff />}
              loading={busy}
              disabled={!ready}
              onClick={() => void mark(false)}
              className="w-fit self-center"
            >
              {ready ? t.sellerUndo : sellerPageTexts.offline.needsInternet}
            </Button>
          )}
        </div>
      ) : (
        <>
          <PixCharge charge={charge} inPerson />
          <a
            href={whatsappLink(sale.buyerPhone, t.pixMessage(sale.buyerName, view.event.name, label, amount, code))}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClass({
              variant: "secondary",
              className: "w-full",
            })}
          >
            <MessageCircle />
            {t.sendPix}
          </a>
          {own ? (
            <Button icon={ready ? <CheckCircle2 /> : <WifiOff />} loading={busy} disabled={!ready} onClick={() => void mark(true)} className="w-full">
              {ready ? t.sellerConfirm : sellerPageTexts.offline.needsInternet}
            </Button>
          ) : (
            <p className="text-xs leading-relaxed text-fg-subtle">{t.sellerWaitOrganization}</p>
          )}
        </>
      )}
    </section>
  );
}
