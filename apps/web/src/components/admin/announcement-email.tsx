"use client";

import type {
  AdminAnnouncementDto,
  AdminTagCountDto,
  AnnouncementAudience,
  AnnouncementAudienceDto,
  AnnouncementMailingDto,
} from "@ingressoimpresso/api-types";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Mail } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  Alert,
  Button,
  Dialog,
  ErrorMessage,
  Field,
  Select,
} from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { shortDateTime } from "@/lib/format";
import { mailOutlook } from "@/lib/mail-quota";
import { admin as adminTexts } from "@/texts/pt-BR/admin";
import { common as commonTexts } from "@/texts/pt-BR/common";

const t = adminTexts.announcements.email;
const AUDIENCES: readonly AnnouncementAudience[] = [
  "all",
  "owners",
  "paying",
  "recent",
  "tagged",
];

/** Days a sending takes at the day's share of the quota (ADR 0107). */
export function daysNeeded(recipients: number, perDay: number | null): number {
  if (perDay === null) {
    return recipients > 0 ? 1 : 0;
  }
  return perDay > 0 ? Math.ceil(recipients / perDay) : Infinity;
}

/** Still going: no end and not stopped. */
export function mailingRunning(
  mailing: AnnouncementMailingDto | null,
): boolean {
  return (
    mailing !== null &&
    mailing.finishedAt === null &&
    mailing.canceledAt === null
  );
}

/** The line under an announcement: how its e-mail went. */
export function MailingLine({ mailing }: { mailing: AnnouncementMailingDto }) {
  const running = mailingRunning(mailing);
  const done = mailing.sent + mailing.failed + mailing.skipped;
  return (
    <span className="flex min-w-0 flex-col gap-1">
      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-fg-subtle">
        <Mail className="size-3" aria-hidden />
        <span className={cn(running && "font-medium text-fg-muted")}>
          {running
            ? t.progress(mailing.sent, mailing.total)
            : t.done(mailing.sent)}
        </span>
        <span>· {t.audiences[mailing.audience] ?? mailing.audience}</span>
        {mailing.tag !== null && <span>({mailing.tag})</span>}
        {mailing.failed > 0 && (
          <span className="text-danger-fg">· {t.failed(mailing.failed)}</span>
        )}
        {mailing.skipped > 0 && <span>· {t.skipped(mailing.skipped)}</span>}
        {mailing.canceledAt !== null && <span>· {t.canceled}</span>}
        {mailing.finishedAt !== null && (
          <span>· {shortDateTime(mailing.finishedAt)}</span>
        )}
      </span>
      {running && mailing.total > 0 && (
        <span
          className="h-1 w-full max-w-60 overflow-hidden rounded-full bg-surface-3"
          aria-hidden
        >
          <span
            className="block h-full rounded-full bg-brand transition-[width]"
            style={{
              width: `${String(Math.round((done / mailing.total) * 100))}%`,
            }}
          />
        </span>
      )}
    </span>
  );
}

/**
 * What an announcement e-mail does to the day's quota (ADR 0115): a line when it fits with room,
 * a warning when it nearly uses the announcements' part, and a stronger one (with a box to tick)
 * when part of it waits for the next days and the quota stays at its limit meanwhile.
 */
export function MailQuotaNotice({
  preview,
  acknowledged,
  onAcknowledge,
  scheduled = false,
}: {
  preview: AnnouncementAudienceDto;
  acknowledged: boolean;
  onAcknowledge: (value: boolean) => void;
  /** The e-mail goes out when the announcement starts: the numbers are of now. */
  scheduled?: boolean;
}) {
  const q = t.quota;
  const outlook = mailOutlook(preview);
  if (outlook.level === "none" || preview.recipients === 0 || !Number.isFinite(outlook.days)) {
    return null;
  }
  const usage = (
    <span className="block text-xs opacity-90">
      {q.usage(preview.sentLastDay, outlook.limit)}
      {outlook.queued > 0 && ` ${q.queued(outlook.queued)}`}
      {scheduled && ` ${q.scheduled}`}
    </span>
  );
  if (outlook.level === "ok") {
    return (
      <p className="text-xs text-fg-muted">
        {q.usage(preview.sentLastDay, outlook.limit)} {q.okLine(outlook.leftAfter)}
        {outlook.queued > 0 && ` ${q.queued(outlook.queued)}`}
        {scheduled && ` ${q.scheduled}`}
      </p>
    );
  }
  if (outlook.level === "near") {
    return (
      <Alert tone="warning" title={q.nearTitle}>
        <span className="flex flex-col gap-1.5">
          <span>{q.nearBody(outlook.leftAfter)}</span>
          <span>{q.risk}</span>
          {usage}
        </span>
      </Alert>
    );
  }
  return (
    <Alert tone="danger" title={q.overTitle}>
      <span className="flex flex-col gap-2">
        <span>{q.overBody(outlook.today, preview.recipients - outlook.today, outlook.days, outlook.budget)}</span>
        <span>{q.overConsequences(outlook.reserve)}</span>
        <span>{q.risk}</span>
        {usage}
        <label className="mt-1 flex cursor-pointer items-start gap-2.5 font-medium">
          <input
            type="checkbox"
            className="mt-0.5 size-4 shrink-0 accent-[var(--brand)]"
            checked={acknowledged}
            onChange={(event) => {
              onAcknowledge(event.target.checked);
            }}
          />
          <span>{q.acknowledge}</span>
        </label>
      </span>
    </Alert>
  );
}

