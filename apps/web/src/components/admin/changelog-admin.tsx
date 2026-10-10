"use client";

import type { ChangelogBody, ChangelogEntryDto, ChangelogKind } from "@ingressoimpresso/api-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { KindBadge } from "@/components/changelog/kind-badge";
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
  Switch,
  Textarea,
  errorMessage,
  useConfirm,
} from "@/components/ui";
import { api } from "@/lib/api";
import { CHANGELOG_KINDS, paragraphs } from "@/lib/changelog";
import { dateTime } from "@/lib/format";
import { APP_VERSION, isVersion } from "@/lib/version";
import { texts } from "@/texts/pt-BR";

const t = texts.changelog.admin;

function EntryEditor({ entry, open, onClose }: { entry: ChangelogEntryDto | null; open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<ChangelogKind>(entry?.kind ?? "new");
  const [title, setTitle] = useState(entry?.title ?? "");
  const [body, setBody] = useState(entry?.body ?? "");
  // A new note usually tells what the release now live brought (ADR 0049).
  const [version, setVersion] = useState(entry === null ? APP_VERSION : (entry.version ?? ""));
  const versionValid = version.trim() === "" || isVersion(version.trim());
  const [published, setPublished] = useState(entry === null ? true : entry.publishedAt !== null);
  const save = useMutation({
    mutationFn: () => {
      const payload: ChangelogBody = { kind, title: title.trim(), body: body.trim(), version: version.trim(), published };
      return entry === null
        ? api<ChangelogEntryDto>("/api/admin/changelog", { method: "POST", body: payload })
        : api<ChangelogEntryDto>(`/api/admin/changelog/${entry.id}`, { method: "PUT", body: payload });
    },
    onSuccess: () => {
      toast.success(t.saved);
      void queryClient.invalidateQueries({ queryKey: ["admin", "changelog"] });
      void queryClient.invalidateQueries({ queryKey: ["changelog"] });
      onClose();
    },
  });
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={entry === null ? t.new : t.edit}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {texts.common.cancel}
          </Button>
          <Button loading={save.isPending} disabled={title.trim() === "" || !versionValid} onClick={() => save.mutate()}>
            {texts.common.save}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-5 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (title.trim() !== "" && versionValid) {
            save.mutate();
          }
        }}
      >
        <div className="flex flex-col gap-4">
          <Field label={t.kind}>
            <Select
              value={kind}
              onChange={(event) => {
                setKind(event.target.value as ChangelogKind);
              }}
            >
              {CHANGELOG_KINDS.map((option) => (
                <option key={option} value={option}>
                  {texts.changelog.kinds[option]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t.version} optional hint={versionValid ? t.versionHint : <span className="text-danger-fg">{t.versionInvalid}</span>}>
            <Input
              value={version}
              maxLength={20}
              inputMode="decimal"
              placeholder={APP_VERSION}
              aria-invalid={!versionValid}
              className="tabular"
              onChange={(event) => {
                setVersion(event.target.value);
              }}
            />
          </Field>
          <Field label={t.titleLabel}>
            <Input
              value={title}
              maxLength={120}
              placeholder={t.titlePlaceholder}
              required
              onChange={(event) => {
                setTitle(event.target.value);
              }}
            />
          </Field>
          <Field label={t.body} hint={t.bodyHint}>
            <Textarea
              value={body}
              maxLength={4000}
              rows={8}
              onChange={(event) => {
                setBody(event.target.value);
              }}
            />
          </Field>
          <Switch checked={published} onChange={setPublished} label={t.published} description={t.publishedHint} />
          <ErrorMessage error={save.error} />
        </div>
        <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-border-strong bg-bg p-5">
          <span className="flex flex-wrap items-center gap-2">
            <KindBadge kind={kind} />
            {version.trim() !== "" && <span className="text-xs text-fg-subtle tabular">{texts.changelog.release(version.trim())}</span>}
          </span>
          <p className="text-lg font-semibold tracking-tight text-fg">{title.trim() === "" ? t.titlePlaceholder : title}</p>
          {paragraphs(body).map((paragraph, index) => (
            <p key={index} className="text-[15px] leading-relaxed whitespace-pre-line text-fg-muted">
              {paragraph}
            </p>
          ))}
        </div>
      </form>
    </Dialog>
  );
}

export function AdminChangelog() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const entries = useQuery({ queryKey: ["admin", "changelog"], queryFn: () => api<ChangelogEntryDto[]>("/api/admin/changelog") });
  const [editing, setEditing] = useState<ChangelogEntryDto | "new" | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => api<undefined>(`/api/admin/changelog/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success(t.deleted);
      void queryClient.invalidateQueries({ queryKey: ["admin", "changelog"] });
      void queryClient.invalidateQueries({ queryKey: ["changelog"] });
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
      {entries.isPending ? (
        <LoadingBlock rows={3} />
      ) : entries.isError ? (
        <ErrorMessage error={entries.error} />
      ) : entries.data.length === 0 ? (
        <EmptyState icon={Megaphone} title={t.empty} action={newButton} />
      ) : (
        <List>
          {entries.data.map((entry) => (
            <ListItem key={entry.id} className="justify-between">
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="flex flex-wrap items-center gap-2">
                  <KindBadge kind={entry.kind} />
                  {entry.version !== null && <span className="text-xs font-medium text-fg-muted tabular">v{entry.version}</span>}
                  {entry.publishedAt === null ? (
                    <Badge tone="warning">{t.draft}</Badge>
                  ) : (
                    <span className="text-xs text-fg-subtle">{t.publishedAt(dateTime(entry.publishedAt))}</span>
                  )}
                </span>
                <span className="font-semibold text-fg">{entry.title}</span>
                {entry.body !== "" && <span className="line-clamp-2 text-sm text-fg-muted">{entry.body}</span>}
              </div>
              <Menu
                label={texts.event.batches.moreActions}
                trigger={<MoreHorizontal className="size-4" aria-hidden />}
                triggerClassName="flex size-9 items-center justify-center rounded-lg text-fg-muted transition hover:bg-surface-2 hover:text-fg"
              >
                <MenuItem
                  icon={<Pencil />}
                  onSelect={() => {
                    setEditing(entry);
                  }}
                >
                  {texts.common.edit}
                </MenuItem>
                <MenuItem
                  tone="danger"
                  icon={<Trash2 />}
                  onSelect={async () => {
                    if (await confirm({ title: t.deleteTitle, description: t.deleteBody, confirmLabel: texts.common.remove })) {
                      remove.mutate(entry.id);
                    }
                  }}
                >
                  {texts.common.remove}
                </MenuItem>
              </Menu>
            </ListItem>
          ))}
        </List>
      )}
      <EntryEditor
        key={editing === null ? "closed" : editing === "new" ? "new" : editing.id}
        entry={editing === "new" || editing === null ? null : editing}
        open={editing !== null}
        onClose={() => {
          setEditing(null);
        }}
      />
    </div>
  );
}
