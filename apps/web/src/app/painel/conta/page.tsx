"use client";

import type {
  AccountDto,
  DeleteAccountBody,
  TwoFactorStatusDto,
} from "@ingressoimpresso/api-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  CalendarDays,
  ChevronRight,
  Download,
  Gift,
  Save,
  ShieldCheck,
  Ticket,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { CreditsCard } from "@/components/account/credits";
import { EmailPreferencesCard } from "@/components/account/email-preferences";
import { ReferralsCard } from "@/components/account/referrals";
import { TwoFactorCard } from "@/components/account/two-factor";
import {
  Alert,
  Button,
  Card,
  CardHeader,
  Dialog,
  ErrorMessage,
  Field,
  Input,
  LoadingBlock,
  PageHeader,
  errorMessage,
} from "@/components/ui";
import { api, fetchBlobUrl, writeToken } from "@/lib/api";
import { dateTime } from "@/lib/format";
import { useSession } from "@/lib/session";
import { VERSION_LABEL } from "@/lib/version";
import { useUnsavedChanges } from "@/lib/unsaved";
import { account as accountTexts } from "@/texts/pt-BR/account";
import { common as commonTexts } from "@/texts/pt-BR/common";
import { panel as panelTexts } from "@/texts/pt-BR/panel";
import { profile as profileTexts } from "@/texts/pt-BR/profile";

const t = accountTexts;

function OrganizationForm({ account }: { account: AccountDto }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(account.organizationName);
  const dirty = name.trim() !== account.organizationName;
  useUnsavedChanges(dirty);
  const save = useMutation({
    mutationFn: () =>
      api<AccountDto>("/api/account", {
        method: "PUT",
        body: { organizationName: name.trim() },
      }),
    onSuccess: (saved) => {
      queryClient.setQueryData(["account"], saved);
      setName(saved.organizationName);
      toast.success(t.saved);
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };
  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-4 sm:flex-row sm:items-end"
    >
      <Field label={t.organizationName} className="flex-1">
        <Input
          value={name}
          maxLength={100}
          required
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
      </Field>
      <Button
        type="submit"
        icon={<Save />}
        loading={save.isPending}
        disabled={!dirty || name.trim() === ""}
      >
        {commonTexts.save}
      </Button>
      <ErrorMessage error={save.error} />
    </form>
  );
}

function DeleteAccount({
  email,
  twoFactor,
}: {
  email: string;
  twoFactor: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [code, setCode] = useState("");
  const remove = useMutation({
    mutationFn: () => {
      const body: DeleteAccountBody = {
        email: typed.trim(),
        ...(twoFactor ? { twoFactorCode: code.trim() } : {}),
      };
      return api<undefined>("/api/account", { method: "DELETE", body });
    },
    onSuccess: () => {
      writeToken(null);
      queryClient.clear();
      toast.success(t.deleted);
      router.replace("/");
    },
  });
  const matches =
    typed.trim().toLowerCase() === email.toLowerCase() &&
    (!twoFactor || code.trim() !== "");
  return (
    <>
      <Button
        variant="danger-ghost"
        icon={<Trash2 />}
        onClick={() => {
          setTyped("");
          setCode("");
          remove.reset();
          setOpen(true);
        }}
        className="justify-start"
      >
        {t.delete}
      </Button>
      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        size="sm"
        title={t.deleteTitle}
        description={t.deleteBody}
        footer={
          <>
            <Button
              variant="secondary"
              autoFocus
              onClick={() => {
                setOpen(false);
              }}
            >
              {commonTexts.cancel}
            </Button>
            <Button
              variant="danger"
              icon={<Trash2 />}
              disabled={!matches}
              loading={remove.isPending}
              onClick={() => remove.mutate()}
            >
              {t.deleteConfirm}
            </Button>
          </>
        }
      >
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (matches) {
              remove.mutate();
            }
          }}
        >
          <Field label={t.deleteConfirmLabel(email)}>
            <Input
              type="email"
              value={typed}
              autoComplete="off"
              onChange={(event) => {
                setTyped(event.target.value);
              }}
            />
          </Field>
          {twoFactor && (
            <Field label={t.deleteTwoFactorLabel}>
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(event) => {
                  setCode(event.target.value);
                }}
              />
            </Field>
          )}
          <ErrorMessage error={remove.error} />
        </form>
      </Dialog>
    </>
  );
}

