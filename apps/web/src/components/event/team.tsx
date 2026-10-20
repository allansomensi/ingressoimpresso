"use client";

import type { EventDto, TeamArea, TeamMemberAdded, TeamMemberBody, TeamMemberDto, TeamMemberUpdateBody } from "@ingressoimpresso/api-types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Crown,
  LogOut,
  MessageCircle,
  MoreHorizontal,
  Palette,
  Pencil,
  ScanLine,
  Ticket,
  UserMinus,
  UserPlus,
  UsersRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { useEventTexts, useTeam, type EventTexts } from "@/components/event/access";
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
  buttonClass,
  errorMessage,
  useConfirm,
} from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { whatsappLink } from "@/lib/settlement";
import { PART_AREAS, TEAM_AREAS, areaList, displayName, personInitials, normalizeAreas, responsibleFor } from "@/lib/team";
import { common as commonTexts } from "@/texts/pt-BR/common";

import { EventHistory } from "./history";
import { TabHeader } from "./tab-header";

export const AREA_ICONS: Record<TeamArea, LucideIcon> = {
  manage: Crown,
  money: Wallet,
  delivery: Ticket,
  art: Palette,
  door: ScanLine,
};

/** The WhatsApp message that invites someone (when the e-mail did not go, or to insist). */
function inviteLink(t: EventTexts["team"], event: EventDto, member: Pick<TeamMemberDto, "areas" | "email">): string {
  const url = `${window.location.origin}/entrar?email=${encodeURIComponent(member.email)}`;
  return whatsappLink(null, t.inviteMessage(event.name, areaList(member.areas, event.kind), url));
}

function Avatar({ person, pending = false }: { person: { name: string | null; email: string }; pending?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
        pending ? "border border-dashed border-border-strong bg-surface text-fg-subtle" : "bg-brand-soft text-brand-soft-fg",
      )}
    >
      {personInitials(person)}
    </span>
  );
}

type DialogState = { mode: "add"; area: TeamArea | null } | { mode: "edit"; member: TeamMemberDto } | null;

