"use client";

import type {
  BatchDto,
  CreateExportBody,
  DownloadLinkDto,
  ExportDto,
  ExportKind,
  ExportScope,
  PaperFitDto,
  PaperKind,
  SellerDto,
} from "@ingressoimpresso/api-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Download, FileDown, FolderArchive, Home, Layers, MessageCircle, Plus, Printer, type LucideIcon } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { ReadOnlyNotice, useEventAccess, useEventTexts, type EventTexts } from "@/components/event/access";
import {
  Alert,
  Badge,
  Button,
  Dialog,
  EmptyState,
  ErrorMessage,
  Field,
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
import { common as commonTexts } from "@/texts/pt-BR/common";
import { errors as errorsTexts } from "@/texts/pt-BR/errors";

import { TabHeader } from "./tab-header";
import type { SelectTab } from "./tabs";

const KINDS: readonly ExportKind[] = ["home", "print", "control", "whatsapp"];
const KIND_ICONS: Record<ExportKind, LucideIcon> = {
  home: Home,
  print: Printer,
  control: ClipboardList,
  whatsapp: MessageCircle,
};
const STATUS_TONE: Record<ExportDto["status"], Tone> = { queued: "neutral", running: "brand", done: "success", failed: "danger" };

function scopeLabel(t: EventTexts["files"], scope: ExportScope, batches: BatchDto[], sellers: SellerDto[]): string {
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

const PAPER_GROUPS: readonly { key: "plain" | "perforated" | "labels"; papers: readonly PaperKind[] }[] = [
  { key: "plain", papers: ["plain"] },
  { key: "perforated", papers: ["perforated3", "perforated4", "perforated6", "perforated8", "perforated10"] },
  { key: "labels", papers: ["labels21", "labels14", "labels8", "labels2"] },
];

const mmText = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

/**
 * The paper of the home file (ADR 0102): plain A4 with cut marks, A4 perforated in pieces or a
 * sheet of labels, each with how the current design sits on it.
 */
function PaperPicker({ eventId, value, onChange }: { eventId: string; value: PaperKind; onChange: (paper: PaperKind) => void }) {
  const t = useEventTexts().files.paper;
  const papers = useQuery({ queryKey: ["papers", eventId], queryFn: () => api<PaperFitDto[]>(`/api/events/${eventId}/papers`) });
  const fits = new Map((papers.data ?? []).map((item) => [item.paper, item]));
  const chosen = fits.get(value);
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-sm font-medium text-fg">{t.label}</legend>
      {papers.isError && <ErrorMessage error={papers.error} />}
      {PAPER_GROUPS.map((group) => (
        <div key={group.key} className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold tracking-wide text-fg-subtle uppercase">{t.groups[group.key]}</span>
          <div className={cn("grid gap-2", group.key !== "plain" && "sm:grid-cols-2")}>
            {group.papers.map((paper) => {
              const fit = fits.get(paper);
              const scale = fit?.scale ?? null;
              const disabled = fit !== undefined && scale === null;
              const selected = value === paper;
              const piece = fit?.pieceMm ?? null;
              return (
                <label
                  key={paper}
                  className={cn(
                    "flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand",
                    selected ? "border-brand bg-brand-soft/60" : "border-border hover:border-border-strong active:bg-surface-2",
                    disabled && "cursor-not-allowed opacity-55 hover:border-border",
                  )}
                >
                  <input
                    type="radio"
                    name="paper"
                    value={paper}
                    checked={selected}
                    disabled={disabled || fit === undefined}
                    onChange={() => {
                      onChange(paper);
                    }}
                    className="size-4 shrink-0 accent-[var(--brand)]"
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm font-medium text-fg">{t.names[paper]}</span>
                    <span className="text-xs text-fg-muted">
                      {piece === null ? t.plainHint : t.piece(mmText(piece[0]), mmText(piece[1]))}
                    </span>
                  </span>
                  {fit !== undefined && piece !== null && (
                    <Badge tone={scale === null ? "neutral" : scale >= 0.999 ? "success" : "warning"} className="shrink-0">
                      {scale === null ? t.noFit : scale >= 0.999 ? t.asIs : t.scaled(Math.round(scale * 100))}
                    </Badge>
                  )}
                </label>
              );
            })}
          </div>
          {group.key === "labels" && <p className="text-xs leading-relaxed text-fg-muted">{t.labelsHint}</p>}
        </div>
      ))}
      {[...fits.values()].some((item) => item.scale === null) && <p className="text-xs leading-relaxed text-fg-muted">{t.noFitHint}</p>}
      {value !== "plain" && chosen !== undefined && <Alert tone="brand">{t.tip}</Alert>}
    </fieldset>
  );
}

/** What to generate: the kind of file, which tickets and the print options (ADR 0087). */
function NewFileDialog({
  eventId,
  open,
  onClose,
  onSelect,
  paidBatches,
  sellers,
}: {
  eventId: string;
  open: boolean;
  onClose: () => void;
  onSelect: SelectTab;
  paidBatches: BatchDto[];
  sellers: SellerDto[];
}) {
  const t = useEventTexts().files;
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<ExportKind>("home");
  const [scope, setScope] = useState<ExportScope>({ type: "all" });
  const [cropMarks, setCropMarks] = useState(true);
  const [paper, setPaper] = useState<PaperKind>("plain");
  const generate = useMutation({
    mutationFn: () => {
      const body: CreateExportBody = { kind, scope, cropMarks, ...(kind === "home" ? { paper } : {}) };
      return api<ExportDto>(`/api/events/${eventId}/exports`, { method: "POST", body });
    },
    onSuccess: () => {
      toast.success(t.queuedToast);
      void queryClient.invalidateQueries({ queryKey: ["exports", eventId] });
      onClose();
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    generate.mutate();
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t.newFile}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {commonTexts.cancel}
          </Button>
          <Button type="submit" form="new-file-form" icon={<FileDown />} loading={generate.isPending}>
            {generate.isPending ? t.generating : t.generate}
          </Button>
        </>
      }
    >
      <form id="new-file-form" onSubmit={submit} className="flex flex-col gap-5">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium text-fg">{t.kind}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {KINDS.map((item) => {
              const Icon = KIND_ICONS[item];
              const selected = kind === item;
              return (
                <label
                  key={item}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand",
                    selected ? "border-brand bg-brand-soft/60" : "border-border hover:border-border-strong active:bg-surface-2",
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
        <Field label={t.scope}>
          <Select
            value={encodeScope(scope)}
            onChange={(e) => {
              setScope(decodeScope(e.target.value));
            }}
          >
            <option value="all">{t.scopeAll}</option>
            {paidBatches.map((batch) => (
              <option key={batch.id} value={`batch:${batch.id}`}>
                {t.scopeBatch(batch.first, batch.last)}
              </option>
            ))}
            {sellers.map((seller) => (
              <option key={seller.id} value={`seller:${seller.id}`}>
                {t.scopeSeller(seller.name)}
              </option>
            ))}
          </Select>
        </Field>
        {kind === "home" && open && <PaperPicker eventId={eventId} value={paper} onChange={setPaper} />}
        {kind === "print" && (
          <div className="rounded-xl border border-border px-4 py-3">
            <Switch label={t.cropMarks} description={t.cropMarksHint} checked={cropMarks} onChange={setCropMarks} />
          </div>
        )}
        {kind === "whatsapp" && (
          <>
            <Alert tone="warning">{t.whatsappWarning}</Alert>
            <Alert
              tone="brand"
              action={
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    onClose();
                    onSelect("digital");
                  }}
                >
                  {t.digitalTipAction}
                </Button>
              }
            >
              {t.digitalTip}
            </Alert>
          </>
        )}
        <ErrorMessage error={generate.error} />
      </form>
    </Dialog>
  );
}

