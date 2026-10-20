"use client";

import type { AccountDto } from "@ingressoimpresso/api-types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Mail } from "lucide-react";
import { toast } from "sonner";

import { Card, CardHeader, Switch, errorMessage } from "@/components/ui";
import { api } from "@/lib/api";
import { account as accountTexts } from "@/texts/pt-BR/account";

const t = accountTexts.emails;

/** Which optional e-mails the account receives (ADR 0107): the platform's announcements. */
export function EmailPreferencesCard({ account }: { account: AccountDto }) {
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (announcementEmails: boolean) =>
      api<AccountDto>("/api/account/preferences", {
        method: "PUT",
        body: { announcementEmails },
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["account"], updated);
      toast.success(updated.announcementEmails ? t.on : t.off);
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
  return (
    <Card>
      <CardHeader icon={Mail} title={t.title} description={t.hint} />
      <Switch
        checked={
          save.isPending
            ? (save.variables ?? account.announcementEmails)
            : account.announcementEmails
        }
        onChange={(checked) => {
          save.mutate(checked);
        }}
        label={t.announcements}
        description={t.announcementsHint}
      />
    </Card>
  );
}
