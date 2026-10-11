import { ArrowRight } from "lucide-react";

import { ButtonLink } from "@/components/ui";
import { texts } from "@/texts/pt-BR";

/** The closing call to action of a public page: a brand panel with the sign-up button. */
export function FinalCta({ title, body = texts.landing.finalBody }: { title: string; body?: string }) {
  return (
    <section id="criar" className="px-4 py-20 sm:px-6">
      <div className="relative mx-auto flex max-w-5xl flex-col items-center gap-6 overflow-hidden rounded-[2rem] bg-brand-solid px-6 py-16 text-center text-white shadow-lg shadow-brand/30">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(60%_80%_at_50%_0%,rgba(255,255,255,0.25),transparent)]" />
        <h2 className="relative max-w-2xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h2>
        <p className="relative max-w-xl text-lg text-white/80">{body}</p>
        <ButtonLink href="/entrar" size="lg" variant="inverse" icon={<ArrowRight />} className="relative flex-row-reverse">
          {texts.landing.primaryCta}
        </ButtonLink>
      </div>
    </section>
  );
}
