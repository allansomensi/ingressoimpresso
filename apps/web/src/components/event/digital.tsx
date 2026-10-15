"use client";

import type {
  CreateTicketLinkBody,
  CreateTicketLinksBody,
  EventDto,
  ReplaceTicketBody,
  TicketLinkDto,
  TicketLinksDto,
  TicketReplacementDto,
  TicketSaleDto,
} from "@ingressoimpresso/api-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  Check,
  ChevronDown,
  Copy,
  Eye,
  ExternalLink,
  FileSpreadsheet,
  Layers,
  LogIn,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Search,
  Send,
  Smartphone,
  TicketX,
  TriangleAlert,
  UserRound,
  X,
} from "lucide-react";
import { useDeferredValue, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";

import { QrCode } from "@/components/qr";
import { PublicVerifyCard } from "@/components/verify/verify-settings";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Dialog,
  EmptyState,
  ErrorMessage,
  Field,
  Input,
  Lead,
  List,
  ListItem,
  LoadingBlock,
  Menu,
  MenuItem,
  Stat,
  buttonClass,
  errorMessage,
  useConfirm,
} from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { shortDateTime } from "@/lib/format";
import { copyText, downloadCsv, whatsappUrl } from "@/lib/share";
import { common as commonTexts } from "@/texts/pt-BR/common";
import { useEventTexts } from "@/components/event/access";
import { event as eventTexts } from "@/texts/pt-BR/event";

import type { SelectTab } from "./tabs";

const MAX_BULK = 500;

/** Status line of a link: revoked, voided, entered or how often it was opened. */
function LinkState({ link }: { link: TicketLinkDto }) {
  const t = useEventTexts().digital;
  if (link.revokedAt !== null) {
    return <Badge tone="neutral">{t.states.revoked}</Badge>;
  }
  if (link.state === "voided") {
    return (
      <Badge tone="danger" dot>
        {t.states.voided}
      </Badge>
    );
  }
  if (link.state === "entered" && link.enteredAt !== null) {
    return (
      <Badge tone="success" dot>
        {t.states.entered(shortDateTime(link.enteredAt))}
      </Badge>
    );
  }
  return link.openCount === 0 ? (
    <Badge tone="warning">{t.states.notOpened}</Badge>
  ) : (
    <Badge tone="brand">{t.states.opened(link.openCount)}</Badge>
  );
}

/** The share panel of a fresh link: QR of the link, WhatsApp, copy, open. */
function ShareLink({
  link,
  eventName,
  phone,
  title,
  onClose,
}: {
  link: TicketLinkDto;
  eventName: string;
  phone: string;
  title: ReactNode;
  onClose: () => void;
}) {
  const t = useEventTexts().digital;
  const [copied, setCopied] = useState(false);
  const message = t.whatsappMessage(link.holderName, eventName, link.url);
  return (
    <Card className="border-brand/40 ring-4 ring-brand/10 animate-pop">
      <div className="flex flex-col gap-6 md:flex-row md:items-center">
        <div className="flex flex-col items-center gap-2">
          <div className="rounded-2xl border border-border bg-white p-3 shadow-sm">
            <QrCode text={link.url} size={168} label={t.qrLabel} className="bg-white" />
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h3 className="text-lg font-semibold tracking-tight text-fg">{title}</h3>
              <p className="text-sm leading-relaxed text-fg-muted">{t.createdHint}</p>
            </div>
            <Button variant="ghost" size="icon" aria-label={commonTexts.close} onClick={onClose}>
              <X />
            </Button>
          </div>
          <code className="block truncate rounded-xl bg-surface-2 px-3 py-2.5 font-mono text-xs text-fg-muted">{link.url}</code>
          <div className="flex flex-wrap gap-2">
            <a
              href={whatsappUrl(message, phone)}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass({ className: "bg-success-solid shadow-success/25 hover:bg-success-solid/90" })}
            >
              <MessageCircle />
              {t.whatsapp}
            </a>
            <Button
              variant="secondary"
              icon={copied ? <Check /> : <Copy />}
              onClick={async () => {
                const ok = await copyText(link.url);
                setCopied(ok);
                if (ok) {
                  toast.success(t.copied);
                } else {
                  toast.error(t.copyFailed);
                }
              }}
            >
              {t.copy}
            </Button>
            <a href={link.url} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: "ghost" })}>
              <ExternalLink />
              {t.open}
            </a>
          </div>
        </div>
      </div>
    </Card>
  );
}

