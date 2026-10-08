"use client";

import type {
  CreateDoorAccessBody,
  CreatedDoorAccess,
  DoorAccessDto,
  DoorDeviceDto,
  DoorOverviewDto,
} from "@ingressoimpresso/api-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { QrCode } from "@/components/qr";
import { Button, Card, ErrorMessage, Field, Input } from "@/components/ui";
import { api } from "@/lib/api";
import { texts } from "@/texts/pt-BR";

const t = texts.event.door;

/** The door link: the token stays in the fragment, never sent to any server (ADR 0007). */
function doorUrl(token: string): string {
  return `${window.location.origin}/portaria#acesso=${token}`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function accessStatus(access: DoorAccessDto, now: number): string {
  if (access.revokedAt !== null) {
    return t.revoked;
  }
  return Date.parse(access.expiresAt) <= now ? t.expired : t.activeUntil(formatTime(access.expiresAt));
}

function lastSeen(device: DoorDeviceDto): string {
  if (device.revokedAt !== null) {
    return t.disconnected;
  }
  return device.lastSeenAt === null ? t.neverSeen : t.lastSeen(formatTime(device.lastSeenAt));
}

export function DoorTab({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient();
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

  const create = useMutation({
    mutationFn: () => {
      const body: CreateDoorAccessBody = { label };
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
  });
  const revokeDevice = useMutation({
    mutationFn: (id: string) => api<DoorDeviceDto>(`/api/door-devices/${id}/revoke`, { method: "POST" }),
    onSuccess: refresh,
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate();
  };
  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  if (overview.isPending) {
    return <p className="text-sm opacity-70">{texts.common.loading}</p>;
  }
  if (overview.isError) {
    return <ErrorMessage error={overview.error} />;
  }
  // Expiry is judged at the time of the last fetch (rendering stays pure).
  const now = overview.dataUpdatedAt;
  const labels = new Map(overview.data.accesses.map((access) => [access.id, access.label]));

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm opacity-80">{t.intro}</p>
      <p className="text-lg font-semibold">{t.entries(overview.data.entryCount)}</p>

      <Card>
        <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
          <Field label={t.label}>
            <Input value={label} maxLength={60} onChange={(e) => { setLabel(e.target.value); }} />
          </Field>
          <Button type="submit" disabled={create.isPending || label.trim() === ""}>
            {t.create}
          </Button>
        </form>
        <ErrorMessage error={create.error ?? revokeAccess.error ?? revokeDevice.error} />
      </Card>

      {created !== null && (
        <Card className="flex flex-col items-start gap-3 border-amber-500">
          <p className="font-semibold">{t.createdTitle(created.label)}</p>
          <p className="text-sm">{t.createdHint}</p>
          <QrCode text={created.url} label={t.qrLabel} />
          <code className="break-all rounded bg-black/5 p-2 text-xs dark:bg-white/10">{created.url}</code>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => { void copy(created.url); }}>{copied ? t.copied : t.copy}</Button>
            <a
              className="rounded-md border border-current px-3 py-2 text-sm font-semibold"
              href={`https://wa.me/?text=${encodeURIComponent(`${t.whatsappMessage}\n${created.url}`)}`}
              target="_blank"
              rel="noreferrer"
            >
              {t.whatsapp}
            </a>
            <Button variant="secondary" onClick={() => { setCreated(null); }}>
              {t.hide}
            </Button>
          </div>
        </Card>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">{t.links}</h2>
        {overview.data.accesses.length === 0 ? (
          <p className="text-sm opacity-70">{t.noLinks}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {overview.data.accesses.map((access) => (
              <li
                key={access.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-black/10 p-3 dark:border-white/15"
              >
                <span className="font-medium">{access.label}</span>
                <span className="text-sm opacity-80">{accessStatus(access, now)}</span>
                {access.revokedAt === null && (
                  <Button variant="danger" onClick={() => { revokeAccess.mutate(access.id); }}>
                    {t.revokeLink}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">{t.devices}</h2>
        {overview.data.devices.length === 0 ? (
          <p className="text-sm opacity-70">{t.noDevices}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {overview.data.devices.map((device) => (
              <li
                key={device.id}
                className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border border-black/10 p-3 dark:border-white/15 ${device.revokedAt === null ? "" : "opacity-50"}`}
              >
                <span className="font-medium">{device.name}</span>
                <span className="text-sm opacity-80">
                  {labels.get(device.accessId) ?? ""} · {t.scans(device.scanCount)} · {lastSeen(device)}
                </span>
                {device.revokedAt === null && (
                  <Button variant="danger" onClick={() => { revokeDevice.mutate(device.id); }}>
                    {t.disconnect}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
