"use client";

import type {
  CommissionBody,
  CommissionDto,
  CommissionKind,
  CourtesiesDto,
  CourtesyBody,
  CourtesyGiverBody,
  CourtesyGiverDto,
  SellerDto,
  SellerNoticeBody,
  SellerSettingsDto,
} from "@ingressoimpresso/api-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Gift, Megaphone, MoreHorizontal, Pencil, Percent, Plus, Ticket, Trash2, UserRoundPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useEventTexts } from "@/components/event/access";
import { Choice } from "@/components/event/settlement-dialogs";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Dialog,
  ErrorMessage,
  Field,
  Input,
  Menu,
  MenuItem,
  Select,
  Textarea,
  buttonClass,
  errorMessage,
  useConfirm,
} from "@/components/ui";
import { api } from "@/lib/api";
import { parseMoney, shortDateTime, ticketNumber } from "@/lib/format";
import { NUMBER_LIST_INPUT, parseNumberList } from "@/lib/number-list";
import { commissionLabel } from "@/lib/settlement";
import { common as commonTexts } from "@/texts/pt-BR/common";

/** Longest notice (the API checks the same). */
const MAX_NOTICE = 280;

// Commission ----------------------------------------------------------------------------------

type CommissionChoice = "none" | CommissionKind;

/** Basis points from "10", "12,5" or "12.5" (percent). */
function parsePercent(text: string): number | null {
  const clean = text.trim().replace("%", "").replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(clean)) {
    return null;
  }
  const value = Math.round(Number(clean) * 100);
  return value >= 1 && value <= 10_000 ? value : null;
}

function commissionInput(commission: CommissionDto | null): string {
  if (commission === null) {
    return "";
  }
  return commission.kind === "percent"
    ? (commission.value / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })
    : (commission.value / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
}

/** A seller's commission, as a small badge on their card. */
export function CommissionBadge({ commission }: { commission: CommissionDto }) {
  const t = useEventTexts().sellers.commission;
  return (
    <Badge tone="neutral" className="shrink-0">
      <Percent className="size-3" aria-hidden />
      {t.badge(commissionLabel(commission, t.perUnit))}
    </Badge>
  );
}

/**
 * One seller's commission, or the same for every seller but the box office (ADR 0096): a share of
 * what they sold or an amount per ticket, taken off what they hand over.
 */
export function CommissionDialog({
  open,
  onClose,
  target,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  target: { kind: "seller"; seller: SellerDto } | { kind: "all"; eventId: string };
  onSaved: () => void;
}) {
  const t = useEventTexts().sellers.commission;
  const current = target.kind === "seller" ? target.seller.commission : null;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={target.kind === "seller" ? t.title(target.seller.name) : t.allTitle}
      description={target.kind === "seller" ? t.description : t.allDescription}
    >
      {open && <CommissionForm key={JSON.stringify(current)} current={current} target={target} onClose={onClose} onSaved={onSaved} />}
    </Dialog>
  );
}

