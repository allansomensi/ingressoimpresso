"use client";

import type { AnnouncementDto, AnnouncementLevel, NotificationDto } from "@ingressoimpresso/api-types";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  CalendarX,
  CheckCircle2,
  Coins,
  Gift,
  ImageOff,
  Info,
  Megaphone,
  ShieldCheck,
  Sparkles,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { ChangelogEntry } from "@/components/changelog/changelog-page";
import { Popover } from "@/components/ui";
import { latestSeen, markSeen, unreadCount, useChangelog, useSeenAt } from "@/lib/changelog";
import { cn } from "@/lib/cn";
import { spokenDate } from "@/lib/event-change";
import { money, shortDateTime } from "@/lib/format";
import { isUuid } from "@/lib/api";
import { markInboxRead, safeLink, useInbox } from "@/lib/platform";
import { areaList, parseAreas } from "@/lib/team";
import { changelog as changelogTexts } from "@/texts/pt-BR/changelog";
import { inbox as inboxTexts } from "@/texts/pt-BR/inbox";

const t = inboxTexts;
const NEWS_SHOWN = 4;

export const LEVEL_ICON: Record<AnnouncementLevel, LucideIcon> = {
  info: Info,
  success: Sparkles,
  warning: AlertTriangle,
  critical: AlertTriangle,
};

export const LEVEL_TONE: Record<AnnouncementLevel, string> = {
  info: "bg-brand-soft text-brand-soft-fg",
  success: "bg-success-soft text-success-fg",
  warning: "bg-warning-soft text-warning-fg",
  critical: "bg-danger-soft text-danger-fg",
};

function text(data: Record<string, unknown>, key: string): string {
  const value = data[key];
  return typeof value === "string" ? value : "";
}

function number(data: Record<string, unknown>, key: string): number {
  const value = data[key];
  return typeof value === "number" ? value : 0;
}

/** Title, text, icon and link of a notification, written here from its kind and data. */
export function describeNotification(item: NotificationDto): { title: string; body: string; icon: LucideIcon; href: string | null } {
  const event = text(item.data, "eventName");
  const eventId = text(item.data, "eventId");
  const note = text(item.data, "note");
  // The organization's logo has no event (ADR 0064): its decision opens the profile.
  const logo = item.data["logo"] === true;
  const eventLink = isUuid(eventId) ? `/painel/eventos/${eventId}` : null;
  switch (item.kind) {
    case "art_rejected":
      if (logo) {
        return { title: t.kinds.logoRejected, body: t.kinds.logoRejectedBody(note), icon: ImageOff, href: "/painel/organizacao" };
      }
      return {
        title: t.kinds.artRejected,
        body: t.kinds.artRejectedBody(event, note),
        icon: ImageOff,
        href: eventId === "" ? null : `/painel/eventos/${eventId}?aba=ingresso`,
      };
    case "art_approved":
      if (logo) {
        return { title: t.kinds.logoApproved, body: t.kinds.logoApprovedBody, icon: ShieldCheck, href: "/painel/organizacao" };
      }
      return { title: t.kinds.artApproved, body: t.kinds.artApprovedBody(event), icon: ShieldCheck, href: eventId === "" ? null : `/painel/eventos/${eventId}?aba=arquivos` };
    case "credits_granted":
      return { title: t.kinds.credits, body: t.kinds.creditsBody(money(number(item.data, "amountCents")), note), icon: Coins, href: "/painel/conta" };
    case "free_tickets_granted":
      return { title: t.kinds.freeTickets, body: t.kinds.freeTicketsBody(number(item.data, "tickets")), icon: Gift, href: "/painel/conta" };
    case "discount_granted":
      return { title: t.kinds.discount, body: t.kinds.discountBody(number(item.data, "percent")), icon: Gift, href: "/painel/conta" };
    case "price_change":
      return { title: t.kinds.prices, body: t.kinds.pricesBody, icon: Coins, href: "/painel/conta" };
    case "team_added":
      return {
        title: t.kinds.teamAdded,
        body: t.kinds.teamAddedBody(text(item.data, "by"), event, areaList(parseAreas(item.data["areas"]))),
        icon: UsersRound,
        href: isUuid(eventId) ? `/painel/eventos/${eventId}` : null,
      };
    case "event_postponed": {
      const startsAt = text(item.data, "startsAt");
      return {
        title: t.kinds.eventPostponed,
        body: t.kinds.eventPostponedBody(text(item.data, "by"), event, startsAt === "" ? "" : spokenDate(startsAt)),
        icon: CalendarClock,
        href: eventLink,
      };
    }
    case "event_canceled":
      return {
        title: t.kinds.eventCanceled,
        body: t.kinds.eventCanceledBody(text(item.data, "by"), event, text(item.data, "reason")),
        icon: CalendarX,
        href: eventLink,
      };
    // Refer and earn (ADR 0076): the referrer, or the account that came through the link.
    case "referral_rewarded": {
      const amount = money(number(item.data, "amountCents"));
      return item.data["role"] === "referrer"
        ? { title: t.kinds.referralReferrer, body: t.kinds.referralReferrerBody(amount, text(item.data, "who")), icon: Gift, href: "/painel/conta#indique" }
        : { title: t.kinds.referralReferred, body: t.kinds.referralReferredBody(amount, text(item.data, "organization")), icon: Gift, href: "/painel/conta" };
    }
    // The venue's capacity (ADR 0110): the live view of the event.
    case "capacity_near":
    case "capacity_full": {
      const full = item.kind === "capacity_full";
      const occupied = number(item.data, "occupied");
      const capacity = number(item.data, "capacity");
      return {
        title: full ? t.kinds.capacityFull : t.kinds.capacityNear,
        body: (full ? t.kinds.capacityFullBody : t.kinds.capacityNearBody)(event, occupied, capacity),
        icon: UsersRound,
        href: eventLink === null ? null : `${eventLink}?aba=ao-vivo`,
      };
    }
  }
}

