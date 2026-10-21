"use client";

import type { CertificateParticipantDto, CertificateSettingsDto, CertificatesDto, EventDto } from "@ingressoimpresso/api-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Award, Copy, Download, Eye, MessageCircle, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useEventAccess, useEventTexts } from "@/components/event/access";
import {
  Button,
  Card,
  CardHeader,
  Dialog,
  EmptyState,
  ErrorMessage,
  Field,
  Input,
  List,
  ListItem,
  LoadingBlock,
  Menu,
  MenuItem,
  Textarea,
  buttonClass,
  errorMessage,
  useConfirm,
} from "@/components/ui";
import { api, fetchBlobUrl } from "@/lib/api";
import { CERTIFICATE_FIELDS, fillCertificate } from "@/lib/certificates";
import { cn } from "@/lib/cn";
import { CREDENTIAL_COLORS } from "@/lib/credentials";
import { copyText, whatsappUrl } from "@/lib/share";
import { useUnsavedChanges } from "@/lib/unsaved";
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
    mutationFn: (what: "zip" | "sample") => fetchBlobUrl(`/api/events/${eventId}/certificates/${what}`),
    onSuccess: (url, what) => {
      save(url, what === "zip" ? t.zipFile : t.sampleFile);
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
                loading={download.isPending && download.variables === "zip"}
                onClick={() => {
                  download.mutate("zip");
                }}
              >
                {t.zip}
              </Button>
            )}
          </>
        }
      />
      <div className="grid items-start gap-6 lg:grid-cols-[1.1fr_1fr]">
        <ModelCard
          key={JSON.stringify(overview.data.settings)}
          eventId={eventId}
          event={event}
          settings={overview.data.settings}
          editable={editable}
          sampling={download.isPending && download.variables === "sample"}
          onSample={() => {
            download.mutate("sample");
          }}
          onSaved={(data) => {
            queryClient.setQueryData(key, data);
          }}
        />
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

