"use client";

import type { EventKind } from "@ingressoimpresso/api-types";
import {
  Activity,
  Award,
  Ban,
  BarChart3,
  FileDown,
  IdCard,
  LayoutDashboard,
  Layers,
  ListChecks,
  Send,
  Smartphone,
  Tags,
  Ticket,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

import { SectionNav, type NavGroup } from "@/components/panel/section-nav";
import { event as eventTexts } from "@/texts/pt-BR/event";

import { TAB_GROUPS, tabHint, tabLabel, tabsOf, type Tab } from "./tabs";

export const TAB_ICONS: Record<Tab, LucideIcon> = {
  overview: LayoutDashboard,
  design: Ticket,
  batches: Layers,
  categories: Tags,
  sellers: Users,
  digital: Send,
  voids: Ban,
  files: FileDown,
  door: Smartphone,
  live: Activity,
  guests: ListChecks,
  report: BarChart3,
  team: UsersRound,
  credentials: IdCard,
  certificates: Award,
};

/** The sections of an event, grouped as the work goes (ADR 0087). */
export function EventNav({
  kind,
  digitalOnly,
  current,
  attention,
  live,
  onSelect,
}: {
  kind: EventKind | undefined;
  /** Digital tickets only (ADR 0123). */
  digitalOnly: boolean;
  current: Tab;
  /** Sections where the checklist still misses something the user can do (ADR 0078). */
  attention: ReadonlySet<Tab>;
  /** It is the day of the event: the door may be working. */
  live: boolean;
  onSelect: (tab: Tab) => void;
}) {
  const t = eventTexts.sections;
  const groups: NavGroup<Tab>[] = TAB_GROUPS.map((group) => ({
    key: group.key,
    label: t.groups[group.key],
    items: tabsOf(kind, group.tabs, digitalOnly).map((tab) => ({
      key: tab,
      label: tabLabel(tab, kind),
      hint: tabHint(tab, kind),
      icon: TAB_ICONS[tab],
      mark:
        tab === "live" && live
          ? { kind: "live", label: t.marks.live }
          : attention.has(tab)
            ? { kind: "attention", label: t.marks.attention }
            : undefined,
    })),
  }));
  return <SectionNav label={t.title} groups={groups} current={current} onSelect={onSelect} sticky />;
}
