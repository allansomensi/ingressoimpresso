"use client";

import type { CertificateParticipantDto, CertificatesDto, EventDto } from "@ingressoimpresso/api-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Award, Copy, Download, MessageCircle, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useEventAccess, useEventTexts } from "@/components/event/access";
import { CertificateEditor } from "@/components/event/certificate-editor";
import {
  Button,
  Card,
  CardHeader,
  Dialog,
  EmptyState,
  ErrorMessage,
  Input,
  List,
  ListItem,
  LoadingBlock,
  Menu,
  MenuItem,
  buttonClass,
  errorMessage,
  useConfirm,
} from "@/components/ui";
import { api, fetchBlobUrl } from "@/lib/api";
import { copyText, whatsappUrl } from "@/lib/share";
import { common as commonTexts } from "@/texts/pt-BR/common";

import { TabHeader } from "./tab-header";

/** Saves a downloaded file of the API. */
function save(url: string, name: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 60_000);
}

/** The link of a certificate: the token in the fragment (ADR 0113). */
function certificateUrl(token: string): string {
  return `${window.location.origin}/certificado#${token}`;
}

/**
 * Certificates of participation (ADR 0113): the words of the event's certificate, and everyone
 * who came with a name, each with a PDF and a link to send.
 */
export function CertificatesTab({ eventId, event }: { eventId: string; event: EventDto }) {
  const t = useEventTexts().certificates;
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { can } = useEventAccess();
  const editable = can("door");
  const key = ["certificates", eventId];
  const overview = useQuery({
    queryKey: key,
    queryFn: () => api<CertificatesDto>(`/api/events/${eventId}/certificates`),
  });
  const [renaming, setRenaming] = useState<CertificateParticipantDto | null>(null);
  const onError = (error: unknown) => {
    toast.error(errorMessage(error));
  };
  const issue = useMutation({
    mutationFn: () => api<CertificatesDto>(`/api/events/${eventId}/certificates/issue`, { method: "POST" }),
    onSuccess: (data) => {
      queryClient.setQueryData(key, data);
      toast.success(t.issued(data.participants.filter((item) => item.certificate !== null).length));
    },
    onError,
  });
  const download = useMutation({
    mutationFn: () => fetchBlobUrl(`/api/events/${eventId}/certificates/zip`),
    onSuccess: (url) => {
      save(url, t.zipFile);
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api<undefined>(`/api/certificates/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success(t.removed);
      void queryClient.invalidateQueries({ queryKey: key });
    },
    onError,
  });

  if (overview.isPending) {
    return <LoadingBlock rows={3} />;
  }
  if (overview.isError) {
    return <ErrorMessage error={overview.error} />;
  }
  const people = overview.data.participants;
  const missing = people.filter((person) => person.certificate === null).length;
  const issuedCount = people.length - missing;

  return (
    <div className="flex flex-col gap-6">
      <TabHeader
        tab="certificates"
        help={t.intro}
        actions={
          <>
            {editable && missing > 0 && (
              <Button
                icon={<Award />}
                loading={issue.isPending}
                onClick={() => {
                  issue.mutate();
                }}
              >
                {issuedCount === 0 ? t.issue : t.issueMore(missing)}
              </Button>
            )}
            {issuedCount > 0 && (
              <Button
                variant="secondary"
                icon={<Download />}
                loading={download.isPending}
                onClick={() => {
                  download.mutate();
                }}
              >
                {t.zip}
              </Button>
            )}
          </>
        }
      />
      <CertificateEditor
        eventId={eventId}
        event={event}
        settings={overview.data.settings}
        wasSaved={overview.data.saved}
        editable={editable}
        onSaved={(data) => {
          queryClient.setQueryData(key, data);
        }}
      />
      <div>
        <Card>
          <CardHeader title={t.people} description={t.peopleCount(people.length)} icon={Award} />
          {people.length === 0 ? (
            <EmptyState icon={Award} title={t.empty} description={t.emptyHint} />
          ) : (
            <List>
              {people.map((person) => {
                const certificate = person.certificate;
                const url = certificate === null ? null : certificateUrl(certificate.token);
                return (
                  <ListItem key={person.key} className="flex-nowrap items-start">
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="font-medium text-fg">{person.name}</span>
                      <span className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-fg-subtle">
                        <span>{person.ticket === null ? t.fromList : t.fromTicket(person.ticket)}</span>
                        {certificate === null ? (
                          <span>· {t.notIssued}</span>
                        ) : (
                          <>
                            <span className="font-mono font-semibold text-fg-muted">· {certificate.code}</span>
                            <span>· {t.opened(certificate.openCount)}</span>
                          </>
                        )}
                      </span>
                    </div>
                    {certificate !== null && url !== null && (
                      <span className="flex shrink-0 items-center gap-1">
                        <a
                          className={buttonClass({ variant: "ghost", size: "icon-sm" })}
                          href={whatsappUrl(t.whatsappMessage(person.name, event.name, url), person.phone ?? undefined)}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={t.whatsapp}
                        >
                          <MessageCircle />
                        </a>
                        <Menu label={t.menu(person.name)} trigger={<MoreHorizontal />} triggerClassName={buttonClass({ variant: "ghost", size: "icon-sm" })}>
                          <MenuItem
                            icon={<Copy />}
                            onSelect={() => {
                              void copyText(url).then((ok) => {
                                if (ok) {
                                  toast.success(t.copied);
                                }
                              });
                            }}
                          >
                            {t.copy}
                          </MenuItem>
                          {editable && (
                            <MenuItem
                              icon={<Pencil />}
                              onSelect={() => {
                                setRenaming(person);
                              }}
                            >
                              {t.rename}
                            </MenuItem>
                          )}
                          {editable && (
                            <MenuItem
                              icon={<Trash2 />}
                              tone="danger"
                              onSelect={() => {
                                void confirm({ title: t.removeTitle(person.name), description: t.removeBody, confirmLabel: t.remove }).then((ok) => {
                                  if (ok) {
                                    remove.mutate(certificate.id);
                                  }
                                });
                              }}
                            >
                              {t.remove}
                            </MenuItem>
                          )}
                        </Menu>
                      </span>
                    )}
                  </ListItem>
                );
              })}
            </List>
          )}
        </Card>
      </div>
      {renaming?.certificate != null && (
        <RenameDialog
          key={renaming.certificate.id}
          id={renaming.certificate.id}
          name={renaming.name}
          onClose={() => {
            setRenaming(null);
          }}
          onSaved={(data) => {
            queryClient.setQueryData(key, data);
            setRenaming(null);
          }}
        />
      )}
    </div>
  );
}

function RenameDialog({ id, name, onClose, onSaved }: { id: string; name: string; onClose: () => void; onSaved: (data: CertificatesDto) => void }) {
  const t = useEventTexts().certificates;
  const [value, setValue] = useState(name);
  const save = useMutation({
    mutationFn: () => api<CertificatesDto>(`/api/certificates/${id}`, { method: "PUT", body: { name: value.trim() } }),
    onSuccess: (data) => {
      toast.success(t.renamed);
      onSaved(data);
    },
  });
  return (
    <Dialog
      open
      onClose={onClose}
      title={t.renameTitle}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {commonTexts.cancel}
          </Button>
          <Button
            loading={save.isPending}
            disabled={value.trim() === ""}
            onClick={() => {
              save.mutate();
            }}
          >
            {commonTexts.save}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input
          value={value}
          maxLength={80}
          autoFocus
          aria-label={t.renameTitle}
          onChange={(change) => {
            setValue(change.target.value);
          }}
        />
        <ErrorMessage error={save.error} />
      </div>
    </Dialog>
  );
}
