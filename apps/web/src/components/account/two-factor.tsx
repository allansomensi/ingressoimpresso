"use client";

import type { RecoveryCodesDto, TwoFactorSetupDto, TwoFactorStatusDto } from "@ingressoimpresso/api-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Download, KeyRound, ShieldCheck, ShieldOff } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { OtpInput } from "@/components/otp-input";
import { QrCode } from "@/components/qr";
import { Alert, Badge, Button, Card, CardHeader, Dialog, ErrorMessage, Field, Input, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { dateTime } from "@/lib/format";
import { texts } from "@/texts/pt-BR";

const t = texts.twoFactor;
const STATUS_KEY = ["two-factor"];

type Step = null | "setup" | "disable" | "regenerate";

async function copy(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done);
  } catch {
    // Clipboard blocked: the text stays on screen to copy by hand.
  }
}

/** Recovery codes, shown once after turning it on or asking for new ones. */
function RecoveryCodes({ codes, email, onClose }: { codes: readonly string[]; email: string; onClose: () => void }) {
  const text = codes.join("\n");
  const download = () => {
    const url = URL.createObjectURL(new Blob([`${t.fileHeader(email)}\n${text}\n`], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = t.fileName;
    link.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 10_000);
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={t.codesTitle}
      description={t.codesHint}
      footer={<Button onClick={onClose}>{t.saved}</Button>}
    >
      <div className="flex flex-col gap-4">
        <ul className="grid grid-cols-2 gap-2 rounded-2xl border border-border bg-surface-2 p-4 font-mono text-[15px] tracking-wider text-fg">
          {codes.map((code) => (
            <li key={code} className="text-center tabular">
              {code}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={<Copy />} onClick={() => void copy(text, t.codesCopied)}>
            {t.copyCodes}
          </Button>
          <Button variant="secondary" icon={<Download />} onClick={download}>
            {t.download}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/** Turning it on: scan the QR with the app, then confirm with its first code. */
function SetupDialog({ onClose, onCodes }: { onClose: () => void; onCodes: (codes: string[]) => void }) {
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  const setup = useQuery({
    queryKey: ["two-factor", "setup"],
    queryFn: () => api<TwoFactorSetupDto>("/api/account/two-factor/setup", { method: "POST" }),
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  });
  const enable = useMutation({
    mutationFn: (value: string) => api<RecoveryCodesDto>("/api/account/two-factor/enable", { method: "POST", body: { code: value } }),
    onSuccess: (result) => {
      toast.success(t.turnedOn);
      void queryClient.invalidateQueries({ queryKey: STATUS_KEY });
      onCodes(result.codes);
    },
    onError: () => {
      setCode("");
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (code.length === 6) {
      enable.mutate(code);
    }
  };
  return (
    <Dialog open onClose={onClose} title={t.setupTitle}>
      {setup.isError ? (
        <ErrorMessage error={setup.error} />
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-5">
          <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm leading-relaxed text-fg-muted">
            {t.setupSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <div className="flex flex-col items-center gap-3">
            {setup.data === undefined ? (
              <Skeleton className="size-[208px] rounded-2xl" />
            ) : (
              <div className="rounded-2xl border border-border bg-white p-3 shadow-sm">
                <QrCode text={setup.data.uri} size={184} label={t.qrLabel} className="bg-white" />
              </div>
            )}
            {setup.data !== undefined && (
              <div className="flex w-full flex-col items-center gap-1.5 text-center">
                <span className="text-xs text-fg-muted">{t.manual}</span>
                <button
                  type="button"
                  onClick={() => void copy(setup.data.secret.replaceAll(" ", ""), t.keyCopied)}
                  className="inline-flex max-w-full items-center gap-2 rounded-lg bg-surface-2 px-3 py-1.5 text-left font-mono text-sm tracking-wider text-fg"
                  aria-label={t.copyKey}
                >
                  {setup.data.secret}
                  <Copy className="size-3.5 shrink-0 text-fg-muted" aria-hidden />
                </button>
              </div>
            )}
          </div>
          <div className="flex flex-col items-center gap-2">
            <span className="text-sm font-medium text-fg">{t.codeLabel}</span>
            <OtpInput
              value={code}
              onChange={(value) => {
                setCode(value);
                enable.reset();
              }}
              onComplete={(value) => {
                enable.mutate(value);
              }}
              invalid={enable.isError}
              disabled={enable.isPending || setup.data === undefined}
            />
          </div>
          <ErrorMessage error={enable.error} />
          <Button type="submit" size="lg" loading={enable.isPending} disabled={code.length !== 6}>
            {t.confirm}
          </Button>
        </form>
      )}
    </Dialog>
  );
}

/** Turning it off, or new recovery codes: both ask for a code first. */
function ConfirmCodeDialog({
  mode,
  onClose,
  onCodes,
}: {
  mode: "disable" | "regenerate";
  onClose: () => void;
  onCodes: (codes: string[]) => void;
}) {
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  const action = useMutation({
    mutationFn: () =>
      mode === "disable"
        ? api<undefined>("/api/account/two-factor/disable", { method: "POST", body: { code: code.trim() } })
        : api<RecoveryCodesDto>("/api/account/two-factor/recovery-codes", { method: "POST", body: { code: code.trim() } }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: STATUS_KEY });
      if (mode === "disable") {
        toast.success(t.turnedOff);
        onClose();
      } else if (result !== undefined) {
        onCodes(result.codes);
      }
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (code.trim() !== "") {
      action.mutate();
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={mode === "disable" ? t.disableTitle : t.regenerateTitle}
      description={mode === "disable" ? t.disableHint : t.regenerateHint}
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label={mode === "disable" ? t.anyCode : t.codeLabel}>
          <Input
            value={code}
            autoFocus
            autoComplete="one-time-code"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={12}
            placeholder={mode === "disable" ? t.anyCodePlaceholder : "123456"}
            className="font-mono tracking-wider placeholder:font-sans placeholder:tracking-normal"
            onChange={(event) => {
              setCode(event.target.value);
              action.reset();
            }}
          />
        </Field>
        <ErrorMessage error={action.error} />
        <Button
          type="submit"
          variant={mode === "disable" ? "danger" : "primary"}
          loading={action.isPending}
          disabled={code.trim() === ""}
        >
          {mode === "disable" ? t.turnOff : t.newCodes}
        </Button>
      </form>
    </Dialog>
  );
}

/** "Verificação em duas etapas" on the account page (ADR 0045). */
export function TwoFactorCard({ email }: { email: string }) {
  const status = useQuery({ queryKey: STATUS_KEY, queryFn: () => api<TwoFactorStatusDto>("/api/account/two-factor") });
  const [step, setStep] = useState<Step>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const showCodes = (next: string[]) => {
    setStep(null);
    setCodes(next);
  };
  const data = status.data;

  return (
    <Card>
      <CardHeader
        icon={ShieldCheck}
        title={t.title}
        description={t.hint}
        actions={data === undefined ? null : <Badge tone={data.enabled ? "success" : "neutral"} dot>{data.enabled ? t.on : t.off}</Badge>}
      />
      {data === undefined ? (
        status.isError ? <ErrorMessage error={status.error} /> : <Skeleton className="h-10 w-full" />
      ) : data.enabled ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1 text-sm text-fg-muted">
            {data.enabledAt !== null && <span>{t.since(dateTime(data.enabledAt))}</span>}
            <span>{t.codesLeft(data.recoveryCodesLeft)}</span>
          </div>
          {data.recoveryCodesLeft <= 3 && <Alert tone="warning">{t.codesLow}</Alert>}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              icon={<KeyRound />}
              onClick={() => {
                setStep("regenerate");
              }}
            >
              {t.newCodes}
            </Button>
            <Button
              variant="danger-ghost"
              icon={<ShieldOff />}
              onClick={() => {
                setStep("disable");
              }}
            >
              {t.turnOff}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="secondary"
          icon={<ShieldCheck />}
          className="self-start"
          onClick={() => {
            setStep("setup");
          }}
        >
          {t.turnOn}
        </Button>
      )}
      {step === "setup" && (
        <SetupDialog
          onClose={() => {
            setStep(null);
          }}
          onCodes={showCodes}
        />
      )}
      {(step === "disable" || step === "regenerate") && (
        <ConfirmCodeDialog
          mode={step}
          onClose={() => {
            setStep(null);
          }}
          onCodes={showCodes}
        />
      )}
      {codes !== null && (
        <RecoveryCodes
          codes={codes}
          email={email}
          onClose={() => {
            setCodes(null);
          }}
        />
      )}
    </Card>
  );
}
