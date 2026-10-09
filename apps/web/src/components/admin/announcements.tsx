"use client";

import type {
  AdminAnnouncementDto,
  AnnouncementBody,
  AnnouncementDisplay,
  AnnouncementLevel,
  AnnouncementStatus,
} from "@ingressoimpresso/api-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Bell, Eye, MonitorSmartphone, MoreHorizontal, Pencil, Plus, Radio, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { LEVEL_ICON, LEVEL_TONE } from "@/components/panel/inbox";
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
  Textarea,
  errorMessage,
  useConfirm,
  type Tone,
} from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { shortDateTime } from "@/lib/format";
import { fromLocalInput, toLocalInput } from "@/lib/local-time";
import { texts } from "@/texts/pt-BR";

const t = texts.admin.announcements;
const LEVELS: readonly AnnouncementLevel[] = ["info", "success", "warning", "critical"];
const STATUS_TONE: Record<AnnouncementStatus, Tone> = {
  draft: "neutral",
  scheduled: "brand",
  active: "success",
  ended: "neutral",
  archived: "neutral",
};

function percent(part: number, whole: number): string {
  return whole === 0 ? "0%" : `${String(Math.round((part / whole) * 100))}%`;
}

function Editor({ item, onClose }: { item: AdminAnnouncementDto | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(item?.title ?? "");
  const [body, setBody] = useState(item?.body ?? "");
  const [level, setLevel] = useState<AnnouncementLevel>(item?.level ?? "info");
  const [display, setDisplay] = useState<AnnouncementDisplay>(item?.display ?? "notification");
  const [ctaLabel, setCtaLabel] = useState(item?.ctaLabel ?? "");
  const [ctaUrl, setCtaUrl] = useState(item?.ctaUrl ?? "");
  const [startsAt, setStartsAt] = useState(toLocalInput(item?.startsAt));
  const [endsAt, setEndsAt] = useState(toLocalInput(item?.endsAt));
  const published = item !== null && item.publishedAt !== null;
  const save = useMutation({
    mutationFn: (publish: boolean) => {
      const payload: AnnouncementBody = {
        title: title.trim(),
        body: body.trim(),
        level,
        display,
        ctaLabel: ctaLabel.trim() === "" ? null : ctaLabel.trim(),
        ctaUrl: ctaUrl.trim() === "" ? null : ctaUrl.trim(),
        startsAt: fromLocalInput(startsAt),
        endsAt: fromLocalInput(endsAt),
        publish,
      };
      return item === null
        ? api<AdminAnnouncementDto>("/api/admin/announcements", { method: "POST", body: payload })
        : api<AdminAnnouncementDto>(`/api/admin/announcements/${item.id}`, { method: "PUT", body: payload });
    },
    onSuccess: (saved, publish) => {
      toast.success(publish && !published ? t.published : t.saved);
      void queryClient.invalidateQueries({ queryKey: ["admin", "announcements"] });
      void queryClient.invalidateQueries({ queryKey: ["inbox"] });
      if (saved.status !== "draft" || !publish) {
        onClose();
      }
    },
  });
  const Icon = LEVEL_ICON[level];
  const valid = title.trim().length >= 3 && body.trim() !== "";
  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={item === null ? t.new : t.edit}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {texts.common.cancel}
          </Button>
          {!published && (
            <Button variant="secondary" disabled={!valid} loading={save.isPending && save.variables === false} onClick={() => save.mutate(false)}>
              {t.saveDraft}
            </Button>
          )}
          <Button icon={<Send />} disabled={!valid} loading={save.isPending && save.variables === true} onClick={() => save.mutate(true)}>
            {published ? texts.common.save : t.publish}
          </Button>
        </>
      }
    >
      <div className="grid gap-6 md:grid-cols-[1fr_17rem]">
        <div className="flex flex-col gap-4">
          <Field label={t.titleLabel}>
            <Input
              value={title}
              maxLength={120}
              placeholder={t.titlePlaceholder}
              onChange={(event) => {
                setTitle(event.target.value);
              }}
            />
          </Field>
          <Field label={t.body} hint={t.bodyHint}>
            <Textarea
              value={body}
              maxLength={4000}
              rows={6}
              onChange={(event) => {
                setBody(event.target.value);
              }}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.level}>
              <Select
                value={level}
                onChange={(event) => {
                  setLevel(event.target.value as AnnouncementLevel);
                }}
              >
                {LEVELS.map((option) => (
                  <option key={option} value={option}>
                    {texts.inbox.levels[option]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t.display}>
              <Select
                value={display}
                onChange={(event) => {
                  setDisplay(event.target.value as AnnouncementDisplay);
                }}
              >
                <option value="notification">{t.displays.notification}</option>
                <option value="modal">{t.displays.modal}</option>
              </Select>
            </Field>
            <Field label={t.ctaLabel} optional>
              <Input
                value={ctaLabel}
                maxLength={40}
                placeholder={t.ctaLabelPlaceholder}
                onChange={(event) => {
                  setCtaLabel(event.target.value);
                }}
              />
            </Field>
            <Field label={t.ctaUrl} optional hint={t.ctaUrlHint}>
              <Input
                value={ctaUrl}
                maxLength={500}
                placeholder="/painel/conta"
                inputMode="url"
                autoCapitalize="none"
                onChange={(event) => {
                  setCtaUrl(event.target.value);
                }}
              />
            </Field>
            <Field label={t.startsAt} optional hint={t.startsAtHint}>
              <Input
                type="datetime-local"
                value={startsAt}
                onChange={(event) => {
                  setStartsAt(event.target.value);
                }}
              />
            </Field>
            <Field label={t.endsAt} optional hint={t.endsAtHint}>
              <Input
                type="datetime-local"
                value={endsAt}
                onChange={(event) => {
                  setEndsAt(event.target.value);
                }}
              />
            </Field>
          </div>
          <ErrorMessage error={save.error} />
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold tracking-wide text-fg-subtle uppercase">{t.preview}</p>
          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-bg p-4 shadow-xs">
            <span className="flex items-center gap-3">
              <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", LEVEL_TONE[level])}>
                <Icon className="size-[18px]" aria-hidden />
              </span>
              <span className="font-semibold text-fg">{title.trim() === "" ? t.titlePlaceholder : title}</span>
            </span>
            <p className="text-sm leading-relaxed whitespace-pre-line text-fg-muted">{body.trim() === "" ? t.bodyPlaceholder : body}</p>
            {ctaLabel.trim() !== "" && <span className="text-sm font-semibold text-brand">{ctaLabel}</span>}
          </div>
          <p className="flex items-start gap-2 text-xs leading-relaxed text-fg-muted">
            {display === "modal" ? <MonitorSmartphone className="mt-0.5 size-3.5 shrink-0" aria-hidden /> : <Bell className="mt-0.5 size-3.5 shrink-0" aria-hidden />}
            {t.displayHints[display]}
          </p>
        </div>
      </div>
    </Dialog>
  );
}

/** Announcements to every organizer (ADR 0038). */
export function AdminAnnouncements() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const list = useQuery({ queryKey: ["admin", "announcements"], queryFn: () => api<AdminAnnouncementDto[]>("/api/admin/announcements") });
  const [editing, setEditing] = useState<AdminAnnouncementDto | "new" | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => api<undefined>(`/api/admin/announcements/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success(t.removed);
      void queryClient.invalidateQueries({ queryKey: ["admin", "announcements"] });
      void queryClient.invalidateQueries({ queryKey: ["inbox"] });
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
  const newButton = (
    <Button
      icon={<Plus />}
      onClick={() => {
        setEditing("new");
      }}
    >
      {t.new}
    </Button>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Lead>{t.intro}</Lead>
        {newButton}
      </div>
      {list.isPending ? (
        <LoadingBlock rows={3} />
      ) : list.isError ? (
        <ErrorMessage error={list.error} />
      ) : list.data.length === 0 ? (
        <EmptyState icon={Radio} title={t.empty} description={t.emptyHint} action={newButton} />
      ) : (
        <List>
          {list.data.map((item) => {
            const Icon = LEVEL_ICON[item.level];
            const live = item.status === "active" || item.status === "scheduled";
            return (
              <ListItem key={item.id} className="flex-nowrap items-start">
                <span className={cn("mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl", LEVEL_TONE[item.level])}>
                  <Icon className="size-[18px]" aria-hidden />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-fg">{item.title}</span>
                    <Badge tone={STATUS_TONE[item.status]} dot={item.status === "active"} pulse={item.status === "active"}>
                      {t.statuses[item.status]}
                    </Badge>
                    <Badge tone="neutral">{t.displays[item.display]}</Badge>
                  </span>
                  <span className="line-clamp-2 text-sm text-fg-muted">{item.body}</span>
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-fg-subtle">
                    <span>{item.status === "scheduled" ? t.startsOn(shortDateTime(item.startsAt)) : shortDateTime(item.publishedAt ?? item.createdAt)}</span>
                    {item.endsAt !== null && <span>{t.until(shortDateTime(item.endsAt))}</span>}
                    {item.publishedAt !== null && (
                      <span className="flex items-center gap-1">
                        <Eye className="size-3" aria-hidden />
                        {t.reach(item.stats.seen, percent(item.stats.seen, item.stats.audience))}
                      </span>
                    )}
                  </span>
                </div>
                {item.status !== "archived" && (
                <Menu
                  label={texts.event.batches.moreActions}
                  trigger={<MoreHorizontal className="size-4" aria-hidden />}
                  triggerClassName="flex size-9 items-center justify-center rounded-lg text-fg-muted transition hover:bg-surface-2 hover:text-fg"
                >
                    <MenuItem
                      icon={<Pencil />}
                      onSelect={() => {
                        setEditing(item);
                      }}
                    >
                      {texts.common.edit}
                    </MenuItem>
                    <MenuItem
                      tone="danger"
                      icon={item.publishedAt === null ? <Trash2 /> : <Archive />}
                      onSelect={async () => {
                        const draft = item.publishedAt === null;
                        if (
                          await confirm({
                            title: draft ? t.deleteTitle : t.archiveTitle,
                            description: draft ? t.deleteBody : live ? t.archiveLiveBody : t.archiveBody,
                            confirmLabel: draft ? texts.common.remove : t.archive,
                          })
                        ) {
                          remove.mutate(item.id);
                        }
                      }}
                    >
                      {item.publishedAt === null ? texts.common.remove : t.archive}
                    </MenuItem>
                </Menu>
                )}
              </ListItem>
            );
          })}
        </List>
      )}
      {editing !== null && (
        <Editor
          key={editing === "new" ? "new" : editing.id}
          item={editing === "new" ? null : editing}
          onClose={() => {
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
