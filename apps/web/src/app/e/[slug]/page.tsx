import type { PublicEventDto } from "@ingressoimpresso/api-types";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LogoMark } from "@/components/brand";
import { JsonLd } from "@/components/json-ld";
import { EventPage, pageSurface, publicEventWords } from "@/components/public-event/event-page";
import { ButtonLink } from "@/components/ui";
import { API_URL } from "@/lib/api";
import { placeLine } from "@/lib/calendar";
import { changeKind } from "@/lib/event-change";
import { clip, fetchPublicEvent, fetchPublicEventOrNull, publicDate, publicShortDate } from "@/lib/public-event";
import { pageMetadata } from "@/lib/seo";
import { SITE_URL } from "@/lib/site";
import { brand as brandTexts } from "@/texts/pt-BR/brand";
import { publicEvent as publicEventTexts } from "@/texts/pt-BR/public-event";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const event = await fetchPublicEventOrNull(slug);
  if (event === null) {
    return { title: publicEventTexts.notFoundTitle, robots: { index: false, follow: false } };
  }
  const t = publicEventWords(event);
  return pageMetadata({
    title: t.metaTitle(event.name, publicShortDate(event.startsAt)),
    description: clip(t.metaDescription(event.name, publicDate(event.startsAt), placeLine(event.venue, event.address), event.organization.name), 160),
    path: `/e/${event.slug}`,
  });
}

/** schema.org Event: the date, the place, the offers and who organizes. */
function eventJsonLd(event: PublicEventDto, url: string) {
  const place = placeLine(event.venue, event.address);
  const canceled = changeKind(event.change, event.startsAt) === "canceled";
  const prices = event.categories.length > 0 ? event.categories : [{ name: publicEventWords(event).price, priceCents: event.ticketPriceCents, soldOut: event.soldOut }];
  const rescheduled = !canceled && event.change.postponedAt !== null;
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.name,
    url,
    image: `${url}/opengraph-image`,
    startDate: event.startsAt,
    endDate: event.endsAt,
    eventStatus: canceled ? "https://schema.org/EventCancelled" : rescheduled ? "https://schema.org/EventRescheduled" : "https://schema.org/EventScheduled",
    // Search engines ask for the date an event moved from.
    ...(rescheduled && event.change.postponedFromStartsAt !== null ? { previousStartDate: event.change.postponedFromStartsAt } : {}),
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    ...(event.description === null ? {} : { description: event.description }),
    // A place is required of an event; without an address, the organization stands for it.
    location:
      place === null
        ? { "@type": "Place", name: event.organization.name, address: { "@type": "PostalAddress", addressCountry: "BR" } }
        : { "@type": "Place", name: event.venue ?? place, address: event.address ?? place },
    organizer: { "@type": "Organization", name: event.organization.name, ...(event.organization.website === null ? {} : { url: event.organization.website }) },
    offers: prices
      .filter((offer) => offer.priceCents !== null)
      .map((offer) => ({
        "@type": "Offer",
        name: offer.name,
        price: ((offer.priceCents ?? 0) / 100).toFixed(2),
        priceCurrency: "BRL",
        availability: event.soldOut || offer.soldOut ? "https://schema.org/SoldOut" : "https://schema.org/InStock",
        url,
      })),
  };
}

/**
 * The event's public page (ADR 0095): one link to share with the date, the place with a map, the
 * price of each category, who sells with a WhatsApp button and a "sold out" seal. Read on the
 * server, so link previews and search engines see everything; signed by the product at the foot.
 */
export default async function PublicEventPage({ params }: Props) {
  const { slug } = await params;
  const event = await fetchPublicEvent(slug);
  if (event === null) {
    notFound();
  }
  const t = publicEventWords(event);
  const url = `${SITE_URL}/e/${event.slug}`;
  const coverUrl = event.coverPath === null ? null : `${API_URL}${event.coverPath}`;

  return (
    <div className="flex min-h-dvh flex-col bg-bg" {...pageSurface(event)}>
      <JsonLd data={eventJsonLd(event, url)} />
      <main id="conteudo" className="mx-auto w-full max-w-2xl flex-1 px-4 pt-5 pb-12 sm:pt-8">
        <EventPage event={event} url={url} coverUrl={coverUrl} />
      </main>

      {/* The product, for whoever does not know it yet (ADR 0095). */}
      <footer className="border-t border-border bg-surface">
        <div className="mx-auto flex max-w-2xl flex-col items-start gap-4 px-4 py-10">
          <Link href="/" className="flex items-center gap-2.5 rounded-lg pointer-coarse:min-h-11">
            <LogoMark className="size-8" />
            <span className="text-[15px] font-semibold tracking-tight text-fg">{brandTexts.name}</span>
          </Link>
          <p className="text-base font-semibold text-fg">{t.productTitle}</p>
          <p className="text-sm leading-relaxed text-fg-muted">{t.productBody}</p>
          <div className="flex flex-wrap items-center gap-3">
            <ButtonLink href="/" icon={<ArrowRight />} className="flex-row-reverse">
              {t.productCta}
            </ButtonLink>
            <span className="text-xs text-fg-subtle">{t.productNote}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
