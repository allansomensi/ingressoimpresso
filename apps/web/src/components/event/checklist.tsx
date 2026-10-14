"use client";

import type { ChecklistDto, ChecklistItemDto } from "@ingressoimpresso/api-types";
import { Check, CheckCircle2, ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import { Badge, Card, CardHeader } from "@/components/ui";
import { checklistTarget, requiredDone, splitItems } from "@/lib/checklist";
import { cn } from "@/lib/cn";
import { checklist as checklistTexts } from "@/texts/pt-BR";

import type { SelectTab } from "./tabs";

const t = checklistTexts;

/**
 * "O que falta" (ADR 0078): what the event still needs, worked out by the API, in the order the
 * work goes. Each item leads to where it is done when the user may do it; the rest shows its
 * state. Once every required item is done the card folds into one line that reopens the list.
 */
export function ChecklistCard({ list, onSelect, onEditEvent }: { list: ChecklistDto; onSelect: SelectTab; onEditEvent: () => void }) {
  const complete = list.missing === 0;
  const [open, setOpen] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const { open: pending, done } = splitItems(list);
  // The next thing to do: the first required item the user can act on.
  const next = pending.find((item) => item.state === "missing" && item.canAct);
  const rows = (items: ChecklistItemDto[]) =>
    items.map((item) => (
      <li key={item.key}>
        <ItemRow item={item} next={item === next} onSelect={onSelect} onEditEvent={onEditEvent} />
      </li>
    ));

  if (complete && !open) {
    return (
      <Card className="border-success/30">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-success-soft text-success-fg">
            <CheckCircle2 aria-hidden className="size-[18px]" />
          </span>
          <div className="flex min-w-0 flex-1 basis-56 flex-col gap-0.5">
            <h2 className="text-base font-semibold tracking-tight text-fg">{t.completeTitle}</h2>
            <p className="text-sm leading-relaxed text-fg-muted">{t.completeBody}</p>
          </div>
          <FoldButton
            open={false}
            onClick={() => {
              setOpen(true);
            }}
          >
            {t.showList}
          </FoldButton>
        </div>
      </Card>
    );
  }

  const total = list.required;
  const ready = requiredDone(list);
  return (
    <Card className="max-lg:order-2">
      <CardHeader
        title={t.title}
        description={t.subtitle}
        actions={
          complete ? (
            <FoldButton
              open
              onClick={() => {
                setOpen(false);
              }}
            >
              {t.hideList}
            </FoldButton>
          ) : (
            <span className="text-sm font-medium text-fg-muted tabular">{t.progress(ready, total)}</span>
          )
        }
      />
      <div
        role="progressbar"
        aria-label={t.progress(ready, total)}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={ready}
        className="mb-5 h-1.5 overflow-hidden rounded-full bg-surface-3"
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-500", complete ? "bg-success-solid" : "bg-gradient-to-r from-brand to-brand-hover")}
          style={{ width: `${String(total === 0 ? 100 : (ready / total) * 100)}%` }}
        />
      </div>
      <ol className="flex flex-col gap-1.5">
        {rows(pending)}
        {(showDone || complete) && rows(done)}
      </ol>
      {!complete && done.length > 0 && (
        <button
          type="button"
          aria-expanded={showDone}
          onClick={() => {
            setShowDone((value) => !value);
          }}
          className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-fg-muted transition hover:bg-surface-2 hover:text-fg active:bg-surface-2 pointer-coarse:min-h-11"
        >
          <ChevronDown aria-hidden className={cn("size-4 transition-transform", showDone && "rotate-180")} />
          {showDone ? t.hideDone : t.showDone(done.length)}
        </button>
      )}
    </Card>
  );
}

function FoldButton({ open, onClick, children }: { open: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onClick}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-fg transition hover:bg-surface-2 active:bg-surface-2 pointer-coarse:min-h-11"
    >
      {children}
      <ChevronDown aria-hidden className={cn("size-4 text-fg-subtle transition-transform", open && "rotate-180")} />
    </button>
  );
}

/** What the row says under the title: why it is missing, how far, or who takes care of it. */
function detail(item: ChecklistItemDto): string {
  if (item.state === "done") {
    return item.progress === null ? t.items[item.key].body : t.sellerLinks(item.progress.done, item.progress.total);
  }
  if (item.hint !== null) {
    return t.hints[item.hint];
  }
  if (item.progress !== null) {
    return t.sellerLinks(item.progress.done, item.progress.total);
  }
  return t.items[item.key].body;
}

function ItemRow({
  item,
  next,
  onSelect,
  onEditEvent,
}: {
  item: ChecklistItemDto;
  next: boolean;
  onSelect: SelectTab;
  onEditEvent: () => void;
}) {
  const isDone = item.state === "done";
  const target = checklistTarget(item.key);
  const someoneElse = !item.canAct && !isDone && (item.area === null ? t.organizationOnly : t.otherPerson);
  const content = (
    <>
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full",
          isDone
            ? "bg-success-solid text-white"
            : item.state === "optional"
              ? "border-2 border-dashed border-border-strong"
              : next
                ? "border-2 border-brand bg-surface"
                : "border-2 border-border-strong",
        )}
      >
        {isDone && <Check className="size-4" strokeWidth={3} aria-label={t.done} />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={cn("font-medium", isDone ? "text-fg-muted" : "text-fg")}>{t.items[item.key].title}</span>
          {item.optional && !isDone && <Badge tone="neutral">{t.optional}</Badge>}
        </span>
        <span className={cn("text-sm", item.hint !== null && !isDone ? "text-warning-fg" : "text-fg-muted")}>{detail(item)}</span>
        {someoneElse !== false && <span className="text-xs text-fg-subtle">{someoneElse}</span>}
      </span>
      {item.canAct && (
        <ChevronRight aria-hidden className="size-4 shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5" />
      )}
    </>
  );
  const rowClass = cn(
    "group flex w-full items-center gap-3.5 rounded-xl border px-3.5 py-3 text-left transition sm:gap-4 sm:px-4",
    next ? "border-brand/40 bg-brand-soft/60" : "border-transparent",
  );
  if (!item.canAct) {
    return <div className={rowClass}>{content}</div>;
  }
  const interactive = cn(rowClass, next ? "hover:bg-brand-soft active:bg-brand-soft" : "hover:border-border hover:bg-surface-2 active:bg-surface-2");
  if (target.kind === "profile") {
    return (
      <Link href="/painel/organizacao" className={interactive}>
        {content}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        if (target.kind === "edit") {
          onEditEvent();
        } else {
          onSelect(target.tab);
        }
      }}
      className={interactive}
    >
      {content}
    </button>
  );
}
