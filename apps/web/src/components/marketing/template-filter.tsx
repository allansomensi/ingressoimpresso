"use client";

import { useState, type ReactNode } from "react";

import { segmentTabIndex, segmentedKeys } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { TemplateCategory } from "@/lib/templates/catalog";
import { templateGallery as templateGalleryTexts } from "@/texts/pt-BR/template-gallery";
import { templates as templatesTexts } from "@/texts/pt-BR/templates";

const t = templateGalleryTexts;

export interface FilterItem {
  key: string;
  categories: readonly TemplateCategory[];
  /** The card, rendered on the server. */
  card: ReactNode;
}

/**
 * The template grid of /modelos with a row of kinds of event on top. Every card is in the page's
 * HTML (the filter starts on "all"), so search engines still see a link to each template.
 */
export function TemplateFilter({ items }: { items: readonly FilterItem[] }) {
  const [category, setCategory] = useState<TemplateCategory | null>(null);
  const categories = (Object.keys(templatesTexts.categories) as TemplateCategory[]).filter((option) =>
    items.some((item) => item.categories.includes(option)),
  );
  const shown = category === null ? items : items.filter((item) => item.categories.includes(category));
  const options: readonly (TemplateCategory | null)[] = [null, ...categories];

  return (
    <div className="flex flex-col gap-8">
      <div
        role="radiogroup"
        aria-label={t.filterLabel}
        onKeyDown={segmentedKeys(options, category, setCategory)}
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:justify-center sm:px-0"
      >
        {options.map((option) => {
          const checked = option === category;
          const count = option === null ? items.length : items.filter((item) => item.categories.includes(option)).length;
          return (
            <button
              key={option ?? "all"}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={segmentTabIndex(options, category, option)}
              onClick={() => {
                setCategory(option);
              }}
              className={cn(
                "shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition pointer-coarse:min-h-11 pointer-coarse:py-2.5",
                checked
                  ? "bg-brand-solid text-brand-fg shadow-sm"
                  : "bg-surface-2 text-fg-muted hover:bg-surface-3 hover:text-fg active:bg-surface-3 active:text-fg",
              )}
            >
              {option === null ? templatesTexts.all : templatesTexts.categories[option]}
              <span className={cn("ml-1.5 tabular-nums", checked ? "text-brand-fg/80" : "text-fg-subtle")}>{count}</span>
            </button>
          );
        })}
      </div>
      {/* The new count, for screen readers: the chips above only change visually. */}
      <p className="sr-only" aria-live="polite">
        {t.shownCount(shown.length)}
      </p>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((item) => (
          <li key={item.key}>{item.card}</li>
        ))}
      </ul>
    </div>
  );
}
