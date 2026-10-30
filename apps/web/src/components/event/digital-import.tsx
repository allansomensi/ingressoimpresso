"use client";

import type { CategoryDto, IssueTicketsBody, IssuedTicketsDto, TicketLinkDto, TicketLinksDto, TicketOrderBody } from "@ingressoimpresso/api-types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, FileUp, Info, Upload, UserCheck } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { useEventTexts } from "@/components/event/access";
import { Alert, Badge, Button, Dialog, ErrorMessage, Field, Select, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import {
  IMPORT_FIELDS,
  MAX_ISSUE,
  alreadyHas,
  defaultColumns,
  demand,
  distinctAnswers,
  importRows,
  matchCategory,
  readSheet,
  type ColumnMap,
  type ImportField,
  type Sheet,
} from "@/lib/digital-tickets";
import { phoneLabel } from "@/lib/format";
import { plain, readSheetFile } from "@/lib/guest-list";
import { common as commonTexts } from "@/texts/pt-BR/common";

/** The value of "outside every category" and of "do not import" in the selects. */
const NONE = "none";
const SKIP = "skip";

/** A category choice: an id, `NONE` (numbers outside every category), `SKIP` or "" (not chosen). */
type Choice = string;

function categoryOfChoice(choice: Choice): string | null | undefined {
  if (choice === NONE) {
    return null;
  }
  return choice === SKIP || choice === "" ? undefined : choice;
}

/**
 * The answers of a form (Google Forms, any spreadsheet) as digital tickets (ADR 0123): the
 * columns are guessed from the header, each answer of the ticket column is matched to a category,
 * people who already have a ticket come unchecked, and everything is made in one request (all or
 * nothing) once it fits in what is free.
 */
export function ImportDialog({
  eventId,
  data,
  categories,
  onClose,
  onImported,
}: {
  eventId: string;
  data: TicketLinksDto;
  categories: readonly CategoryDto[];
  onClose: () => void;
  onImported: (links: TicketLinkDto[]) => void;
}) {
  const t = useEventTexts().digital;
  const m = t.import;
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [empty, setEmpty] = useState(false);
  const [columns, setColumns] = useState<ColumnMap>({});
  const [answers, setAnswers] = useState<Record<string, Choice>>({});
  const [everyone, setEveryone] = useState<Choice>("");
  const [excluded, setExcluded] = useState<ReadonlySet<number>>(new Set());

  const stock = data.stock;
  const stockOf = (id: string | null) => stock.find((item) => item.categoryId === id)?.free ?? 0;
  const choices = stock.map((item) => ({
    value: item.categoryId ?? NONE,
    label: `${categories.find((category) => category.id === item.categoryId)?.name ?? t.categoryOther} (${t.categoryFree(item.free)})`,
  }));
  const picker = categories.length > 0;

  const rows = useMemo(() => (sheet === null ? [] : importRows(sheet, columns)), [sheet, columns]);
  const answerList = useMemo(() => distinctAnswers(rows), [rows]);

  /** Reads the text, guesses the columns and matches each answer to a category. */
  const read = (value: string, file: boolean) => {
    const next = readSheet(value, file, m.columnLabel);
    const map = next === null ? {} : defaultColumns(next);
    const found = next === null ? [] : importRows(next, map);
    if (next === null || found.length === 0) {
      setEmpty(true);
      return;
    }
    setEmpty(false);
    setSheet(next);
    setColumns(map);
    const matched: Record<string, Choice> = {};
    for (const answer of distinctAnswers(found)) {
      matched[plain(answer)] = matchCategory(answer, categories)?.id ?? "";
    }
    setAnswers(matched);
    setEveryone(stock.find((item) => item.free > 0)?.categoryId ?? (stock[0]?.categoryId === null ? NONE : ""));
    setExcluded(new Set(found.filter((row) => alreadyHas(row, data.links)).map((row) => row.line)));
  };

  /** The category each row goes to: `undefined` when it does not go. */
  const categoryOf = (answer: string): string | null | undefined => {
    if (!picker) {
      return null;
    }
    if (columns.category === undefined) {
      return categoryOfChoice(everyone);
    }
    return categoryOfChoice(answers[plain(answer)] ?? "");
  };

  const orders: TicketOrderBody[] = [];
  for (const row of rows) {
    const categoryId = categoryOf(row.answer);
    if (!excluded.has(row.line) && categoryId !== undefined) {
      orders.push({ categoryId, quantity: row.quantity, holderName: row.name, holderPhone: row.phone, note: row.note });
    }
  }
  const total = orders.reduce((sum, order) => sum + order.quantity, 0);
  const shortages = [...demand(orders)].filter(([id, asked]) => asked > stockOf(id));
  const tooMany = total > MAX_ISSUE;

  const create = useMutation({
    mutationFn: () => {
      const body: IssueTicketsBody = { orders };
      return api<IssuedTicketsDto>(`/api/events/${eventId}/tickets/issue`, { method: "POST", body });
    },
    onSuccess: (issued) => {
      const links = issued.orders.flatMap((order) => order.links);
      toast.success(m.done(links.length));
      void queryClient.invalidateQueries({ queryKey: ["tickets", eventId] });
      onImported(links);
    },
  });

  const setColumn = (field: ImportField, value: string) => {
    const next: ColumnMap = { ...columns };
    if (value === "") {
      delete next[field];
    } else {
      const index = Number(value);
      // One field per column: taking a column frees it from the other field.
      for (const other of IMPORT_FIELDS) {
        if (next[other] === index) {
          delete next[other];
        }
      }
      next[field] = index;
    }
    setColumns(next);
    if (field === "category" && sheet !== null) {
      const matched: Record<string, Choice> = { ...answers };
      for (const answer of distinctAnswers(importRows(sheet, next))) {
        matched[plain(answer)] ??= matchCategory(answer, categories)?.id ?? "";
      }
      setAnswers(matched);
    }
  };

  const nameOf = (id: string | null | undefined) =>
    id === undefined ? null : id === null ? t.categoryOther : (categories.find((category) => category.id === id)?.name ?? null);
  const colorOf = (id: string | null | undefined) => categories.find((category) => category.id === id)?.color ?? null;

  if (sheet === null) {
    return (
      <Dialog
        open
        onClose={onClose}
        size="lg"
        title={m.title}
        description={m.description}
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              {commonTexts.cancel}
            </Button>
            <Button
              icon={<Upload />}
              disabled={text.trim() === ""}
              onClick={() => {
                read(text, false);
              }}
            >
              {m.read}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-border bg-surface-2/60 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-fg">
              <Info className="size-4 shrink-0 text-brand" aria-hidden />
              {m.howTitle}
            </p>
            <ol className="mt-2 flex list-decimal flex-col gap-1 pl-9 text-sm leading-relaxed text-fg-muted">
              {m.how.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
          <Field label={m.paste} hint={empty ? <span className="text-danger-fg">{m.empty}</span> : undefined}>
            <Textarea
              value={text}
              rows={6}
              data-autofocus
              spellCheck={false}
              placeholder={m.pastePlaceholder}
              className="font-mono text-sm"
              onChange={(changeEvent) => {
                setText(changeEvent.target.value);
                setEmpty(false);
              }}
            />
          </Field>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,.tsv,.txt,text/csv,text/plain"
            className="sr-only"
            tabIndex={-1}
            onChange={async (changeEvent) => {
              const file = changeEvent.target.files?.[0];
              changeEvent.target.value = "";
              if (file !== undefined) {
                read(await readSheetFile(file), true);
              }
            }}
          />
          <Button
            variant="secondary"
            icon={<FileUp />}
            className="w-full sm:w-fit"
            onClick={() => {
              fileInput.current?.click();
            }}
          >
            {m.file}
          </Button>
        </div>
      </Dialog>
    );
  }

  const included = rows.filter((row) => !excluded.has(row.line) && categoryOf(row.answer) !== undefined).length;
  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={m.title}
      description={m.rowsTitle(rows.length)}
      footer={
        <>
          <Button
            variant="secondary"
            icon={<ChevronLeft />}
            onClick={() => {
              setSheet(null);
              create.reset();
            }}
          >
            {m.back}
          </Button>
          <Button
            loading={create.isPending}
            disabled={orders.length === 0 || shortages.length > 0 || tooMany}
            onClick={() => {
              create.mutate();
            }}
          >
            {m.submit(total)}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-3">
          <div>
            <h3 className="text-sm font-semibold text-fg">{m.columnsTitle}</h3>
            <p className="text-xs text-fg-muted">{m.columnsHint}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {IMPORT_FIELDS.filter((field) => field !== "category" || picker).map((field) => (
              <Field key={field} label={m.fields[field]}>
                <Select
                  value={columns[field] === undefined ? "" : String(columns[field])}
                  onChange={(changeEvent) => {
                    setColumn(field, changeEvent.target.value);
                  }}
                >
                  <option value="">{m.noColumn}</option>
                  {sheet.columns.map((column, index) => (
                    <option key={`${column}-${String(index)}`} value={String(index)}>
                      {column}
                    </option>
                  ))}
                </Select>
              </Field>
            ))}
          </div>
        </section>

        {picker && (
          <section className="flex flex-col gap-3">
            {columns.category === undefined ? (
              <Field label={m.allSame}>
                <Select
                  value={everyone}
                  onChange={(changeEvent) => {
                    setEveryone(changeEvent.target.value);
                  }}
                >
                  <option value="">{m.chooseCategory}</option>
                  {choices.map((choice) => (
                    <option key={choice.value} value={choice.value}>
                      {choice.label}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <>
                <div>
                  <h3 className="text-sm font-semibold text-fg">{m.answersTitle}</h3>
                  <p className="text-xs text-fg-muted">{m.answersHint}</p>
                </div>
                <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
                  {answerList.map((answer) => {
                    const key = plain(answer);
                    const choice = answers[key] ?? "";
                    return (
                      <li key={key} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                        <span className={cn("min-w-0 text-sm font-medium break-words", answer === "" ? "text-fg-subtle italic" : "text-fg")}>
                          {answer === "" ? m.noColumn : answer}
                        </span>
                        <Select
                          aria-label={answer}
                          value={choice}
                          aria-invalid={choice === "" || undefined}
                          className="sm:w-72"
                          onChange={(changeEvent) => {
                            setAnswers({ ...answers, [key]: changeEvent.target.value });
                          }}
                        >
                          <option value="">{m.chooseCategory}</option>
                          {choices.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                          <option value={SKIP}>{m.skipAnswer}</option>
                        </Select>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </section>
        )}

        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-fg">{m.tickets(total)}</h3>
              <p className="text-xs text-fg-muted">{m.rowsHint}</p>
            </div>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setExcluded(new Set());
                }}
              >
                {m.selectAll}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setExcluded(new Set(rows.map((row) => row.line)));
                }}
              >
                {m.selectNone}
              </Button>
            </div>
          </div>
          <ul className="flex max-h-[45dvh] flex-col divide-y divide-border overflow-y-auto rounded-xl border border-border">
            {rows.map((row) => {
              const categoryId = categoryOf(row.answer);
              const goes = categoryId !== undefined;
              const checked = goes && !excluded.has(row.line);
              const color = colorOf(categoryId);
              return (
                <li key={row.line}>
                  <label className={cn("flex cursor-pointer items-start gap-3 px-3 py-2.5 transition hover:bg-surface-2 active:bg-surface-2", !checked && "opacity-60")}>
                    <input
                      type="checkbox"
                      className="mt-0.5 size-5 shrink-0 accent-brand"
                      checked={checked}
                      disabled={!goes}
                      onChange={(changeEvent) => {
                        const next = new Set(excluded);
                        if (changeEvent.target.checked) {
                          next.delete(row.line);
                        } else {
                          next.add(row.line);
                        }
                        setExcluded(next);
                      }}
                    />
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className={cn("truncate text-sm font-medium", row.name === null ? "text-fg-subtle" : "text-fg")}>{row.name ?? t.noHolder}</span>
                        {row.phone !== null && <span className="text-xs text-fg-muted tabular">{phoneLabel(row.phone)}</span>}
                        <span className="text-xs text-fg-subtle">{m.line(row.line)}</span>
                      </span>
                      <span className="flex flex-wrap items-center gap-1.5">
                        {goes && (
                          <span className="inline-flex items-center gap-1.5 text-xs text-fg-muted">
                            {color !== null && <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: color }} />}
                            {picker && nameOf(categoryId)} {picker && "·"} {m.tickets(row.quantity)}
                          </span>
                        )}
                        {!goes && <Badge tone="neutral">{m.noCategory}</Badge>}
                        {alreadyHas(row, data.links) && (
                          <Badge tone="warning">
                            <UserCheck className="size-3.5" aria-hidden />
                            {m.already}
                          </Badge>
                        )}
                        {row.phoneInvalid && <Badge tone="warning">{m.phoneInvalid}</Badge>}
                        {row.quantityInvalid && <Badge tone="warning">{m.quantityInvalid}</Badge>}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-fg-muted" aria-live="polite">
            {m.rowsTitle(included)} · {m.tickets(total)}
          </p>
        </section>

        {shortages.map(([id, asked]) => (
          <Alert key={id ?? NONE} tone="danger">
            {m.short(nameOf(id) ?? t.categoryOther, asked, stockOf(id))}
          </Alert>
        ))}
        {tooMany && <Alert tone="danger">{m.tooMany}</Alert>}
        <ErrorMessage error={create.error} />
      </div>
    </Dialog>
  );
}
