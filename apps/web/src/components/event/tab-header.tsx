"use client";

import { CircleHelp } from "lucide-react";
import type { ReactNode } from "react";

import { Popover } from "@/components/ui";
import { cn } from "@/lib/cn";
import { event as eventTexts } from "@/texts/pt-BR/event";

import { useEventKind } from "./access";
import { tabHint, tabLabel, type Tab } from "./tabs";

/** The id of a section's heading, which labels the section (`aria-labelledby`). */
export function tabHeadingId(tab: Tab): string {
  return `section-${tab}-title`;
}

/**
 * The top of a section of the event: its name, what it is for in one line and the actions that
 * belong to the whole section (ADR 0087). On smaller screens the name is already in the section
 * bar above, so only the line and the actions show. `help` is the longer explanation, behind a
 * question mark, for whoever wants it.
 */
export function TabHeader({
  tab,
  description,
  help,
  actions,
}: {
  tab: Tab;
  /** Replaces the one-line hint of the section. */
  description?: ReactNode;
  help?: string | undefined;
  actions?: ReactNode;
}) {
  const kind = useEventKind();
  // On smaller screens the bar above already names the section: with nothing to open or do, the
  // header has nothing to add there (the hidden name still labels the section for a reader).
  const quiet = actions === undefined && help === undefined;
  return (
    <header className={cn("flex flex-wrap items-start justify-between gap-x-6 gap-y-3", quiet && "max-lg:hidden")}>
      <div className="flex min-w-0 flex-1 basis-56 flex-col gap-1">
        <h2 id={tabHeadingId(tab)} className="text-xl font-semibold tracking-tight text-fg max-lg:sr-only">
          {tabLabel(tab, kind)}
        </h2>
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm leading-relaxed text-fg-muted">
          <span>{description ?? tabHint(tab, kind)}</span>
          {help !== undefined && (
            <Popover
              label={eventTexts.sections.help}
              align="start"
              triggerClassName="relative inline-flex size-6 items-center justify-center rounded-md text-fg-subtle transition touch-target hover:bg-surface-2 hover:text-fg active:bg-surface-2"
              trigger={<CircleHelp className="size-4" aria-hidden />}
              panelClassName="w-80 p-4"
            >
              <p className="px-2 py-1 text-sm leading-relaxed text-fg-muted sm:p-0">{help}</p>
            </Popover>
          )}
        </div>
      </div>
      {actions !== undefined && <div className="flex flex-wrap items-center gap-2 max-sm:w-full max-sm:*:flex-1">{actions}</div>}
    </header>
  );
}
