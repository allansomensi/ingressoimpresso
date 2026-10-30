import type { PublicEventDto } from "@ingressoimpresso/api-types";
import { ArrowRight, CalendarDays, Clock3, MapPin, MessageCircle, ShieldCheck, Ticket } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LogoMark } from "@/components/brand";
import { JsonLd } from "@/components/json-ld";
import { EventChangeNotice, OrganizationContact, OrganizationLogo } from "@/components/organization/organization";
import { CalendarButton, PlaceMap, ShareButton } from "@/components/public-event/public-event-actions";
import { WaitlistCard } from "@/components/public-event/waitlist";
import { calendarSequence } from "@/lib/calendar";
import { ButtonLink, buttonClass } from "@/components/ui";
import { placeLine } from "@/lib/calendar";
import { inkFor } from "@/lib/design-rules";
import { changeKind } from "@/lib/event-change";
import { forKind } from "@/lib/event-kind";
import { money } from "@/lib/format";
import { clip, fetchPublicEvent, fetchPublicEventOrNull, lowestPrice, priceLabel, publicDate, publicShortDate, sellerWhatsapp } from "@/lib/public-event";
import { pageMetadata } from "@/lib/seo";
import { SITE_URL } from "@/lib/site";
import { textOn } from "@/lib/ticket-pass";
import { brand as brandTexts } from "@/texts/pt-BR/brand";
import { publicEvent as publicEventTexts } from "@/texts/pt-BR/public-event";

type Props = { params: Promise<{ slug: string }> };

function words(event: PublicEventDto) {
  return forKind(publicEventTexts, publicEventTexts.tokens, event.kind);
}

