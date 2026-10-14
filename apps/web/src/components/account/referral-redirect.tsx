"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { LogoMark } from "@/components/brand";
import { Spinner } from "@/components/ui";
import { normalizeReferralCode, saveReferral } from "@/lib/referral";
import { referrals as referralsTexts } from "@/texts/pt-BR/referrals";

/**
 * `/i/<code>`: keeps the referral code in this browser (the sign-up may come days later) and
 * opens the sign-up page, which shows who invites and what the new account earns (ADR 0076).
 */
export function ReferralRedirect({ code }: { code: string }) {
  const router = useRouter();
  useEffect(() => {
    const normalized = normalizeReferralCode(code);
    if (normalized === null) {
      router.replace("/entrar");
      return;
    }
    saveReferral(normalized);
    router.replace(`/entrar?indicacao=${normalized}`);
  }, [code, router]);
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-glow px-4 text-center">
      <LogoMark className="size-12" />
      <p role="status" className="flex items-center gap-2 text-sm font-medium text-fg-muted">
        <Spinner />
        {referralsTexts.opening}
      </p>
    </main>
  );
}
