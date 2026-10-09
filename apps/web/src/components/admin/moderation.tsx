"use client";

import type { ModerationFlagDto, ModerationResolveBody, ModerationSummaryDto, RecentArtDto } from "@ingressoimpresso/api-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Eye, EyeOff, Flag, ImageOff, ScanSearch, ShieldAlert, ShieldCheck, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  Alert,
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  ErrorMessage,
  Field,
  Lead,
  LoadingBlock,
  Spinner,
  Switch,
  Textarea,
  errorMessage,
  type Tone,
} from "@/components/ui";
import { api, fetchBlobUrl } from "@/lib/api";
import { cn } from "@/lib/cn";
import { shortDateTime } from "@/lib/format";
import { texts } from "@/texts/pt-BR";

const t = texts.admin.moderation;
type View = "open" | "approved" | "rejected" | "recent";
const VIEWS: readonly View[] = ["open", "recent", "approved", "rejected"];
const ART_TONE: Readonly<Record<string, Tone>> = {
  unchecked: "neutral",
  clean: "success",
  flagged: "warning",
  approved: "success",
  rejected: "danger",
};

function reasonLabel(reason: string): string {
  const labels: Readonly<Record<string, string>> = t.reasons;
  return labels[reason] ?? reason;
}

function artLabel(status: string): string {
  const labels: Readonly<Record<string, string>> = t.artStates;
  return labels[status] ?? status;
}

/** The image, fetched with the admin's session and blurred until asked. */
function Thumb({ artId, revealed, onToggle }: { artId: string; revealed: boolean; onToggle: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let current: string | null = null;
    let cancelled = false;
    fetchBlobUrl(`/api/admin/moderation/arts/${artId}`)
      .then((objectUrl) => {
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        current = objectUrl;
        setUrl(objectUrl);
      })
      .catch(() => {
        setFailed(true);
      });
    return () => {
      cancelled = true;
      if (current !== null) {
        URL.revokeObjectURL(current);
      }
    };
  }, [artId]);
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={revealed ? t.hide : t.reveal}
      className="group relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-xl bg-surface-3"
    >
      {failed ? (
        <ImageOff className="size-6 text-fg-subtle" aria-hidden />
      ) : url === null ? (
        <Spinner />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- a blob URL of a private image
        <img src={url} alt="" className={cn("size-full object-contain transition", !revealed && "scale-110 blur-2xl")} />
      )}
      <span className="absolute right-2 bottom-2 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur">
        {revealed ? <EyeOff className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
        {revealed ? t.hide : t.reveal}
      </span>
    </button>
  );
}

function ResolveDialog({ flag, action, onClose }: { flag: ModerationFlagDto; action: "approve" | "reject"; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [notify, setNotify] = useState(true);
  const [suspend, setSuspend] = useState(false);
  const resolve = useMutation({
    mutationFn: () => {
      const body: ModerationResolveBody = { action, note: note.trim() === "" ? null : note.trim(), notify, suspend };
      return api<ModerationFlagDto>(`/api/admin/moderation/${flag.id}/resolve`, { method: "POST", body });
    },
    onSuccess: () => {
      toast.success(action === "approve" ? t.approved : t.rejected);
      void queryClient.invalidateQueries({ queryKey: ["admin", "moderation"] });
      onClose();
    },
  });
  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={action === "approve" ? t.approveTitle : t.rejectTitle}
      description={action === "approve" ? t.approveBody : t.rejectBody}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {texts.common.cancel}
          </Button>
          <Button variant={action === "reject" ? "danger" : "primary"} loading={resolve.isPending} onClick={() => resolve.mutate()}>
            {action === "approve" ? t.approve : t.reject}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t.note} hint={action === "reject" ? t.noteRejectHint : t.noteHint} optional>
          <Textarea
            value={note}
            maxLength={500}
            rows={3}
            onChange={(event) => {
              setNote(event.target.value);
            }}
          />
        </Field>
        <Switch checked={notify} onChange={setNotify} label={t.notify} description={t.notifyHint} />
        {action === "reject" && <Switch checked={suspend} onChange={setSuspend} label={t.suspend} description={t.suspendHint} />}
        <ErrorMessage error={resolve.error} />
      </div>
    </Dialog>
  );
}

