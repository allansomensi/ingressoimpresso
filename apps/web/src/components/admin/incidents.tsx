"use client";

import type { IncidentBody, IncidentDto, IncidentImpact, IncidentKind, IncidentStatus } from "@ingressoimpresso/api-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, ExternalLink, MessageSquarePlus, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  Badge,
  Button,
  ButtonLink,
  Card,
  Dialog,
  EmptyState,
  ErrorMessage,
  Field,
  Input,
  Lead,
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
import { fromLocalInput, localInputIn, toLocalInput } from "@/lib/local-time";
import { texts } from "@/texts/pt-BR";

const t = texts.admin.incidents;
const s = texts.status;
export const COMPONENTS = ["site", "panel", "door", "files", "email", "payments"] as const;
const IMPACTS: readonly IncidentImpact[] = ["none", "minor", "major", "critical"];
const STATUSES: readonly IncidentStatus[] = ["scheduled", "investigating", "identified", "monitoring", "resolved"];
export const IMPACT_TONE: Record<IncidentImpact, Tone> = { none: "neutral", minor: "warning", major: "warning", critical: "danger" };

function componentLabel(key: string): string {
  const labels: Readonly<Record<string, string>> = s.components;
  return labels[key] ?? key;
}

function Editor({ incident, onClose }: { incident: IncidentDto | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<IncidentKind>(incident?.kind ?? "incident");
  const [title, setTitle] = useState(incident?.title ?? "");
  const [impact, setImpact] = useState<IncidentImpact>(incident?.impact ?? "minor");
  const [components, setComponents] = useState<readonly string[]>(incident?.components ?? ["panel"]);
  const [scheduledFor, setScheduledFor] = useState(incident === null ? localInputIn(1, 2) : toLocalInput(incident.scheduledFor));
  const [scheduledUntil, setScheduledUntil] = useState(incident === null ? localInputIn(1, 3) : toLocalInput(incident.scheduledUntil));
  const [message, setMessage] = useState("");
  const save = useMutation({
    mutationFn: () => {
      const body: IncidentBody = {
        kind,
        title: title.trim(),
        impact,
        components: [...components],
        scheduledFor: kind === "maintenance" ? fromLocalInput(scheduledFor) : null,
        scheduledUntil: kind === "maintenance" ? fromLocalInput(scheduledUntil) : null,
        message: incident === null ? message.trim() : null,
        status: null,
      };
      return incident === null
        ? api<IncidentDto>("/api/admin/incidents", { method: "POST", body })
        : api<IncidentDto>(`/api/admin/incidents/${incident.id}`, { method: "PUT", body });
    },
    onSuccess: () => {
      toast.success(t.saved);
      void queryClient.invalidateQueries({ queryKey: ["admin", "incidents"] });
      onClose();
    },
  });
  const valid = title.trim().length >= 3 && (incident !== null || message.trim() !== "");
  return (
    <Dialog
      open
      onClose={onClose}
      title={incident === null ? t.new : t.edit}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {texts.common.cancel}
          </Button>
          <Button loading={save.isPending} disabled={!valid} onClick={() => save.mutate()}>
            {incident === null ? t.publish : texts.common.save}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div role="radiogroup" aria-label={t.kind} className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
          {(["incident", "maintenance"] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={kind === option}
              onClick={() => {
                setKind(option);
                if (option === "maintenance") {
                  setImpact("none");
                }
              }}
              className={cn("rounded-lg py-2 text-sm font-medium transition", kind === option ? "bg-surface text-fg shadow-xs" : "text-fg-muted")}
            >
              {t.kinds[option]}
            </button>
          ))}
        </div>
        <Field label={t.titleLabel}>
          <Input
            value={title}
            maxLength={120}
            placeholder={kind === "incident" ? t.titleIncident : t.titleMaintenance}
            onChange={(event) => {
              setTitle(event.target.value);
            }}
          />
        </Field>
        <Field label={t.impact}>
          <Select
            value={impact}
            onChange={(event) => {
              setImpact(event.target.value as IncidentImpact);
            }}
          >
            {IMPACTS.map((option) => (
              <option key={option} value={option}>
                {s.impacts[option]}
              </option>
            ))}
          </Select>
        </Field>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium text-fg">{t.components}</legend>
          <div className="flex flex-wrap gap-2">
            {COMPONENTS.map((key) => {
              const on = components.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setComponents(on ? components.filter((item) => item !== key) : [...components, key]);
                  }}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm font-medium transition",
                    on ? "border-brand bg-brand-soft text-brand-soft-fg" : "border-border text-fg-muted hover:border-border-strong",
                  )}
                >
                  {componentLabel(key)}
                </button>
              );
            })}
          </div>
        </fieldset>
        {kind === "maintenance" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.scheduledFor}>
              <Input
                type="datetime-local"
                value={scheduledFor}
                onChange={(event) => {
                  setScheduledFor(event.target.value);
                }}
              />
            </Field>
            <Field label={t.scheduledUntil}>
              <Input
                type="datetime-local"
                value={scheduledUntil}
                onChange={(event) => {
                  setScheduledUntil(event.target.value);
                }}
              />
            </Field>
          </div>
        )}
        {incident === null && (
          <Field label={t.firstMessage} hint={t.firstMessageHint}>
            <Textarea
              value={message}
              maxLength={2000}
              rows={3}
              placeholder={kind === "incident" ? t.messageIncident : t.messageMaintenance}
              onChange={(event) => {
                setMessage(event.target.value);
              }}
            />
          </Field>
        )}
        <ErrorMessage error={save.error} />
      </div>
    </Dialog>
  );
}