export function FilesTab({ eventId, onSelect }: { eventId: string; onSelect: SelectTab }) {
  const t = useEventTexts().files;
  const { can } = useEventAccess();
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
  const [creating, setCreating] = useState(false);

  const download = useMutation({
    mutationFn: (id: string) => api<DownloadLinkDto>(`/api/exports/${id}/link`, { method: "POST" }),
    onSuccess: (link) => {
      // An anchor, not a navigation: the temporary link never lands in the browser history.
      const anchor = document.createElement("a");
      anchor.href = link.url;
      anchor.rel = "noopener";
      anchor.click();
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });

  const paidBatches = (batches.data ?? []).filter((batch) => batch.status === "paid");
  const sellerList = sellers.data ?? [];
  const noPaid = batches.data !== undefined && paidBatches.length === 0;
  const newButton = can("delivery") && !noPaid && (
    <Button
      icon={<Plus />}
      onClick={() => {
        setCreating(true);
      }}
    >
      {t.newFile}
    </Button>
  );

  return (
    <div className="flex flex-col gap-6">
      <TabHeader tab="files" help={t.intro} actions={newButton} />
      {!can("delivery") ? (
        <ReadOnlyNotice eventId={eventId} area="delivery" />
      ) : (
        noPaid && (
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
        )
      )}
      <NewFileDialog
        eventId={eventId}
        open={creating}
        onClose={() => {
          setCreating(false);
        }}
        onSelect={onSelect}
        paidBatches={paidBatches}
        sellers={sellerList}
      />

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
                    <span className="truncate text-sm font-semibold text-fg">
                      {t.kinds[item.kind]}
                      {item.kind === "home" && item.paper !== "plain" && <span className="font-normal text-fg-muted"> · {t.paper.names[item.paper]}</span>}
                    </span>
                    <span className="truncate text-xs text-fg-muted">
                      {scopeLabel(t, item.scope, batches.data ?? [], sellerList)}
                      {item.ticketCount !== null && ` · ${t.tickets(item.ticketCount)}`}
                      {` · ${shortDateTime(item.createdAt)}`}
                    </span>
                  </span>
                  <Badge tone={STATUS_TONE[item.status]} dot pulse={working}>
                    {t.status[item.status]}
                  </Badge>
                  {item.status === "failed" && item.error !== null && (
                    <p className="w-full text-xs leading-relaxed text-danger-fg">
                      {(errorsTexts as Readonly<Record<string, string>>)[item.error] ?? errorsTexts.generic}
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
