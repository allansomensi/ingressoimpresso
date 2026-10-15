"use client";

import type { BatchDto, CategoryBody, CategoryDto, EventDto, EventKind, RangeDto } from "@ingressoimpresso/api-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, IdCard, MoreHorizontal, Pencil, Plus, Sparkles, Tags, Trash2, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { ReadOnlyNotice, useEventAccess } from "@/components/event/access";
import { TablesSection } from "@/components/event/tables";
import type { SelectTab } from "@/components/event/tabs";
import { Alert, Badge, Button, Card, Dialog, ErrorMessage, Field, Input, Lead, LoadingBlock, Menu, MenuItem, Switch, buttonClass, errorMessage, useConfirm } from "@/components/ui";
import { api } from "@/lib/api";
import { CATEGORY_COLORS, nextColor, presetPriceText, uncategorized } from "@/lib/categories";
import { cn } from "@/lib/cn";
import { forKind } from "@/lib/event-kind";
import { money, parseMoney, ticketNumber } from "@/lib/format";
import { NUMBER_LIST_INPUT, formatRanges, parseNumberList } from "@/lib/number-list";
import { common as commonTexts } from "@/texts/pt-BR/common";
import { errors as errorsTexts } from "@/texts/pt-BR/errors";
import { event as eventTexts } from "@/texts/pt-BR/event";
import { portaria as portariaTexts } from "@/texts/pt-BR/portaria";

type CategoryTexts = typeof eventTexts.categories;

/** The tab's words: "Produtos" for consumption tokens (ADR 0084). */
function categoryTexts(kind: EventKind): CategoryTexts {
  return forKind(eventTexts.categories, eventTexts.tokens.categories, kind);
}

type PriceMode = "event" | "free" | "own";

function priceLabel(t: CategoryTexts, category: CategoryDto, eventPrice: number | null): string {
  if (category.priceCents === null) {
    return eventPrice === null ? t.priceEventNone : t.priceEvent(money(eventPrice));
  }
  return category.priceCents === 0 ? t.free : money(category.priceCents);
}

export function CategoriesTab({ eventId, event, onSelect }: { eventId: string; event: EventDto; onSelect: SelectTab }) {
  const { can } = useEventAccess();
  return (
    <div className="flex flex-col gap-8">
      <CategoriesSection eventId={eventId} event={event} editable={can("manage")} onSelect={onSelect} />
      {/* Tables and seats are for tickets; a stall has none (ADR 0084). */}
      {event.kind !== "tokens" && <TablesSection eventId={eventId} editable={can("delivery")} />}
    </div>
  );
}

