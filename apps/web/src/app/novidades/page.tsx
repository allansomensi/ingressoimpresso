import type { Metadata } from "next";

import { ChangelogPage } from "@/components/changelog/changelog-page";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { pageMetadata } from "@/lib/seo";
import { changelog as changelogTexts } from "@/texts/pt-BR/changelog";

export const metadata: Metadata = pageMetadata({
  title: changelogTexts.metaTitle,
  description: changelogTexts.metaDescription,
  path: "/novidades",
});

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
