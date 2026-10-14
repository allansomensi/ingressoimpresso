"use client";

import type { AccountabilityDto, EventDto, LedgerBody, LedgerEntryDto, LedgerKind } from "@ingressoimpresso/api-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownCircle, ArrowUpCircle, FileSpreadsheet, FileText, MoreHorizontal, Pencil, Plus, Scale, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { useEventAccess } from "@/components/event/access";
import { Button, Card, CardHeader, Dialog, ErrorMessage, Field, Input, LoadingBlock, Menu, MenuItem, buttonClass, errorMessage, useConfirm } from "@/components/ui";
import { api, fetchBlobUrl } from "@/lib/api";
import { cn } from "@/lib/cn";
import { money, parseMoney } from "@/lib/format";
import { shortDay, todayIso } from "@/lib/settlement";
import { common as commonTexts, errors as errorsTexts, event as eventTexts } from "@/texts/pt-BR";

const t = eventTexts.accountability;

/** Saves a file the API generates (an anchor, so the link never lands in the history). */
async function saveFile(path: string, name: string) {
  const url = await fetchBlobUrl(path);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 10_000);
}

/** The accountability (ADR 0058): money in and out, the files for the group and the entries. */
export function Accountability({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient();
  const event = useQuery({ queryKey: ["event", eventId], queryFn: () => api<EventDto>(`/api/events/${eventId}`) });
  const { can } = useEventAccess();
  const editable = can("money");
  const summary = useQuery({
    queryKey: ["accountability", eventId],
    queryFn: () => api<AccountabilityDto>(`/api/events/${eventId}/accountability`),
  });
  const [dialog, setDialog] = useState<{ entry: LedgerEntryDto | null; kind: LedgerKind } | null>(null);
  const download = useMutation({
    mutationFn: (format: "pdf" | "xlsx") => saveFile(`/api/events/${eventId}/accountability/${format}`, t.fileName(event.data?.name ?? "", format)),
    onError: (error) => toast.error(errorMessage(error)),
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["accountability", eventId] });
  };

  if (summary.isPending) {
    return <LoadingBlock rows={2} />;
  }
  if (summary.isError) {
    return <ErrorMessage error={summary.error} />;
  }
  const s = summary.data;
  const spent = s.expensesCents + s.platformCents;

  return (
    <Card>
      <CardHeader
        icon={Scale}
        title={t.title}
        description={t.hint}
        actions={
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <Button
              size="sm"
              variant="secondary"
              icon={<FileText />}
              loading={download.isPending && download.variables === "pdf"}
              onClick={() => {
                download.mutate("pdf");
              }}
            >
              {t.pdf}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              icon={<FileSpreadsheet />}
              loading={download.isPending && download.variables === "xlsx"}
              onClick={() => {
                download.mutate("xlsx");
              }}
            >
              {t.sheet}
            </Button>
          </div>
        }
      />
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Figure label={t.received} value={money(s.receivedCents)} hint={s.outstandingCents !== null && s.outstandingCents > 0 ? t.outstanding(money(s.outstandingCents)) : null} />
        <Figure label={t.otherIncome} value={money(s.otherIncomeCents)} hint={null} />
        <Figure label={t.spent} value={money(spent)} hint={s.platformCents > 0 ? t.platform(money(s.platformCents)) : null} />
        <Figure label={t.balance} value={money(s.balanceCents)} hint={t.balanceHint} tone={s.balanceCents < 0 ? "bad" : "good"} strong />
      </dl>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-fg">{t.entries}</h3>
        {editable && (
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" icon={<ArrowDownCircle />} onClick={() => { setDialog({ entry: null, kind: "expense" }); }}>
              {t.addExpense}
            </Button>
            <Button size="sm" variant="secondary" icon={<ArrowUpCircle />} onClick={() => { setDialog({ entry: null, kind: "income" }); }}>
              {t.addIncome}
            </Button>
          </div>
        )}
      </div>
      {s.entriesList.length === 0 ? (
        <p className="mt-3 rounded-xl bg-surface-2 px-4 py-3 text-sm text-fg-muted">{editable ? t.emptyEditable : t.empty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
          {s.entriesList.map((entry) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              editable={editable}
              onEdit={() => {
                setDialog({ entry, kind: entry.kind });
              }}
              onChange={refresh}
            />
          ))}
        </ul>
      )}

      {dialog !== null && (
        <EntryDialog
          key={dialog.entry?.id ?? dialog.kind}
          eventId={eventId}
          entry={dialog.entry}
          kind={dialog.kind}
          categories={[...new Set(s.entriesList.map((entry) => entry.category).filter((category): category is string => category !== null))]}
          onClose={() => {
            setDialog(null);
          }}
          onSaved={refresh}
        />
      )}
    </Card>
  );
}

function Figure({
  label,
  value,
  hint,
  tone,
  strong = false,
}: {
  label: string;
  value: string;
  hint: string | null;
  tone?: "good" | "bad";
  strong?: boolean;
}) {
  return (
    <div className={cn("flex flex-col gap-1 rounded-xl p-3.5", strong ? "bg-surface-2" : "border border-border")}>
      <dt className="text-xs font-medium text-fg-muted">{label}</dt>
      <dd className={cn("text-lg font-semibold tabular", tone === "good" ? "text-success-fg" : tone === "bad" ? "text-danger-fg" : "text-fg")}>{value}</dd>
      {hint !== null && <dd className="text-xs text-fg-subtle">{hint}</dd>}
    </div>
  );
}

