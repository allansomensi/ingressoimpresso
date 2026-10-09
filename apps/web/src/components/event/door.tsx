"use client";

import type {
  CreateDoorAccessBody,
  CreatedDoorAccess,
  DoorAccessDto,
  DoorDeviceDto,
  DoorOverviewDto,
} from "@ingressoimpresso/api-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Link2, LogIn, MessageCircle, Plus, Smartphone, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { QrCode } from "@/components/qr";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ErrorMessage,
  Field,
  Input,
  Lead,
  LoadingBlock,
  Stat,
  buttonClass,
  errorMessage,
  useConfirm,
} from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { shortDateTime } from "@/lib/format";
import { texts } from "@/texts/pt-BR";

const t = texts.event.door;
/** A phone that synced this recently is shown as online (it syncs every few seconds). */
const ONLINE_MS = 60_000;

/** The door link: the token stays in the fragment, never sent to any server (ADR 0007). */
function doorUrl(token: string): string {
  return `${window.location.origin}/portaria#acesso=${token}`;
}

function accessState(access: DoorAccessDto, now: number): "active" | "expired" | "revoked" {
  if (access.revokedAt !== null) {
    return "revoked";
  }
  return Date.parse(access.expiresAt) <= now ? "expired" : "active";
}

export function DoorTab({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const key = ["door", eventId];
  const overview = useQuery({
    queryKey: key,
    queryFn: () => api<DoorOverviewDto>(`/api/events/${eventId}/door`),
    // Last contact of each phone changes while the door is working.
    refetchInterval: 15_000,
  });
  const [label, setLabel] = useState<string>(t.defaultLabel);
  const [created, setCreated] = useState<{ url: string; label: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });
  const onError = (error: unknown) => {
    toast.error(errorMessage(error));
  };

  const create = useMutation({
    mutationFn: () => {
      const body: CreateDoorAccessBody = { label: label.trim() };
      return api<CreatedDoorAccess>(`/api/events/${eventId}/door/accesses`, { method: "POST", body });
    },
    onSuccess: (result) => {
      setCreated({ url: doorUrl(result.token), label: result.access.label });
      setCopied(false);
      void refresh();
    },
  });
  const revokeAccess = useMutation({
    mutationFn: (id: string) => api<DoorAccessDto>(`/api/door-accesses/${id}/revoke`, { method: "POST" }),
    onSuccess: refresh,
    onError,
  });
  const revokeDevice = useMutation({
    mutationFn: (id: string) => api<DoorDeviceDto>(`/api/door-devices/${id}/revoke`, { method: "POST" }),
    onSuccess: refresh,
    onError,
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate();
  };
  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success(t.copied);
    } catch {
      setCopied(false);
    }
  };

  if (overview.isPending) {
    return <LoadingBlock rows={2} />;
  }
  if (overview.isError) {
    return <ErrorMessage error={overview.error} />;
  }
  // Expiry and "online" are judged at the time of the last fetch (rendering stays pure).
  const now = overview.dataUpdatedAt;
  const labels = new Map(overview.data.accesses.map((access) => [access.id, access.label]));
  const online = (device: DoorDeviceDto) =>
    device.revokedAt === null && device.lastSeenAt !== null && now - Date.parse(device.lastSeenAt) < ONLINE_MS;
  const activeLinks = overview.data.accesses.filter((access) => accessState(access, now) === "active").length;

  return (
    <div className="flex flex-col gap-6">
      <Lead>{t.intro}</Lead>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label={t.entriesLabel} value={overview.data.entryCount.toLocaleString("pt-BR")} hint={t.entries(overview.data.entryCount)} icon={LogIn} tone="success" />
        <Stat label={t.devicesOnline} value={overview.data.devices.filter(online).length} icon={Smartphone} />
        <Stat label={t.linksActive} value={activeLinks} icon={Link2} />
      </div>

      {created !== null && (
        <Card className="border-brand/40 ring-4 ring-brand/10 animate-pop">
          <div className="flex flex-col gap-6 md:flex-row md:items-center">
            <div className="flex flex-col items-center gap-2">
              <div className="rounded-2xl border border-border bg-white p-3 shadow-sm">
                <QrCode text={created.url} size={184} label={t.qrLabel} className="bg-white" />
              </div>
              <span className="text-xs text-fg-muted">{t.qrHint}</span>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-lg font-semibold tracking-tight text-fg">{t.createdTitle(created.label)}</h3>
                <Button variant="ghost" size="icon" aria-label={t.hide} onClick={() => { setCreated(null); }}>
                  <X />
                </Button>
              </div>
              <p className="text-sm leading-relaxed text-warning-fg">{t.createdHint}</p>
              <code className="rounded-xl border border-border bg-surface-2 p-3 font-mono text-xs break-all text-fg-muted">{created.url}</code>
              <div className="flex flex-wrap gap-2">
                <Button icon={copied ? <Check /> : <Copy />} onClick={() => { void copy(created.url); }}>
                  {copied ? t.copied : t.copy}
                </Button>
                <a
                  className={buttonClass({ variant: "secondary" })}
                  href={`https://wa.me/?text=${encodeURIComponent(`${t.whatsappMessage}\n${created.url}`)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle />
                  {t.whatsapp}
                </a>
              </div>
            </div>
          </div>
        </Card>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={t.links} icon={Link2} />
          <form onSubmit={submit} className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field label={t.label} className="flex-1">
              <Input value={label} maxLength={60} onChange={(e) => { setLabel(e.target.value); }} />
            </Field>
            <Button type="submit" icon={<Plus />} loading={create.isPending} disabled={label.trim() === ""}>
              {t.create}
            </Button>
          </form>
          <ErrorMessage error={create.error} className="mb-4" />
          {overview.data.accesses.length === 0 ? (
            <p className="text-sm text-fg-subtle">{t.noLinks}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {overview.data.accesses.map((access) => {
                const state = accessState(access, now);
                return (
                  <li key={access.id} className={cn("flex items-center gap-3 py-3", state !== "active" && "opacity-60")}>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium text-fg">{access.label}</span>
                      <span className="text-xs text-fg-muted">
                        {state === "active" ? t.activeUntil(shortDateTime(access.expiresAt)) : state === "expired" ? t.expired : t.revoked}
                      </span>
                    </span>
                    {state === "active" ? (
                      <Button
                        variant="danger-ghost"
                        size="sm"
                        onClick={() => {
                          void confirm({
                            title: t.revokeLinkConfirmTitle(access.label),
                            description: t.revokeLinkConfirmBody,
                            confirmLabel: t.revokeLink,
                          }).then((ok) => {
                            if (ok) {
                              revokeAccess.mutate(access.id);
                            }
                          });
                        }}
                      >
                        {t.revokeLink}
                      </Button>
                    ) : (
                      <Badge>{state === "expired" ? t.expired : t.revoked}</Badge>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title={t.devices} icon={Smartphone} />
          {overview.data.devices.length === 0 ? (
            <p className="text-sm text-fg-subtle">{t.noDevices}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {overview.data.devices.map((device) => {
                const isOnline = online(device);
                const revoked = device.revokedAt !== null;
                return (
                  <li key={device.id} className={cn("flex items-center gap-3 py-3", revoked && "opacity-55")}>
                    <span className="relative flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-fg-muted">
                      <Smartphone className="size-4" aria-hidden />
                      {isOnline && <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-success ring-2 ring-surface" />}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium text-fg">{device.name}</span>
                      <span className="truncate text-xs text-fg-muted">
                        {labels.get(device.accessId) ?? ""} · {t.scans(device.scanCount)} ·{" "}
                        {revoked
                          ? t.disconnected
                          : isOnline
                            ? t.online
                            : device.lastSeenAt === null
                              ? t.neverSeen
                              : t.lastSeen(shortDateTime(device.lastSeenAt))}
                      </span>
                    </span>
                    {!revoked && (
                      <Button
                        variant="danger-ghost"
                        size="sm"
                        onClick={() => {
                          void confirm({
                            title: t.disconnectConfirmTitle(device.name),
                            description: t.disconnectConfirmBody,
                            confirmLabel: t.disconnect,
                          }).then((ok) => {
                            if (ok) {
                              revokeDevice.mutate(device.id);
                            }
                          });
                        }}
                      >
                        {t.disconnect}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
