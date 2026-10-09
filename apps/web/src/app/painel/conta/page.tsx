"use client";

import type { AccountDto, PricingDto } from "@ingressoimpresso/api-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  Building2,
  CalendarDays,
  Download,
  Gift,
  LogOut,
  Receipt,
  Save,
  ShieldCheck,
  Ticket,
  Trash2,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { ThemeSwitcher } from "@/components/theme-switcher";
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
  Stat,
  errorMessage,
} from "@/components/ui";
import { api, fetchBlobUrl, writeToken } from "@/lib/api";
import { dateTime, money } from "@/lib/format";
import { quote } from "@/lib/pricing";
import { useSession } from "@/lib/session";
import { useUnsavedChanges } from "@/lib/unsaved";
import { texts } from "@/texts/pt-BR";

const t = texts.account;
const EXAMPLES = [100, 300, 1_000] as const;

function OrganizationForm({ account }: { account: AccountDto }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(account.organizationName);
  const dirty = name.trim() !== account.organizationName;
  useUnsavedChanges(dirty);
  const save = useMutation({
    mutationFn: () => api<AccountDto>("/api/account", { method: "PUT", body: { organizationName: name.trim() } }),
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
    <form onSubmit={submit} className="flex flex-col gap-4 sm:flex-row sm:items-end">
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
      <Button type="submit" icon={<Save />} loading={save.isPending} disabled={!dirty || name.trim() === ""}>
        {texts.common.save}
      </Button>
      <ErrorMessage error={save.error} />
    </form>
  );
}

function PricingTable({ pricing }: { pricing: PricingDto }) {
  return (
    <div className="flex flex-col gap-4">
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
        {pricing.tiers.map((tier, index) => (
          <li key={tier.upTo} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
            <span className="text-fg-muted">{t.tier((pricing.tiers[index - 1]?.upTo ?? 0) + 1, tier.upTo)}</span>
            <span className="font-semibold text-fg tabular">{t.perTicket(money(tier.unitCents))}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-fg-muted">{t.minimum(money(pricing.minimumCents))}</p>
      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold tracking-wide text-fg-subtle uppercase">{t.examples}</span>
        <div className="grid grid-cols-3 gap-2">
          {EXAMPLES.map((quantity) => (
            <div key={quantity} className="flex flex-col gap-0.5 rounded-xl bg-surface-2 px-3 py-2.5">
              <span className="text-xs text-fg-muted">{t.example(quantity)}</span>
              <span className="font-semibold text-fg tabular">{money(quote(pricing, quantity))}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DeleteAccount({ email }: { email: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const remove = useMutation({
    mutationFn: () => api<undefined>("/api/account", { method: "DELETE", body: { email: typed.trim() } }),
    onSuccess: () => {
      writeToken(null);
      queryClient.clear();
      toast.success(t.deleted);
      router.replace("/");
    },
  });
  const matches = typed.trim().toLowerCase() === email.toLowerCase();
  return (
    <>
      <Button
        variant="danger-ghost"
        icon={<Trash2 />}
        onClick={() => {
          setTyped("");
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
              {texts.common.cancel}
            </Button>
            <Button variant="danger" icon={<Trash2 />} disabled={!matches} loading={remove.isPending} onClick={() => remove.mutate()}>
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
          <ErrorMessage error={remove.error} />
        </form>
      </Dialog>
    </>
  );
}

function PrivacyCard({ account, email }: { account: AccountDto; email: string }) {
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
      <CardHeader icon={ShieldCheck} title={t.privacy} description={t.privacyHint} />
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
          <Button variant="secondary" icon={<Download />} loading={exporting} onClick={() => void download()} className="justify-start">
            {t.export}
          </Button>
          <span className="text-xs text-fg-muted">{t.exportHint}</span>
        </div>
        <div className="flex flex-col gap-1 border-t border-border pt-4">
          <DeleteAccount email={email} />
          <span className="text-xs text-fg-muted">{t.deleteHint}</span>
        </div>
      </div>
    </Card>
  );
}

export default function AccountPage() {
  const { session, signOut } = useSession();
  const account = useQuery({ queryKey: ["account"], queryFn: () => api<AccountDto>("/api/account") });
  const pricing = useQuery({ queryKey: ["pricing"], queryFn: () => api<PricingDto>("/api/pricing"), staleTime: 60 * 60_000 });

  if (account.isPending) {
    return <LoadingBlock rows={4} />;
  }
  if (account.isError) {
    return <ErrorMessage error={account.error} />;
  }
  const a = account.data;
  const used = a.freeTicketsTotal - a.freeTicketsLeft;
  const percent = a.freeTicketsTotal === 0 ? 0 : Math.round((used / a.freeTicketsTotal) * 100);

  return (
    <main className="flex flex-col gap-8 animate-fade-in">
      <PageHeader title={t.title} description={t.subtitle} />
      {a.suspendedReason !== null && (
        <Alert tone="danger" title={t.suspendedTitle}>
          {t.suspendedBody(a.suspendedReason)}
        </Alert>
      )}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader icon={Building2} title={t.organization} description={t.organizationHint} />
            <OrganizationForm key={a.organizationName} account={a} />
          </Card>
          <div className="grid gap-4 sm:grid-cols-2">
            <Stat label={t.events} value={a.eventCount.toLocaleString("pt-BR")} icon={CalendarDays} />
            <Stat label={t.paidTickets} value={a.paidTickets.toLocaleString("pt-BR")} icon={Ticket} tone="success" />
          </div>
          <Card>
            <CardHeader icon={Receipt} title={t.pricing} description={t.pricingHint} />
            {pricing.data === undefined ? <LoadingBlock rows={2} /> : <PricingTable pricing={pricing.data} />}
          </Card>
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          {a.freeTicketsTotal > 0 && (
            <Card>
              <CardHeader icon={Gift} title={t.free} />
              <div className="flex flex-col gap-3">
                <span className="text-2xl font-semibold tracking-tight text-fg tabular">{t.freeLeft(a.freeTicketsLeft)}</span>
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={a.freeTicketsTotal}
                  aria-valuenow={used}
                  aria-label={t.free}
                  className="h-2 overflow-hidden rounded-full bg-surface-3"
                >
                  <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${String(percent)}%` }} />
                </div>
                <span className="text-xs text-fg-muted">{t.freeOf(used, a.freeTicketsTotal)}</span>
                <p className="text-sm text-fg-muted">{t.freeHint}</p>
              </div>
            </Card>
          )}
          <Card>
            <CardHeader icon={UserRound} title={t.session} />
            <div className="flex flex-col gap-4">
              {session.status === "signed-in" && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-fg-muted">{t.signedInAs}</span>
                  <span className="truncate text-sm font-medium text-fg">{session.user.email}</span>
                  {session.user.google ? (
                    <span className="flex items-center gap-1.5 text-xs text-success-fg">
                      <BadgeCheck className="size-3.5" aria-hidden />
                      {t.googleLinked}
                    </span>
                  ) : (
                    <span className="text-xs leading-relaxed text-fg-subtle">{t.googleNotLinked}</span>
                  )}
                </div>
              )}
              <div className="flex flex-col gap-2">
                <span className="text-xs text-fg-muted">{texts.theme.label}</span>
                <ThemeSwitcher labels className="flex w-full" />
              </div>
              <Button variant="secondary" icon={<LogOut />} onClick={() => void signOut()}>
                {texts.panel.signOut}
              </Button>
            </div>
          </Card>
          {session.status === "signed-in" && <PrivacyCard account={a} email={session.user.email} />}
        </div>
      </div>
    </main>
  );
}
