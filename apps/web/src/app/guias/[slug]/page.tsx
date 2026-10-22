import { ArrowRight, Clock, Lightbulb } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { JsonLd, guideJsonLd } from "@/components/json-ld";
import { Breadcrumb } from "@/components/marketing/breadcrumb";
import { FaqList } from "@/components/marketing/faq-list";
import { FinalCta } from "@/components/marketing/final-cta";
import { GuideCard } from "@/components/marketing/guide-card";
import { MobileCta } from "@/components/marketing/mobile-cta";
import { RichText } from "@/components/marketing/rich-text";
import { SectionHeading } from "@/components/marketing/section-heading";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { TemplateCard } from "@/components/marketing/template-card";
import { ButtonLink } from "@/components/ui";
import { eventSeoPage } from "@/content/seo-event-pages";
import { guideReadingMinutes, seoGuide, seoGuides, type GuideBlock } from "@/content/seo-guides";
import { templateSeoById } from "@/content/seo-templates";
import { pageMetadata } from "@/lib/seo";
import { eventPages as eventPagesTexts } from "@/texts/pt-BR/event-pages";
import { guides as guidesTexts } from "@/texts/pt-BR/guides";
import { landing as landingTexts } from "@/texts/pt-BR/landing";
import { templateGallery as templateGalleryTexts } from "@/texts/pt-BR/template-gallery";

const t = guidesTexts;

type Props = { params: Promise<{ slug: string }> };

// Only the guides in seoGuides exist; any other slug is a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return seoGuides.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const guide = seoGuide((await params).slug);
  if (guide === undefined) {
    return {};
  }
  // The share image is ./opengraph-image.tsx.
  return pageMetadata({
    title: guide.title,
    description: guide.description,
    path: `/guias/${guide.slug}`,
    article: { publishedAt: guide.publishedAt, updatedAt: guide.updatedAt },
  });
}

