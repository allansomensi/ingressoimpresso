import type { EventKind } from "@ingressoimpresso/api-types";

import { forKind } from "@/lib/event-kind";
import { event as eventTexts } from "@/texts/pt-BR/event";

/** Tabs of the event page and their `?aba=` slugs (the Stripe return URL uses `aba=lotes`). */
export const TABS = [
  "overview",
  "design",
  "batches",
  "categories",
  "sellers",
  "digital",
  "voids",
  "files",
  "door",
  "live",
  "guests",
  "report",
  "team",
  "credentials",
] as const;
export type Tab = (typeof TABS)[number];

const SLUGS: Record<Tab, string> = {
  overview: "visao-geral",
  design: "ingresso",
  batches: "lotes",
  sellers: "vendedores",
  digital: "digitais",
  voids: "cancelamentos",
  files: "arquivos",
  door: "portaria",
  report: "relatorio",
  categories: "categorias",
  team: "equipe",
  live: "ao-vivo",
  guests: "lista",
  credentials: "credenciais",
};

export function tabSlug(tab: Tab): string {
  return SLUGS[tab];
}

export function tabFromSlug(slug: string | null): Tab {
  return TABS.find((tab) => SLUGS[tab] === slug) ?? "overview";
}

/** Switches the event page to another tab. */
export type SelectTab = (tab: Tab) => void;

/** Every tab grouped as the work goes: the sections of the event page (ADRs 0060, 0087). */
export const TAB_GROUPS = [
  { key: "prepare", tabs: ["overview", "design", "batches", "categories"] },
  { key: "sell", tabs: ["sellers", "digital", "voids", "files"] },
  { key: "day", tabs: ["door", "live", "guests", "report"] },
  { key: "people", tabs: ["team", "credentials"] },
] as const satisfies readonly { key: string; tabs: readonly Tab[] }[];

/**
 * Tabs an event of `kind` shows (ADR 0084): consumption tokens have no guest list (nobody enters
 * by name at a stall) nor credentials (ADR 0111).
 */
export function tabsOf(kind: EventKind | undefined, tabs: readonly Tab[] = TABS): Tab[] {
  return tabs.filter((tab) => kind !== "tokens" || (tab !== "guests" && tab !== "credentials"));
}

/** The tab's name: "Ficha", "Produtos" and "Barracas" for consumption tokens (ADR 0084). */
export function tabLabel(tab: Tab, kind: EventKind | undefined): string {
  return forKind(eventTexts, eventTexts.tokens, kind).tabs[tab];
}

/** What the tab is for, in one line. */
export function tabHint(tab: Tab, kind: EventKind | undefined): string {
  return forKind(eventTexts, eventTexts.tokens, kind).sections.hints[tab];
}
