"use client";

import type { CreditsDto, CreditReason, RedeemResultDto } from "@ingressoimpresso/api-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, ChevronDown, Coins, TicketPercent } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button, Card, CardHeader, ErrorMessage, Input, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { money, shortDateTime } from "@/lib/format";
import { texts } from "@/texts/pt-BR";

const t = texts.credits;
const SHOWN = 4;

function redeemed(result: RedeemResultDto): string {
  switch (result.kind) {
    case "credit":
      return t.redeemedCredit(money(result.creditCents ?? 0));
    case "free_tickets":
      return t.redeemedFree(result.freeTickets ?? 0);
    case "discount":
      return t.redeemedDiscount(result.discountPercent ?? 0);
  }
}

const REASONS: Record<CreditReason, string> = t.reasons;

/** The organization's credit and the promo code field (ADR 0040). */
export function CreditsCard() {
  const queryClient = useQueryClient();
  const credits = useQuery({ queryKey: ["credits"], queryFn: () => api<CreditsDto>("/api/account/credits") });
  const [code, setCode] = useState("");
  const [expanded, setExpanded] = useState(false);
  const redeem = useMutation({
    mutationFn: () => api<RedeemResultDto>("/api/account/redeem", { method: "POST", body: { code: code.trim() } }),
    onSuccess: (result) => {
      toast.success(redeemed(result));
      setCode("");
      void queryClient.invalidateQueries({ queryKey: ["credits"] });
      void queryClient.invalidateQueries({ queryKey: ["account"] });
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (code.trim() !== "") {
      redeem.mutate();
    }
  };
  const data = credits.data;
  const entries = data?.entries ?? [];
  const shown = expanded ? entries : entries.slice(0, SHOWN);

  return (
    <Card>
      <CardHeader icon={Coins} title={t.title} description={t.hint} />
      <div className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs text-fg-muted">{t.balance}</span>
          {data === undefined ? (
            <Skeleton className="h-8 w-24" />
          ) : (
            <span className={cn("text-2xl font-semibold tracking-tight tabular", data.balanceCents > 0 ? "text-success-fg" : "text-fg")}>
              {money(data.balanceCents)}
            </span>
          )}
        </div>
        {data?.pendingDiscount !== undefined && data.pendingDiscount !== null && (
          <p className="flex items-center gap-2 rounded-xl bg-success-soft px-3 py-2.5 text-sm text-success-fg">
            <TicketPercent className="size-4 shrink-0" aria-hidden />
            {t.pendingDiscount(data.pendingDiscount.code, data.pendingDiscount.discountPercent)}
          </p>
        )}
        <form onSubmit={submit} className="flex gap-2">
          <Input
            value={code}
            placeholder={t.codePlaceholder}
            aria-label={t.codeLabel}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            maxLength={32}
            className="font-mono uppercase placeholder:font-sans placeholder:normal-case"
            onChange={(event) => {
              setCode(event.target.value.toUpperCase());
              redeem.reset();
            }}
          />
          <Button type="submit" variant="secondary" loading={redeem.isPending} disabled={code.trim() === ""}>
            {t.apply}
          </Button>
        </form>
        <ErrorMessage error={redeem.error} />
        {entries.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold tracking-wide text-fg-subtle uppercase">{t.history}</span>
            <ul className="flex flex-col divide-y divide-border">
              {shown.map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 py-2.5">
                  <span
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-full",
                      entry.amountCents > 0 ? "bg-success-soft text-success-fg" : "bg-surface-2 text-fg-muted",
                    )}
                  >
                    {entry.amountCents > 0 ? <ArrowDownLeft className="size-3.5" aria-hidden /> : <ArrowUpRight className="size-3.5" aria-hidden />}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm text-fg">{REASONS[entry.reason]}</span>
                    <span className="truncate text-xs text-fg-subtle">
                      {[entry.note, shortDateTime(entry.createdAt)].filter((part) => part !== null && part !== "").join(" · ")}
                    </span>
                  </span>
                  <span className={cn("text-sm font-semibold tabular", entry.amountCents > 0 ? "text-success-fg" : "text-fg")}>
                    {entry.amountCents > 0 ? "+" : "−"}
                    {money(Math.abs(entry.amountCents))}
                  </span>
                </li>
              ))}
            </ul>
            {entries.length > SHOWN && (
              <button
                type="button"
                onClick={() => {
                  setExpanded(!expanded);
                }}
                className="flex items-center gap-1 self-start text-sm font-medium text-brand"
              >
                {expanded ? t.less : t.more(entries.length - SHOWN)}
                <ChevronDown className={cn("size-4 transition", expanded && "rotate-180")} aria-hidden />
              </button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
