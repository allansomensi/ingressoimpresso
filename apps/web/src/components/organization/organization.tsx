"use client";

import type { EventChangeDto, PublicOrganizationDto } from "@ingressoimpresso/api-types";
import { AtSign, CalendarClock, Globe, Mail, MessageCircle, XCircle } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";

import { buttonClass } from "@/components/ui";
import { fetchDataUrl } from "@/lib/api";
import { cn } from "@/lib/cn";
import { changeKind, spokenDate } from "@/lib/event-change";
import { initials } from "@/lib/format";
import { instagramUrl } from "@/lib/organization";
import { whatsappUrl } from "@/lib/share";
import { storeLogo, storedLogo } from "@/lib/ticket-pass";
import { eventChange as eventChangeTexts, profile as profileTexts, ticket as ticketTexts } from "@/texts/pt-BR";

const LOGOS_EVENT = "ingressoimpresso:logos";

function subscribeLogos(listener: () => void): () => void {
  window.addEventListener(LOGOS_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(LOGOS_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

/**
 * The organization's logo as a `data:` URL: kept in the browser after the first visit, so the
 * digital ticket shows it offline too (ADR 0064). `null` while loading, without a logo, or when
 * the logo is under review (the API answers 404). Logos never change under the same address.
 */
export function useLogo(path: string | null): string | null {
  const logo = useSyncExternalStore(
    subscribeLogos,
    () => (path === null ? null : storedLogo(path)),
    () => null,
  );
  useEffect(() => {
    if (path === null || storedLogo(path) !== null) {
      return;
    }
    fetchDataUrl(path)
      .then((data) => {
        storeLogo(path, data);
        window.dispatchEvent(new Event(LOGOS_EVENT));
      })
      .catch(() => undefined);
  }, [path]);
  return logo;
}

/** The logo in a white tile (initials without one), for a header of any colour. */
export function OrganizationLogo({
  organization,
  className,
}: {
  organization: Pick<PublicOrganizationDto, "name" | "logoPath">;
  className?: string | undefined;
}) {
  const logo = useLogo(organization.logoPath);
  if (organization.logoPath === null) {
    return null;
  }
  return (
    <span className={cn("flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-1 shadow-sm ring-1 ring-black/10", className)}>
      {logo === null ? (
        <span aria-hidden className="text-sm font-bold text-[#0e0d14]">
          {initials(organization.name)}
        </span>
      ) : (
        // A data: URL kept in the browser: next/image cannot optimize it.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt={profileTexts.logoAlt(organization.name)} className="size-full object-contain" />
      )}
    </span>
  );
}

/** "Falar com a organização" (WhatsApp) and the other public contacts, when there are any. */
export function OrganizationContact({ organization, message }: { organization: PublicOrganizationDto; message: string }) {
  const t = ticketTexts;
  const others = [
    organization.email === null ? null : { href: `mailto:${organization.email}`, icon: Mail, label: t.contactEmail, value: organization.email },
    organization.website === null
      ? null
      : { href: organization.website, icon: Globe, label: t.contactSite, value: organization.website.replace(/^https?:\/\//, "").replace(/\/$/, "") },
    organization.instagram === null
      ? null
      : { href: instagramUrl(organization.instagram), icon: AtSign, label: t.contactInstagram, value: `@${organization.instagram}` },
  ].filter((item) => item !== null);
  if (organization.whatsapp === null && others.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-3">
      {organization.whatsapp !== null && (
        <a
          href={whatsappUrl(message, organization.whatsapp)}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClass({ variant: "secondary", className: "w-full" })}
        >
          <MessageCircle />
          {t.contact}
        </a>
      )}
      {others.length > 0 && (
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border">
          {others.map(({ href, icon: Icon, label, value }) => (
            <li key={label}>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-11 items-center gap-3 px-3.5 py-2 text-sm transition hover:bg-surface-2 active:bg-surface-2"
              >
                <Icon aria-hidden className="size-4 shrink-0 text-fg-subtle" />
                <span className="shrink-0 text-fg-muted">{label}</span>
                <span className="ml-auto min-w-0 truncate font-medium text-fg">{value}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** What the public needs to know about a postponed or canceled event (ADR 0065). */
export function EventChangeNotice({
  change,
  startsAt,
  forSeller = false,
  className,
}: {
  change: EventChangeDto;
  startsAt: string;
  /** On the seller's page: what it means for the sales, not for a ticket. */
  forSeller?: boolean;
  className?: string | undefined;
}) {
  const t = eventChangeTexts.notice;
  const kind = changeKind(change, startsAt);
  if (kind === null) {
    return null;
  }
  const canceled = kind === "canceled";
  const reason = canceled ? change.cancelReason : change.postponeReason;
  const Icon = canceled ? XCircle : CalendarClock;
  return (
    <section
      role={canceled ? "alert" : "status"}
      className={cn(
        "flex gap-3 rounded-2xl border px-4 py-3.5",
        canceled ? "border-danger/30 bg-danger-soft text-danger-fg" : "border-warning/35 bg-warning-soft text-warning-fg",
        className,
      )}
    >
      <Icon aria-hidden className="mt-0.5 size-5 shrink-0" />
      <div className="flex min-w-0 flex-col gap-1 text-sm leading-relaxed">
        <h2 className="text-base font-semibold">{canceled ? t.canceledTitle : kind === "moved" ? t.movedTitle : t.postponedTitle}</h2>
        {!canceled && change.postponedFromStartsAt !== null && (
          <>
            <p className="font-semibold">{t.now(spokenDate(startsAt))}</p>
            <p className="line-through opacity-80">{t.was(spokenDate(change.postponedFromStartsAt))}</p>
          </>
        )}
        {reason !== null && <p>{eventChangeTexts.reasonLine(reason)}</p>}
        <p className="opacity-90">
          {forSeller ? (canceled ? t.sellerCanceledBody : t.sellerStillValid) : canceled ? t.canceledBody : t.stillValid}
        </p>
      </div>
    </section>
  );
}
