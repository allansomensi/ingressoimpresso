import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export function Card({
  children,
  className,
  padded = true,
}: {
  children: ReactNode;
  className?: string | undefined;
  padded?: boolean;
}) {
  return (
    <section className={cn("rounded-2xl border border-border bg-surface shadow-xs", padded && "p-5 sm:p-6", className)}>
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  description,
  icon: Icon,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  className?: string | undefined;
}) {
  return (
    <div className={cn("mb-5 flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="flex min-w-0 items-start gap-3">
        {Icon !== undefined && (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-soft-fg">
            <Icon aria-hidden className="size-[18px]" />
          </span>
        )}
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="text-base font-semibold tracking-tight text-fg">{title}</h2>
          {description !== undefined && <p className="text-sm leading-relaxed text-fg-muted">{description}</p>}
        </div>
      </div>
      {actions !== undefined && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1.5">
        {eyebrow}
        <h1 className="text-2xl font-semibold tracking-tight text-balance text-fg sm:text-3xl">{title}</h1>
        {description !== undefined && <div className="max-w-2xl text-[15px] leading-relaxed text-fg-muted">{description}</div>}
      </div>
      {actions !== undefined && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Stat({
  label,
  value,
  hint,
  icon: Icon,
  tone = "brand",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: "brand" | "success" | "warning" | "danger";
}) {
  const toneClass = {
    brand: "bg-brand-soft text-brand-soft-fg",
    success: "bg-success-soft text-success-fg",
    warning: "bg-warning-soft text-warning-fg",
    danger: "bg-danger-soft text-danger-fg",
  }[tone];
  return (
    <div className="flex min-w-0 items-start justify-between gap-3 rounded-2xl border border-border bg-surface p-3.5 shadow-xs sm:p-5">
      <div className="flex min-w-0 flex-col gap-0.5 sm:gap-1">
        <span className="text-[13px] leading-snug font-medium text-fg-muted">{label}</span>
        <span className="truncate text-xl font-semibold tracking-tight text-fg tabular sm:text-2xl">{value}</span>
        {hint !== undefined && <span className="min-w-0 text-xs leading-snug [overflow-wrap:anywhere] text-fg-subtle">{hint}</span>}
      </div>
      {Icon !== undefined && (
        <span className={cn("hidden size-9 shrink-0 items-center justify-center rounded-xl sm:flex", toneClass)}>
          <Icon aria-hidden className="size-[18px]" />
        </span>
      )}
    </div>
  );
}

/** Intro paragraph at the top of a tab. */
export function Lead({ children }: { children: ReactNode }) {
  return <p className="max-w-3xl text-[15px] leading-relaxed text-fg-muted">{children}</p>;
}

/** A list of rows inside a card, divided by hairlines. */
export function List({ children, className }: { children: ReactNode; className?: string | undefined }) {
  return (
    <ul className={cn("divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-xs", className)}>
      {children}
    </ul>
  );
}

export function ListItem({ children, className }: { children: ReactNode; className?: string | undefined }) {
  return <li className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 sm:px-5", className)}>{children}</li>;
}