function CommissionForm({
  current,
  target,
  onClose,
  onSaved,
}: {
  current: CommissionDto | null;
  target: { kind: "seller"; seller: SellerDto } | { kind: "all"; eventId: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useEventTexts().sellers.commission;
  const [choice, setChoice] = useState<CommissionChoice>(current?.kind ?? "percent");
  const [text, setText] = useState(commissionInput(current));
  const value = choice === "percent" ? parsePercent(text) : choice === "per_ticket" ? (() => {
    const parsed = parseMoney(text);
    return parsed.ok && parsed.cents !== null && parsed.cents >= 1 && parsed.cents <= 1_000_000 ? parsed.cents : null;
  })() : null;
  const commission: CommissionDto | null = choice === "none" || value === null ? null : { kind: choice, value };
  const save = useMutation({
    mutationFn: (body: CommissionBody) =>
      target.kind === "seller"
        ? api<undefined>(`/api/sellers/${target.seller.id}/commission`, { method: "PUT", body })
        : api<number>(`/api/events/${target.eventId}/sellers/commission`, { method: "POST", body }),
    onSuccess: (changed) => {
      toast.success(typeof changed === "number" ? t.savedAll(changed) : t.saved(commission === null ? null : commissionLabel(commission, t.perUnit)));
      onSaved();
      onClose();
    },
  });
  const valid = choice === "none" || commission !== null;
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) {
          save.mutate({ commission });
        }
      }}
    >
      <Choice
        label={t.kind}
        value={choice}
        onChange={(next) => {
          setChoice(next);
          setText("");
        }}
        options={[
          { value: "none", label: t.none, icon: <Ban aria-hidden /> },
          { value: "percent", label: t.percent, icon: <Percent aria-hidden /> },
          { value: "per_ticket", label: t.perTicket, icon: <Ticket aria-hidden /> },
        ]}
      />
      {choice !== "none" && (
        <Field label={choice === "percent" ? t.percentLabel : t.perTicketLabel} hint={choice === "percent" ? t.percentHint : t.perTicketHint}>
          <span className="relative flex">
            {choice === "per_ticket" && (
              <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-sm text-fg-subtle">R$</span>
            )}
            <Input
              value={text}
              inputMode="decimal"
              autoFocus
              placeholder={choice === "percent" ? "10" : "2,00"}
              className={choice === "per_ticket" ? "pl-10" : "pr-10"}
              onChange={(event) => {
                setText(event.target.value);
              }}
            />
            {choice === "percent" && <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-sm text-fg-subtle">%</span>}
          </span>
        </Field>
      )}
      {commission !== null && <p className="rounded-xl bg-surface-2 px-3.5 py-2.5 text-sm text-fg-muted">{t.example(commission.kind, commission.value)}</p>}
      <ErrorMessage error={save.error} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onClose}>
          {commonTexts.cancel}
        </Button>
        <Button type="submit" loading={save.isPending} disabled={!valid}>
          {target.kind === "all" ? t.applyAll : t.save}
        </Button>
      </div>
    </form>
  );
}

// Notice --------------------------------------------------------------------------------------

/**
 * The notice pinned on every seller's link (ADR 0096): "acerto sábado às 10h na secretaria".
 * Shown as written on the link, with the day it was last changed.
 */
export function SellerNoticeCard({ eventId, editable }: { eventId: string; editable: boolean }) {
  const t = useEventTexts().sellers.notice;
  const queryClient = useQueryClient();
  const key = ["seller-settings", eventId];
  const settings = useQuery({ queryKey: key, queryFn: () => api<SellerSettingsDto>(`/api/events/${eventId}/seller-settings`) });
  const [draft, setDraft] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (body: SellerNoticeBody) => api<SellerSettingsDto>(`/api/events/${eventId}/seller-notice`, { method: "PUT", body }),
    onSuccess: (saved) => {
      queryClient.setQueryData(key, saved);
      setDraft(null);
      toast.success(saved.notice === null ? t.removed : t.saved);
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
  if (settings.data === undefined) {
    return null;
  }
  const notice = settings.data.notice;
  const editing = draft !== null;
  const length = [...(draft ?? "")].length;
  return (
    <Card>
      <CardHeader
        title={t.title}
        description={t.description}
        icon={Megaphone}
        actions={
          editable &&
          !editing && (
            <Button
              variant="secondary"
              size="sm"
              icon={notice === null ? <Plus /> : <Pencil />}
              onClick={() => {
                setDraft(notice?.text ?? "");
              }}
            >
              {notice === null ? t.add : t.edit}
            </Button>
          )
        }
      />
      {editing ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate({ text: draft.trim() === "" ? null : draft });
          }}
        >
          <Textarea
            value={draft}
            rows={3}
            maxLength={MAX_NOTICE}
            autoFocus
            aria-label={t.title}
            placeholder={t.placeholder}
            onChange={(event) => {
              setDraft(event.target.value);
            }}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-fg-subtle tabular">{t.counter(length, MAX_NOTICE)}</span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setDraft(null);
                }}
              >
                {commonTexts.cancel}
              </Button>
              <Button type="submit" size="sm" loading={save.isPending}>
                {draft.trim() === "" && notice !== null ? t.remove : t.publish}
              </Button>
            </div>
          </div>
        </form>
      ) : notice === null ? (
        <p className="text-sm text-fg-muted">{t.empty}</p>
      ) : (
        <div className="flex flex-col gap-1.5 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-warning-fg">
          <p className="text-sm leading-relaxed font-medium whitespace-pre-line">{notice.text}</p>
          <p className="text-xs opacity-80">{t.since(shortDateTime(notice.updatedAt))}</p>
        </div>
      )}
    </Card>
  );
}

