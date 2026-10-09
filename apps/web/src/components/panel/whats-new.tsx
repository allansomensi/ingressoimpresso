"use client";

import { Bell } from "lucide-react";
import Link from "next/link";

import { ChangelogEntry } from "@/components/changelog/changelog-page";
import { Popover } from "@/components/ui";
import { markSeen, unreadCount, useChangelog, useSeenAt } from "@/lib/changelog";
import { texts } from "@/texts/pt-BR";

const t = texts.changelog;
const SHOWN = 4;

/** The bell of the panel: the latest notes, with a dot while there are unread ones. */
export function WhatsNew() {
  const changelog = useChangelog();
  const seenAt = useSeenAt();
  const entries = changelog.data ?? [];
  const unread = seenAt === undefined ? 0 : unreadCount(entries, seenAt);
  const newest = entries[0]?.publishedAt ?? null;
  if (entries.length === 0) {
    return null;
  }
  return (
    <div
      onClickCapture={() => {
        if (newest !== null) {
          markSeen(newest);
        }
      }}
    >
      <Popover
        label={unread > 0 ? `${t.open}: ${t.unread(unread)}` : t.open}
        triggerClassName="relative flex size-9 items-center justify-center rounded-full text-fg-muted transition hover:bg-surface-2 hover:text-fg"
        trigger={
          <>
            <Bell className="size-[18px]" aria-hidden />
            {unread > 0 && (
              <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-brand-solid text-[10px] font-semibold text-brand-fg ring-2 ring-bg">
                {unread}
              </span>
            )}
          </>
        }
        panelClassName="w-[min(24rem,calc(100vw-2rem))]"
      >
        <div className="flex flex-col">
          <p className="px-3 pt-2.5 pb-1 text-xs font-semibold tracking-wide text-fg-subtle uppercase">{t.latest}</p>
          <div className="flex max-h-[60vh] flex-col divide-y divide-border overflow-y-auto">
            {entries.slice(0, SHOWN).map((entry) => (
              <div key={entry.id} className="px-3 py-3">
                <ChangelogEntry entry={entry} compact />
              </div>
            ))}
          </div>
          <Link
            href="/novidades"
            className="mt-1 rounded-xl px-3 py-2.5 text-center text-sm font-medium text-brand transition hover:bg-surface-2"
          >
            {t.seeAll}
          </Link>
        </div>
      </Popover>
    </div>
  );
}
