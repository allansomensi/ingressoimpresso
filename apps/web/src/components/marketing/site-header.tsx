"use client";

import { ArrowRight, Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";

import { Logo } from "@/components/brand";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { ButtonLink } from "@/components/ui";
import { readToken, subscribeToken } from "@/lib/api";
import { cn } from "@/lib/cn";
import { texts } from "@/texts/pt-BR";

const t = texts.nav;
const LINKS = [
  { href: "#como-funciona", label: t.howItWorks },
  { href: "#modelos", label: t.templates },
  { href: "#recursos", label: t.features },
  { href: "#precos", label: t.pricing },
  { href: "#duvidas", label: t.faq },
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

  return (
    <header
      className={cn(
        "sticky top-0 z-40 transition-[background,border,backdrop-filter] duration-200",
        scrolled || open ? "border-b border-border bg-bg/80 backdrop-blur-xl" : "border-b border-transparent",
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />
        <nav className="hidden items-center gap-1 md:flex" aria-label={t.menu}>
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-fg-muted transition hover:bg-surface-2 hover:text-fg"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          <ThemeSwitcher className="mr-1" />
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
          className="flex size-10 items-center justify-center rounded-lg text-fg md:hidden"
          aria-label={t.menu}
          aria-expanded={open}
          onClick={() => {
            setOpen(!open);
          }}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>
      {open && (
        <div className="border-t border-border px-4 pt-2 pb-5 md:hidden animate-fade-in">
          <nav className="flex flex-col" aria-label={t.menu}>
            {LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => {
                  setOpen(false);
                }}
                className="rounded-lg px-2 py-3 text-base font-medium text-fg"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <ThemeSwitcher labels className="mt-3 flex w-full" />
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
                <Link href="/entrar" className="py-2 text-center text-sm font-medium text-fg-muted">
                  {t.signIn}
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