// Courtesies ----------------------------------------------------------------------------------

function GiverDialog({
  eventId,
  giver,
  onClose,
  onSaved,
}: {
  eventId: string;
  giver: CourtesyGiverDto | "new" | null;
  onClose: () => void;
  onSaved: (data: CourtesiesDto) => void;
}) {
  const t = useEventTexts().sellers.courtesies;
  return (
    <Dialog open={giver !== null} onClose={onClose} title={giver === "new" ? t.giverNew : t.giverEdit} description={t.giverHint} size="sm">
      {giver !== null && <GiverForm key={giver === "new" ? "new" : giver.id} eventId={eventId} giver={giver} onClose={onClose} onSaved={onSaved} />}
    </Dialog>
  );
}

function GiverForm({
  eventId,
  giver,
  onClose,
  onSaved,
}: {
  eventId: string;
  giver: CourtesyGiverDto | "new";
  onClose: () => void;
  onSaved: (data: CourtesiesDto) => void;
}) {
  const t = useEventTexts().sellers.courtesies;
  const [name, setName] = useState(giver === "new" ? "" : giver.name);
  const [quota, setQuota] = useState(giver === "new" || giver.quota === null ? "" : String(giver.quota));
  const quotaValue = quota.trim() === "" ? null : Number(quota);
  const validQuota = quotaValue === null || (Number.isInteger(quotaValue) && quotaValue >= 1 && quotaValue <= 100_000);
  const save = useMutation({
    mutationFn: (body: CourtesyGiverBody) =>
      giver === "new"
        ? api<CourtesiesDto>(`/api/events/${eventId}/courtesy-givers`, { method: "POST", body })
        : api<CourtesiesDto>(`/api/courtesy-givers/${giver.id}`, { method: "PUT", body }),
    onSuccess: (data) => {
      toast.success(t.giverSaved);
      onSaved(data);
      onClose();
    },
  });
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate({ name: name.trim(), quota: quotaValue });
      }}
    >
      <Field label={t.giverName}>
        <Input
          value={name}
          maxLength={60}
          autoFocus
          placeholder={t.giverPlaceholder}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
      </Field>
      <Field label={t.quota} hint={t.quotaHint} optional>
        <Input
          value={quota}
          inputMode="numeric"
          placeholder="10"
          onChange={(event) => {
            setQuota(event.target.value.replace(/\D/g, ""));
          }}
        />
      </Field>
      <ErrorMessage error={save.error} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onClose}>
          {commonTexts.cancel}
        </Button>
        <Button type="submit" loading={save.isPending} disabled={name.trim() === "" || !validQuota}>
          {commonTexts.save}
        </Button>
      </div>
    </form>
  );
}

function GiveDialog({
  eventId,
  givers,
  open,
  onClose,
  onSaved,
}: {
  eventId: string;
  givers: readonly CourtesyGiverDto[];
  open: boolean;
  onClose: () => void;
  onSaved: (data: CourtesiesDto) => void;
}) {
  const t = useEventTexts().sellers.courtesies;
  return (
    <Dialog open={open} onClose={onClose} title={t.giveTitle} description={t.giveHint}>
      {open && <GiveForm eventId={eventId} givers={givers} onClose={onClose} onSaved={onSaved} />}
    </Dialog>
  );
}

