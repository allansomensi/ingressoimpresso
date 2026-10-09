"use client";

import type { AdminOrganizationDetailDto, AuditEntryDto } from "@ingressoimpresso/api-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Gift,
  History,
  LogOut,
  Pencil,
  ShieldAlert,
  ShieldCheck,
  Ticket,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { BonusDialog } from "@/components/admin/admin-views";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Dialog,
  EmptyState,
  ErrorMessage,
  Field,
  Input,
  List,
  ListItem,
  LoadingBlock,
  Stat,
  Textarea,
  errorMessage,
  useConfirm,
} from "@/components/ui";
import { api } from "@/lib/api";
import { dateTime, eventDateTime, money, shortDateTime } from "@/lib/format";
import { texts } from "@/texts/pt-BR";

const t = texts.admin.organization;

/** One line of the audit log: who did what, when. */
export function AuditLine({ entry, showOrganization = true }: { entry: AuditEntryDto; showOrganization?: boolean }) {
  const action = texts.admin.audit.actions[entry.action] ?? entry.action;
  const detail = entry.detail;
  const path = typeof detail["path"] === "string" ? `${String(detail["method"] ?? "")} ${detail["path"]}` : null;
  return (
    <ListItem className="justify-between">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium text-fg">{action}</span>
        <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-fg-muted">
          <span>{entry.actorEmail}</span>
          {showOrganization && entry.organizationName !== null && entry.organizationId !== null && (
            <Link href={`/painel/admin/organizacoes/${entry.organizationId}`} className="text-brand hover:underline">
              {entry.organizationName}
            </Link>
          )}
          {entry.eventName !== null && entry.eventId !== null && (
            <Link href={`/painel/eventos/${entry.eventId}`} className="text-brand hover:underline">
              {entry.eventName}
            </Link>
          )}
          {path !== null && <span className="font-mono">{path}</span>}
        </span>
      </div>
      <time dateTime={entry.createdAt} className="text-xs text-fg-subtle tabular">
        {shortDateTime(entry.createdAt)}
      </time>
    </ListItem>
  );
}

function RenameDialog({ detail, open, onClose }: { detail: AdminOrganizationDetailDto; open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(detail.organization.name);
  const save = useMutation({
    mutationFn: () =>
      api<AdminOrganizationDetailDto>(`/api/admin/organizations/${detail.organization.id}`, { method: "PUT", body: { name: name.trim() } }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["admin", "organization", updated.organization.id], updated);
      void queryClient.invalidateQueries({ queryKey: ["admin", "organizations"] });
      toast.success(t.renamed);
      onClose();
    },
  });
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title={t.renameTitle}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {texts.common.cancel}
          </Button>
          <Button loading={save.isPending} disabled={name.trim() === ""} onClick={() => save.mutate()}>
            {texts.common.save}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <Field label={texts.account.organizationName}>
          <Input
            value={name}
            maxLength={100}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
        </Field>
        <ErrorMessage error={save.error} />
      </form>
    </Dialog>
  );
}

