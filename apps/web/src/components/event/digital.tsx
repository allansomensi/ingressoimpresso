"use client";

import type {
  CategoryDto,
  CreateTicketLinksBody,
  EventBody,
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
  Clock,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  FileUp,
  Layers,
  Link2,
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
} from "lucide-react";
import { useDeferredValue, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { useEventAccess, useEventTexts, type EventTexts } from "@/components/event/access";
import { TransferSettingsCard } from "@/components/ticket/transfer-settings";
import { PublicVerifyCard } from "@/components/verify/verify-settings";
import {
  Alert,
  Badge,
  Button,
  Card,
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
  Select,
  Stat,
  Switch,
  buttonClass,
  errorMessage,
  segmentTabIndex,
  segmentedKeys,
  useConfirm,
} from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import {
  LINK_FILTERS,
  groupRecipients,
  isPending,
  isUsable,
  matchesFilter,
  matchesQuery,
  type LinkFilter,
  type Recipient,
} from "@/lib/digital-tickets";
import { phoneLabel, shortDateTime } from "@/lib/format";
import { copyText, downloadCsv } from "@/lib/share";
import { common as commonTexts } from "@/texts/pt-BR/common";
import { event as eventTexts } from "@/texts/pt-BR/event";

import { ImportDialog } from "./digital-import";
import {
  EditDialog,
  IssuedCard,
  NumberChip,
  SendDialog,
  SendQueue,
  WhatsappButton,
  useMarkSent,
  useTicketsMessage,
  type CategoryColor,
  type CategoryName,
  type Issued,
} from "./digital-send";
import { TabHeader } from "./tab-header";
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

/** Rows of the list shown at a time: a long list grows by this much. */
const PAGE = 50;

/** Free numbers of each category, as chips: what can still be sent, at a glance. */
function StockStrip({ data, categories, onSelect }: { data: TicketLinksDto; categories: readonly CategoryDto[]; onSelect: SelectTab }) {
  const t = useEventTexts().digital;
  const withoutNumbers = categories.some((category) => category.ranges.length === 0);
  return (
    <section aria-label={t.stock.title} className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-fg-muted">{t.stock.title}</h2>
      <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {data.stock.map((stock) => {
          const category = categories.find((item) => item.id === stock.categoryId) ?? null;
          return (
            <li
              key={stock.categoryId ?? "none"}
              className="relative flex shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-surface py-2 pr-3.5 pl-4"
            >
              <span aria-hidden className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: category?.color ?? "var(--border-strong)" }} />
              <span className="max-w-48 truncate text-xs font-medium text-fg-muted">{category?.name ?? (categories.length === 0 ? t.stock.title : t.stock.uncategorized)}</span>
              <span className={cn("text-base font-semibold tabular", stock.free === 0 ? "text-danger-fg" : "text-fg")}>
                {stock.free === 0 ? t.stock.soldOut : stock.free.toLocaleString("pt-BR")}
              </span>
            </li>
          );
        })}
      </ul>
      {withoutNumbers && (
        <Alert
          tone="warning"
          action={
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                onSelect("categories");
              }}
            >
              {t.stock.goToCategories}
            </Button>
          }
        >
          {t.stock.noRanges}
        </Alert>
      )}
    </section>
  );
}

/** "Só no celular" for an event (ADR 0123), for who coordinates it. */
function DigitalOnlyCard({ event }: { event: EventDto }) {
  const t = useEventTexts().digital.digitalOnly;
  const save = useDigitalOnly(event);
  return (
    <Card>
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-soft-fg">
            <Smartphone className="size-[18px]" aria-hidden />
          </span>
          <div className="flex flex-col gap-0.5">
            <h2 className="text-base font-semibold tracking-tight text-fg">{t.title}</h2>
            <p className="text-sm leading-relaxed text-fg-muted">{t.description}</p>
          </div>
        </div>
        <Switch
          checked={event.digitalOnly}
          onChange={(checked) => {
            save.mutate(checked);
          }}
          label={t.toggle}
          description={event.digitalOnly ? t.on : t.off}
        />
        <ErrorMessage error={save.error} />
      </div>
    </Card>
  );
}