function AnnouncementItem({ item }: { item: AnnouncementDto }) {
  const Icon = LEVEL_ICON[item.level];
  const href = safeLink(item.ctaUrl);
  return (
    <div className="flex gap-3 px-3 py-3">
      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-xl", LEVEL_TONE[item.level])}>
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex items-center gap-2 text-sm font-semibold text-fg">
          {item.title}
          {!item.seen && <span className="size-1.5 shrink-0 rounded-full bg-brand" aria-label={t.unreadDot} />}
        </p>
        <p className="line-clamp-4 text-sm leading-relaxed whitespace-pre-line text-fg-muted">{item.body}</p>
        <div className="flex items-center gap-3 text-xs text-fg-subtle">
          <span>{shortDateTime(item.startsAt)}</span>
          {href !== null && item.ctaLabel !== null && (
            <Link href={href} className="font-semibold text-brand hover:underline">
              {item.ctaLabel}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function NotificationItem({ item }: { item: NotificationDto }) {
  const { title, body, icon: Icon, href } = describeNotification(item);
  const content = (
    <>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-fg-muted">
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2 text-sm font-semibold text-fg">
          {title}
          {item.readAt === null && <span className="size-1.5 shrink-0 rounded-full bg-brand" aria-label={t.unreadDot} />}
        </span>
        <span className="text-sm leading-relaxed text-fg-muted">{body}</span>
        <span className="text-xs text-fg-subtle">{shortDateTime(item.createdAt)}</span>
      </span>
    </>
  );
  return href === null ? (
    <div className="flex gap-3 px-3 py-3">{content}</div>
  ) : (
    <Link href={href} className="flex gap-3 rounded-xl px-3 py-3 transition hover:bg-surface-2 active:bg-surface-2">
      {content}
    </Link>
  );
}

/** The bell of the panel: announcements and notifications of the account, and the release notes. */
export function Inbox() {
  const client = useQueryClient();
  const inbox = useInbox(true);
  const changelog = useChangelog();
  const localSeen = useSeenAt();
  const [view, setView] = useState<"alerts" | "news">("alerts");
  const news = changelog.data ?? [];
  // The account's "seen" (ADR 0088), or this browser's when it is later (the public page, or a
  // browser that saw the notes before the account kept them). Nothing counts until both are known.
  const accountSeen = inbox.data?.newsSeenAt;
  const seenAt = localSeen === undefined || accountSeen === undefined ? undefined : latestSeen(accountSeen, localSeen);
  const newsUnread = seenAt === undefined ? 0 : unreadCount(news, seenAt);
  // Seen here but not on the account yet (opening the bell marks this browser first): tell the
  // account, so other browsers and the next sign-in agree.
  const behind = seenAt !== undefined && seenAt !== null && seenAt !== accountSeen ? seenAt : null;

  useEffect(() => {
    if (behind !== null) {
      void markInboxRead(behind)
        .then(() => client.invalidateQueries({ queryKey: ["inbox"] }))
        .catch(() => undefined);
    }
  }, [behind, client]);
  const alerts = [
    ...(inbox.data?.announcements ?? []).filter((item) => item.bell).map((item) => ({ at: item.startsAt, node: <AnnouncementItem key={`a-${item.id}`} item={item} /> })),
    ...(inbox.data?.notifications ?? []).map((item) => ({ at: item.createdAt, node: <NotificationItem key={`n-${item.id}`} item={item} /> })),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const alertsUnread = inbox.data?.unread ?? 0;
  const unread = Math.min(99, alertsUnread + newsUnread);

  const opened = () => {
    const newest = news[0]?.publishedAt ?? null;
    if (newest !== null) {
      markSeen(newest);
    }
    if (alertsUnread > 0) {
      void markInboxRead().then(() => client.invalidateQueries({ queryKey: ["inbox"] }));
    }
  };

  return (
    <div onClickCapture={opened}>
      <Popover
        label={unread > 0 ? `${t.open}: ${t.unread(unread)}` : t.open}
        title={t.open}
        triggerClassName="relative flex size-10 items-center justify-center rounded-full text-fg-muted transition hover:bg-surface-2 hover:text-fg active:bg-surface-2 pointer-coarse:size-11"
        trigger={
          <>
            <Bell className="size-[19px]" aria-hidden />
            {unread > 0 && (
              <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-solid px-1 text-[10px] font-semibold text-brand-fg ring-2 ring-bg">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </>
        }
        panelClassName="w-[24rem] max-w-[calc(100vw-1rem)]"
      >
        <div className="flex flex-col">
          <div role="tablist" aria-label={t.open} className="mx-2 mt-1 mb-1 grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
            {(["alerts", "news"] as const).map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={view === item}
                onClick={() => {
                  setView(item);
                }}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-sm font-medium transition",
                  view === item ? "bg-surface text-fg shadow-xs" : "text-fg-muted hover:text-fg",
                )}
              >
                {item === "alerts" ? <Bell className="size-3.5" aria-hidden /> : <Megaphone className="size-3.5" aria-hidden />}
                {t.tabs[item]}
                {(item === "alerts" ? alertsUnread : newsUnread) > 0 && <span className="size-1.5 rounded-full bg-brand" aria-hidden />}
              </button>
            ))}
          </div>
          {view === "alerts" ? (
            alerts.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                <CheckCircle2 className="size-6 text-success" aria-hidden />
                <p className="text-sm text-fg-muted">{t.emptyAlerts}</p>
              </div>
            ) : (
              <div className="flex max-h-[60vh] flex-col divide-y divide-border overflow-y-auto max-sm:max-h-none">{alerts.map((item) => item.node)}</div>
            )
          ) : (
            <>
              <div className="flex max-h-[60vh] flex-col divide-y divide-border overflow-y-auto max-sm:max-h-none">
                {news.slice(0, NEWS_SHOWN).map((entry) => (
                  <div key={entry.id} className="px-3 py-3">
                    <ChangelogEntry entry={entry} compact />
                  </div>
                ))}
                {news.length === 0 && <p className="px-3 py-8 text-center text-sm text-fg-muted">{changelogTexts.empty}</p>}
              </div>
              <Link href="/novidades" className="mt-1 rounded-xl px-3 py-2.5 text-center text-sm font-medium text-brand transition hover:bg-surface-2 active:bg-surface-2">
                {changelogTexts.seeAll}
              </Link>
            </>
          )}
        </div>
      </Popover>
    </div>
  );
}
