"use client";

import type { AdminBatchDto, AdminOrganizationDto, AdminOverviewDto, BatchStatus } from "@ingressoimpresso/api-types";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  Building2,
  CalendarDays,
  CircleDollarSign,
  ExternalLink,
  Gift,
  Hourglass,
  Search,
  Ticket,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useState } from "react";
import { toast } from "sonner";

import { BarChart } from "@/components/admin/bar-chart";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Dialog,
  EmptyState,
  ErrorMessage,
  Field,
  Input,
  List,
  ListItem,
  LoadingBlock,
  errorMessage,
  NumberInput,
  Stat,
  useConfirm,
  type Tone,
} from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { money, shortDateTime } from "@/lib/format";
import { texts } from "@/texts/pt-BR";

const t = texts.admin;
const integer = (value: number) => value.toLocaleString("pt-BR");

type Metric = "revenue" | "tickets" | "signups";

export function AdminOverview() {
  const overview = useQuery({ queryKey: ["admin", "overview"], queryFn: () => api<AdminOverviewDto>("/api/admin/overview") });
  const [metric, setMetric] = useState<Metric>("revenue");
  if (overview.isPending) {
    return <LoadingBlock rows={4} />;
  }
  if (overview.isError) {
    return <ErrorMessage error={overview.error} />;
  }
  const o = overview.data;
  const perTicket = o.paidTickets - o.freeTickets > 0 ? o.revenueCents / (o.paidTickets - o.freeTickets) : 0;
  const metrics: Record<Metric, { label: string; format: (value: number) => string; value: (day: AdminOverviewDto["days"][number]) => number }> = {
    revenue: { label: t.chartRevenue, format: money, value: (day) => day.revenueCents },
    tickets: { label: t.chartTickets, format: integer, value: (day) => day.tickets },
    signups: { label: t.chartSignups, format: integer, value: (day) => day.signups },
  };
  const chosen = metrics[metric];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t.stats.revenue} value={money(o.revenueCents)} hint={`${t.stats.ticketShare}: ${money(Math.round(perTicket))}`} icon={CircleDollarSign} tone="success" />
        <Stat label={t.stats.revenue30} value={money(o.revenue30dCents)} icon={TrendingUp} tone="success" />
        <Stat label={t.stats.paidTickets} value={integer(o.paidTickets)} icon={Ticket} />
        <Stat
          label={t.stats.awaiting}
          value={integer(o.awaitingBatches)}
          hint={t.stats.processing(o.processingPayments)}
          icon={Hourglass}
          tone={o.awaitingBatches > 0 ? "warning" : "brand"}
        />
        <Stat label={t.stats.organizations} value={integer(o.organizations)} hint={t.stats.newOrganizations(o.newOrganizations)} icon={Building2} />
        <Stat label={t.stats.events} value={integer(o.events)} hint={t.stats.upcoming(o.upcomingEvents)} icon={CalendarDays} />
        <Stat label={t.stats.usersLabel} value={integer(o.users)} icon={BadgeCheck} />
        <Stat label={t.stats.freeLabel} value={integer(o.freeTickets)} hint={t.stats.freeHint} icon={Gift} />
      </div>
      <Card>
        <CardHeader
          icon={TrendingUp}
          title={t.chartTitle}
          description={t.chartDescription}
          actions={
            <div role="radiogroup" aria-label={t.chartTitle} className="flex rounded-full border border-border bg-surface-2 p-0.5">
              {(Object.keys(metrics) as Metric[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={metric === option}
                  onClick={() => {
                    setMetric(option);
                  }}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium transition",
                    metric === option ? "bg-surface text-fg shadow-sm ring-1 ring-border" : "text-fg-muted hover:text-fg",
                  )}
                >
                  {metrics[option].label}
                </button>
              ))}
            </div>
          }
        />
        <BarChart
          label={chosen.label}
          bars={o.days.map((day) => ({ date: day.date, value: chosen.value(day) }))}
          format={chosen.format}
          describe={t.chartBar}
        />
      </Card>
    </div>
  );
}

function SearchBox({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <span className="relative flex w-full sm:max-w-sm">
      <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
      <Input
        type="search"
        value={value}
        placeholder={t.search}
        aria-label={t.search}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        className="pl-10"
      />
    </span>
  );
}