function RenameDialog({ link, onClose, eventId }: { link: TicketLinkDto | null; onClose: () => void; eventId: string }) {
  const t = useEventTexts().digital;
  const queryClient = useQueryClient();
  const [name, setName] = useState(link?.holderName ?? "");
  const save = useMutation({
    mutationFn: () =>
      api<TicketLinkDto>(`/api/ticket-links/${link?.id ?? ""}`, {
        method: "PUT",
        body: { holderName: name.trim() === "" ? null : name.trim() },
      }),
    onSuccess: () => {
      toast.success(t.renamed);
      void queryClient.invalidateQueries({ queryKey: ["tickets", eventId] });
      onClose();
    },
  });
  return (
    <Dialog
      open={link !== null}
      onClose={onClose}
      size="sm"
      title={t.renameTitle}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {commonTexts.cancel}
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            {commonTexts.save}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <Field label={t.holder} optional>
          <Input
            value={name}
            maxLength={80}
            placeholder={t.holderPlaceholder}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
        </Field>
        <ErrorMessage error={save.error} />
      </form>
    </Dialog>
  );
}

/** Who holds `number`: the name on its active link, or the buyer its seller marked. */
function holderOf(number: number, links: readonly TicketLinkDto[], sales: readonly TicketSaleDto[]) {
  const link = links.find((item) => item.number === number && item.revokedAt === null);
  const sale = sales.find((item) => item.number === number);
  return { name: link?.holderName ?? sale?.buyerName ?? null, phone: sale?.buyerPhone ?? null };
}

/**
 * The replacement of a lost ticket (ADR 0061), in one step: the lost number is voided and a free
 * number goes to the same person as a digital ticket.
 */
function ReplaceDialog({
  eventId,
  initial,
  links,
  label,
  onClose,
  onReplaced,
}: {
  eventId: string;
  initial: number | null;
  links: readonly TicketLinkDto[];
  label: (value: number) => string;
  onClose: () => void;
  onReplaced: (replacement: TicketReplacementDto, phone: string) => void;
}) {
  const t = useEventTexts().digital;
  const r = t.replace;
  const queryClient = useQueryClient();
  const sales = useQuery({
    queryKey: ["ticket-sales", eventId],
    queryFn: () => api<TicketSaleDto[]>(`/api/events/${eventId}/ticket-sales`),
  });
  const [lost, setLost] = useState(initial === null ? "" : String(initial));
  const [holder, setHolder] = useState<string | null>(null);
  const [fresh, setFresh] = useState("");
  const [note, setNote] = useState("");
  const lostNumber = lost === "" ? null : Number(lost);
  const known = lostNumber === null ? { name: null, phone: null } : holderOf(lostNumber, links, sales.data ?? []);
  // The holder field follows the lost number until it is edited.
  const name = holder ?? known.name ?? "";

  const replace = useMutation({
    mutationFn: () => {
      const body: ReplaceTicketBody = {
        number: lostNumber ?? 0,
        newNumber: fresh === "" ? null : Number(fresh),
        holderName: name.trim() === "" ? null : name.trim(),
        note: note.trim() === "" ? r.defaultNote : note.trim(),
      };
      return api<TicketReplacementDto>(`/api/events/${eventId}/tickets/replace`, { method: "POST", body });
    },
    onSuccess: (replacement) => {
      for (const key of ["tickets", "voids", "report", "ticket-sales", "analytics", "tables"]) {
        void queryClient.invalidateQueries({ queryKey: [key, eventId] });
      }
      toast.success(r.done(replacement.oldLabel, replacement.link.numberLabel));
      onReplaced(replacement, known.phone ?? "");
    },
  });

  // The dialog itself is the confirmation: it says what happens, and the button is red.
  const submit = (formEvent: FormEvent) => {
    formEvent.preventDefault();
    if (lostNumber !== null) {
      replace.mutate();
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={r.dialogTitle}
      description={r.dialogBody}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {commonTexts.cancel}
          </Button>
          <Button type="submit" form="replace-ticket" variant="danger" icon={<TicketX />} loading={replace.isPending} disabled={lostNumber === null}>
            {r.submit}
          </Button>
        </>
      }
    >
      <form id="replace-ticket" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field
          label={r.lost}
          hint={
            known.name === null ? undefined : (
              <span className="inline-flex items-center gap-1">
                <UserRound aria-hidden className="size-3.5" />
                {r.lostHolder(known.name)}
              </span>
            )
          }
        >
          <Input
            inputMode="numeric"
            value={lost}
            required
            autoFocus={initial === null}
            onChange={(changeEvent) => {
              setLost(changeEvent.target.value.replace(/\D/g, ""));
              setHolder(null);
              replace.reset();
            }}
          />
        </Field>
        <Field label={r.newNumber} optional hint={r.newNumberHint}>
          <Input
            inputMode="numeric"
            value={fresh}
            placeholder={r.newNumberPlaceholder}
            onChange={(changeEvent) => {
              setFresh(changeEvent.target.value.replace(/\D/g, ""));
              replace.reset();
            }}
          />
        </Field>
        <Field label={r.holder} optional className="sm:col-span-2">
          <Input
            value={name}
            maxLength={80}
            placeholder={t.holderPlaceholder}
            onChange={(changeEvent) => {
              setHolder(changeEvent.target.value);
            }}
          />
        </Field>
        <Field label={r.reason} optional hint={r.reasonHint} className="sm:col-span-2">
          <Input
            value={note}
            maxLength={200}
            placeholder={r.reasonPlaceholder}
            onChange={(changeEvent) => {
              setNote(changeEvent.target.value);
            }}
          />
        </Field>
        <p className="flex items-start gap-2 text-xs leading-relaxed text-fg-muted sm:col-span-2">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
          {lostNumber === null ? r.warning : r.warningNumber(label(lostNumber))}
        </p>
        <ErrorMessage error={replace.error} className="sm:col-span-2" />
      </form>
    </Dialog>
  );
}