/** The words of the certificate, with a live preview (the PDF is the "Ver exemplo"). */
function ModelCard({
  eventId,
  event,
  settings,
  editable,
  sampling,
  onSample,
  onSaved,
}: {
  eventId: string;
  event: EventDto;
  settings: CertificateSettingsDto;
  editable: boolean;
  sampling: boolean;
  onSample: () => void;
  onSaved: (data: CertificatesDto) => void;
}) {
  const t = useEventTexts().certificates;
  const [draft, setDraft] = useState<CertificateSettingsDto>(settings);
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);
  useUnsavedChanges(dirty);
  const save = useMutation({
    mutationFn: () =>
      api<CertificatesDto>(`/api/events/${eventId}/certificates/settings`, {
        method: "PUT",
        body: { ...draft, signers: draft.signers.filter((signer) => signer.name.trim() !== "") },
      }),
    onSuccess: (data) => {
      toast.success(t.saved);
      onSaved(data);
    },
  });
  const signer = (index: number) => draft.signers[index] ?? { name: "", role: null };
  const setSigner = (index: number, patch: Partial<{ name: string; role: string | null }>) => {
    const signers = [signer(0), signer(1)].map((item, at) => (at === index ? { ...item, ...patch } : item));
    setDraft({ ...draft, signers });
  };
  const days = event.days.length > 0 ? event.days.map((day) => day.startsAt) : [event.startsAt];
  const preview = fillCertificate(draft.body, {
    name: t.sampleName,
    event: event.name,
    days,
    venue: event.venue,
    organization: null,
    workload: draft.workload,
  });
  const insert = (field: string) => {
    setDraft({ ...draft, body: `${draft.body}${draft.body.endsWith(" ") || draft.body === "" ? "" : " "}{${field}}` });
  };
  return (
    <Card className="flex flex-col gap-4">
      <CardHeader
        title={t.model}
        description={t.modelHint}
        icon={Pencil}
        actions={
          <Button variant="ghost" size="sm" icon={<Eye />} loading={sampling} onClick={onSample}>
            {t.sample}
          </Button>
        }
      />
      {/* The preview: the frame, the title and the text with the name in bold. */}
      <div className="rounded-xl border-[6px] bg-white p-5 text-center text-[#1b1a24] shadow-xs" style={{ borderColor: draft.color }}>
        <p className="text-[10px] font-bold tracking-[0.3em] uppercase" style={{ color: draft.color }}>
          {t.preview}
        </p>
        <p className="mt-1 font-serif text-xl font-bold">{draft.title}</p>
        <p className="mt-3 text-sm leading-relaxed">
          {preview.map((segment, index) =>
            segment.strong ? (
              <strong key={index} className="text-base">
                {segment.text}
              </strong>
            ) : (
              <span key={index}>{segment.text}</span>
            ),
          )}
        </p>
        {draft.workload !== null && draft.workload !== "" && <p className="mt-2 text-xs text-[#5b5a6b]">{draft.workload}</p>}
      </div>
      <Field label={t.title}>
        <Input
          value={draft.title}
          maxLength={60}
          disabled={!editable}
          onChange={(change) => {
            setDraft({ ...draft, title: change.target.value });
          }}
        />
      </Field>
      <div className="flex flex-col gap-2">
        <Field label={t.body} hint={t.bodyHint}>
          <Textarea
            value={draft.body}
            maxLength={600}
            rows={4}
            disabled={!editable}
            onChange={(change) => {
              setDraft({ ...draft, body: change.target.value });
            }}
          />
        </Field>
        {editable && (
          <div className="flex flex-wrap gap-1.5">
            {CERTIFICATE_FIELDS.map((field) => (
              <button
                key={field}
                type="button"
                onClick={() => {
                  insert(field);
                }}
                className="relative rounded-full border border-border px-3 py-1 text-xs text-fg-muted transition touch-target hover:bg-surface-2 hover:text-fg active:bg-surface-3"
              >
                {t.fieldLabels[field] ?? field}
              </button>
            ))}
          </div>
        )}
      </div>
      <Field label={t.workload} optional>
        <Input
          value={draft.workload ?? ""}
          maxLength={30}
          disabled={!editable}
          placeholder={t.workloadPlaceholder}
          onChange={(change) => {
            setDraft({ ...draft, workload: change.target.value === "" ? null : change.target.value });
          }}
        />
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium text-fg">{t.signers}</legend>
        {[0, 1].map((index) => (
          <div key={index} className="grid gap-2 sm:grid-cols-2">
            <Input
              aria-label={t.signerName(index + 1)}
              placeholder={t.signerName(index + 1)}
              value={signer(index).name}
              maxLength={60}
              disabled={!editable}
              onChange={(change) => {
                setSigner(index, { name: change.target.value });
              }}
            />
            <Input
              aria-label={t.signerRole(index + 1)}
              placeholder={t.signerRolePlaceholder}
              value={signer(index).role ?? ""}
              maxLength={60}
              disabled={!editable}
              onChange={(change) => {
                setSigner(index, { role: change.target.value === "" ? null : change.target.value });
              }}
            />
          </div>
        ))}
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium text-fg">{t.color}</legend>
        <div className="flex flex-wrap gap-2">
          {["#5b3df5", ...CREDENTIAL_COLORS].map((option) => (
            <button
              key={option}
              type="button"
              aria-label={option}
              aria-pressed={draft.color === option}
              disabled={!editable}
              onClick={() => {
                setDraft({ ...draft, color: option });
              }}
              className={cn(
                "relative size-9 rounded-full ring-offset-2 ring-offset-surface transition touch-target pointer-coarse:size-11",
                draft.color === option ? "ring-2 ring-brand" : "ring-1 ring-black/10",
              )}
              style={{ backgroundColor: option }}
            />
          ))}
        </div>
      </fieldset>
      <ErrorMessage error={save.error} />
      {editable && (
        <div className="flex justify-end">
          <Button
            disabled={!dirty || draft.title.trim() === "" || draft.body.trim() === ""}
            loading={save.isPending}
            onClick={() => {
              save.mutate();
            }}
          >
            {t.save}
          </Button>
        </div>
      )}
    </Card>
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
