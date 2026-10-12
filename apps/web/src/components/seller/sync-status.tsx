"use client";

/**
 * Where the seller's changes stand (ADR 0074): "Sem internet · 3 alterações para enviar", the
 * sending, and the explanation of what could not be done.
 */
import type { SellerViewDto } from "@ingressoimpresso/api-types";
import { AlertTriangle, CloudUpload, Copy, Info, WifiOff } from "lucide-react";

import { Button, Dialog, Spinner } from "@/components/ui";
import { cn } from "@/lib/cn";
import { shortDateTime } from "@/lib/format";
import { opLabel, type QueuedOp, type SyncNotice } from "@/lib/seller-offline";
import { copyText } from "@/lib/share";
import { texts } from "@/texts/pt-BR";
import { toast } from "sonner";

import type { SendProblem } from "./use-seller-sync";

const t = texts.sellerPage.offline;

/** The bar under the header while something is not sent (or there is no connection). */
export function SyncStatus({
  online,
  syncing,
  pending,
  savedAt,
  problem,
  onRetry,
}: {
  online: boolean;
  syncing: boolean;
  pending: number;
  savedAt: string | null;
  problem: SendProblem;
  onRetry: () => void;
}) {
  if (online && pending === 0 && problem === null) {
    return null;
  }
  const offline = !online;
  const sending = online && syncing && pending > 0;
  let line: string;
  if (offline) {
    line = pending > 0 ? `${t.title} · ${t.pending(pending)}` : `${t.title} · ${savedAt === null ? "" : t.savedAt(shortDateTime(savedAt))}`;
  } else if (sending) {
    line = t.sending(pending);
  } else {
    line = t.waiting(pending);
  }
  const explain = offline ? (pending > 0 ? t.explain : null) : problem === "maintenance" ? t.maintenance : problem === "failed" ? t.failed : null;
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "sticky top-[max(0.5rem,env(safe-area-inset-top))] z-20 flex flex-col gap-1.5 rounded-2xl border px-4 py-3 shadow-md animate-fade-in",
        offline || problem !== null ? "border-warning/40 bg-warning-soft text-warning-fg" : "border-brand/30 bg-brand-soft text-brand-soft-fg",
      )}
    >
      <div className="flex items-center gap-2.5">
        {sending ? (
          <Spinner className="size-4 shrink-0" />
        ) : offline ? (
          <WifiOff aria-hidden className="size-4 shrink-0" />
        ) : problem !== null ? (
          <AlertTriangle aria-hidden className="size-4 shrink-0" />
        ) : (
          <CloudUpload aria-hidden className="size-4 shrink-0" />
        )}
        <span className="min-w-0 flex-1 text-sm font-semibold">{line}</span>
        {online && !syncing && pending > 0 && (
          <Button size="sm" variant="secondary" onClick={onRetry} className="shrink-0">
            {t.sendNow}
          </Button>
        )}
      </div>
      {explain !== null && <p className="text-xs leading-relaxed opacity-90">{explain}</p>}
    </div>
  );
}

/** What the server could not do, in plain words; stays until the seller says they read it. */
export function NoticesDialog({ notices, onClose }: { notices: readonly SyncNotice[]; onClose: () => void }) {
  const c = texts.sellerPage.conflicts;
  return (
    <Dialog
      open={notices.length > 0}
      onClose={onClose}
      title={c.title}
      description={c.description}
      footer={<Button onClick={onClose}>{c.ok}</Button>}
    >
      <ul className="flex flex-col gap-2.5">
        {notices.map((notice) => (
          <li key={notice.id} className="flex gap-3 rounded-2xl border border-warning/30 bg-warning-soft/50 p-3.5">
            <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-warning-fg" />
            <span className="flex min-w-0 flex-col gap-1">
              <span className="text-sm font-semibold text-fg">{notice.title}</span>
              {notice.lines.map((line) => (
                <span key={line} className="text-sm leading-relaxed text-fg-muted">
                  {line}
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

/** Changes made offline on a link that stopped working: the seller sends the list to the organizer. */
export function PendingList({ queue, view }: { queue: readonly QueuedOp[]; view: SellerViewDto | null }) {
  if (queue.length === 0) {
    return null;
  }
  const digits = view?.numberDigits ?? 4;
  const lines = queue.map((item) => opLabel(item.op, digits, view?.reservations ?? []));
  return (
    <div className="flex w-full flex-col gap-3 rounded-2xl border border-warning/40 bg-warning-soft p-4 text-left">
      <p className="text-sm font-semibold text-warning-fg">{t.pendingTitle}</p>
      <p className="text-sm leading-relaxed text-fg-muted">{t.pendingBody}</p>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-fg">
        {lines.map((line, index) => (
          <li key={queue[index]?.id ?? line}>{line}</li>
        ))}
      </ul>
      <Button
        variant="secondary"
        size="sm"
        icon={<Copy />}
        className="self-start"
        onClick={() => {
          void copyText(lines.join("\n")).then((ok) => {
            if (ok) {
              toast.success(texts.common.copied);
            }
          });
        }}
      >
        {texts.common.copy}
      </Button>
    </div>
  );
}