function SuspendDialog({ detail, open, onClose }: { detail: AdminOrganizationDetailDto; open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const suspend = useMutation({
    mutationFn: () =>
      api<AdminOrganizationDetailDto>(`/api/admin/organizations/${detail.organization.id}/suspension`, {
        method: "PUT",
        body: { suspended: true, reason: reason.trim() === "" ? null : reason.trim() },
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["admin", "organization", updated.organization.id], updated);
      void queryClient.invalidateQueries({ queryKey: ["admin", "organizations"] });
      toast.success(t.suspended);
      onClose();
    },
  });
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title={t.suspendTitle}
      description={t.suspendBody}
      footer={
        <>
          <Button variant="secondary" autoFocus onClick={onClose}>
            {texts.common.cancel}
          </Button>
          <Button variant="danger" icon={<ShieldAlert />} loading={suspend.isPending} onClick={() => suspend.mutate()}>
            {t.suspend}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label={t.reason} optional>
          <Textarea
            value={reason}
            maxLength={200}
            placeholder={t.reasonPlaceholder}
            onChange={(event) => {
              setReason(event.target.value);
            }}
          />
        </Field>
        <ErrorMessage error={suspend.error} />
      </div>
    </Dialog>
  );
}

export function OrganizationDetail({ organizationId }: { organizationId: string }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const key = ["admin", "organization", organizationId];
  const detail = useQuery({
    queryKey: key,
    queryFn: () => api<AdminOrganizationDetailDto>(`/api/admin/organizations/${organizationId}`),
  });
  const [dialog, setDialog] = useState<"rename" | "suspend" | "bonus" | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });
  const unsuspend = useMutation({
    mutationFn: () =>
      api<AdminOrganizationDetailDto>(`/api/admin/organizations/${organizationId}/suspension`, {
        method: "PUT",
        body: { suspended: false, reason: null },
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(key, updated);
      void queryClient.invalidateQueries({ queryKey: ["admin", "organizations"] });
      toast.success(t.unsuspended);
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
  const endSessions = useMutation({
    mutationFn: (userId: string) => api<undefined>(`/api/admin/users/${userId}/sessions/revoke`, { method: "POST" }),
    onSuccess: () => {
      toast.success(t.sessionsEnded);
      void refresh();
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });

  if (detail.isPending) {
    return <LoadingBlock rows={4} />;
  }
  if (detail.isError) {
    return <ErrorMessage error={detail.error} />;
  }
  const d = detail.data;
  const o = d.organization;

  return (
    <main className="flex flex-col gap-6 animate-fade-in">
      <div className="flex flex-col gap-3">
        <Link href="/painel/admin?aba=organizacoes" className="inline-flex w-fit items-center gap-1 text-sm font-medium text-fg-muted hover:text-fg">
          <ChevronLeft className="size-4" aria-hidden />
          {t.back}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
              {o.name}
              {o.suspended && (
                <Badge tone="danger" dot>
                  {t.suspendedBadge}
                </Badge>
              )}
            </h1>
            <p className="text-sm text-fg-muted">
              {o.ownerEmail ?? "—"} · {t.since(dateTime(o.createdAt))}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={<Pencil />}
              onClick={() => {
                setDialog("rename");
              }}
            >
              {t.rename}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<Gift />}
              onClick={() => {
                setDialog("bonus");
              }}
            >
              {texts.admin.organizations.bonus}
            </Button>
            {o.suspended ? (
              <Button size="sm" icon={<ShieldCheck />} loading={unsuspend.isPending} onClick={() => unsuspend.mutate()}>
                {t.unsuspend}
              </Button>
            ) : (
              <Button
                variant="danger-ghost"
                size="sm"
                icon={<ShieldAlert />}
                onClick={() => {
                  setDialog("suspend");
                }}
              >
                {t.suspend}
              </Button>
            )}
          </div>
        </div>
      </div>

      {o.suspended && d.suspendedAt !== null && (
        <Alert tone="danger" title={t.suspendedSince(dateTime(d.suspendedAt))}>
          {d.suspendedReason ?? ""}
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={texts.admin.stats.revenue} value={money(o.revenueCents)} icon={Building2} tone="success" />
        <Stat label={texts.admin.stats.paidTickets} value={o.paidTickets.toLocaleString("pt-BR")} icon={Ticket} />
        <Stat label={texts.admin.stats.events} value={o.eventCount.toLocaleString("pt-BR")} icon={CalendarDays} />
        <Stat
          label={texts.admin.stats.freeLabel}
          value={texts.account.freeOf(o.freeUsed, o.freeTotal)}
          hint={o.bonusFreeTickets > 0 ? texts.admin.organizations.bonusBadge(o.bonusFreeTickets) : undefined}
          icon={Gift}
        />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card padded={false}>
          <div className="p-5 pb-0 sm:p-6 sm:pb-0">
            <CardHeader icon={CalendarDays} title={t.events} />
          </div>
          {d.events.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-fg-muted">{t.noEvents}</p>
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {d.events.map((event) => (
                <li key={event.id}>
                  <Link
                    href={`/painel/eventos/${event.id}`}
                    title={t.openEvent}
                    className="group flex items-center gap-3 px-5 py-3 transition hover:bg-surface-2 sm:px-6"
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-fg">{event.name}</span>
                        {event.status === "closed" && <Badge>{texts.event.actions.archivedBadge}</Badge>}
                      </span>
                      <span className="text-xs text-fg-muted">
                        {eventDateTime(event.startsAt)} · {t.eventLine(event.paidTickets, event.entries)}
                      </span>
                    </span>
                    <span className="text-sm font-semibold text-fg tabular">{money(event.revenueCents)}</span>
                    <ChevronRight className="size-4 text-fg-subtle transition group-hover:translate-x-0.5" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader icon={Users} title={t.members} />
            <ul className="flex flex-col gap-4">
              {d.members.map((member) => (
                <li key={member.userId} className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="flex items-center gap-2 text-sm font-medium text-fg">
                      <span className="truncate">{member.email}</span>
                      {member.google && (
                        <Badge tone="brand">
                          <BadgeCheck className="size-3" aria-hidden />
                          {t.google}
                        </Badge>
                      )}
                    </span>
                    {member.name !== null && <span className="text-xs text-fg-muted">{member.name}</span>}
                    <span className="text-xs text-fg-subtle">
                      {member.lastLoginAt === null ? t.neverLoggedIn : t.lastLogin(shortDateTime(member.lastLoginAt))} ·{" "}
                      {t.sessions(member.sessions)}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<LogOut />}
                    disabled={member.sessions === 0}
                    loading={endSessions.isPending && endSessions.variables === member.userId}
                    onClick={async () => {
                      if (await confirm({ title: t.endSessionsTitle(member.email), description: t.endSessionsBody, confirmLabel: t.endSessions })) {
                        endSessions.mutate(member.userId);
                      }
                    }}
                  >
                    {t.endSessions}
                  </Button>
                </li>
              ))}
            </ul>
          </Card>

          <section className="flex flex-col gap-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
              <History className="size-4 text-fg-subtle" aria-hidden />
              {t.history}
            </h2>
            {d.audit.length === 0 ? (
              <EmptyState icon={History} title={t.noHistory} />
            ) : (
              <List>
                {d.audit.map((entry) => (
                  <AuditLine key={entry.id} entry={entry} showOrganization={false} />
                ))}
              </List>
            )}
          </section>
        </div>
      </div>

      <RenameDialog
        key={`rename-${o.name}`}
        detail={d}
        open={dialog === "rename"}
        onClose={() => {
          setDialog(null);
        }}
      />
      <SuspendDialog
        key={`suspend-${String(o.suspended)}`}
        detail={d}
        open={dialog === "suspend"}
        onClose={() => {
          setDialog(null);
        }}
      />
      <BonusDialog
        key={`bonus-${String(o.bonusFreeTickets)}-${String(dialog === "bonus")}`}
        organization={dialog === "bonus" ? o : null}
        onClose={() => {
          setDialog(null);
          void refresh();
        }}
      />
    </main>
  );
}
