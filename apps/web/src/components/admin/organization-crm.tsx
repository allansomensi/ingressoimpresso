"use client";

import type {
  AdminOrganizationDetailDto,
  AdminOrganizationDto,
  OrganizationNoteDto,
  TimelineEntryDto,
  TimelineKind,
} from "@ingressoimpresso/api-types";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Building2,
  CalendarPlus,
  CircleDollarSign,
  Coins,
  LogIn,
  Mail,
  NotebookPen,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Scale,
  ShieldCheck,
  StickyNote,
  Tag,
  Ticket,
  TicketPercent,
  Trash2,
  Undo2,
  UserPlus,
  Workflow,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorMessage,
  Input,
  LoadingBlock,
  Textarea,
  errorMessage,
  useConfirm,
} from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { money, shortDateTime } from "@/lib/format";
import {
  filterTimeline,
  mergeTimeline,
  normalizeTag,
  type TimelineFilter,
} from "@/lib/organization-crm";
import { common as commonTexts } from "@/texts/pt-BR/common";
import { admin as adminTexts } from "@/texts/pt-BR/admin";

const t = adminTexts.organization;
const MAX_TAGS = 10;

function detailKey(organizationId: string) {
  return ["admin", "organization", organizationId];
}

/** The admins' labels of an organization (ADR 0105), edited in place. */
export function OrganizationTags({
  organization,
}: {
  organization: AdminOrganizationDto;
}) {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const save = useMutation({
    mutationFn: (tags: string[]) =>
      api<AdminOrganizationDto>(
        `/api/admin/organizations/${organization.id}/tags`,
        { method: "PUT", body: { tags } },
      ),
    onSuccess: (updated) => {
      queryClient.setQueryData<AdminOrganizationDetailDto>(
        detailKey(organization.id),
        (old) => (old === undefined ? old : { ...old, organization: updated }),
      );
      void queryClient.invalidateQueries({
        queryKey: ["admin", "organizations"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["admin", "organization-tags"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["admin", "timeline", organization.id],
      });
      setText("");
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
  const add = () => {
    const tag = normalizeTag(text);
    if (tag === "" || organization.tags.includes(tag)) {
      setText("");
      return;
    }
    save.mutate([...organization.tags, tag]);
  };
  return (
    <Card>
      <CardHeader icon={Tag} title={t.tags} description={t.tagsHint} />
      <div className="flex flex-col gap-3">
        {organization.tags.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {organization.tags.map((tag) => (
              <li key={tag}>
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 py-0.5 pr-1 pl-2.5 text-sm text-fg">
                  {tag}
                  <button
                    type="button"
                    aria-label={t.removeTag(tag)}
                    title={t.removeTag(tag)}
                    disabled={save.isPending}
                    onClick={() => {
                      save.mutate(
                        organization.tags.filter((other) => other !== tag),
                      );
                    }}
                    className="relative touch-target rounded-full p-0.5 text-fg-subtle transition hover:bg-surface-3 hover:text-fg active:bg-surface-3"
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        {organization.tags.length < MAX_TAGS && (
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              add();
            }}
          >
            <Input
              value={text}
              maxLength={30}
              placeholder={t.tagPlaceholder}
              aria-label={t.tagPlaceholder}
              onChange={(event) => {
                setText(event.target.value);
              }}
            />
            <Button
              type="submit"
              variant="secondary"
              icon={<Plus />}
              loading={save.isPending}
              disabled={normalizeTag(text) === ""}
            >
              {t.addTag}
            </Button>
          </form>
        )}
      </div>
    </Card>
  );
}

function NoteItem({
  note,
  organizationId,
}: {
  note: OrganizationNoteDto;
  organizationId: string;
}) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(note.body);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: detailKey(organizationId) });
    void queryClient.invalidateQueries({
      queryKey: ["admin", "timeline", organizationId],
    });
  };
  const update = useMutation({
    mutationFn: (change: { body: string; pinned: boolean }) =>
      api<OrganizationNoteDto>(`/api/admin/organization-notes/${note.id}`, {
        method: "PUT",
        body: change,
      }),
    onSuccess: () => {
      setEditing(false);
      refresh();
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
  const remove = useMutation({
    mutationFn: () =>
      api<undefined>(`/api/admin/organization-notes/${note.id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      toast.success(t.noteDeleted);
      refresh();
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
  return (
    <li
      className={cn(
        "flex flex-col gap-2 rounded-xl border p-3",
        note.pinned ? "border-warning/50 bg-warning-soft/40" : "border-border",
      )}
    >
      {editing ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            update.mutate({ body: body.trim(), pinned: note.pinned });
          }}
        >
          <Textarea
            value={body}
            maxLength={2000}
            rows={3}
            aria-label={t.editNote}
            onChange={(event) => {
              setBody(event.target.value);
            }}
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setBody(note.body);
                setEditing(false);
              }}
            >
              {commonTexts.cancel}
            </Button>
            <Button
              type="submit"
              size="sm"
              loading={update.isPending}
              disabled={body.trim() === ""}
            >
              {commonTexts.save}
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-sm whitespace-pre-wrap text-fg">{note.body}</p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-2 text-xs text-fg-subtle">
          {note.pinned && (
            <Badge tone="warning">
              <Pin className="size-3" aria-hidden />
              {t.pinned}
            </Badge>
          )}
          {t.noteBy(note.authorEmail, shortDateTime(note.createdAt))}
          {note.updatedAt !== note.createdAt && <span>· {t.edited}</span>}
        </span>
        {!editing && (
          <span className="flex gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={note.pinned ? t.unpin : t.pin}
              title={note.pinned ? t.unpin : t.pin}
              loading={update.isPending}
              onClick={() => {
                update.mutate({ body: note.body, pinned: !note.pinned });
              }}
            >
              {note.pinned ? <PinOff /> : <Pin />}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t.editNote}
              title={t.editNote}
              onClick={() => {
                setEditing(true);
              }}
            >
              <Pencil />
            </Button>
            <Button
              variant="danger-ghost"
              size="icon-sm"
              aria-label={t.deleteNote}
              title={t.deleteNote}
              loading={remove.isPending}
              onClick={async () => {
                if (
                  await confirm({
                    title: t.deleteNoteTitle,
                    description: note.body.slice(0, 140),
                    confirmLabel: t.deleteNote,
                    danger: true,
                  })
                ) {
                  remove.mutate();
                }
              }}
            >
              <Trash2 />
            </Button>
          </span>
        )}
      </div>
    </li>
  );
}

/** The admins' internal notes on an organization (ADR 0105). */
export function OrganizationNotes({
  organizationId,
  notes,
}: {
  organizationId: string;
  notes: OrganizationNoteDto[];
}) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const create = useMutation({
    mutationFn: () =>
      api<OrganizationNoteDto>(
        `/api/admin/organizations/${organizationId}/notes`,
        { method: "POST", body: { body: body.trim() } },
      ),
    onSuccess: () => {
      setBody("");
      toast.success(t.noteSaved);
      void queryClient.invalidateQueries({
        queryKey: detailKey(organizationId),
      });
      void queryClient.invalidateQueries({
        queryKey: ["admin", "timeline", organizationId],
      });
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
  return (
    <Card>
      <CardHeader
        icon={NotebookPen}
        title={t.notes}
        description={t.notesHint}
      />
      <div className="flex flex-col gap-4">
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <Textarea
            value={body}
            rows={2}
            maxLength={2000}
            placeholder={t.notePlaceholder}
            aria-label={t.notes}
            onChange={(event) => {
              setBody(event.target.value);
            }}
          />
          <Button
            type="submit"
            size="sm"
            icon={<StickyNote />}
            className="self-end"
            loading={create.isPending}
            disabled={body.trim() === ""}
          >
            {t.addNote}
          </Button>
        </form>
        {notes.length === 0 ? (
          <p className="text-sm text-fg-muted">{t.noNotes}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {notes.map((note) => (
              <NoteItem
                key={`${note.id}-${note.updatedAt}-${String(note.pinned)}`}
                note={note}
                organizationId={organizationId}
              />
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

const ICONS: Record<TimelineKind, LucideIcon> = {
  signup: Building2,
  member_joined: UserPlus,
  login: LogIn,
  event_created: CalendarPlus,
  batch_created: Ticket,
  batch_paid: CircleDollarSign,
  batch_refunded: Undo2,
  dispute: Scale,
  email: Mail,
  credit: Coins,
  coupon: TicketPercent,
  admin: ShieldCheck,
  note: StickyNote,
};

const TONES: Partial<Record<TimelineKind, string>> = {
  batch_paid: "bg-success-soft text-success-fg",
  batch_refunded: "bg-danger-soft text-danger-fg",
  dispute: "bg-danger-soft text-danger-fg",
  note: "bg-warning-soft text-warning-fg",
  admin: "bg-brand-soft text-brand",
};

/** The facts of one entry, in words. */
function entryFacts(entry: TimelineEntryDto): string[] {
  const facts: string[] = [];
  const add = (value: string | null | undefined) => {
    if (value !== null && value !== undefined && value !== "") {
      facts.push(value);
    }
  };
  switch (entry.kind) {
    case "batch_created":
    case "batch_paid":
    case "batch_refunded":
      add(entry.count === null ? null : t.tickets(entry.count));
      add(entry.amountCents === null ? null : money(entry.amountCents));
      if (entry.kind === "batch_paid") {
        add(entry.code === null ? null : (t.paidVia[entry.code] ?? entry.code));
      }
      break;
    case "dispute":
      add(entry.amountCents === null ? null : money(entry.amountCents));
      add(
        entry.code === null
          ? null
          : (adminTexts.disputes.statuses[entry.code] ?? entry.code),
      );
      add(
        entry.detail === null
          ? null
          : (adminTexts.disputes.reasons[entry.detail] ?? entry.detail),
      );
      break;
    case "email":
      add(entry.detail);
      add(entry.actor);
      add(
        entry.code === null ? null : (t.mailStatuses[entry.code] ?? entry.code),
      );
      break;
    case "credit":
      add(
        entry.amountCents === null
          ? null
          : `${entry.amountCents > 0 ? "+" : "−"}${money(Math.abs(entry.amountCents))}`,
      );
      add(
        entry.code === null
          ? null
          : (t.creditReasons[entry.code] ?? entry.code),
      );
      add(entry.detail);
      break;
    case "coupon":
      add(entry.detail);
      add(entry.actor);
      break;
    case "admin":
      add(
        entry.code === null
          ? null
          : (adminTexts.audit.actions[entry.code] ?? entry.code),
      );
      add(entry.actor);
      break;
    case "note":
      add(entry.actor);
      break;
    case "signup":
      add(entry.detail);
      break;
    case "member_joined":
    case "login":
      add(entry.actor);
      break;
    case "event_created":
      break;
  }
  return facts;
}

function TimelineItem({ entry }: { entry: TimelineEntryDto }) {
  const Icon = ICONS[entry.kind];
  const facts = entryFacts(entry);
  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      <span
        className={cn(
          "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full ring-4 ring-surface",
          TONES[entry.kind] ?? "bg-surface-2 text-fg-muted",
        )}
        aria-hidden
      >
        <Icon className="size-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-1">
        <span className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="text-sm font-medium text-fg">
            {t.timelineKinds[entry.kind] ?? entry.kind}
            {entry.eventName !== null && entry.eventId !== null && (
              <>
                {" · "}
                <Link
                  href={`/painel/eventos/${entry.eventId}`}
                  className="font-normal text-brand hover:underline"
                >
                  {entry.eventName}
                </Link>
              </>
            )}
          </span>
          <time dateTime={entry.at} className="text-xs text-fg-subtle tabular">
            {shortDateTime(entry.at)}
          </time>
        </span>
        {facts.length > 0 && (
          <span className="text-xs break-words text-fg-muted">
            {facts.join(" · ")}
          </span>
        )}
        {entry.kind === "note" && entry.detail !== null && (
          <p className="line-clamp-3 text-sm whitespace-pre-wrap text-fg">
            {entry.detail}
          </p>
        )}
      </div>
    </li>
  );
}

/** Everything that happened to the account (ADR 0105), newest first, a page at a time. */
export function OrganizationTimeline({
  organizationId,
}: {
  organizationId: string;
}) {
  const [filter, setFilter] = useState<TimelineFilter>("all");
  const timeline = useInfiniteQuery({
    queryKey: ["admin", "timeline", organizationId],
    queryFn: ({ pageParam }) =>
      api<TimelineEntryDto[]>(
        `/api/admin/organizations/${organizationId}/timeline${pageParam === null ? "" : `?before=${encodeURIComponent(pageParam)}`}`,
      ),
    initialPageParam: null as string | null,
    // A full page means there may be more before its last entry.
    getNextPageParam: (last) =>
      last.length < 100 ? undefined : (last.at(-1)?.at ?? undefined),
  });
  const entries =
    timeline.data === undefined
      ? []
      : filterTimeline(mergeTimeline(timeline.data.pages), filter);
  return (
    <Card>
      <CardHeader
        icon={Workflow}
        title={t.timeline}
        description={t.timelineHint}
      />
      <div className="flex flex-col gap-4">
        <div
          role="radiogroup"
          aria-label={t.timeline}
          className="flex w-fit max-w-full overflow-x-auto rounded-full border border-border bg-surface-2 p-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {(Object.keys(t.timelineFilters) as TimelineFilter[]).map(
            (option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={filter === option}
                onClick={() => {
                  setFilter(option);
                }}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap transition",
                  filter === option
                    ? "bg-surface text-fg shadow-sm ring-1 ring-border"
                    : "text-fg-muted hover:text-fg active:text-fg",
                )}
              >
                {t.timelineFilters[option]}
              </button>
            ),
          )}
        </div>
        {timeline.isPending ? (
          <LoadingBlock rows={4} />
        ) : timeline.isError ? (
          <ErrorMessage error={timeline.error} />
        ) : entries.length === 0 ? (
          <EmptyState icon={Workflow} title={t.noTimeline} />
        ) : (
          <ol className="relative before:absolute before:top-2 before:bottom-2 before:left-4 before:w-px before:bg-border">
            {entries.map((entry, index) => (
              <TimelineItem
                key={`${entry.at}-${entry.kind}-${String(index)}`}
                entry={entry}
              />
            ))}
          </ol>
        )}
        {timeline.hasNextPage && (
          <Button
            variant="secondary"
            size="sm"
            className="self-center"
            loading={timeline.isFetchingNextPage}
            onClick={() => void timeline.fetchNextPage()}
          >
            {t.olderTimeline}
          </Button>
        )}
      </div>
    </Card>
  );
}
