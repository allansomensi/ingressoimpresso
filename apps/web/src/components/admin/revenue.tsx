"use client";

import type { AdminOverviewDto, RefundSyncDto } from "@ingressoimpresso/api-types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Button, Card, CardHeader, errorMessage } from "@/components/ui";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import { texts } from "@/texts/pt-BR";

const t = texts.admin.revenue;

/** Net revenue in large type, with the gross and the refunds that make it. */
function Period({ label, gross, refunds, net }: { label: string; gross: number; refunds: number; net: number }) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[13px] font-medium text-fg-muted">{label}</span>
        <span className="truncate text-3xl font-semibold tracking-tight text-success-fg tabular sm:text-4xl">{money(net)}</span>
        <span className="text-xs text-fg-subtle">{t.netLabel}</span>
      </div>
      <dl className="grid grid-cols-2 gap-3 border-t border-border pt-3 text-sm">
        <div className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-fg-muted">{t.gross}</dt>
          <dd className="truncate font-semibold text-fg tabular">{money(gross)}</dd>
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-fg-muted">{t.refunds}</dt>
          <dd className="truncate font-semibold text-danger-fg tabular">{refunds > 0 ? `−${money(refunds)}` : money(0)}</dd>
        </div>
      </dl>
    </div>
  );
}

export function RevenueCard({ overview: o }: { overview: AdminOverviewDto }) {
  const queryClient = useQueryClient();
  const sync = useMutation({
    mutationFn: () => api<RefundSyncDto>("/api/admin/payments/sync-refunds", { method: "POST" }),
    onSuccess: (result) => {
      toast.success(t.synced(result));
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
  return (
    <Card>
      <CardHeader
        icon={Wallet}
        title={t.title}
        description={t.description}
        actions={
          <Button variant="secondary" size="sm" icon={<RefreshCw />} loading={sync.isPending} onClick={() => sync.mutate()}>
            {t.sync}
          </Button>
        }
      />
      <div className="grid gap-6 sm:grid-cols-2 sm:gap-8">
        <Period label={t.total} gross={o.grossCents} refunds={o.refundsCents} net={o.netCents} />
        <Period label={t.last30} gross={o.gross30dCents} refunds={o.refunds30dCents} net={o.net30dCents} />
      </div>
    </Card>
  );
}
