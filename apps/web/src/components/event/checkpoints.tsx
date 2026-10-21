"use client";

import type { CategoryDto, CheckpointBody, CheckpointDto, EventDayDto } from "@ingressoimpresso/api-types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BadgeCheck, Link2, MoreHorizontal, Pencil, Plus, SearchCheck, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { useEventTexts } from "@/components/event/access";
import { Badge, Button, Card, CardHeader, Dialog, ErrorMessage, Field, Input, Menu, MenuItem, NumberInput, buttonClass, errorMessage, useConfirm } from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { common as commonTexts } from "@/texts/pt-BR/common";

/**
 * The checkpoints of an event (ADR 0092): dinner, kit, open bar. Each one has its own links and
 * its own book of uses; the entrance does not change.
 */
export function CheckpointsCard({
  eventId,
  checkpoints,
  categories,
  days,
  editable,
  onCreateLink,
}: {
  eventId: string;
  checkpoints: readonly CheckpointDto[];
  categories: readonly CategoryDto[];
  days: readonly EventDayDto[];
  editable: boolean;
  onCreateLink: (checkpoint: CheckpointDto) => void;
}) {
  const t = useEventTexts().door;
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<{ checkpoint: CheckpointDto | null } | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["door", eventId] });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/checkpoints/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success(t.checkpointDeleted);
      void refresh();
      void queryClient.invalidateQueries({ queryKey: ["checklist", eventId] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const names = new Map(categories.map((category) => [category.id, category]));

  return (
    <Card>
      <CardHeader
        title={t.checkpoints}
        description={t.checkpointsIntro}
        icon={BadgeCheck}
        actions={
          editable && (
            <Button
              variant="secondary"
              size="sm"
              icon={<Plus />}
              onClick={() => {
                setEditing({ checkpoint: null });
              }}
            >
              {t.newCheckpoint}
            </Button>
          )
        }
      />
      {checkpoints.length === 0 ? (
        <p className="text-sm text-fg-subtle">{t.noCheckpoints}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {checkpoints.map((checkpoint) => (
            <li key={checkpoint.id} className="flex flex-wrap items-start gap-x-3 gap-y-2 py-3">
              <span className="flex min-w-0 flex-1 basis-56 flex-col gap-1.5">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-fg">{checkpoint.name}</span>
                  <Badge tone="brand">
                    {days.length > 1 ? (checkpoint.perDay ? t.checkpointPerDayBadge : t.checkpointOnceBadge) : t.checkpointOnceSingle}
                  </Badge>
                  {checkpoint.categoryIds.length === 0 && checkpoint.allowance > 1 && <Badge tone="success">{t.checkpointCombo(checkpoint.allowance)}</Badge>}
                  <span className="text-xs text-fg-muted tabular">{t.checkpointUses(checkpoint.uses)}</span>
                </span>
                {checkpoint.instruction !== null && <span className="text-xs text-fg-muted">{checkpoint.instruction}</span>}
                <span className="flex flex-wrap gap-1">
                  {checkpoint.categoryIds.length === 0 ? (
                    <span className="text-xs text-fg-subtle">{t.checkpointAllCategories}</span>
                  ) : (
                    checkpoint.categoryIds.flatMap((id) => {
                      const category = names.get(id);
                      // A combo (ADR 0112): how many items the category takes.
                      const items = checkpoint.categoryAllowances.find((item) => item.categoryId === id)?.allowance ?? 1;
                      return category === undefined
                        ? []
                        : [
                            <span key={id} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-xs font-medium text-fg">
                              <span className="size-2 rounded-full" style={{ backgroundColor: category.color }} aria-hidden />
                              {category.name}
                              {items > 1 && <span className="font-semibold text-success-fg tabular">×{items}</span>}
                            </span>,
                          ];
                    })
                  )}
                </span>
                {checkpoint.links === 0 ? (
                  <span className="flex items-center gap-1.5 text-xs font-medium text-warning-fg">
                    <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
                    {t.checkpointNoLink}
                  </span>
                ) : (
                  <span className="text-xs text-fg-muted">{t.checkpointLinks(checkpoint.links)}</span>
                )}
              </span>
              {editable && (
                <span className="flex shrink-0 items-center gap-1">
                  <Button
                    variant={checkpoint.links === 0 ? "primary" : "ghost"}
                    size="sm"
                    icon={<Link2 />}
                    onClick={() => {
                      onCreateLink(checkpoint);
                    }}
                  >
                    {t.checkpointLink}
                  </Button>
                  <Menu label={t.checkpointMenu(checkpoint.name)} trigger={<MoreHorizontal />} triggerClassName={buttonClass({ variant: "ghost", size: "icon-sm" })}>
                    <MenuItem
                      icon={<Pencil />}
                      onSelect={() => {
                        setEditing({ checkpoint });
                      }}
                    >
                      {t.editCheckpoint}
                    </MenuItem>
                    <MenuItem
                      icon={<Trash2 />}
                      tone="danger"
                      onSelect={() => {
                        void confirm({
                          title: t.deleteCheckpointTitle(checkpoint.name),
                          description: t.deleteCheckpointBody(checkpoint.uses),
                          confirmLabel: t.deleteCheckpoint,
                        }).then((ok) => {
                          if (ok) {
                            remove.mutate(checkpoint.id);
                          }
                        });
                      }}
                    >
                      {t.deleteCheckpoint}
                    </MenuItem>
                  </Menu>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 flex items-start gap-2.5 rounded-xl bg-surface-2 p-3 text-sm leading-relaxed text-fg-muted">
        <SearchCheck className="mt-0.5 size-4 shrink-0 text-[#0f766e] dark:text-[#5eead4]" aria-hidden />
        <span>
          <span className="font-semibold text-fg">{t.checkTitle}. </span>
          {t.checkBody}
        </span>
      </p>
      {editing !== null && (
        <CheckpointDialog
          key={editing.checkpoint?.id ?? "new"}
          eventId={eventId}
          checkpoint={editing.checkpoint}
          categories={categories}
          days={days}
          onClose={() => {
            setEditing(null);
          }}
          onSaved={(saved, created) => {
            void refresh();
            void queryClient.invalidateQueries({ queryKey: ["checklist", eventId] });
            setEditing(null);
            // A new checkpoint needs a link for its phones: offer it right away.
            if (created) {
              onCreateLink(saved);
            }
          }}
        />
      )}
    </Card>
  );
}

/** Create or edit a checkpoint: name, what to hand over, who has the right, how many times. */
function CheckpointDialog({
  eventId,
  checkpoint,
  categories,
  days,
  onClose,
  onSaved,
}: {
  eventId: string;
  checkpoint: CheckpointDto | null;
  categories: readonly CategoryDto[];
  days: readonly EventDayDto[];
  onClose: () => void;
  onSaved: (checkpoint: CheckpointDto, created: boolean) => void;
}) {
  const t = useEventTexts().door;
  const [name, setName] = useState(checkpoint?.name ?? "");
  const [instruction, setInstruction] = useState(checkpoint?.instruction ?? "");
  const [perDay, setPerDay] = useState(checkpoint?.perDay ?? true);
  const [chosen, setChosen] = useState<string[]>(checkpoint?.categoryIds ?? []);
  // Items per ticket (ADR 0112): for every ticket, and per category with the right.
  const [allowance, setAllowance] = useState(checkpoint?.allowance ?? 1);
  const [items, setItems] = useState<Record<string, number>>(
    Object.fromEntries((checkpoint?.categoryAllowances ?? []).map((item) => [item.categoryId, item.allowance])),
  );
  const clamp = (value: number) => (Number.isFinite(value) ? Math.min(20, Math.max(1, Math.round(value))) : 1);
  const save = useMutation({
    mutationFn: () => {
      const body: CheckpointBody = {
        name: name.trim(),
        instruction: instruction.trim() === "" ? null : instruction.trim(),
        perDay,
        categoryIds: chosen,
        allowance: chosen.length === 0 ? clamp(allowance) : 1,
        categoryAllowances: chosen.map((categoryId) => ({ categoryId, allowance: clamp(items[categoryId] ?? 1) })),
      };
      return checkpoint === null
        ? api<CheckpointDto>(`/api/events/${eventId}/checkpoints`, { method: "POST", body })
        : api<CheckpointDto>(`/api/checkpoints/${checkpoint.id}`, { method: "PUT", body });
    },
    onSuccess: (saved) => {
      toast.success(t.checkpointSaved);
      onSaved(saved, checkpoint === null);
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() !== "") {
      save.mutate();
    }
  };
  const times = [
    { value: true, label: t.perDay, hint: t.perDayHint },
    { value: false, label: t.once, hint: t.onceHint },
  ] as const;

  return (
    <Dialog
      open
      onClose={onClose}
      title={checkpoint === null ? t.newCheckpointTitle : t.editCheckpointTitle(checkpoint.name)}
      description={t.checkpointsIntro}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {commonTexts.cancel}
          </Button>
          <Button type="submit" form="checkpoint-form" loading={save.isPending} disabled={name.trim() === ""}>
            {checkpoint === null ? t.createCheckpoint : t.save}
          </Button>
        </>
      }
    >
      <form id="checkpoint-form" onSubmit={submit} className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Field label={t.checkpointName}>
            <Input
              value={name}
              maxLength={30}
              required
              autoFocus
              placeholder={t.checkpointNamePlaceholder}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          </Field>
          {name.trim() === "" && (
            <div className="flex flex-wrap gap-1.5">
              {t.checkpointNameExamples.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => {
                    setName(example);
                  }}
                  className="relative rounded-full border border-border px-3 py-1 text-xs text-fg-muted transition touch-target hover:bg-surface-2 hover:text-fg active:bg-surface-3"
                >
                  {example}
                </button>
              ))}
            </div>
          )}
        </div>
        <Field label={t.checkpointInstruction} hint={t.checkpointInstructionHint} optional>
          <Input
            value={instruction}
            maxLength={60}
            placeholder={t.checkpointInstructionPlaceholder}
            onChange={(event) => {
              setInstruction(event.target.value);
            }}
          />
        </Field>
        {categories.length > 0 && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium text-fg">{t.checkpointWho}</legend>
            <div className="flex flex-wrap gap-2">
              {categories.map((category) => {
                const on = chosen.includes(category.id);
                return (
                  <button
                    key={category.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      setChosen(on ? chosen.filter((id) => id !== category.id) : [...chosen, category.id]);
                    }}
                    className={cn(
                      "inline-flex min-h-9 items-center gap-2 rounded-full border px-3 text-sm font-medium transition pointer-coarse:min-h-11",
                      on
                        ? "border-brand bg-brand-soft text-brand-soft-fg"
                        : "border-border bg-surface text-fg-muted hover:border-border-strong hover:text-fg active:bg-surface-2",
                    )}
                  >
                    <span className="size-2.5 rounded-full ring-1 ring-black/10" style={{ backgroundColor: category.color }} aria-hidden />
                    {category.name}
                  </button>
                );
              })}
            </div>
            <p className="text-xs leading-relaxed text-fg-muted">{t.checkpointWhoHint}</p>
          </fieldset>
        )}
        {/* Combos (ADR 0112): how many items each ticket takes here. */}
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium text-fg">{t.checkpointItems}</legend>
          {chosen.length === 0 ? (
            <Field label={t.checkpointItemsAll}>
              <NumberInput
                value={allowance}
                step={1}
                min={1}
                max={20}
                suffix={t.checkpointItemsUnit}
                onChange={(value) => {
                  setAllowance(clamp(value));
                }}
              />
            </Field>
          ) : (
            <ul className="flex flex-col gap-2">
              {chosen.flatMap((id) => {
                const category = categories.find((item) => item.id === id);
                return category === undefined
                  ? []
                  : [
                      <li key={id} className="flex items-center justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-2 text-sm text-fg">
                          <span className="size-2.5 shrink-0 rounded-full ring-1 ring-black/10" style={{ backgroundColor: category.color }} aria-hidden />
                          <span className="truncate">{category.name}</span>
                        </span>
                        <span className="w-32 shrink-0">
                          <NumberInput
                            value={items[id] ?? 1}
                            step={1}
                            min={1}
                            max={20}
                            suffix={t.checkpointItemsUnit}
                            aria-label={`${t.checkpointItems}: ${category.name}`}
                            onChange={(value) => {
                              setItems({ ...items, [id]: clamp(value) });
                            }}
                          />
                        </span>
                      </li>,
                    ];
              })}
            </ul>
          )}
          <p className="text-xs leading-relaxed text-fg-muted">{t.checkpointItemsHint}</p>
        </fieldset>
        {/* Only an event of several days has a choice: in one day, a use is a use. */}
        {days.length > 1 && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium text-fg">{t.checkpointTimes}</legend>
            {times.map((option) => (
              <label
                key={String(option.value)}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand",
                  perDay === option.value ? "border-brand bg-brand-soft/60 text-fg" : "border-border text-fg-muted hover:border-border-strong",
                )}
              >
                <input
                  type="radio"
                  name="checkpoint-times"
                  className="mt-0.5 size-4 accent-brand"
                  checked={perDay === option.value}
                  onChange={() => {
                    setPerDay(option.value);
                  }}
                />
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium text-fg">{option.label}</span>
                  <span className="text-xs leading-relaxed">{option.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}
        <ErrorMessage error={save.error} />
      </form>
    </Dialog>
  );
}
