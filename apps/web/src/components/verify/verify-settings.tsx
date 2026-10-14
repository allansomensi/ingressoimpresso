"use client";

import type { VerifySettingsDto } from "@ingressoimpresso/api-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { Card, CardHeader, Switch, errorMessage } from "@/components/ui";
import { api } from "@/lib/api";
import { verifyPage as verifyPageTexts } from "@/texts/pt-BR";

const t = verifyPageTexts.settings;

/** Whether anyone holding a ticket of the event may check it on /conferir (ADR 0075). */
export function PublicVerifyCard({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient();
  const key = ["verify-settings", eventId];
  const settings = useQuery({ queryKey: key, queryFn: () => api<VerifySettingsDto>(`/api/events/${eventId}/verify-settings`) });
  const save = useMutation({
    mutationFn: (body: VerifySettingsDto) => api<VerifySettingsDto>(`/api/events/${eventId}/verify-settings`, { method: "PUT", body }),
    onSuccess: (saved) => {
      queryClient.setQueryData(key, saved);
      toast.success(t.saved(saved.publicVerify));
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
  if (settings.data === undefined) {
    return null;
  }
  const on = save.isPending ? save.variables.publicVerify : settings.data.publicVerify;
  return (
    <Card>
      <CardHeader icon={ShieldCheck} title={t.title} description={t.description} />
      <div className="flex flex-col gap-4">
        <Switch
          checked={on}
          onChange={(checked) => {
            if (!save.isPending) {
              save.mutate({ publicVerify: checked });
            }
          }}
          label={t.toggle}
          description={on ? t.on : t.off}
        />
        <Link
          href="/conferir"
          target="_blank"
          className="relative inline-flex w-fit items-center gap-1.5 text-sm font-medium text-brand transition touch-target hover:text-brand-hover"
        >
          {t.open}
          <ExternalLink aria-hidden className="size-3.5" />
        </Link>
      </div>
    </Card>
  );
}