function FlagCard({ flag }: { flag: ModerationFlagDto }) {
  const [revealed, setRevealed] = useState(false);
  const [resolving, setResolving] = useState<"approve" | "reject" | null>(null);
  const score = Math.round(flag.score * 100);
  return (
    <Card padded={false} className="flex flex-col overflow-hidden">
      <div className="p-3">
        <Thumb
          artId={flag.artId}
          revealed={revealed}
          onToggle={() => {
            setRevealed(!revealed);
          }}
        />
      </div>
      <div className="flex flex-1 flex-col gap-3 px-4 pb-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {flag.reasons.map((reason) => (
            <Badge key={reason} tone={reason === "manual" ? "brand" : "danger"}>
              {reasonLabel(reason)}
            </Badge>
          ))}
          <Badge tone="neutral">{flag.source === "automatic" ? t.automatic : t.manual}</Badge>
        </div>
        {flag.source === "automatic" && (
          <div className="flex items-center gap-2 text-xs text-fg-muted">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
              <div
                className={cn("h-full rounded-full", score >= 80 ? "bg-danger" : score >= 50 ? "bg-warning" : "bg-brand")}
                style={{ width: `${String(score)}%` }}
              />
            </div>
            <span className="tabular">{t.score(score)}</span>
          </div>
        )}
        <div className="flex flex-col gap-0.5 text-sm">
          <Link href={`/painel/admin/organizacoes/${flag.organizationId}`} className="font-semibold text-fg hover:underline">
            {flag.organizationName}
          </Link>
          <Link href={`/painel/eventos/${flag.eventId}?aba=ingresso`} className="text-fg-muted hover:underline">
            {flag.eventName}
          </Link>
          <span className="text-xs text-fg-subtle">
            {[flag.uploadedBy, shortDateTime(flag.createdAt), `${String(flag.widthPx)}×${String(flag.heightPx)}`].filter(Boolean).join(" · ")}
          </span>
        </div>
        {flag.status === "open" ? (
          <div className="mt-auto grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              icon={<Check />}
              onClick={() => {
                setResolving("approve");
              }}
            >
              {t.approve}
            </Button>
            <Button
              variant="danger"
              icon={<X />}
              onClick={() => {
                setResolving("reject");
              }}
            >
              {t.reject}
            </Button>
          </div>
        ) : (
          <p className="mt-auto rounded-xl bg-surface-2 px-3 py-2 text-xs text-fg-muted">
            {t.decided(flag.status === "approved" ? t.statusApproved : t.statusRejected, flag.resolvedBy ?? "—", flag.resolvedAt === null ? "" : shortDateTime(flag.resolvedAt))}
            {flag.resolutionNote !== null && <span className="mt-1 block text-fg">{flag.resolutionNote}</span>}
          </p>
        )}
      </div>
      {resolving !== null && (
        <ResolveDialog
          flag={flag}
          action={resolving}
          onClose={() => {
            setResolving(null);
          }}
        />
      )}
    </Card>
  );
}

