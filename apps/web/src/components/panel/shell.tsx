"use client";

import { BarChart3, CalendarDays, LifeBuoy, LogOut, Megaphone, RefreshCw, ShieldAlert, ShieldCheck, UserRound, WifiOff } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";

import { Logo } from "@/components/brand";
import { InstallButton } from "@/components/install-button";
import { WhatsNew } from "@/components/panel/whats-new";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Badge, Button, EmptyState, Popover, Skeleton, errorMessage, useConfirm } from "@/components/ui";
import { cn } from "@/lib/cn";
import { LEGAL_ENTITY } from "@/content/legal";
import { initials } from "@/lib/format";
import { useRequiredSession, useSession } from "@/lib/session";
import { hasUnsavedChanges } from "@/lib/unsaved";
import { texts } from "@/texts/pt-BR";

const t = texts.panel;

function UserMenu({ email, isAdmin, onSignOut }: { email: string; isAdmin: boolean; onSignOut: () => void }) {
  return (
    <Popover
      label={t.account}
      triggerClassName="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-soft-fg text-[13px] font-semibold text-brand-fg shadow-sm ring-2 ring-surface transition hover:opacity-90 dark:to-brand-hover"
      trigger={initials(email.split("@")[0] ?? email) || "?"}
      panelClassName="w-72"
    >
      <div className="flex flex-col gap-1 px-3 py-2.5">
        <span className="text-xs text-fg-muted">{t.account}</span>
        <span className="truncate text-sm font-medium text-fg">{email}</span>
        {isAdmin && (
          <Badge tone="brand" className="mt-1 w-fit">
            <ShieldCheck className="size-3" aria-hidden />
            {t.admin}
          </Badge>
        )}
      </div>
      <div className="my-1 h-px bg-border" />
      <Link
        href="/painel/conta"
        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-fg-muted transition hover:bg-surface-2 hover:text-fg"
      >
        <UserRound className="size-4" aria-hidden />
        {t.accountPage}
      </Link>
      <Link
        href="/painel/resultados"
        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-fg-muted transition hover:bg-surface-2 hover:text-fg sm:hidden"
      >
        <BarChart3 className="size-4" aria-hidden />
        {t.results}
      </Link>
      <Link
        href="/novidades"
        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-fg-muted transition hover:bg-surface-2 hover:text-fg"
      >
        <Megaphone className="size-4" aria-hidden />
        {t.news}
      </Link>
      <a
        href={`mailto:${LEGAL_ENTITY.email}`}
        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-fg-muted transition hover:bg-surface-2 hover:text-fg"
      >
        <LifeBuoy className="size-4" aria-hidden />
        {t.support}
      </a>
      {isAdmin && (
        <Link
          href="/painel/admin"
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-fg-muted transition hover:bg-surface-2 hover:text-fg"
        >
          <ShieldCheck className="size-4" aria-hidden />
          {texts.admin.openPanel}
        </Link>
      )}
      <div className="my-1 h-px bg-border" />
      <div className="flex flex-col gap-2 px-3 py-2">
        <span className="text-xs text-fg-muted">{texts.theme.label}</span>
        <ThemeSwitcher labels className="flex w-full" />
      </div>
      <div className="my-1 h-px bg-border" />
      <button
        type="button"
        onClick={onSignOut}
        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-fg-muted transition hover:bg-surface-2 hover:text-fg"
      >
        <LogOut className="size-4" aria-hidden />
        {t.signOut}
      </button>
    </Popover>
  );
}

function PanelSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label={texts.common.loading}>
      <Skeleton className="h-9 w-56" />
      <Skeleton className="h-5 w-96 max-w-full" />
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <Skeleton key={item} className="h-40 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

export function PanelShell({ children }: { children: ReactNode }) {
  const session = useRequiredSession();
  const { signOut } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const confirm = useConfirm();

  // Links of the bar leave the page in-app (no beforeunload): ask first if the editor has changes.
  const guardLinks = (event: MouseEvent<HTMLElement>) => {
    const link = event.target instanceof Element ? event.target.closest("a[href^='/']") : null;
    if (link === null || !hasUnsavedChanges() || event.metaKey || event.ctrlKey) {
      return;
    }
    event.preventDefault();
    const href = link.getAttribute("href") ?? "/painel";
    void confirm({
      title: texts.event.design.leaveConfirmTitle,
      description: texts.event.design.leaveConfirmBody,
      confirmLabel: texts.event.design.leaveConfirm,
    }).then((ok) => {
      if (ok) {
        router.push(href);
      }
    });
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#conteudo"
        className="sr-only z-50 rounded-lg bg-brand-solid px-3 py-2 text-sm font-semibold text-brand-fg focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        {texts.common.skipToContent}
      </a>
      <header
        onClickCapture={guardLinks}
        className="sticky top-0 z-40 border-b border-border bg-bg/80 pt-[env(safe-area-inset-top)] backdrop-blur-xl"
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-6">
            <Logo href="/painel" />
            <nav className="hidden items-center gap-1 sm:flex" aria-label={t.events}>
              <Link
                href="/painel"
                aria-current={pathname === "/painel" ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition",
                  pathname === "/painel" || pathname.startsWith("/painel/eventos") ? "bg-surface-2 text-fg" : "text-fg-muted hover:text-fg",
                )}
              >
                <CalendarDays className="size-4" aria-hidden />
                {t.events}
              </Link>
              <Link
                href="/painel/resultados"
                aria-current={pathname === "/painel/resultados" ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition",
                  pathname.startsWith("/painel/resultados") ? "bg-surface-2 text-fg" : "text-fg-muted hover:text-fg",
                )}
              >
                <BarChart3 className="size-4" aria-hidden />
                {t.results}
              </Link>
              {session.status === "signed-in" && session.user.isAdmin && (
                <Link
                  href="/painel/admin"
                  aria-current={pathname === "/painel/admin" ? "page" : undefined}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition",
                    pathname.startsWith("/painel/admin") ? "bg-surface-2 text-fg" : "text-fg-muted hover:text-fg",
                  )}
                >
                  <ShieldCheck className="size-4" aria-hidden />
                  {texts.admin.nav}
                </Link>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-1.5">
            <InstallButton />
            {session.status === "signed-in" && <WhatsNew />}
            {session.status === "signed-in" ? (
              <UserMenu email={session.user.email} isAdmin={session.user.isAdmin} onSignOut={() => void signOut()} />
            ) : (
              <Skeleton className="size-9 rounded-full" />
            )}
          </div>
        </div>
      </header>
      {session.status === "signed-in" && session.user.suspended && (
        <div role="status" className="border-b border-danger/25 bg-danger-soft text-danger-fg">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm sm:px-6">
            <ShieldAlert className="size-4 shrink-0" aria-hidden />
            <span className="flex-1">{t.suspended}</span>
            <Link href="/painel/conta" className="font-semibold underline-offset-2 hover:underline">
              {t.suspendedAction}
            </Link>
          </div>
        </div>
      )}
      <div id="conteudo" className="mx-auto w-full max-w-6xl flex-1 px-4 pt-8 pb-[max(6rem,env(safe-area-inset-bottom))] sm:px-6">
        {session.status === "signed-in" ? (
          children
        ) : session.status === "error" ? (
          <EmptyState
            icon={WifiOff}
            title={t.unreachableTitle}
            description={errorMessage(session.error)}
            action={
              <Button variant="secondary" icon={<RefreshCw />} onClick={session.retry}>
                {texts.common.retry}
              </Button>
            }
          />
        ) : (
          <PanelSkeleton />
        )}
      </div>
    </div>
  );
}
