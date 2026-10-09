/**
 * "Novidades" (ADR 0031): published notes, and which ones this browser has already seen.
 *
 * "Seen" is the publication time of the newest note the person opened, kept in localStorage: no
 * account data, and a new browser simply shows the latest notes as new.
 */
import type { ChangelogEntryDto, ChangelogKind } from "@ingressoimpresso/api-types";
import { useQuery } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

import { api } from "@/lib/api";

const SEEN_KEY = "ingressoimpresso.news.seen";
const listeners = new Set<() => void>();
let memorySeen: string | null = null;

export const CHANGELOG_KINDS: readonly ChangelogKind[] = ["new", "improvement", "fix", "security"];

/** Published notes, newest first (no login). */
export function useChangelog() {
  return useQuery({
    queryKey: ["changelog"],
    queryFn: () => api<ChangelogEntryDto[]>("/api/changelog"),
    staleTime: 10 * 60_000,
  });
}

function readSeen(): string | null {
  try {
    return window.localStorage.getItem(SEEN_KEY) ?? memorySeen;
  } catch {
    return memorySeen;
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** Publication time of the newest note seen here (`null`: none yet; `undefined` on the server). */
export function useSeenAt(): string | null | undefined {
  return useSyncExternalStore(subscribe, readSeen, () => undefined);
}

/** Marks every note up to `publishedAt` as seen. */
export function markSeen(publishedAt: string): void {
  memorySeen = publishedAt;
  try {
    window.localStorage.setItem(SEEN_KEY, publishedAt);
  } catch {
    // Storage unavailable: remembered for this page only.
  }
  for (const listener of listeners) {
    listener();
  }
}

/** Notes published after `seenAt` (all of them, at most `cap`, when nothing was seen yet). */
export function unreadCount(entries: readonly ChangelogEntryDto[], seenAt: string | null, cap = 9): number {
  const seen = seenAt === null ? 0 : Date.parse(seenAt);
  return Math.min(cap, entries.filter((entry) => entry.publishedAt !== null && Date.parse(entry.publishedAt) > seen).length);
}

/** Paragraphs of a note's text (blank lines separate them). */
export function paragraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== "");
}
