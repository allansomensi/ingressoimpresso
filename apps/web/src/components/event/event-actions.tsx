"use client";

import type { EventDto, EventStatus } from "@ingressoimpresso/api-types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, Copy, MoreHorizontal, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Menu, MenuItem, buttonClass, errorMessage, useConfirm } from "@/components/ui";
import { api } from "@/lib/api";
import { texts } from "@/texts/pt-BR";

const t = texts.event.actions;

/** Duplicate, archive or reopen, and delete an event. */
export function EventActions({ event }: { event: EventDto }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const confirm = useConfirm();
  const fail = (error: Error) => {
    toast.error(errorMessage(error));
  };

  const duplicate = useMutation({
    mutationFn: () => api<EventDto>(`/api/events/${event.id}/duplicate`, { method: "POST" }),
    onSuccess: (copy) => {
      toast.success(t.duplicated);
      void queryClient.invalidateQueries({ queryKey: ["events"] });
      router.push(`/painel/eventos/${copy.id}`);
    },
    onError: fail,
  });
  const setStatus = useMutation({
    mutationFn: (status: EventStatus) => api<EventDto>(`/api/events/${event.id}/status`, { method: "PUT", body: { status } }),
    onSuccess: (saved) => {
      toast.success(saved.status === "closed" ? t.archived : t.reopened);
      queryClient.setQueryData(["event", saved.id], saved);
      void queryClient.invalidateQueries({ queryKey: ["events"] });
    },
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: () => api(`/api/events/${event.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success(t.deleted);
      queryClient.removeQueries({ queryKey: ["event", event.id] });
      void queryClient.invalidateQueries({ queryKey: ["events"] });
      router.push("/painel");
    },
    onError: fail,
  });
  const closed = event.status === "closed";

  return (
    <Menu
      label={t.menu}
      disabled={duplicate.isPending || setStatus.isPending || remove.isPending}
      trigger={<MoreHorizontal />}
      triggerClassName={buttonClass({ variant: "secondary", size: "icon", className: "size-8" })}
    >
      <MenuItem
        icon={<Copy />}
        onSelect={() => {
          duplicate.mutate();
        }}
      >
        {t.duplicate}
      </MenuItem>
      {closed ? (
        <MenuItem
          icon={<ArchiveRestore />}
          onSelect={() => {
            setStatus.mutate("active");
          }}
        >
          {t.reopen}
        </MenuItem>
      ) : (
        <MenuItem
          icon={<Archive />}
          onSelect={() => {
            void confirm({ title: t.archiveTitle, description: t.archiveBody, confirmLabel: t.archive, danger: false }).then((ok) => {
              if (ok) {
                setStatus.mutate("closed");
              }
            });
          }}
        >
          {t.archive}
        </MenuItem>
      )}
      <MenuItem
        icon={<Trash2 />}
        tone="danger"
        onSelect={() => {
          void confirm({ title: t.deleteTitle, description: t.deleteBody, confirmLabel: t.delete }).then((ok) => {
            if (ok) {
              remove.mutate();
            }
          });
        }}
      >
        {t.delete}
      </MenuItem>
    </Menu>
  );
}
