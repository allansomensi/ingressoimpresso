"use client";

import { ArrowLeft, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";

import { OtpInput } from "@/components/otp-input";
import { Button, ErrorMessage, Field, Input } from "@/components/ui";
import { texts } from "@/texts/pt-BR";

const t = texts.twoFactor;

/**
 * The second step of a sign-in (ADR 0045): a code of the authenticator app, or a recovery code.
 * The first step (e-mail code or Google) stays with the page, which sends both together.
 */
export function TwoFactorStep({
  pending,
  error,
  onSubmit,
  onBack,
  onEdit,
}: {
  pending: boolean;
  error: unknown;
  onSubmit: (code: string) => void;
  onBack: () => void;
  onEdit: () => void;
}) {
  const [recovery, setRecovery] = useState(false);
  const [code, setCode] = useState("");
  const ready = recovery ? code.trim().length >= 8 : code.length === 6;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (ready) {
      onSubmit(code.trim());
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-brand-soft-fg">
          <ShieldCheck className="size-6" aria-hidden />
        </span>
        <h1 className="text-3xl font-semibold tracking-tight text-fg">{t.signInTitle}</h1>
        <p className="text-[15px] leading-relaxed text-fg-muted">{recovery ? t.signInRecoveryHint : t.signInHint}</p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-5">
        {recovery ? (
          <Field label={t.recoveryLabel}>
            <Input
              value={code}
              autoFocus
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={12}
              placeholder="ABCD-EFGH"
              className="font-mono tracking-wider uppercase placeholder:normal-case"
              onChange={(event) => {
                setCode(event.target.value);
                onEdit();
              }}
            />
          </Field>
        ) : (
          <OtpInput
            value={code}
            onChange={(value) => {
              setCode(value);
              onEdit();
            }}
            onComplete={onSubmit}
            invalid={error !== null && error !== undefined}
            disabled={pending}
          />
        )}
        <ErrorMessage error={error} />
        <Button type="submit" size="lg" loading={pending} disabled={!ready}>
          {t.continue}
        </Button>
        <div className="flex items-center justify-between gap-2 text-sm">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 font-medium text-fg-muted hover:text-fg"
            onClick={onBack}
          >
            <ArrowLeft className="size-4" aria-hidden />
            {t.back}
          </button>
          <button
            type="button"
            className="font-medium text-brand"
            onClick={() => {
              setRecovery(!recovery);
              setCode("");
              onEdit();
            }}
          >
            {recovery ? t.useApp : t.useRecovery}
          </button>
        </div>
        <p className="text-xs leading-relaxed text-fg-subtle">{t.lostPhone}</p>
      </form>
    </div>
  );
}
