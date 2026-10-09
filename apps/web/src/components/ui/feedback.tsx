import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { texts } from "@/texts/pt-BR";

export type Tone = "neutral" | "brand" | "success" | "warning" | "danger";

const BADGE: Record<Tone, string> = {
  neutral: "bg-surface-2 text-fg-muted ring-border",
  brand: "bg-brand-soft text-brand-soft-fg ring-brand/20",
  success: "bg-success-soft text-success-fg ring-success/20",
  warning: "bg-warning-soft text-warning-fg ring-warning/25",
  danger: "bg-danger-soft text-danger-fg ring-danger/20",
};

const DOT: Record<Tone, string> = {
  neutral: "bg-fg-subtle",
  brand: "bg-brand",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

export function Badge({
  tone = "neutral",
  dot = false,
  pulse = false,
  children,
  className,
}: {
  tone?: Tone;
  dot?: boolean;
  pulse?: boolean;
  children: ReactNode;
  className?: string | undefined;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        BADGE[tone],
        className,
      )}
    >
      {dot && (
        <span className="relative flex size-1.5">
          {pulse && <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-75", DOT[tone])} />}
          <span className={cn("relative inline-flex size-1.5 rounded-full", DOT[tone])} />
        </span>
      )}
      {children}
    </span>
  );
}

const ALERT: Record<Exclude<Tone, "neutral">, { box: string; icon: LucideIcon }> = {
  brand: { box: "border-brand/20 bg-brand-soft text-brand-soft-fg", icon: Info },
  success: { box: "border-success/25 bg-success-soft text-success-fg", icon: CheckCircle2 },
  warning: { box: "border-warning/30 bg-warning-soft text-warning-fg", icon: AlertTriangle },
  danger: { box: "border-danger/25 bg-danger-soft text-danger-fg", icon: XCircle },
};

export function Alert({
  tone = "brand",
  title,
  children,
  action,
  className,
}: {
  tone?: Exclude<Tone, "neutral">;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string | undefined;
}) {
  const { box, icon: Icon } = ALERT[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn("flex items-start gap-3 rounded-xl border px-4 py-3 text-sm animate-fade-in", box, className)}
    >
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {title !== undefined && <p className="font-semibold">{title}</p>}
        {children !== undefined && <div className="leading-relaxed opacity-90">{children}</div>}
      </div>
      {action}
    </div>
  );
}

/** The Portuguese message of an API (or unexpected) error. */
export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.userMessage : texts.errors.generic;
}

export function ErrorMessage({ error, className }: { error: unknown; className?: string | undefined }) {
  if (error === null || error === undefined) {
    return null;
  }
  return (
    <Alert tone="danger" className={className}>
      {errorMessage(error)}
    </Alert>
  );
}

export function Skeleton({ className }: { className?: string | undefined }) {
  return <div aria-hidden className={cn("animate-pulse rounded-lg bg-surface-3/70", className)} />;
}

/** Placeholder while a tab loads. */
export function LoadingBlock({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label={texts.common.loading}>
      <Skeleton className="h-28 w-full rounded-2xl" />
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-16 w-full rounded-2xl" />
      ))}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string | undefined;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border-strong bg-surface/50 px-6 py-12 text-center",
        className,
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-brand-soft-fg">
        <Icon aria-hidden className="size-6" />
      </span>
      <div className="flex max-w-sm flex-col gap-1">
        <p className="font-semibold text-fg">{title}</p>
        {description !== undefined && <p className="text-sm leading-relaxed text-fg-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
