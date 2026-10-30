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
  "certificates",
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
  certificates: "certificados",
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
  { key: "people", tabs: ["team", "credentials", "certificates"] },
] as const satisfies readonly { key: string; tabs: readonly Tab[] }[];

/**
 * Tabs an event of `kind` shows (ADR 0084): consumption tokens have no guest list (nobody enters
 * by name at a stall), credentials (ADR 0111) nor certificates (ADR 0113). An event of digital
 * tickets only (ADR 0123) has nothing to print and puts its digital tickets before the sellers.
 */
export function tabsOf(kind: EventKind | undefined, tabs: readonly Tab[] = TABS, digitalOnly = false): Tab[] {
  const shown = tabs.filter(
    (tab) =>
      (kind !== "tokens" || !(["guests", "credentials", "certificates"] as const).some((hidden) => hidden === tab)) &&
      !(digitalOnly && tab === "files"),
  );
  const sellers = shown.indexOf("sellers");
  const digital = shown.indexOf("digital");
  if (digitalOnly && sellers !== -1 && digital > sellers) {
    shown.splice(digital, 1);
    shown.splice(sellers, 0, "digital");
  }
  return shown;
}

/** The tab's name: "Ficha", "Produtos" and "Barracas" for consumption tokens (ADR 0084). */
export function tabLabel(tab: Tab, kind: EventKind | undefined): string {
  return forKind(eventTexts, eventTexts.tokens, kind).tabs[tab];
}

/** What the tab is for, in one line. */
export function tabHint(tab: Tab, kind: EventKind | undefined): string {
  return forKind(eventTexts, eventTexts.tokens, kind).sections.hints[tab];
}
