import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { JsonLd, eventHubJsonLd } from "@/components/json-ld";
import { Breadcrumb } from "@/components/marketing/breadcrumb";
import { FinalCta } from "@/components/marketing/final-cta";
import { MobileCta } from "@/components/marketing/mobile-cta";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { ButtonLink } from "@/components/ui";
import { eventSeoPages } from "@/content/seo-event-pages";
import { EVENT_TEMPLATES, templateImagePath, templateSeoById } from "@/content/seo-templates";
import { pageMetadata } from "@/lib/seo";
import { templateImageSize } from "@/lib/templates/images";
import { eventPages as eventPagesTexts } from "@/texts/pt-BR/event-pages";
import { landing as landingTexts } from "@/texts/pt-BR/landing";
import { templateGallery as templateGalleryTexts } from "@/texts/pt-BR/template-gallery";

const t = eventPagesTexts;

export const metadata: Metadata = pageMetadata({ title: t.hubMetaTitle, description: t.hubMetaDescription, path: "/ingresso-para" });

/** Every kind of event with its own page (ADR 0081): the hub the event pages hang from. */
export default function EventTypesPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <JsonLd data={eventHubJsonLd(eventSeoPages, t.hubMetaTitle, t.hubMetaDescription)} />
      <SiteHeader />
      <main className="flex-1">
        <section className="relative overflow-hidden bg-glow">
          <div aria-hidden className="absolute inset-0 bg-dots [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)] opacity-60" />
          <div className="relative mx-auto flex max-w-3xl flex-col items-start gap-6 px-4 pt-10 pb-14 sm:items-center sm:px-6 sm:text-center lg:pt-16">
            <Breadcrumb items={[{ label: t.home, href: "/" }, { label: t.hubBreadcrumb }]} />
            <h1 className="text-4xl leading-[1.05] font-semibold tracking-tight text-balance text-fg sm:text-5xl">{t.hubTitle}</h1>
            <p className="text-lg leading-relaxed text-pretty text-fg-muted">{t.hubLead}</p>
            <div id="comecar">
              <ButtonLink href="/entrar" size="lg" icon={<ArrowRight />} className="flex-row-reverse">
                {landingTexts.primaryCta}
              </ButtonLink>
            </div>
          </div>
        </section>
        <section className="border-t border-border bg-bg">
          <ul className="mx-auto grid max-w-6xl gap-4 px-4 py-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-3 lg:py-20">
            {eventSeoPages.map((page) => {
              const template = (EVENT_TEMPLATES[page.slug] ?? []).map(templateSeoById).find((item) => item !== undefined);
              const size = template === undefined ? null : templateImageSize(template.id);
              return (
                <li key={page.slug}>
                  <Link
                    href={`/ingresso-para/${page.slug}`}
                    className="group flex h-full flex-col gap-3 rounded-2xl border border-border bg-surface p-3 shadow-xs transition hover:border-brand/40 hover:shadow-md active:bg-surface-2"
                  >
                    {template !== undefined && size !== null && (
                      <div className="flex aspect-[16/9] items-center justify-center overflow-hidden rounded-xl bg-surface-2 p-4">
                        <Image
                          src={templateImagePath(template)}
                          width={size.width}
                          height={size.height}
                          alt={templateGalleryTexts.imageAlt(template.h1)}
                          sizes="(min-width: 1024px) 360px, (min-width: 640px) 45vw, 90vw"
                          className="h-auto max-h-full w-auto max-w-full rounded-[3px] object-contain shadow-md ring-1 ring-black/10 transition group-hover:-translate-y-0.5"
                        />
                      </div>
                    )}
                    <div className="flex flex-col gap-1 px-1 pb-1">
                      <h2 className="text-base font-semibold text-fg">{t.hubSee(page.label)}</h2>
                      <p className="text-sm leading-relaxed text-fg-muted">{page.description}</p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
        <FinalCta title={landingTexts.finalTitle} />
      </main>
      <SiteFooter />
      <MobileCta />
    </div>
  );
}
