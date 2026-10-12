"use client";

import type { EventDto, EventStatus } from "@ingressoimpresso/api-types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, CalendarClock, Copy, MoreHorizontal, RotateCcw, Trash2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { CancelDialog, ChangeMessageDialog, PostponeDialog } from "@/components/event/event-change";
import { Menu, MenuItem, buttonClass, errorMessage, useConfirm } from "@/components/ui";
import { api } from "@/lib/api";
import { canDo, isOwner } from "@/lib/team";
import { texts } from "@/texts/pt-BR";

const t = texts.event.actions;
const c = texts.eventChange;

/**
 * Postpone or cancel (coordination, ADR 0065); duplicate, archive or reopen, and delete (the
 * organization's own people).
 */
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
  const undoCancel = useMutation({
    mutationFn: () => api<EventDto>(`/api/events/${event.id}/cancel/undo`, { method: "POST" }),
    onSuccess: (saved) => {
      toast.success(c.undone);
      queryClient.setQueryData(["event", saved.id], saved);
      void queryClient.invalidateQueries({ queryKey: ["events"] });
    },
    onError: fail,
  });
  const [dialog, setDialog] = useState<"postpone" | "cancel" | "message" | null>(null);
  const close = () => {
    setDialog(null);
  };
  const closed = event.status === "closed";
  const canceled = event.change.canceledAt !== null;
  const owner = isOwner(event);
  const manage = canDo(event, "manage");
  if (!owner && !manage) {
    return null;
  }

  const confirmUndo = () => {
    void confirm({ title: c.undoTitle, description: c.undoBody, confirmLabel: c.undoConfirm, danger: false }).then((ok) => {
      if (ok) {
        undoCancel.mutate();
      }
    });
  };
  const confirmArchive = () => {
    void confirm({ title: t.archiveTitle, description: t.archiveBody, confirmLabel: t.archive, danger: false }).then((ok) => {
      if (ok) {
        setStatus.mutate("closed");
      }
    });
  };
  const confirmDelete = () => {
    void confirm({ title: t.deleteTitle, description: t.deleteBody, confirmLabel: t.delete }).then((ok) => {
      if (ok) {
        remove.mutate();
      }
    });
  };
  const toMessage = () => {
    setDialog("message");
  };

  // Everyday actions first; the ones that change the event for everybody at the end, in red.
  return (
    <>
      <Menu
        label={t.menu}
        disabled={duplicate.isPending || setStatus.isPending || remove.isPending || undoCancel.isPending}
        trigger={<MoreHorizontal />}
        triggerClassName={buttonClass({ variant: "secondary", size: "icon-sm" })}
      >
        {manage && !canceled && (
          <MenuItem
            icon={<CalendarClock />}
            onSelect={() => {
              setDialog("postpone");
            }}
          >
            {c.postpone}
          </MenuItem>
        )}
        {manage && canceled && (
          <MenuItem icon={<RotateCcw />} onSelect={confirmUndo}>
            {c.undo}
          </MenuItem>
        )}
        {owner && (
          <MenuItem
            icon={<Copy />}
            onSelect={() => {
              duplicate.mutate();
            }}
          >
            {t.duplicate}
          </MenuItem>
        )}
        {owner &&
          (closed ? (
            <MenuItem
              icon={<ArchiveRestore />}
              onSelect={() => {
                setStatus.mutate("active");
              }}
            >
              {t.reopen}
            </MenuItem>
          ) : (
            <MenuItem icon={<Archive />} onSelect={confirmArchive}>
              {t.archive}
            </MenuItem>
          ))}
        {manage && !canceled && (
          <MenuItem
            icon={<XCircle />}
            tone="danger"
            onSelect={() => {
              setDialog("cancel");
            }}
          >
            {c.cancel}
          </MenuItem>
        )}
        {owner && (
          <MenuItem icon={<Trash2 />} tone="danger" onSelect={confirmDelete}>
            {t.delete}
          </MenuItem>
        )}
      </Menu>
      <PostponeDialog event={event} open={dialog === "postpone"} onClose={close} onDone={toMessage} />
      <CancelDialog event={event} open={dialog === "cancel"} onClose={close} onDone={toMessage} />
      <ChangeMessageDialog event={event} open={dialog === "message"} onClose={close} />
    </>
  );
}
