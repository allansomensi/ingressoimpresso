/** Tabs of the event page and their `?aba=` slugs (the Stripe return URL uses `aba=lotes`). */
export const TABS = ["overview", "design", "batches", "categories", "sellers", "digital", "voids", "files", "door", "report", "team"] as const;
export type Tab = (typeof TABS)[number];

/** Tabs shown in the strip; the team opens from the event header (ADR 0055). */
export const STRIP_TABS: readonly Tab[] = TABS.filter((tab) => tab !== "team");

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
};

export function tabSlug(tab: Tab): string {
  return SLUGS[tab];
}

export function tabFromSlug(slug: string | null): Tab {
  return TABS.find((tab) => SLUGS[tab] === slug) ?? "overview";
}

/** Switches the event page to another tab. */
export type SelectTab = (tab: Tab) => void;
