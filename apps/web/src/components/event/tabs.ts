/** Tabs of the event page and their `?aba=` slugs (the Stripe return URL uses `aba=lotes`). */
export const TABS = ["overview", "design", "batches", "sellers", "voids", "files", "door", "report"] as const;
export type Tab = (typeof TABS)[number];

const SLUGS: Record<Tab, string> = {
  overview: "visao-geral",
  design: "ingresso",
  batches: "lotes",
  sellers: "vendedores",
  voids: "cancelamentos",
  files: "arquivos",
  door: "portaria",
  report: "relatorio",
};

export function tabSlug(tab: Tab): string {
  return SLUGS[tab];
}

export function tabFromSlug(slug: string | null): Tab {
  return TABS.find((tab) => SLUGS[tab] === slug) ?? "overview";
}

/** Switches the event page to another tab. */
export type SelectTab = (tab: Tab) => void;
