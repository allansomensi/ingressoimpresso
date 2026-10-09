"use client";

import type { CreditsDto } from "@ingressoimpresso/api-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Coins, Minus, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button, Card, CardHeader, ErrorMessage, Field, Input, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { money, parseMoney, shortDateTime } from "@/lib/format";
import { texts } from "@/texts/pt-BR";

const t = texts.admin.organization;

/** An organization's credit, as support sees and adjusts it (ADR 0040). */
export function OrganizationCredits({ organizationId }: { organizationId: string }) {
  const queryClient = useQueryClient();
  const key = ["admin", "credits", organizationId];
  const credits = useQuery({ queryKey: key, queryFn: () => api<CreditsDto>(`/api/admin/organizations/${organizationId}/credits`) });
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const typed = parseMoney(amount);
  const cents = typed.ok ? (typed.cents ?? 0) : 0;
  const adjust = useMutation({
    mutationFn: (sign: 1 | -1) =>
      api<CreditsDto>(`/api/admin/organizations/${organizationId}/credits`, {
        method: "POST",
        body: { amountCents: sign * cents, note: note.trim() === "" ? null : note.trim() },
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(key, data);
      toast.success(t.creditSaved);
      setAmount("");
      setNote("");
    },
  });
  const data = credits.data;
  return (
    <Card>
      <CardHeader icon={Coins} title={t.credit} description={t.creditHint} />
      <div className="flex flex-col gap-4">
        {data === undefined ? (
          <Skeleton className="h-8 w-28" />
        ) : (
          <span className="text-2xl font-semibold tracking-tight text-fg tabular">{money(data.balanceCents)}</span>
        )}
        {data?.pendingDiscount != null && (
          <p className="text-xs text-success-fg">{texts.credits.pendingDiscount(data.pendingDiscount.code, data.pendingDiscount.discountPercent)}</p>
        )}
        <div className="grid grid-cols-[1fr_auto_auto] items-end gap-2">
          <Field label={t.creditAmount}>
            <Input
              inputMode="decimal"
              value={amount}
              placeholder="10,00"
              onChange={(event) => {
                setAmount(event.target.value);
                adjust.reset();
              }}
            />
          </Field>
          <Button
            variant="secondary"
            size="icon"
            className="size-11 rounded-xl"
            aria-label={t.creditRemove}
            disabled={cents <= 0}
            loading={adjust.isPending && adjust.variables === -1}
            onClick={() => adjust.mutate(-1)}
          >
            <Minus />
          </Button>
          <Button
            size="icon"
            className="size-11 rounded-xl"
            aria-label={t.creditAdd}
            disabled={cents <= 0}
            loading={adjust.isPending && adjust.variables === 1}
            onClick={() => adjust.mutate(1)}
          >
            <Plus />
          </Button>
        </div>
        <Field label={t.creditNote} hint={t.creditNoteHint} optional>
          <Input
            value={note}
            maxLength={200}
            onChange={(event) => {
              setNote(event.target.value);
            }}
          />
        </Field>
        <ErrorMessage error={adjust.error} />
        {data !== undefined && data.entries.length > 0 && (
          <ul className="flex flex-col divide-y divide-border">
            {data.entries.slice(0, 8).map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-fg">{texts.credits.reasons[entry.reason]}</span>
                  <span className="truncate text-xs text-fg-subtle">
                    {[entry.note, shortDateTime(entry.createdAt)].filter((part) => part !== null && part !== "").join(" · ")}
                  </span>
                </span>
                <span className={cn("font-semibold tabular", entry.amountCents > 0 ? "text-success-fg" : "text-fg")}>
                  {entry.amountCents > 0 ? "+" : "−"}
                  {money(Math.abs(entry.amountCents))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