function BulkLinks({ eventId, eventName }: { eventId: string; eventName: string }) {
  const t = useEventTexts().digital;
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const create = useMutation({
    mutationFn: () => {
      const body: CreateTicketLinksBody = { first: Number(first), last: Number(last) };
      return api<TicketLinkDto[]>(`/api/events/${eventId}/tickets/bulk`, { method: "POST", body });
    },
    onSuccess: (links) => {
      void queryClient.invalidateQueries({ queryKey: ["tickets", eventId] });
      if (links.length === 0) {
        toast.warning(t.bulkNone);
        return;
      }
      downloadCsv(t.bulkFile.replace(".csv", `-${eventName.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}.csv`), [
        t.csvHeader,
        ...links.map((link) => [link.numberLabel, link.holderName ?? "", link.url]),
      ]);
      toast.success(t.bulkCreated(links.length));
    },
  });
  const firstNumber = Number(first);
  const lastNumber = Number(last);
  const valid =
    Number.isInteger(firstNumber) && Number.isInteger(lastNumber) && firstNumber >= 1 && lastNumber >= firstNumber && lastNumber - firstNumber < MAX_BULK;
  return (
    <Card>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
        }}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-soft-fg">
            <FileSpreadsheet className="size-[18px]" aria-hidden />
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="text-base font-semibold tracking-tight text-fg">{t.bulkTitle}</span>
            <span className="text-sm leading-relaxed text-fg-muted">{t.bulkHint}</span>
          </span>
        </span>
        <ChevronDown className={cn("size-5 shrink-0 text-fg-subtle transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <form
          className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            if (valid) {
              create.mutate();
            }
          }}
        >
          <Field label={commonTexts.first} className="sm:w-36">
            <Input
              inputMode="numeric"
              value={first}
              onChange={(event) => {
                setFirst(event.target.value.replace(/\D/g, ""));
              }}
            />
          </Field>
          <Field label={commonTexts.last} className="sm:w-36">
            <Input
              inputMode="numeric"
              value={last}
              onChange={(event) => {
                setLast(event.target.value.replace(/\D/g, ""));
              }}
            />
          </Field>
          <Button type="submit" icon={<FileSpreadsheet />} disabled={!valid} loading={create.isPending}>
            {t.bulkCreate}
          </Button>
          <ErrorMessage error={create.error} className="sm:flex-1" />
        </form>
      )}
    </Card>
  );
}

