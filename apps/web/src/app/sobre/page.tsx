import type { Metadata } from "next";

import { AboutPage } from "@/components/about/about-page";
import { JsonLd, aboutJsonLd } from "@/components/json-ld";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { pageMetadata } from "@/lib/seo";
import { about as aboutTexts } from "@/texts/pt-BR/about";

export const metadata: Metadata = pageMetadata({ title: aboutTexts.metaTitle, description: aboutTexts.metaDescription, path: "/sobre" });

export default function About() {
  return (
    <div className="flex min-h-dvh flex-col">
      <JsonLd data={aboutJsonLd({ title: aboutTexts.metaTitle, description: aboutTexts.metaDescription, name: aboutTexts.title })} />
      <SiteHeader />
      <main id="conteudo" className="flex-1">
        <AboutPage />
      </main>
      <SiteFooter />
    </div>
  );
}
