"use client";

import { RefreshCw } from "lucide-react";
import { useSyncExternalStore } from "react";

import { Button, ButtonLink } from "@/components/ui";
import { pwa as pwaTexts } from "@/texts/pt-BR/pwa";

const t = pwaTexts;
/** Pages people open by a link they received: the words speak of that link, not of the panel. */
const LINK_PAGES = /^\/(ingresso|vendedor|certificado|conferir|e)(\/|$)/;

/**
 * The body and the buttons of the offline page. The service worker shows the page in place of
 * whatever was asked for, so the address bar still has that address: reloading tries it again,
 * with the `#token` of a private link intact (a link to the panel would lose it).
 */
export function OfflineActions() {
  // The address only exists in the browser; the server renders the panel's words.
  const path = useSyncExternalStore(
    () => () => undefined,
    () => window.location.pathname,
    () => null,
  );
  const link = path !== null && LINK_PAGES.test(path);
  return (
    <>
      <p className="leading-relaxed text-fg-muted">{link ? t.offlineBodyLink : t.offlineBody}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          icon={<RefreshCw />}
          onClick={() => {
            window.location.reload();
          }}
        >
          {t.offlineRetry}
        </Button>
        {!link && (
          <ButtonLink href="/portaria" variant="secondary" prefetch={false}>
            {t.offlineDoor}
          </ButtonLink>
        )}
      </div>
    </>
  );
}
