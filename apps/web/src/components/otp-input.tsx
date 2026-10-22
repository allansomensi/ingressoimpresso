"use client";

import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from "react";

import { cn } from "@/lib/cn";
import { login as loginTexts } from "@/texts/pt-BR/login";

/**
 * Six boxes for the login code: typing advances, Backspace goes back, pasting fills them all.
 * The first box keeps `autocomplete="one-time-code"`, so phones offer the code from the e-mail.
 * While the code is being checked the boxes are read-only (not disabled: the focus stays); a
 * wrong code puts the focus back on the first box, ready to type again.
 */
export function OtpInput({
  value,
  onChange,
  onComplete,
  length = 6,
  invalid = false,
  disabled = false,
  describedBy,
}: {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  length?: number;
  invalid?: boolean;
  /** The code is being checked: typing waits. */
  disabled?: boolean;
  /** `id` of the error message under the boxes, when there is one. */
  describedBy?: string | undefined;
}) {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const focus = (index: number) => {
    inputs.current[Math.max(0, Math.min(length - 1, index))]?.focus();
  };
  useEffect(() => {
    if (invalid) {
      inputs.current[0]?.focus();
      inputs.current[0]?.select();
    }
  }, [invalid]);
  const set = (next: string) => {
    const digits = next.replace(/\D/g, "").slice(0, length);
    onChange(digits);
    if (digits.length === length) {
      onComplete?.(digits);
    }
    return digits;
  };

  const type = (index: number, text: string) => {
    const digits = text.replace(/\D/g, "");
    if (digits === "" || disabled) {
      return;
    }
    // Autofill and fast typists may deliver several digits at once.
    const filled = set(value.slice(0, index) + digits + value.slice(index + digits.length));
    focus(Math.min(filled.length, length - 1));
  };

  const keyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) {
      return;
    }
    if (event.key === "Backspace") {
      event.preventDefault();
      if (value[index] !== undefined) {
        set(value.slice(0, index) + value.slice(index + 1));
      } else if (index > 0) {
        set(value.slice(0, index - 1) + value.slice(index));
        focus(index - 1);
      }
    } else if (event.key === "ArrowLeft") {
      focus(index - 1);
    } else if (event.key === "ArrowRight") {
      focus(index + 1);
    }
  };

  const paste = (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    if (disabled) {
      return;
    }
    const filled = set(event.clipboardData.getData("text"));
    focus(filled.length);
  };

  return (
    <div className="flex justify-between gap-2" role="group" aria-label={loginTexts.codeLabel} aria-busy={disabled || undefined}>
      {Array.from({ length }, (_, index) => (
        <input
          key={index}
          ref={(element) => {
            inputs.current[index] = element;
          }}
          value={value[index] ?? ""}
          onChange={(event) => {
            type(index, event.target.value);
          }}
          onKeyDown={(event) => {
            keyDown(index, event);
          }}
          onPaste={paste}
          onFocus={(event) => {
            event.target.select();
          }}
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          maxLength={length}
          readOnly={disabled}
          aria-label={loginTexts.codeDigit(index + 1)}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          autoFocus={index === 0}
          className={cn(
            "h-14 w-full min-w-0 rounded-xl border bg-surface text-center font-mono text-2xl font-semibold text-fg shadow-xs transition",
            "focus:border-brand focus:ring-4 focus:ring-ring focus:outline-none read-only:opacity-70",
            invalid ? "border-danger" : "border-border-input",
          )}
        />
      ))}
    </div>
  );
}
