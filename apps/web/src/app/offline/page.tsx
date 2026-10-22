import type { Metadata } from "next";
import { WifiOff } from "lucide-react";

import { Logo } from "@/components/brand";
import { OfflineActions } from "@/components/offline-actions";
import { pwa as pwaTexts } from "@/texts/pt-BR/pwa";

const t = pwaTexts;

export const metadata: Metadata = { title: t.offlineTitle, robots: { index: false, follow: false } };

/** Shown by the service worker when a page is opened without network (ADR 0021). */
export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col bg-glow px-4 py-6">
      <Logo />
      <div className="m-auto flex max-w-md flex-col items-center gap-5 py-16 text-center animate-rise">
        <span className="flex size-16 items-center justify-center rounded-3xl bg-brand-soft text-brand-soft-fg">
          <WifiOff className="size-8" aria-hidden />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-fg">{t.offlineTitle}</h1>
        <OfflineActions />
      </div>
    </main>
  );
}
