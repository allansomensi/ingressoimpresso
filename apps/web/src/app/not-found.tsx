import type { Metadata } from "next";
import { ArrowLeft, SearchX } from "lucide-react";

import { Logo } from "@/components/brand";
import { ButtonLink } from "@/components/ui";
import { texts } from "@/texts/pt-BR";

const t = texts.notFound;

export const metadata: Metadata = { title: t.title, robots: { index: false, follow: false } };

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col bg-glow px-4 py-6">
      <Logo />
      <div className="m-auto flex max-w-md flex-col items-center gap-5 py-16 text-center animate-rise">
        <span className="flex size-16 items-center justify-center rounded-3xl bg-brand-soft text-brand-soft-fg">
          <SearchX className="size-8" aria-hidden />
        </span>
        <p className="font-mono text-sm font-semibold text-brand">404</p>
        <h1 className="text-2xl font-semibold tracking-tight text-fg">{t.title}</h1>
        <p className="leading-relaxed text-fg-muted">{t.body}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <ButtonLink href="/" icon={<ArrowLeft />}>
            {t.home}
          </ButtonLink>
          <ButtonLink href="/painel" variant="secondary">
            {t.panel}
          </ButtonLink>
        </div>
      </div>
    </main>
  );
}