/** Whether a sending must be acknowledged before it goes (it does not fit the day's quota). */
export function needsQuotaAcknowledgment(preview: AnnouncementAudienceDto | undefined): boolean {
  return preview !== undefined && preview.recipients > 0 && mailOutlook(preview).level === "over";
}

/** Sends a published announcement by e-mail to an audience (ADR 0107). */
export function AnnouncementEmailDialog({
  item,
  onClose,
}: {
  item: AdminAnnouncementDto;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [audience, setAudience] = useState<AnnouncementAudience>("all");
  const [tag, setTag] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const tags = useQuery({
    queryKey: ["admin", "organization-tags"],
    queryFn: () => api<AdminTagCountDto[]>("/api/admin/organizations/tags"),
  });
  const ready = audience !== "tagged" || tag !== "";
  const query = `audience=${audience}${audience === "tagged" ? `&tag=${encodeURIComponent(tag)}` : ""}`;
  const preview = useQuery({
    queryKey: ["admin", "announcement-audience", item.id, audience, tag],
    queryFn: () =>
      api<AnnouncementAudienceDto>(
        `/api/admin/announcements/${item.id}/email?${query}`,
      ),
    enabled: ready,
    placeholderData: keepPreviousData,
  });
  const send = useMutation({
    mutationFn: () =>
      api<AdminAnnouncementDto>(`/api/admin/announcements/${item.id}/email`, {
        method: "POST",
        body: audience === "tagged" ? { audience, tag } : { audience },
      }),
    onSuccess: () => {
      toast.success(t.queued);
      void queryClient.invalidateQueries({
        queryKey: ["admin", "announcements"],
      });
      onClose();
    },
  });
  const test = useMutation({
    mutationFn: () =>
      api<undefined>(`/api/admin/announcements/${item.id}/email/test`, {
        method: "POST",
      }),
    onSuccess: () => {
      toast.success(t.testSent);
    },
  });
  const count = preview.data?.recipients ?? 0;
  const perDay = preview.data?.dailyBudget ?? null;
  const days = daysNeeded(count, perDay);
  return (
    <Dialog
      open
      onClose={onClose}
      title={t.title}
      description={t.description}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {commonTexts.cancel}
          </Button>
          <Button
            icon={<Mail />}
            loading={send.isPending}
            disabled={!ready || count === 0 || perDay === 0 || (needsQuotaAcknowledgment(preview.data) && !acknowledged)}
            onClick={() => send.mutate()}
          >
            {t.confirm(count)}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium text-fg">
            {t.audience}
          </legend>
          {AUDIENCES.map((option) => (
            <label
              key={option}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition",
                audience === option
                  ? "border-brand bg-brand-soft/40"
                  : "border-border hover:bg-surface-2 active:bg-surface-2",
              )}
            >
              <input
                type="radio"
                name="audience"
                value={option}
                checked={audience === option}
                onChange={() => {
                  setAudience(option);
                  setAcknowledged(false);
                }}
                className="mt-1 accent-[var(--color-brand)]"
              />
              <span className="flex flex-col">
                <span className="text-sm font-medium text-fg">
                  {t.audiences[option]}
                </span>
                <span className="text-xs text-fg-muted">
                  {t.audienceHints[option]}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
        {audience === "tagged" &&
          (tags.data !== undefined && tags.data.length === 0 ? (
            <p className="text-sm text-fg-muted">{t.noTags}</p>
          ) : (
            <Field label={t.tag}>
              <Select
                value={tag}
                onChange={(event) => {
                  setTag(event.target.value);
                  setAcknowledged(false);
                }}
              >
                <option value="">—</option>
                {(tags.data ?? []).map((item) => (
                  <option key={item.tag} value={item.tag}>
                    {item.tag} ({item.count})
                  </option>
                ))}
              </Select>
            </Field>
          ))}
        {ready && preview.data !== undefined && (
          <div
            className={cn(
              "flex flex-col gap-1 rounded-xl bg-surface-2 px-4 py-3 text-sm",
              preview.isPlaceholderData && "opacity-60",
            )}
          >
            <span className="font-semibold text-fg">
              {t.recipients(preview.data.recipients)}
            </span>
            {(preview.data.optedOut > 0 || preview.data.already > 0) && (
              <span className="text-xs text-fg-muted">
                {[
                  preview.data.optedOut > 0
                    ? t.optedOut(preview.data.optedOut)
                    : "",
                  preview.data.already > 0
                    ? t.already(preview.data.already)
                    : "",
                ]
                  .filter((part) => part !== "")
                  .join(" · ")}
              </span>
            )}
            {perDay !== null && perDay > 0 && count > 0 && (
              <span className="text-xs text-fg-muted">
                {t.pace(perDay, days)}
              </span>
            )}
          </div>
        )}
        {perDay === 0 && <Alert tone="warning">{t.noBudget}</Alert>}
        {ready && preview.data !== undefined && perDay !== 0 && (
          <MailQuotaNotice preview={preview.data} acknowledged={acknowledged} onAcknowledge={setAcknowledged} />
        )}
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          loading={test.isPending}
          onClick={() => test.mutate()}
        >
          {t.test}
        </Button>
        <ErrorMessage error={send.error ?? test.error} />
      </div>
    </Dialog>
  );
}
