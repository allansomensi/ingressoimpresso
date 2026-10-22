"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { useEffect, useRef } from "react";

import { Button, ButtonLink } from "@/components/ui";
import { common as commonTexts } from "@/texts/pt-BR/common";
import { crash as crashTexts } from "@/texts/pt-BR/crash";
import { notFound as notFoundTexts } from "@/texts/pt-BR/not-found";

const t = crashTexts;

/**
 * Unexpected error inside a page: the root layout stays, the page offers a retry. The message is
 * announced and focused (the content it replaced may have had the focus), with the reference
 * the logs carry, for whoever writes to support.
 */
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    console.error(error);
    heading.current?.focus({ preventScroll: true });
  }, [error]);

  return (
    <main role="alert" className="flex min-h-[60dvh] flex-col items-center justify-center gap-5 px-4 py-16 text-center">
      <span className="flex size-16 items-center justify-center rounded-3xl bg-danger-soft text-danger-fg">
        <AlertTriangle className="size-8" aria-hidden />
      </span>
      <h1 ref={heading} tabIndex={-1} className="text-2xl font-semibold tracking-tight text-fg outline-none">
        {t.title}
      </h1>
      <p className="max-w-md leading-relaxed text-fg-muted">{t.body}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button icon={<RefreshCw />} onClick={reset}>
          {commonTexts.retry}
        </Button>
        <ButtonLink href="/" variant="secondary">
          {notFoundTexts.home}
        </ButtonLink>
      </div>
      {error.digest !== undefined && <p className="font-mono text-xs text-fg-subtle">{t.reference(error.digest)}</p>}
    </main>
  );
}
