"use client";

import type { ReferralDto, ReferralsDto } from "@ingressoimpresso/api-types";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, Copy, Gift, MessageCircle, Share2 } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { Alert, Badge, Button, Card, CardHeader, ErrorMessage, Skeleton, buttonClass, type Tone } from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import { referralState, referralUrl, type ReferralState } from "@/lib/referral";
import { copyText, whatsappUrl } from "@/lib/share";
import { SITE_URL } from "@/lib/site";
import { referrals as referralsTexts } from "@/texts/pt-BR/referrals";

const t = referralsTexts;

const STATE_TONE: Record<ReferralState, Tone> = {
  pending: "neutral",
  rewarded: "success",
  capped: "warning",
  revoked: "danger",
};

function stateLabel(referral: ReferralDto): string {
  const state = referralState(referral);
  switch (state) {
    case "rewarded":
      return `${t.status.rewarded} · +${money(referral.earnedCents)}`;
    case "capped":
      return t.capped;
    case "pending":
    case "revoked":
      return t.status[state];
  }
}

const noSubscription = () => () => undefined;

/** Whether this browser can open the system's share sheet (phones, mostly). */
function useCanShare(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => typeof navigator.share === "function",
    () => false,
  );
}

function ReferralRow({ referral }: { referral: ReferralDto }) {
  const state = referralState(referral);
  return (
    <li className="flex flex-col items-start gap-1 py-2.5">
      <span className="flex w-full items-baseline justify-between gap-3">
        <span className={cn("truncate text-sm font-medium", referral.emailHint === "" ? "text-fg-muted italic" : "text-fg")}>
          {referral.emailHint === "" ? t.deletedAccount : referral.emailHint}
        </span>
        <span className="shrink-0 text-xs text-fg-subtle tabular">{t.joined(new Date(referral.createdAt).toLocaleDateString("pt-BR"))}</span>
      </span>
      <Badge tone={STATE_TONE[state]} dot={state === "pending"}>
        {stateLabel(referral)}
      </Badge>
    </li>
  );
}

/**
 * "Indique e ganhe" (ADR 0076): a small card beside the account's settings. The link and the ways
 * to send it stay at hand; how it works and who came through it fold away.
 */
export function ReferralsCard() {
  const referrals = useQuery({ queryKey: ["referrals"], queryFn: () => api<ReferralsDto>("/api/account/referrals") });
  const [copied, setCopied] = useState(false);
  const canShare = useCanShare();
  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = setTimeout(() => {
      setCopied(false);
    }, 2_000);
    return () => {
      clearTimeout(timer);
    };
  }, [copied]);

  if (referrals.isError) {
    return <ErrorMessage error={referrals.error} onRetry={() => void referrals.refetch()} />;
  }
  const data = referrals.data;
  const origin = typeof window === "undefined" ? SITE_URL : window.location.origin;
  const url = data === undefined ? "" : referralUrl(origin, data.code);
  const referrer = money(data?.referrerCents ?? 0);
  const referred = money(data?.referredCents ?? 0);
  const minimum = money(data?.minBatchCents ?? 0);
  const message = t.message(url, referred);
  const copy = async () => {
    if (await copyText(url)) {
      setCopied(true);
      toast.success(t.copied);
    } else {
      toast.error(t.copyFailed);
    }
  };
  const share = async () => {
    try {
      await navigator.share({ title: t.shareTitle, text: message });
    } catch {
      // Closed by the person, or refused: nothing to say.
    }
  };
  const invited = data?.invitedBy ?? null;

  return (
    <div id="indique" className="scroll-mt-4">
      <Card>
        <CardHeader icon={Gift} title={t.title} description={data === undefined ? undefined : t.headline(referrer)} className="mb-4" />
        {data === undefined ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-4 w-40" />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {!data.enabled && <Alert tone="warning">{t.off}</Alert>}
            {invited !== null && (
              <Alert tone={invited.status === "revoked" ? "warning" : "success"} title={t.invitedTitle}>
                {invited.status === "pending"
                  ? t.invitedPending(invited.organizationName, money(invited.referredCents), minimum)
                  : invited.status === "rewarded"
                    ? t.invitedRewarded(invited.organizationName, money(invited.referredCents))
                    : t.invitedRevoked}
              </Alert>
            )}

            <div className="flex items-center gap-2">
              <output
                title={url}
                aria-label={t.linkLabel}
                className="flex h-9 min-w-0 flex-1 items-center rounded-lg border border-border bg-surface-2 px-3 text-sm font-medium text-fg select-all pointer-coarse:h-11"
              >
                <span className="truncate">{url.replace(/^https?:\/\//, "")}</span>
              </output>
              <Button variant="secondary" size="icon" icon={copied ? <Check /> : <Copy />} aria-label={t.copy} title={t.copy} onClick={() => void copy()} />
              <a
                href={whatsappUrl(message)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t.whatsapp}
                title={t.whatsapp}
                className={buttonClass({ variant: "secondary", size: "icon" })}
              >
                <MessageCircle />
              </a>
              {canShare && <Button variant="secondary" size="icon" icon={<Share2 />} aria-label={t.share} title={t.share} onClick={() => void share()} />}
            </div>

            <p className="text-xs text-fg-muted tabular">
              {data.referrals.length === 0 ? t.none : t.count(data.referrals.length)}
              {data.earnedCents > 0 && (
                <>
                  {" · "}
                  <span className="font-semibold text-success-fg">{t.earned(money(data.earnedCents))}</span>
                </>
              )}
            </p>

            <details className="group -mx-1 border-t border-border pt-1">
              <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-lg px-1 text-sm font-medium text-fg-muted transition hover:text-fg active:bg-surface-2 [&::-webkit-details-marker]:hidden">
                <span className="flex-1">{data.referrals.length === 0 ? t.howTitle : t.moreTitle}</span>
                <ChevronDown aria-hidden className="size-4 shrink-0 text-fg-subtle transition group-open:rotate-180" />
              </summary>
              <div className="flex flex-col gap-3 px-1 pt-2 pb-1">
                <p className="text-sm leading-relaxed text-fg-muted">{t.hint(referrer, referred, minimum)}</p>
                <ol className="flex flex-col gap-2">
                  {t.steps(referrer, referred, minimum).map((step, index) => (
                    <li key={step.title} className="flex gap-2.5 text-[13px] leading-relaxed text-fg-muted">
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-3 text-[11px] font-semibold text-fg">
                        {index + 1}
                      </span>
                      <span>
                        <span className="font-semibold text-fg">{step.title}.</span> {step.body}
                      </span>
                    </li>
                  ))}
                </ol>
                <p className="text-xs leading-relaxed text-fg-subtle">{t.rules(data.monthlyLimit)}</p>
                {data.referrals.length > 0 && (
                  <div className="flex flex-col border-t border-border pt-2">
                    <h3 className="text-sm font-semibold text-fg">{t.listTitle}</h3>
                    <ul className="flex flex-col divide-y divide-border">
                      {data.referrals.map((referral) => (
                        <ReferralRow key={referral.id} referral={referral} />
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </details>
          </div>
        )}
      </Card>
    </div>
  );
}
