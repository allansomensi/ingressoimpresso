"use client";

import type { TicketSettingsDto } from "@ingressoimpresso/api-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Repeat } from "lucide-react";
import { toast } from "sonner";

import { useEventAccess, useEventTexts } from "@/components/event/access";
import { Card, CardHeader, Switch, errorMessage } from "@/components/ui";
import { api } from "@/lib/api";

/** Whether holders of digital tickets may pass them on themselves (ADR 0097). */
export function TransferSettingsCard({ eventId }: { eventId: string }) {
  const t = useEventTexts().digital.transfers;
  const { can } = useEventAccess();
  const queryClient = useQueryClient();
  const key = ["ticket-settings", eventId];
  const settings = useQuery({ queryKey: key, queryFn: () => api<TicketSettingsDto>(`/api/events/${eventId}/ticket-settings`) });
  const save = useMutation({
    mutationFn: (body: TicketSettingsDto) => api<TicketSettingsDto>(`/api/events/${eventId}/ticket-settings`, { method: "PUT", body }),
    onSuccess: (saved) => {
      queryClient.setQueryData(key, saved);
      toast.success(saved.transfers ? t.savedOn : t.savedOff);
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
  if (settings.data === undefined) {
    return null;
  }
  const on = save.isPending ? save.variables.transfers : settings.data.transfers;
  return (
    <Card>
      <CardHeader icon={Repeat} title={t.title} description={t.description} />
      {can("delivery") ? (
        <Switch
          checked={on}
          onChange={(checked) => {
            if (!save.isPending) {
              save.mutate({ transfers: checked });
            }
          }}
          label={t.toggle}
          description={on ? t.on : t.off}
        />
      ) : (
        <p className="text-sm text-fg-muted">{on ? t.on : t.off}</p>
      )}
    </Card>
  );
}
