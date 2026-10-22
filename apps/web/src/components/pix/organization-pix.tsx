"use client";

import type { PixAccountBody, PixAccountDto } from "@ingressoimpresso/api-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QrCode } from "lucide-react";
import { toast } from "sonner";

import { PixAccountForm } from "@/components/pix/pix-account-form";
import { Card, CardHeader, ErrorMessage, LoadingBlock, errorMessage, useConfirm } from "@/components/ui";
import { api } from "@/lib/api";
import { pix as pixTexts } from "@/texts/pt-BR/pix";

const t = pixTexts;
export const ORGANIZATION_PIX_KEY = ["organization-pix"];

/** The organization's Pix key (ADR 0085), on Minha organização. */
export function OrganizationPix({ organizationName }: { organizationName: string }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const account = useQuery({ queryKey: ORGANIZATION_PIX_KEY, queryFn: () => api<PixAccountDto | null>("/api/account/pix") });
  const refresh = (data: PixAccountDto | null) => {
    queryClient.setQueryData(ORGANIZATION_PIX_KEY, data);
    // Events show the key in their Pix card.
    void queryClient.invalidateQueries({ queryKey: ["event-pix"] });
  };
  const save = useMutation({
    mutationFn: (body: PixAccountBody) => api<PixAccountDto>("/api/account/pix", { method: "PUT", body }),
    onSuccess: (data) => {
      refresh(data);
      toast.success(t.saved);
    },
  });
  const remove = useMutation({
    mutationFn: () => api("/api/account/pix", { method: "DELETE" }),
    onSuccess: () => {
      refresh(null);
      toast.success(t.removed);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Card className="scroll-mt-28">
      <CardHeader icon={QrCode} title={t.orgTitle} description={t.orgDescription} />
      {account.isPending ? (
        <LoadingBlock rows={2} />
      ) : account.isError ? (
        <ErrorMessage error={account.error} onRetry={() => void account.refetch()} />
      ) : (
        <PixAccountForm
          key={account.dataUpdatedAt}
          initial={account.data}
          defaultName={organizationName}
          saving={save.isPending}
          removing={remove.isPending}
          error={save.error}
          onSave={(body) => {
            save.mutate(body);
          }}
          onRemove={() => {
            void confirm({ title: t.removeTitle, description: t.removeBody, confirmLabel: t.remove }).then((ok) => {
              if (ok) {
                remove.mutate();
              }
            });
          }}
        />
      )}
      <p className="mt-4 border-t border-border pt-4 text-xs leading-relaxed text-fg-muted">{t.noFee}</p>
    </Card>
  );
}
