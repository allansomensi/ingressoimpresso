"use client";

import type {
  CategoryDto,
  CheckpointDto,
  CreateDoorAccessBody,
  CreatedDoorAccess,
  DoorAccessCategoriesBody,
  DoorAccessDto,
  DoorDeviceDto,
  DoorOverviewDto,
  CapacityBody,
  DoorSettingsBody,
  EventDayDto,
  EventKind,
} from "@ingressoimpresso/api-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  Check,
  ChevronDown,
  ClipboardCheck,
  Copy,
  Download,
  Link2,
  Link2Off,
  LogIn,
  LogOut,
  MessageCircle,
  MoreHorizontal,
  Plus,
  QrCode as QrCodeIcon,
  Smartphone,
  Tags,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { QrCode } from "@/components/qr";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Dialog,
  ErrorMessage,
  Field,
  Input,
  LoadingBlock,
  Menu,
  MenuItem,
  NumberInput,
  Stat,
  Switch,
  buttonClass,
  errorMessage,
  useConfirm,
} from "@/components/ui";
import { api, fetchBlobUrl } from "@/lib/api";
import { cn } from "@/lib/cn";
import { shortDateTime } from "@/lib/format";
import { useEventAccess, useEventTexts } from "@/components/event/access";
import { CheckpointsCard } from "@/components/event/checkpoints";
import { common as commonTexts } from "@/texts/pt-BR/common";

import { useLivePolling } from "./live-polling";
import { TabHeader } from "./tab-header";

/** A phone that synced this recently is shown as online (it syncs every few seconds). */
const ONLINE_MS = 60_000;

/** The door link: the token stays in the fragment, never sent to any server (ADR 0007). */
function doorUrl(token: string): string {
  return `${window.location.origin}/portaria#acesso=${token}`;
}

function accessState(access: DoorAccessDto, now: number): "active" | "expired" | "revoked" {
  if (access.revokedAt !== null) {
    return "revoked";
  }
  return Date.parse(access.expiresAt) <= now ? "expired" : "active";
}

/**
 * A link for the people at one door: its name and, if the event has them, the categories it lets
 * in; or a link of a checkpoint (ADR 0092), whose rules are the checkpoint's.
 */
