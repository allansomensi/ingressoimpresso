"use client";

import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";

import { cn } from "@/lib/cn";
import { texts } from "@/texts/pt-BR";

/**
 * Six boxes for the login code: typing advances, Backspace goes back, pasting fills them all.
 * The first box keeps `autocomplete="one-time-code"`, so phones offer the code from the e-mail.
 */
export function OtpInput({
  value,
  onChange,
  onComplete,
  length = 6,
  invalid = false,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  length?: number;
  invalid?: boolean;
  disabled?: boolean;
}) {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const focus = (index: number) => {
    inputs.current[Math.max(0, Math.min(length - 1, index))]?.focus();
  };
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
    if (digits === "") {
      return;
    }
    // Autofill and fast typists may deliver several digits at once.
    const filled = set(value.slice(0, index) + digits + value.slice(index + digits.length));
    focus(Math.min(filled.length, length - 1));
  };

  const keyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
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
    const filled = set(event.clipboardData.getData("text"));
    focus(filled.length);
  };

  return (
    <div className="flex justify-between gap-2" role="group" aria-label={texts.login.codeLabel}>
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
          disabled={disabled}
          aria-label={texts.login.codeDigit(index + 1)}
          aria-invalid={invalid || undefined}
          autoFocus={index === 0}
          className={cn(
            "h-14 w-full min-w-0 rounded-xl border bg-surface text-center font-mono text-2xl font-semibold text-fg shadow-xs transition",
            "focus:border-brand focus:ring-4 focus:ring-ring focus:outline-none",
            invalid ? "border-danger" : "border-border-strong",
          )}
        />
      ))}
    </div>
  );
}
