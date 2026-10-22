"use client";

import type { UnsubscribeDto } from "@ingressoimpresso/api-types";
import { useMutation } from "@tanstack/react-query";
import { BellOff, BellRing, Link2Off } from "lucide-react";
import { useEffect, useRef } from "react";

import { Logo } from "@/components/brand";
import { Button, ButtonLink, Card, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { unsubscribe as unsubscribeTexts } from "@/texts/pt-BR/unsubscribe";

const t = unsubscribeTexts;

/**
 * The link of an announcement e-mail (ADR 0107) or of a reminder (ADR 0118): the token comes in
 * the fragment, never in the server's logs; opening the page stops those e-mails, and one tap
 * brings them back.
 */
export function Unsubscribe() {
  // Kept for the button that undoes it; the address bar no longer has it.
  const token = useRef("");
  const change = useMutation({
    mutationFn: (subscribed: boolean) =>
      api<UnsubscribeDto>("/api/email/unsubscribe", {
        method: "POST",
        body: { token: token.current, subscribed },
      }),
  });
  const { mutate } = change;

  useEffect(() => {
    // Read once: a second run of the effect (development) finds the address already clean.
    if (token.current === "") {
      token.current = window.location.hash.slice(1).trim();
    }
    // Out of the address bar: a shared screenshot or link does not carry it.
    window.history.replaceState(null, "", window.location.pathname);
    // A link without a token is refused by the server like a made-up one.
    mutate(false);
  }, [mutate]);

  const invalid = change.isError;
  const result = change.data;
  return (
    <div className="flex w-full max-w-md flex-col items-center gap-6">
      <Logo />
      <Card className="flex w-full flex-col items-center gap-4 text-center">
        {invalid ? (
          <>
            <span className="flex size-12 items-center justify-center rounded-2xl bg-danger-soft text-danger-fg">
              <Link2Off className="size-6" aria-hidden />
            </span>
            <h1 className="text-xl font-semibold text-fg">{t.invalidTitle}</h1>
            <p className="text-sm text-fg-muted">{t.invalidBody}</p>
            <ButtonLink href="/painel/conta" variant="secondary">
              {t.account}
            </ButtonLink>
          </>
        ) : result === undefined ? (
          <div
            className="flex items-center gap-2 py-6 text-sm text-fg-muted"
            role="status"
          >
            <Spinner />
            {t.working}
          </div>
        ) : result.subscribed ? (
          <>
            <span className="flex size-12 items-center justify-center rounded-2xl bg-success-soft text-success-fg">
              <BellRing className="size-6" aria-hidden />
            </span>
            <h1 className="text-xl font-semibold text-fg">{(result.reminders ? t.reminders : t.announcements).backTitle}</h1>
            <p className="text-sm text-fg-muted">{(result.reminders ? t.reminders : t.announcements).backBody(result.email)}</p>
            <Button
              variant="ghost"
              loading={change.isPending}
              onClick={() => {
                change.mutate(false);
              }}
            >
              {t.stopAgain}
            </Button>
          </>
        ) : (
          <>
            <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-brand-soft-fg">
              <BellOff className="size-6" aria-hidden />
            </span>
            <h1 className="text-xl font-semibold text-fg">{(result.reminders ? t.reminders : t.announcements).doneTitle}</h1>
            <p className="text-sm text-fg-muted">{(result.reminders ? t.reminders : t.announcements).doneBody(result.email)}</p>
            <Button
              variant="secondary"
              loading={change.isPending}
              onClick={() => {
                change.mutate(true);
              }}
            >
              {t.undo}
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}