function PrivacyCard({
  account,
  email,
}: {
  account: AccountDto;
  email: string;
}) {
  const twoFactor = useQuery({
    queryKey: ["two-factor"],
    queryFn: () => api<TwoFactorStatusDto>("/api/account/two-factor"),
  });
  const [exporting, setExporting] = useState(false);
  const download = async () => {
    setExporting(true);
    try {
      const url = await fetchBlobUrl("/api/account/export");
      const link = document.createElement("a");
      link.href = url;
      link.download = t.exportFile;
      link.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 10_000);
      toast.success(t.exported);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setExporting(false);
    }
  };
  const link = "font-medium text-brand underline-offset-2 hover:underline";
  return (
    <Card>
      <CardHeader
        icon={ShieldCheck}
        title={t.privacy}
        description={t.privacyHint}
      />
      <div className="flex flex-col gap-4">
        {account.termsAcceptedAt !== null && (
          <p className="text-sm leading-relaxed text-fg-muted">
            {t.termsAccepted(dateTime(account.termsAcceptedAt))}{" "}
            <Link href="/termos" className={link}>
              {t.readTerms}
            </Link>
            {" · "}
            <Link href="/privacidade" className={link}>
              {t.readPrivacy}
            </Link>
          </p>
        )}
        <div className="flex flex-col gap-1">
          <Button
            variant="secondary"
            icon={<Download />}
            loading={exporting}
            onClick={() => void download()}
            className="justify-start"
          >
            {t.export}
          </Button>
          <span className="text-xs text-fg-muted">{t.exportHint}</span>
        </div>
        <div className="flex flex-col gap-1 border-t border-border pt-4">
          <DeleteAccount
            email={email}
            twoFactor={twoFactor.data?.enabled ?? false}
          />
          <span className="text-xs text-fg-muted">{t.deleteHint}</span>
        </div>
      </div>
    </Card>
  );
}

export default function AccountPage() {
  const { session } = useSession();
  const account = useQuery({
    queryKey: ["account"],
    queryFn: () => api<AccountDto>("/api/account"),
  });

  if (account.isPending) {
    return <LoadingBlock rows={4} />;
  }
  if (account.isError) {
    return <ErrorMessage error={account.error} />;
  }
  const a = account.data;
  const used = a.freeTicketsTotal - a.freeTicketsLeft;
  const percent =
    a.freeTicketsTotal === 0
      ? 0
      : Math.round((used / a.freeTicketsTotal) * 100);

  return (
    <main className="flex flex-col gap-8 animate-fade-in">
      <PageHeader title={t.title} description={t.subtitle} />
      {a.suspendedReason !== null && (
        <Alert tone="danger" title={t.suspendedTitle}>
          {t.suspendedBody(a.suspendedReason)}
        </Alert>
      )}
      {/* Phones: organization, money, security. Larger screens: organization and security on the
          left, money on the right. */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-[auto_1fr]">
        <div className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-1">
          <Card>
            <CardHeader
              icon={Building2}
              title={t.organization}
              description={t.organizationHint}
            />
            <OrganizationForm key={a.organizationName} account={a} />
            {/* The public profile (ADR 0064) has a page of its own. */}
            <Link
              href="/painel/organizacao"
              className="mt-5 flex items-center gap-3 rounded-xl border border-border bg-surface-2 px-4 py-3 transition hover:border-border-strong active:bg-surface-3"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-semibold text-fg">
                  {profileTexts.open}
                </span>
                <span className="text-xs text-fg-muted">
                  {profileTexts.openHint}
                </span>
              </span>
              <ChevronRight
                aria-hidden
                className="size-4 shrink-0 text-fg-subtle"
              />
            </Link>
            <dl className="mt-5 flex flex-wrap gap-x-6 gap-y-2 border-t border-border pt-4 text-sm">
              <div className="flex items-center gap-2">
                <CalendarDays aria-hidden className="size-4 text-fg-subtle" />
                <dt className="text-fg-muted">{t.events}</dt>
                <dd className="font-semibold text-fg tabular">
                  {a.eventCount.toLocaleString("pt-BR")}
                </dd>
              </div>
              <div className="flex items-center gap-2">
                <Ticket aria-hidden className="size-4 text-fg-subtle" />
                <dt className="text-fg-muted">{t.paidTickets}</dt>
                <dd className="font-semibold text-fg tabular">
                  {a.paidTickets.toLocaleString("pt-BR")}
                </dd>
              </div>
            </dl>
          </Card>
        </div>
        <div className="flex min-w-0 flex-col gap-6 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          {a.freeTicketsTotal > 0 && (
            <Card>
              <CardHeader icon={Gift} title={t.free} />
              <div className="flex flex-col gap-3">
                <span className="text-2xl font-semibold tracking-tight text-fg tabular">
                  {t.freeLeft(a.freeTicketsLeft)}
                </span>
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={a.freeTicketsTotal}
                  aria-valuenow={used}
                  aria-label={t.free}
                  className="h-2 overflow-hidden rounded-full bg-surface-3"
                >
                  <div
                    className="h-full rounded-full bg-brand transition-[width]"
                    style={{ width: `${String(percent)}%` }}
                  />
                </div>
                <span className="text-xs text-fg-muted">
                  {t.freeOf(used, a.freeTicketsTotal)}
                </span>
                <p className="text-sm text-fg-muted">{t.freeHint}</p>
              </div>
            </Card>
          )}
          <CreditsCard />
          {/* Refer and earn (ADR 0076): beside the credits it pays, not in the way. */}
          <ReferralsCard />
        </div>
        {session.status === "signed-in" && (
          <div className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-2">
            <TwoFactorCard email={session.user.email} />
            <EmailPreferencesCard account={a} />
            <PrivacyCard account={a} email={session.user.email} />
          </div>
        )}
      </div>
      {/* The version, for support: plain text, at the very end of the account page (ADR 0054). */}
      <p className="text-center text-xs text-fg-subtle tabular">
        {panelTexts.version(VERSION_LABEL)}
      </p>
    </main>
  );
}
