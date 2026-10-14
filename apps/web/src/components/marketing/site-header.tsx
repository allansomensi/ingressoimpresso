"use client";

import { ArrowRight, Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";

import { Logo } from "@/components/brand";
import { ButtonLink, useScrollLock } from "@/components/ui";
import { readToken, subscribeToken } from "@/lib/api";
import { cn } from "@/lib/cn";
import { nav as navTexts } from "@/texts/pt-BR";

const t = navTexts;
// Absolute anchors: the header also sits on the legal pages and the changelog.
const LINKS = [
  { href: "/#como-funciona", label: t.howItWorks },
  { href: "/#exemplos", label: t.examples },
  { href: "/modelos", label: t.templates },
  { href: "/#recursos", label: t.features },
  { href: "/#precos", label: t.pricing },
  { href: "/#duvidas", label: t.faq },
] as const;

function useSignedIn(): boolean {
  return useSyncExternalStore(
    subscribeToken,
    () => readToken() !== null,
    () => false,
  );
}

export function SiteHeader() {
  const signedIn = useSignedIn();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 8);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  // The open menu is the page for a moment: the page under it stays put, and Escape closes it.
  useScrollLock(open);
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-40 pt-[env(safe-area-inset-top)] transition-[background,border,backdrop-filter] duration-200",
          scrolled || open ? "border-b border-border bg-bg/80 backdrop-blur-xl" : "border-b border-transparent",
        )}
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Logo />
          <nav className="hidden items-center gap-1 lg:flex" aria-label={t.menu}>
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-lg px-3 py-2 text-sm font-medium text-fg-muted transition hover:bg-surface-2 active:bg-surface-2 hover:text-fg"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="hidden items-center gap-2 lg:flex">
            {signedIn ? (
              <ButtonLink href="/painel" icon={<ArrowRight />} className="flex-row-reverse">
                {t.panel}
              </ButtonLink>
            ) : (
              <>
                <ButtonLink href="/entrar" variant="ghost">
                  {t.signIn}
                </ButtonLink>
                <ButtonLink href="/entrar">{t.start}</ButtonLink>
              </>
            )}
          </div>
          <button
            type="button"
            className="-mr-2 flex size-11 items-center justify-center rounded-lg text-fg transition active:bg-surface-2 lg:hidden"
            aria-label={t.menu}
            aria-expanded={open}
            aria-controls="menu-do-site"
            onClick={() => {
              setOpen(!open);
            }}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
        {open && (
          <div
            id="menu-do-site"
            className="max-h-[calc(100dvh-4rem-env(safe-area-inset-top))] overflow-y-auto overscroll-contain border-t border-border bg-bg px-4 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))] lg:hidden animate-fade-in"
          >
            <nav className="flex flex-col" aria-label={t.menu}>
              {LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => {
                    setOpen(false);
                  }}
                  className="rounded-lg px-2 py-3 text-base font-medium text-fg transition active:bg-surface-2"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
            <div className="mt-3 grid gap-2">
              {signedIn ? (
                <ButtonLink href="/painel" size="lg">
                  {t.panel}
                </ButtonLink>
              ) : (
                <>
                  <ButtonLink href="/entrar" size="lg">
                    {t.start}
                  </ButtonLink>
                  <Link href="/entrar" className="flex min-h-11 items-center justify-center rounded-lg text-sm font-medium text-fg-muted active:bg-surface-2">
                    {t.signIn}
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </header>
      {open && (
        // A tap outside the menu closes it. Outside the header: its blur would confine a fixed box.
        <div
          aria-hidden
          onClick={() => {
            setOpen(false);
          }}
          className="fixed inset-0 z-30 bg-black/30 backdrop-blur-[2px] lg:hidden animate-fade-in"
        />
      )}
    </>
  );
}
