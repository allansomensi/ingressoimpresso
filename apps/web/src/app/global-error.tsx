"use client";

import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";

import { THEME_SCRIPT } from "@/lib/theme-script";
import { common as commonTexts } from "@/texts/pt-BR/common";
import { crash as crashTexts } from "@/texts/pt-BR/crash";
import { meta as metaTexts } from "@/texts/pt-BR/meta";
import { notFound as notFoundTexts } from "@/texts/pt-BR/not-found";

import "./globals.css";

const t = crashTexts;

/**
 * Error in the root layout itself: renders its own document, with no providers. It still looks
 * like the site (theme, type) and gives two ways out: try again, or the home page.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="pt-BR" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <title>{`${t.title} · ${metaTexts.title}`}</title>
        <meta name="robots" content="noindex" />
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-bg px-4 text-center font-sans text-fg antialiased">
        <main role="alert" className="flex max-w-md flex-col items-center gap-5">
          <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
          <p className="leading-relaxed text-fg-muted">{t.body}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={reset}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-solid px-5 text-sm font-semibold text-brand-fg shadow-sm transition hover:bg-brand-solid/90 active:bg-brand-solid/85"
            >
              {commonTexts.retry}
            </button>
            {/* A plain link on purpose: the router itself may be what broke, and a full load of the home page is the way out. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border-strong bg-surface px-5 text-sm font-semibold text-fg shadow-xs transition hover:bg-surface-2 active:bg-surface-3"
            >
              {notFoundTexts.home}
            </a>
          </div>
          {error.digest !== undefined && <p className="font-mono text-xs text-fg-subtle">{t.reference(error.digest)}</p>}
        </main>
      </body>
    </html>
  );
}
