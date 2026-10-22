"use client";

import type { AccountDto } from "@ingressoimpresso/api-types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Mail } from "lucide-react";
import { toast } from "sonner";

import { Card, CardHeader, Switch, errorMessage } from "@/components/ui";
import { api } from "@/lib/api";
import { account as accountTexts } from "@/texts/pt-BR/account";

const t = accountTexts.emails;

/** Which optional e-mails the account receives: the announcements (ADR 0107) and the reminders (ADR 0118). */
export function EmailPreferencesCard({ account }: { account: AccountDto }) {
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (change: { announcementEmails?: boolean; reminderEmails?: boolean }) =>
      api<AccountDto>("/api/account/preferences", {
        method: "PUT",
        body: {
          announcementEmails: change.announcementEmails ?? account.announcementEmails,
          reminderEmails: change.reminderEmails ?? account.reminderEmails,
        },
      }),
    onSuccess: (updated, change) => {
      queryClient.setQueryData(["account"], updated);
      if (change.reminderEmails !== undefined) {
        toast.success(updated.reminderEmails ? t.remindersOn : t.remindersOff);
      } else {
        toast.success(updated.announcementEmails ? t.on : t.off);
      }
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
  const pending = save.isPending ? save.variables : undefined;
  return (
    <Card>
      <CardHeader icon={Mail} title={t.title} description={t.hint} />
      <div className="flex flex-col gap-4">
        <Switch
          checked={pending?.announcementEmails ?? account.announcementEmails}
          onChange={(checked) => {
            save.mutate({ announcementEmails: checked });
          }}
          label={t.announcements}
          description={t.announcementsHint}
        />
        <Switch
          checked={pending?.reminderEmails ?? account.reminderEmails}
          onChange={(checked) => {
            save.mutate({ reminderEmails: checked });
          }}
          label={t.reminders}
          description={t.remindersHint}
        />
      </div>
    </Card>
  );
}