function UpdateDialog({ incident, onClose }: { incident: IncidentDto; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<IncidentStatus>(incident.status === "scheduled" ? "investigating" : incident.status);
  const [body, setBody] = useState("");
  const post = useMutation({
    mutationFn: () => api<IncidentDto>(`/api/admin/incidents/${incident.id}/updates`, { method: "POST", body: { status, body: body.trim() } }),
    onSuccess: () => {
      toast.success(t.updatePosted);
      void queryClient.invalidateQueries({ queryKey: ["admin", "incidents"] });
      onClose();
    },
  });
  return (
    <Dialog
      open
      onClose={onClose}
      title={t.postUpdate}
      description={incident.title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {texts.common.cancel}
          </Button>
          <Button loading={post.isPending} disabled={body.trim() === ""} onClick={() => post.mutate()}>
            {t.post}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t.status}>
          <Select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as IncidentStatus);
            }}
          >
            {STATUSES.map((option) => (
              <option key={option} value={option}>
                {s.incidentStatuses[option]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t.message}>
          <Textarea
            value={body}
            maxLength={2000}
            rows={4}
            onChange={(event) => {
              setBody(event.target.value);
            }}
          />
        </Field>
        <ErrorMessage error={post.error} />
      </div>
    </Dialog>
  );
}

/** Incidents and planned maintenance shown on /status (ADR 0043). */
export function AdminIncidents() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const list = useQuery({ queryKey: ["admin", "incidents"], queryFn: () => api<IncidentDto[]>("/api/admin/incidents") });
  const [editing, setEditing] = useState<IncidentDto | "new" | null>(null);
  const [updating, setUpdating] = useState<IncidentDto | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => api<undefined>(`/api/admin/incidents/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success(t.removed);
      void queryClient.invalidateQueries({ queryKey: ["admin", "incidents"] });
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
        <div className="flex gap-2">
          <ButtonLink href="/status" target="_blank" variant="secondary" icon={<ExternalLink />}>
            {t.openPage}
          </ButtonLink>
          {newButton}
        </div>
      </div>
      {list.isPending ? (
        <LoadingBlock rows={2} />
      ) : list.isError ? (
        <ErrorMessage error={list.error} />
      ) : list.data.length === 0 ? (
        <EmptyState icon={Activity} title={t.empty} description={t.emptyHint} action={newButton} />
      ) : (
        <div className="flex flex-col gap-3">
          {list.data.map((incident) => (
            <Card key={incident.id} className={cn(incident.resolvedAt === null && "border-warning/40")}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-fg">{incident.title}</span>
                    <Badge tone={incident.resolvedAt === null ? "warning" : "success"} dot={incident.resolvedAt === null} pulse={incident.resolvedAt === null}>
                      {s.incidentStatuses[incident.status]}
                    </Badge>
                    <Badge tone={IMPACT_TONE[incident.impact]}>{incident.kind === "maintenance" ? t.kinds.maintenance : s.impacts[incident.impact]}</Badge>
                  </span>
                  <span className="flex flex-wrap gap-1">
                    {incident.components.map((key) => (
                      <span key={key} className="rounded-md bg-surface-2 px-1.5 py-0.5 text-xs text-fg-muted">
                        {componentLabel(key)}
                      </span>
                    ))}
                  </span>
                </div>
                <Menu
                  label={texts.event.batches.moreActions}
                  trigger={<MoreHorizontal className="size-4" aria-hidden />}
                  triggerClassName="flex size-9 items-center justify-center rounded-lg text-fg-muted transition hover:bg-surface-2 hover:text-fg"
                >
                  <MenuItem
                    icon={<MessageSquarePlus />}
                    onSelect={() => {
                      setUpdating(incident);
                    }}
                  >
                    {t.postUpdate}
                  </MenuItem>
                  <MenuItem
                    icon={<Pencil />}
                    onSelect={() => {
                      setEditing(incident);
                    }}
                  >
                    {texts.common.edit}
                  </MenuItem>
                  <MenuItem
                    tone="danger"
                    icon={<Trash2 />}
                    onSelect={async () => {
                      if (await confirm({ title: t.deleteTitle, description: t.deleteBody, confirmLabel: texts.common.remove })) {
                        remove.mutate(incident.id);
                      }
                    }}
                  >
                    {texts.common.remove}
                  </MenuItem>
                </Menu>
              </div>
              <ol className="mt-4 flex flex-col gap-3 border-l-2 border-border pl-4">
                {incident.updates.map((update) => (
                  <li key={update.id} className="flex flex-col gap-0.5">
                    <span className="text-xs font-semibold text-fg">
                      {s.incidentStatuses[update.status]} <span className="font-normal text-fg-subtle">· {shortDateTime(update.createdAt)}</span>
                    </span>
                    <span className="text-sm whitespace-pre-line text-fg-muted">{update.body}</span>
                  </li>
                ))}
              </ol>
            </Card>
          ))}
        </div>
      )}
      {editing !== null && (
        <Editor
          key={editing === "new" ? "new" : editing.id}
          incident={editing === "new" ? null : editing}
          onClose={() => {
            setEditing(null);
          }}
        />
      )}
      {updating !== null && (
        <UpdateDialog
          incident={updating}
          onClose={() => {
            setUpdating(null);
          }}
        />
      )}
    </div>
  );
}
