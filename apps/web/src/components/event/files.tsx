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
import { ClipboardList, Download, FileDown, FolderArchive, Home, Layers, MessageCircle, Printer, type LucideIcon } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorMessage,
  Field,
  Lead,
  LoadingBlock,
  Select,
  Spinner,
  Switch,
  errorMessage,
  type Tone,
} from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { shortDateTime } from "@/lib/format";
import { texts } from "@/texts/pt-BR";

import type { SelectTab } from "./tabs";

const t = texts.event.files;
const KINDS: readonly ExportKind[] = ["home", "print", "control", "whatsapp"];
const KIND_ICONS: Record<ExportKind, LucideIcon> = {
  home: Home,
  print: Printer,
  control: ClipboardList,
  whatsapp: MessageCircle,
};
const STATUS_TONE: Record<ExportDto["status"], Tone> = { queued: "neutral", running: "brand", done: "success", failed: "danger" };

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

export function FilesTab({ eventId, onSelect }: { eventId: string; onSelect: SelectTab }) {
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
    onSuccess: () => {
      toast.success(t.queuedToast);
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });
  const download = useMutation({
    mutationFn: (id: string) => api<DownloadLinkDto>(`/api/exports/${id}/link`, { method: "POST" }),
    onSuccess: (link) => {
      window.location.assign(link.url);
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    generate.mutate();
  };
  const paidBatches = (batches.data ?? []).filter((batch) => batch.status === "paid");
  const sellerList = sellers.data ?? [];
  const noPaid = batches.data !== undefined && paidBatches.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <Lead>{t.intro}</Lead>
      {noPaid ? (
        <EmptyState
          icon={Layers}
          title={t.noPaidTitle}
          description={t.noPaid}
          action={
            <Button
              onClick={() => {
                onSelect("batches");
              }}
            >
              {t.goToBatches}
            </Button>
          }
        />
      ) : (
        <Card>
          <CardHeader title={t.newFile} icon={FileDown} />
          <form onSubmit={submit} className="flex flex-col gap-5">
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium text-fg">{t.kind}</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {KINDS.map((item) => {
                  const Icon = KIND_ICONS[item];
                  const selected = kind === item;
                  return (
                    <label
                      key={item}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand",
                        selected ? "border-brand bg-brand-soft/60 ring-2 ring-brand/20" : "border-border hover:border-border-strong hover:bg-surface-2",
                      )}
                    >
                      <input
                        type="radio"
                        name="kind"
                        value={item}
                        checked={selected}
                        onChange={() => {
                          setKind(item);
                        }}
                        className="sr-only"
                      />
                      <span
                        className={cn(
                          "flex size-9 shrink-0 items-center justify-center rounded-lg",
                          selected ? "bg-brand-solid text-brand-fg" : "bg-surface-2 text-fg-muted",
                        )}
                      >
                        <Icon className="size-[18px]" aria-hidden />
                      </span>
                      <span className="flex flex-col gap-0.5">
                        <span className="text-sm font-semibold text-fg">{t.kinds[item]}</span>
                        <span className="text-xs leading-relaxed text-fg-muted">{t.kindHints[item]}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
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
                <div className="rounded-xl border border-border px-4 py-3">
                  <Switch label={t.cropMarks} description={t.cropMarksHint} checked={cropMarks} onChange={setCropMarks} />
                </div>
              )}
            </div>
            {kind === "whatsapp" && <Alert tone="warning">{t.whatsappWarning}</Alert>}
            <ErrorMessage error={generate.error} />
            <Button type="submit" icon={<FileDown />} loading={generate.isPending} className="w-full sm:w-fit">
              {generate.isPending ? t.generating : t.generate}
            </Button>
          </form>
        </Card>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold tracking-tight text-fg">{t.history}</h2>
        {exports.isPending ? (
          <LoadingBlock rows={1} />
        ) : exports.isError ? (
          <ErrorMessage error={exports.error} />
        ) : exports.data.length === 0 ? (
          <EmptyState icon={FolderArchive} title={t.emptyTitle} description={t.empty} />
        ) : (
          <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-xs">
            {exports.data.map((item) => {
              const Icon = KIND_ICONS[item.kind];
              const working = item.status === "queued" || item.status === "running";
              return (
                <li key={item.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5 sm:px-5">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-fg-muted">
                    {working ? <Spinner className="text-brand" /> : <Icon className="size-[18px]" aria-hidden />}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-semibold text-fg">{t.kinds[item.kind]}</span>
                    <span className="truncate text-xs text-fg-muted">
                      {scopeLabel(item.scope, batches.data ?? [], sellerList)}
                      {item.ticketCount !== null && ` · ${t.tickets(item.ticketCount)}`}
                      {` · ${shortDateTime(item.createdAt)}`}
                    </span>
                  </span>
                  <Badge tone={STATUS_TONE[item.status]} dot pulse={working}>
                    {t.status[item.status]}
                  </Badge>
                  {item.status === "failed" && item.error !== null && (
                    <p className="w-full text-xs leading-relaxed text-danger-fg">
                      {(texts.errors as Readonly<Record<string, string>>)[item.error] ?? texts.errors.generic}
                    </p>
                  )}
                  {item.status === "done" && (
                    <Button
                      size="sm"
                      icon={<Download />}
                      loading={download.isPending && download.variables === item.id}
                      onClick={() => {
                        download.mutate(item.id);
                      }}
                    >
                      {t.download}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
