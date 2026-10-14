"use client";

import type { CategoryDto, GuestBody, GuestBulkBody, GuestDto } from "@ingressoimpresso/api-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ClipboardPaste, ListChecks, MoreHorizontal, Pencil, Plus, Search, Trash2, UserRound, Users } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  ErrorMessage,
  Field,
  Input,
  Lead,
  List,
  ListItem,
  LoadingBlock,
  Menu,
  MenuItem,
  Select,
  Stat,
  Textarea,
  buttonClass,
  errorMessage,
  useConfirm,
} from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import {
  MAX_COMPANIONS,
  MAX_GUEST_NAME,
  MAX_GUEST_NOTE,
  MAX_PASTE,
  filterGuests,
  guestTotals,
  parseGuestLines,
  type GuestFilter,
} from "@/lib/guest-list";
import { inkFor } from "@/lib/design-rules";
import { useUnsavedChanges } from "@/lib/unsaved";
import { event as eventTexts } from "@/texts/pt-BR/event";

import { useEventAccess } from "./access";
import { useLivePolling } from "./live-polling";

const t = eventTexts.guests;
const FILTERS: readonly GuestFilter[] = ["all", "arrived", "missing"];

function time(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** The guest list (ADR 0070): who enters by name, and who already came. */
export function GuestsTab({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { can } = useEventAccess();
  const editable = can("door");
  const key = ["guests", eventId];
  const guests = useQuery({
    queryKey: key,
    queryFn: () => api<GuestDto[]>(`/api/events/${eventId}/guests`),
    // Arrivals come in from the door phones.
    refetchInterval: useLivePolling(eventId, 15_000),
  });
  const categories = useQuery({
    queryKey: ["categories", eventId],
    queryFn: () => api<CategoryDto[]>(`/api/events/${eventId}/categories`),
  });
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<GuestFilter>("all");
  const [form, setForm] = useState<GuestDto | "new" | null>(null);
  const [pasting, setPasting] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });

  const remove = useMutation({
    mutationFn: (id: string) => api<undefined>(`/api/guests/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success(t.removed);
      void refresh();
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });

  if (guests.isPending) {
    return <LoadingBlock rows={3} />;
  }
  if (guests.isError) {
    return <ErrorMessage error={guests.error} />;
  }
  const list = guests.data;
  const totals = guestTotals(list);
  const shown = filterGuests(list, query, filter);
  const categoryById = new Map((categories.data ?? []).map((category) => [category.id, category]));

  return (
    <div className="flex flex-col gap-6">
      <Lead>{t.intro}</Lead>
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <Stat label={t.names} value={totals.names.toLocaleString("pt-BR")} icon={ListChecks} />
        <Stat label={t.people} value={totals.people.toLocaleString("pt-BR")} icon={Users} />
        <Stat
          label={t.arrived}
          value={totals.arrivedPeople.toLocaleString("pt-BR")}
          hint={t.arrivedHint(totals.arrivedNames)}
          icon={CheckCircle2}
          tone="success"
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <span className="sr-only">{t.search}</span>
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
          <Input
            type="search"
            value={query}
            placeholder={t.search}
            className="pl-10"
            onChange={(event) => {
              setQuery(event.target.value);
            }}
          />
        </label>
        {editable && (
          <div className="flex gap-2">
            <Button
              icon={<Plus />}
              className="flex-1 sm:flex-none"
              onClick={() => {
                setForm("new");
              }}
            >
              {t.add}
            </Button>
            <Button
              variant="secondary"
              icon={<ClipboardPaste />}
              className="flex-1 sm:flex-none"
              onClick={() => {
                setPasting(true);
              }}
            >
              {t.paste}
            </Button>
          </div>
        )}
      </div>

      {list.length === 0 ? (
        <EmptyState icon={ListChecks} title={t.emptyTitle} description={t.empty} />
      ) : (
        <>
          <div role="radiogroup" aria-label={t.filterLabel} className="flex gap-1 rounded-xl bg-surface-2 p-1 sm:w-fit">
            {FILTERS.map((item) => (
              <button
                key={item}
                type="button"
                role="radio"
                aria-checked={filter === item}
                onClick={() => {
                  setFilter(item);
                }}
                className={cn(
                  "min-h-9 flex-1 rounded-lg px-3 text-sm font-medium transition pointer-coarse:min-h-11 sm:flex-none",
                  filter === item ? "bg-surface text-fg shadow-xs" : "text-fg-muted hover:text-fg active:bg-surface-3",
                )}
              >
                {t.filters[item]}
              </button>
            ))}
          </div>
          {shown.length === 0 ? (
            <p className="py-6 text-center text-sm text-fg-subtle">{t.noMatch}</p>
          ) : (
            <List>
              {shown.map((guest) => {
                const category = guest.categoryId === null ? undefined : categoryById.get(guest.categoryId);
                return (
                  <ListItem key={guest.id} className="flex-nowrap items-start">
                    <span
                      className={cn(
                        "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl",
                        guest.arrival === null ? "bg-surface-2 text-fg-muted" : "bg-success-soft text-success-fg",
                      )}
                      aria-hidden
                    >
                      {guest.arrival === null ? <UserRound className="size-4" /> : <CheckCircle2 className="size-4" />}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="font-medium break-words text-fg">{guest.name}</span>
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-muted">
                        <span>{t.party(guest.companions)}</span>
                        {category !== undefined && (
                          <span
                            className="rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase"
                            style={{ backgroundColor: category.color, color: inkFor(category.color) }}
                          >
                            {category.name}
                          </span>
                        )}
                        {guest.note !== null && <span className="text-fg">{guest.note}</span>}
                      </span>
                      {guest.arrival === null ? (
                        <span className="text-xs text-fg-subtle">{t.waiting}</span>
                      ) : (
                        <span className="flex flex-wrap items-center gap-1.5">
                          <Badge tone="success">{t.arrivedAt(time(guest.arrival.at), guest.arrival.deviceName)}</Badge>
                          {guest.companions > 0 && <Badge tone="neutral">{t.inside(guest.arrival.people, guest.companions + 1)}</Badge>}
                        </span>
                      )}
                    </span>
                    {editable && (
                      <Menu label={t.actions} trigger={<MoreHorizontal />} triggerClassName={buttonClass({ variant: "ghost", size: "icon-sm" })}>
                        <MenuItem
                          icon={<Pencil />}
                          onSelect={() => {
                            setForm(guest);
                          }}
                        >
                          {t.edit}
                        </MenuItem>
                        <MenuItem
                          icon={<Trash2 />}
                          tone="danger"
                          onSelect={() => {
                            void confirm({ title: t.removeTitle(guest.name), description: t.removeBody, confirmLabel: t.remove }).then((ok) => {
                              if (ok) {
                                remove.mutate(guest.id);
                              }
                            });
                          }}
                        >
                          {t.remove}
                        </MenuItem>
                      </Menu>
                    )}
                  </ListItem>
                );
              })}
            </List>
          )}
        </>
      )}

      <GuestDialog
        eventId={eventId}
        guest={form}
        categories={categories.data ?? []}
        onClose={() => {
          setForm(null);
        }}
        onSaved={() => {
          void refresh();
        }}
      />
      <PasteDialog
        eventId={eventId}
        open={pasting}
        onClose={() => {
          setPasting(false);
        }}
        onSaved={() => {
          void refresh();
        }}
      />
    </div>
  );
}

function GuestDialog(props: {
  eventId: string;
  guest: GuestDto | "new" | null;
  categories: readonly CategoryDto[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = props.guest !== null && props.guest !== "new" ? props.guest : null;
  return (
    <Dialog open={props.guest !== null} onClose={props.onClose} title={editing === null ? t.formTitle : t.editTitle}>
      {props.guest !== null && (
        <GuestForm key={editing?.id ?? "new"} eventId={props.eventId} guest={editing} categories={props.categories} onClose={props.onClose} onSaved={props.onSaved} />
      )}
    </Dialog>
  );
}

function GuestForm(props: {
  eventId: string;
  guest: GuestDto | null;
  categories: readonly CategoryDto[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(props.guest?.name ?? "");
  const [companions, setCompanions] = useState(String(props.guest?.companions ?? 0));
  const [note, setNote] = useState(props.guest?.note ?? "");
  const [categoryId, setCategoryId] = useState(props.guest?.categoryId ?? "");
  const companionCount = Math.min(MAX_COMPANIONS, Math.max(0, Math.trunc(Number(companions) || 0)));
  const dirty =
    name !== (props.guest?.name ?? "") ||
    companionCount !== (props.guest?.companions ?? 0) ||
    note !== (props.guest?.note ?? "") ||
    categoryId !== (props.guest?.categoryId ?? "");
  useUnsavedChanges(dirty);

  const save = useMutation({
    mutationFn: () => {
      const body: GuestBody = {
        name: name.trim(),
        companions: companionCount,
        ...(note.trim() === "" ? {} : { note: note.trim() }),
        ...(categoryId === "" ? {} : { categoryId }),
      };
      return props.guest === null
        ? api<GuestDto>(`/api/events/${props.eventId}/guests`, { method: "POST", body })
        : api<GuestDto>(`/api/guests/${props.guest.id}`, { method: "PUT", body });
    },
    onSuccess: () => {
      toast.success(props.guest === null ? t.added(1) : t.saved);
      props.onSaved();
      props.onClose();
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label={t.name}>
        <Input
          value={name}
          maxLength={MAX_GUEST_NAME}
          placeholder={t.namePlaceholder}
          autoComplete="off"
          onChange={(event) => {
            setName(event.target.value);
          }}
          autoFocus
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.companions} hint={t.companionsHint}>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_COMPANIONS}
            value={companions}
            onChange={(event) => {
              setCompanions(event.target.value);
            }}
          />
        </Field>
        {props.categories.length > 0 && (
          <Field label={t.category} optional>
            <Select
              value={categoryId}
              onChange={(event) => {
                setCategoryId(event.target.value);
              }}
            >
              <option value="">{t.noCategoryOption}</option>
              {props.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>
      <Field label={t.note} optional>
        <Input
          value={note}
          maxLength={MAX_GUEST_NOTE}
          placeholder={t.notePlaceholder}
          onChange={(event) => {
            setNote(event.target.value);
          }}
        />
      </Field>
      <ErrorMessage error={save.error} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={props.onClose}>
          {t.cancel}
        </Button>
        <Button type="submit" loading={save.isPending} disabled={name.trim() === ""}>
          {t.save}
        </Button>
      </div>
    </form>
  );
}

function PasteDialog(props: { eventId: string; open: boolean; onClose: () => void; onSaved: () => void }) {
  return (
    <Dialog open={props.open} onClose={props.onClose} title={t.pasteTitle} description={t.pasteHint}>
      {props.open && <PasteForm {...props} />}
    </Dialog>
  );
}

function PasteForm(props: { eventId: string; onClose: () => void; onSaved: () => void }) {
  const [text, setText] = useState("");
  const parsed = parseGuestLines(text);
  const ready = parsed.guests.slice(0, MAX_PASTE);
  useUnsavedChanges(text.trim() !== "");
  const save = useMutation({
    mutationFn: () => {
      const body: GuestBulkBody = { guests: ready.map((guest) => ({ name: guest.name, companions: guest.companions })) };
      return api<GuestDto[]>(`/api/events/${props.eventId}/guests/bulk`, { method: "POST", body });
    },
    onSuccess: (added) => {
      toast.success(t.added(added.length));
      setText("");
      props.onSaved();
      props.onClose();
    },
  });
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <Textarea
        value={text}
        rows={8}
        placeholder={t.pastePlaceholder}
        aria-label={t.pasteTitle}
        onChange={(event) => {
          setText(event.target.value);
        }}
        autoFocus
      />
      <p className="text-sm text-fg-muted">{t.pasteCount(ready.length)}</p>
      {parsed.errors.length > 0 && (
        <p role="alert" className="rounded-xl bg-warning-soft px-3 py-2 text-sm text-warning-fg">
          {t.pasteErrors(parsed.errors)}
        </p>
      )}
      <ErrorMessage error={save.error} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={props.onClose}>
          {t.cancel}
        </Button>
        <Button type="submit" loading={save.isPending} disabled={ready.length === 0}>
          {t.pasteSubmit(ready.length)}
        </Button>
      </div>
    </form>
  );
}
