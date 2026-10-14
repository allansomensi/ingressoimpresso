import { ArrowRight, Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { JsonLd, templatePageJsonLd } from "@/components/json-ld";
import { Breadcrumb } from "@/components/marketing/breadcrumb";
import { FinalCta } from "@/components/marketing/final-cta";
import { MobileCta } from "@/components/marketing/mobile-cta";
import { SectionHeading } from "@/components/marketing/section-heading";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { TemplateCard } from "@/components/marketing/template-card";
import { TemplateSample } from "@/components/marketing/template-sample";
import { ButtonLink } from "@/components/ui";
import { eventSeoPage } from "@/content/seo-event-pages";
import { eventSlugForTemplate, templateSeoBySlug, templateSeoPages } from "@/content/seo-templates";
import { templateById } from "@/lib/templates/catalog";
import { eventPages as eventPagesTexts } from "@/texts/pt-BR/event-pages";
import { meta as metaTexts } from "@/texts/pt-BR/meta";
import { templateGallery as templateGalleryTexts } from "@/texts/pt-BR/template-gallery";
import { templates as templatesTexts } from "@/texts/pt-BR/templates";

const t = templateGalleryTexts;

type Props = { params: Promise<{ slug: string }> };

// Only the templates of the catalog have a page; any other slug is a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return templateSeoPages.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = templateSeoBySlug((await params).slug);
  if (page === undefined) {
    return {};
  }
  const path = `/modelos/${page.slug}`;
  return {
    title: { absolute: page.title },
    description: page.description,
    alternates: { canonical: path },
    // The share image is ./opengraph-image.tsx (and ./twitter-image.tsx).
    openGraph: { type: "website", locale: "pt_BR", siteName: metaTexts.title, url: path, title: page.title, description: page.description },
    twitter: { card: "summary_large_image", title: page.title, description: page.description },
  };
}

