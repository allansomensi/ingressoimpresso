"use client";

import { CalendarDays, LogOut, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { Logo } from "@/components/brand";
import { Badge, Skeleton } from "@/components/ui";
import { cn } from "@/lib/cn";
import { initials } from "@/lib/format";
import { useRequiredUser, useSession } from "@/lib/session";
import { texts } from "@/texts/pt-BR";

const t = texts.panel;

function UserMenu({ email, isAdmin, onSignOut }: { email: string; isAdmin: boolean; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !ref.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={t.account}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => {
          setOpen(!open);
        }}
        className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-[#8b6cff] to-[#4a22d6] text-[13px] font-semibold text-white shadow-sm ring-2 ring-surface transition hover:opacity-90"
      >
        {initials(email.split("@")[0] ?? email) || "?"}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-64 origin-top-right rounded-2xl border border-border bg-surface p-1.5 shadow-lg animate-pop"
        >
          <div className="flex flex-col gap-1 px-3 py-2.5">
            <span className="text-xs text-fg-subtle">{t.account}</span>
            <span className="truncate text-sm font-medium text-fg">{email}</span>
            {isAdmin && (
              <Badge tone="brand" className="mt-1 w-fit">
                <ShieldCheck className="size-3" aria-hidden />
                {t.admin}
              </Badge>
            )}
          </div>
          <div className="my-1 h-px bg-border" />
          <button
            type="button"
            role="menuitem"
            onClick={onSignOut}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-fg-muted transition hover:bg-surface-2 hover:text-fg"
          >
            <LogOut className="size-4" aria-hidden />
            {t.signOut}
          </button>
        </div>
      )}
    </div>
  );
}

export function PanelShell({ children }: { children: ReactNode }) {
  const user = useRequiredUser();
  const { signOut } = useSession();
  const pathname = usePathname();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <Logo href="/painel" />
            <nav className="hidden sm:block" aria-label={t.events}>
              <Link
                href="/painel"
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition",
                  pathname.startsWith("/painel") ? "bg-surface-2 text-fg" : "text-fg-muted hover:text-fg",
                )}
              >
                <CalendarDays className="size-4" aria-hidden />
                {t.events}
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            {user === null ? (
              <Skeleton className="size-9 rounded-full" />
            ) : (
              <UserMenu email={user.email} isAdmin={user.isAdmin} onSignOut={() => void signOut()} />
            )}
          </div>
        </div>
      </header>
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 pt-8 pb-24 sm:px-6">
        {user === null ? (
          <div className="flex flex-col gap-4" aria-busy="true" aria-label={texts.common.loading}>
            <Skeleton className="h-9 w-56" />
            <Skeleton className="h-5 w-96 max-w-full" />
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((item) => (
                <Skeleton key={item} className="h-40 rounded-2xl" />
              ))}
            </div>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
