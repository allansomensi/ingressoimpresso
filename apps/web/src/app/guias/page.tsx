import type { Metadata } from "next";

import { JsonLd, guideIndexJsonLd } from "@/components/json-ld";
import { Breadcrumb } from "@/components/marketing/breadcrumb";
import { FinalCta } from "@/components/marketing/final-cta";
import { GuideCard } from "@/components/marketing/guide-card";
import { MobileCta } from "@/components/marketing/mobile-cta";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { seoGuides } from "@/content/seo-guides";
import { pageMetadata } from "@/lib/seo";
import { eventPages as eventPagesTexts } from "@/texts/pt-BR/event-pages";
import { guides as guidesTexts } from "@/texts/pt-BR/guides";
import { landing as landingTexts } from "@/texts/pt-BR/landing";

const t = guidesTexts;

export const metadata: Metadata = pageMetadata({ title: t.metaTitle, description: t.metaDescription, path: "/guias" });

/** Every guide (ADR 0081): the answers to what organizers search before they need the product. */
export default function GuidesPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <JsonLd data={guideIndexJsonLd(seoGuides, t.metaTitle, t.metaDescription)} />
      <SiteHeader />
      <main className="flex-1">
        <section className="relative overflow-hidden bg-glow">
          <div aria-hidden className="absolute inset-0 bg-dots [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)] opacity-60" />
          <div className="relative mx-auto flex max-w-3xl flex-col items-start gap-6 px-4 pt-10 pb-14 sm:items-center sm:px-6 sm:text-center lg:pt-16">
            <Breadcrumb items={[{ label: eventPagesTexts.home, href: "/" }, { label: t.breadcrumb }]} />
            <h1 className="text-4xl leading-[1.05] font-semibold tracking-tight text-balance text-fg sm:text-5xl">{t.headline}</h1>
            <p className="text-lg leading-relaxed text-pretty text-fg-muted">{t.lead}</p>
          </div>
        </section>
        <section id="comecar" className="border-t border-border bg-bg">
          <ul className="mx-auto grid max-w-6xl gap-4 px-4 py-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-3 lg:py-20">
            {seoGuides.map((guide) => (
              <li key={guide.slug}>
                <GuideCard guide={guide} />
              </li>
            ))}
          </ul>
        </section>
        <FinalCta title={landingTexts.finalTitle} />
      </main>
      <SiteFooter />
      <MobileCta />
    </div>
  );
}