function BonusDialog({ organization, onClose }: { organization: AdminOrganizationDto | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [bonus, setBonus] = useState(organization?.bonusFreeTickets ?? 0);
  const save = useMutation({
    mutationFn: (value: number) =>
      api<AdminOrganizationDto>(`/api/admin/organizations/${organization?.id ?? ""}/bonus`, { method: "PUT", body: { bonusFreeTickets: value } }),
    onSuccess: () => {
      toast.success(t.organizations.bonusSaved);
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
      onClose();
    },
  });
  const base = organization === null ? 0 : organization.freeTotal - organization.bonusFreeTickets;
  return (
    <Dialog
      open={organization !== null}
      onClose={onClose}
      size="sm"
      title={t.organizations.bonusTitle(organization?.name ?? "")}
      description={t.organizations.bonusDescription(base)}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {texts.common.cancel}
          </Button>
          <Button
            icon={<Gift />}
            loading={save.isPending}
            disabled={!Number.isInteger(bonus) || bonus < 0}
            onClick={() => {
              save.mutate(bonus);
            }}
          >
            {texts.common.save}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate(bonus);
        }}
        className="flex flex-col gap-3"
      >
        <Field label={t.organizations.bonusLabel}>
          <NumberInput value={bonus} step={10} min={0} max={100_000} onChange={setBonus} />
        </Field>
        <ErrorMessage error={save.error} />
      </form>
    </Dialog>
  );
}

export function AdminOrganizations() {
  const [query, setQuery] = useState("");
  const search = useDeferredValue(query.trim());
  const [editing, setEditing] = useState<AdminOrganizationDto | null>(null);
  const organizations = useQuery({
    queryKey: ["admin", "organizations", search],
    queryFn: () => api<AdminOrganizationDto[]>(`/api/admin/organizations?q=${encodeURIComponent(search)}`),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="flex flex-col gap-4">
      <SearchBox value={query} onChange={setQuery} />
      {organizations.isPending ? (
        <LoadingBlock rows={4} />
      ) : organizations.isError ? (
        <ErrorMessage error={organizations.error} />
      ) : organizations.data.length === 0 ? (
        <EmptyState icon={Building2} title={t.organizations.empty} />
      ) : (
        <List className={cn(organizations.isPlaceholderData && "opacity-60")}>
          {organizations.data.map((organization) => (
            <ListItem key={organization.id} className="justify-between">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-semibold text-fg">{organization.name}</span>
                  {organization.bonusFreeTickets > 0 && (
                    <Badge tone="brand">
                      <Gift className="size-3" aria-hidden />
                      {t.organizations.bonusBadge(organization.bonusFreeTickets)}
                    </Badge>
                  )}
                </span>
                <span className="truncate text-sm text-fg-muted">{organization.ownerEmail ?? "—"}</span>
                <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-fg-subtle">
                  <span>{t.organizations.created(shortDateTime(organization.createdAt))}</span>
                  <span>{t.organizations.events(organization.eventCount)}</span>
                  <span>{t.organizations.free(organization.freeUsed, organization.freeTotal)}</span>
                  <span>
                    {organization.lastBatchAt === null ? t.organizations.noBatch : t.organizations.lastBatch(shortDateTime(organization.lastBatchAt))}
                  </span>
                </span>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex flex-col items-end text-sm">
                  <span className="font-semibold text-fg tabular">{money(organization.revenueCents)}</span>
                  <span className="text-xs text-fg-muted tabular">{t.organizations.tickets(organization.paidTickets)}</span>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Gift />}
                  onClick={() => {
                    setEditing(organization);
                  }}
                >
                  {t.organizations.bonus}
                </Button>
              </div>
            </ListItem>
          ))}
        </List>
      )}
      {/* Remount per organization so the field starts from its current bonus. */}
      <BonusDialog
        key={editing?.id ?? "none"}
        organization={editing}
        onClose={() => {
          setEditing(null);
        }}
      />
    </div>
  );
}

type BatchFilter = BatchStatus | "all";
const STATUS_TONE: Record<BatchStatus, Tone> = { awaiting_payment: "warning", paid: "success", canceled: "neutral" };