function CategoriesSection({ eventId, event, editable, onSelect }: { eventId: string; event: EventDto; editable: boolean; onSelect: SelectTab }) {
  const t = categoryTexts(event.kind);
  const queryClient = useQueryClient();
  const categories = useQuery({ queryKey: ["categories", eventId], queryFn: () => api<CategoryDto[]>(`/api/events/${eventId}/categories`) });
  const batches = useQuery({ queryKey: ["batches", eventId], queryFn: () => api<BatchDto[]>(`/api/events/${eventId}/batches`) });
  const [dialog, setDialog] = useState<{ category: CategoryDto | null; focusPrice?: boolean } | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const refresh = () => {
    for (const key of ["categories", "report", "sellers"]) {
      void queryClient.invalidateQueries({ queryKey: [key, eventId] });
    }
  };
  if (categories.isPending) {
    return <LoadingBlock rows={2} />;
  }
  if (categories.isError) {
    return <ErrorMessage error={categories.error} />;
  }
  const list = categories.data;
  const paid = (batches.data ?? []).filter((batch) => batch.status === "paid").map(({ first, last }) => ({ first, last }));
  const missing = list.length === 0 ? 0 : uncategorized(paid, list);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex max-w-2xl flex-col gap-1">
          <h2 className="text-lg font-semibold tracking-tight text-fg">{t.title}</h2>
          <Lead>{t.intro}</Lead>
        </div>
        {editable && list.length > 0 && (
          <Button
            icon={<Plus />}
            onClick={() => {
              setDialog({ category: null });
            }}
            className="w-full sm:w-fit"
          >
            {t.add}
          </Button>
        )}
      </div>
      {!editable && <ReadOnlyNotice eventId={eventId} area="manage" />}

      {list.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-brand-soft-fg">
            <Tags className="size-6" aria-hidden />
          </span>
          <p className="text-base font-semibold text-fg">{t.emptyTitle}</p>
          <p className="max-w-md text-sm leading-relaxed text-fg-muted">{t.emptyBody}</p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {t.presets.map((preset) => (
              <span key={preset.name} className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-fg-muted">
                <span className="size-2.5 rounded-full" style={{ backgroundColor: preset.color }} aria-hidden />
                {preset.name}
              </span>
            ))}
          </div>
          {editable && (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Button icon={<Sparkles />} onClick={() => { setSuggesting(true); }}>
                {t.suggest}
              </Button>
              <Button variant="secondary" icon={<Plus />} onClick={() => { setDialog({ category: null }); }}>
                {t.add}
              </Button>
            </div>
          )}
        </Card>
      ) : (
        <>
          <p className="text-sm text-fg-muted">{t.hint}</p>
          <div className="grid items-start gap-4 lg:grid-cols-2">
            {list.map((category) => (
              <CategoryCard
                key={category.id}
                t={t}
                category={category}
                eventPrice={event.ticketPriceCents}
                editable={editable}
                onEdit={(focusPrice) => {
                  setDialog({ category, focusPrice });
                }}
                onChange={refresh}
              />
            ))}
          </div>
          {missing > 0 && <Alert tone="warning">{t.uncategorized(missing)}</Alert>}
          <Alert
            tone="brand"
            action={
              <Button size="sm" variant="secondary" onClick={() => { onSelect("design"); }}>
                {t.bandTipAction}
              </Button>
            }
          >
            {t.bandTip}
          </Alert>
        </>
      )}

      {dialog !== null && (
        <CategoryDialog
          key={dialog.category?.id ?? "new"}
          t={t}
          tokens={event.kind === "tokens"}
          eventId={eventId}
          eventPrice={event.ticketPriceCents}
          category={dialog.category}
          focusPrice={dialog.focusPrice ?? false}
          used={list}
          onClose={() => {
            setDialog(null);
          }}
          onSaved={refresh}
        />
      )}
      {suggesting && (
        <SuggestDialog
          t={t}
          eventId={eventId}
          eventPrice={event.ticketPriceCents}
          onClose={() => {
            setSuggesting(false);
          }}
          onSaved={refresh}
        />
      )}
    </section>
  );
}