function EntryRow({ entry, editable, onEdit, onChange }: { entry: LedgerEntryDto; editable: boolean; onEdit: () => void; onChange: () => void }) {
  const confirm = useConfirm();
  const income = entry.kind === "income";
  const remove = useMutation({
    mutationFn: () => api(`/api/ledger/${entry.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success(t.removed);
      onChange();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", income ? "bg-success-soft text-success-fg" : "bg-danger-soft text-danger-fg")}>
        {income ? <ArrowUpCircle className="size-4" aria-hidden /> : <ArrowDownCircle className="size-4" aria-hidden />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium text-fg">{entry.description}</span>
        <span className="truncate text-xs text-fg-muted">
          {shortDay(entry.occurredOn)}
          {entry.category !== null && ` · ${entry.category}`}
        </span>
      </span>
      <span className={cn("shrink-0 text-sm font-semibold tabular", income ? "text-success-fg" : "text-fg")}>
        {income ? "+" : "−"} {money(entry.amountCents)}
      </span>
      {editable && (
        <Menu label={t.menu(entry.description)} trigger={<MoreHorizontal />} triggerClassName={buttonClass({ variant: "ghost", size: "icon-sm" })}>
          <MenuItem icon={<Pencil />} onSelect={onEdit}>
            {t.edit}
          </MenuItem>
          <MenuItem
            icon={<Trash2 />}
            tone="danger"
            onSelect={() => {
              void confirm({ title: t.removeTitle, description: t.removeBody(entry.description), confirmLabel: t.remove }).then((ok) => {
                if (ok) {
                  remove.mutate();
                }
              });
            }}
          >
            {t.remove}
          </MenuItem>
        </Menu>
      )}
    </li>
  );
}

function EntryDialog({
  eventId,
  entry,
  kind: initialKind,
  categories,
  onClose,
  onSaved,
}: {
  eventId: string;
  entry: LedgerEntryDto | null;
  kind: LedgerKind;
  categories: readonly string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<LedgerKind>(initialKind);
  const [description, setDescription] = useState(entry?.description ?? "");
  const [category, setCategory] = useState(entry?.category ?? "");
  const [amount, setAmount] = useState(entry === null ? "" : (entry.amountCents / 100).toFixed(2).replace(".", ","));
  const [day, setDay] = useState(entry?.occurredOn ?? todayIso());
  const parsed = parseMoney(amount);
  const cents = parsed.ok ? parsed.cents : null;
  const valid = description.trim() !== "" && cents !== null && cents > 0 && day !== "";
  const save = useMutation({
    mutationFn: () => {
      const body: LedgerBody = {
        kind,
        description: description.trim(),
        category: category.trim() === "" ? null : category.trim(),
        amountCents: cents ?? 0,
        occurredOn: day,
      };
      return entry === null
        ? api<LedgerEntryDto>(`/api/events/${eventId}/ledger`, { method: "POST", body })
        : api(`/api/ledger/${entry.id}`, { method: "PUT", body });
    },
    onSuccess: () => {
      toast.success(t.saved);
      onSaved();
      onClose();
    },
  });
  const submit = (formEvent: FormEvent) => {
    formEvent.preventDefault();
    if (valid) {
      save.mutate();
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={entry === null ? (kind === "expense" ? t.newExpense : t.newIncome) : t.editTitle}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {commonTexts.cancel}
          </Button>
          <Button type="submit" form="ledger-entry" loading={save.isPending} disabled={!valid} icon={entry === null ? <Plus /> : undefined}>
            {entry === null ? t.add : t.save}
          </Button>
        </>
      }
    >
      <form id="ledger-entry" onSubmit={submit} className="flex flex-col gap-5">
        <div role="radiogroup" aria-label={t.kind} className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-surface-2 p-1">
          {(["expense", "income"] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={kind === option}
              onClick={() => {
                setKind(option);
              }}
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition",
                kind === option ? "bg-surface text-fg shadow-xs" : "text-fg-muted hover:text-fg",
              )}
            >
              {option === "expense" ? <ArrowDownCircle className="size-4 text-danger-fg" aria-hidden /> : <ArrowUpCircle className="size-4 text-success-fg" aria-hidden />}
              {t.kinds[option]}
            </button>
          ))}
        </div>
        <Field label={t.description}>
          <Input
            value={description}
            maxLength={120}
            required
            placeholder={kind === "expense" ? t.expensePlaceholder : t.incomePlaceholder}
            onChange={(changeEvent) => {
              setDescription(changeEvent.target.value);
            }}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label={t.amount}>
            <Input
              value={amount}
              inputMode="decimal"
              required
              placeholder="150,00"
              onChange={(changeEvent) => {
                setAmount(changeEvent.target.value);
              }}
            />
          </Field>
          <Field label={t.day}>
            <Input
              type="date"
              value={day}
              required
              onChange={(changeEvent) => {
                setDay(changeEvent.target.value);
              }}
            />
          </Field>
        </div>
        <Field label={t.category} optional hint={t.categoryHint}>
          <Input
            value={category}
            maxLength={40}
            list="ledger-categories"
            placeholder={kind === "expense" ? t.expenseCategoryPlaceholder : t.incomeCategoryPlaceholder}
            onChange={(changeEvent) => {
              setCategory(changeEvent.target.value);
            }}
          />
          <datalist id="ledger-categories">
            {[...new Set([...categories, ...(kind === "expense" ? t.expenseCategories : t.incomeCategories)])].map((item) => (
              <option key={item} value={item} />
            ))}
          </datalist>
        </Field>
        {amount.trim() !== "" && !parsed.ok && <p className="text-xs text-danger-fg">{errorsTexts.invalid_amount}</p>}
        <ErrorMessage error={save.error} />
      </form>
    </Dialog>
  );
}
