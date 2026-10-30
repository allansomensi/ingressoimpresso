import type { PageSection, PublicEventDto } from "@ingressoimpresso/api-types";
import { CalendarDays, CircleHelp, Clock3, ExternalLink, Info, Link2, ListOrdered, MapPin, MessageCircle, ShieldCheck, ShoppingBag, Ticket, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { Fragment, type CSSProperties, type ReactNode } from "react";

import { EventChangeNotice, OrganizationContact, OrganizationLogo } from "@/components/organization/organization";
import { CalendarButton, PlaceMap, ShareButton } from "@/components/public-event/public-event-actions";
import { WaitlistCard } from "@/components/public-event/waitlist";
import { buttonClass } from "@/components/ui";
import { calendarSequence, placeLine } from "@/lib/calendar";
import { cn } from "@/lib/cn";
import { FONT_FAMILIES, inkFor } from "@/lib/design-rules";
import { changeKind } from "@/lib/event-change";
import { forKind } from "@/lib/event-kind";
import { money } from "@/lib/format";
import { accentCss, accentInk, heroLook, pageAccent, pageBackground, shownSections } from "@/lib/page-design";
import { lowestPrice, priceLabel, publicDate, sellerWhatsapp } from "@/lib/public-event";
import { publicEvent as publicEventTexts } from "@/texts/pt-BR/public-event";

export function publicEventWords(event: Pick<PublicEventDto, "kind">) {
  return forKind(publicEventTexts, publicEventTexts.tokens, event.kind);
}

/**
 * The page's surface (ADR 0125): the dark background switches the theme of everything inside,
 * the tinted one mixes the accent into it. Spread on the element that holds the page.
 */
export function pageSurface(event: Pick<PublicEventDto, "design" | "organization">): { "data-theme"?: "dark"; style?: CSSProperties } {
  const accent = pageAccent(event.design, event.organization);
  const background = pageBackground(event.design, accent);
  return {
    ...(event.design.background === "dark" ? { "data-theme": "dark" as const } : {}),
    ...(background === undefined ? {} : { style: { backgroundColor: background } }),
  };
}

/** A part's heading, with its icon on the accent. */
function SectionTitle({ id, icon: Icon, accent, children }: { id: string; icon: LucideIcon; accent: string | null; children: ReactNode }) {
  return (
    <h2 id={id} className="flex items-center gap-2.5 text-lg font-semibold tracking-tight text-fg">
      <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: accentCss(accent), color: accentInk(accent) }}>
        <Icon className="size-4" />
      </span>
      {children}
    </h2>
  );
}

/**
 * The event's public page (ADRs 0095, 0124, 0125): the top in the organizer's look, then the parts
 * in the order chosen. The same component draws `/e/<slug>` (on the server) and the editor's live
 * preview (`preview`: nothing on it reacts).
 */