function RecentCard({ art }: { art: RecentArtDto }) {
  const queryClient = useQueryClient();
  const [revealed, setRevealed] = useState(false);
  const flag = useMutation({
    mutationFn: () => api<ModerationFlagDto>(`/api/admin/moderation/arts/${art.artId}/flag`, { method: "POST", body: { note: null } }),
    onSuccess: () => {
      toast.success(t.flagged);
      void queryClient.invalidateQueries({ queryKey: ["admin", "moderation"] });
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
  return (
    <Card padded={false} className="flex flex-col overflow-hidden">
      <div className="p-3">
        <Thumb
          artId={art.artId}
          revealed={revealed}
          onToggle={() => {
            setRevealed(!revealed);
          }}
        />
      </div>
      <div className="flex flex-1 flex-col gap-2 px-4 pb-4 text-sm">
        <Badge tone={ART_TONE[art.moderation] ?? "neutral"} className="w-fit">
          {artLabel(art.moderation)}
        </Badge>
        <Link href={`/painel/admin/organizacoes/${art.organizationId}`} className="font-semibold text-fg hover:underline">
          {art.organizationName}
        </Link>
        <span className="text-xs text-fg-subtle">
          {art.eventName} · {shortDateTime(art.createdAt)}
        </span>
        {art.moderation !== "flagged" && art.moderation !== "rejected" && (
          <Button variant="ghost" size="sm" icon={<Flag />} className="mt-auto w-fit" loading={flag.isPending} onClick={() => flag.mutate()}>
            {t.flag}
          </Button>
        )}
      </div>
    </Card>
  );
}

/** Images sent by organizers (ADR 0042). */
export function AdminModeration() {
  const [view, setView] = useState<View>("open");
  const summary = useQuery({
    queryKey: ["admin", "moderation", "summary"],
    queryFn: () => api<ModerationSummaryDto>("/api/admin/moderation/summary"),
  });
  const flags = useQuery({
    queryKey: ["admin", "moderation", "flags", view],
    queryFn: () => api<ModerationFlagDto[]>(`/api/admin/moderation?status=${view}`),
    enabled: view !== "recent",
  });
  const recent = useQuery({
    queryKey: ["admin", "moderation", "recent"],
    queryFn: () => api<RecentArtDto[]>("/api/admin/moderation/recent"),
    enabled: view === "recent",
  });
  const s = summary.data;
  return (
    <div className="flex flex-col gap-4">
      <Lead>{t.intro}</Lead>
      {s !== undefined &&
        (s.classifier ? (
          <p className="flex items-center gap-2 text-xs text-fg-muted">
            <ScanSearch className="size-4 text-brand" aria-hidden />
            {t.classifierOn(s.usedToday, s.dailyLimit)}
          </p>
        ) : (
          <Alert tone="warning" title={t.classifierOffTitle}>
            {t.classifierOff}
          </Alert>
        ))}
      <div role="tablist" aria-label={t.intro} className="flex gap-1 overflow-x-auto rounded-xl bg-surface-2 p-1 [scrollbar-width:none]">
        {VIEWS.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={view === item}
            onClick={() => {
              setView(item);
            }}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition",
              view === item ? "bg-surface text-fg shadow-xs" : "text-fg-muted hover:text-fg",
            )}
          >
            {t.views[item]}
            {item === "open" && (s?.open ?? 0) > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-danger-solid px-1.5 text-[11px] font-semibold text-white">
                {s?.open}
              </span>
            )}
          </button>
        ))}
      </div>
      {view === "recent" ? (
        recent.isPending ? (
          <LoadingBlock rows={2} />
        ) : recent.isError ? (
          <ErrorMessage error={recent.error} />
        ) : recent.data.length === 0 ? (
          <EmptyState icon={ShieldCheck} title={t.noUploads} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {recent.data.map((art) => (
              <RecentCard key={art.artId} art={art} />
            ))}
          </div>
        )
      ) : flags.isPending ? (
        <LoadingBlock rows={2} />
      ) : flags.isError ? (
        <ErrorMessage error={flags.error} />
      ) : flags.data.length === 0 ? (
        view === "open" ? (
          <EmptyState icon={ShieldCheck} title={t.allClear} description={t.allClearHint} />
        ) : (
          <EmptyState icon={ShieldAlert} title={t.noneHere} />
        )
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {flags.data.map((flag) => (
            <FlagCard key={flag.id} flag={flag} />
          ))}
        </div>
      )}
      <p className="text-xs leading-relaxed text-fg-subtle">{t.legal}</p>
    </div>
  );
}
