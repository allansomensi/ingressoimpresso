"use client";

import type { AdminReferralDto, AdminReferralsDto, ReferralSettingsDto } from "@ingressoimpresso/api-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Ban, Clock, Coins, Gift, MoreHorizontal, Save, UserRoundX, XCircle } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorMessage,
  Field,
  Input,
  Lead,
  List,
  ListItem,
  LoadingBlock,
  Menu,
  MenuItem,
  Stat,
  Switch,
  errorMessage,
  useConfirm,
  type Tone,
} from "@/components/ui";
import { api } from "@/lib/api";
import { money, parseMoney, shortDateTime } from "@/lib/format";
import { useUnsavedChanges } from "@/lib/unsaved";
import { texts } from "@/texts/pt-BR";

const t = texts.referrals.admin;
const KEY = ["admin", "referrals"];

const cents = (value: number) => (value / 100).toFixed(2).replace(".", ",");

type Form = { enabled: boolean; referrer: string; referred: string; limit: string; minBatch: string };

function formOf(settings: ReferralSettingsDto): Form {
  return {
    enabled: settings.enabled,
    referrer: cents(settings.referrerCents),
    referred: cents(settings.referredCents),
    limit: String(settings.monthlyLimit),
    minBatch: cents(settings.minBatchCents),
  };
}

/** The form as the API takes it; `null` when a field cannot be read. */
function bodyOf(form: Form): ReferralSettingsDto | null {
  const referrer = parseMoney(form.referrer);
  const referred = parseMoney(form.referred);
  const minBatch = parseMoney(form.minBatch);
  const limit = Number(form.limit);
  if (!referrer.ok || !referred.ok || !minBatch.ok || form.limit.trim() === "" || !Number.isInteger(limit)) {
    return null;
  }
  return {
    enabled: form.enabled,
    referrerCents: referrer.cents ?? 0,
    referredCents: referred.cents ?? 0,
    monthlyLimit: limit,
    minBatchCents: minBatch.cents ?? 0,
  };
}

