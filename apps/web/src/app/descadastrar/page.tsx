import type { Metadata } from "next";

import { Unsubscribe } from "@/components/unsubscribe/unsubscribe";
import { unsubscribe as unsubscribeTexts } from "@/texts/pt-BR/unsubscribe";

// A private link (the token is in the fragment): never indexed.
export const metadata: Metadata = {
  title: { absolute: unsubscribeTexts.metaTitle },
  description: unsubscribeTexts.metaDescription,
  robots: { index: false, follow: false },
};

export default function UnsubscribePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-bg px-4 py-12">
      <Unsubscribe />
    </main>
  );
}