export function EventPage({ event, url, coverUrl, preview = false }: { event: PublicEventDto; url: string; coverUrl: string | null; preview?: boolean }) {
  const t = publicEventWords(event);
  const design = event.design;
  const place = placeLine(event.venue, event.address);
  const canceled = changeKind(event.change, event.startsAt) === "canceled";
  const accent = pageAccent(design, event.organization);
  const hero = heroLook(design, accent, design.hero === "cover" ? coverUrl : null);
  const lowest = lowestPrice(event);
  const singlePrice = priceLabel(event.ticketPriceCents, t.free);
  const sellingOpen = !event.soldOut && !canceled;
  const hasContact = event.organization.whatsapp !== null || event.organization.email !== null || event.organization.instagram !== null || event.organization.website !== null;
  const muted = { color: `color-mix(in oklab, ${hero.ink} 86%, transparent)` };

  const sections: Record<PageSection, () => ReactNode> = {
    prices: () => (
      <section aria-labelledby="precos" className="flex flex-col gap-3">
        <SectionTitle id="precos" icon={Ticket} accent={accent}>
          {t.pricesTitle}
        </SectionTitle>
        {event.categories.length > 0 ? (
          <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {event.categories.map((category) => (
              <li key={category.id} className="flex items-center gap-3 px-4 py-3.5">
                <span className="rounded-full px-2.5 py-0.5 text-xs font-bold tracking-wide uppercase" style={{ backgroundColor: category.color, color: inkFor(category.color) }}>
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
    ),
    // A sold-out category (or event) takes names for its waiting list (ADR 0124).
    waitlist: () => event.waitlist && <WaitlistCard slug={event.slug} kind={event.kind} eventSoldOut={event.soldOut} categories={event.categories} accent={accent ?? undefined} />,
    // Where to buy: the sellers the organizer listed, else the organization itself.
    buy: () =>
      sellingOpen && event.sellers.length > 0 ? (
        <section aria-labelledby="comprar" className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <SectionTitle id="comprar" icon={ShoppingBag} accent={accent}>
              {t.buyTitle}
            </SectionTitle>
            <p className="text-sm text-fg-muted">{t.buyLead}</p>
          </div>
          <ul className="grid gap-2 @xl:grid-cols-2">
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
      ) : (
        hasContact && (
          <section aria-labelledby="contato" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
            <h2 id="contato" className="flex items-center gap-3 text-base font-semibold text-fg">
              <OrganizationLogo organization={event.organization} className="size-9 rounded-lg" />
              {t.contactTitle}
            </h2>
            <OrganizationContact organization={event.organization} message={t.contactMessage(event.name)} />
          </section>
        )
      ),
    schedule: () =>
      design.schedule.length > 0 && (
        <section aria-labelledby="programacao" className="flex flex-col gap-3">
          <SectionTitle id="programacao" icon={ListOrdered} accent={accent}>
            {t.scheduleTitle}
          </SectionTitle>
          <ol className="relative flex flex-col gap-0 rounded-2xl border border-border bg-surface px-4 py-2">
            {design.schedule.map((item, index) => (
              <li key={`${String(index)}-${item.title}`} className="relative flex gap-4 py-3">
                <span className="w-16 shrink-0 pt-0.5 text-sm font-semibold text-fg tabular @xl:w-20">{item.time}</span>
                <span aria-hidden className="relative flex w-3 shrink-0 justify-center">
                  <span className="absolute top-2 size-2.5 rounded-full ring-4 ring-surface" style={{ backgroundColor: accentCss(accent) }} />
                  {index < design.schedule.length - 1 && <span className="absolute top-4 -bottom-5 w-px bg-border" />}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[15px] font-medium text-fg">{item.title}</span>
                  {item.detail !== null && <span className="text-sm leading-relaxed text-fg-muted">{item.detail}</span>}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ),
    days: () =>
      event.days.length > 1 && (
        <section aria-labelledby="dias" className="flex flex-col gap-3">
          <SectionTitle id="dias" icon={CalendarDays} accent={accent}>
            {t.daysTitle}
          </SectionTitle>
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
      ),
    where: () =>
      place !== null && (
        <section aria-labelledby="onde" className="flex flex-col gap-3">
          <SectionTitle id="onde" icon={MapPin} accent={accent}>
            {t.whereTitle}
          </SectionTitle>
          <p className="text-[15px] text-fg">
            {event.venue !== null && <span className="block font-semibold">{event.venue}</span>}
            {event.address !== null && <span className="block text-fg-muted">{event.address}</span>}
          </p>
          <PlaceMap place={place} />
        </section>
      ),
    about: () =>
      event.description !== null && (
        <section aria-labelledby="sobre" className="flex flex-col gap-3">
          <SectionTitle id="sobre" icon={Info} accent={accent}>
            {t.aboutTitle}
          </SectionTitle>
          <p className="text-[15px] leading-relaxed whitespace-pre-line text-fg-muted">{event.description}</p>
        </section>
      ),
    faq: () =>
      design.faq.length > 0 && (
        <section aria-labelledby="duvidas" className="flex flex-col gap-3">
          <SectionTitle id="duvidas" icon={CircleHelp} accent={accent}>
            {t.faqTitle}
          </SectionTitle>
          <div className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {design.faq.map((item, index) => (
              <details key={`${String(index)}-${item.question}`} className="group">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[15px] font-medium text-fg transition hover:bg-surface-2 active:bg-surface-2 [&::-webkit-details-marker]:hidden">
                  {item.question}
                  <span aria-hidden className="text-xl leading-none text-fg-subtle transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="px-4 pb-4 text-sm leading-relaxed whitespace-pre-line text-fg-muted">{item.answer}</p>
              </details>
            ))}
          </div>
        </section>
      ),
    links: () =>
      design.links.length > 0 && (
        <section aria-labelledby="links" className="flex flex-col gap-3">
          <SectionTitle id="links" icon={Link2} accent={accent}>
            {t.linksTitle}
          </SectionTitle>
          <ul className="grid gap-2 @xl:grid-cols-2">
            {design.links.map((link, index) => (
              <li key={`${String(index)}-${link.url}`}>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonClass({ variant: "secondary", className: "h-auto min-h-11 w-full justify-between py-2 text-left whitespace-normal" })}
                >
                  {link.label}
                  <ExternalLink className="text-fg-subtle" />
                </a>
              </li>
            ))}
          </ul>
        </section>
      ),
    verify: () =>
      event.publicVerify && (
        <Link href="/conferir" className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3.5 transition hover:bg-surface-2 active:bg-surface-2">
          <ShieldCheck className="size-5 shrink-0 text-success" aria-hidden />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm font-semibold text-fg">{t.verifyTitle}</span>
            <span className="text-xs text-fg-muted">{t.verifyBody}</span>
          </span>
          <span className="text-sm font-semibold text-brand">{t.verifyLink}</span>
        </Link>
      ),
  };

  return (
    <div className="@container flex flex-col gap-6" {...(preview ? { inert: true } : {})}>
      <section
        className={cn("relative overflow-hidden rounded-[1.75rem] p-6 shadow-lg @xl:p-8", design.hero === "cover" && coverUrl !== null && "flex min-h-[22rem] flex-col justify-end @xl:min-h-[26rem]")}
        style={{ background: hero.background, color: hero.ink, ...(design.hero === "cover" && coverUrl !== null ? { textShadow: "0 1px 12px rgb(0 0 0 / 0.45)" } : {}) }}
      >
        {design.hero !== "cover" && <div aria-hidden className="absolute -top-20 -right-20 size-64 rounded-full bg-white/10 blur-3xl" />}
        <div className="relative flex flex-col gap-3">
          <span className="flex items-center gap-3">
            <OrganizationLogo organization={event.organization} className="size-11 rounded-xl" />
            <span className="text-xs font-semibold tracking-[0.16em] uppercase" style={muted}>
              {t.by(event.organization.name)}
            </span>
          </span>
          <h1
            className={cn("text-3xl leading-tight font-bold tracking-tight text-balance @xl:text-4xl", design.titleFont !== null && "text-4xl font-normal @xl:text-5xl", canceled && "line-through decoration-2")}
            style={design.titleFont === null ? undefined : { fontFamily: `${FONT_FAMILIES[design.titleFont]}, var(--font-sans), sans-serif` }}
          >
            {event.name}
          </h1>
          <p className="flex items-start gap-2 text-[15px]" style={muted}>
            <CalendarDays className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span className="first-letter:uppercase">{publicDate(event.startsAt)}</span>
          </p>
          {place !== null && (
            <p className="flex items-start gap-2 text-[15px]" style={muted}>
              <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>{place}</span>
            </p>
          )}
          {lowest !== null && sellingOpen && (
            <p
              className="mt-1 w-fit rounded-full px-3 py-1 text-sm font-semibold"
              style={{ backgroundColor: `color-mix(in oklab, ${hero.ink} 15%, transparent)`, boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${hero.ink} 25%, transparent)` }}
            >
              {event.categories.length > 1 ? t.from(money(lowest)) : money(lowest)}
            </p>
          )}
          {design.cta !== null && !canceled && (
            <a
              href={design.cta.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-5 text-base font-semibold shadow-md transition hover:opacity-90 active:opacity-80 @xl:w-fit"
              style={{ backgroundColor: hero.ink, color: accentCss(accent), textShadow: "none" }}
            >
              {design.cta.label}
              <ExternalLink className="size-4" aria-hidden />
            </a>
          )}
        </div>
        {event.soldOut && (
          <span
            // At the bottom right on a phone, clear of the "POR …" line at the top.
            className="absolute right-4 bottom-5 rotate-[-12deg] rounded-xl border-4 px-2.5 py-0.5 text-lg font-black tracking-widest uppercase shadow-lg @xl:top-6 @xl:right-5 @xl:bottom-auto @xl:px-3 @xl:py-1 @xl:text-2xl"
            style={{ borderColor: hero.ink }}
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

      {shownSections(design).map((kind) => (
        <Fragment key={kind}>{sections[kind]()}</Fragment>
      ))}
    </div>
  );
}