/** One template: a large sample, its colours, what it brings and the templates next to it. */
export default async function TemplatePage({ params }: Props) {
  const page = templateSeoBySlug((await params).slug);
  const template = page === undefined ? undefined : templateById(page.id);
  if (page === undefined || template === undefined) {
    notFound();
  }
  const item = templatesTexts.items[page.id];
  const first = template.palettes[0];
  const design = first === undefined ? null : template.build(first).design;
  const format = design === null ? "" : templatesTexts.format(design.widthMm, design.heightMm, design.stub !== null);
  const eventSlug = eventSlugForTemplate(page.id);
  const event = eventSlug === undefined ? undefined : eventSeoPage(eventSlug);
  const position = templateSeoPages.findIndex((other) => other.id === page.id);
  const others = [1, 2, 3].map((step) => templateSeoPages[(position + step) % templateSeoPages.length]).filter((other) => other !== undefined);
  // A tall template (the graduation invitation) gets a narrower preview.
  const tall = design !== null && design.heightMm > design.widthMm;

  return (
    <div className="flex min-h-dvh flex-col">
      <JsonLd data={templatePageJsonLd(page)} />
      <SiteHeader />
      <main className="flex-1">
        {/* Hero: the template, large, with the sample event. */}
        <section className="relative overflow-hidden bg-glow">
          <div aria-hidden className="absolute inset-0 bg-dots [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)] opacity-60" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pt-10 pb-16 sm:px-6 lg:grid-cols-[1fr_1.15fr] lg:pt-16 lg:pb-24">
            <div className="flex flex-col items-start gap-6">
              <Breadcrumb
                items={[{ label: eventPagesTexts.home, href: "/" }, { label: t.breadcrumb, href: "/modelos" }, { label: item.name }]}
              />
              <span className="inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand-soft px-3 py-1 text-[13px] font-medium text-brand-soft-fg">
                <span className="size-1.5 rounded-full bg-brand" />
                {t.templateEyebrow}
              </span>
              <h1 className="text-4xl leading-[1.05] font-semibold tracking-tight text-balance text-fg sm:text-5xl">{page.h1}</h1>
              <p className="max-w-xl text-lg leading-relaxed text-pretty text-fg-muted">{page.intro}</p>
              <div id="comecar" className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                <ButtonLink href="/entrar" size="lg" icon={<ArrowRight />} className="flex-row-reverse">
                  {t.use}
                </ButtonLink>
                <ButtonLink href="/modelos" size="lg" variant="secondary">
                  {t.all}
                </ButtonLink>
              </div>
            </div>
            <figure className="flex flex-col items-center gap-3">
              <div className={tall ? "w-full max-w-[18rem]" : "w-full max-w-2xl"}>
                <TemplateSample id={page.id} capture className="rounded-[3px] shadow-xl ring-1 ring-black/10" />
              </div>
              <figcaption className="text-center text-xs text-fg-subtle">{t.sample}</figcaption>
            </figure>
          </div>
        </section>

        {/* Colours */}
        {template.palettes.length > 1 && (
          <section className="border-y border-border bg-surface">
            <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-16 sm:px-6 lg:py-20">
              <SectionHeading title={t.colorsTitle} lead={t.colorsLead} />
              {/* Centered rows: two palettes sit in the middle, not on the left of a grid of three. */}
              <ul className="flex flex-wrap justify-center gap-6">
                {template.palettes.map((palette, index) => (
                  <li key={palette.id} className="flex w-full flex-col items-center gap-3 sm:w-[calc(50%-0.75rem)] lg:w-[calc(33.333%-1rem)]">
                    <div className={tall ? "w-full max-w-[12rem]" : "w-full"}>
                      <TemplateSample id={page.id} palette={index} index={index} className="rounded-[3px] shadow-md ring-1 ring-black/10" />
                    </div>
                    <span className="flex items-center gap-2 text-sm font-medium text-fg-muted">
                      <span aria-hidden className="size-3 rounded-full ring-1 ring-black/10" style={{ backgroundColor: palette.bg }} />
                      {templatesTexts.palettes[palette.id as keyof typeof templatesTexts.palettes] ?? palette.id}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* What comes with it, and the event page it belongs to. */}
        <section className="bg-bg">
          <div className="mx-auto grid max-w-5xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.2fr_1fr] lg:py-20">
            <div className="flex flex-col gap-5">
              <h2 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">{t.includesTitle}</h2>
              <ul className="flex flex-col gap-3">
                {t.includes(format).map((line) => (
                  <li key={line} className="flex items-start gap-3 text-[15px] leading-relaxed text-fg">
                    <Check className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
                    {line}
                  </li>
                ))}
              </ul>
            </div>
            {event !== undefined && (
              <aside className="flex flex-col justify-center gap-3 rounded-3xl border border-brand/20 bg-gradient-to-br from-brand-soft via-brand-soft/50 to-surface p-6 sm:p-8">
                <h2 className="text-xl font-semibold tracking-tight text-fg">{t.eventTitle(event.label)}</h2>
                <p className="text-[15px] leading-relaxed text-fg-muted">{t.eventBody}</p>
                <Link
                  href={`/ingresso-para/${event.slug}`}
                  className="relative inline-flex w-fit items-center gap-1.5 text-[15px] font-semibold text-brand-soft-fg touch-target hover:underline"
                >
                  {t.eventLink(event.label)}
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </aside>
            )}
          </div>
        </section>

        {/* Other templates */}
        <section className="border-t border-border bg-surface">
          <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-16 sm:px-6 lg:py-20">
            <SectionHeading title={t.othersTitle} />
            <ul className="grid gap-4 sm:grid-cols-3">
              {others.map((other) => (
                <li key={other.id}>
                  <TemplateCard page={other} headingLevel="h3" />
                </li>
              ))}
            </ul>
            <div className="flex justify-center">
              <ButtonLink href="/modelos" variant="secondary">
                {t.all}
              </ButtonLink>
            </div>
          </div>
        </section>

        <FinalCta title={t.finalTitle} />
      </main>
      <SiteFooter />
      <MobileCta />
    </div>
  );
}
