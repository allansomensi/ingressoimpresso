import { Activity, ArrowRight, FileText, HeartHandshake, Mail, Scale, ShieldCheck, Sparkles, WifiOff, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { TicketMock } from "@/components/marketing/mockups";
import { ButtonLink } from "@/components/ui";
import { LEGAL_ENTITY } from "@/content/legal";
import { APP_COMMIT, RELEASE_NOTES_HREF, VERSION_LABEL } from "@/lib/version";
import { texts } from "@/texts/pt-BR";

const t = texts.about;
const PRINCIPLE_ICONS: readonly LucideIcon[] = [ShieldCheck, WifiOff, Scale, HeartHandshake];

const linkClass = "inline-flex items-center gap-1.5 text-sm font-medium text-brand transition hover:text-brand-hover";

/** What the product is for, what it stands for, who makes it, and the version of the site (ADR 0051). */
export function AboutPage() {
  return (
    <>
      <section className="relative overflow-hidden bg-glow">
        <div aria-hidden className="absolute inset-0 bg-dots [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)] opacity-50" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pt-14 pb-16 sm:px-6 lg:grid-cols-[1.25fr_1fr] lg:pt-20 lg:pb-24">
          <div className="flex flex-col items-start gap-5 animate-rise">
            <span className="text-sm font-semibold tracking-wide text-brand uppercase">{t.eyebrow}</span>
            <h1 className="text-4xl leading-[1.08] font-semibold tracking-tight text-balance text-fg sm:text-5xl">{t.headline}</h1>
            <p className="max-w-xl text-lg leading-relaxed text-pretty text-fg-muted">{t.lead}</p>
          </div>
          <div className="hidden justify-center lg:flex">
            <TicketMock className="rotate-3 animate-rise [animation-delay:120ms]" />
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-surface">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_1.4fr] lg:py-20">
          <h2 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">{t.storyTitle}</h2>
          <div className="flex flex-col gap-4">
            {t.story.map((paragraph) => (
              <p key={paragraph} className="text-[17px] leading-relaxed text-pretty text-fg-muted">
                {paragraph}
              </p>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-16 sm:px-6 lg:py-20">
        <h2 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">{t.principlesTitle}</h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {t.principles.map((principle, index) => {
            const Icon = PRINCIPLE_ICONS[index] ?? Sparkles;
            return (
              <li key={principle.title} className="flex flex-col gap-3 rounded-3xl border border-border bg-surface p-6 shadow-xs">
                <span className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand-soft-fg">
                  <Icon aria-hidden className="size-5" />
                </span>
                <h3 className="text-base font-semibold text-fg">{principle.title}</h3>
                <p className="text-[15px] leading-relaxed text-fg-muted">{principle.body}</p>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-16 sm:px-6 md:grid-cols-2 lg:pb-20">
        <div id="versao" className="flex scroll-mt-20 flex-col gap-4 rounded-3xl border border-border bg-surface p-6 shadow-xs sm:p-8">
          <span className="flex size-10 items-center justify-center rounded-xl bg-surface-2 text-fg-muted">
            <Sparkles aria-hidden className="size-5" />
          </span>
          <h2 className="text-lg font-semibold tracking-tight text-fg">{t.versionTitle}</h2>
          <p className="text-[15px] text-fg" title={APP_COMMIT === "" ? undefined : APP_COMMIT}>
            {t.versionValue(VERSION_LABEL)}
          </p>
          <p className="text-[15px] leading-relaxed text-fg-muted">{t.versionBody}</p>
          <div className="mt-auto flex flex-wrap gap-x-6 gap-y-2 pt-2">
            <Link href={RELEASE_NOTES_HREF} className={linkClass}>
              <FileText aria-hidden className="size-4" />
              {t.releaseNotes}
            </Link>
            <Link href="/status" className={linkClass}>
              <Activity aria-hidden className="size-4" />
              {t.status}
            </Link>
          </div>
        </div>
        <div className="flex flex-col gap-4 rounded-3xl border border-border bg-surface p-6 shadow-xs sm:p-8">
          <span className="flex size-10 items-center justify-center rounded-xl bg-surface-2 text-fg-muted">
            <HeartHandshake aria-hidden className="size-5" />
          </span>
          <h2 className="text-lg font-semibold tracking-tight text-fg">{t.makerTitle}</h2>
          <p className="text-[15px] leading-relaxed text-fg-muted">{t.makerBody(LEGAL_ENTITY.name, LEGAL_ENTITY.kind)}</p>
          <div className="mt-auto flex flex-wrap gap-x-6 gap-y-2 pt-2">
            <a href={`mailto:${LEGAL_ENTITY.email}`} className={linkClass}>
              <Mail aria-hidden className="size-4" />
              {t.contact}
            </a>
            <Link href="/termos" className={linkClass}>
              <Scale aria-hidden className="size-4" />
              {t.legal}
            </Link>
          </div>
        </div>
      </section>

      <section className="px-4 pb-20 sm:px-6">
        <div className="relative mx-auto flex max-w-5xl flex-col items-center gap-5 overflow-hidden rounded-[2rem] bg-brand-solid px-6 py-14 text-center text-white shadow-lg shadow-brand/30">
          <div aria-hidden className="absolute inset-0 bg-[radial-gradient(60%_80%_at_50%_0%,rgba(255,255,255,0.25),transparent)]" />
          <h2 className="relative max-w-2xl text-3xl font-semibold tracking-tight text-balance">{t.ctaTitle}</h2>
          <p className="relative max-w-xl text-lg text-white/80">{t.ctaBody}</p>
          <ButtonLink href="/entrar" size="lg" variant="inverse" icon={<ArrowRight />} className="relative flex-row-reverse">
            {texts.landing.primaryCta}
          </ButtonLink>
        </div>
      </section>
    </>
  );
}
