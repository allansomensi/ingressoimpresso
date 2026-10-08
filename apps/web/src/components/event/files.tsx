"use client";

import type {
  BatchDto,
  CreateExportBody,
  DownloadLinkDto,
  ExportDto,
  ExportKind,
  ExportScope,
  SellerDto,
} from "@ingressoimpresso/api-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { Button, Card, ErrorMessage, Field, Select } from "@/components/ui";
import { api } from "@/lib/api";
import { texts } from "@/texts/pt-BR";

const t = texts.event.files;
const KINDS: readonly ExportKind[] = ["home", "print", "control", "whatsapp"];

function scopeLabel(scope: ExportScope, batches: BatchDto[], sellers: SellerDto[]): string {
  switch (scope.type) {
    case "all":
      return t.scopeAll;
    case "batch": {
      const batch = batches.find((item) => item.id === scope.batchId);
      return batch === undefined ? "" : t.scopeBatch(batch.first, batch.last);
    }
    case "seller": {
      const seller = sellers.find((item) => item.id === scope.sellerId);
      return seller === undefined ? "" : t.scopeSeller(seller.name);
    }
  }
}

function encodeScope(scope: ExportScope): string {
  return scope.type === "all" ? "all" : scope.type === "batch" ? `batch:${scope.batchId}` : `seller:${scope.sellerId}`;
}

function decodeScope(value: string): ExportScope {
  const [type, id] = value.split(":");
  if (type === "batch" && id !== undefined) {
    return { type: "batch", batchId: id };
  }
  if (type === "seller" && id !== undefined) {
    return { type: "seller", sellerId: id };
  }
  return { type: "all" };
}

export function FilesTab({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient();
  const key = ["exports", eventId];
  const exports = useQuery({
    queryKey: key,
    queryFn: () => api<ExportDto[]>(`/api/events/${eventId}/exports`),
    // Poll while something is being generated.
    refetchInterval: (query) =>
      query.state.data?.some((item) => item.status === "queued" || item.status === "running") === true ? 2000 : false,
  });
  const batches = useQuery({ queryKey: ["batches", eventId], queryFn: () => api<BatchDto[]>(`/api/events/${eventId}/batches`) });
  const sellers = useQuery({ queryKey: ["sellers", eventId], queryFn: () => api<SellerDto[]>(`/api/events/${eventId}/sellers`) });
  const [kind, setKind] = useState<ExportKind>("home");
  const [scope, setScope] = useState<ExportScope>({ type: "all" });
  const [cropMarks, setCropMarks] = useState(true);

  const generate = useMutation({
    mutationFn: () => {
      const body: CreateExportBody = { kind, scope, cropMarks };
      return api<ExportDto>(`/api/events/${eventId}/exports`, { method: "POST", body });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });
  const download = useMutation({
    mutationFn: (id: string) => api<DownloadLinkDto>(`/api/exports/${id}/link`, { method: "POST" }),
    onSuccess: (link) => {
      window.location.assign(link.url);
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    generate.mutate();
  };
  const paidBatches = (batches.data ?? []).filter((batch) => batch.status === "paid");
  const sellerList = sellers.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm opacity-80">{t.intro}</p>
      <Card>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Field label={t.kind}>
            <Select value={kind} onChange={(e) => { setKind(e.target.value as ExportKind); }}>
              {KINDS.map((item) => (
                <option key={item} value={item}>{t.kinds[item]}</option>
              ))}
            </Select>
          </Field>
          <Field label={t.scope}>
            <Select value={encodeScope(scope)} onChange={(e) => { setScope(decodeScope(e.target.value)); }}>
              <option value="all">{t.scopeAll}</option>
              {paidBatches.map((batch) => (
                <option key={batch.id} value={`batch:${batch.id}`}>{t.scopeBatch(batch.first, batch.last)}</option>
              ))}
              {sellerList.map((seller) => (
                <option key={seller.id} value={`seller:${seller.id}`}>{t.scopeSeller(seller.name)}</option>
              ))}
            </Select>
          </Field>
          {kind === "print" && (
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={cropMarks} onChange={(e) => { setCropMarks(e.target.checked); }} />
              {t.cropMarks}
            </label>
          )}
          {kind === "whatsapp" && <p className="text-sm text-amber-700 sm:col-span-2">{t.whatsappWarning}</p>}
          <div className="sm:col-span-2">
            <Button type="submit" disabled={generate.isPending}>
              {t.generate}
            </Button>
          </div>
        </form>
        <ErrorMessage error={generate.error ?? download.error} />
      </Card>
      {exports.isPending ? (
        <p className="text-sm opacity-70">{texts.common.loading}</p>
      ) : exports.isError ? (
        <ErrorMessage error={exports.error} />
      ) : exports.data.length === 0 ? (
        <p className="text-sm opacity-70">{t.empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {exports.data.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-black/10 p-3 dark:border-white/15">
              <span className="flex flex-col">
                <span className="font-semibold">{t.kinds[item.kind]}</span>
                <span className="text-sm opacity-70">
                  {scopeLabel(item.scope, batches.data ?? [], sellerList)}
                  {item.ticketCount !== null && ` · ${t.tickets(item.ticketCount)}`}
                </span>
              </span>
              <span className="text-sm">
                {item.status === "failed" && item.error !== null
                  ? ((texts.errors as Readonly<Record<string, string>>)[item.error] ?? t.status.failed)
                  : t.status[item.status]}
              </span>
              {item.status === "done" && (
                <Button disabled={download.isPending} onClick={() => { download.mutate(item.id); }}>
                  {t.download}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
