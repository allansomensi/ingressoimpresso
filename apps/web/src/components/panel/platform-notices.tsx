"use client";

import type { MaintenanceDto } from "@ingressoimpresso/api-types";
import { useQueryClient } from "@tanstack/react-query";
import { Activity, ArrowRight, LogOut, Wrench } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { LogoMark } from "@/components/brand";
import { Button, ButtonLink, Dialog } from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { shortDateTime } from "@/lib/format";
import { safeLink, useInbox } from "@/lib/platform";
import { texts } from "@/texts/pt-BR";

import { LEVEL_ICON, LEVEL_TONE } from "./inbox";

const t = texts.maintenance;

/** Announcements shown as a dialog when the panel opens (ADR 0038), one at a time. */
export function AnnouncementHost() {
  const client = useQueryClient();
  const inbox = useInbox(true);
  // Closed in this visit, before the server answers.
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
  const next = (inbox.data?.announcements ?? [])
    .filter((item) => item.display === "modal" && !item.dismissed && !closed.has(item.id))
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))[0];
  if (next === undefined) {
    return null;
  }
  const Icon = LEVEL_ICON[next.level];
  const href = safeLink(next.ctaUrl);
  const close = () => {
    setClosed((previous) => new Set(previous).add(next.id));
    void api<undefined>(`/api/announcements/${next.id}/dismiss`, { method: "POST" })
      .then(() => client.invalidateQueries({ queryKey: ["inbox"] }))
      .catch(() => undefined);
  };
  return (
    <Dialog
      open
      onClose={close}
      size="sm"
      title={
        <span className="flex items-center gap-3">
          <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", LEVEL_TONE[next.level])}>
            <Icon className="size-[18px]" aria-hidden />
          </span>
          {next.title}
        </span>
      }
      footer={
        <>
          {href !== null && next.ctaLabel !== null && (
            <ButtonLink href={href} variant="secondary" onClick={close}>
              {next.ctaLabel}
            </ButtonLink>
          )}
          <Button onClick={close}>{texts.inbox.gotIt}</Button>
        </>
      }
    >
      <p className="text-[15px] leading-relaxed whitespace-pre-line text-fg-muted">{next.body}</p>
    </Dialog>
  );
}

/** A strip under the header: maintenance for organizers (read-only), a reminder for admins. */
export function MaintenanceBanner({ maintenance, isAdmin }: { maintenance: MaintenanceDto; isAdmin: boolean }) {
  if (maintenance.mode === "off" || (!isAdmin && maintenance.mode === "full")) {
    return null;
  }
  return (
    <div
      role="status"
      className={cn(
        "border-b",
        isAdmin ? "border-brand/20 bg-brand-soft text-brand-soft-fg" : "border-warning/30 bg-warning-soft text-warning-fg",
      )}
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm sm:px-6">
        <Wrench className="size-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">
          {isAdmin ? t.adminBanner(t.modes[maintenance.mode]) : (maintenance.message ?? t.readOnlyBanner)}
          {!isAdmin && maintenance.endsAt !== null && <span className="opacity-80"> {t.expected(shortDateTime(maintenance.endsAt))}</span>}
        </span>
        {isAdmin && (
          <Link href="/painel/admin?aba=plataforma" className="font-semibold underline-offset-2 hover:underline">
            {t.manage}
          </Link>
        )}
      </div>
    </div>
  );
}

/** Instead of the panel, during full maintenance (admins still get in). */
export function MaintenanceScreen({ maintenance, onSignOut }: { maintenance: MaintenanceDto; onSignOut: () => void }) {
  return (
    <main className="mx-auto flex max-w-md flex-col items-center gap-6 py-16 text-center animate-rise">
      <span className="relative flex size-20 items-center justify-center rounded-3xl bg-brand-soft">
        <LogoMark className="size-11" />
        <span className="absolute -right-2 -bottom-2 flex size-9 items-center justify-center rounded-2xl bg-warning-soft text-warning-fg ring-4 ring-bg">
          <Wrench className="size-[18px]" aria-hidden />
        </span>
      </span>
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">{t.screenTitle}</h1>
        <p className="text-[15px] leading-relaxed text-fg-muted">{maintenance.message ?? t.screenBody}</p>
        {maintenance.endsAt !== null && (
          <p className="text-sm font-medium text-fg">{t.expected(shortDateTime(maintenance.endsAt))}</p>
        )}
        <p className="text-sm text-fg-subtle">{t.doorWorks}</p>
      </div>
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
        <ButtonLink href="/status" variant="secondary" icon={<Activity />}>
          {t.statusLink}
          <ArrowRight className="size-4" aria-hidden />
        </ButtonLink>
        <Button variant="ghost" icon={<LogOut />} onClick={onSignOut}>
          {texts.panel.signOut}
        </Button>
      </div>
    </main>
  );
}
