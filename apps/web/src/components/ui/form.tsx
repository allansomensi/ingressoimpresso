"use client";

import { ChevronDown } from "lucide-react";
import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";

import { cn } from "@/lib/cn";
import { common as commonTexts } from "@/texts/pt-BR/common";

export const controlClass = cn(
  // 16px wherever there is a touch screen (an iPhone on its side is wider than `sm`): iOS zooms
  // into any field with smaller text.
  "w-full rounded-xl border border-border-input bg-surface px-3.5 text-base text-fg shadow-xs transition pointer-fine:sm:text-[15px]",
  "placeholder:text-fg-subtle hover:border-fg-muted",
  "focus:border-brand focus:ring-4 focus:ring-ring focus:outline-none",
  "disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-danger",
);

/**
 * A labelled form control. The label wraps the control, so `getByLabel` and screen readers find
 * it. The hint sits outside the label and is tied to the control by `aria-describedby` (when the
 * control is the only child and does not describe itself): it is read as a description, not as
 * part of the field's name, and a change in it (an error) is announced.
 */
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
  const hintId = useId();
  const described = hint !== undefined ? describe(children, hintId) : children;
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className="flex items-baseline gap-1.5 text-sm font-medium text-fg">
          {label}
          {optional && <span className="text-xs font-normal text-fg-subtle">({commonTexts.optional})</span>}
        </span>
        {described}
      </label>
      {hint !== undefined && (
        <span id={hintId} aria-live="polite" className="text-xs leading-relaxed text-fg-muted">
          {hint}
        </span>
      )}
    </div>
  );
}

/** The single child control with `aria-describedby` pointing at the hint, unless it has its own. */
function describe(children: ReactNode, hintId: string): ReactNode {
  const only = Children.count(children) === 1 ? Children.toArray(children)[0] : undefined;
  if (!isValidElement(only)) {
    return children;
  }
  const element = only as ReactElement<{ "aria-describedby"?: string | undefined }>;
  if (element.props["aria-describedby"] !== undefined) {
    return children;
  }
  return cloneElement(element, { "aria-describedby": hintId });
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

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
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
  const input = (
    <input
      className={
        suffix === undefined ? cn(controlClass, "h-11 tabular", className) : "h-full w-full min-w-0 flex-1 bg-transparent tabular outline-none"
      }
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
  );
  if (suffix === undefined) {
    return input;
  }
  // The suffix sits beside the number, never over it: drawn on top, it hid the browser's arrows
  // (and long numbers) whenever it was wider than the room kept for it.
  return (
    <span className={cn(controlClass, "flex h-11 items-center gap-2 focus-within:border-brand focus-within:ring-4 focus-within:ring-ring", className)}>
      {input}
      <span aria-hidden className="shrink-0 text-sm whitespace-nowrap text-fg-subtle select-none">
        {suffix}
      </span>
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
          "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors touch-target",
          checked ? "bg-brand" : "bg-surface-3 ring-1 ring-border-input ring-inset",
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