export function AdminBatches() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [filter, setFilter] = useState<BatchFilter>("awaiting_payment");
  const [query, setQuery] = useState("");
  const search = useDeferredValue(query.trim());
  const batches = useQuery({
    queryKey: ["admin", "batches", filter, search],
    queryFn: () =>
      api<AdminBatchDto[]>(`/api/admin/batches?status=${filter === "all" ? "" : filter}&q=${encodeURIComponent(search)}`),
    placeholderData: keepPreviousData,
  });
  const markPaid = useMutation({
    mutationFn: (batchId: string) => api(`/api/admin/batches/${batchId}/mark-paid`, { method: "POST" }),
    onSuccess: () => {
      toast.success(t.batches.markedPaid);
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
  const b = texts.event.batches;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div role="radiogroup" aria-label={texts.admin.tabs.batches} className="flex w-fit rounded-full border border-border bg-surface-2 p-0.5">
          {(Object.keys(t.batches.filters) as BatchFilter[]).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={filter === option}
              onClick={() => {
                setFilter(option);
              }}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-medium transition",
                filter === option ? "bg-surface text-fg shadow-sm ring-1 ring-border" : "text-fg-muted hover:text-fg",
              )}
            >
              {t.batches.filters[option]}
            </button>
          ))}
        </div>
        <SearchBox value={query} onChange={setQuery} />
      </div>
      {batches.isPending ? (
        <LoadingBlock rows={4} />
      ) : batches.isError ? (
        <ErrorMessage error={batches.error} />
      ) : batches.data.length === 0 ? (
        <EmptyState icon={Ticket} title={t.batches.empty} />
      ) : (
        <List className={cn(batches.isPlaceholderData && "opacity-60")}>
          {batches.data.map(({ batch, eventId, eventName, organizationName, ownerEmail }) => {
            const quantity = batch.last - batch.first + 1;
            const payable = batch.status === "awaiting_payment" && batch.pendingPayment !== "processing";
            return (
              <ListItem key={batch.id} className="justify-between">
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-semibold text-fg">{eventName}</span>
                    <Badge tone={STATUS_TONE[batch.status]} dot>
                      {b.status[batch.status]}
                    </Badge>
                    {batch.paidVia !== null && batch.status === "paid" && <Badge tone="neutral">{b.paidVia[batch.paidVia]}</Badge>}
                    {batch.pendingPayment !== null && batch.status === "awaiting_payment" && (
                      <Badge tone="brand">{b.pendingState[batch.pendingPayment]}</Badge>
                    )}
                  </span>
                  <span className="truncate text-sm text-fg-muted">
                    {organizationName}
                    {ownerEmail === null ? "" : ` · ${ownerEmail}`}
                  </span>
                  <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-fg-subtle">
                    <span>{t.batches.numbers(batch.first, batch.last)}</span>
                    <span>{t.batches.created(shortDateTime(batch.createdAt))}</span>
                    {batch.paidAt !== null && <span>{t.batches.paid(shortDateTime(batch.paidAt))}</span>}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex flex-col items-end text-sm">
                    <span className="font-semibold text-fg tabular">{batch.priceCents === 0 ? b.free : money(batch.priceCents)}</span>
                    <span className="text-xs text-fg-muted tabular">{t.batches.quantity(quantity)}</span>
                  </div>
                  <Link
                    href={`/painel/eventos/${eventId}?aba=lotes`}
                    aria-label={t.batches.openEvent}
                    title={t.batches.openEvent}
                    className="flex size-9 items-center justify-center rounded-lg text-fg-muted transition hover:bg-surface-2 hover:text-fg"
                  >
                    <ExternalLink className="size-4" aria-hidden />
                  </Link>
                  {payable && (
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<BadgeCheck />}
                      loading={markPaid.isPending && markPaid.variables === batch.id}
                      onClick={async () => {
                        if (await confirm({ title: b.markPaidConfirmTitle, description: b.markPaidConfirmBody, confirmLabel: b.markPaid, danger: false })) {
                          markPaid.mutate(batch.id);
                        }
                      }}
                    >
                      {b.markPaid}
                    </Button>
                  )}
                </div>
              </ListItem>
            );
          })}
        </List>
      )}
    </div>
  );
}
