import { CheckCircle2, WifiOff } from "lucide-react";

import { QrCode } from "@/components/qr";
import { cn } from "@/lib/cn";
import { texts } from "@/texts/pt-BR";

const m = texts.landing.mock;
// A sample text: the QR is decorative here (it is not a real ticket).
const SAMPLE_QR = "AMOSTRA-INGRESSO-IMPRESSO-0042";

/** A printed ticket, drawn in HTML: art, number, QR and the tear-off stub. */
export function TicketMock({ className }: { className?: string | undefined }) {
  return (
    <div
      className={cn(
        "relative flex w-[340px] max-w-full overflow-hidden rounded-[22px] bg-white text-[#0e0d14] shadow-lg ring-1 ring-black/5",
        className,
      )}
    >
      <div className="relative flex flex-1 flex-col justify-between gap-6 overflow-hidden p-5">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(120%_90%_at_0%_0%,#8b6cff_0%,#5b3df5_35%,#2a1584_100%)]"
        />
        <div aria-hidden className="absolute -right-10 -bottom-16 size-48 rounded-full bg-[#ffb224]/80 blur-2xl" />
        <div aria-hidden className="absolute inset-0 bg-dots opacity-30" />
        <div className="relative flex flex-col gap-1 text-white">
          <span className="text-[11px] font-semibold tracking-[0.2em] uppercase opacity-80">Ingresso</span>
          <span className="text-2xl leading-tight font-bold tracking-tight">{m.event}</span>
          <span className="text-xs opacity-80">{m.venue}</span>
        </div>
        <div className="relative flex items-end justify-between gap-3">
          <span className="font-mono text-2xl font-bold tracking-tight text-white">{m.number}</span>
          <QrCode text={SAMPLE_QR} size={84} label={m.number} className="rounded-lg bg-white p-0.5" />
        </div>
      </div>
      <div className="relative flex w-20 flex-col items-center justify-center gap-2 border-l-2 border-dashed border-black/15 bg-[#faf9ff] px-2">
        <span aria-hidden className="absolute -top-3 -left-3 size-6 rounded-full bg-bg" />
        <span aria-hidden className="absolute -bottom-3 -left-3 size-6 rounded-full bg-bg" />
        <span className="rotate-90 font-mono text-sm font-bold whitespace-nowrap text-[#5b3df5]">{m.number}</span>
      </div>
    </div>
  );
}

/** A phone at the door showing a green "PODE ENTRAR". */
export function PhoneMock({ className }: { className?: string | undefined }) {
  return (
    <div
      className={cn(
        "relative w-[210px] rounded-[38px] bg-[#0e0d14] p-2.5 shadow-lg ring-1 ring-white/10",
        className,
      )}
    >
      <div className="relative flex h-[400px] flex-col overflow-hidden rounded-[30px] bg-[#16a34a] text-white">
        <div aria-hidden className="absolute top-2 left-1/2 h-5 w-20 -translate-x-1/2 rounded-full bg-black" />
        <div className="flex items-center justify-between px-5 pt-10 text-[10px] font-medium opacity-90">
          <span className="flex items-center gap-1">
            <WifiOff className="size-3" aria-hidden />
            {m.synced}
          </span>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
          <CheckCircle2 className="size-16 animate-pop" strokeWidth={2.5} aria-hidden />
          <span className="text-2xl leading-tight font-black">{m.admit}</span>
          <span className="font-mono text-xl font-bold">{m.number}</span>
          <span className="text-xs opacity-90">{m.seller}</span>
        </div>
      </div>
    </div>
  );
}

/** A phone showing a digital ticket, as the buyer opens it from WhatsApp (ADR 0030). */
export function DigitalTicketMock({ className }: { className?: string | undefined }) {
  const d = texts.landing.digitalMock;
  return (
    <div className={cn("relative w-[230px] rounded-[38px] bg-[#0e0d14] p-2.5 shadow-lg ring-1 ring-white/10", className)}>
      <div className="relative flex h-[440px] flex-col overflow-hidden rounded-[30px] bg-[#f4f3f8] text-[#0e0d14]">
        <div aria-hidden className="absolute top-2 left-1/2 z-10 h-5 w-20 -translate-x-1/2 rounded-full bg-black" />
        <div className="m-3 mt-9 flex flex-1 flex-col overflow-hidden rounded-[20px] bg-white shadow-md ring-1 ring-black/5">
          <div className="flex flex-col gap-1 bg-[#5b3df5] px-4 pt-4 pb-5 text-white">
            <span className="text-[9px] font-semibold tracking-[0.16em] uppercase opacity-80">{d.organizer}</span>
            <span className="text-base leading-tight font-bold">{m.event}</span>
            <span className="text-[10px] opacity-85">{d.when}</span>
          </div>
          <div aria-hidden className="relative h-0 border-t-2 border-dashed border-black/10">
            <span className="absolute -top-2.5 -left-2.5 size-5 rounded-full bg-[#f4f3f8]" />
            <span className="absolute -top-2.5 -right-2.5 size-5 rounded-full bg-[#f4f3f8]" />
          </div>
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-3">
            <QrCode text={SAMPLE_QR} size={120} label={m.number} className="rounded-lg bg-white" />
            <span className="font-mono text-lg font-bold">{m.number}</span>
            <span className="text-[10px] text-[#5b5a6b]">{d.holder}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-[#e7f6ec] px-2 py-0.5 text-[10px] font-semibold text-[#0f7a37]">
              <CheckCircle2 className="size-3" aria-hidden />
              {d.valid}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
