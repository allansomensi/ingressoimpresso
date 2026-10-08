"use client";

import type { SessionResponse } from "@ingressoimpresso/api-types";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { Button, ErrorMessage, Field, Input } from "@/components/ui";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { texts } from "@/texts/pt-BR";

export default function SignInPage() {
  const router = useRouter();
  const { session, signIn } = useSession();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);

  useEffect(() => {
    if (session.status === "signed-in") {
      router.replace("/painel");
    }
  }, [session.status, router]);

  const requestCode = useMutation({
    mutationFn: () => api<undefined>("/api/auth/code", { method: "POST", body: { email } }),
    onSuccess: () => {
      setCodeSent(true);
    },
  });
  const verify = useMutation({
    mutationFn: () => api<SessionResponse>("/api/auth/verify", { method: "POST", body: { email, code } }),
    onSuccess: (response) => {
      signIn(response);
      router.replace("/painel");
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (codeSent) {
      verify.mutate();
    } else {
      requestCode.mutate();
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="text-2xl font-bold">{texts.login.title}</h1>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {codeSent ? (
          <>
            <p className="text-sm">{texts.login.codeSentTo(email)}</p>
            <Field label={texts.login.codeLabel}>
              <Input
                value={code}
                onChange={(event) => {
                  setCode(event.target.value.replace(/\D/g, "").slice(0, 6));
                }}
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                required
              />
            </Field>
            <ErrorMessage error={verify.error} />
            <Button type="submit" disabled={code.length !== 6 || verify.isPending}>
              {texts.login.verify}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setCodeSent(false);
                setCode("");
              }}
            >
              {texts.login.otherEmail}
            </Button>
          </>
        ) : (
          <>
            <Field label={texts.login.emailLabel}>
              <Input
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                }}
                placeholder={texts.login.emailPlaceholder}
                autoComplete="email"
                autoFocus
                required
              />
            </Field>
            <ErrorMessage error={requestCode.error} />
            <Button type="submit" disabled={requestCode.isPending}>
              {texts.login.sendCode}
            </Button>
          </>
        )}
      </form>
    </main>
  );
}
