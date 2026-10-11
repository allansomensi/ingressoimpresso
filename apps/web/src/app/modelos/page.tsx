import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";

import { JsonLd, templateGalleryJsonLd } from "@/components/json-ld";
import { Breadcrumb } from "@/components/marketing/breadcrumb";
import { FinalCta } from "@/components/marketing/final-cta";
import { MobileCta } from "@/components/marketing/mobile-cta";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { TemplateCard } from "@/components/marketing/template-card";
import { ButtonLink } from "@/components/ui";
import { templateSeoPages } from "@/content/seo-templates";
import { texts } from "@/texts/pt-BR";

const t = texts.templateGallery;

export const metadata: Metadata = {
  title: { absolute: `${t.title} · ${texts.meta.title}` },
  description: t.metaDescription,
  alternates: { canonical: "/modelos" },
  openGraph: { type: "website", locale: "pt_BR", siteName: texts.meta.title, url: "/modelos", title: t.title, description: t.metaDescription },
  twitter: { card: "summary_large_image", title: t.title, description: t.metaDescription },
};

/** Every ticket template, each linking to its own page (ADR 0062). */
export default function TemplateGalleryPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <JsonLd data={templateGalleryJsonLd(templateSeoPages, t.title, t.metaDescription)} />
      <SiteHeader />
      <main className="flex-1">
        <section className="relative overflow-hidden bg-glow">
          <div aria-hidden className="absolute inset-0 bg-dots [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)] opacity-60" />
          <div className="relative mx-auto flex max-w-3xl flex-col items-start gap-6 px-4 pt-10 pb-14 sm:items-center sm:px-6 sm:text-center lg:pt-16">
            <Breadcrumb items={[{ label: texts.eventPages.home, href: "/" }, { label: t.breadcrumb }]} />
            <h1 className="text-4xl leading-[1.05] font-semibold tracking-tight text-balance text-fg sm:text-5xl">{t.title}</h1>
            <p className="text-lg leading-relaxed text-pretty text-fg-muted">{t.lead}</p>
            <div id="comecar">
              <ButtonLink href="/entrar" size="lg" icon={<ArrowRight />} className="flex-row-reverse">
                {texts.landing.primaryCta}
              </ButtonLink>
            </div>
          </div>
        </section>
        <section className="border-t border-border bg-bg">
          <ul className="mx-auto grid max-w-6xl gap-4 px-4 py-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-3 lg:py-20">
            {templateSeoPages.map((page) => (
              <li key={page.id}>
                <TemplateCard page={page} />
              </li>
            ))}
          </ul>
        </section>
        <FinalCta title={texts.landing.finalTitle} />
      </main>
      <SiteFooter />
      <MobileCta />
    </div>
  );
}
