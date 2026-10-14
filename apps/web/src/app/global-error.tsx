"use client";

import { common as commonTexts, crash as crashTexts } from "@/texts/pt-BR";

import "./globals.css";

const t = crashTexts;

/** Error in the root layout itself: renders its own document, with no providers. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="pt-BR">
      <body className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-bg px-4 text-center font-sans text-fg">
        <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
        <p className="max-w-md leading-relaxed text-fg-muted">{t.body}</p>
        <button
          type="button"
          onClick={reset}
          className="rounded-xl bg-brand-solid px-5 py-2.5 text-sm font-semibold text-brand-fg"
        >
          {commonTexts.retry}
        </button>
      </body>
    </html>
  );
}