function CategoryCard({
  t,
  category,
  eventPrice,
  editable,
  onEdit,
  onChange,
}: {
  t: CategoryTexts;
  category: CategoryDto;
  eventPrice: number | null;
  editable: boolean;
  onEdit: (focusPrice: boolean) => void;
  onChange: () => void;
}) {
  const confirm = useConfirm();
  const [text, setText] = useState("");
  const parsed = parseNumberList(text);
  const count = category.ranges.reduce((sum, range) => sum + range.last - range.first + 1, 0);
  const add = useMutation({
    mutationFn: async () => {
      if (!parsed.ok) {
        return 0;
      }
      for (const range of parsed.ranges) {
        await api<RangeDto>(`/api/categories/${category.id}/ranges`, { method: "POST", body: range });
      }
      return parsed.count;
    },
    onSuccess: (added) => {
      toast.success(t.added(added));
      setText("");
      onChange();
    },
    onError: () => {
      onChange();
    },
  });
  const remove = useMutation({
    mutationFn: (path: string) => api(path, { method: "DELETE" }),
    onSuccess: onChange,
    onError: (error) => toast.error(errorMessage(error)),
  });
  const submit = (formEvent: FormEvent) => {
    formEvent.preventDefault();
    if (parsed.ok) {
      add.mutate();
    }
  };

  return (
    <Card className="flex flex-col gap-4 overflow-hidden !p-0">
      <div className="h-2.5 w-full" style={{ backgroundColor: category.color }} aria-hidden />
      <div className="flex flex-col gap-4 px-5 pb-5 sm:px-6 sm:pb-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col">
            <span className="flex items-center gap-2 truncate text-base font-semibold text-fg">
              <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: category.color }} aria-hidden />
              {category.name}
            </span>
            <span className="text-sm text-fg-muted">{t.count(count)}</span>
            {category.checkDocument && (
              <span className="mt-1.5 flex flex-col gap-1">
                <Badge tone="warning" className="w-fit">
                  <IdCard className="size-3.5" aria-hidden />
                  {t.documentBadge}
                </Badge>
                <span className="text-xs leading-relaxed text-fg-muted">{t.documentBadgeHint(category.documentNote ?? portariaTexts.result.documentAny)}</span>
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {/* The price is what people come to change (VIP, meia): one tap away. */}
            {editable ? (
              <button
                type="button"
                aria-label={t.changePrice(category.name)}
                onClick={() => {
                  onEdit(true);
                }}
                className="group relative flex flex-col items-end rounded-xl px-2.5 py-1 text-right transition touch-target hover:bg-surface-2 active:bg-surface-2"
              >
                <span className="text-[11px] font-medium tracking-wide text-fg-subtle uppercase">{t.priceOf}</span>
                <span className="flex items-center gap-1.5 text-sm font-semibold text-fg tabular">
                  {priceLabel(t, category, eventPrice)}
                  <Pencil className="size-3.5 text-fg-subtle transition group-hover:text-fg" aria-hidden />
                </span>
              </button>
            ) : (
              <span className="flex flex-col items-end px-2.5 py-1 text-right">
                <span className="text-[11px] font-medium tracking-wide text-fg-subtle uppercase">{t.priceOf}</span>
                <span className="text-sm font-semibold text-fg tabular">{priceLabel(t, category, eventPrice)}</span>
              </span>
            )}
            {editable && (
            <Menu label={t.menu(category.name)} trigger={<MoreHorizontal />} triggerClassName={buttonClass({ variant: "ghost", size: "icon-sm" })}>
              <MenuItem
                icon={<Pencil />}
                onSelect={() => {
                  onEdit(false);
                }}
              >
                {t.edit}
              </MenuItem>
              <MenuItem
                icon={<Trash2 />}
                tone="danger"
                onSelect={() => {
                  void confirm({ title: t.removeTitle(category.name), description: t.removeBody, confirmLabel: t.remove }).then((ok) => {
                    if (ok) {
                      remove.mutate(`/api/categories/${category.id}`, { onSuccess: () => toast.success(t.removed) });
                    }
                  });
                }}
              >
                {t.remove}
              </MenuItem>
            </Menu>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {category.ranges.length === 0 && <span className="text-sm text-fg-subtle">{t.noNumbers}</span>}
          {category.ranges.map((range) => {
            const label = formatRanges([range]);
            return (
              <span key={range.id} className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-2 py-1 pr-1 pl-2.5 font-mono text-sm text-fg tabular">
                {range.first === range.last ? ticketNumber(range.first) : `${ticketNumber(range.first)}–${ticketNumber(range.last)}`}
                {editable && (
                  <button
                    type="button"
                    aria-label={t.removeRange(label)}
                    className="relative flex size-5 items-center justify-center rounded-md text-fg-subtle transition touch-target hover:bg-danger-soft hover:text-danger-fg active:bg-danger-soft active:text-danger-fg"
                    onClick={() => {
                      remove.mutate(`/api/category-ranges/${range.id}`, { onSuccess: () => toast.success(t.rangeRemoved) });
                    }}
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </span>
            );
          })}
        </div>
        {editable && (
          <form onSubmit={submit} className="flex flex-col gap-2">
            <div className="flex gap-2">
              <Input
                aria-label={t.numbers}
                value={text}
                placeholder={t.numbersPlaceholder}
                // Ranges need "-" and ",": the iPhone number pad has neither (NUMBER_LIST_INPUT).
                {...NUMBER_LIST_INPUT}
                onChange={(changeEvent) => {
                  setText(changeEvent.target.value);
                }}
              />
              <Button type="submit" variant="secondary" icon={<Plus />} loading={add.isPending} disabled={!parsed.ok}>
                <span className="max-sm:sr-only">{t.addNumbers}</span>
              </Button>
            </div>
            {text.trim() !== "" && !parsed.ok && <p className="text-xs text-danger-fg">{errorsTexts.invalid_range}</p>}
            {parsed.ok && <p className="text-xs text-fg-muted">{commonTexts.tickets(parsed.count)}</p>}
            <ErrorMessage error={add.error} />
          </form>
        )}
      </div>
    </Card>
  );
}

function CategoryDialog({
  t,
  tokens,
  eventId,
  eventPrice,
  category,
  focusPrice,
  used,
  onClose,
  onSaved,
}: {
  t: CategoryTexts;
  /** A product of consumption tokens: no document at a stall (ADR 0084). */
  tokens: boolean;
  eventId: string;
  eventPrice: number | null;
  category: CategoryDto | null;
  focusPrice: boolean;
  used: readonly CategoryDto[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(category?.name ?? "");
  const [color, setColor] = useState(category?.color ?? nextColor(used));
  const initialMode: PriceMode = category?.priceCents === null || category === null ? "event" : category.priceCents === 0 ? "free" : "own";
  const [mode, setMode] = useState<PriceMode>(initialMode);
  const [priceText, setPriceText] = useState(category?.priceCents ? (category.priceCents / 100).toFixed(2).replace(".", ",") : "");
  const [checkDocument, setCheckDocument] = useState(category?.checkDocument ?? false);
  const [documentNote, setDocumentNote] = useState(category?.documentNote ?? "");
  const price = parseMoney(priceText);
  const priceCents = mode === "event" ? null : mode === "free" ? 0 : price.ok ? price.cents : null;
  const valid = name.trim() !== "" && (mode !== "own" || (price.ok && price.cents !== null));
  const save = useMutation({
    mutationFn: () => {
      const note = documentNote.trim();
      const body: CategoryBody = {
        name: name.trim(),
        color,
        priceCents,
        checkDocument,
        documentNote: checkDocument && note !== "" ? note : null,
      };
      return category === null
        ? api<CategoryDto>(`/api/events/${eventId}/categories`, { method: "POST", body })
        : api(`/api/categories/${category.id}`, { method: "PUT", body });
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
  const modes: { value: PriceMode; label: string }[] = [
    { value: "event", label: eventPrice === null ? t.priceEventNone : t.priceEvent(money(eventPrice)) },
    { value: "own", label: t.priceOwn },
    { value: "free", label: t.priceFree },
  ];

  return (
    <Dialog
      open
      onClose={onClose}
      title={category === null ? t.dialogTitle : t.dialogEditTitle}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {commonTexts.cancel}
          </Button>
          <Button type="submit" form="category" loading={save.isPending} disabled={!valid}>
            {category === null ? t.create : t.save}
          </Button>
        </>
      }
    >
      <form id="category" onSubmit={submit} className="flex flex-col gap-5">
        <Field label={t.name}>
          <Input
            value={name}
            maxLength={30}
            required
            autoFocus={!focusPrice}
            placeholder={t.namePlaceholder}
            onChange={(changeEvent) => {
              setName(changeEvent.target.value);
            }}
          />
        </Field>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium text-fg">{t.color}</legend>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_COLORS.map((swatch) => (
              <label
                key={swatch}
                className={cn(
                  "flex size-10 cursor-pointer items-center justify-center rounded-full ring-offset-2 ring-offset-surface transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand",
                  color === swatch && "ring-2 ring-fg",
                )}
                style={{ backgroundColor: swatch }}
              >
                <input
                  type="radio"
                  name="color"
                  className="sr-only"
                  checked={color === swatch}
                  aria-label={swatch}
                  onChange={() => {
                    setColor(swatch);
                  }}
                />
                {color === swatch && <Check className="size-4 text-white" aria-hidden />}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-fg">{t.price}</legend>
          <p className="mb-1 text-xs leading-relaxed text-fg-muted">{t.priceHint}</p>
          <div className="grid gap-2">
            {modes.map((option, index) => (
              <label
                key={option.value}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand",
                  mode === option.value ? "border-brand bg-brand-soft/60 font-medium text-fg" : "border-border text-fg-muted hover:border-border-strong",
                )}
              >
                <input
                  type="radio"
                  name="price-mode"
                  // Opened from the price: the price choice takes the focus.
                  autoFocus={focusPrice && (option.value === mode || (index === 0 && !modes.some((item) => item.value === mode)))}
                  className="size-4 accent-brand"
                  checked={mode === option.value}
                  onChange={() => {
                    setMode(option.value);
                  }}
                />
                {option.label}
              </label>
            ))}
          </div>
          {mode === "own" && (
            <Input
              aria-label={t.priceOwn}
              value={priceText}
              inputMode="decimal"
              placeholder="15,00"
              autoFocus
              onChange={(changeEvent) => {
                setPriceText(changeEvent.target.value);
              }}
            />
          )}
        </fieldset>
        {!tokens && (
        <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
          <Switch checked={checkDocument} onChange={setCheckDocument} label={t.document} description={t.documentHint} />
          {checkDocument && (
            <Field label={t.documentNote} hint={t.documentNoteHint} optional>
              <Input
                value={documentNote}
                maxLength={80}
                placeholder={t.documentNotePlaceholder}
                onChange={(changeEvent) => {
                  setDocumentNote(changeEvent.target.value);
                }}
              />
            </Field>
          )}
        </div>
        )}
        <ErrorMessage error={save.error} />
      </form>
    </Dialog>
  );
}

type SuggestRow = { name: string; color: string; use: boolean; priceText: string; document: string | null };

/**
 * The usual categories in one go, each with its price checked before it is created: VIP is
 * rarely the event's price, and meia starts at half of it.
 */
function SuggestDialog({
  t,
  eventId,
  eventPrice,
  onClose,
  onSaved,
}: {
  t: CategoryTexts;
  eventId: string;
  eventPrice: number | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rows, setRows] = useState<SuggestRow[]>(() =>
    t.presets.map((preset) => ({
      name: preset.name,
      color: preset.color,
      use: true,
      priceText: presetPriceText(preset.price, eventPrice),
      document: preset.document,
    })),
  );
  const chosen = rows.filter((row) => row.use);
  const parsed = chosen.map((row) => ({ row, price: parseMoney(row.priceText) }));
  const valid = chosen.length > 0 && parsed.every(({ price }) => price.ok);
  const create = useMutation({
    mutationFn: async () => {
      for (const { row, price } of parsed) {
        const body: CategoryBody = {
          name: row.name,
          color: row.color,
          priceCents: price.ok ? price.cents : null,
          checkDocument: row.document !== null,
          documentNote: row.document,
        };
        await api<CategoryDto>(`/api/events/${eventId}/categories`, { method: "POST", body });
      }
    },
    onSuccess: () => {
      toast.success(t.suggested);
      onSaved();
      onClose();
    },
    // Some may have been created before the error: show what is there.
    onError: onSaved,
  });
  const update = (index: number, change: Partial<SuggestRow>) => {
    setRows((current) => current.map((row, position) => (position === index ? { ...row, ...change } : row)));
  };
  const placeholder = eventPrice === null ? t.priceEventNone : money(eventPrice);

  return (
    <Dialog
      open
      onClose={onClose}
      title={t.suggestTitle}
      description={t.suggestBody}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {commonTexts.cancel}
          </Button>
          <Button type="submit" form="suggest-categories" loading={create.isPending} disabled={!valid}>
            {t.suggestCreate(chosen.length)}
          </Button>
        </>
      }
    >
      <form
        id="suggest-categories"
        className="flex flex-col gap-4"
        onSubmit={(formEvent) => {
          formEvent.preventDefault();
          if (valid) {
            create.mutate();
          }
        }}
      >
        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
          {rows.map((row, index) => {
            const price = parseMoney(row.priceText);
            return (
              <li key={row.name} className={cn("flex items-center gap-3 px-3 py-2.5", !row.use && "opacity-60")}>
                <input
                  type="checkbox"
                  className="size-5 shrink-0 accent-brand"
                  checked={row.use}
                  aria-label={t.suggestUse(row.name)}
                  onChange={(changeEvent) => {
                    update(index, { use: changeEvent.target.checked });
                  }}
                />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center gap-2 text-sm font-medium text-fg">
                    <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: row.color }} aria-hidden />
                    <span className="truncate">{row.name}</span>
                  </span>
                  {row.document !== null && (
                    <span className="flex items-center gap-1 pl-5 text-xs text-fg-muted">
                      <IdCard className="size-3.5 shrink-0" aria-hidden />
                      <span className="truncate">{t.suggestDocument(row.name)}</span>
                    </span>
                  )}
                </span>
                <div className="flex w-36 shrink-0 flex-col items-end gap-0.5">
                  <Input
                    aria-label={t.suggestPrice(row.name)}
                    value={row.priceText}
                    inputMode="decimal"
                    placeholder={placeholder}
                    disabled={!row.use}
                    aria-invalid={!price.ok}
                    className="text-right tabular"
                    onChange={(changeEvent) => {
                      update(index, { priceText: changeEvent.target.value });
                    }}
                  />
                  {price.ok && price.cents === 0 && <span className="text-xs text-success-fg">{t.freeShort}</span>}
                </div>
              </li>
            );
          })}
        </ul>
        <p className="text-xs leading-relaxed text-fg-muted">{t.priceHint}</p>
        <ErrorMessage error={create.error} />
      </form>
    </Dialog>
  );
}
