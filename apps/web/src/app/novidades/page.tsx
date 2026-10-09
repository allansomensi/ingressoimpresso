import type { Metadata } from "next";

import { ChangelogPage } from "@/components/changelog/changelog-page";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { texts } from "@/texts/pt-BR";

export const metadata: Metadata = {
  title: texts.changelog.title,
  description: texts.changelog.metaDescription,
  alternates: { canonical: "/novidades" },
};

export default function NewsPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1 bg-glow">
        <ChangelogPage />
      </main>
      <SiteFooter />
    </div>
  );
}