/** The organization's colour when white text reads on it; the brand's otherwise. */
function heroColor(event: PublicEventDto): string | null {
  const brand = event.organization.brandColor;
  return brand !== null && textOn(brand) === "#ffffff" ? brand : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const event = await fetchPublicEventOrNull(slug);
  if (event === null) {
    return { title: publicEventTexts.notFoundTitle, robots: { index: false, follow: false } };
  }
  const t = words(event);
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
  const prices = event.categories.length > 0 ? event.categories : [{ name: words(event).price, priceCents: event.ticketPriceCents, soldOut: event.soldOut }];
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
  const t = words(event);
  const url = `${SITE_URL}/e/${event.slug}`;
  const place = placeLine(event.venue, event.address);
  const canceled = changeKind(event.change, event.startsAt) === "canceled";
  const color = heroColor(event);
  const lowest = lowestPrice(event);
  const singlePrice = priceLabel(event.ticketPriceCents, t.free);
  const sellingOpen = !event.soldOut && !canceled;

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <JsonLd data={eventJsonLd(event, url)} />
      <main id="conteudo" className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 pt-5 pb-12 sm:pt-8">
        <section
          className="relative overflow-hidden rounded-[1.75rem] bg-brand-solid p-6 text-white shadow-lg sm:p-8"
          style={color === null ? undefined : { backgroundColor: color }}
        >
          <div aria-hidden className="absolute -top-20 -right-20 size-64 rounded-full bg-white/10 blur-3xl" />
          <div className="relative flex flex-col gap-3">
            <span className="flex items-center gap-3">
              <OrganizationLogo organization={event.organization} className="size-11 rounded-xl" />
              <span className="text-xs font-semibold tracking-[0.16em] text-white/90 uppercase">{t.by(event.organization.name)}</span>
            </span>
            <h1 className={`text-3xl leading-tight font-bold tracking-tight text-balance sm:text-4xl ${canceled ? "line-through decoration-2" : ""}`}>
              {event.name}
            </h1>
            <p className="flex items-start gap-2 text-[15px] text-white/90">
              <CalendarDays className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span className="first-letter:uppercase">{publicDate(event.startsAt)}</span>
            </p>
            {place !== null && (
              <p className="flex items-start gap-2 text-[15px] text-white/90">
                <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>{place}</span>
              </p>
            )}
            {lowest !== null && sellingOpen && (
              <p className="mt-1 w-fit rounded-full bg-white/15 px-3 py-1 text-sm font-semibold ring-1 ring-white/25">
                {event.categories.length > 1 ? t.from(money(lowest)) : money(lowest)}
              </p>
            )}
          </div>
          {event.soldOut && (
            <span
              // At the bottom right on a phone, clear of the "POR …" line at the top.
              className="absolute right-4 bottom-5 rotate-[-12deg] rounded-xl border-4 border-white px-2.5 py-0.5 text-lg font-black tracking-widest text-white uppercase shadow-lg sm:top-6 sm:right-5 sm:bottom-auto sm:px-3 sm:py-1 sm:text-2xl"
            >
              {t.soldOut}
            </span>
          )}
        </section>

        <EventChangeNotice change={event.change} startsAt={event.startsAt} kind={event.kind} />

        {event.soldOut && !canceled && (
          <p role="status" className="rounded-2xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm leading-relaxed font-medium text-danger-fg">
            {event.waitlist ? t.soldOutWaitlist : t.soldOutBody}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {/* A canceled event has nothing to put in the calendar; a postponed one updates the entry. */}
          {!canceled && (
            <CalendarButton
              uid={`${event.slug}@ingressoimpresso.com.br`}
              title={event.name}
              startsAt={event.startsAt}
              endsAt={event.endsAt}
              location={place}
              description={`${t.by(event.organization.name)}\n${url}`}
              sequence={calendarSequence(event.change.postponedAt)}
            />
          )}
          <ShareButton url={url} title={event.name} text={t.shareText(event.name)} />
        </div>

        {/* Prices: one per category, or the event's own. */}
        <section aria-labelledby="precos" className="flex flex-col gap-3">
          <h2 id="precos" className="flex items-center gap-2 text-lg font-semibold tracking-tight text-fg">
            <Ticket className="size-5 text-brand" aria-hidden />
            {t.pricesTitle}
          </h2>
          {event.categories.length > 0 ? (
            <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
              {event.categories.map((category) => (
                <li key={category.name} className="flex items-center gap-3 px-4 py-3.5">
                  <span
                    className="rounded-full px-2.5 py-0.5 text-xs font-bold tracking-wide uppercase"
                    style={{ backgroundColor: category.color, color: inkFor(category.color) }}
                  >
                    {category.name}
                  </span>
                  <span className="ml-auto text-right text-base font-semibold text-fg tabular">
                    {category.soldOut || event.soldOut ? (
                      <span className="text-sm font-bold tracking-wide text-danger-fg uppercase">{t.categorySoldOut}</span>
                    ) : (
                      (priceLabel(category.priceCents, t.free) ?? <span className="text-sm font-normal text-fg-muted">{t.noPrice}</span>)
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="flex items-center justify-between rounded-2xl border border-border bg-surface px-4 py-3.5">
              <span className="font-medium text-fg">{t.price}</span>
              <span className="text-base font-semibold text-fg tabular">
                {event.soldOut ? <span className="text-sm font-bold tracking-wide text-danger-fg uppercase">{t.soldOut}</span> : (singlePrice ?? t.noPrice)}
              </span>
            </p>
          )}
        </section>

        {/* A sold-out category (or event) takes names for its waiting list (ADR 0124). */}
        {event.waitlist && <WaitlistCard slug={event.slug} kind={event.kind} eventSoldOut={event.soldOut} categories={event.categories} />}

        {/* Where to buy: the sellers the organizer listed, else the organization itself. */}
        {sellingOpen && event.sellers.length > 0 && (
          <section aria-labelledby="comprar" className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <h2 id="comprar" className="text-lg font-semibold tracking-tight text-fg">
                {t.buyTitle}
              </h2>
              <p className="text-sm text-fg-muted">{t.buyLead}</p>
            </div>
            <ul className="grid gap-2 sm:grid-cols-2">
              {event.sellers.map((seller) => (
                <li key={`${seller.name}-${seller.whatsapp}`}>
                  <a
                    href={sellerWhatsapp(seller.whatsapp, t.buyMessage(seller.name.split(" ")[0] ?? seller.name, event.name))}
                    target="_blank"
                    rel="noopener noreferrer"
                    // A long name wraps instead of running off the phone.
                    className={buttonClass({ variant: "secondary", className: "h-auto min-h-10 w-full justify-start py-2 text-left whitespace-normal pointer-coarse:min-h-11" })}
                  >
                    <MessageCircle className="text-success" />
                    {t.buyButton(seller.name)}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
        {(event.sellers.length === 0 || !sellingOpen) &&
          (event.organization.whatsapp !== null || event.organization.email !== null || event.organization.instagram !== null || event.organization.website !== null) && (
            <section aria-labelledby="contato" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
              <h2 id="contato" className="flex items-center gap-3 text-base font-semibold text-fg">
                <OrganizationLogo organization={event.organization} className="size-9 rounded-lg" />
                {t.contactTitle}
              </h2>
              <OrganizationContact organization={event.organization} message={t.contactMessage(event.name)} />
            </section>
          )}

        {event.days.length > 1 && (
          <section aria-labelledby="dias" className="flex flex-col gap-3">
            <h2 id="dias" className="text-lg font-semibold tracking-tight text-fg">
              {t.daysTitle}
            </h2>
            <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
              {event.days.map((day) => (
                <li key={day.position} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <Clock3 className="size-4 shrink-0 text-fg-subtle" aria-hidden />
                  <span className="font-semibold text-fg">{t.day(day.position)}</span>
                  <span className="text-fg-muted first-letter:uppercase">{publicDate(day.startsAt)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {place !== null && (
          <section aria-labelledby="onde" className="flex flex-col gap-3">
            <h2 id="onde" className="text-lg font-semibold tracking-tight text-fg">
              {t.whereTitle}
            </h2>
            <p className="text-[15px] text-fg">
              {event.venue !== null && <span className="block font-semibold">{event.venue}</span>}
              {event.address !== null && <span className="block text-fg-muted">{event.address}</span>}
            </p>
            <PlaceMap place={place} />
          </section>
        )}

        {event.description !== null && (
          <section aria-labelledby="sobre" className="flex flex-col gap-2">
            <h2 id="sobre" className="text-lg font-semibold tracking-tight text-fg">
              {t.aboutTitle}
            </h2>
            <p className="text-[15px] leading-relaxed whitespace-pre-line text-fg-muted">{event.description}</p>
          </section>
        )}

        {event.publicVerify && (
          <Link
            href="/conferir"
            className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3.5 transition hover:bg-surface-2 active:bg-surface-2"
          >
            <ShieldCheck className="size-5 shrink-0 text-success" aria-hidden />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-semibold text-fg">{t.verifyTitle}</span>
              <span className="text-xs text-fg-muted">{t.verifyBody}</span>
            </span>
            <span className="text-sm font-semibold text-brand">{t.verifyLink}</span>
          </Link>
        )}
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
