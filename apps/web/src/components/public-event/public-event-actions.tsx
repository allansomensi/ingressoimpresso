"use client";

import { CalendarPlus, ExternalLink, Map, Navigation, Share2 } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui";
import { downloadIcs, icsFile, icsFileName, isApplePhone, mapsUrl } from "@/lib/calendar";
import { mapEmbedUrl } from "@/lib/public-event";
import { copyText } from "@/lib/share";
import { publicEvent as publicEventTexts } from "@/texts/pt-BR/public-event";

const t = publicEventTexts;

function subscribeNothing(): () => void {
  return () => undefined;
}

/**
 * The map of the venue, loaded only on a tap (ADR 0095): Google's frame is heavy and talks to a
 * third party, so the page stays light and private until someone asks for it.
 */
export function PlaceMap({ place }: { place: string }) {
  const [open, setOpen] = useState(false);
  const apple = useSyncExternalStore(
    subscribeNothing,
    () => isApplePhone(navigator.userAgent, navigator.maxTouchPoints),
    () => false,
  );
  return (
    <div className="flex flex-col gap-3">
      {open ? (
        <iframe
          title={t.mapTitle(place)}
          src={mapEmbedUrl(place)}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="aspect-[4/3] w-full rounded-2xl border border-border bg-surface-2 sm:aspect-[16/9]"
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
          }}
          className="flex aspect-[16/9] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border-strong bg-surface-2 bg-dots text-fg-muted transition hover:bg-surface-3 hover:text-fg active:bg-surface-3"
        >
          <Map className="size-7" aria-hidden />
          <span className="text-sm font-semibold">{t.map}</span>
          <span className="max-w-xs px-4 text-center text-xs text-fg-subtle">{t.mapHint}</span>
        </button>
      )}
      <a
        href={mapsUrl(place, apple)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 w-fit items-center gap-2 rounded-xl text-sm font-semibold text-brand hover:underline"
      >
        <Navigation className="size-4" aria-hidden />
        {t.directions}
        <ExternalLink className="size-3.5 opacity-70" aria-hidden />
      </a>
    </div>
  );
}

/** "Adicionar à agenda": an .ics made in the browser, with a reminder 2 hours before. */
export function CalendarButton({
  uid,
  title,
  startsAt,
  endsAt,
  location,
  description,
  sequence,
}: {
  uid: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location: string | null;
  description: string;
  /** Grows when the event moves, so a calendar replaces the entry it already has. */
  sequence?: number;
}) {
  return (
    <Button
      variant="secondary"
      icon={<CalendarPlus />}
      onClick={() => {
        downloadIcs(
          icsFile({ uid, title, startsAt, endsAt, location, description, sequence: sequence ?? 0, alarmMinutes: 120, alarmText: title }),
          icsFileName(title, t.calendarFile),
        );
        toast.success(t.calendarSaved);
      }}
    >
      {t.calendar}
    </Button>
  );
}

/** Shares the page (the phone's share sheet, or the link copied). */
export function ShareButton({ url, title, text }: { url: string; title: string; text: string }) {
  return (
    <Button
      variant="secondary"
      icon={<Share2 />}
      onClick={() => {
        const copy = () =>
          copyText(url).then((ok) => {
            toast[ok ? "success" : "error"](ok ? t.copied : t.copyFailed);
          });
        if (typeof navigator.share === "function") {
          // The share sheet refused (not canceled by the person): the link is copied instead.
          void navigator.share({ url, title, text }).catch((error: unknown) => {
            if (!(error instanceof DOMException && error.name === "AbortError")) {
              return copy();
            }
            return undefined;
          });
          return;
        }
        void copy();
      }}
    >
      {t.share}
    </Button>
  );
}