/** Turns "só no celular" on or off, keeping everything else of the event as it is. */
function useDigitalOnly(event: EventDto) {
  const t = useEventTexts().digital.digitalOnly;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (digitalOnly: boolean) => {
      // Without `kind` and `days`, the API leaves them as they are.
      const body: EventBody = {
        name: event.name,
        venue: event.venue,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        ticketPriceCents: event.ticketPriceCents,
        address: event.address,
        digitalOnly,
      };
      return api<EventDto>(`/api/events/${event.id}`, { method: "PUT", body });
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(["event", saved.id], saved);
      void queryClient.invalidateQueries({ queryKey: ["events"] });
      void queryClient.invalidateQueries({ queryKey: ["checklist", saved.id] });
      toast.success(saved.digitalOnly ? t.savedOn : t.savedOff);
    },
  });
}

/** One digital ticket in the list: who has it, its state, and how to send it again. */
function LinkRow({
  link,
  recipient,
  eventId,
  closed,
  message,
  color,
  categoryName,
  onEdit,
  onReplace,
  onRevoke,
}: {
  link: TicketLinkDto;
  recipient: Recipient | undefined;
  eventId: string;
  closed: boolean;
  message: (name: string | null, links: readonly TicketLinkDto[]) => string;
  color: CategoryColor;
  categoryName: CategoryName;
  onEdit: () => void;
  onReplace: () => void;
  onRevoke: () => void;
}) {
  const t = useEventTexts().digital;
  const markSent = useMarkSent(eventId);
  const usable = isUsable(link);
  // One person's tickets go together: the WhatsApp of one row sends them all.
  const together = recipient?.links ?? [link];
  const text = message(link.holderName, together);
  const category = categoryName(link.categoryId);
  return (
    <ListItem className={cn("items-start justify-between gap-3", !usable && "opacity-60")}>
      <div className="flex min-w-0 items-start gap-3">
        <NumberChip label={link.numberLabel} color={color(link.categoryId)} />
        <div className="flex min-w-0 flex-col gap-1">
          <span className={cn("truncate text-sm font-medium", link.holderName === null ? "text-fg-subtle" : "text-fg")}>{link.holderName ?? t.noHolder}</span>
          {(link.holderPhone !== null || category !== null) && (
            <span className="truncate text-xs text-fg-muted">
              {[link.holderPhone === null ? null : phoneLabel(link.holderPhone), category].filter((part) => part !== null).join(" · ")}
            </span>
          )}
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-subtle">
            <LinkState link={link} />
            {usable && link.state === "valid" && link.openCount === 0 && (
              <span className={cn(link.sentAt === null && "font-medium text-warning-fg")}>
                {link.sentAt === null ? t.notSent : t.sent(shortDateTime(link.sentAt))}
              </span>
            )}
            {link.seller !== null && <span>{t.bySeller(link.seller)}</span>}
          </span>
          {link.note !== null && <span className="text-xs leading-relaxed break-words text-fg-muted italic">{link.note}</span>}
        </div>
      </div>
      {usable && (
        <div className="flex shrink-0 items-center gap-1">
          <WhatsappButton
            message={text}
            phone={link.holderPhone}
            ids={together.map((item) => item.id)}
            eventId={eventId}
            size="icon"
            label={t.whatsapp}
          >
            <MessageCircle aria-hidden />
          </WhatsappButton>
          <Menu label={t.actions} trigger={<MoreHorizontal className="size-4" aria-hidden />} triggerClassName={buttonClass({ variant: "ghost", size: "icon" })}>
            <MenuItem
              icon={<Copy />}
              onSelect={async () => {
                if (await copyText(text)) {
                  markSent.mutate(together.map((item) => item.id));
                  toast.success(t.messageCopied);
                } else {
                  toast.error(t.copyFailed);
                }
              }}
            >
              {t.copyMessage}
            </MenuItem>
            <MenuItem
              icon={<Link2 />}
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
            {link.sentAt === null && (
              <MenuItem
                icon={<Check />}
                onSelect={() => {
                  markSent.mutate([link.id], { onSuccess: () => toast.success(t.sentToast) });
                }}
              >
                {t.markSent}
              </MenuItem>
            )}
            <MenuItem icon={<Pencil />} onSelect={onEdit}>
              {t.edit}
            </MenuItem>
            {!closed && link.state === "valid" && (
              <MenuItem icon={<TicketX />} onSelect={onReplace}>
                {t.replace.title}
              </MenuItem>
            )}
            <MenuItem tone="danger" icon={<Ban />} onSelect={onRevoke}>
              {t.revoke}
            </MenuItem>
          </Menu>
        </div>
      )}
    </ListItem>
  );
}