export function DigitalTab({ eventId, onSelect }: { eventId: string; onSelect: SelectTab }) {
  const t = useEventTexts().digital;
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const key = ["tickets", eventId];
  const tickets = useQuery({ queryKey: key, queryFn: () => api<TicketLinksDto>(`/api/events/${eventId}/tickets`) });
  const event = useQuery({ queryKey: ["event", eventId], queryFn: () => api<EventDto>(`/api/events/${eventId}`) });
  const [number, setNumber] = useState("");
  const [holder, setHolder] = useState("");
  const [phone, setPhone] = useState("");
  const [created, setCreated] = useState<{ link: TicketLinkDto; phone: string; title: string } | null>(null);
  const [replacing, setReplacing] = useState<{ number: number | null } | null>(null);
  const [renaming, setRenaming] = useState<TicketLinkDto | null>(null);
  const [query, setQuery] = useState("");
  const search = useDeferredValue(query.trim().toLowerCase());
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });

  const create = useMutation({
    mutationFn: (chosen: number | null) => {
      const body: CreateTicketLinkBody = { number: chosen, holderName: holder.trim() === "" ? null : holder.trim() };
      return api<TicketLinkDto>(`/api/events/${eventId}/tickets`, { method: "POST", body });
    },
    onSuccess: (link) => {
      setCreated({ link, phone, title: t.createdTitle(link.numberLabel) });
      setNumber("");
      setHolder("");
      setPhone("");
      void refresh();
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api<TicketLinkDto>(`/api/ticket-links/${id}/revoke`, { method: "POST" }),
    onSuccess: () => {
      toast.success(t.revoked);
      void refresh();
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });

  if (tickets.isPending) {
    return <LoadingBlock rows={3} />;
  }
  if (tickets.isError) {
    return <ErrorMessage error={tickets.error} />;
  }
  const data = tickets.data;
  const eventName = event.data?.name ?? "";
  const closed = event.data?.status === "closed";
  if (data.paidTickets === 0) {
    return (
      <div className="flex flex-col gap-6">
        <Lead>{t.intro}</Lead>
        <EmptyState
          icon={Smartphone}
          title={t.noPaidTitle}
          description={t.noPaid}
          action={
            <Button
              icon={<Layers />}
              onClick={() => {
                onSelect("batches");
              }}
            >
              {t.goToBatches}
            </Button>
          }
        />
      </div>
    );
  }
  const active = data.links.filter((link) => link.revokedAt === null);
  const label = (value: number) => String(value).padStart(data.numberDigits, "0");
  const typed = number.trim() === "" ? null : Number(number);
  const submit = (formEvent: FormEvent) => {
    formEvent.preventDefault();
    create.mutate(typed);
  };
  const shown = data.links.filter(
    (link) =>
      search === "" || link.numberLabel.includes(search) || String(link.number) === search || (link.holderName ?? "").toLowerCase().includes(search),
  );

  return (
    <div className="flex flex-col gap-6">
      <Lead>{t.intro}</Lead>
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <Stat label={t.stats.active} value={active.length.toLocaleString("pt-BR")} icon={Send} />
        <Stat label={t.stats.opened} value={active.filter((link) => link.openCount > 0).length.toLocaleString("pt-BR")} icon={Eye} />
        <Stat
          label={t.stats.entered}
          value={active.filter((link) => link.state === "entered").length.toLocaleString("pt-BR")}
          icon={LogIn}
          tone="success"
        />
      </div>

      {created !== null && (
        <ShareLink
          link={created.link}
          eventName={eventName}
          phone={created.phone}
          title={created.title}
          onClose={() => {
            setCreated(null);
          }}
        />
      )}

      {closed ? (
        <Alert tone="warning">{eventTexts.actions.archivedNote}</Alert>
      ) : (
        <Card>
          <CardHeader icon={Send} title={t.sendTitle} description={t.sendHint} />
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-[10rem_1fr_1fr]">
              <Field
                label={t.number}
                hint={data.nextNumber === null ? t.numberNone : number === "" ? t.numberHint(label(data.nextNumber)) : undefined}
              >
                <Input
                  inputMode="numeric"
                  value={number}
                  placeholder={data.nextNumber === null ? "" : label(data.nextNumber)}
                  onChange={(changeEvent) => {
                    setNumber(changeEvent.target.value.replace(/\D/g, ""));
                    create.reset();
                  }}
                />
              </Field>
              <Field label={t.holder} optional>
                <Input
                  value={holder}
                  maxLength={80}
                  placeholder={t.holderPlaceholder}
                  onChange={(changeEvent) => {
                    setHolder(changeEvent.target.value);
                  }}
                />
              </Field>
              <Field label={t.phone} optional hint={t.phoneHint}>
                <Input
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  value={phone}
                  placeholder={t.phonePlaceholder}
                  onChange={(changeEvent) => {
                    setPhone(changeEvent.target.value);
                  }}
                />
              </Field>
            </div>
            <p className="flex items-start gap-2 text-xs leading-relaxed text-fg-muted">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
              {t.paperWarning}
            </p>
            <ErrorMessage error={create.error} />
            <Button
              type="submit"
              icon={<Send />}
              loading={create.isPending}
              disabled={typed === null && data.nextNumber === null}
              className="w-full sm:w-fit"
            >
              {create.isPending ? t.creating : t.create}
            </Button>
          </form>
        </Card>
      )}

      {!closed && (
        <Card>
          <CardHeader
            icon={TicketX}
            title={t.replace.title}
            description={t.replace.hint}
            className="mb-4"
          />
          <Button
            variant="secondary"
            icon={<TicketX />}
            className="w-full sm:w-fit"
            onClick={() => {
              setReplacing({ number: null });
            }}
          >
            {t.replace.open}
          </Button>
        </Card>
      )}

      {!closed && <BulkLinks eventId={eventId} eventName={eventName} />}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold tracking-tight text-fg">{t.listTitle}</h2>
          {data.links.length > 0 && (
            <span className="relative flex w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
              <Input
                type="search"
                value={query}
                placeholder={t.search}
                aria-label={t.search}
                onChange={(changeEvent) => {
                  setQuery(changeEvent.target.value);
                }}
                className="pl-10"
              />
            </span>
          )}
        </div>
        {data.links.length === 0 ? (
          <EmptyState icon={Smartphone} title={t.emptyTitle} description={t.empty} />
        ) : shown.length === 0 ? (
          <EmptyState icon={Search} title={t.noResults} />
        ) : (
          <List>
            {shown.map((link) => {
              const usable = link.revokedAt === null;
              return (
                <ListItem key={link.id} className={cn("justify-between", !usable && "opacity-60")}>
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="rounded-lg bg-surface-2 px-2.5 py-1.5 font-mono text-sm font-semibold text-fg tabular">
                      {link.numberLabel}
                    </span>
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className={cn("truncate text-sm font-medium", link.holderName === null ? "text-fg-subtle" : "text-fg")}>
                        {link.holderName ?? t.noHolder}
                      </span>
                      <span className="flex flex-wrap items-center gap-2 text-xs text-fg-subtle">
                        <LinkState link={link} />
                        <span>{shortDateTime(link.createdAt)}</span>
                        {link.seller !== null && <span>{t.bySeller(link.seller)}</span>}
                      </span>
                    </div>
                  </div>
                  {usable && (
                    <div className="flex items-center gap-1">
                      <a
                        href={whatsappUrl(t.whatsappMessage(link.holderName, eventName, link.url))}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={t.whatsapp}
                        title={t.whatsapp}
                        className={buttonClass({ variant: "ghost", size: "icon" })}
                      >
                        <MessageCircle />
                      </a>
                      <Menu
                        label={t.actions}
                        trigger={<MoreHorizontal className="size-4" aria-hidden />}
                        triggerClassName={buttonClass({ variant: "ghost", size: "icon" })}
                      >
                        <MenuItem
                          icon={<Copy />}
                          onSelect={async () => {
                            if (await copyText(link.url)) {
                              toast.success(t.copied);
                            } else {
                              toast.error(t.copyFailed);
                            }
                          }}
                        >
                          {t.copy}
                        </MenuItem>
                        <MenuItem
                          icon={<ExternalLink />}
                          onSelect={() => {
                            window.open(link.url, "_blank", "noopener,noreferrer");
                          }}
                        >
                          {t.open}
                        </MenuItem>
                        <MenuItem
                          icon={<Pencil />}
                          onSelect={() => {
                            setRenaming(link);
                          }}
                        >
                          {t.rename}
                        </MenuItem>
                        {!closed && link.state === "valid" && (
                          <MenuItem
                            icon={<TicketX />}
                            onSelect={() => {
                              setReplacing({ number: link.number });
                            }}
                          >
                            {t.replace.title}
                          </MenuItem>
                        )}
                        <MenuItem
                          tone="danger"
                          icon={<Ban />}
                          onSelect={async () => {
                            if (await confirm({ title: t.revokeTitle(link.numberLabel), description: t.revokeBody, confirmLabel: t.revoke })) {
                              revoke.mutate(link.id);
                            }
                          }}
                        >
                          {t.revoke}
                        </MenuItem>
                      </Menu>
                    </div>
                  )}
                </ListItem>
              );
            })}
          </List>
        )}
      </section>

      {replacing !== null && (
        <ReplaceDialog
          eventId={eventId}
          initial={replacing.number}
          links={data.links}
          label={label}
          onClose={() => {
            setReplacing(null);
          }}
          onReplaced={(replacement, replacedPhone) => {
            setReplacing(null);
            setCreated({
              link: replacement.link,
              phone: replacedPhone,
              title: t.replacedTitle(replacement.oldLabel, replacement.link.numberLabel),
            });
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      )}

      <RenameDialog
        key={renaming?.id ?? "none"}
        link={renaming}
        eventId={eventId}
        onClose={() => {
          setRenaming(null);
        }}
      />
      {/* Anyone holding a ticket may check it on /conferir (ADR 0075). */}
      <PublicVerifyCard eventId={eventId} />
    </div>
  );
}
