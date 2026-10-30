"use client";

import type { DayRule, EventDto, EventSetupDto } from "@ingressoimpresso/api-types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Check, ChevronDown, Gift, IdCard, Minus, Plus, Sparkles, Ticket, Trash2, X } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button, Dialog, ErrorMessage, Field, Input, Switch, segmentTabIndex, segmentedKeys, useConfirm } from "@/components/ui";
import { api } from "@/lib/api";
import { CATEGORY_COLORS } from "@/lib/categories";
import { cn } from "@/lib/cn";
import {
  MAX_ALLOWANCE,
  MAX_EXTRAS,
  MAX_INSTRUCTION,
  MAX_NAME,
  MAX_NOTE,
  MAX_TYPES,
  blankExtra,
  blankType,
  dayName,
  numberPlan,
  quantityOf,
  recipeTypes,
  recipesFor,
  setupBody,
  setupIssues,
  typesReady,
  type Recipe,
  type SetupDraft,
  type SetupExtra,
  type SetupType,
} from "@/lib/event-setup";
import { forKind } from "@/lib/event-kind";
import { money, parseMoney } from "@/lib/format";
import { useUnsavedChanges } from "@/lib/unsaved";
import { common as commonTexts } from "@/texts/pt-BR/common";
import { eventDays as dayTexts } from "@/texts/pt-BR/event-days";
import { eventSetup } from "@/texts/pt-BR/event-setup";

type Step = "start" | "types" | "extras" | "review";
type Texts = typeof eventSetup;

const DAY_RULES: readonly DayRule[] = ["every", "days", "any_one"];

function move<T>(items: readonly T[], index: number, delta: number): T[] {
  const target = index + delta;
  const item = items[index];
  if (item === undefined || target < 0 || target >= items.length) {
    return [...items];
  }
  const next = items.filter((_, position) => position !== index);
  next.splice(target, 0, item);
  return next;
}

/** A big choice: a card with a title and a line, picked like a radio. */
function ChoiceCard({ selected, onSelect, icon, title, body }: { selected: boolean; onSelect: () => void; icon: ReactNode; title: string; body: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex min-h-20 items-start gap-3 rounded-2xl border p-4 text-left transition [&_svg]:size-5",
        selected ? "border-brand bg-brand-soft ring-2 ring-brand/25" : "border-border-strong bg-surface hover:bg-surface-2 active:bg-surface-2",
      )}
    >
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", selected ? "bg-brand-solid text-white" : "bg-surface-2 text-fg-muted")}>
        {selected ? <Check /> : icon}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className={cn("text-[15px] font-semibold", selected ? "text-brand-soft-fg" : "text-fg")}>{title}</span>
        <span className="text-sm leading-snug text-fg-muted">{body}</span>
      </span>
    </button>
  );
}

/** A chip that toggles (days, who has the right, a suggestion). */
function Chip({ on, onClick, children, color, label }: { on: boolean; onClick: () => void; children: ReactNode; color?: string; label?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "relative inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition touch-target",
        on ? "border-brand bg-brand-soft text-brand-soft-fg" : "border-border-strong text-fg-muted hover:bg-surface-2 hover:text-fg active:bg-surface-2",
      )}
    >
      {color !== undefined && <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: color }} />}
      {children}
    </button>
  );
}

function Issue({ children }: { children: ReactNode }) {
  return <p className="text-xs text-danger-fg">{children}</p>;
}

/**
 * The setup assistant (ADR 0126): how the event sells, the types with their quantity and price
 * (days, document, wristband), the extras handed over apart and a summary, then everything at
 * once. For an event without categories yet; afterwards the usual screens edit each part.
 */
