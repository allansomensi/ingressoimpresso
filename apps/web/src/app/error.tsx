"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { useEffect } from "react";

import { Button, ButtonLink } from "@/components/ui";
import { texts } from "@/texts/pt-BR";

const t = texts.crash;

/** Unexpected error inside a page: the layout stays, the page offers a retry. */
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-[60dvh] flex-col items-center justify-center gap-5 px-4 py-16 text-center">
      <span className="flex size-16 items-center justify-center rounded-3xl bg-danger-soft text-danger-fg">
        <AlertTriangle className="size-8" aria-hidden />
      </span>
      <h1 className="text-2xl font-semibold tracking-tight text-fg">{t.title}</h1>
      <p className="max-w-md leading-relaxed text-fg-muted">{t.body}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button icon={<RefreshCw />} onClick={reset}>
          {texts.common.retry}
        </Button>
        <ButtonLink href="/" variant="secondary">
          {texts.notFound.home}
        </ButtonLink>
      </div>
    </main>
  );
}
