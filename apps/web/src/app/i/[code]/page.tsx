import type { Metadata } from "next";

import { ReferralRedirect } from "@/components/account/referral-redirect";
import { privatePageMetadata } from "@/lib/seo";
import { referrals as referralsTexts } from "@/texts/pt-BR/referrals";

const t = referralsTexts;

// A referral link (ADR 0076): kept out of search, but with its own words in link previews.
export const metadata: Metadata = privatePageMetadata({ title: t.linkTitle, description: t.linkDescription });

type Props = { params: Promise<{ code: string }> };

export default async function ReferralLink({ params }: Props) {
  const { code } = await params;
  return <ReferralRedirect code={code} />;
}
