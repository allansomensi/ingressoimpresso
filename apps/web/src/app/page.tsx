import {
  Activity,
  ArrowRight,
  Award,
  BarChart3,
  Check,
  Coins,
  DoorOpen,
  FileSpreadsheet,
  FileText,
  Globe,
  IdCard,
  Image as ImageIcon,
  LayoutTemplate,
  ListChecks,
  MousePointerClick,
  MessageCircle,
  PartyPopper,
  Printer,
  QrCode,
  Scissors,
  Send,
  ShieldCheck,
  Smartphone,
  Store,
  Tags,
  Ticket,
  UserCog,
  Users,
  UsersRound,
  Wallet,
  WifiOff,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { JsonLd, homeJsonLd } from "@/components/json-ld";
import { FaqList } from "@/components/marketing/faq-list";
import { FinalCta } from "@/components/marketing/final-cta";
import { DigitalTicketMock, PhoneMock, TicketMock } from "@/components/marketing/mockups";
import { MobileCta } from "@/components/marketing/mobile-cta";
import { PricingSection } from "@/components/marketing/pricing";
import { SectionHeading } from "@/components/marketing/section-heading";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { TemplateShowcase } from "@/components/marketing/template-showcase";
import { UseCases } from "@/components/marketing/use-cases";
import { ButtonLink } from "@/components/ui";
import { fetchPricing } from "@/lib/pricing-server";
import { pageMetadata } from "@/lib/seo";
import { landing as landingTexts } from "@/texts/pt-BR/landing";
import { nav as navTexts } from "@/texts/pt-BR/nav";
import { templateGallery as templateGalleryTexts } from "@/texts/pt-BR/template-gallery";

// The words people search for first, the brand after (the layout's default puts the brand first).
// Link previews keep the headline, which reads better in a chat than a search title.
export const metadata: Metadata = pageMetadata({
  title: landingTexts.metaTitle,
  shareTitle: landingTexts.headline,
  description: landingTexts.metaDescription,
  path: "/",
});

const t = landingTexts;
const FEATURE_ICONS: readonly LucideIcon[] = [
  ShieldCheck,
  Printer,
  WifiOff,
  Send,
  Users,
  XCircle,
  BarChart3,
  LayoutTemplate,
  MousePointerClick,
];
const STEP_ICONS: readonly LucideIcon[] = [FileText, Ticket, Printer, Smartphone];
const PLATFORM_ICONS: Record<string, LucideIcon> = {
  sell: Store,
  deliver: Send,
  door: DoorOpen,
  after: PartyPopper,
  seller: Smartphone,
  pix: QrCode,
  page: Globe,
  team: UserCog,
  wallet: Wallet,
  categories: Tags,
  papers: Scissors,
  tokens: Coins,
  days: ListChecks,
  capacity: UsersRound,
  badges: IdCard,
  guests: Users,
  certificates: Award,
  accountability: FileSpreadsheet,
  summary: ImageIcon,
  live: Activity,
};
// One colour per moment, from the semantic tokens (both themes).
const PLATFORM_TONES = [
  "bg-brand-soft text-brand-soft-fg",
  "bg-success-soft text-success-fg",
  "bg-warning-soft text-warning-fg",
  "bg-brand-soft text-brand-soft-fg",
] as const;

export default async function LandingPage() {
  const pricing = await fetchPricing();
  return (
    <div className="flex min-h-dvh flex-col">
      <JsonLd
        data={homeJsonLd({
          title: landingTexts.metaTitle,
          description: landingTexts.metaDescription,
          faq: t.faq.map((item) => ({ question: item.q, answer: item.a })),
          pricing,
        })}
      />
      <SiteHeader />
      <main id="conteudo" className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden bg-glow">
          <div aria-hidden className="absolute inset-0 bg-dots [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)] opacity-60" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pt-14 pb-20 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-24 lg:pb-28">
            <div className="flex flex-col items-start gap-6">
              <span className="inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand-soft px-3 py-1 text-[13px] font-medium text-brand-soft-fg">
                <span className="size-1.5 rounded-full bg-brand" />
                {t.eyebrow}
              </span>
              <h1 className="text-4xl leading-[1.05] font-semibold tracking-tight text-balance text-fg sm:text-5xl lg:text-6xl">
                {t.headline}
              </h1>
              <p className="max-w-xl text-lg leading-relaxed text-pretty text-fg-muted sm:text-xl">{t.lead}</p>
              <div id="comecar" className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                <ButtonLink href="/entrar" size="lg" icon={<ArrowRight />} className="flex-row-reverse">
                  {t.primaryCta}
                </ButtonLink>
                <ButtonLink href="#como-funciona" size="lg" variant="secondary">
                  {t.secondaryCta}
                </ButtonLink>
              </div>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-2 pt-2 sm:flex sm:flex-wrap sm:gap-x-5">
                {t.trust.map((item) => (
                  <li key={item} className="flex items-start gap-1.5 text-sm leading-snug text-fg-muted">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            {/* Illustrations of what the text says: decorative for screen readers. */}
            <div aria-hidden className="relative mx-auto h-[340px] w-full max-w-[460px] sm:h-[440px]">
              <div className="absolute inset-0 origin-top scale-[0.78] sm:scale-100">
                <div className="absolute top-6 left-0 -rotate-6 animate-rise sm:left-2">
                  <TicketMock />
                </div>
                <div className="absolute right-0 bottom-0 rotate-3 animate-rise [animation-delay:150ms] sm:right-2">
                  <PhoneMock />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Audience */}
        <section className="border-y border-border bg-surface">
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-5 px-4 py-10 sm:px-6">
            <p className="text-sm font-medium text-fg-subtle">{t.audienceTitle}</p>
            {/* Each kind of event links to its own page: the words people search for, one tap away. */}
            <ul className="flex flex-wrap justify-center gap-2.5">
              {t.audience.map((item) => (
                <li key={item.slug}>
                  <Link
                    href={`/ingresso-para/${item.slug}`}
                    className="inline-flex min-h-9 items-center rounded-full border border-border bg-bg px-4 text-sm font-medium text-fg-muted transition hover:border-brand/40 hover:text-fg active:bg-surface-2 pointer-coarse:min-h-11"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
            <Link
              href="/ingresso-para"
              className="relative inline-flex items-center gap-1.5 text-sm font-semibold text-brand-soft-fg touch-target hover:underline"
            >
              {t.audienceMore}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </section>

        {/* How it works */}
        <section id="como-funciona">
          <div className="mx-auto flex max-w-6xl flex-col gap-14 px-4 py-20 sm:px-6 lg:py-28">
            <SectionHeading eyebrow={t.stepsTitle} title={t.stepsLead} />
            {/* Phones: icon beside the text, so the four steps fit in about a screen. */}
            <ol className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
              {t.steps.map((step, index) => {
                const Icon = STEP_ICONS[index] ?? FileText;
                return (
                  <li
                    key={step.title}
                    className="relative flex gap-4 rounded-3xl border border-border bg-surface p-5 shadow-xs sm:flex-col sm:p-6"
                  >
                    <div className="flex shrink-0 flex-col items-center gap-2 sm:flex-row sm:justify-between">
                      <span className="flex size-11 items-center justify-center rounded-2xl bg-brand-solid text-brand-fg shadow-sm shadow-brand/30">
                        <Icon className="size-5" aria-hidden />
                      </span>
                      <span aria-hidden className="font-mono text-sm font-semibold text-fg-subtle">
                        0{index + 1}
                      </span>
                    </div>
                    <div className="flex min-w-0 flex-col gap-1.5 sm:gap-4">
                      <h3 className="text-lg font-semibold tracking-tight text-fg">{step.title}</h3>
                      <p className="text-[15px] leading-relaxed text-fg-muted">{step.body}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        {/* Use cases */}
        <section id="exemplos" className="defer-render border-t border-border bg-surface">
          <div className="mx-auto flex max-w-6xl flex-col gap-12 px-4 py-20 sm:px-6 lg:py-28">
            <SectionHeading eyebrow={t.cases.eyebrow} title={t.cases.title} lead={t.cases.lead} />
            <UseCases initial={pricing} />
          </div>
        </section>

        {/* Templates */}
        <section id="modelos" className="defer-render overflow-hidden border-y border-border bg-bg">
          <div className="flex flex-col gap-12 py-20 lg:py-28">
            <div className="px-4 sm:px-6">
              <SectionHeading eyebrow={navTexts.templates} title={t.templatesTitle} lead={t.templatesLead} />
            </div>
            <TemplateShowcase />
            <div className="flex flex-col justify-center gap-3 px-4 sm:flex-row">
              <ButtonLink href="/entrar" size="lg" icon={<ArrowRight />} className="flex-row-reverse">
                {t.templatesCta}
              </ButtonLink>
              <ButtonLink href="/modelos" size="lg" variant="secondary">
                {templateGalleryTexts.all}
              </ButtonLink>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="recursos" className="bg-surface">
          <div className="mx-auto flex max-w-6xl flex-col gap-14 px-4 py-20 sm:px-6 lg:py-28">
            <SectionHeading title={t.featuresTitle} lead={t.featuresLead} />
            <ul className="grid gap-px overflow-hidden rounded-3xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
              {t.features.map((feature, index) => {
                const Icon = FEATURE_ICONS[index] ?? ShieldCheck;
                return (
                  <li key={feature.title} className="flex gap-4 bg-surface p-5 sm:flex-col sm:gap-3 sm:p-7">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-soft-fg">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <div className="flex min-w-0 flex-col gap-1 sm:gap-3">
                      <h3 className="text-base font-semibold text-fg">{feature.title}</h3>
                      <p className="text-[15px] leading-relaxed text-fg-muted">{feature.body}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* Everything around the ticket, by moment */}
        <section id="evento-inteiro" className="defer-render border-t border-border bg-bg">
          <div className="mx-auto flex max-w-6xl flex-col gap-12 px-4 py-20 sm:px-6 lg:py-28">
            <SectionHeading eyebrow={t.platform.eyebrow} title={t.platform.title} lead={t.platform.lead} />
            <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
              {t.platform.groups.map((group, index) => {
                const GroupIcon = PLATFORM_ICONS[group.key] ?? Ticket;
                const tone = PLATFORM_TONES[index] ?? PLATFORM_TONES[0];
                return (
                  <article
                    key={group.key}
                    aria-labelledby={`grupo-${group.key}`}
                    className="flex flex-col gap-5 rounded-3xl border border-border bg-surface p-5 shadow-xs sm:p-7"
                  >
                    <header className="flex items-center gap-3">
                      <span className={`flex size-11 shrink-0 items-center justify-center rounded-2xl ${tone}`}>
                        <GroupIcon className="size-5" aria-hidden />
                      </span>
                      <div className="flex min-w-0 flex-col">
                        <h3 id={`grupo-${group.key}`} className="text-lg font-semibold tracking-tight text-fg">
                          {group.title}
                        </h3>
                        <p className="text-sm text-fg-muted">{group.lead}</p>
                      </div>
                    </header>
                    <ul className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                      {group.items.map((item) => {
                        const Icon = PLATFORM_ICONS[item.key] ?? Check;
                        return (
                          <li key={item.key} className="flex gap-3">
                            <Icon className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
                            <div className="flex min-w-0 flex-col gap-1">
                              <h4 className="text-[15px] font-semibold text-fg">{item.title}</h4>
                              <p className="text-sm leading-relaxed text-fg-muted">{item.body}</p>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </article>
                );
              })}
            </div>
            {/* Phones already have the bar at the bottom (MobileCta). */}
            <div className="flex justify-center max-sm:hidden">
              <ButtonLink href="/entrar" size="lg" icon={<ArrowRight />} className="flex-row-reverse">
                {t.primaryCta}
              </ButtonLink>
            </div>
          </div>
        </section>

        {/* Digital tickets */}
        <section id="no-celular" className="defer-render overflow-x-clip border-t border-border bg-surface">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:py-28">
            <div aria-hidden className="order-2 flex justify-center lg:order-1">
              <div className="relative">
                <div aria-hidden className="absolute -inset-10 rounded-full bg-brand/15 blur-3xl" />
                <DigitalTicketMock className="relative -rotate-2" />
                <span className="absolute top-28 -right-12 flex items-center gap-2 rounded-2xl bg-success-solid px-3.5 py-2 text-sm font-semibold text-white shadow-lg animate-pop [animation-delay:300ms] max-sm:-right-4">
                  <MessageCircle className="size-4" aria-hidden />
                  WhatsApp
                </span>
              </div>
            </div>
            <div className="order-1 flex flex-col gap-6 lg:order-2">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-brand-soft-fg">
                <Smartphone className="size-6" aria-hidden />
              </span>
              <h2 className="text-3xl font-semibold tracking-tight text-balance text-fg sm:text-4xl">{t.digitalTitle}</h2>
              <p className="text-lg leading-relaxed text-pretty text-fg-muted">{t.digitalBody}</p>
              <ul className="flex flex-col gap-3">
                {t.digitalPoints.map((point) => (
                  <li key={point} className="flex items-center gap-3 text-[15px] text-fg">
                    <Check className="size-5 shrink-0 text-success" aria-hidden />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Offline door */}
        <section className="relative overflow-hidden bg-[#0e0d14] text-white dark:border-y dark:border-border dark:bg-surface">
          <div aria-hidden className="absolute -top-40 -right-40 size-[36rem] rounded-full bg-[#5b3df5]/40 blur-3xl" />
          <div aria-hidden className="absolute -bottom-40 -left-20 size-[28rem] rounded-full bg-[#16a34a]/20 blur-3xl" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:py-28">
            <div className="flex flex-col gap-6">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
                <WifiOff className="size-6" aria-hidden />
              </span>
              <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{t.offlineTitle}</h2>
              <p className="text-lg leading-relaxed text-white/70">{t.offlineBody}</p>
              <ul className="flex flex-col gap-3">
                {t.offlinePoints.map((point) => (
                  <li key={point} className="flex items-center gap-3 text-[15px] text-white/90">
                    <Check className="size-5 text-[#4ade80]" aria-hidden />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
            <div aria-hidden className="flex justify-center max-lg:hidden lg:justify-end">
              <PhoneMock className="rotate-2" />
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="precos" className="defer-render">
          <div className="mx-auto flex max-w-5xl flex-col gap-12 px-4 py-20 sm:px-6 lg:py-28">
            <SectionHeading eyebrow={navTexts.pricing} title={t.pricingTitle} lead={t.pricingLead} />
            <PricingSection initial={pricing} />
          </div>
        </section>

        {/* FAQ */}
        <section id="duvidas" className="border-t border-border bg-surface">
          <div className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-20 sm:px-6 lg:py-28">
            <SectionHeading title={t.faqTitle} />
            <FaqList items={t.faq.map((item) => ({ question: item.q, answer: item.a }))} />
          </div>
        </section>

        <FinalCta title={t.finalTitle} />
      </main>

      <SiteFooter />
      <MobileCta />
    </div>
  );
}
