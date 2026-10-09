"use client";

import { ChevronDown } from "lucide-react";
import {
  useId,
  type ComponentProps,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

import { cn } from "@/lib/cn";
import { texts } from "@/texts/pt-BR";

export const controlClass = cn(
  // 16px on phones: iOS zooms into any field with smaller text.
  "w-full rounded-xl border border-border-strong bg-surface px-3.5 text-base text-fg shadow-xs transition sm:text-[15px]",
  "placeholder:text-fg-subtle hover:border-fg-subtle/60",
  "focus:border-brand focus:ring-4 focus:ring-ring focus:outline-none",
  "disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-danger",
);

/** A labelled form control. The label wraps the control, so `getByLabel` and screen readers find it. */
export function Field({
  label,
  children,
  hint,
  optional = false,
  className,
}: {
  label: string;
  children: ReactNode;
  hint?: ReactNode;
  optional?: boolean;
  className?: string | undefined;
}) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <span className="flex items-baseline gap-1.5 text-sm font-medium text-fg">
        {label}
        {optional && <span className="text-xs font-normal text-fg-subtle">({texts.common.optional})</span>}
      </span>
      {children}
      {hint !== undefined && <span className="text-xs leading-relaxed text-fg-muted">{hint}</span>}
    </label>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  if (props.type === "color") {
    return (
      <span className="flex h-11 items-center gap-2 rounded-xl border border-border-strong bg-surface px-1.5 shadow-xs focus-within:border-brand focus-within:ring-4 focus-within:ring-ring">
        <input
          className="size-8 cursor-pointer appearance-none rounded-lg border-0 bg-transparent p-0 [&::-moz-color-swatch]:rounded-md [&::-moz-color-swatch]:border [&::-moz-color-swatch]:border-black/15 [&::-webkit-color-swatch]:rounded-md [&::-webkit-color-swatch]:border [&::-webkit-color-swatch]:border-black/15 [&::-webkit-color-swatch-wrapper]:p-0"
          {...props}
        />
        <span className="font-mono text-sm text-fg-muted uppercase">{String(props.value ?? "")}</span>
      </span>
    );
  }
  return <input className={cn(controlClass, "h-11", className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(controlClass, "min-h-24 py-2.5 leading-relaxed", className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative flex">
      <select className={cn(controlClass, "h-11 appearance-none pr-10", className)} {...props}>
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-fg-muted" />
    </span>
  );
}

export function NumberInput({
  value,
  onChange,
  step = 0.5,
  min,
  max,
  suffix,
  className,
  ...rest
}: {
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
  className?: string | undefined;
  "aria-label"?: string;
  required?: boolean;
}) {
  return (
    <span className="relative flex">
      <input
        className={cn(controlClass, "h-11 tabular", suffix !== undefined && "pr-12", className)}
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        max={max}
        value={Number.isFinite(value) ? value : ""}
        onChange={(event) => {
          onChange(event.target.valueAsNumber);
        }}
        {...rest}
      />
      {suffix !== undefined && (
        <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-sm text-fg-subtle">{suffix}</span>
      )}
    </span>
  );
}

/** An accessible on/off switch with a label and an optional description. */
export function Switch({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="flex flex-col gap-0.5">
        <label htmlFor={id} className="cursor-pointer text-sm font-medium text-fg">
          {label}
        </label>
        {description !== undefined && <span className="text-xs text-fg-muted">{description}</span>}
      </span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => {
          onChange(!checked);
        }}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors",
          checked ? "bg-brand" : "bg-surface-3",
        )}
      >
        <span
          className={cn(
            "inline-block size-5 rounded-full bg-white shadow-sm transition-transform",
            checked ? "translate-x-5.5" : "translate-x-0.5",
          )}
        />
      </button>
    </div>
  );
}
