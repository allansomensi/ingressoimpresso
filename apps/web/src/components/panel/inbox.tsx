"use client";

import type { AnnouncementDto, AnnouncementLevel, NotificationDto } from "@ingressoimpresso/api-types";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Bell, CheckCircle2, Coins, Gift, ImageOff, Info, Megaphone, ShieldCheck, Sparkles, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { ChangelogEntry } from "@/components/changelog/changelog-page";
import { Popover } from "@/components/ui";
import { markSeen, unreadCount, useChangelog, useSeenAt } from "@/lib/changelog";
import { cn } from "@/lib/cn";
import { money, shortDateTime } from "@/lib/format";
import { markInboxRead, safeLink, useInbox } from "@/lib/platform";
import { texts } from "@/texts/pt-BR";

const t = texts.inbox;
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
  switch (item.kind) {
    case "art_rejected":
      return {
        title: t.kinds.artRejected,
        body: t.kinds.artRejectedBody(event, note),
        icon: ImageOff,
        href: eventId === "" ? null : `/painel/eventos/${eventId}?aba=ingresso`,
      };
    case "art_approved":
      return { title: t.kinds.artApproved, body: t.kinds.artApprovedBody(event), icon: ShieldCheck, href: eventId === "" ? null : `/painel/eventos/${eventId}?aba=arquivos` };
    case "credits_granted":
      return { title: t.kinds.credits, body: t.kinds.creditsBody(money(number(item.data, "amountCents")), note), icon: Coins, href: "/painel/conta" };
    case "free_tickets_granted":
      return { title: t.kinds.freeTickets, body: t.kinds.freeTicketsBody(number(item.data, "tickets")), icon: Gift, href: "/painel/conta" };
    case "discount_granted":
      return { title: t.kinds.discount, body: t.kinds.discountBody(number(item.data, "percent")), icon: Gift, href: "/painel/conta" };
    case "price_change":
      return { title: t.kinds.prices, body: t.kinds.pricesBody, icon: Coins, href: "/painel/conta" };
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
    <Link href={href} className="flex gap-3 rounded-xl px-3 py-3 transition hover:bg-surface-2">
      {content}
    </Link>
  );
}

/** The bell of the panel: announcements and notifications of the account, and the release notes. */
export function Inbox() {
  const client = useQueryClient();
  const inbox = useInbox(true);
  const changelog = useChangelog();
  const seenAt = useSeenAt();
  const [view, setView] = useState<"alerts" | "news">("alerts");
  const news = changelog.data ?? [];
  const newsUnread = seenAt === undefined ? 0 : unreadCount(news, seenAt);
  const alerts = [
    ...(inbox.data?.announcements ?? []).map((item) => ({ at: item.startsAt, node: <AnnouncementItem key={`a-${item.id}`} item={item} /> })),
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
        triggerClassName="relative flex size-10 items-center justify-center rounded-full text-fg-muted transition hover:bg-surface-2 hover:text-fg"
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
                {news.length === 0 && <p className="px-3 py-8 text-center text-sm text-fg-muted">{texts.changelog.empty}</p>}
              </div>
              <Link href="/novidades" className="mt-1 rounded-xl px-3 py-2.5 text-center text-sm font-medium text-brand transition hover:bg-surface-2">
                {texts.changelog.seeAll}
              </Link>
            </>
          )}
        </div>
      </Popover>
    </div>
  );
}
