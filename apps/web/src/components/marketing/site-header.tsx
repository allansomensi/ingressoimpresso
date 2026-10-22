"use client";

import { ArrowRight, Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { Logo } from "@/components/brand";
import { ButtonLink, useScrollLock } from "@/components/ui";
import { readToken, subscribeToken } from "@/lib/api";
import { cn } from "@/lib/cn";
import { common as commonTexts } from "@/texts/pt-BR/common";
import { nav as navTexts } from "@/texts/pt-BR/nav";

const t = navTexts;
// Absolute anchors: the header also sits on the legal pages and the changelog. The pages of their
// own (templates, guides, prices) are linked from every page, which is how search engines find
// them first (ADR 0081). `wide` links only fit the desktop bar from `xl` up; the phone menu has all.
const LINKS = [
  { href: "/#como-funciona", label: t.howItWorks, wide: false },
  { href: "/#recursos", label: t.features, wide: false },
  { href: "/#exemplos", label: t.examples, wide: true },
  { href: "/modelos", label: t.templates, wide: false },
  { href: "/guias", label: t.guides, wide: false },
  { href: "/precos", label: t.pricing, wide: false },
  { href: "/#duvidas", label: t.faq, wide: true },
] as const;
const MENU_ID = "menu-do-site";
const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

function useSignedIn(): boolean {
  return useSyncExternalStore(
    subscribeToken,
    () => readToken() !== null,
    () => false,
  );
}

/**
 * Header of the public pages. The first thing in the tab order is a link that skips to the
 * page's content (`<main id="conteudo">`), as in the panel (WCAG 2.4.1).
 */
export function SiteHeader() {
  const signedIn = useSignedIn();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 8);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  // The open menu is the page for a moment: the page under it stays put, focus moves into the
  // menu and stays there (Tab wraps around), Escape closes it, and closing gives the focus back
  // to the button that opened it.
  useScrollLock(open);
  useEffect(() => {
    if (!open) {
      return;
    }
    const opener = toggle.current;
    const items = () => [...(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    items()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") {
        return;
      }
      const focusable = items();
      const first = focusable[0];
      const last = focusable.at(-1);
      if (first === undefined || last === undefined) {
        return;
      }
      const inside = panel.current?.contains(document.activeElement) ?? false;
      if (event.shiftKey && (document.activeElement === first || !inside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !inside)) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, [open]);

  const close = () => {
    setOpen(false);
  };

  return (
    <>
      <a
        href="#conteudo"
        className="sr-only z-50 rounded-lg bg-brand-solid px-3 py-2 text-sm font-semibold text-brand-fg focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        {commonTexts.skipToContent}
      </a>
      <header
        className={cn(
          "sticky top-0 z-40 pt-[env(safe-area-inset-top)] transition-[background,border,backdrop-filter] duration-200",
          scrolled || open ? "border-b border-border bg-bg/80 backdrop-blur-xl" : "border-b border-transparent",
        )}
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Logo />
          <nav className="hidden items-center gap-1 lg:flex" aria-label={t.mainMenu}>
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-medium text-fg-muted transition hover:bg-surface-2 hover:text-fg active:bg-surface-2 pointer-coarse:py-3",
                  link.wide && "max-xl:hidden",
                )}
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
            ref={toggle}
            type="button"
            className="-mr-2 flex size-11 items-center justify-center rounded-lg text-fg transition active:bg-surface-2 lg:hidden"
            aria-label={open ? t.closeMenu : t.menu}
            aria-expanded={open}
            aria-controls={open ? MENU_ID : undefined}
            onClick={() => {
              setOpen(!open);
            }}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
        {open && (
          <div
            id={MENU_ID}
            ref={panel}
            className="max-h-[calc(100dvh-4rem-env(safe-area-inset-top))] overflow-y-auto overscroll-contain border-t border-border bg-bg px-4 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))] lg:hidden animate-fade-in"
          >
            <nav className="flex flex-col" aria-label={t.menu}>
              {LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={close}
                  className="rounded-lg px-2 py-3 text-base font-medium text-fg transition active:bg-surface-2"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
            <div className="mt-3 grid gap-2">
              {signedIn ? (
                <ButtonLink href="/painel" size="lg" onClick={close}>
                  {t.panel}
                </ButtonLink>
              ) : (
                <>
                  <ButtonLink href="/entrar" size="lg" onClick={close}>
                    {t.start}
                  </ButtonLink>
                  <Link
                    href="/entrar"
                    onClick={close}
                    className="flex min-h-11 items-center justify-center rounded-lg text-sm font-medium text-fg-muted active:bg-surface-2"
                  >
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
        <div aria-hidden onClick={close} className="fixed inset-0 z-30 bg-black/30 backdrop-blur-[2px] lg:hidden animate-fade-in" />
      )}
    </>
  );
}