function NewLinkDialog({
  eventId,
  open,
  categories,
  checkpoints,
  initialCheckpoint,
  onClose,
  onCreated,
}: {
  eventId: string;
  open: boolean;
  categories: CategoryDto[];
  checkpoints: readonly CheckpointDto[];
  /** Opened from a checkpoint: its link. */
  initialCheckpoint: CheckpointDto | null;
  onClose: () => void;
  onCreated: (result: CreatedDoorAccess) => void;
}) {
  const t = useEventTexts().door;
  const [checkpointId, setCheckpointId] = useState<string | null>(initialCheckpoint?.id ?? null);
  const [label, setLabel] = useState<string>(initialCheckpoint?.name ?? t.defaultLabel);
  const [chosen, setChosen] = useState<string[]>([]);
  const create = useMutation({
    mutationFn: () => {
      const body: CreateDoorAccessBody =
        checkpointId === null ? { label: label.trim(), categoryIds: chosen } : { label: label.trim(), categoryIds: [], checkpointId };
      return api<CreatedDoorAccess>(`/api/events/${eventId}/door/accesses`, { method: "POST", body });
    },
    onSuccess: (result) => {
      onCreated(result);
      setChosen([]);
      onClose();
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate();
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t.newLink}
      description={t.newLinkHint}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {commonTexts.cancel}
          </Button>
          <Button type="submit" form="new-door-link-form" icon={<Plus />} loading={create.isPending} disabled={label.trim() === ""}>
            {t.create}
          </Button>
        </>
      }
    >
      <form id="new-door-link-form" onSubmit={submit} className="flex flex-col gap-4">
        {checkpoints.length > 0 && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium text-fg">{t.linkFor}</legend>
            {[null, ...checkpoints].map((checkpoint) => {
              const id = checkpoint?.id ?? null;
              const selected = checkpointId === id;
              return (
                <label
                  key={id ?? "entrance"}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand",
                    selected ? "border-brand bg-brand-soft/60 text-fg" : "border-border text-fg-muted hover:border-border-strong",
                  )}
                >
                  <input
                    type="radio"
                    name="door-link-for"
                    className="mt-0.5 size-4 accent-brand"
                    checked={selected}
                    onChange={() => {
                      // The name follows the choice until it is typed by hand.
                      const names = [t.defaultLabel, ...checkpoints.map((item) => item.name)];
                      if (names.includes(label.trim())) {
                        setLabel(checkpoint?.name ?? t.defaultLabel);
                      }
                      setCheckpointId(id);
                    }}
                  />
                  <span className="flex flex-col gap-0.5">
                    <span className="font-medium text-fg">{checkpoint === null ? t.linkEntrance : checkpoint.name}</span>
                    <span className="text-xs leading-relaxed">{checkpoint === null ? t.linkEntranceHint : t.linkCheckpointHint(checkpoint.name)}</span>
                  </span>
                </label>
              );
            })}
          </fieldset>
        )}
        <Field label={t.label}>
          <Input
            value={label}
            maxLength={60}
            data-autofocus
            onChange={(e) => {
              setLabel(e.target.value);
            }}
          />
        </Field>
        {checkpointId !== null && <p className="text-xs leading-relaxed text-fg-muted">{t.checkpointLinkHint}</p>}
        {categories.length > 0 && checkpointId === null && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium text-fg">{t.categories}</legend>
            <CategoryChips categories={categories} chosen={chosen} onChange={setChosen} />
            <p className="text-xs leading-relaxed text-fg-muted">{t.categoriesHint}</p>
          </fieldset>
        )}
        <ErrorMessage error={create.error} />
      </form>
    </Dialog>
  );
}

