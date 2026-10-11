"use client";

import { ArrowRight } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";

import { ButtonLink } from "@/components/ui";
import { readToken, subscribeToken } from "@/lib/api";
import { cn } from "@/lib/cn";
import { texts } from "@/texts/pt-BR";

/** Sections that already carry the call to action: the bar steps aside while they are on screen. */
const OWN_CTA = ["comecar", "criar"] as const;

/**
 * On phones and tablets, a bar at the bottom of the landing page with the main action, once the
 * hero's buttons have scrolled away (ADR 0060). It hides again near the final call to action and
 * the footer, so it never covers them.
 */
export function MobileCta() {
  const signedIn = useSyncExternalStore(
    subscribeToken,
    () => readToken() !== null,
    () => false,
  );
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const targets = [...OWN_CTA.map((id) => document.getElementById(id)), document.querySelector("footer")].filter(
      (element): element is HTMLElement => element !== null,
    );
    const hero = targets[0];
    if (hero === undefined) {
      return;
    }
    const onScreen = new Set<Element>();
    // The hero counts as passed once it is above the screen, not while the page is still above it.
    let pastHero = false;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          onScreen.add(entry.target);
        } else {
          onScreen.delete(entry.target);
        }
        if (entry.target === hero) {
          pastHero = !entry.isIntersecting && entry.boundingClientRect.top < 0;
        }
      }
      setVisible(pastHero && onScreen.size === 0);
    });
    for (const target of targets) {
      observer.observe(target);
    }
    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div
      // Hidden from everyone while away; the same actions are in the page itself.
      aria-hidden={!visible}
      inert={!visible}
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg/90 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl transition-transform duration-300 lg:hidden",
        visible ? "translate-y-0" : "translate-y-full",
      )}
    >
      <div className="mx-auto flex max-w-md flex-col items-stretch gap-1.5">
        <ButtonLink href={signedIn ? "/painel" : "/entrar"} size="lg" icon={<ArrowRight />} className="flex-row-reverse">
          {signedIn ? texts.nav.panel : texts.landing.primaryCta}
        </ButtonLink>
        {!signedIn && <p className="text-center text-xs text-fg-muted">{texts.landing.trust[0]}</p>}
      </div>
    </div>
  );
}
