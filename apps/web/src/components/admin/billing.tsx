"use client";

import type {
  AdminPricesDto,
  AnnouncementDisplay,
  PriceTableBody,
  PriceTableDto,
  PromoCodeBody,
  PromoCodeDto,
  PromoCodeKind,
  PromoCodeUpdateBody,
  PromoRedemptionDto,
  PromotionBody,
  PromotionDto,
} from "@ingressoimpresso/api-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgePercent,
  CalendarClock,
  Coins,
  Copy,
  History,
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  Shuffle,
  Trash2,
  TicketPercent,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
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
  errorMessage,
  useConfirm,
} from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { dateTime, money, parseMoney, shortDateTime } from "@/lib/format";
import { fromLocalInput, localInputIn, toLocalInput } from "@/lib/local-time";
import { quote, type PriceTable } from "@/lib/pricing";
import { copyText } from "@/lib/share";
import { texts } from "@/texts/pt-BR";

const t = texts.admin.billing;
const EXAMPLES = [50, 100, 300, 1000] as const;
const LARGEST_BATCH = 5000;

/** `0,15` for 15 centavos (inputs in reais). */
function reais(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

function TierTable({ table }: { table: PriceTableDto }) {
  return (
    <div className="flex flex-col gap-4">
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
        {table.tiers.map((tier, index) => {
          const from = (table.tiers[index - 1]?.upTo ?? 0) + 1;
          return (
            <li key={tier.upTo} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <span className="text-fg-muted">{texts.account.tier(from, tier.upTo)}</span>
              <span className="font-semibold text-fg tabular">{texts.account.perTicket(money(tier.unitCents))}</span>
            </li>
          );
        })}
      </ul>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl bg-surface-2 px-4 py-3">
          <dt className="text-xs text-fg-muted">{t.minimum}</dt>
          <dd className="font-semibold text-fg tabular">{money(table.minimumCents)}</dd>
        </div>
        <div className="rounded-xl bg-surface-2 px-4 py-3">
          <dt className="text-xs text-fg-muted">{t.freeTickets}</dt>
          <dd className="font-semibold text-fg tabular">{table.freeTickets.toLocaleString("pt-BR")}</dd>
        </div>
      </dl>
    </div>
  );
}

type TierDraft = { upTo: string; unit: string };

function PriceEditor({ current, onClose }: { current: PriceTableDto; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [tiers, setTiers] = useState<TierDraft[]>(current.tiers.map((tier) => ({ upTo: String(tier.upTo), unit: reais(tier.unitCents) })));
  const [minimum, setMinimum] = useState(reais(current.minimumCents));
  const [free, setFree] = useState(String(current.freeTickets));
  const [when, setWhen] = useState<"now" | "later">("now");
  const [effectiveAt, setEffectiveAt] = useState(localInputIn(7, 0));
  const [note, setNote] = useState("");
  const [announce, setAnnounce] = useState(true);
  const [display, setDisplay] = useState<AnnouncementDisplay>("modal");

  const parsed = tiers.map((tier, index) => {
    const unit = parseMoney(tier.unit);
    const upTo = index === tiers.length - 1 ? LARGEST_BATCH : Number.parseInt(tier.upTo, 10);
    return { upTo, unitCents: unit.ok && unit.cents !== null ? unit.cents : Number.NaN };
  });
  const minimumParsed = parseMoney(minimum);
  const minimumCents = minimumParsed.ok ? (minimumParsed.cents ?? 0) : Number.NaN;
  const freeTickets = Number.parseInt(free, 10);
  const valid =
    parsed.every((tier, index) => Number.isFinite(tier.upTo) && tier.unitCents > 0 && tier.upTo > (parsed[index - 1]?.upTo ?? 0)) &&
    Number.isFinite(minimumCents) &&
    Number.isFinite(freeTickets) &&
    freeTickets >= 0;
  const draft: PriceTable = { tiers: parsed, minimumCents };
  const save = useMutation({
    mutationFn: () => {
      const body: PriceTableBody = {
        tiers: parsed,
        minimumCents,
        freeTickets,
        effectiveAt: when === "now" ? null : fromLocalInput(effectiveAt),
        note: note.trim() === "" ? null : note.trim(),
        announce,
        announcementDisplay: display,
      };
      return api<AdminPricesDto>("/api/admin/prices", { method: "POST", body });
    },
    onSuccess: (prices) => {
      queryClient.setQueryData(["admin", "prices"], prices);
      void queryClient.invalidateQueries({ queryKey: ["pricing"] });
      void queryClient.invalidateQueries({ queryKey: ["platform"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "announcements"] });
      toast.success(when === "now" ? t.appliedNow : t.scheduled);
      onClose();
    },
  });
  const update = (index: number, patch: Partial<TierDraft>) => {
    setTiers((previous) => previous.map((tier, at) => (at === index ? { ...tier, ...patch } : tier)));
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={t.newTable}
      description={t.newTableHint}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {texts.common.cancel}
          </Button>
          <Button loading={save.isPending} disabled={!valid} onClick={() => save.mutate()}>
            {when === "now" ? t.applyNow : t.schedule}
          </Button>
        </>
      }
    >
      <div className="grid gap-6 md:grid-cols-[1fr_15rem]">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-fg">{t.tiers}</p>
            {tiers.map((tier, index) => {
              const last = index === tiers.length - 1;
              const from = (index === 0 ? 0 : (parsed[index - 1]?.upTo ?? 0)) + 1;
              return (
                <div key={index} className="flex items-end gap-2">
                  <Field label={index === 0 ? t.upTo : ""} className="flex-1">
                    <Input
                      inputMode="numeric"
                      value={last ? String(LARGEST_BATCH) : tier.upTo}
                      disabled={last}
                      aria-label={t.tierRange(from)}
                      onChange={(event) => {
                        update(index, { upTo: event.target.value.replace(/\D/g, "") });
                      }}
                    />
                  </Field>
                  <Field label={index === 0 ? t.unit : ""} className="flex-1">
                    <Input
                      inputMode="decimal"
                      value={tier.unit}
                      aria-label={t.unitOf(from)}
                      onChange={(event) => {
                        update(index, { unit: event.target.value });
                      }}
                    />
                  </Field>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t.removeTier}
                    disabled={tiers.length === 1}
                    onClick={() => {
                      setTiers((previous) => previous.filter((_, at) => at !== index));
                    }}
                  >
                    <X />
                  </Button>
                </div>
              );
            })}
            <Button
              variant="ghost"
              size="sm"
              icon={<Plus />}
              className="w-fit"
              disabled={tiers.length >= 10}
              onClick={() => {
                setTiers((previous) => [...previous.slice(0, -1), { upTo: "", unit: previous.at(-1)?.unit ?? "0,10" }, ...previous.slice(-1)]);
              }}
            >
              {t.addTier}
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.minimum} hint={t.minimumHint}>
              <Input
                inputMode="decimal"
                value={minimum}
                onChange={(event) => {
                  setMinimum(event.target.value);
                }}
              />
            </Field>
            <Field label={t.freeTickets} hint={t.freeTicketsHint}>
              <Input
                inputMode="numeric"
                value={free}
                onChange={(event) => {
                  setFree(event.target.value.replace(/\D/g, ""));
                }}
              />
            </Field>
          </div>
          <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
            <div role="radiogroup" aria-label={t.when} className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
              {(["now", "later"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={when === option}
                  onClick={() => {
                    setWhen(option);
                  }}
                  className={cn(
                    "rounded-lg py-2 text-sm font-medium transition",
                    when === option ? "bg-surface text-fg shadow-xs" : "text-fg-muted",
                  )}
                >
                  {t.whenOptions[option]}
                </button>
              ))}
            </div>
            {when === "later" && (
              <Field label={t.effectiveAt}>
                <Input
                  type="datetime-local"
                  value={effectiveAt}
                  onChange={(event) => {
                    setEffectiveAt(event.target.value);
                  }}
                />
              </Field>
            )}
            <Switch checked={announce} onChange={setAnnounce} label={t.announce} description={t.announceHint} />
            {announce && (
              <Field label={texts.admin.announcements.display}>
                <Select
                  value={display}
                  onChange={(event) => {
                    setDisplay(event.target.value as AnnouncementDisplay);
                  }}
                >
                  <option value="modal">{texts.admin.announcements.displays.modal}</option>
                  <option value="notification">{texts.admin.announcements.displays.notification}</option>
                </Select>
              </Field>
            )}
          </div>
          <Field label={t.note} optional>
            <Input
              value={note}
              maxLength={200}
              placeholder={t.notePlaceholder}
              onChange={(event) => {
                setNote(event.target.value);
              }}
            />
          </Field>
          <ErrorMessage error={save.error} />
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold tracking-wide text-fg-subtle uppercase">{t.examples}</p>
          <ul className="flex flex-col gap-2">
            {EXAMPLES.map((quantity) => {
              const before = quote(current, quantity);
              const after = valid ? quote(draft, quantity) : null;
              const change = after === null || before === 0 ? null : Math.round(((after - before) / before) * 100);
              return (
                <li key={quantity} className="flex flex-col gap-0.5 rounded-xl bg-surface-2 px-3.5 py-2.5">
                  <span className="text-xs text-fg-muted">{texts.account.example(quantity)}</span>
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold text-fg tabular">{after === null ? "—" : money(after)}</span>
                    {change !== null && change !== 0 && (
                      <span className={cn("text-xs font-semibold tabular", change > 0 ? "text-danger-fg" : "text-success-fg")}>
                        {change > 0 ? "+" : ""}
                        {change}%
                      </span>
                    )}
                  </span>
                  <span className="text-[11px] text-fg-subtle">{t.before(money(before))}</span>
                </li>
              );
            })}
          </ul>
          <p className="text-xs leading-relaxed text-fg-muted">{t.examplesHint}</p>
        </div>
      </div>
    </Dialog>
  );
}

