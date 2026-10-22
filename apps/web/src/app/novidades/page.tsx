import type { ChangelogEntryDto } from "@ingressoimpresso/api-types";
import type { Metadata } from "next";

import { ChangelogPage } from "@/components/changelog/changelog-page";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { pageMetadata } from "@/lib/seo";
import { fetchPublic } from "@/lib/server-fetch";
import { changelog as changelogTexts } from "@/texts/pt-BR/changelog";

export const metadata: Metadata = pageMetadata({
  title: changelogTexts.metaTitle,
  description: changelogTexts.metaDescription,
  path: "/novidades",
});

/** The notes come in the HTML (the page is in the sitemap); the browser keeps them fresh. */
export default async function NewsPage() {
  const initial = await fetchPublic<ChangelogEntryDto[]>("/api/changelog", { revalidate: 300 });
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="conteudo" className="flex-1 bg-glow">
        <ChangelogPage initial={initial} />
      </main>
      <SiteFooter />
    </div>
  );
}