/** Every digital ticket of the event as a spreadsheet: who got what, sent, opened, entered. */
function exportLinks(t: EventTexts["digital"], links: readonly TicketLinkDto[], categoryName: CategoryName, eventName: string) {
  const slug = eventName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const state = (link: TicketLinkDto) => (link.revokedAt !== null ? t.exportStates.revoked : t.exportStates[link.state]);
  downloadCsv(t.exportFile.replace(".csv", slug === "" ? ".csv" : `-${slug}.csv`), [
    t.exportHeader,
    ...[...links]
      .sort((a, b) => a.number - b.number)
      .map((link) => [
        link.numberLabel,
        categoryName(link.categoryId) ?? "",
        link.holderName ?? "",
        link.holderPhone === null ? "" : phoneLabel(link.holderPhone),
        link.note ?? "",
        link.url,
        link.sentAt === null ? t.no : shortDateTime(link.sentAt),
        link.firstOpenedAt === null ? t.no : shortDateTime(link.firstOpenedAt),
        link.enteredAt === null ? t.no : shortDateTime(link.enteredAt),
        state(link),
      ]),
  ]);
}

export function DigitalTab({ eventId, onSelect }: { eventId: string; onSelect: SelectTab }) {
  const t = useEventTexts().digital;
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const access = useEventAccess();
  const key = ["tickets", eventId];
  const tickets = useQuery({ queryKey: key, queryFn: () => api<TicketLinksDto>(`/api/events/${eventId}/tickets`) });
  const event = useQuery({ queryKey: ["event", eventId], queryFn: () => api<EventDto>(`/api/events/${eventId}`) });
  const categoriesQuery = useQuery({ queryKey: ["categories", eventId], queryFn: () => api<CategoryDto[]>(`/api/events/${eventId}/categories`) });
  const [sending, setSending] = useState(false);
  const [importing, setImporting] = useState(false);
  const [queue, setQueue] = useState<Recipient[] | null>(null);
  const [created, setCreated] = useState<{ issued: Issued; title: string; another: boolean } | null>(null);
  const [replacing, setReplacing] = useState<{ number: number | null } | null>(null);
  const [editing, setEditing] = useState<TicketLinkDto | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<LinkFilter>("all");
  const [category, setCategory] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const search = useDeferredValue(query.trim().toLowerCase());
  const categories = categoriesQuery.data ?? [];
  const categoryName: CategoryName = (id) => categories.find((item) => item.id === id)?.name ?? null;
  const color: CategoryColor = (id) => categories.find((item) => item.id === id)?.color ?? null;
  const message = useTicketsMessage(event.data?.name ?? "", categoryName);
  const revoke = useMutation({
    mutationFn: (id: string) => api<TicketLinkDto>(`/api/ticket-links/${id}/revoke`, { method: "POST" }),
    onSuccess: () => {
      toast.success(t.revoked);
      void queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });

  if (tickets.isPending) {
    return <LoadingBlock rows={3} />;
  }
  if (tickets.isError) {
    return <ErrorMessage error={tickets.error} onRetry={() => void tickets.refetch()} />;
  }
  const data = tickets.data;
  const eventName = event.data?.name ?? "";
  const closed = event.data?.status === "closed";
  const digitalOnly = event.data?.digitalOnly ?? false;
  const canManage = access.can("manage");
  const delivers = access.can("delivery");
  if (data.paidTickets === 0) {
    return (
      <div className="flex flex-col gap-6">
        <TabHeader tab="digital" help={t.intro} />
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
        {event.data !== undefined && canManage && !digitalOnly && <DigitalOnlyCard event={event.data} />}
      </div>
    );
  }

  const label = (value: number) => String(value).padStart(data.numberDigits, "0");
  const usable = data.links.filter(isUsable);
  const recipients = groupRecipients(usable);
  const recipientOf = new Map(recipients.flatMap((recipient) => recipient.links.map((link) => [link.id, recipient] as const)));
  const pending = groupRecipients(usable.filter(isPending));
  const counts = Object.fromEntries(LINK_FILTERS.map((option) => [option, data.links.filter((link) => matchesFilter(link, option)).length])) as Record<
    LinkFilter,
    number
  >;
  const matching = data.links.filter(
    (link) => matchesFilter(link, filter) && (category === "" || (link.categoryId ?? "none") === category) && matchesQuery(link, search),
  );
  const shown = matching.slice(0, limit);
  const sendAgain = (issued: Issued, title: string) => {
    setCreated({ issued, title, another: false });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="flex flex-col gap-6">
      <TabHeader
        tab="digital"
        help={t.intro}
        actions={
          !closed &&
          delivers && (
            <>
              <Menu
                label={t.more}
                trigger={
                  <>
                    <MoreHorizontal aria-hidden />
                    <span className="max-sm:sr-only">{t.more}</span>
                  </>
                }
                triggerClassName={buttonClass({ variant: "secondary" })}
              >
                <MenuItem
                  icon={<FileUp />}
                  onSelect={() => {
                    setImporting(true);
                  }}
                >
                  {t.import.open}
                </MenuItem>
                <MenuItem
                  icon={<TicketX />}
                  onSelect={() => {
                    setReplacing({ number: null });
                  }}
                >
                  {t.replace.title}
                </MenuItem>
                {data.links.length > 0 && (
                  <MenuItem
                    icon={<Download />}
                    onSelect={() => {
                      exportLinks(t, data.links, categoryName, eventName);
                    }}
                  >
                    {t.exportCsv}
                  </MenuItem>
                )}
              </Menu>
              <Button
                icon={<Send />}
                onClick={() => {
                  setSending(true);
                }}
              >
                {t.sendTitle}
              </Button>
            </>
          )
        }
      />
      {closed && <Alert tone="warning">{eventTexts.actions.archivedNote}</Alert>}

      {created !== null && (
        <IssuedCard
          key={created.issued.links.map((link) => link.id).join()}
          eventId={eventId}
          issued={created.issued}
          title={created.title}
          message={message(created.issued.name, created.issued.links)}
          color={color}
          onClose={() => {
            setCreated(null);
          }}
          {...(created.another
            ? {
                onAnother: () => {
                  setCreated(null);
                  setSending(true);
                },
              }
            : {})}
        />
      )}

      <div className="grid grid-cols-2 gap-2 sm:gap-4 xl:grid-cols-4">
        <Stat label={t.stats.active} value={usable.length.toLocaleString("pt-BR")} icon={Send} />
        <Stat label={t.stats.pending} value={counts.pending.toLocaleString("pt-BR")} icon={Clock} tone={counts.pending > 0 ? "warning" : "brand"} />
        <Stat label={t.stats.opened} value={usable.filter((link) => link.openCount > 0).length.toLocaleString("pt-BR")} icon={Eye} />
        <Stat label={t.stats.entered} value={counts.entered.toLocaleString("pt-BR")} icon={LogIn} tone="success" />
      </div>

      {pending.length > 0 && delivers && (
        <Card className="flex flex-col gap-4 border-warning/40 bg-warning-soft/40 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-warning-soft text-warning-fg">
              <Send className="size-5" aria-hidden />
            </span>
            <div className="flex flex-col gap-0.5">
              <p className="text-base font-semibold tracking-tight text-fg">{t.queue.banner(pending.length)}</p>
              <p className="text-sm text-fg-muted">{t.queue.bannerHint}</p>
            </div>
          </div>
          <Button
            icon={<MessageCircle />}
            className="w-full sm:w-auto"
            onClick={() => {
              setQueue(pending);
            }}
          >
            {t.queue.start}
          </Button>
        </Card>
      )}

      <StockStrip data={data} categories={categories} onSelect={onSelect} />

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
                  setLimit(PAGE);
                }}
                className="pl-10"
              />
            </span>
          )}
        </div>
        {data.links.length > 0 && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div
              role="radiogroup"
              aria-label={t.filtersLabel}
              onKeyDown={segmentedKeys(LINK_FILTERS, filter, (next) => {
                setFilter(next);
                setLimit(PAGE);
              })}
              className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
            >
              {LINK_FILTERS.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={filter === option}
                  tabIndex={segmentTabIndex(LINK_FILTERS, filter, option)}
                  onClick={() => {
                    setFilter(option);
                    setLimit(PAGE);
                  }}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition pointer-coarse:min-h-11",
                    filter === option
                      ? "border-brand bg-brand-soft text-brand-soft-fg"
                      : "border-border text-fg-muted hover:border-border-strong hover:text-fg active:bg-surface-2",
                  )}
                >
                  {t.filters[option]}
                  <span className="text-xs tabular opacity-80">{counts[option].toLocaleString("pt-BR")}</span>
                </button>
              ))}
            </div>
            {categories.length > 0 && (
              <Select
                aria-label={t.categoryFilter}
                value={category}
                className="sm:w-56"
                onChange={(changeEvent) => {
                  setCategory(changeEvent.target.value);
                  setLimit(PAGE);
                }}
              >
                <option value="">{t.allCategories}</option>
                {categories.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
                {data.links.some((link) => link.categoryId === null) && <option value="none">{t.stock.uncategorized}</option>}
              </Select>
            )}
          </div>
        )}
        {data.links.length === 0 ? (
          <EmptyState
            icon={Smartphone}
            title={t.emptyTitle}
            description={t.empty}
            action={
              !closed &&
              delivers && (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    icon={<Send />}
                    onClick={() => {
                      setSending(true);
                    }}
                  >
                    {t.sendTitle}
                  </Button>
                  <Button
                    variant="secondary"
                    icon={<FileUp />}
                    onClick={() => {
                      setImporting(true);
                    }}
                  >
                    {t.import.open}
                  </Button>
                </div>
              )
            }
          />
        ) : shown.length === 0 ? (
          <EmptyState icon={Search} title={t.noResults} />
        ) : (
          <>
            <List>
              {shown.map((link) => (
                <LinkRow
                  key={link.id}
                  link={link}
                  recipient={recipientOf.get(link.id)}
                  eventId={eventId}
                  closed={closed}
                  message={message}
                  color={color}
                  categoryName={categoryName}
                  onEdit={() => {
                    setEditing(link);
                  }}
                  onReplace={() => {
                    setReplacing({ number: link.number });
                  }}
                  onRevoke={() => {
                    void confirm({ title: t.revokeTitle(link.numberLabel), description: t.revokeBody, confirmLabel: t.revoke }).then((ok) => {
                      if (ok) {
                        revoke.mutate(link.id);
                      }
                    });
                  }}
                />
              ))}
            </List>
            {matching.length > shown.length && (
              <Button
                variant="secondary"
                className="self-center"
                onClick={() => {
                  setLimit(limit + PAGE);
                }}
              >
                {t.showMore(Math.min(PAGE, matching.length - shown.length))}
              </Button>
            )}
          </>
        )}
      </section>

      <SendDialog
        eventId={eventId}
        open={sending}
        data={data}
        categories={categories}
        onClose={() => {
          setSending(false);
        }}
        onIssued={(issued) => {
          setCreated({ issued, title: t.issuedTitle(issued.links.length, issued.name), another: true });
        }}
        onNewBatch={() => {
          onSelect("batches");
        }}
      />

      {importing && (
        <ImportDialog
          eventId={eventId}
          data={data}
          categories={categories}
          onClose={() => {
            setImporting(false);
          }}
          onImported={(links) => {
            setImporting(false);
            // Straight on to sending them, one person at a time.
            setQueue(groupRecipients(links));
          }}
        />
      )}

      {queue !== null && (
        <SendQueue
          eventId={eventId}
          recipients={queue}
          message={message}
          color={color}
          categoryName={categoryName}
          onClose={() => {
            setQueue(null);
          }}
        />
      )}

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
            const phone = replacement.link.holderPhone ?? (replacedPhone === "" ? null : replacedPhone);
            sendAgain(
              { links: [replacement.link], name: replacement.link.holderName, phone },
              t.replacedTitle(replacement.oldLabel, replacement.link.numberLabel),
            );
          }}
        />
      )}

      {editing !== null && (
        <EditDialog
          key={editing.id}
          link={editing}
          eventId={eventId}
          onClose={() => {
            setEditing(null);
          }}
        />
      )}

      {!closed && delivers && !digitalOnly && <BulkLinks eventId={eventId} eventName={eventName} />}
      {event.data !== undefined && canManage && <DigitalOnlyCard event={event.data} />}
      {/* Anyone holding a ticket may check it on /conferir (ADR 0075). */}
      <PublicVerifyCard eventId={eventId} />
      {/* Holders may pass their ticket on (ADR 0097). */}
      <TransferSettingsCard eventId={eventId} />
    </div>
  );
}