export function TeamTab({ eventId, event }: { eventId: string; event: EventDto }) {
  const t = useEventTexts().team;
  const team = useTeam(eventId);
  const [dialog, setDialog] = useState<DialogState>(null);

  if (team.isPending) {
    return <LoadingBlock rows={3} />;
  }
  if (team.isError) {
    return <ErrorMessage error={team.error} />;
  }
  const { owners, members, canManage } = team.data;
  const coordinators = responsibleFor(members, "manage");

  return (
    <div className="flex flex-col gap-6">
      <TabHeader
        tab="team"
        help={t.intro}
        actions={
          canManage && (
            <Button
              icon={<UserPlus />}
              onClick={() => {
                setDialog({ mode: "add", area: null });
              }}
            >
              {t.add}
            </Button>
          )
        }
      />

      <Card>
        <CardHeader title={t.whoTitle} description={t.whoHint} icon={UsersRound} />
        {coordinators.length > 0 && (
          <p className="mb-4 flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm text-fg-muted">
            <Crown className="size-4 shrink-0 text-brand" aria-hidden />
            {t.coordinators(coordinators.map(displayName).join(", "))}
          </p>
        )}
        <ul className="grid gap-3 sm:grid-cols-2">
          {PART_AREAS.map((area) => {
            const Icon = AREA_ICONS[area];
            const people = responsibleFor(members, area);
            return (
              <li key={area} className="flex items-start gap-3 rounded-xl border border-border p-4">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-fg-muted">
                  <Icon className="size-[18px]" aria-hidden />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-sm font-semibold text-fg">{t.areas[area]}</span>
                  {people.length === 0 ? (
                    <span className="text-sm text-fg-subtle">{t.nobody}</span>
                  ) : (
                    <span className="flex flex-wrap gap-x-3 gap-y-1">
                      {people.map((person) => (
                        <span key={person.id} className="flex min-w-0 items-center gap-1.5 text-sm text-fg">
                          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[10px] font-semibold text-brand-soft-fg">
                            {personInitials(person)}
                          </span>
                          <span className="truncate">{displayName(person)}</span>
                        </span>
                      ))}
                    </span>
                  )}
                  {canManage && people.length === 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setDialog({ mode: "add", area });
                      }}
                      className="relative mt-1 w-fit text-sm font-medium text-brand underline-offset-2 touch-target hover:underline"
                    >
                      {t.addFor}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card padded={false}>
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
          <h2 className="text-base font-semibold tracking-tight text-fg">{t.peopleTitle}</h2>
          <span className="text-sm text-fg-muted tabular">{t.peopleCount(owners.length + members.length)}</span>
        </div>
        <ul className="divide-y divide-border">
          {owners.map((owner) => (
            <li key={owner.email} className="flex items-center gap-3 px-5 py-4 sm:px-6">
              <Avatar person={owner} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-2 truncate text-sm font-semibold text-fg">
                  {displayName(owner)}
                  {owner.you && <span className="font-normal text-fg-subtle">({t.you})</span>}
                </span>
                <span className="truncate text-xs text-fg-muted">{owner.email}</span>
              </div>
              <span title={t.ownerHint}>
                <Badge tone="brand">{t.owner}</Badge>
              </span>
            </li>
          ))}
          {members.map((member) => (
            <MemberRow
              key={member.id}
              eventId={eventId}
              event={event}
              member={member}
              canManage={canManage}
              onEdit={() => {
                setDialog({ mode: "edit", member });
              }}
            />
          ))}
        </ul>
        {members.length === 0 && (
          <div className="flex flex-col items-center gap-2 border-t border-border px-6 py-8 text-center">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-surface-2 text-fg-muted">
              <UsersRound className="size-5" aria-hidden />
            </span>
            <p className="text-sm font-semibold text-fg">{t.empty}</p>
            <p className="max-w-md text-sm leading-relaxed text-fg-muted">{t.emptyBody}</p>
          </div>
        )}
      </Card>

      {/* Who changed what (ADR 0099): for who coordinates the event. */}
      {canManage && <EventHistory eventId={eventId} />}

      {dialog !== null && (
        <MemberDialog
          key={dialog.mode === "edit" ? dialog.member.id : `add-${dialog.area ?? ""}`}
          eventId={eventId}
          event={event}
          state={dialog}
          onClose={() => {
            setDialog(null);
          }}
        />
      )}
    </div>
  );
}

function MemberRow({
  eventId,
  event,
  member,
  canManage,
  onEdit,
}: {
  eventId: string;
  event: EventDto;
  member: TeamMemberDto;
  canManage: boolean;
  onEdit: () => void;
}) {
  const t = useEventTexts().team;
  const queryClient = useQueryClient();
  const router = useRouter();
  const confirm = useConfirm();
  const name = displayName(member);
  const remove = useMutation({
    mutationFn: () => api(`/api/team-members/${member.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success(t.removed);
      void queryClient.invalidateQueries({ queryKey: ["team", eventId] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const leave = useMutation({
    mutationFn: () => api(`/api/events/${eventId}/team/leave`, { method: "POST" }),
    onSuccess: () => {
      toast.success(t.left);
      queryClient.removeQueries({ queryKey: ["event", eventId] });
      void queryClient.invalidateQueries({ queryKey: ["events"] });
      router.push("/painel");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const askLeave = () => {
    void confirm({ title: t.leaveTitle, description: t.leaveBody, confirmLabel: t.leave }).then((ok) => {
      if (ok) {
        leave.mutate();
      }
    });
  };

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-4 sm:px-6">
      <Avatar person={member} pending={!member.joined} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex min-w-0 flex-col">
          <span className="flex items-center gap-2 truncate text-sm font-semibold text-fg">
            {name}
            {member.you && <span className="font-normal text-fg-subtle">({t.you})</span>}
          </span>
          <span className="truncate text-xs text-fg-muted">{member.email}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {member.areas.map((area) => {
            const Icon = AREA_ICONS[area];
            return (
              <span
                key={area}
                className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-fg-muted ring-1 ring-border ring-inset"
              >
                <Icon className="size-3" aria-hidden />
                {t.areasShort[area]}
              </span>
            );
          })}
          {!member.joined && (
            <span title={t.pendingHint}>
              <Badge tone="warning">{t.pending}</Badge>
            </span>
          )}
        </div>
      </div>
      {canManage ? (
        <Menu
          label={t.menu(name)}
          disabled={remove.isPending || leave.isPending}
          trigger={<MoreHorizontal />}
          triggerClassName={buttonClass({ variant: "ghost", size: "icon-sm" })}
        >
          <MenuItem icon={<Pencil />} onSelect={onEdit}>
            {t.edit}
          </MenuItem>
          {!member.joined && (
            <MenuItem
              icon={<MessageCircle />}
              onSelect={() => {
                window.open(inviteLink(t, event, member), "_blank", "noopener,noreferrer");
              }}
            >
              {t.resend}
            </MenuItem>
          )}
          {member.you ? (
            <MenuItem icon={<LogOut />} tone="danger" onSelect={askLeave}>
              {t.leave}
            </MenuItem>
          ) : (
            <MenuItem
              icon={<UserMinus />}
              tone="danger"
              onSelect={() => {
                void confirm({ title: t.removeTitle(name), description: t.removeBody, confirmLabel: t.remove }).then((ok) => {
                  if (ok) {
                    remove.mutate();
                  }
                });
              }}
            >
              {t.remove}
            </MenuItem>
          )}
        </Menu>
      ) : (
        member.you && (
          <Button variant="ghost" size="sm" icon={<LogOut />} loading={leave.isPending} onClick={askLeave}>
            {t.leave}
          </Button>
        )
      )}
    </li>
  );
}

function MemberDialog({
  eventId,
  event,
  state,
  onClose,
}: {
  eventId: string;
  event: EventDto;
  state: Exclude<DialogState, null>;
  onClose: () => void;
}) {
  const t = useEventTexts().team;
  const queryClient = useQueryClient();
  const editing = state.mode === "edit" ? state.member : null;
  const [email, setEmail] = useState(editing?.email ?? "");
  const [name, setName] = useState(editing?.name ?? "");
  const [areas, setAreas] = useState<TeamArea[]>(editing?.areas ?? (state.mode === "add" && state.area !== null ? [state.area] : []));
  const manage = areas.includes("manage");
  const chosen = normalizeAreas(areas);
  const valid = chosen.length > 0 && (editing !== null || email.trim().includes("@"));

  const save = useMutation({
    mutationFn: async (): Promise<{ member: TeamMemberDto; added: TeamMemberAdded | null }> => {
      const trimmed = name.trim() === "" ? null : name.trim();
      if (editing !== null) {
        const body: TeamMemberUpdateBody = { name: trimmed, areas: chosen };
        const member = await api<TeamMemberDto>(`/api/team-members/${editing.id}`, { method: "PUT", body });
        return { member, added: null };
      }
      const body: TeamMemberBody = { email: email.trim(), name: trimmed, areas: chosen };
      const added = await api<TeamMemberAdded>(`/api/events/${eventId}/team`, { method: "POST", body });
      return { member: added.member, added };
    },
    onSuccess: ({ member, added }) => {
      void queryClient.invalidateQueries({ queryKey: ["team", eventId] });
      onClose();
      if (added === null) {
        toast.success(t.saved);
        return;
      }
      toast.success(t.added(displayName(member)), {
        description: added.emailed ? t.addedEmailed : t.addedNotEmailed,
        action: {
          label: t.sendWhatsapp,
          onClick: () => {
            window.open(inviteLink(t, event, member), "_blank", "noopener,noreferrer");
          },
        },
        duration: added.emailed ? 6000 : 15000,
      });
    },
  });

  const toggle = (area: TeamArea) => {
    setAreas((current) => (current.includes(area) ? current.filter((item) => item !== area) : [...current, area]));
  };
  const submit = (formEvent: FormEvent) => {
    formEvent.preventDefault();
    if (valid) {
      save.mutate();
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={editing === null ? t.dialogTitle : t.dialogEditTitle(displayName(editing))}
      {...(editing === null ? { description: t.dialogBody } : {})}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {commonTexts.cancel}
          </Button>
          <Button type="submit" form="team-member" loading={save.isPending} disabled={!valid}>
            {editing === null ? t.submit : t.save}
          </Button>
        </>
      }
    >
      <form id="team-member" onSubmit={submit} className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.email}>
            <Input
              type="email"
              inputMode="email"
              autoComplete="off"
              required
              value={email}
              disabled={editing !== null}
              placeholder={t.emailPlaceholder}
              onChange={(changeEvent) => {
                setEmail(changeEvent.target.value);
              }}
            />
          </Field>
          <Field label={t.name} optional>
            <Input
              value={name}
              maxLength={80}
              placeholder={t.namePlaceholder}
              onChange={(changeEvent) => {
                setName(changeEvent.target.value);
              }}
            />
          </Field>
        </div>
        <p className="-mt-3 text-xs leading-relaxed text-fg-muted">{t.nameHint}</p>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-fg">{t.areasLabel}</legend>
          <p className="mb-1 text-xs leading-relaxed text-fg-muted">{t.areasHint}</p>
          <div className="grid gap-2">
            {TEAM_AREAS.map((area) => {
              const Icon = AREA_ICONS[area];
              const covered = manage && area !== "manage";
              const checked = areas.includes(area) || covered;
              return (
                <label
                  key={area}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand",
                    checked ? "border-brand bg-brand-soft/60" : "border-border hover:border-border-strong hover:bg-surface-2 active:bg-surface-2",
                    covered && "cursor-default opacity-60",
                    area === "manage" && "mb-1",
                  )}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={checked}
                    disabled={covered}
                    onChange={() => {
                      toggle(area);
                    }}
                  />
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-lg",
                      checked ? "bg-brand-solid text-brand-fg" : "bg-surface-2 text-fg-muted",
                    )}
                  >
                    <Icon className="size-[18px]" aria-hidden />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-sm font-semibold text-fg">{t.areas[area]}</span>
                    <span className="text-xs leading-relaxed text-fg-muted">
                      {covered ? t.manageCovers : t.areaHints[area]}
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-md border",
                      checked ? "border-brand bg-brand-solid text-brand-fg" : "border-border-strong",
                    )}
                  >
                    {checked && <Check className="size-3.5" />}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <ErrorMessage error={save.error} />
      </form>
    </Dialog>
  );
}
