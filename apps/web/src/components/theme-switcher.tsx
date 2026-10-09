"use client";

import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/cn";
import { setTheme, useTheme, type ThemePreference } from "@/lib/theme";
import { texts } from "@/texts/pt-BR";

const t = texts.theme;
const OPTIONS: readonly { value: ThemePreference; icon: LucideIcon }[] = [
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
  { value: "system", icon: Monitor },
];

/** Light / dark / system, as a segmented control (radio group). */
export function ThemeSwitcher({ className, labels = false }: { className?: string | undefined; labels?: boolean }) {
  const { preference } = useTheme();
  return (
    <div
      role="radiogroup"
      aria-label={t.label}
      className={cn("inline-flex items-center gap-0.5 rounded-full border border-border bg-surface-2 p-0.5", className)}
    >
      {OPTIONS.map(({ value, icon: Icon }) => {
        const selected = preference === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={t.options[value]}
            title={t.options[value]}
            onClick={() => {
              setTheme(value);
            }}
            className={cn(
              "inline-flex h-7 items-center justify-center gap-1.5 rounded-full text-xs font-medium transition",
              labels ? "flex-1 px-2.5" : "w-7",
              selected ? "bg-surface text-fg shadow-sm ring-1 ring-border" : "text-fg-subtle hover:text-fg",
            )}
          >
            <Icon className="size-3.5" aria-hidden />
            {labels && <span>{t.options[value]}</span>}
          </button>
        );
      })}
    </div>
  );
}