/** `14 de outubro de 2026` for an ISO day. */
function longDate(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

function Block({ block }: { block: GuideBlock }) {
  switch (block.kind) {
    case "p":
      return (
        <p className="text-[17px] leading-relaxed text-fg-muted">
          <RichText text={block.text} />
        </p>
      );
    case "ul":
    case "ol": {
      const List = block.kind;
      return (
        <List className={`flex flex-col gap-2 pl-6 text-[17px] leading-relaxed text-fg-muted ${block.kind === "ul" ? "list-disc" : "list-decimal"} marker:text-brand`}>
          {block.items.map((item) => (
            <li key={item} className="pl-1">
              <RichText text={item} />
            </li>
          ))}
        </List>
      );
    }
    case "tip":
      return (
        <aside className="flex gap-3 rounded-2xl border border-brand/20 bg-brand-soft/60 p-4 sm:p-5">
          <Lightbulb className="mt-0.5 size-5 shrink-0 text-brand-soft-fg" aria-hidden />
          <p className="text-[15px] leading-relaxed text-fg">
            <strong className="font-semibold">{t.tip}: </strong>
            <RichText text={block.text} />
          </p>
        </aside>
      );
  }
}

/** One guide (ADR 0081): the article, its questions, templates to start from and where to go next. */
export default async function GuidePage({ params }: Props) {
  const guide = seoGuide((await params).slug);
  if (guide === undefined) {
    notFound();
  }
  const templates = guide.templates.map(templateSeoById).filter((template) => template !== undefined);
  const events = guide.events.map(eventSeoPage).filter((event) => event !== undefined);
  const position = seoGuides.findIndex((other) => other.slug === guide.slug);
  const others = [1, 2, 3].map((step) => seoGuides[(position + step) % seoGuides.length]).filter((other) => other !== undefined);

  return (
    <div className="flex min-h-dvh flex-col">
      <JsonLd data={guideJsonLd(guide)} />
      <SiteHeader />
      <main id="conteudo" className="flex-1">
        <article>
          <header className="relative overflow-hidden bg-glow">
            <div aria-hidden className="absolute inset-0 bg-dots [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)] opacity-60" />
            {/* The same columns as the article below: the title lines up with the text. */}
            <div className="relative mx-auto grid max-w-6xl px-4 pt-10 pb-12 sm:px-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-16 lg:pt-16">
              <div className="flex max-w-3xl flex-col items-start gap-6 lg:col-start-2">
                <Breadcrumb items={[{ label: eventPagesTexts.home, href: "/" }, { label: t.breadcrumb, href: "/guias" }, { label: guide.label }]} />
                <span className="inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand-soft px-3 py-1 text-[13px] font-medium text-brand-soft-fg">
                  <span className="size-1.5 rounded-full bg-brand" />
                  {t.articleEyebrow}
                </span>
                <h1 className="text-4xl leading-[1.08] font-semibold tracking-tight text-balance text-fg sm:text-5xl">{guide.h1}</h1>
                <p className="text-lg leading-relaxed text-pretty text-fg-muted sm:text-xl">{guide.lead}</p>
                <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-fg-subtle">
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="size-4" aria-hidden />
                    {t.readingTime(guideReadingMinutes(guide))}
                  </span>
                  <span>
                    {t.updated} <time dateTime={guide.updatedAt}>{longDate(guide.updatedAt)}</time>
                  </span>
                </p>
                <div id="comecar">
                  <ButtonLink href="/entrar" size="lg" icon={<ArrowRight />} className="flex-row-reverse">
                    {landingTexts.primaryCta}
                  </ButtonLink>
                </div>
              </div>
            </div>
          </header>

          <div className="border-t border-border bg-bg">
            <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-16 lg:py-20">
              <nav aria-labelledby="neste-guia" className="lg:sticky lg:top-24 lg:self-start">
                <h2 id="neste-guia" className="text-xs font-semibold tracking-wide text-fg-subtle uppercase">
                  {t.contents}
                </h2>
                <ol className="mt-3 flex flex-col gap-1 border-l border-border">
                  {guide.sections.map((section) => (
                    <li key={section.id}>
                      <a
                        href={`#${section.id}`}
                        className="-ml-px flex min-h-9 items-center border-l-2 border-transparent pl-3 text-sm text-fg-muted transition hover:border-brand hover:text-fg pointer-coarse:min-h-11"
                      >
                        {section.heading}
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
              <div className="flex max-w-3xl min-w-0 flex-col gap-12">
                {guide.sections.map((section) => (
                  <section key={section.id} id={section.id} className="flex flex-col gap-4">
                    <h2 className="text-2xl font-semibold tracking-tight text-balance text-fg sm:text-3xl">{section.heading}</h2>
                    {section.blocks.map((block, index) => (
                      <Block key={index} block={block} />
                    ))}
                  </section>
                ))}
              </div>
            </div>
          </div>

          {guide.faq.length > 0 && (
            <section id="duvidas" className="border-t border-border bg-surface">
              <div className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-16 sm:px-6 lg:py-20">
                <SectionHeading title={t.faqTitle} />
                <FaqList items={guide.faq} />
              </div>
            </section>
          )}
        </article>

        {templates.length > 0 && (
          <section className="border-t border-border bg-bg">
            <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-16 sm:px-6 lg:py-20">
              <SectionHeading title={t.templatesTitle} lead={t.templatesLead} />
              <ul className="grid gap-4 sm:grid-cols-3">
                {templates.map((template) => (
                  <li key={template.id}>
                    <TemplateCard page={template} headingLevel="h3" />
                  </li>
                ))}
              </ul>
              <div className="flex justify-center">
                <ButtonLink href="/modelos" variant="secondary">
                  {templateGalleryTexts.all}
                </ButtonLink>
              </div>
            </div>
          </section>
        )}

        <FinalCta title={guide.cta} />

        <section className="border-t border-border bg-surface">
          <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-16 sm:px-6 lg:py-20">
            <SectionHeading title={t.othersTitle} />
            <ul className="grid gap-4 sm:grid-cols-3">
              {others.map((other) => (
                <li key={other.slug}>
                  <GuideCard guide={other} headingLevel="h3" />
                </li>
              ))}
            </ul>
            {events.length > 0 && (
              <nav aria-labelledby="tipos-de-evento" className="flex flex-col items-center gap-4">
                <h2 id="tipos-de-evento" className="text-sm font-semibold text-fg-subtle">
                  {t.eventsTitle}
                </h2>
                <ul className="flex flex-wrap justify-center gap-2.5">
                  {events.map((event) => (
                    <li key={event.slug}>
                      <Link
                        href={`/ingresso-para/${event.slug}`}
                        className="inline-flex min-h-10 items-center rounded-full border border-border bg-bg px-4 text-sm font-medium text-fg-muted transition hover:border-brand/40 hover:text-fg active:bg-surface-2"
                      >
                        {eventPagesTexts.eyebrow(event.label)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
          </div>
        </section>
      </main>
      <SiteFooter />
      <MobileCta />
    </div>
  );
}