function GiveForm({
  eventId,
  givers,
  onClose,
  onSaved,
}: {
  eventId: string;
  givers: readonly CourtesyGiverDto[];
  onClose: () => void;
  onSaved: (data: CourtesiesDto) => void;
}) {
  const t = useEventTexts().sellers.courtesies;
  const [giverId, setGiverId] = useState(givers[0]?.id ?? "");
  const [numbers, setNumbers] = useState("");
  const [recipient, setRecipient] = useState("");
  const [reason, setReason] = useState("");
  const parsed = parseNumberList(numbers);
  // One number or one range per courtesy: "12" or "40-45".
  const range = parsed.ok && parsed.ranges.length === 1 ? parsed.ranges[0] : undefined;
  const count = range === undefined ? 0 : range.last - range.first + 1;
  const giver = givers.find((item) => item.id === giverId);
  const left = giver?.quota == null ? null : giver.quota - giver.given;
  const save = useMutation({
    mutationFn: (body: CourtesyBody) => api<CourtesiesDto>(`/api/events/${eventId}/courtesies`, { method: "POST", body }),
    onSuccess: (data) => {
      toast.success(t.given(count, recipient.trim()));
      onSaved(data);
      onClose();
    },
  });
  const overQuota = left !== null && count > left;
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (range !== undefined) {
          save.mutate({ giverId, first: range.first, last: range.last, recipient: recipient.trim(), ...(reason.trim() === "" ? {} : { reason: reason.trim() }) });
        }
      }}
    >
      <Field label={t.giver} hint={left === null ? undefined : t.left(left)}>
        <Select
          value={giverId}
          onChange={(event) => {
            setGiverId(event.target.value);
          }}
        >
          {givers.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t.numbers} hint={t.numbersHint}>
        <Input
          value={numbers}
          {...NUMBER_LIST_INPUT}
          placeholder="12 ou 40-45"
          onChange={(event) => {
            setNumbers(event.target.value);
          }}
        />
      </Field>
      <Field label={t.recipient}>
        <Input
          value={recipient}
          maxLength={80}
          placeholder={t.recipientPlaceholder}
          onChange={(event) => {
            setRecipient(event.target.value);
          }}
        />
      </Field>
      <Field label={t.reason} optional>
        <Input
          value={reason}
          maxLength={120}
          placeholder={t.reasonPlaceholder}
          onChange={(event) => {
            setReason(event.target.value);
          }}
        />
      </Field>
      {numbers.trim() !== "" && range === undefined && <p className="text-sm text-danger">{t.oneRange}</p>}
      {overQuota && <p className="text-sm text-danger">{t.overQuota(left)}</p>}
      <ErrorMessage error={save.error} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onClose}>
          {commonTexts.cancel}
        </Button>
        <Button type="submit" loading={save.isPending} disabled={range === undefined || recipient.trim() === "" || giverId === "" || overQuota}>
          {count <= 1 ? t.giveOne : t.giveMany(count)}
        </Button>
      </div>
    </form>
  );
}

/**
 * Courtesies under control (ADR 0096): who may give them, how many each one may, and every number
 * given, to whom and why. Nobody owes a courtesy; the report counts them apart.
 */
