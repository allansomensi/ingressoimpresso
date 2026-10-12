"use client";

import type { ReferralDto, ReferralsDto } from "@ingressoimpresso/api-types";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, Gift, MessageCircle, Share2, UserRoundPlus } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { Alert, Badge, Button, ErrorMessage, Skeleton, buttonClass, type Tone } from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import { referralState, referralUrl, type ReferralState } from "@/lib/referral";
import { copyText, whatsappUrl } from "@/lib/share";
import { SITE_URL } from "@/lib/site";
import { texts } from "@/texts/pt-BR";

const t = texts.referrals;

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
    <li className="flex items-start gap-3 py-3">
      <span
        aria-hidden
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold uppercase",
          state === "rewarded" ? "bg-success-soft text-success-fg" : "bg-surface-2 text-fg-muted",
        )}
      >
        {referral.emailHint.slice(0, 2)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <span className="flex w-full items-baseline justify-between gap-3">
          <span className="truncate text-sm font-medium text-fg">{referral.emailHint}</span>
          <span className="shrink-0 text-xs text-fg-subtle tabular">{t.joined(new Date(referral.createdAt).toLocaleDateString("pt-BR"))}</span>
        </span>
        <Badge tone={STATE_TONE[state]} dot={state === "pending"}>
          {stateLabel(referral)}
        </Badge>
      </span>
    </li>
  );
}

/** "Indique e ganhe" (ADR 0076): the organization's link, how it works and who came through it. */
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
    return <ErrorMessage error={referrals.error} />;
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
    <section id="indique" aria-labelledby="indique-title" className="scroll-mt-24 overflow-hidden rounded-2xl border border-border bg-surface shadow-xs">
      <div className="relative overflow-hidden bg-brand-solid px-5 py-6 text-white sm:px-6">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(70%_120%_at_100%_0%,rgba(255,255,255,0.22),transparent)]" />
        <div className="relative flex items-start gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25">
            <Gift aria-hidden className="size-6" />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-xs font-semibold tracking-wide text-white/75 uppercase">{t.title}</p>
            {data === undefined ? (
              <Skeleton className="h-7 w-56 bg-white/20" />
            ) : (
              <h2 id="indique-title" className="text-xl leading-snug font-semibold tracking-tight text-balance sm:text-2xl">
                {t.headline(referrer)}
              </h2>
            )}
            {data !== undefined && <p className="max-w-xl text-sm leading-relaxed text-white/85">{t.hint(referrer, referred, minimum)}</p>}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-6 p-5 sm:p-6">
        {data === undefined ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <>
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

            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-fg">{t.linkLabel}</span>
              <div className="flex flex-col gap-2 sm:flex-row">
                <output
                  title={url}
                  className="flex h-11 min-w-0 flex-1 items-center rounded-xl border border-border bg-surface-2 px-3.5 text-[15px] font-medium text-fg select-all"
                >
                  <span className="truncate">{url.replace(/^https?:\/\//, "")}</span>
                </output>
                <Button variant="secondary" icon={copied ? <Check /> : <Copy />} onClick={() => void copy()} className="sm:w-auto">
                  {t.copy}
                </Button>
              </div>
              <div className={cn("grid gap-2", canShare && "sm:grid-cols-2")}>
                <a
                  href={whatsappUrl(message)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonClass({ variant: "primary", className: "w-full" })}
                >
                  <MessageCircle />
                  {t.whatsapp}
                </a>
                {canShare && (
                  <Button variant="secondary" icon={<Share2 />} onClick={() => void share()} className="w-full">
                    {t.share}
                  </Button>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-fg">{t.howTitle}</h3>
              <ol className="grid gap-2 sm:grid-cols-3">
                {t.steps(referrer, referred, minimum).map((step, index) => (
                  <li key={step.title} className="flex gap-3 rounded-xl bg-surface-2 p-3.5 sm:flex-col sm:gap-2">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-solid text-xs font-semibold text-brand-fg">
                      {index + 1}
                    </span>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-sm font-semibold text-fg">{step.title}</span>
                      <span className="text-[13px] leading-relaxed text-fg-muted">{step.body}</span>
                    </span>
                  </li>
                ))}
              </ol>
              <p className="text-xs leading-relaxed text-fg-muted">{t.rules(data.monthlyLimit)}</p>
            </div>

            <div className="flex flex-col gap-1 border-t border-border pt-5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h3 className="text-sm font-semibold text-fg">{t.listTitle}</h3>
                {data.referrals.length > 0 && (
                  <span className="text-xs text-fg-muted tabular">
                    {t.count(data.referrals.length)}
                    {data.earnedCents > 0 && (
                      <>
                        {" · "}
                        <span className="font-semibold text-success-fg">{t.earned(money(data.earnedCents))}</span>
                      </>
                    )}
                  </span>
                )}
              </div>
              {data.referrals.length === 0 ? (
                <div className="mt-2 flex items-center gap-3 rounded-xl border border-dashed border-border-strong px-4 py-4 text-sm text-fg-muted">
                  <UserRoundPlus aria-hidden className="size-5 shrink-0 text-fg-subtle" />
                  {t.empty}
                </div>
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {data.referrals.map((referral) => (
                    <ReferralRow key={referral.id} referral={referral} />
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
