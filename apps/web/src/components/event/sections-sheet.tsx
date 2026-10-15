"use client";

import type { EventKind } from "@ingressoimpresso/api-types";
import { LayoutGrid, type LucideIcon } from "lucide-react";

import { Popover } from "@/components/ui";
import { cn } from "@/lib/cn";
import { event as eventTexts } from "@/texts/pt-BR/event";

import { TAB_GROUPS, tabHint, tabLabel, tabsOf, type Tab } from "./tabs";

const t = eventTexts.sections;

/**
 * Phones see three or four tabs of the strip at a time, and narrower computers miss the last ones:
 * this sheet (a panel on larger screens) shows all of them at once, grouped as the work goes and
 * with what each one is for (ADR 0060).
 */
export function SectionsSheet({
  current,
  icons,
  kind,
  onSelect,
}: {
  current: Tab;
  icons: Record<Tab, LucideIcon>;
  /** Consumption tokens name some tabs differently and have no guest list (ADR 0084). */
  kind?: EventKind;
  onSelect: (tab: Tab) => void;
}) {
  return (
    <Popover
      label={t.open}
      title={t.title}
      trigger={<LayoutGrid className="size-5" aria-hidden />}
      triggerClassName="flex size-11 items-center justify-center rounded-xl text-fg-muted transition hover:bg-surface-2 hover:text-fg active:bg-surface-2 pointer-fine:size-9"
      panelClassName="w-80 p-2"
    >
      <div className="flex flex-col gap-3 pb-1">
        {TAB_GROUPS.map((group) => (
          <section key={group.key} aria-label={t.groups[group.key]}>
            <h3 className="px-3 pb-1 text-xs font-semibold tracking-wide text-fg-subtle uppercase">{t.groups[group.key]}</h3>
            <ul className="flex flex-col">
              {tabsOf(kind, group.tabs).map((tab) => {
                const Icon = icons[tab];
                const selected = tab === current;
                return (
                  <li key={tab}>
                    <button
                      type="button"
                      // Closes the sheet (FloatingPanel) once the tab is picked.
                      data-dismiss
                      aria-current={selected ? "true" : undefined}
                      onClick={() => {
                        onSelect(tab);
                      }}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition",
                        selected ? "bg-brand-soft text-brand-soft-fg" : "text-fg hover:bg-surface-2 active:bg-surface-2",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-9 shrink-0 items-center justify-center rounded-lg",
                          selected ? "bg-brand-solid text-brand-fg" : "bg-surface-2 text-fg-muted",
                        )}
                      >
                        <Icon className="size-[18px]" aria-hidden />
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="text-[15px] leading-snug font-medium">{tabLabel(tab, kind)}</span>
                        <span className={cn("truncate text-[13px]", selected ? "text-brand-soft-fg" : "text-fg-muted")}>{tabHint(tab, kind)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </Popover>
  );
}