function Settings({ settings }: { settings: ReferralSettingsDto }) {
  const queryClient = useQueryClient();
  const saved = formOf(settings);
  const [form, setForm] = useState(saved);
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  useUnsavedChanges(dirty);
  const body = bodyOf(form);
  const save = useMutation({
    mutationFn: (next: ReferralSettingsDto) => api<AdminReferralsDto>("/api/admin/referrals/settings", { method: "PUT", body: next }),
    onSuccess: (data) => {
      queryClient.setQueryData(KEY, data);
      setForm(formOf(data.settings));
      toast.success(t.saved);
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (body === null) {
      toast.error(t.invalid);
      return;
    }
    save.mutate(body);
  };
  const set = (field: keyof Omit<Form, "enabled">) => (event: { target: { value: string } }) => {
    setForm({ ...form, [field]: event.target.value });
  };
  return (
    <Card>
      <CardHeader icon={Gift} title={t.settingsTitle} description={t.settingsHint} />
      <form onSubmit={submit} className="flex flex-col gap-5">
        <Switch
          checked={form.enabled}
          onChange={(enabled) => {
            setForm({ ...form, enabled });
          }}
          label={t.enabled}
          description={form.enabled ? t.enabledOn : t.enabledOff}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.referrer}>
            <Input inputMode="decimal" value={form.referrer} onChange={set("referrer")} />
          </Field>
          <Field label={t.referred}>
            <Input inputMode="decimal" value={form.referred} onChange={set("referred")} />
          </Field>
          <Field label={t.minBatch} hint={t.minBatchHint}>
            <Input inputMode="decimal" value={form.minBatch} onChange={set("minBatch")} />
          </Field>
          <Field label={t.limit} hint={t.limitHint}>
            <Input inputMode="numeric" value={form.limit} onChange={set("limit")} />
          </Field>
        </div>
        <ErrorMessage error={save.error} />
        <Button type="submit" icon={<Save />} loading={save.isPending} disabled={!dirty} className="self-start max-sm:w-full">
          {t.save}
        </Button>
      </form>
    </Card>
  );
}

function state(referral: AdminReferralDto): { tone: Tone; label: string } {
  switch (referral.status) {
    case "pending":
      return { tone: "neutral", label: texts.referrals.status.pending };
    case "rewarded":
      return { tone: "success", label: texts.referrals.status.rewarded };
    case "revoked":
      return { tone: "danger", label: t.revokedReason[referral.revokeReason ?? ""] ?? texts.referrals.status.revoked };
  }
}

function OrganizationName({ id, name }: { id: string | null; name: string | null }) {
  if (id === null || name === null) {
    return <span className="text-fg-subtle italic">{t.deleted}</span>;
  }
  return (
    <Link href={`/painel/admin/organizacoes/${id}`} className="truncate font-medium text-fg hover:text-brand hover:underline">
      {name}
    </Link>
  );
}

/** Refer and earn in the admin panel (ADR 0076): the rules, the sums and the latest referrals. */
export function AdminReferrals() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const data = useQuery({ queryKey: KEY, queryFn: () => api<AdminReferralsDto>("/api/admin/referrals") });
  const revoke = useMutation({
    mutationFn: (id: string) => api<AdminReferralsDto>(`/api/admin/referrals/${id}/revoke`, { method: "POST" }),
    onSuccess: (next) => {
      queryClient.setQueryData(KEY, next);
      toast.success(t.revoked);
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
  if (data.isPending) {
    return <LoadingBlock rows={4} />;
  }
  if (data.isError) {
    return <ErrorMessage error={data.error} />;
  }
  const { settings, totals, referrals } = data.data;
  const ask = async (referral: AdminReferralDto) => {
    if (await confirm({ title: t.revokeTitle, description: t.revokeBody, confirmLabel: t.revoke })) {
      revoke.mutate(referral.id);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Lead>{t.intro}</Lead>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label={t.totals.pending} value={totals.pending.toLocaleString("pt-BR")} icon={Clock} />
        <Stat label={t.totals.rewarded} value={totals.rewarded.toLocaleString("pt-BR")} icon={Gift} tone="success" />
        <Stat label={t.totals.revoked} value={totals.revoked.toLocaleString("pt-BR")} icon={XCircle} />
        <Stat label={t.totals.credit} value={money(totals.creditCents)} icon={Coins} />
      </div>
      <Settings key={JSON.stringify(settings)} settings={settings} />
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold tracking-tight text-fg">{t.listTitle}</h2>
        {referrals.length === 0 ? (
          <EmptyState icon={UserRoundX} title={t.empty} description={t.emptyHint} />
        ) : (
          <List>
            {referrals.map((referral) => {
              const { tone, label } = state(referral);
              return (
                <ListItem key={referral.id} className="flex-nowrap items-start">
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                      <OrganizationName id={referral.referrerId} name={referral.referrerName} />
                      <ArrowRight aria-label={t.arrow} className="size-3.5 shrink-0 text-fg-subtle" />
                      <OrganizationName id={referral.referredId} name={referral.referredName} />
                      {referral.referredName?.includes("@") !== true && referral.emailHint !== "" && <span className="text-xs text-fg-subtle">({referral.emailHint})</span>}
                    </span>
                    <span className="flex flex-wrap items-center gap-2">
                      <Badge tone={tone} dot={referral.status === "pending"}>
                        {label}
                      </Badge>
                      {referral.referrerCapped && <Badge tone="warning">{t.capped}</Badge>}
                    </span>
                    <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-fg-subtle">
                      <span>{t.created(shortDateTime(referral.createdAt))}</span>
                      {referral.rewardedAt !== null && <span>{t.rewarded(shortDateTime(referral.rewardedAt))}</span>}
                      {referral.status !== "pending" && <span>{t.credit(money(referral.referrerCents), money(referral.referredCents))}</span>}
                    </span>
                  </div>
                  {referral.status !== "revoked" && (
                    <Menu
                      label={t.actions}
                      trigger={<MoreHorizontal className="size-4" aria-hidden />}
                      triggerClassName="relative flex size-9 items-center justify-center rounded-lg text-fg-muted transition touch-target hover:bg-surface-2 hover:text-fg active:bg-surface-2"
                    >
                      <MenuItem icon={<Ban />} tone="danger" onSelect={() => void ask(referral)}>
                        {t.revoke}
                      </MenuItem>
                    </Menu>
                  )}
                </ListItem>
              );
            })}
          </List>
        )}
      </section>
    </div>
  );
}
