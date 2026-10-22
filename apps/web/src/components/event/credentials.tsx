"use client";

import type { CheckpointDto, CredentialBody, CredentialDto, CredentialsDto } from "@ingressoimpresso/api-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, IdCard, MoreHorizontal, Pencil, Plus, Printer, RotateCcw } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { useEventAccess, useEventTexts } from "@/components/event/access";
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  ErrorMessage,
  Field,
  Input,
  List,
  ListItem,
  LoadingBlock,
  Menu,
  MenuItem,
  Switch,
  buttonClass,
  errorMessage,
  useConfirm,
} from "@/components/ui";
import { api, fetchBlobUrl } from "@/lib/api";
import { cn } from "@/lib/cn";
import { CREDENTIAL_COLORS } from "@/lib/credentials";
import { shortDateTime } from "@/lib/format";
import { common as commonTexts } from "@/texts/pt-BR/common";

import { TabHeader } from "./tab-header";

/**
 * Credentials of the staff, the press and the artists (ADR 0111): badges with a QR that the door
 * lets through any day, at the entrance and in the checkpoints chosen, never as audience.
 */
export function CredentialsTab({ eventId }: { eventId: string }) {
  const t = useEventTexts().credentials;
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { can } = useEventAccess();
  const editable = can("door");
  const key = ["credentials", eventId];
  const credentials = useQuery({
    queryKey: key,
    queryFn: () => api<CredentialsDto>(`/api/events/${eventId}/credentials`),
  });
  const checkpoints = useQuery({
    queryKey: ["checkpoints", eventId],
    queryFn: () => api<CheckpointDto[]>(`/api/events/${eventId}/checkpoints`),
  });
  const [form, setForm] = useState<CredentialDto | "new" | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });
  const print = useMutation({
    mutationFn: (ids: readonly string[] | null) =>
      fetchBlobUrl(`/api/events/${eventId}/credentials/badges${ids === null ? "" : `?ids=${ids.join(",")}`}`),
    onSuccess: (url) => {
      const link = document.createElement("a");
      link.href = url;
      link.download = t.file;
      link.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 60_000);
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
  const toggle = useMutation({
    mutationFn: ({ id, revoke }: { id: string; revoke: boolean }) =>
      api<CredentialDto>(`/api/credentials/${id}/${revoke ? "revoke" : "restore"}`, { method: "POST" }),
    onSuccess: (credential) => {
      toast.success(credential.revokedAt === null ? t.restoredToast : t.revokedToast);
      void refresh();
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });

  if (credentials.isPending) {
    return <LoadingBlock rows={3} />;
  }
  if (credentials.isError) {
    return <ErrorMessage error={credentials.error} onRetry={() => void credentials.refetch()} />;
  }
  const list = credentials.data.credentials;
  const full = list.length >= credentials.data.limit;
  const areaNames = new Map((checkpoints.data ?? []).map((checkpoint) => [checkpoint.id, checkpoint.name]));
  const areas = (credential: CredentialDto) => {
    const names = [...(credential.entrance ? [t.entrance] : []), ...credential.checkpointIds.flatMap((id) => areaNames.get(id) ?? [])];
    return names.length === 0 ? t.noAreas : names.join(" · ");
  };
  const addButton = (
    <Button
      icon={<Plus />}
      disabled={full}
      onClick={() => {
        setForm("new");
      }}
    >
      {t.add}
    </Button>
  );

  return (
    <div className="flex flex-col gap-6">
      <TabHeader
        tab="credentials"
        help={t.intro}
        actions={
          <>
            {editable && list.length > 0 && addButton}
            {list.some((credential) => credential.revokedAt === null) && (
              <Button
                variant="secondary"
                icon={<Printer />}
                loading={print.isPending && print.variables === null}
                onClick={() => {
                  print.mutate(null);
                }}
              >
                {t.print}
              </Button>
            )}
          </>
        }
      />
      {list.length === 0 ? (
        <EmptyState icon={IdCard} title={t.empty} description={t.emptyHint} action={editable ? addButton : undefined} />
      ) : (
        <>
          <p className="text-sm text-fg-muted" title={t.limitHint}>
            {t.count(list.length, credentials.data.limit)}
          </p>
          <List>
            {list.map((credential) => {
              const revoked = credential.revokedAt !== null;
              return (
                <ListItem key={credential.id} className={cn("flex-nowrap items-start", revoked && "opacity-60")}>
                  <span className="mt-1 h-10 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: credential.color }} aria-hidden />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-fg">{credential.name}</span>
                      <Badge tone="neutral">{credential.role}</Badge>
                      {revoked && <Badge tone="danger">{t.revoked}</Badge>}
                    </span>
                    {credential.organization !== null && <span className="text-sm text-fg-muted">{credential.organization}</span>}
                    <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-fg-subtle">
                      <span className="font-mono font-semibold text-fg-muted">{credential.code}</span>
                      <span>{areas(credential)}</span>
                      <span>
                        {credential.reads === 0
                          ? t.never
                          : `${t.reads(credential.reads)}${credential.lastReadAt === null ? "" : ` · ${shortDateTime(credential.lastReadAt)}`}`}
                      </span>
                    </span>
                  </div>
                  <Menu label={t.menu(credential.name)} trigger={<MoreHorizontal />} triggerClassName={buttonClass({ variant: "ghost", size: "icon-sm" })}>
                    {!revoked && (
                      <MenuItem
                        icon={<Printer />}
                        onSelect={() => {
                          print.mutate([credential.id]);
                        }}
                      >
                        {t.printOne}
                      </MenuItem>
                    )}
                    {editable && (
                      <MenuItem
                        icon={<Pencil />}
                        onSelect={() => {
                          setForm(credential);
                        }}
                      >
                        {t.edit}
                      </MenuItem>
                    )}
                    {editable &&
                      (revoked ? (
                        <MenuItem
                          icon={<RotateCcw />}
                          onSelect={() => {
                            toggle.mutate({ id: credential.id, revoke: false });
                          }}
                        >
                          {t.restore}
                        </MenuItem>
                      ) : (
                        <MenuItem
                          icon={<Ban />}
                          tone="danger"
                          onSelect={() => {
                            void confirm({ title: t.revokeTitle(credential.name), description: t.revokeBody, confirmLabel: t.revoke }).then((ok) => {
                              if (ok) {
                                toggle.mutate({ id: credential.id, revoke: true });
                              }
                            });
                          }}
                        >
                          {t.revoke}
                        </MenuItem>
                      ))}
                  </Menu>
                </ListItem>
              );
            })}
          </List>
        </>
      )}
      {form !== null && (
        <CredentialDialog
          key={form === "new" ? "new" : form.id}
          eventId={eventId}
          credential={form === "new" ? null : form}
          checkpoints={checkpoints.data ?? []}
          onClose={() => {
            setForm(null);
          }}
          onSaved={() => {
            setForm(null);
            void refresh();
          }}
        />
      )}
    </div>
  );
}

/** Create or edit a credential: who, what they do, the colour of the band and where they go. */
function CredentialDialog({
  eventId,
  credential,
  checkpoints,
  onClose,
  onSaved,
}: {
  eventId: string;
  credential: CredentialDto | null;
  checkpoints: readonly CheckpointDto[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useEventTexts().credentials;
  const [name, setName] = useState(credential?.name ?? "");
  const [role, setRole] = useState(credential?.role ?? "");
  const [organization, setOrganization] = useState(credential?.organization ?? "");
  const [color, setColor] = useState(credential?.color ?? CREDENTIAL_COLORS[0]);
  const [entrance, setEntrance] = useState(credential?.entrance ?? true);
  const [chosen, setChosen] = useState<string[]>(credential?.checkpointIds ?? []);
  const save = useMutation({
    mutationFn: () => {
      const body: CredentialBody = {
        name: name.trim(),
        role: role.trim(),
        organization: organization.trim() === "" ? null : organization.trim(),
        color,
        entrance,
        checkpointIds: chosen,
      };
      return credential === null
        ? api<CredentialDto>(`/api/events/${eventId}/credentials`, { method: "POST", body })
        : api<CredentialDto>(`/api/credentials/${credential.id}`, { method: "PUT", body });
    },
    onSuccess: () => {
      toast.success(credential === null ? t.created : t.saved);
      onSaved();
    },
  });
  const valid = name.trim() !== "" && role.trim() !== "" && (entrance || chosen.length > 0);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (valid) {
      save.mutate();
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={credential === null ? t.newTitle : t.editTitle(credential.code)}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {commonTexts.cancel}
          </Button>
          <Button type="submit" form="credential-form" loading={save.isPending} disabled={!valid}>
            {commonTexts.save}
          </Button>
        </>
      }
    >
      <form id="credential-form" onSubmit={submit} className="flex flex-col gap-5">
        <Field label={t.name}>
          <Input
            value={name}
            maxLength={80}
            required
            autoFocus
            placeholder={t.namePlaceholder}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
        </Field>
        <div className="flex flex-col gap-2">
          <Field label={t.role}>
            <Input
              value={role}
              maxLength={30}
              required
              placeholder={t.rolePlaceholder}
              onChange={(event) => {
                setRole(event.target.value);
              }}
            />
          </Field>
          <div className="flex flex-wrap gap-1.5">
            {t.roleExamples.map((example) => (
              <button
                key={example}
                type="button"
                aria-pressed={role === example}
                onClick={() => {
                  setRole(example);
                }}
                className={cn(
                  "relative rounded-full border px-3 py-1 text-xs transition touch-target active:bg-surface-3",
                  role === example ? "border-brand bg-brand-soft text-brand-soft-fg" : "border-border text-fg-muted hover:bg-surface-2 hover:text-fg",
                )}
              >
                {example}
              </button>
            ))}
          </div>
        </div>
        <Field label={t.organization} optional>
          <Input
            value={organization}
            maxLength={60}
            onChange={(event) => {
              setOrganization(event.target.value);
            }}
          />
        </Field>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium text-fg">{t.color}</legend>
          <div className="flex flex-wrap gap-2">
            {CREDENTIAL_COLORS.map((option) => (
              <button
                key={option}
                type="button"
                aria-label={option}
                aria-pressed={color === option}
                onClick={() => {
                  setColor(option);
                }}
                className={cn(
                  "relative size-9 rounded-full ring-offset-2 ring-offset-surface transition touch-target pointer-coarse:size-11",
                  color === option ? "ring-2 ring-brand" : "ring-1 ring-black/10",
                )}
                style={{ backgroundColor: option }}
              />
            ))}
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-sm font-medium text-fg">{t.areas}</legend>
          <Switch checked={entrance} onChange={setEntrance} label={t.entranceSwitch} />
          {checkpoints.length === 0 ? (
            <p className="text-xs leading-relaxed text-fg-muted">{t.noCheckpoints}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {checkpoints.map((checkpoint) => {
                const on = chosen.includes(checkpoint.id);
                return (
                  <button
                    key={checkpoint.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      setChosen(on ? chosen.filter((id) => id !== checkpoint.id) : [...chosen, checkpoint.id]);
                    }}
                    className={cn(
                      "inline-flex min-h-9 items-center rounded-full border px-3 text-sm font-medium transition pointer-coarse:min-h-11",
                      on
                        ? "border-brand bg-brand-soft text-brand-soft-fg"
                        : "border-border bg-surface text-fg-muted hover:border-border-strong hover:text-fg active:bg-surface-2",
                    )}
                  >
                    {checkpoint.name}
                  </button>
                );
              })}
            </div>
          )}
          <p className="text-xs leading-relaxed text-fg-muted">{t.areasHint}</p>
        </fieldset>
        <ErrorMessage error={save.error} />
      </form>
    </Dialog>
  );
}
