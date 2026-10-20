/**
 * The event's public page (ADR 0095): read on the server, so search engines and link previews get
 * the whole page, and its words (price lines, the WhatsApp message to a seller).
 */
import type { PublicEventDto } from "@ingressoimpresso/api-types";

import { API_URL } from "@/lib/api";
import { money } from "@/lib/format";
import { wallClockDate } from "@/lib/event-time";

/** How long the server keeps a page before asking the API again, in seconds. */
const PAGE_REVALIDATE = 30;
const PAGE_TIMEOUT_MS = 4_000;

/** Lowercase letters, digits and single hyphens, as the API accepts. */
export function isPublicSlug(slug: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) && slug.length >= 3 && slug.length <= 60;
}

/** The page of `slug`; `null` when it does not exist, is off or the API cannot answer. */
export async function fetchPublicEvent(slug: string): Promise<PublicEventDto | null> {
  if (!isPublicSlug(slug)) {
    return null;
  }
  try {
    const response = await fetch(`${API_URL}/api/public/events/${slug}`, {
      next: { revalidate: PAGE_REVALIDATE, tags: [`public-event-${slug}`] },
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as PublicEventDto;
  } catch {
    return null;
  }
}

/** "sábado, 21 de novembro · 21:00", in the event's own wall-clock time. */
export function publicDate(iso: string): string {
  const date = wallClockDate(iso);
  const day = date.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const time = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  return `${day} · ${time}`;
}

/** "R$ 30,00", "Grátis" or `null` without a price. */
export function priceLabel(cents: number | null, free: string): string | null {
  if (cents === null) {
    return null;
  }
  return cents === 0 ? free : money(cents);
}

/** The lowest price of the page ("a partir de R$ 15,00"), or `null`. */
export function lowestPrice(event: Pick<PublicEventDto, "categories" | "ticketPriceCents">): number | null {
  const prices = event.categories.length > 0 ? event.categories.map((category) => category.priceCents) : [event.ticketPriceCents];
  const known = prices.filter((price): price is number => price !== null && price > 0);
  return known.length === 0 ? null : Math.min(...known);
}

/** A `wa.me` link to a seller with the message already written. */
export function sellerWhatsapp(digits: string, message: string): string {
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

/** Google Maps' embed of a place (no key needed), for the map loaded on a tap. */
export function mapEmbedUrl(place: string): string {
  return `https://www.google.com/maps?q=${encodeURIComponent(place)}&output=embed`;
}
