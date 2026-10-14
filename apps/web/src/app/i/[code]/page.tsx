import type { Metadata } from "next";

import { ReferralRedirect } from "@/components/account/referral-redirect";
import { referrals as referralsTexts } from "@/texts/pt-BR/referrals";

const t = referralsTexts;

// A referral link (ADR 0076): kept out of search, but with a title for link previews.
export const metadata: Metadata = {
  title: t.linkTitle,
  description: t.linkDescription,
  robots: { index: false, follow: false },
  openGraph: { title: t.linkTitle, description: t.linkDescription },
};

type Props = { params: Promise<{ code: string }> };

export default async function ReferralLink({ params }: Props) {
  const { code } = await params;
  return <ReferralRedirect code={code} />;
}