/** The price table and its versions (ADR 0039). */
export function AdminPrices() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const prices = useQuery({ queryKey: ["admin", "prices"], queryFn: () => api<AdminPricesDto>("/api/admin/prices") });
  const [editing, setEditing] = useState(false);
  const withdraw = useMutation({
    mutationFn: (id: string) => api<AdminPricesDto>(`/api/admin/prices/${id}`, { method: "DELETE" }),
    onSuccess: (data) => {
      queryClient.setQueryData(["admin", "prices"], data);
      void queryClient.invalidateQueries({ queryKey: ["platform"] });
      toast.success(t.withdrawn);
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
  if (prices.isPending) {
    return <LoadingBlock rows={3} />;
  }
  if (prices.isError) {
    return <ErrorMessage error={prices.error} />;
  }
  const { current, upcoming, history } = prices.data;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Lead>{t.pricesIntro}</Lead>
        <Button
          icon={<Pencil />}
          onClick={() => {
            setEditing(true);
          }}
        >
          {t.change}
        </Button>
      </div>
      {upcoming !== null && (
        <Alert
          tone="warning"
          title={t.upcomingTitle(dateTime(upcoming.effectiveAt))}
          action={
            <Button
              variant="secondary"
              size="sm"
              loading={withdraw.isPending}
              onClick={async () => {
                if (await confirm({ title: t.withdrawTitle, description: t.withdrawBody, confirmLabel: t.withdraw })) {
                  withdraw.mutate(upcoming.id);
                }
              }}
            >
              {t.withdraw}
            </Button>
          }
        >
          {t.upcomingBody}
        </Alert>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader icon={Coins} title={t.current} description={t.since(dateTime(current.effectiveAt))} />
          <TierTable table={current} />
        </Card>
        {upcoming !== null && (
          <Card className="border-warning/40">
            <CardHeader icon={CalendarClock} title={t.upcoming} description={t.since(dateTime(upcoming.effectiveAt))} />
            <TierTable table={upcoming} />
          </Card>
        )}
      </div>
      <Card padded={false}>
        <div className="p-5 pb-0 sm:p-6 sm:pb-0">
          <CardHeader icon={History} title={t.history} />
        </div>
        <ul className="divide-y divide-border">
          {history.map((table) => (
            <li key={table.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3 text-sm sm:px-6">
              <span className="flex flex-col">
                <span className="font-medium text-fg">
                  {dateTime(table.effectiveAt)}
                  {table.id === current.id && (
                    <Badge tone="success" className="ml-2">
                      {t.inForce}
                    </Badge>
                  )}
                  {upcoming !== null && table.id === upcoming.id && (
                    <Badge tone="warning" className="ml-2">
                      {t.upcoming}
                    </Badge>
                  )}
                </span>
                <span className="text-xs text-fg-muted">
                  {[table.note, table.createdBy].filter((part) => part !== null && part !== "").join(" · ") || t.seed}
                </span>
              </span>
              <span className="text-xs text-fg-muted tabular">
                {t.summary(money(table.tiers[0]?.unitCents ?? 0), money(table.minimumCents), table.freeTickets)}
              </span>
            </li>
          ))}
        </ul>
      </Card>
      {editing && (
        <PriceEditor
          current={current}
          onClose={() => {
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}

function promotionState(promotion: PromotionDto): { label: string; tone: "success" | "brand" | "neutral" } {
  const now = Date.now();
  if (!promotion.active) {
    return { label: t.promoStates.off, tone: "neutral" };
  }
  if (Date.parse(promotion.startsAt) > now) {
    return { label: t.promoStates.scheduled, tone: "brand" };
  }
  if (Date.parse(promotion.endsAt) <= now) {
    return { label: t.promoStates.ended, tone: "neutral" };
  }
  return { label: t.promoStates.running, tone: "success" };
}

function PromotionEditor({ promotion, onClose }: { promotion: PromotionDto | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(promotion?.name ?? "");
  const [headline, setHeadline] = useState(promotion?.headline ?? "");
  const [percent, setPercent] = useState(String(promotion?.discountPercent ?? 20));
  const [startsAt, setStartsAt] = useState(promotion === null ? localInputIn(0, new Date().getHours()) : toLocalInput(promotion.startsAt));
  const [endsAt, setEndsAt] = useState(promotion === null ? localInputIn(7, 23) : toLocalInput(promotion.endsAt));
  const [active, setActive] = useState(promotion?.active ?? true);
  const discount = Number.parseInt(percent, 10);
  const save = useMutation({
    mutationFn: () => {
      const body: PromotionBody = {
        name: name.trim(),
        headline: headline.trim() === "" ? null : headline.trim(),
        discountPercent: discount,
        startsAt: fromLocalInput(startsAt) ?? new Date().toISOString(),
        endsAt: fromLocalInput(endsAt) ?? new Date().toISOString(),
        active,
      };
      return promotion === null
        ? api<PromotionDto>("/api/admin/promotions", { method: "POST", body })
        : api<PromotionDto>(`/api/admin/promotions/${promotion.id}`, { method: "PUT", body });
    },
    onSuccess: () => {
      toast.success(t.promoSaved);
      void queryClient.invalidateQueries({ queryKey: ["admin", "promotions"] });
      void queryClient.invalidateQueries({ queryKey: ["platform"] });
      void queryClient.invalidateQueries({ queryKey: ["pricing"] });
      onClose();
    },
  });
  const valid = name.trim() !== "" && discount >= 1 && discount <= 100 && startsAt !== "" && endsAt !== "";
  return (
    <Dialog
      open
      onClose={onClose}
      title={promotion === null ? t.newPromotion : t.editPromotion}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {texts.common.cancel}
          </Button>
          <Button loading={save.isPending} disabled={!valid} onClick={() => save.mutate()}>
            {texts.common.save}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <Field label={t.promoName}>
            <Input
              value={name}
              maxLength={80}
              placeholder={t.promoNamePlaceholder}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          </Field>
          <Field label={t.percent}>
            <Input
              inputMode="numeric"
              value={percent}
              onChange={(event) => {
                setPercent(event.target.value.replace(/\D/g, "").slice(0, 3));
              }}
            />
          </Field>
        </div>
        <Field label={t.headline} hint={t.headlineHint} optional>
          <Input
            value={headline}
            maxLength={120}
            placeholder={t.headlinePlaceholder}
            onChange={(event) => {
              setHeadline(event.target.value);
            }}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.startsAt}>
            <Input
              type="datetime-local"
              value={startsAt}
              onChange={(event) => {
                setStartsAt(event.target.value);
              }}
            />
          </Field>
          <Field label={t.endsAt}>
            <Input
              type="datetime-local"
              value={endsAt}
              onChange={(event) => {
                setEndsAt(event.target.value);
              }}
            />
          </Field>
        </div>
        <Switch checked={active} onChange={setActive} label={t.active} description={t.activeHint} />
        <ErrorMessage error={save.error} />
      </div>
    </Dialog>
  );
}

/** Time-limited discounts on every batch (ADR 0039). */
export function AdminPromotions() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const list = useQuery({ queryKey: ["admin", "promotions"], queryFn: () => api<PromotionDto[]>("/api/admin/promotions") });
  const [editing, setEditing] = useState<PromotionDto | "new" | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => api<undefined>(`/api/admin/promotions/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success(t.promoRemoved);
      void queryClient.invalidateQueries({ queryKey: ["admin", "promotions"] });
      void queryClient.invalidateQueries({ queryKey: ["platform"] });
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
      {t.newPromotion}
    </Button>
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Lead>{t.promotionsIntro}</Lead>
        {newButton}
      </div>
      {list.isPending ? (
        <LoadingBlock rows={2} />
      ) : list.isError ? (
        <ErrorMessage error={list.error} />
      ) : list.data.length === 0 ? (
        <EmptyState icon={BadgePercent} title={t.noPromotions} description={t.noPromotionsHint} action={newButton} />
      ) : (
        <List>
          {list.data.map((promotion) => {
            const state = promotionState(promotion);
            return (
              <ListItem key={promotion.id} className="flex-nowrap items-start">
                <span className="mt-0.5 flex h-9 min-w-12 items-center justify-center rounded-xl bg-success-soft px-2 text-sm font-bold text-success-fg tabular">
                  −{promotion.discountPercent}%
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-fg">{promotion.name}</span>
                    <Badge tone={state.tone} dot={state.tone === "success"} pulse={state.tone === "success"}>
                      {state.label}
                    </Badge>
                  </span>
                  {promotion.headline !== null && <span className="text-sm text-fg-muted">{promotion.headline}</span>}
                  <span className="text-xs text-fg-subtle">
                    {t.window(shortDateTime(promotion.startsAt), shortDateTime(promotion.endsAt))} ·{" "}
                    {t.promoUsage(promotion.batches, money(promotion.discountCents))}
                  </span>
                </div>
                <Menu
                  label={texts.event.batches.moreActions}
                  trigger={<MoreHorizontal className="size-4" aria-hidden />}
                  triggerClassName="flex size-9 items-center justify-center rounded-lg text-fg-muted transition hover:bg-surface-2 hover:text-fg"
                >
                  <MenuItem
                    icon={<Pencil />}
                    onSelect={() => {
                      setEditing(promotion);
                    }}
                  >
                    {texts.common.edit}
                  </MenuItem>
                  <MenuItem
                    tone="danger"
                    icon={<Trash2 />}
                    onSelect={async () => {
                      if (await confirm({ title: t.promoDeleteTitle, description: t.promoDeleteBody, confirmLabel: texts.common.remove })) {
                        remove.mutate(promotion.id);
                      }
                    }}
                  >
                    {texts.common.remove}
                  </MenuItem>
                </Menu>
              </ListItem>
            );
          })}
        </List>
      )}
      {editing !== null && (
        <PromotionEditor
          key={editing === "new" ? "new" : editing.id}
          promotion={editing === "new" ? null : editing}
          onClose={() => {
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function benefit(code: PromoCodeDto): string {
  switch (code.kind) {
    case "credit":
      return t.kindValues.credit(money(code.creditCents ?? 0));
    case "free_tickets":
      return t.kindValues.free_tickets(code.freeTickets ?? 0);
    case "discount":
      return t.kindValues.discount(code.discountPercent ?? 0);
  }
}

function codeState(code: PromoCodeDto): { label: string; tone: "success" | "neutral" | "warning" | "brand" } {
  const now = Date.now();
  if (code.disabled) {
    return { label: t.codeStates.disabled, tone: "neutral" };
  }
  if (code.expiresAt !== null && Date.parse(code.expiresAt) <= now) {
    return { label: t.codeStates.expired, tone: "neutral" };
  }
  if (code.maxRedemptions !== null && code.redemptionsCount >= code.maxRedemptions) {
    return { label: t.codeStates.exhausted, tone: "warning" };
  }
  if (code.startsAt !== null && Date.parse(code.startsAt) > now) {
    return { label: t.codeStates.scheduled, tone: "brand" };
  }
  return { label: t.codeStates.active, tone: "success" };
}

function CodeCreator({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<PromoCodeKind>("credit");
  const [value, setValue] = useState("10,00");
  const [description, setDescription] = useState("");
  const [max, setMax] = useState("");
  const [onlyNew, setOnlyNew] = useState(false);
  const [startsAt, setStartsAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const typed = parseMoney(value);
  const amount = kind === "credit" ? (typed.ok ? (typed.cents ?? 0) : 0) : Number.parseInt(value, 10);
  const create = useMutation({
    mutationFn: () => {
      const body: PromoCodeBody = {
        code: code.trim() === "" ? null : code.trim().toUpperCase(),
        kind,
        creditCents: kind === "credit" ? amount : null,
        freeTickets: kind === "free_tickets" ? amount : null,
        discountPercent: kind === "discount" ? amount : null,
        description: description.trim() === "" ? null : description.trim(),
        maxRedemptions: max === "" ? null : Number.parseInt(max, 10),
        newOrganizationsOnly: onlyNew,
        startsAt: fromLocalInput(startsAt),
        expiresAt: fromLocalInput(expiresAt),
      };
      return api<PromoCodeDto>("/api/admin/promo-codes", { method: "POST", body });
    },
    onSuccess: (created) => {
      void copyText(created.code);
      toast.success(t.codeCreated(created.code));
      void queryClient.invalidateQueries({ queryKey: ["admin", "promo-codes"] });
      onClose();
    },
  });
  const valid = Number.isFinite(amount) && amount > 0 && (kind !== "discount" || amount <= 100);
  return (
    <Dialog
      open
      onClose={onClose}
      title={t.newCode}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {texts.common.cancel}
          </Button>
          <Button loading={create.isPending} disabled={!valid} onClick={() => create.mutate()}>
            {t.createCode}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t.code} hint={t.codeHint} optional>
          <span className="flex gap-2">
            <Input
              value={code}
              maxLength={32}
              autoCapitalize="characters"
              spellCheck={false}
              placeholder={t.codePlaceholder}
              className="font-mono uppercase"
              onChange={(event) => {
                setCode(event.target.value.replace(/[^A-Za-z0-9_-]/g, "").toUpperCase());
              }}
            />
            <Button
              variant="secondary"
              size="icon"
              className="size-11 shrink-0 rounded-xl"
              aria-label={t.generate}
              title={t.generate}
              onClick={() => {
                setCode("");
              }}
            >
              <Shuffle />
            </Button>
          </span>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.kind}>
            <Select
              value={kind}
              onChange={(event) => {
                const next = event.target.value as PromoCodeKind;
                setKind(next);
                setValue(next === "credit" ? "10,00" : next === "discount" ? "20" : "50");
              }}
            >
              <option value="credit">{t.kinds.credit}</option>
              <option value="free_tickets">{t.kinds.free_tickets}</option>
              <option value="discount">{t.kinds.discount}</option>
            </Select>
          </Field>
          <Field label={t.valueLabels[kind]}>
            <Input
              inputMode={kind === "credit" ? "decimal" : "numeric"}
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
              }}
            />
          </Field>
          <Field label={t.maxUses} hint={t.maxUsesHint} optional>
            <Input
              inputMode="numeric"
              value={max}
              placeholder="∞"
              onChange={(event) => {
                setMax(event.target.value.replace(/\D/g, ""));
              }}
            />
          </Field>
          <Field label={t.description} optional>
            <Input
              value={description}
              maxLength={200}
              placeholder={t.descriptionPlaceholder}
              onChange={(event) => {
                setDescription(event.target.value);
              }}
            />
          </Field>
          <Field label={t.startsAt} optional>
            <Input
              type="datetime-local"
              value={startsAt}
              onChange={(event) => {
                setStartsAt(event.target.value);
              }}
            />
          </Field>
          <Field label={t.expiresAt} optional>
            <Input
              type="datetime-local"
              value={expiresAt}
              onChange={(event) => {
                setExpiresAt(event.target.value);
              }}
            />
          </Field>
        </div>
        <Switch checked={onlyNew} onChange={setOnlyNew} label={t.onlyNew} description={t.onlyNewHint} />
        <ErrorMessage error={create.error} />
      </div>
    </Dialog>
  );
}

function Redemptions({ code, onClose }: { code: PromoCodeDto; onClose: () => void }) {
  const uses = useQuery({
    queryKey: ["admin", "promo-codes", code.id, "redemptions"],
    queryFn: () => api<PromoRedemptionDto[]>(`/api/admin/promo-codes/${code.id}/redemptions`),
  });
  return (
    <Dialog open onClose={onClose} title={t.redemptionsOf(code.code)}>
      {uses.isPending ? (
        <LoadingBlock rows={2} />
      ) : uses.isError ? (
        <ErrorMessage error={uses.error} />
      ) : uses.data.length === 0 ? (
        <p className="py-6 text-center text-sm text-fg-muted">{t.noRedemptions}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {uses.data.map((use) => (
            <li key={use.organizationId} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span className="flex min-w-0 flex-col">
                <a href={`/painel/admin/organizacoes/${use.organizationId}`} className="truncate font-medium text-brand hover:underline">
                  {use.organizationName}
                </a>
                <span className="truncate text-xs text-fg-muted">{use.redeemedBy ?? "—"}</span>
              </span>
              <span className="text-right text-xs text-fg-subtle">
                {shortDateTime(use.redeemedAt)}
                {use.appliedAt !== null && <span className="block text-success-fg">{t.applied}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

/** Promo codes: credit, free tickets or a discount (ADR 0040). */
export function AdminCodes() {
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: ["admin", "promo-codes"], queryFn: () => api<PromoCodeDto[]>("/api/admin/promo-codes") });
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<PromoCodeDto | null>(null);
  const toggle = useMutation({
    mutationFn: (code: PromoCodeDto) => {
      const body: PromoCodeUpdateBody = {
        description: code.description,
        maxRedemptions: code.maxRedemptions,
        expiresAt: code.expiresAt,
        disabled: !code.disabled,
      };
      return api<PromoCodeDto>(`/api/admin/promo-codes/${code.id}`, { method: "PUT", body });
    },
    onSuccess: (code) => {
      toast.success(code.disabled ? t.codeOff : t.codeOn);
      void queryClient.invalidateQueries({ queryKey: ["admin", "promo-codes"] });
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
  const newButton = (
    <Button
      icon={<Plus />}
      onClick={() => {
        setCreating(true);
      }}
    >
      {t.newCode}
    </Button>
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Lead>{t.codesIntro}</Lead>
        {newButton}
      </div>
      {list.isPending ? (
        <LoadingBlock rows={3} />
      ) : list.isError ? (
        <ErrorMessage error={list.error} />
      ) : list.data.length === 0 ? (
        <EmptyState icon={TicketPercent} title={t.noCodes} description={t.noCodesHint} action={newButton} />
      ) : (
        <List>
          {list.data.map((code) => {
            const state = codeState(code);
            return (
              <ListItem key={code.id} className="flex-nowrap items-start">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="flex items-center gap-1.5 rounded-lg bg-surface-2 px-2 py-0.5 font-mono text-sm font-semibold text-fg transition hover:bg-surface-3"
                      onClick={() => {
                        void copyText(code.code).then((ok) => {
                          if (ok) {
                            toast.success(texts.common.copied);
                          }
                        });
                      }}
                      aria-label={t.copy(code.code)}
                    >
                      {code.code}
                      <Copy className="size-3 text-fg-subtle" aria-hidden />
                    </button>
                    <Badge tone={state.tone}>{state.label}</Badge>
                  </span>
                  <span className="text-sm font-medium text-fg">{benefit(code)}</span>
                  <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-fg-subtle">
                    <span className="flex items-center gap-1">
                      <Users className="size-3" aria-hidden />
                      {code.maxRedemptions === null ? t.usesUnlimited(code.redemptionsCount) : t.uses(code.redemptionsCount, code.maxRedemptions)}
                    </span>
                    {code.newOrganizationsOnly && <span>{t.onlyNewShort}</span>}
                    {code.expiresAt !== null && <span>{t.expires(shortDateTime(code.expiresAt))}</span>}
                    {code.description !== null && <span>{code.description}</span>}
                  </span>
                </div>
                <Menu
                  label={texts.event.batches.moreActions}
                  trigger={<MoreHorizontal className="size-4" aria-hidden />}
                  triggerClassName="flex size-9 items-center justify-center rounded-lg text-fg-muted transition hover:bg-surface-2 hover:text-fg"
                >
                  <MenuItem
                    icon={<Users />}
                    onSelect={() => {
                      setViewing(code);
                    }}
                  >
                    {t.redemptions}
                  </MenuItem>
                  <MenuItem
                    icon={<Power />}
                    tone={code.disabled ? "default" : "danger"}
                    onSelect={() => {
                      toggle.mutate(code);
                    }}
                  >
                    {code.disabled ? t.enable : t.disable}
                  </MenuItem>
                </Menu>
              </ListItem>
            );
          })}
        </List>
      )}
      {creating && (
        <CodeCreator
          onClose={() => {
            setCreating(false);
          }}
        />
      )}
      {viewing !== null && (
        <Redemptions
          code={viewing}
          onClose={() => {
            setViewing(null);
          }}
        />
      )}
    </div>
  );
}
