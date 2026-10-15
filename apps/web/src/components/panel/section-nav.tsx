"use client";

import { ChevronDown, type LucideIcon } from "lucide-react";

import { Popover } from "@/components/ui";
import { cn } from "@/lib/cn";

/** A mark beside a section's name: something to do there, something happening now, or a count. */
export type NavMark = { kind: "attention" | "live"; label: string } | { kind: "count"; value: number; label: string };

export interface NavItem<K extends string> {
  key: K;
  label: string;
  /** What the section is for, under the name in the picker. */
  hint?: string | undefined;
  icon: LucideIcon;
  mark?: NavMark | undefined;
}

export interface NavGroup<K extends string> {
  key: string;
  label: string;
  items: readonly NavItem<K>[];
}

function Mark({ mark }: { mark: NavMark }) {
  if (mark.kind === "count") {
    return (
      <span
        className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-danger-solid px-1.5 text-[11px] font-semibold text-white tabular"
        aria-label={mark.label}
      >
        {mark.value > 99 ? "99+" : mark.value}
      </span>
    );
  }
  return (
    <span className="relative flex size-2 shrink-0" role="img" aria-label={mark.label}>
      {mark.kind === "live" && <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75" />}
      <span className={cn("relative inline-flex size-2 rounded-full", mark.kind === "live" ? "bg-success" : "bg-warning")} />
    </span>
  );
}

/**
 * The sections of a page with many of them (an event, the administration), grouped as the work
 * goes. Larger screens get a list down the side, with every section in sight; smaller ones get
 * one bar naming the current section, which opens the whole list as a sheet (ADR 0087).
 */
export function SectionNav<K extends string>({
  label,
  groups,
  current,
  onSelect,
  sticky = false,
}: {
  /** Name of the navigation ("Seções do evento"): the sidebar's label and the sheet's title. */
  label: string;
  groups: readonly NavGroup<K>[];
  current: K;
  onSelect: (key: K) => void;
  /** Keeps the bar of smaller screens under the page header while the content scrolls. */
  sticky?: boolean;
}) {
  const currentGroup = groups.find((group) => group.items.some((item) => item.key === current));
  const currentItem = currentGroup?.items.find((item) => item.key === current);
  const CurrentIcon = currentItem?.icon;
  // Something counted in another section (art waiting for review, say) shows on the bar too.
  const elsewhere = groups
    .flatMap((group) => group.items)
    .find((item) => item.key !== current && item.mark?.kind === "count" && item.mark.value > 0)?.mark;

  return (
    <>
      <nav aria-label={label} className="hidden lg:block">
        <ul className="flex flex-col gap-5">
          {groups.map((group) => (
            <li key={group.key}>
              <p className="mb-1 px-2.5 text-[11px] font-semibold tracking-wider text-fg-subtle uppercase">{group.label}</p>
              <ul className="flex flex-col gap-0.5">
                {group.items.map((item) => {
                  const selected = item.key === current;
                  return (
                    <li key={item.key}>
                      <button
                        type="button"
                        aria-current={selected ? "page" : undefined}
                        title={item.hint}
                        onClick={() => {
                          onSelect(item.key);
                        }}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm transition",
                          selected
                            ? "bg-brand-soft font-semibold text-brand-soft-fg"
                            : "font-medium text-fg-muted hover:bg-surface-2 hover:text-fg active:bg-surface-2",
                        )}
                      >
                        <item.icon aria-hidden className={cn("size-4 shrink-0", selected ? "text-brand" : "text-fg-subtle")} />
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        {item.mark !== undefined && <Mark mark={item.mark} />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      </nav>

      <div
        className={cn(
          "lg:hidden",
          sticky && "sticky top-[calc(4rem+env(safe-area-inset-top))] z-30 -mx-4 bg-bg/90 px-4 py-2 backdrop-blur-xl sm:-mx-6 sm:px-6",
        )}
      >
        <Popover
          label={currentItem === undefined ? label : `${label}: ${currentItem.label}`}
          title={label}
          align="start"
          triggerClassName="flex w-full items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2 text-left shadow-xs transition hover:border-border-strong active:bg-surface-2"
          trigger={
            <>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-soft-fg">
                {CurrentIcon !== undefined && <CurrentIcon className="size-[18px]" aria-hidden />}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[11px] font-medium tracking-wide text-fg-subtle uppercase">{currentGroup?.label}</span>
                <span className="truncate text-[15px] leading-snug font-semibold text-fg">{currentItem?.label}</span>
              </span>
              {currentItem?.mark !== undefined ? (
                <Mark mark={currentItem.mark} />
              ) : (
                elsewhere !== undefined && <span className="size-2 shrink-0 rounded-full bg-danger" role="img" aria-label={elsewhere.label} />
              )}
              <ChevronDown className="size-5 shrink-0 text-fg-muted" aria-hidden />
            </>
          }
          panelClassName="w-80 p-2"
        >
          <div className="flex flex-col gap-3 pb-1">
            {groups.map((group) => (
              <section key={group.key} aria-label={group.label}>
                <h3 className="px-3 pb-1 text-[11px] font-semibold tracking-wider text-fg-subtle uppercase">{group.label}</h3>
                <ul className="flex flex-col">
                  {group.items.map((item) => {
                    const selected = item.key === current;
                    return (
                      <li key={item.key}>
                        <button
                          type="button"
                          // Closes the sheet once a section is picked.
                          data-dismiss
                          aria-current={selected ? "page" : undefined}
                          onClick={() => {
                            onSelect(item.key);
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
                            <item.icon className="size-[18px]" aria-hidden />
                          </span>
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="text-[15px] leading-snug font-medium">{item.label}</span>
                            {item.hint !== undefined && (
                              <span className={cn("truncate text-[13px]", selected ? "text-brand-soft-fg" : "text-fg-muted")}>{item.hint}</span>
                            )}
                          </span>
                          {item.mark !== undefined && <Mark mark={item.mark} />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </Popover>
      </div>
    </>
  );
}