export function DoorTab({ eventId, kind = "tickets", days = [] }: { eventId: string; kind?: EventKind; days?: readonly EventDayDto[] }) {
  const t = useEventTexts().door;
  const { can } = useEventAccess();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const key = ["door", eventId];
  const overview = useQuery({
    queryKey: key,
    queryFn: () => api<DoorOverviewDto>(`/api/events/${eventId}/door`),
    // Last contact of each phone changes while the door is working.
    refetchInterval: useLivePolling(eventId, 15_000),
  });
  const categories = useQuery({
    queryKey: ["categories", eventId],
    queryFn: () => api<CategoryDto[]>(`/api/events/${eventId}/categories`),
  });
  // The new link dialog, opened for the entrance or for a checkpoint (ADR 0092).
  const [creating, setCreating] = useState<{ checkpoint: CheckpointDto | null } | null>(null);
  const [editing, setEditing] = useState<DoorAccessDto | null>(null);
  const [created, setCreated] = useState<{ url: string; label: string; renewed: boolean } | null>(null);
  const createdRef = useRef<HTMLDivElement | null>(null);
  const [copied, setCopied] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });
  const onError = (error: unknown) => {
    toast.error(errorMessage(error));
  };

  // Only the hash of a link is stored (ADR 0007): showing it again means issuing a new one.
  const renewLink = useMutation({
    mutationFn: (id: string) => api<CreatedDoorAccess>(`/api/door-accesses/${id}/link`, { method: "POST" }),
    onSuccess: (result) => {
      setCreated({ url: doorUrl(result.token), label: result.access.label, renewed: true });
      setCopied(false);
      void refresh();
    },
    onError,
  });
  // The link card opens above the lists: bring it into view when asked from a row below.
  useEffect(() => {
    if (created !== null) {
      createdRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [created]);
  const saveCategories = useMutation({
    mutationFn: ({ id, categoryIds }: { id: string; categoryIds: string[] }) => {
      const body: DoorAccessCategoriesBody = { categoryIds };
      return api<DoorAccessDto>(`/api/door-accesses/${id}/categories`, { method: "PUT", body });
    },
    onSuccess: () => {
      toast.success(t.categoriesSaved);
      setEditing(null);
      void refresh();
    },
    onError,
  });
  const revokeAccess = useMutation({
    mutationFn: (id: string) => api<DoorAccessDto>(`/api/door-accesses/${id}/revoke`, { method: "POST" }),
    onSuccess: () => {
      toast.success(t.revokedToast);
      void refresh();
    },
    onError,
  });
  // Exit and return (ADR 0083): the phones pick the change up on their next sync.
  const reentry = useMutation({
    mutationFn: (allowed: boolean) => {
      const body: DoorSettingsBody = { reentry: allowed };
      return api<DoorOverviewDto>(`/api/events/${eventId}/door-settings`, { method: "PUT", body });
    },
    onSuccess: (data) => {
      queryClient.setQueryData(key, data);
      toast.success(data.reentry ? t.reentryOn : t.reentryOff);
      void queryClient.invalidateQueries({ queryKey: ["door-live", eventId] });
    },
    onError,
  });
  const revokeDevice = useMutation({
    mutationFn: (id: string) => api<DoorDeviceDto>(`/api/door-devices/${id}/revoke`, { method: "POST" }),
    onSuccess: () => {
      toast.success(t.disconnectedToast);
      void refresh();
    },
    onError,
  });

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success(t.copied);
    } catch {
      setCopied(false);
      toast.error(t.copyFailed);
    }
  };

  if (overview.isPending) {
    return <LoadingBlock rows={2} />;
  }
  if (overview.isError) {
    return <ErrorMessage error={overview.error} onRetry={() => void overview.refetch()} />;
  }
  // Expiry and "online" are judged at the time of the last fetch (rendering stays pure).
  const now = overview.dataUpdatedAt;
  const labels = new Map(overview.data.accesses.map((access) => [access.id, access.label]));
  const online = (device: DoorDeviceDto) =>
    device.revokedAt === null && device.lastSeenAt !== null && now - Date.parse(device.lastSeenAt) < ONLINE_MS;
  const activeLinks = overview.data.accesses.filter((access) => accessState(access, now) === "active").length;
  const eventCategories = categories.data ?? [];
  // Checkpoints (ADR 0092); servers before them send none.
  const checkpoints = (overview.data.checkpoints as CheckpointDto[] | undefined) ?? [];
  const checkpointNames = new Map(checkpoints.map((checkpoint) => [checkpoint.id, checkpoint.name]));

  return (
    <div className="flex flex-col gap-6">
      <TabHeader
        tab="door"
        help={t.intro}
        actions={
          <Button
            icon={<Plus />}
            onClick={() => {
              setCreating({ checkpoint: null });
            }}
          >
            {t.newLink}
          </Button>
        }
      />
      <NewLinkDialog
        key={creating?.checkpoint?.id ?? "entrance"}
        eventId={eventId}
        open={creating !== null}
        categories={eventCategories}
        checkpoints={checkpoints}
        initialCheckpoint={creating?.checkpoint ?? null}
        onClose={() => {
          setCreating(null);
        }}
        onCreated={(result) => {
          setCreated({ url: doorUrl(result.token), label: result.access.label, renewed: false });
          setCopied(false);
          void refresh();
        }}
      />
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <Stat
          label={t.entriesLabel}
          value={overview.data.entryCount.toLocaleString("pt-BR")}
          hint={t.entries(overview.data.entryCount)}
          icon={LogIn}
          tone="success"
        />
        <Stat label={t.devicesOnline} value={overview.data.devices.filter(online).length} icon={Smartphone} />
        <Stat label={t.linksActive} value={activeLinks} icon={Link2} />
      </div>

      {created !== null && (
        <div ref={createdRef} className="scroll-mt-12">
          <Card className="border-brand/40 ring-4 ring-brand/10 animate-pop">
            <div className="flex flex-col gap-6 md:flex-row md:items-center">
              <div className="flex flex-col items-center gap-2">
                <div className="rounded-2xl border border-border bg-white p-3 shadow-sm">
                  <QrCode text={created.url} size={184} label={t.qrLabel} className="bg-white" />
                </div>
                <span className="text-xs text-fg-muted">{t.qrHint}</span>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-lg font-semibold tracking-tight text-fg">{created.renewed ? t.newLinkTitle(created.label) : t.createdTitle(created.label)}</h3>
                  <Button variant="ghost" size="icon" aria-label={t.hide} onClick={() => { setCreated(null); }}>
                    <X />
                  </Button>
                </div>
                <p className="text-sm leading-relaxed text-warning-fg">{t.createdHint}</p>
                <code className="rounded-xl border border-border bg-surface-2 p-3 font-mono text-xs break-all text-fg-muted">{created.url}</code>
                <div className="flex flex-wrap gap-2">
                  <Button icon={copied ? <Check /> : <Copy />} onClick={() => { void copy(created.url); }}>
                    {copied ? t.copied : t.copy}
                  </Button>
                  <a
                    className={buttonClass({ variant: "secondary" })}
                    href={`https://wa.me/?text=${encodeURIComponent(`${t.whatsappMessage}\n${created.url}`)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MessageCircle />
                    {t.whatsapp}
                  </a>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={t.links} icon={Link2} />
          {overview.data.accesses.length === 0 ? (
            <p className="text-sm text-fg-subtle">{t.noLinks}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {overview.data.accesses.map((access) => {
                const state = accessState(access, now);
                return (
                  <li key={access.id} className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 py-3", state !== "active" && "opacity-60")}>
                    <span className="flex min-w-0 flex-1 basis-48 flex-col gap-1">
                      <span className="truncate text-sm font-medium text-fg">{access.label}</span>
                      <span className="text-xs text-fg-muted">
                        {state === "active" ? t.activeUntil(shortDateTime(access.expiresAt)) : state === "expired" ? t.expired : t.revoked}
                      </span>
                      {access.checkpointId !== null ? (
                        <span className="flex">
                          <Badge tone="brand">
                            <BadgeCheck className="size-3.5" aria-hidden />
                            {t.checkpointBadge(checkpointNames.get(access.checkpointId) ?? "")}
                          </Badge>
                        </span>
                      ) : eventCategories.length > 0 && (
                        <span className="flex flex-wrap gap-1">
                          {access.categoryIds.length === 0 ? (
                            <span className="text-xs text-fg-subtle">{t.allCategories}</span>
                          ) : (
                            eventCategories.filter((category) => access.categoryIds.includes(category.id)).map((category) => {
                              const id = category.id;
                              return (
                                <span key={id} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-xs font-medium text-fg">
                                  <span className="size-2 rounded-full" style={{ backgroundColor: category.color }} aria-hidden />
                                  {category.name}
                                </span>
                              );
                            })
                          )}
                        </span>
                      )}
                    </span>
                    {state === "active" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<QrCodeIcon />}
                        loading={renewLink.isPending && renewLink.variables === access.id}
                        onClick={() => {
                          void confirm({
                            title: t.showLinkConfirmTitle(access.label),
                            description: t.showLinkConfirmBody,
                            confirmLabel: t.showLinkConfirm,
                          }).then((ok) => {
                            if (ok) {
                              renewLink.mutate(access.id);
                            }
                          });
                        }}
                      >
                        {t.showLink}
                      </Button>
                    )}
                    {/* The rarer actions wait in a menu: the row keeps to the name and the link. */}
                    {state === "active" ? (
                      <Menu label={t.linkMenu(access.label)} trigger={<MoreHorizontal />} triggerClassName={buttonClass({ variant: "ghost", size: "icon-sm" })}>
                        {eventCategories.length > 0 && access.checkpointId === null && (
                          <MenuItem
                            icon={<Tags />}
                            onSelect={() => {
                              setEditing(access);
                            }}
                          >
                            {t.editCategories}
                          </MenuItem>
                        )}
                        <MenuItem
                          icon={<Link2Off />}
                          tone="danger"
                          onSelect={() => {
                            void confirm({
                              title: t.revokeLinkConfirmTitle(access.label),
                              description: t.revokeLinkConfirmBody,
                              confirmLabel: t.revokeLink,
                            }).then((ok) => {
                              if (ok) {
                                revokeAccess.mutate(access.id);
                              }
                            });
                          }}
                        >
                          {t.revokeLink}
                        </MenuItem>
                      </Menu>
                    ) : (
                      <Badge>{state === "expired" ? t.expired : t.revoked}</Badge>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title={t.devices} icon={Smartphone} />
          {overview.data.devices.length === 0 ? (
            <p className="text-sm text-fg-subtle">{t.noDevices}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {overview.data.devices.map((device) => {
                const isOnline = online(device);
                const revoked = device.revokedAt !== null;
                return (
                  <li key={device.id} className={cn("flex items-center gap-3 py-3", revoked && "opacity-55")}>
                    <span className="relative flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-fg-muted">
                      <Smartphone className="size-4" aria-hidden />
                      {isOnline && <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-success ring-2 ring-surface" />}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium text-fg">{device.name}</span>
                      {/* The status first (what matters on the day), and the line wraps instead of cutting it. */}
                      <span className="text-xs text-fg-muted">
                        <span className={cn(isOnline && !revoked && "font-medium text-success-fg")}>
                          {revoked
                            ? t.disconnected
                            : isOnline
                              ? t.online
                              : device.lastSeenAt === null
                                ? t.neverSeen
                                : t.lastSeen(shortDateTime(device.lastSeenAt))}
                        </span>
                        {" · "}
                        {t.scans(device.scanCount)}
                        {labels.get(device.accessId) !== undefined && ` · ${labels.get(device.accessId) ?? ""}`}
                      </span>
                      <span className="mt-1 flex flex-wrap gap-1">
                        {device.rehearsedAt !== null && <Badge tone="success">{t.rehearsedAt(shortDateTime(device.rehearsedAt))}</Badge>}
                        {!revoked && (device.pendingScans ?? 0) > 0 && <Badge tone="warning">{t.pendingScans(device.pendingScans ?? 0)}</Badge>}
                      </span>
                    </span>
                    {!revoked && (
                      <Button
                        variant="danger-ghost"
                        size="sm"
                        onClick={() => {
                          void confirm({
                            title: t.disconnectConfirmTitle(device.name),
                            description: t.disconnectConfirmBody,
                            confirmLabel: t.disconnect,
                          }).then((ok) => {
                            if (ok) {
                              revokeDevice.mutate(device.id);
                            }
                          });
                        }}
                      >
                        {t.disconnect}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* A consumption token is the consumption itself: no checkpoints (ADR 0092). */}
      {kind !== "tokens" && (
        <CheckpointsCard
          eventId={eventId}
          checkpoints={checkpoints}
          categories={eventCategories}
          days={days}
          editable={can("door")}
          onCreateLink={(checkpoint) => {
            setCreating({ checkpoint });
          }}
        />
      )}

      {/* A consumption token is used once: no exit and return (ADR 0084). */}
      {kind !== "tokens" && (
      <Card className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-soft-fg">
            <LogOut className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <Switch
              checked={reentry.isPending ? reentry.variables : overview.data.reentry}
              onChange={(allowed) => {
                reentry.mutate(allowed);
              }}
              label={t.reentry}
              description={t.reentryHint}
            />
          </div>
        </div>
        {overview.data.reentry && (
          <ol className="grid gap-2 sm:grid-cols-3">
            {t.reentrySteps.map((step, index) => (
              <li key={step} className="flex items-start gap-2.5 rounded-xl bg-surface-2 p-3 text-sm leading-relaxed text-fg-muted">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-solid text-xs font-bold text-white tabular">
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        )}
      </Card>
      )}

      {kind !== "tokens" && (
        <CapacitySettings
          key={`${String(overview.data.capacity ?? "")}:${String(overview.data.capacityWarnPercent)}`}
          eventId={eventId}
          capacity={(overview.data.capacity as number | null | undefined) ?? null}
          warnPercent={overview.data.capacityWarnPercent || 90}
          editable={can("door")}
          onSaved={(data) => {
            queryClient.setQueryData(key, data);
            void queryClient.invalidateQueries({ queryKey: ["door-live", eventId] });
          }}
        />
      )}

      <RehearsalSheet eventId={eventId} />

      <CategoriesDialog
        access={editing}
        categories={eventCategories}
        saving={saveCategories.isPending}
        onClose={() => {
          setEditing(null);
        }}
        onSave={(categoryIds) => {
          if (editing !== null) {
            saveCategories.mutate({ id: editing.id, categoryIds });
          }
        }}
      />
    </div>
  );
}

/** Toggle chips of the event's categories (ADR 0068). */
function CategoryChips({
  categories,
  chosen,
  onChange,
}: {
  categories: readonly CategoryDto[];
  chosen: readonly string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {categories.map((category) => {
        const on = chosen.includes(category.id);
        return (
          <button
            key={category.id}
            type="button"
            aria-pressed={on}
            onClick={() => {
              onChange(on ? chosen.filter((id) => id !== category.id) : [...chosen, category.id]);
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
            {on && <Check className="size-3.5" aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}

function CategoriesDialog({
  access,
  categories,
  saving,
  onClose,
  onSave,
}: {
  access: DoorAccessDto | null;
  categories: readonly CategoryDto[];
  saving: boolean;
  onClose: () => void;
  onSave: (ids: string[]) => void;
}) {
  const t = useEventTexts().door;
  return (
    <Dialog
      open={access !== null}
      onClose={onClose}
      title={access === null ? "" : t.editCategoriesTitle(access.label)}
      description={t.editCategoriesBody}
    >
      {access !== null && (
        <CategoriesForm key={access.id} initial={access.categoryIds} categories={categories} saving={saving} onCancel={onClose} onSave={onSave} />
      )}
    </Dialog>
  );
}

function CategoriesForm(props: {
  initial: readonly string[];
  categories: readonly CategoryDto[];
  saving: boolean;
  onCancel: () => void;
  onSave: (ids: string[]) => void;
}) {
  const t = useEventTexts().door;
  const [chosen, setChosen] = useState<string[]>([...props.initial]);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        props.onSave(chosen);
      }}
    >
      <CategoryChips categories={props.categories} chosen={chosen} onChange={setChosen} />
      <p className="text-xs leading-relaxed text-fg-muted">{t.categoriesHint}</p>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={props.onCancel}>
          {t.cancel}
        </Button>
        <Button type="submit" loading={props.saving}>
          {t.save}
        </Button>
      </div>
    </form>
  );
}

/** A printable sheet of sample tickets to rehearse with (ADR 0067). */
function RehearsalSheet({ eventId }: { eventId: string }) {
  const t = useEventTexts().door;
  const download = useMutation({
    mutationFn: () => fetchBlobUrl(`/api/events/${eventId}/door/rehearsal-sheet`),
    onSuccess: (url) => {
      const link = document.createElement("a");
      link.href = url;
      link.download = t.sheetFile;
      link.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 60_000);
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
  // Optional (ADR 0067): folded away at the end of the tab, open for whoever wants to test.
  return (
    <details className="group rounded-2xl border border-border bg-surface">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-fg-muted transition hover:text-fg active:bg-surface-2 [&::-webkit-details-marker]:hidden">
        <ClipboardCheck className="size-4 shrink-0 text-fg-subtle" aria-hidden />
        <span className="flex-1">{t.sheetSummary}</span>
        <ChevronDown className="size-4 shrink-0 text-fg-subtle transition group-open:rotate-180" aria-hidden />
      </summary>
      <div className="flex flex-col gap-5 border-t border-border px-4 py-4 md:flex-row md:items-start md:gap-8">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold text-fg">{t.sheetTitle}</h3>
            <p className="text-sm leading-relaxed text-fg-muted">{t.sheetBody}</p>
          </div>
          <div>
            <Button
              variant="secondary"
              size="sm"
              icon={<Download />}
              loading={download.isPending}
              onClick={() => {
                download.mutate();
              }}
            >
              {t.sheetDownload}
            </Button>
          </div>
        </div>
        <ol className="flex flex-col gap-2.5 md:w-80 md:shrink-0">
          {t.sheetSteps.map((step, index) => (
            <li key={step} className="flex items-start gap-3 text-sm text-fg">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold text-fg-muted tabular">
                {index + 1}
              </span>
              <span className="pt-0.5 leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
      </div>
    </details>
  );
}

/**
 * The venue's capacity (ADR 0110): the door phones show "faltam 50 para lotar", the live view
 * follows it, and the organization hears when it gets close and when it is full.
 */
function CapacitySettings({
  eventId,
  capacity,
  warnPercent,
  editable,
  onSaved,
}: {
  eventId: string;
  capacity: number | null;
  warnPercent: number;
  editable: boolean;
  onSaved: (data: DoorOverviewDto) => void;
}) {
  const t = useEventTexts().door;
  const [limit, setLimit] = useState<number>(capacity ?? Number.NaN);
  const [warn, setWarn] = useState(warnPercent);
  const save = useMutation({
    mutationFn: (body: CapacityBody) => api<DoorOverviewDto>(`/api/events/${eventId}/capacity`, { method: "PUT", body }),
    onSuccess: (data) => {
      onSaved(data);
      toast.success(data.capacity === null ? t.capacityOff : t.capacitySaved);
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
  const valid = Number.isFinite(limit) && limit >= 1 && limit <= 1_000_000 && warn >= 50 && warn <= 99;
  const dirty = (Number.isFinite(limit) ? limit : null) !== capacity || warn !== warnPercent;
  return (
    <Card className="flex flex-col gap-4">
      <CardHeader title={t.capacity} description={t.capacityHint} icon={UsersRound} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.capacityLimit} hint={t.capacityLimitHint}>
          <NumberInput
            value={limit}
            step={10}
            min={1}
            max={1_000_000}
            suffix={t.capacityPeople}
            onChange={(value) => {
              setLimit(Number.isFinite(value) ? Math.round(value) : Number.NaN);
            }}
          />
        </Field>
        <Field label={t.capacityWarn} hint={t.capacityWarnHint}>
          <NumberInput
            value={warn}
            step={5}
            min={50}
            max={99}
            suffix="%"
            onChange={(value) => {
              setWarn(Number.isFinite(value) ? Math.round(value) : 90);
            }}
          />
        </Field>
      </div>
      {editable && (
        <div className="flex flex-wrap justify-end gap-2">
          {capacity !== null && (
            <Button
              variant="secondary"
              loading={save.isPending && save.variables.capacity === null}
              onClick={() => {
                save.mutate({ capacity: null, warnPercent: warn });
              }}
            >
              {t.capacityRemove}
            </Button>
          )}
          <Button
            disabled={!valid || !dirty}
            loading={save.isPending && save.variables.capacity !== null}
            onClick={() => {
              save.mutate({ capacity: limit, warnPercent: warn });
            }}
          >
            {t.capacitySave}
          </Button>
        </div>
      )}
    </Card>
  );
}