export function SetupWizard({ event, onClose }: { event: EventDto; onClose: () => void }) {
  const t: Texts = forKind(eventSetup, eventSetup.tokens, event.kind);
  const tokens = event.kind === "tokens";
  const severalDays = event.days.length > 1 && !tokens;
  const steps: Step[] = tokens ? ["start", "types", "review"] : ["start", "types", "extras", "review"];
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [step, setStep] = useState<Step>("start");
  const [draft, setDraft] = useState<SetupDraft>({ recipe: null, types: [], extras: [] });
  const [hasExtras, setHasExtras] = useState<boolean | null>(null);
  const [checked, setChecked] = useState<Set<Step>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const body = useRef<HTMLDivElement>(null);
  const draftWithExtras: SetupDraft = { ...draft, extras: hasExtras === true ? draft.extras : [] };
  const issues = setupIssues(draftWithExtras, severalDays);
  const touched = draft.recipe !== null;
  useUnsavedChanges(touched);

  const eventPrice = event.ticketPriceCents === null ? null : money(event.ticketPriceCents);
  const plan = numberPlan(draft.types);
  const total = draft.types.reduce((sum, item) => sum + Math.max(quantityOf(item.quantityText) ?? 0, 0), 0);

  const create = useMutation({
    mutationFn: () => api<EventSetupDto>(`/api/events/${event.id}/setup`, { method: "POST", body: setupBody(draftWithExtras, severalDays) }),
    onSuccess: (created) => {
      queryClient.setQueryData(["categories", event.id], created.categories);
      for (const key of ["checkpoints", "checklist", "report", "sellers", "event-tickets"]) {
        void queryClient.invalidateQueries({ queryKey: [key, event.id] });
      }
      toast.success(t.created);
      onClose();
    },
  });

  const close = () => {
    if (!touched || create.isPending) {
      onClose();
      return;
    }
    void confirm({ title: t.discardTitle, description: t.discardBody, confirmLabel: t.discard }).then((ok) => {
      if (ok) {
        onClose();
      }
    });
  };

  const index = steps.indexOf(step);
  const goTo = (next: Step) => {
    setStep(next);
    // The new question takes the focus and the top of the sheet.
    requestAnimationFrame(() => {
      body.current?.scrollIntoView({ block: "start" });
      body.current?.querySelector<HTMLElement>("h3")?.focus({ preventScroll: true });
    });
  };
  const stepReady = (which: Step): boolean => {
    switch (which) {
      case "start":
        return draft.recipe !== null;
      case "types":
        return draft.types.length > 0 && typesReady(issues);
      case "extras":
        return hasExtras === false || (hasExtras === true && draft.extras.length > 0 && issues.extras.size === 0);
      case "review":
        return true;
    }
  };
  const forward = () => {
    if (!stepReady(step)) {
      setChecked(new Set([...checked, step]));
      // Opens the options of a type whose hidden fields are wrong.
      setExpanded(new Set([...expanded, ...[...issues.types].filter(([, found]) => found.some((issue) => issue === "note" || issue === "instruction")).map(([key]) => key)]));
      if (step !== "start") {
        toast.error(t.issues.fix);
      }
      return;
    }
    const next = steps[index + 1];
    if (next === undefined) {
      create.mutate();
    } else {
      goTo(next);
    }
  };
  const show = checked.has(step);

  const setType = (key: string, patch: Partial<SetupType>) => {
    setDraft((current) => ({ ...current, types: current.types.map((item) => (item.key === key ? { ...item, ...patch } : item)) }));
  };
  const setExtra = (key: string, patch: Partial<SetupExtra>) => {
    setDraft((current) => ({ ...current, extras: current.extras.map((item) => (item.key === key ? { ...item, ...patch } : item)) }));
  };
  const chooseRecipe = (recipe: Recipe) => {
    if (recipe === draft.recipe) {
      return;
    }
    const types = recipeTypes(recipe, t.words, event.ticketPriceCents, event.days);
    setDraft({ recipe, types, extras: [] });
    setHasExtras(null);
    setChecked(new Set());
    setExpanded(new Set(types.filter((item) => item.document || item.instruction !== "").map((item) => item.key)));
  };

  const recipeIcon = (recipe: Recipe) => (recipe === "custom" ? <Sparkles /> : recipe === "half" ? <IdCard /> : <Ticket />);

  const startStep = (
    <div role="radiogroup" aria-label={t.startQuestion} className="grid gap-3 sm:grid-cols-2">
      {recipesFor(event.kind, event.days.length).map((recipe) => (
        <ChoiceCard
          key={recipe}
          selected={draft.recipe === recipe}
          onSelect={() => {
            chooseRecipe(recipe);
          }}
          icon={recipeIcon(recipe)}
          title={t.recipes[recipe].title}
          body={t.recipes[recipe].body}
        />
      ))}
    </div>
  );

  const typesStep = (
    <div className="flex flex-col gap-3">
      {draft.types.map((item, position) => {
        const found = show ? (issues.types.get(item.key) ?? []) : [];
        const range = plan[position];
        const label = item.name.trim() === "" ? t.typeLabel(position) : item.name;
        const open = expanded.has(item.key);
        const price = parseMoney(item.priceText);
        return (
          <section key={item.key} aria-label={label} className={cn("relative overflow-hidden rounded-2xl border bg-surface pl-1.5", found.length > 0 ? "border-danger" : "border-border")}>
            <span aria-hidden className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: item.color }} />
            <div className="flex flex-col gap-3 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-semibold text-fg">{t.typeLabel(position)}</span>
                  {range !== undefined && range.last >= range.first && <span className="text-xs text-fg-muted tabular">{t.numbers(range.first, range.last)}</span>}
                </span>
                <span className="flex items-center gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t.moveUp(label)}
                    disabled={position === 0}
                    onClick={() => {
                      setDraft((current) => ({ ...current, types: move(current.types, position, -1) }));
                    }}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t.moveDown(label)}
                    disabled={position === draft.types.length - 1}
                    onClick={() => {
                      setDraft((current) => ({ ...current, types: move(current.types, position, 1) }));
                    }}
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t.removeType(label)}
                    disabled={draft.types.length === 1}
                    onClick={() => {
                      setDraft((current) => ({
                        ...current,
                        types: current.types.filter((other) => other.key !== item.key),
                        extras: current.extras.map((extra) => ({ ...extra, types: extra.types.filter((key) => key !== item.key) })),
                      }));
                    }}
                  >
                    <Trash2 />
                  </Button>
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,1fr)_8.5rem_6.5rem]">
                <Field
                  label={t.name}
                  className="col-span-2 sm:col-span-1"
                  hint={found.includes("name") ? <Issue>{t.issues.name}</Issue> : found.includes("duplicate") ? <Issue>{t.issues.duplicate}</Issue> : undefined}
                >
                  <Input
                    value={item.name}
                    maxLength={MAX_NAME}
                    placeholder={t.namePlaceholder}
                    aria-invalid={found.includes("name") || found.includes("duplicate") || undefined}
                    onChange={(changeEvent) => {
                      setType(item.key, { name: changeEvent.target.value });
                    }}
                  />
                </Field>
                <Field
                  label={t.price}
                  hint={found.includes("price") ? <Issue>{t.issues.price}</Issue> : price.ok && price.cents === 0 ? <span className="text-success-fg">{t.free}</span> : undefined}
                >
                  <Input
                    value={item.priceText}
                    inputMode="decimal"
                    placeholder={t.pricePlaceholder(eventPrice)}
                    aria-invalid={found.includes("price") || undefined}
                    className="tabular"
                    onChange={(changeEvent) => {
                      setType(item.key, { priceText: changeEvent.target.value });
                    }}
                  />
                </Field>
                <Field label={t.quantity} hint={found.includes("quantity") ? <Issue>{t.issues.quantity}</Issue> : undefined}>
                  <Input
                    value={item.quantityText}
                    inputMode="numeric"
                    aria-invalid={found.includes("quantity") || undefined}
                    className="tabular"
                    onChange={(changeEvent) => {
                      setType(item.key, { quantityText: changeEvent.target.value.replace(/[^\d.]/g, "") });
                    }}
                  />
                </Field>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-fg-muted">{t.color}</span>
                <div role="radiogroup" aria-label={`${t.color} · ${label}`} className="flex flex-wrap gap-2">
                  {CATEGORY_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      role="radio"
                      aria-checked={item.color === color}
                      aria-label={t.colorOption(color)}
                      onClick={() => {
                        setType(item.key, { color });
                      }}
                      className={cn(
                        "relative size-8 rounded-full ring-offset-2 ring-offset-surface transition touch-target active:scale-95",
                        item.color === color ? "ring-2 ring-fg" : "ring-1 ring-black/10",
                      )}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
              {severalDays && (
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-fg-muted">{t.days}</span>
                  <div role="radiogroup" aria-label={`${t.days} · ${label}`} onKeyDown={segmentedKeys(DAY_RULES, item.dayRule, (dayRule) => { setType(item.key, { dayRule }); })} className="flex gap-1 rounded-xl bg-surface-2 p-1">
                    {DAY_RULES.map((rule) => (
                      <button
                        key={rule}
                        type="button"
                        role="radio"
                        aria-checked={item.dayRule === rule}
                        tabIndex={segmentTabIndex(DAY_RULES, item.dayRule, rule)}
                        onClick={() => {
                          setType(item.key, { dayRule: rule });
                        }}
                        className={cn(
                          "min-h-9 flex-1 rounded-lg px-2 text-xs font-medium transition pointer-coarse:min-h-11 sm:text-sm",
                          item.dayRule === rule ? "bg-surface text-fg shadow-sm ring-1 ring-border" : "text-fg-muted hover:text-fg active:text-fg",
                        )}
                      >
                        {dayTexts.rules[rule]}
                      </button>
                    ))}
                  </div>
                  {item.dayRule === "days" && (
                    <div className="flex flex-wrap gap-2">
                      {event.days.map((day) => (
                        <Chip
                          key={day.position}
                          on={item.validDays.includes(day.position)}
                          onClick={() => {
                            setType(item.key, {
                              validDays: item.validDays.includes(day.position) ? item.validDays.filter((value) => value !== day.position) : [...item.validDays, day.position],
                            });
                          }}
                        >
                          {dayName(event.days, day.position)}
                        </Chip>
                      ))}
                    </div>
                  )}
                  {found.includes("days") && <Issue>{t.issues.days}</Issue>}
                </div>
              )}
              {!tokens && (
                <div className="border-t border-border pt-2">
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => {
                      const next = new Set(expanded);
                      if (open) {
                        next.delete(item.key);
                      } else {
                        next.add(item.key);
                      }
                      setExpanded(next);
                    }}
                    className="relative flex w-full items-center justify-between gap-2 py-1.5 text-sm font-medium text-fg-muted touch-target hover:text-fg active:text-fg"
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      {t.more}
                      {item.document && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs">
                          <IdCard className="size-3" aria-hidden />
                          {t.documentShort}
                        </span>
                      )}
                      {item.instruction.trim() !== "" && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs">{item.instruction.trim()}</span>}
                    </span>
                    <ChevronDown className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")} aria-hidden />
                  </button>
                  {open && (
                    <div className="flex flex-col gap-4 pt-3">
                      <Switch
                        checked={item.document}
                        onChange={(document) => {
                          setType(item.key, { document });
                        }}
                        label={t.document}
                        description={t.documentHint}
                      />
                      {item.document && (
                        <Field label={t.documentNote} hint={found.includes("note") ? <Issue>{t.issues.note}</Issue> : undefined}>
                          <Input
                            value={item.documentNote}
                            maxLength={MAX_NOTE}
                            onChange={(changeEvent) => {
                              setType(item.key, { documentNote: changeEvent.target.value });
                            }}
                          />
                        </Field>
                      )}
                      <div className="flex flex-col gap-2">
                        <Field label={t.instruction} hint={found.includes("instruction") ? <Issue>{t.issues.instruction}</Issue> : t.instructionHint}>
                          <Input
                            value={item.instruction}
                            maxLength={MAX_INSTRUCTION}
                            placeholder={t.instructionPlaceholder}
                            onChange={(changeEvent) => {
                              setType(item.key, { instruction: changeEvent.target.value });
                            }}
                          />
                        </Field>
                        <div className="flex flex-wrap gap-1.5">
                          {t.wristbands.map((color) => {
                            const text = t.wristband(color);
                            return (
                              <Chip
                                key={color}
                                on={item.instruction === text}
                                onClick={() => {
                                  setType(item.key, { instruction: item.instruction === text ? "" : text });
                                }}
                              >
                                {color}
                              </Chip>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        );
      })}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {draft.types.length < MAX_TYPES && (
          <Button
            variant="secondary"
            icon={<Plus />}
            onClick={() => {
              setDraft((current) => ({ ...current, types: [...current.types, blankType(current.types)] }));
            }}
          >
            {t.addType}
          </Button>
        )}
        <span className={cn("text-sm font-medium tabular", show && issues.total ? "text-danger-fg" : "text-fg-muted")}>{show && issues.total ? t.issues.total : t.total(total)}</span>
      </div>
    </div>
  );

  const extrasStep = (
    <div className="flex flex-col gap-4">
      <div role="radiogroup" aria-label={t.extrasQuestion} className="grid gap-3 sm:grid-cols-2">
        <ChoiceCard
          selected={hasExtras === false}
          onSelect={() => {
            setHasExtras(false);
          }}
          icon={<X />}
          title={t.extrasNo}
          body={t.extrasNoBody}
        />
        <ChoiceCard
          selected={hasExtras === true}
          onSelect={() => {
            setHasExtras(true);
            if (draft.extras.length === 0) {
              setDraft((current) => ({ ...current, extras: [blankExtra(t.suggestions[0] ?? "", current.types)] }));
            }
          }}
          icon={<Gift />}
          title={t.extrasYes}
          body={t.extrasYesBody}
        />
      </div>
      {hasExtras === true &&
        draft.extras.map((extra, position) => {
          const found = show ? (issues.extras.get(extra.key) ?? []) : [];
          const label = extra.name.trim() === "" ? t.extraLabel(position) : extra.name;
          return (
            <section key={extra.key} aria-label={label} className={cn("flex flex-col gap-4 rounded-2xl border bg-surface p-4", found.length > 0 ? "border-danger" : "border-border")}>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-semibold text-fg">
                  <Gift className="size-4 text-fg-subtle" aria-hidden />
                  {t.extraLabel(position)}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t.removeExtra(label)}
                  onClick={() => {
                    setDraft((current) => ({ ...current, extras: current.extras.filter((other) => other.key !== extra.key) }));
                    if (draft.extras.length === 1) {
                      setHasExtras(false);
                    }
                  }}
                >
                  <Trash2 />
                </Button>
              </div>
              <div className="flex flex-col gap-2">
                <Field label={t.extraName} hint={found.includes("name") ? <Issue>{t.issues.name}</Issue> : found.includes("duplicate") ? <Issue>{t.issues.duplicate}</Issue> : undefined}>
                  <Input
                    value={extra.name}
                    maxLength={MAX_NAME}
                    placeholder={t.extraNamePlaceholder}
                    aria-invalid={found.includes("name") || found.includes("duplicate") || undefined}
                    onChange={(changeEvent) => {
                      setExtra(extra.key, { name: changeEvent.target.value });
                    }}
                  />
                </Field>
                <div className="flex flex-wrap gap-1.5">
                  {t.suggestions.map((name) => (
                    <Chip
                      key={name}
                      on={extra.name === name}
                      onClick={() => {
                        setExtra(extra.key, { name });
                      }}
                    >
                      {name}
                    </Chip>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium text-fg">{t.extraWho}</span>
                <div className="flex flex-wrap gap-2">
                  {draft.types.map((item, typeIndex) => (
                    <Chip
                      key={item.key}
                      color={item.color}
                      on={extra.types.includes(item.key)}
                      onClick={() => {
                        setExtra(extra.key, { types: extra.types.includes(item.key) ? extra.types.filter((key) => key !== item.key) : [...extra.types, item.key] });
                      }}
                    >
                      {item.name.trim() === "" ? t.typeLabel(typeIndex) : item.name}
                    </Chip>
                  ))}
                </div>
                {found.includes("who") && <Issue>{t.issues.who}</Issue>}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-fg">{t.extraAllowance}</span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="icon"
                      aria-label={`${t.less} · ${t.extraAllowance}`}
                      disabled={extra.allowance <= 1}
                      onClick={() => {
                        setExtra(extra.key, { allowance: extra.allowance - 1 });
                      }}
                    >
                      <Minus />
                    </Button>
                    <span className="w-10 text-center text-lg font-semibold text-fg tabular" aria-live="polite">
                      {extra.allowance}
                    </span>
                    <Button
                      variant="secondary"
                      size="icon"
                      aria-label={`${t.plus} · ${t.extraAllowance}`}
                      disabled={extra.allowance >= MAX_ALLOWANCE}
                      onClick={() => {
                        setExtra(extra.key, { allowance: extra.allowance + 1 });
                      }}
                    >
                      <Plus />
                    </Button>
                  </div>
                  <span className="text-xs text-fg-muted">{t.extraAllowanceHint}</span>
                </div>
                {severalDays && (
                  <Switch
                    checked={extra.perDay}
                    onChange={(perDay) => {
                      setExtra(extra.key, { perDay });
                    }}
                    label={t.extraPerDay}
                    description={t.extraPerDayHint}
                  />
                )}
              </div>
              <Field label={t.extraInstruction} optional hint={found.includes("instruction") ? <Issue>{t.issues.instruction}</Issue> : undefined}>
                <Input
                  value={extra.instruction}
                  maxLength={MAX_INSTRUCTION}
                  placeholder={t.extraInstructionPlaceholder}
                  onChange={(changeEvent) => {
                    setExtra(extra.key, { instruction: changeEvent.target.value });
                  }}
                />
              </Field>
            </section>
          );
        })}
      {hasExtras === true && draft.extras.length < MAX_EXTRAS && (
        <Button
          variant="secondary"
          icon={<Plus />}
          className="w-fit"
          onClick={() => {
            const used = new Set(draft.extras.map((extra) => extra.name));
            setDraft((current) => ({ ...current, extras: [...current.extras, blankExtra(t.suggestions.find((name) => !used.has(name)) ?? "", current.types)] }));
          }}
        >
          {t.addExtra}
        </Button>
      )}
    </div>
  );

  const typeName = (key: string) => {
    const position = draft.types.findIndex((item) => item.key === key);
    const item = draft.types[position];
    return item === undefined ? "" : item.name.trim() === "" ? t.typeLabel(position) : item.name.trim();
  };
  const reviewStep = (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h4 className="text-sm font-semibold text-fg">{t.reviewTypes}</h4>
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border">
          {draft.types.map((item, position) => {
            const range = plan[position];
            const price = parseMoney(item.priceText);
            const priceText = !price.ok || price.cents === null ? t.eventPrice(eventPrice) : price.cents === 0 ? t.free : money(price.cents);
            const details = [
              severalDays ? (item.dayRule === "days" ? dayTexts.list([...item.validDays].sort((a, b) => a - b).map((day) => dayName(event.days, day))) : dayTexts.rules[item.dayRule]) : null,
              item.document ? t.documentShort : null,
              item.instruction.trim() === "" ? null : item.instruction.trim(),
            ].filter((part) => part !== null);
            return (
              <li key={item.key} className="flex items-start gap-3 px-4 py-3">
                <span aria-hidden className="mt-1 size-3 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm font-semibold text-fg">{item.name.trim()}</span>
                  {range !== undefined && <span className="text-xs text-fg-muted tabular">{t.numbers(range.first, range.last)}</span>}
                  {details.length > 0 && <span className="text-xs text-fg-muted">{details.join(" · ")}</span>}
                </span>
                <span className="shrink-0 text-right text-sm font-semibold text-fg tabular">{priceText}</span>
              </li>
            );
          })}
        </ul>
        <span className="text-sm text-fg-muted tabular">{t.total(total)}</span>
      </div>
      {!tokens && (
        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-semibold text-fg">{t.reviewExtras}</h4>
          {draftWithExtras.extras.length === 0 ? (
            <p className="text-sm text-fg-muted">{t.noExtras}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border">
              {draftWithExtras.extras.map((extra) => {
                const who = extra.types.length === draft.types.length ? t.allTypes : t.forTypes(dayTexts.list(extra.types.map(typeName)));
                const details = [who, severalDays ? (extra.perDay ? t.perDayShort : t.onceShort) : null, extra.allowance > 1 ? t.allowanceShort(extra.allowance) : null].filter((part) => part !== null);
                return (
                  <li key={extra.key} className="flex items-start gap-3 px-4 py-3">
                    <Gift className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-sm font-semibold text-fg">{extra.name.trim()}</span>
                      <span className="text-xs text-fg-muted">{details.join(" · ")}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
      <p className="text-xs leading-relaxed text-fg-muted">{t.reviewHint}</p>
      <ErrorMessage error={create.error} />
    </div>
  );

  const question = { start: t.startQuestion, types: t.typesQuestion, extras: t.extrasQuestion, review: t.reviewQuestion }[step];
  const hint = { start: t.startHint, types: t.typesHint, extras: t.extrasHint, review: null }[step];
  const last = index === steps.length - 1;

  return (
    <Dialog
      open
      onClose={close}
      title={t.title}
      size="lg"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          {index > 0 ? (
            <Button
              variant="ghost"
              onClick={() => {
                const previous = steps[index - 1];
                if (previous !== undefined) {
                  goTo(previous);
                }
              }}
              disabled={create.isPending}
            >
              {t.back}
            </Button>
          ) : (
            <Button variant="ghost" onClick={close}>
              {commonTexts.cancel}
            </Button>
          )}
          <Button onClick={forward} loading={create.isPending} disabled={step === "start" && draft.recipe === null} icon={last ? <Check /> : undefined}>
            {last ? t.create : t.next}
          </Button>
        </div>
      }
    >
      <div ref={body} className="flex scroll-mt-4 flex-col gap-5">
        <ol className="flex items-center gap-2" aria-label={t.stepOf(index + 1, steps.length)}>
          {steps.map((item, position) => (
            <li key={item} className="flex min-w-0 flex-1 flex-col gap-1.5" aria-current={item === step ? "step" : undefined}>
              <span className={cn("h-1.5 rounded-full transition-colors", position <= index ? "bg-brand-solid" : "bg-surface-3")} />
              <span className={cn("truncate text-xs font-medium max-sm:sr-only", position === index ? "text-fg" : "text-fg-subtle")}>{t.steps[item]}</span>
            </li>
          ))}
        </ol>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold tracking-wide text-fg-subtle uppercase">{t.stepOf(index + 1, steps.length)}</span>
          <h3 tabIndex={-1} className="text-xl font-semibold tracking-tight text-fg outline-none">
            {question}
          </h3>
          {hint !== null && <p className="text-sm leading-relaxed text-fg-muted">{hint}</p>}
        </div>
        {step === "start" ? startStep : step === "types" ? typesStep : step === "extras" ? extrasStep : reviewStep}
      </div>
    </Dialog>
  );
}
