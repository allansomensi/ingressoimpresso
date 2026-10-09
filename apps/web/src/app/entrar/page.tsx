"use client";

import type { AuthOptionsDto, SessionResponse } from "@ingressoimpresso/api-types";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, Mail } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Logo, LogoMark } from "@/components/brand";
import { GoogleSignIn } from "@/components/google-sign-in";
import { OtpInput } from "@/components/otp-input";
import { Alert, Button, ErrorMessage, Field, Input, Spinner } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { usePlatform } from "@/lib/platform";
import { useSession } from "@/lib/session";
import { texts } from "@/texts/pt-BR";

const t = texts.login;
const RESEND_AFTER_S = 30;

function isQuotaError(error: unknown): boolean {
  return error instanceof ApiError && error.code === "mail_quota";
}

function Terms() {
  const link = "font-medium text-fg-muted underline underline-offset-2 hover:text-fg";
  return (
    <p className="text-xs leading-relaxed text-fg-subtle">
      {t.termsBefore}
      <Link href="/termos" className={link}>
        {t.termsLink}
      </Link>
      {t.termsMiddle}
      <Link href="/privacidade" className={link}>
        {t.privacyLink}
      </Link>
      {t.termsAfter}
    </p>
  );
}

export default function SignInPage() {
  const router = useRouter();
  const { session, signIn } = useSession();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [sentAt, setSentAt] = useState(0);
  const [now, setNow] = useState(0);
  const [googleBlocked, setGoogleBlocked] = useState(false);
  const options = useQuery({
    queryKey: ["auth-options"],
    queryFn: () => api<AuthOptionsDto>("/api/auth/options"),
    staleTime: 60 * 60_000,
    retry: 1,
  });
  const googleClientId = googleBlocked ? null : (options.data?.googleClientId ?? null);
  const platform = usePlatform();
  const mode = platform.data?.maintenance.mode ?? "off";
  const notice =
    mode === "full"
      ? texts.maintenance.signInClosed
      : mode === "read_only"
        ? texts.maintenance.signInNotice
        : platform.data?.registrationsOpen === false
          ? texts.maintenance.registrationsClosed
          : null;

  useEffect(() => {
    if (session.status === "signed-in") {
      router.replace("/painel");
    }
  }, [session.status, router]);

  // Countdown of the resend link.
  useEffect(() => {
    if (!codeSent) {
      return;
    }
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, [codeSent]);

  const finish = (response: SessionResponse) => {
    signIn(response);
    router.replace("/painel");
  };
  const requestCode = useMutation({
    mutationFn: () => api<undefined>("/api/auth/code", { method: "POST", body: { email: email.trim() } }),
    onSuccess: () => {
      if (codeSent) {
        toast.success(t.resent);
      }
      setCodeSent(true);
      setSentAt(Date.now());
      setNow(Date.now());
    },
  });
  const verify = useMutation({
    mutationFn: (value: string) =>
      api<SessionResponse>("/api/auth/verify", { method: "POST", body: { email: email.trim(), code: value } }),
    onSuccess: finish,
  });
  const google = useMutation({
    mutationFn: (credential: string) => api<SessionResponse>("/api/auth/google", { method: "POST", body: { credential } }),
    onSuccess: finish,
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (codeSent) {
      verify.mutate(code);
    } else {
      requestCode.mutate();
    }
  };
  const wait = Math.max(0, RESEND_AFTER_S - Math.floor((now - sentAt) / 1000));
  const quota = isQuotaError(requestCode.error);

  const googleButton =
    googleClientId === null ? null : (
      <div className="flex flex-col gap-3">
        {google.isPending ? (
          <div className="flex h-12 items-center justify-center gap-2 rounded-xl border border-border bg-surface text-base font-semibold text-fg-muted">
            <Spinner />
            {t.googleSigningIn}
          </div>
        ) : (
          <GoogleSignIn
            clientId={googleClientId}
            onCredential={(credential) => {
              google.mutate(credential);
            }}
            onUnavailable={() => {
              setGoogleBlocked(true);
            }}
          />
        )}
        <ErrorMessage error={google.error} />
      </div>
    );

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <aside className="relative hidden overflow-hidden bg-[#0e0d14] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden className="absolute -top-32 -left-32 size-[30rem] rounded-full bg-[#5b3df5]/50 blur-3xl" />
        <div aria-hidden className="absolute -right-24 -bottom-24 size-[24rem] rounded-full bg-[#ffb224]/25 blur-3xl" />
        <div aria-hidden className="absolute inset-0 bg-dots opacity-20" />
        <Logo inverse className="relative" />
        <div className="relative flex flex-col gap-8">
          <LogoMark className="size-16" />
          <h2 className="max-w-md text-4xl leading-tight font-semibold tracking-tight">{t.asideTitle}</h2>
          <ul className="flex flex-col gap-3">
            {t.asidePoints.map((point) => (
              <li key={point} className="flex items-center gap-3 text-white/80">
                <span className="flex size-6 items-center justify-center rounded-full bg-white/10">
                  <Check className="size-3.5" aria-hidden />
                </span>
                {point}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-white/50">{texts.meta.description}</p>
      </aside>

      <main className="flex flex-col bg-glow px-4 py-6 sm:px-8">
        <Logo className="lg:invisible" />
        <div className="m-auto flex w-full max-w-sm flex-col gap-8 py-12 animate-rise">
          {codeSent ? (
            <div className="flex flex-col gap-3">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-brand-soft-fg">
                <Mail className="size-6" aria-hidden />
              </span>
              <h1 className="text-3xl font-semibold tracking-tight text-fg">{t.codeTitle}</h1>
              <p className="text-[15px] leading-relaxed text-fg-muted">{t.codeSentTo(email.trim())}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <h1 className="text-3xl font-semibold tracking-tight text-fg">{t.title}</h1>
              <p className="text-[15px] leading-relaxed text-fg-muted">{googleClientId === null ? t.subtitleEmail : t.subtitle}</p>
            </div>
          )}

          {codeSent ? (
            <form onSubmit={submit} className="flex flex-col gap-5">
              <OtpInput
                value={code}
                onChange={(value) => {
                  setCode(value);
                  verify.reset();
                }}
                onComplete={(value) => {
                  verify.mutate(value);
                }}
                invalid={verify.isError}
                disabled={verify.isPending}
              />
              <ErrorMessage error={verify.error} />
              <Button type="submit" size="lg" disabled={code.length !== 6} loading={verify.isPending}>
                {verify.isPending ? t.verifying : t.verify}
              </Button>
              <div className="flex items-center justify-between gap-2 text-sm">
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 font-medium text-fg-muted hover:text-fg"
                  onClick={() => {
                    setCodeSent(false);
                    setCode("");
                    verify.reset();
                  }}
                >
                  <ArrowLeft className="size-4" aria-hidden />
                  {t.otherEmail}
                </button>
                <button
                  type="button"
                  className="font-medium text-brand disabled:text-fg-subtle"
                  disabled={wait > 0 || requestCode.isPending}
                  onClick={() => {
                    requestCode.mutate();
                  }}
                >
                  {wait > 0 ? t.resendIn(wait) : t.resend}
                </button>
              </div>
              <ErrorMessage error={requestCode.error} />
              <p className="text-xs text-fg-subtle">{t.spamHint}</p>
            </form>
          ) : (
            <div className="flex flex-col gap-6">
              {notice !== null && (
                <Alert tone={mode === "off" ? "brand" : "warning"}>{notice}</Alert>
              )}
              {quota && googleButton !== null && (
                <Alert tone="warning" title={t.quotaTitle}>
                  {t.quotaBody}
                </Alert>
              )}
              {googleButton}
              {googleButton !== null && (
                <div className="flex items-center gap-3 text-xs font-medium tracking-wide text-fg-subtle uppercase">
                  <span className="h-px flex-1 bg-border" />
                  {t.or}
                  <span className="h-px flex-1 bg-border" />
                </div>
              )}
              <form onSubmit={submit} className="flex flex-col gap-4">
                <Field label={t.emailLabel}>
                  <Input
                    type="email"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                    }}
                    placeholder={t.emailPlaceholder}
                    autoComplete="email"
                    autoFocus={googleButton === null}
                    required
                  />
                </Field>
                {!(quota && googleButton !== null) && <ErrorMessage error={requestCode.error} />}
                <Button type="submit" size="lg" variant={googleButton === null ? "primary" : "secondary"} loading={requestCode.isPending}>
                  {requestCode.isPending ? t.sending : t.sendCode}
                </Button>
              </form>
              <div className="flex flex-col gap-2">
                <p className="text-sm leading-relaxed text-fg-muted">{t.firstTime}</p>
                <Terms />
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