export function CourtesiesCard({ eventId, editable, onChange }: { eventId: string; editable: boolean; onChange: () => void }) {
  const t = useEventTexts().sellers.courtesies;
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const key = ["courtesies", eventId];
  const data = useQuery({ queryKey: key, queryFn: () => api<CourtesiesDto>(`/api/events/${eventId}/courtesies`) });
  const [giver, setGiver] = useState<CourtesyGiverDto | "new" | null>(null);
  const [giving, setGiving] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const saved = (next: CourtesiesDto) => {
    queryClient.setQueryData(key, next);
    onChange();
  };
  const remove = useMutation({
    mutationFn: (path: string) => api<CourtesiesDto>(path, { method: "DELETE" }),
    onSuccess: saved,
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
  if (data.data === undefined) {
    return data.isError ? <ErrorMessage error={data.error} onRetry={() => void data.refetch()} /> : null;
  }
  const { givers, courtesies } = data.data;
  const giverName = new Map(givers.map((item) => [item.id, item.name]));
  const shown = showAll ? courtesies : courtesies.slice(0, 5);
  return (
    <Card>
      <CardHeader
        title={t.title}
        description={t.description}
        icon={Gift}
        actions={
          editable && (
            <div className="flex flex-wrap gap-2">
              {givers.length > 0 && (
                <Button
                  size="sm"
                  icon={<Gift />}
                  onClick={() => {
                    setGiving(true);
                  }}
                >
                  {t.give}
                </Button>
              )}
              <Button
                variant="secondary"
                size="sm"
                icon={<UserRoundPlus />}
                onClick={() => {
                  setGiver("new");
                }}
              >
                {t.giverNew}
              </Button>
            </div>
          )
        }
      />
      {givers.length === 0 ? (
        <p className="text-sm text-fg-muted">{t.empty}</p>
      ) : (
        <div className="flex flex-col gap-5">
          <ul className="grid gap-2 sm:grid-cols-2">
            {givers.map((item) => {
              const percent = item.quota === null ? null : Math.min(100, Math.round((item.given / item.quota) * 100));
              return (
                <li key={item.id} className="flex flex-col gap-2 rounded-xl border border-border px-3.5 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-medium text-fg">{item.name}</span>
                      <span className="text-xs text-fg-muted tabular">
                        {item.quota === null ? t.givenNoQuota(item.given) : t.givenOf(item.given, item.quota)}
                        {item.given > 0 && ` · ${t.entered(item.entered)}`}
                      </span>
                    </span>
                    {editable && (
                      <Menu label={t.giverMenu(item.name)} trigger={<MoreHorizontal />} triggerClassName={buttonClass({ variant: "ghost", size: "icon-sm" })}>
                        <MenuItem
                          icon={<Pencil />}
                          onSelect={() => {
                            setGiver(item);
                          }}
                        >
                          {t.giverEdit}
                        </MenuItem>
                        {item.given === 0 && (
                          <MenuItem
                            icon={<Trash2 />}
                            tone="danger"
                            onSelect={() => {
                              void confirm({ title: t.giverRemoveTitle(item.name), confirmLabel: commonTexts.remove }).then((ok) => {
                                if (ok) {
                                  remove.mutate(`/api/courtesy-givers/${item.id}`);
                                }
                              });
                            }}
                          >
                            {commonTexts.remove}
                          </MenuItem>
                        )}
                      </Menu>
                    )}
                  </div>
                  {percent !== null && (
                    <div
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={percent}
                      aria-label={t.givenOf(item.given, item.quota ?? 0)}
                      className="h-1.5 overflow-hidden rounded-full bg-surface-3"
                    >
                      <div className={percent >= 100 ? "h-full rounded-full bg-warning" : "h-full rounded-full bg-brand"} style={{ width: `${String(percent)}%` }} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {courtesies.length > 0 && (
            <div className="flex flex-col gap-2">
              <h4 className="text-xs font-semibold tracking-wider text-fg-subtle uppercase">{t.listTitle(courtesies.length)}</h4>
              <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
                {shown.map((courtesy) => (
                  <li key={courtesy.id} className="flex items-start gap-3 px-3.5 py-2.5">
                    <span className="mt-0.5 rounded-lg bg-surface-2 px-2 py-0.5 font-mono text-sm font-semibold text-fg tabular">
                      {ticketNumber(courtesy.number)}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-sm font-medium text-fg">{courtesy.recipient}</span>
                      <span className="text-xs text-fg-muted">
                        {t.by(giverName.get(courtesy.giverId) ?? "")}
                        {courtesy.reason !== null && ` · ${courtesy.reason}`}
                        {courtesy.seller !== null && ` · ${t.fromSeller(courtesy.seller)}`}
                      </span>
                    </span>
                    {courtesy.entered && (
                      <Badge tone="success" className="shrink-0">
                        {t.enteredBadge}
                      </Badge>
                    )}
                    {editable && (
                      <button
                        type="button"
                        aria-label={t.undo(ticketNumber(courtesy.number))}
                        className="relative flex size-8 shrink-0 items-center justify-center rounded-lg text-fg-subtle transition touch-target hover:bg-danger-soft hover:text-danger-fg active:bg-danger-soft"
                        onClick={() => {
                          void confirm({ title: t.undoTitle(ticketNumber(courtesy.number)), description: t.undoBody, confirmLabel: t.undoConfirm }).then((ok) => {
                            if (ok) {
                              remove.mutate(`/api/courtesies/${courtesy.id}`);
                            }
                          });
                        }}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {courtesies.length > shown.length && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-fit"
                  onClick={() => {
                    setShowAll(true);
                  }}
                >
                  {t.showAll(courtesies.length)}
                </Button>
              )}
            </div>
          )}
        </div>
      )}
      <GiverDialog
        eventId={eventId}
        giver={giver}
        onClose={() => {
          setGiver(null);
        }}
        onSaved={saved}
      />
      <GiveDialog
        eventId={eventId}
        givers={givers}
        open={giving}
        onClose={() => {
          setGiving(false);
        }}
        onSaved={saved}
      />
    </Card>
  );
}
