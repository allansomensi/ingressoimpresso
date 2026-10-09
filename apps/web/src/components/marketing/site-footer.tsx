import { ArrowRight, Mail } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/brand";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { ButtonLink } from "@/components/ui";
import { LEGAL_ENTITY } from "@/content/legal";
import { texts } from "@/texts/pt-BR";

const t = texts.footer;

const COLUMNS = [
  {
    title: t.product,
    links: [
      { href: "/#como-funciona", label: t.howItWorks },
      { href: "/#modelos", label: t.templates },
      { href: "/#precos", label: t.pricing },
      { href: "/#duvidas", label: t.faq },
      { href: "/novidades", label: t.news },
      { href: "/status", label: t.status },
    ],
  },
  {
    title: t.legal,
    links: [
      { href: "/termos", label: t.terms },
      { href: "/privacidade", label: t.privacy },
      { href: "/reembolso", label: t.refund },
    ],
  },
] as const;

/**
 * Footer of the public pages: navigation, legal documents, the provider's identification
 * (Decreto 7.962/2013) and, tucked away at the bottom, the theme switcher (the site follows the
 * system theme by default).
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
        <div className="flex flex-col items-start gap-4">
          <Logo />
          <p className="max-w-xs text-sm leading-relaxed text-fg-muted">{t.tagline}</p>
          <ButtonLink href="/entrar" size="sm" icon={<ArrowRight />} className="flex-row-reverse">
            {t.cta}
          </ButtonLink>
        </div>
        {COLUMNS.map((column) => (
          <nav key={column.title} aria-label={column.title} className="flex flex-col gap-3">
            <h2 className="text-xs font-semibold tracking-wide text-fg-subtle uppercase">{column.title}</h2>
            <ul className="flex flex-col gap-2">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-fg-muted transition hover:text-fg">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
        <div className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold tracking-wide text-fg-subtle uppercase">{t.contact}</h2>
          <p className="text-sm leading-relaxed text-fg-muted">{t.contactBody}</p>
          <a
            href={`mailto:${LEGAL_ENTITY.email}`}
            className="inline-flex w-fit items-center gap-2 text-sm font-medium text-brand transition hover:text-brand-hover"
          >
            <Mail className="size-4" aria-hidden />
            {LEGAL_ENTITY.email}
          </a>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-5 text-xs text-fg-subtle sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="flex flex-wrap gap-x-3 gap-y-1">
            <span>{t.rights(new Date().getFullYear())}</span>
            <span>{t.provider(LEGAL_ENTITY.name, LEGAL_ENTITY.document)}</span>
          </p>
          <div className="flex items-center gap-2 opacity-70 transition hover:opacity-100 focus-within:opacity-100">
            <span>{t.theme}</span>
            <ThemeSwitcher />
          </div>
        </div>
      </div>
    </footer>
  );
}
