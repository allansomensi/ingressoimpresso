import { ArrowRight, Gift, Layers, Percent, Wallet, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { JsonLd, pricingJsonLd } from "@/components/json-ld";
import { Breadcrumb } from "@/components/marketing/breadcrumb";
import { FaqList } from "@/components/marketing/faq-list";
import { FinalCta } from "@/components/marketing/final-cta";
import { MobileCta } from "@/components/marketing/mobile-cta";
import { PricingSection } from "@/components/marketing/pricing";
import { SectionHeading } from "@/components/marketing/section-heading";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { fetchPricing } from "@/lib/pricing-server";
import { pageMetadata } from "@/lib/seo";
import { eventPages as eventPagesTexts } from "@/texts/pt-BR/event-pages";
import { pricingPage as pricingPageTexts } from "@/texts/pt-BR/pricing-page";

const t = pricingPageTexts;
const HOW_ICONS: readonly LucideIcon[] = [Wallet, Layers, Gift, Percent];

// The share image is ./opengraph-image.tsx.
export const metadata: Metadata = pageMetadata({ title: t.metaTitle, description: t.metaDescription, path: "/precos" });

/**
 * What the product costs (ADR 0081): the simulator and the table with the prices read on the
 * server, how the charge works, the comparison with a fee per sale and the questions about paying.
 */
export default async function PricingPage() {
  const pricing = await fetchPricing();
  return (
    <div className="flex min-h-dvh flex-col">
      <JsonLd data={pricingJsonLd({ title: t.metaTitle, description: t.metaDescription, name: t.breadcrumb, faq: t.faq, pricing })} />
      <SiteHeader />
      <main id="conteudo" className="flex-1">
        <section className="relative overflow-hidden bg-glow">
          <div aria-hidden className="absolute inset-0 bg-dots [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)] opacity-60" />
          <div className="relative mx-auto flex max-w-3xl flex-col items-start gap-6 px-4 pt-10 pb-12 sm:items-center sm:px-6 sm:text-center lg:pt-16">
            <Breadcrumb items={[{ label: eventPagesTexts.home, href: "/" }, { label: t.breadcrumb }]} />
            <h1 className="text-4xl leading-[1.05] font-semibold tracking-tight text-balance text-fg sm:text-5xl">{t.headline}</h1>
            <p className="text-lg leading-relaxed text-pretty text-fg-muted">{t.lead}</p>
          </div>
        </section>

        <section id="comecar">
          <div className="mx-auto max-w-5xl px-4 pb-20 sm:px-6">
            <PricingSection initial={pricing} />
          </div>
        </section>

        <section className="border-y border-border bg-surface">
          <div className="mx-auto flex max-w-6xl flex-col gap-12 px-4 py-20 sm:px-6 lg:py-24">
            <SectionHeading title={t.howTitle} />
            <ul className="grid gap-px overflow-hidden rounded-3xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
              {t.how.map((item, index) => {
                const Icon = HOW_ICONS[index] ?? Wallet;
                return (
                  <li key={item.title} className="flex gap-4 bg-surface p-5 sm:flex-col sm:gap-3 sm:p-7">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-soft-fg">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <div className="flex min-w-0 flex-col gap-1 sm:gap-3">
                      <h3 className="text-base font-semibold text-fg">{item.title}</h3>
                      <p className="text-[15px] leading-relaxed text-fg-muted">{item.body}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
            <aside className="mx-auto flex max-w-3xl flex-col gap-3 rounded-3xl border border-brand/20 bg-gradient-to-br from-brand-soft via-brand-soft/50 to-surface p-6 sm:p-8">
              <h2 className="text-xl font-semibold tracking-tight text-fg">{t.compareTitle}</h2>
              <p className="text-[15px] leading-relaxed text-fg-muted">{t.compareBody}</p>
              <Link
                href="/guias/vender-ingresso-sem-taxa"
                className="relative inline-flex w-fit items-center gap-1.5 text-[15px] font-semibold text-brand-soft-fg touch-target hover:underline"
              >
                {t.compareLink}
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </aside>
          </div>
        </section>

        <section id="duvidas" className="bg-bg">
          <div className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-20 sm:px-6 lg:py-24">
            <SectionHeading title={t.faqTitle} />
            <FaqList items={t.faq} />
          </div>
        </section>

        <FinalCta title={t.finalTitle} />
      </main>
      <SiteFooter />
      <MobileCta />
    </div>
  );
}
