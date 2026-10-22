import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/cn";

import { Spinner } from "./spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "danger-ghost" | "inverse";
export type ButtonSize = "sm" | "md" | "lg" | "icon" | "icon-sm";

// `active:` gives touch screens the feedback that `hover:` (mouse only in Tailwind 4) cannot.
const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-solid text-brand-fg shadow-sm shadow-brand/25 hover:bg-brand-solid/90 active:translate-y-px active:bg-brand-solid/85",
  secondary:
    "border border-border-strong bg-surface text-fg shadow-xs hover:bg-surface-2 active:translate-y-px active:bg-surface-3",
  ghost: "text-fg-muted hover:bg-surface-2 hover:text-fg active:bg-surface-3 active:text-fg",
  danger: "bg-danger-solid text-white shadow-sm hover:opacity-90 active:translate-y-px active:opacity-85",
  "danger-ghost": "text-danger-fg hover:bg-danger-soft active:bg-danger-soft",
  inverse: "bg-white text-[#0e0d14] shadow-sm hover:bg-white/90 active:translate-y-px active:bg-white/85",
};

// Touch screens (`pointer-coarse`) get bigger buttons: 44 px, the size of a fingertip
// (ADR 0060). A mouse keeps the compact desktop sizes.
const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 rounded-lg px-3 text-[13px] pointer-coarse:h-11 pointer-coarse:px-3.5 pointer-coarse:text-sm",
  md: "h-10 gap-2 rounded-xl px-4 text-sm pointer-coarse:h-11",
  lg: "h-12 gap-2 rounded-xl px-6 text-base",
  icon: "size-9 rounded-lg pointer-coarse:size-11",
  // A square as tall as `sm` (menus in cards and toolbars), with a 44 px area to tap.
  "icon-sm": "relative size-8 rounded-lg touch-target pointer-coarse:size-10",
};

/** Shared look of buttons and button-like links. */
export function buttonClass({
  variant = "primary",
  size = "md",
  className,
}: { variant?: ButtonVariant | undefined; size?: ButtonSize | undefined; className?: string | undefined } = {}): string {
  return cn(
    "inline-flex shrink-0 items-center justify-center font-semibold whitespace-nowrap transition-all duration-150 select-none",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
    "disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant | undefined;
  size?: ButtonSize | undefined;
  /** Shows a spinner and disables the button. */
  loading?: boolean | undefined;
  /** Icon before the label. */
  icon?: ReactNode;
};

export function Button({ className, variant, size, loading = false, icon, children, disabled, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={buttonClass({ variant, size, className })}
      disabled={disabled === true || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}

export function ButtonLink({
  className,
  variant,
  size,
  icon,
  children,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant | undefined; size?: ButtonSize | undefined; icon?: ReactNode }) {
  return (
    <Link className={buttonClass({ variant, size, className })} {...props}>
      {icon}
      {children}
    </Link>
  );
}
