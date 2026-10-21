"use client";

import type { AdminTagCountDto, AnnouncementAudience } from "@ingressoimpresso/api-types";
import { useQuery } from "@tanstack/react-query";
import { Bell, Check, Mail, MonitorSmartphone, type LucideIcon } from "lucide-react";

import { Field, Select } from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { admin as adminTexts } from "@/texts/pt-BR/admin";

const t = adminTexts.announcements;

/** Where an announcement goes (ADR 0109): any of the three, at least one. */
export interface ChannelChoice {
  bell: boolean;
  modal: boolean;
  email: boolean;
}

export type Channel = keyof ChannelChoice;

const CHANNELS: readonly { key: Channel; icon: LucideIcon }[] = [
  { key: "bell", icon: Bell },
  { key: "modal", icon: MonitorSmartphone },
  { key: "email", icon: Mail },
];

/** At least one channel is on. */
export function anyChannel(choice: ChannelChoice): boolean {
  return choice.bell || choice.modal || choice.email;
}

/** The short label of the channels on ("Sininho · Janela · E-mail"). */
export function channelsLabel(choice: ChannelChoice): string {
  return CHANNELS.filter(({ key }) => choice[key])
    .map(({ key }) => t.channels[key])
    .join(" · ");
}

/** Three toggles: the bell, a dialog on opening the panel, and e-mail. */
export function ChannelPicker({
  value,
  onChange,
  locked,
}: {
  value: ChannelChoice;
  onChange: (value: ChannelChoice) => void;
  /** Channels that can no longer change (the e-mail already went out). */
  locked?: ReadonlySet<Channel>;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium text-fg">{t.channelsLabel}</legend>
      {/* One row per channel: the form's column is narrow, and three cards side by side squeezed
          the explanations into a word per line. */}
      <div className="flex flex-col gap-2">
        {CHANNELS.map(({ key, icon: Icon }) => {
          const checked = value[key];
          const fixed = locked?.has(key) === true;
          return (
            <label
              key={key}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand",
                checked ? "border-brand bg-brand-soft/60" : "border-border hover:border-border-strong hover:bg-surface-2 active:bg-surface-2",
                fixed && "cursor-default opacity-60",
              )}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={checked}
                disabled={fixed}
                onChange={() => {
                  onChange({ ...value, [key]: !checked });
                }}
              />
              <span
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-lg",
                  checked ? "bg-brand-solid text-brand-fg" : "bg-surface-2 text-fg-muted",
                )}
              >
                <Icon className="size-[18px]" aria-hidden />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-sm font-semibold text-fg">{t.channels[key]}</span>
                <span className="text-xs leading-snug text-fg-muted">{t.channelHints[key]}</span>
              </span>
              <span
                aria-hidden
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-md border transition",
                  checked ? "border-brand bg-brand-solid text-brand-fg" : "border-border-strong bg-surface",
                )}
              >
                {checked && <Check className="size-3.5" strokeWidth={3} />}
              </span>
            </label>
          );
        })}
      </div>
      {!anyChannel(value) && <p className="text-xs text-danger-fg">{t.noChannel}</p>}
    </fieldset>
  );
}

const AUDIENCES: readonly AnnouncementAudience[] = ["all", "owners", "paying", "recent", "tagged"];

/** Who gets the e-mail of an announcement. */
export function AudiencePicker({
  audience,
  tag,
  onChange,
  disabled,
}: {
  audience: AnnouncementAudience;
  tag: string;
  onChange: (audience: AnnouncementAudience, tag: string) => void;
  disabled?: boolean;
}) {
  const tags = useQuery({
    queryKey: ["admin", "organization-tags"],
    queryFn: () => api<AdminTagCountDto[]>("/api/admin/organizations/tags"),
    enabled: audience === "tagged",
  });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t.email.audience} hint={t.email.audienceHints[audience]}>
        <Select
          value={audience}
          disabled={disabled}
          onChange={(event) => {
            onChange(event.target.value as AnnouncementAudience, tag);
          }}
        >
          {AUDIENCES.map((option) => (
            <option key={option} value={option}>
              {t.email.audiences[option]}
            </option>
          ))}
        </Select>
      </Field>
      {audience === "tagged" && (
        <Field label={t.email.tag}>
          <Select
            value={tag}
            disabled={disabled}
            onChange={(event) => {
              onChange(audience, event.target.value);
            }}
          >
            <option value="">{(tags.data ?? []).length === 0 ? t.email.noTags : "—"}</option>
            {(tags.data ?? []).map((item) => (
              <option key={item.tag} value={item.tag}>
                {item.tag}
              </option>
            ))}
          </Select>
        </Field>
      )}
    </div>
  );
}
