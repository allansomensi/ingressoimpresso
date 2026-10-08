"use client";

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

import { ApiError } from "@/lib/api";
import { texts } from "@/texts/pt-BR";

export function Button({ className = "", variant = "primary", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" }) {
  const styles = {
    primary: "bg-ink text-paper hover:opacity-90 dark:bg-paper dark:text-ink",
    secondary: "border border-current hover:bg-black/5 dark:hover:bg-white/10",
    danger: "text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950",
  }[variant];
  return (
    <button
      type="button"
      className={`rounded-md px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
      {...props}
    />
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {hint !== undefined && <span className="text-xs opacity-70">{hint}</span>}
    </label>
  );
}

const inputClass =
  "rounded-md border border-black/20 bg-white px-3 py-2 text-base text-ink dark:border-white/20 dark:bg-black/30 dark:text-paper";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  // Native colour pickers need their own box: text padding hides the swatch.
  const className =
    props.type === "color"
      ? "h-10 w-20 cursor-pointer rounded-md border border-black/20 bg-white p-1 dark:border-white/20"
      : inputClass;
  return <input className={className} {...props} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={inputClass} {...props} />;
}

export function NumberInput({
  value,
  onChange,
  step = 0.5,
  min,
}: {
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
}) {
  return (
    <input
      className={inputClass}
      type="number"
      inputMode="decimal"
      step={step}
      min={min}
      value={Number.isFinite(value) ? value : ""}
      onChange={(event) => {
        onChange(event.target.valueAsNumber);
      }}
    />
  );
}

export function ErrorMessage({ error }: { error: unknown }) {
  if (error === null || error === undefined) {
    return null;
  }
  const message = error instanceof ApiError ? error.userMessage : texts.errors.generic;
  return (
    <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
      {message}
    </p>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-lg border border-black/10 p-4 dark:border-white/15 ${className}`}>{children}</section>;
}
