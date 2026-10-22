"use client";

import type { AdminDisputeDto } from "@ingressoimpresso/api-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, CircleSlash, ExternalLink, LockOpen, Scale, Undo2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { Badge, Button, Card, CardHeader, EmptyState, ErrorMessage, LoadingBlock, buttonClass, errorMessage, useConfirm, type Tone } from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { money, shortDateTime } from "@/lib/format";
import { admin as adminTexts } from "@/texts/pt-BR/admin";

const t = adminTexts.disputes;
const KEY = ["admin", "disputes"];

function statusTone(dispute: AdminDisputeDto): Tone {
  if (dispute.status === "won") {
    return "success";
  }
  if (dispute.status === "lost") {
    return "danger";
  }
  return dispute.open ? "warning" : "neutral";
}

function DisputeCard({ dispute }: { dispute: AdminDisputeDto }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const act = useMutation({
    mutationFn: (action: "block" | "unblock" | "settle") =>
      api<AdminDisputeDto>(`/api/admin/disputes/${encodeURIComponent(dispute.id)}/${action}`, { method: "POST" }),
    onSuccess: (_, action) => {
      toast.success(action === "block" ? t.blockedToast : action === "unblock" ? t.unblockedToast : t.settledToast);
      void queryClient.invalidateQueries({ queryKey: KEY });
      void queryClient.invalidateQueries({ queryKey: ["admin", "alerts"] });
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
  const run = async (action: "block" | "unblock" | "settle") => {
    if (action === "block" && !(await confirm({ title: t.blockTitle, description: t.blockBody, confirmLabel: t.block, danger: true }))) {
      return;
    }
    if (action === "settle" && !(await confirm({ title: t.settleTitle, description: t.settleBody, confirmLabel: t.settle, danger: true }))) {
      return;
    }
    act.mutate(action);
  };
  const paid = dispute.batchStatus === "paid";
  return (
    <Card className={cn("flex flex-col gap-3", dispute.open && "border-warning/50")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-2xl font-semibold text-fg tabular">{money(dispute.amountCents)}</span>
          <span className="text-sm text-fg-muted">{t.reasons[dispute.reason] ?? dispute.reason}</span>
        </div>
        <Badge tone={statusTone(dispute)} dot={dispute.open} pulse={dispute.open}>
          {t.statuses[dispute.status] ?? dispute.status}
        </Badge>
      </div>
      <div className="flex flex-col gap-0.5 text-sm">
        {dispute.eventName === null ? (
          <span className="text-fg-muted">{t.noBatch}</span>
        ) : (
          <>
            <span className="font-medium text-fg">
              {dispute.eventName}
              {dispute.organizationName !== null && <span className="font-normal text-fg-muted"> · {dispute.organizationName}</span>}
            </span>
            {dispute.first !== null && dispute.last !== null && <span className="text-fg-muted tabular">{t.numbers(dispute.first, dispute.last)}</span>}
          </>
        )}
      </div>
      <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-fg-muted">
        <span>{t.openedAt(shortDateTime(dispute.openedAt))}</span>
        {dispute.open && dispute.evidenceDueBy !== null && <span className="font-medium text-warning-fg">{t.due(shortDateTime(dispute.evidenceDueBy))}</span>}
        {dispute.closedAt !== null && <span>{t.closedAt(shortDateTime(dispute.closedAt))}</span>}
      </p>
      {(dispute.blocked || dispute.settled) && (
        <p className="flex flex-wrap gap-2">
          {dispute.blocked && (
            <Badge tone="danger">
              <Ban className="size-3" aria-hidden />
              {t.blocked}
            </Badge>
          )}
          {dispute.settled && (
            <Badge tone="neutral">
              <CircleSlash className="size-3" aria-hidden />
              {t.settled}
            </Badge>
          )}
        </p>
      )}
      <div className="mt-auto flex flex-wrap gap-2 pt-1">
        <a
          href={`https://dashboard.stripe.com/disputes/${encodeURIComponent(dispute.id)}`}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClass({ variant: "secondary", size: "sm" })}
        >
          <ExternalLink />
          {t.stripe}
        </a>
        {dispute.eventId !== null && (
          <Link href={`/painel/eventos/${dispute.eventId}?aba=lotes`} className={buttonClass({ variant: "ghost", size: "sm" })}>
            {t.event}
          </Link>
        )}
        {paid && !dispute.blocked && !dispute.settled && dispute.open && (
          <Button size="sm" variant="secondary" icon={<Ban />} loading={act.isPending && act.variables === "block"} onClick={() => void run("block")}>
            {t.block}
          </Button>
        )}
        {dispute.blocked && (
          <Button size="sm" variant="secondary" icon={<LockOpen />} loading={act.isPending && act.variables === "unblock"} onClick={() => void run("unblock")}>
            {t.unblock}
          </Button>
        )}
        {dispute.status === "lost" && paid && !dispute.settled && (
          <Button size="sm" variant="danger" icon={<Undo2 />} loading={act.isPending && act.variables === "settle"} onClick={() => void run("settle")}>
            {t.settle}
          </Button>
        )}
      </div>
    </Card>
  );
}

/**
 * Disputed card payments (ADR 0104): what Stripe says of each one, and what the admins decide for
 * the batch's numbers (blocked while it lasts, refunded for good when lost).
 */
export function AdminDisputes() {
  const disputes = useQuery({ queryKey: KEY, queryFn: () => api<AdminDisputeDto[]>("/api/admin/disputes") });
  if (disputes.isPending) {
    return <LoadingBlock rows={3} />;
  }
  if (disputes.isError) {
    return <ErrorMessage error={disputes.error} onRetry={() => void disputes.refetch()} />;
  }
  const open = disputes.data.filter((dispute) => dispute.open).length;
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader title={t.title} description={t.description} icon={Scale} />
        {open > 0 && (
          <Badge tone="warning" dot pulse className="w-fit">
            {t.open(open)}
          </Badge>
        )}
      </Card>
      {disputes.data.length === 0 ? (
        <EmptyState icon={Scale} title={t.emptyTitle} description={t.empty} />
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {disputes.data.map((dispute) => (
            <DisputeCard key={dispute.id} dispute={dispute} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Open disputes (the mark of the section). */
export function useOpenDisputes(enabled: boolean): number {
  const disputes = useQuery({ queryKey: KEY, queryFn: () => api<AdminDisputeDto[]>("/api/admin/disputes"), enabled, refetchInterval: 300_000 });
  return disputes.data?.filter((dispute) => dispute.open).length ?? 0;
}
