"use client";

import type { MaintenanceMode, PlatformSettingsBody, PlatformSettingsDto } from "@ingressoimpresso/api-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Save, UserPlus, Wrench } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Alert, Button, Card, CardHeader, ErrorMessage, Field, Input, Lead, LoadingBlock, Switch, Textarea, useConfirm } from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { dateTime } from "@/lib/format";
import { fromLocalInput, toLocalInput } from "@/lib/local-time";
import { useUnsavedChanges } from "@/lib/unsaved";
import { texts } from "@/texts/pt-BR";

const t = texts.admin.settings;
const MODES: readonly MaintenanceMode[] = ["off", "read_only", "full"];

/** One domain per line, the way the server reads it (it normalizes and validates). */
function domainsOf(text: string): string[] {
  return text
    .split(/[\s,;]+/)
    .map((domain) => domain.trim())
    .filter((domain) => domain !== "");
}

function Editor({ settings }: { settings: PlatformSettingsDto }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [mode, setMode] = useState<MaintenanceMode>(settings.maintenance.mode);
  const [message, setMessage] = useState(settings.maintenance.message ?? "");
  const [endsAt, setEndsAt] = useState(toLocalInput(settings.maintenance.endsAt));
  const [open, setOpen] = useState(settings.registrationsOpen);
  const [domains, setDomains] = useState(settings.blockedEmailDomains.join("\n"));
  const body: PlatformSettingsBody = {
    maintenanceMode: mode,
    maintenanceMessage: message.trim() === "" ? null : message.trim(),
    maintenanceEndsAt: mode === "off" ? null : fromLocalInput(endsAt),
    registrationsOpen: open,
    blockedEmailDomains: domainsOf(domains),
  };
  const dirty =
    mode !== settings.maintenance.mode ||
    (message.trim() || null) !== settings.maintenance.message ||
    (mode !== "off" && fromLocalInput(endsAt) !== settings.maintenance.endsAt) ||
    open !== settings.registrationsOpen ||
    domainsOf(domains).join("\n") !== settings.blockedEmailDomains.join("\n");
  useUnsavedChanges(dirty);
  const save = useMutation({
    mutationFn: () => api<PlatformSettingsDto>("/api/admin/settings", { method: "PUT", body }),
    onSuccess: (saved) => {
      queryClient.setQueryData(["admin", "settings"], saved);
      void queryClient.invalidateQueries({ queryKey: ["platform"] });
      setDomains(saved.blockedEmailDomains.join("\n"));
      toast.success(t.saved);
    },
  });
  const submit = async () => {
    if (mode === "full" && settings.maintenance.mode !== "full") {
      const ok = await confirm({ title: t.fullConfirmTitle, description: t.fullConfirmBody, confirmLabel: t.fullConfirm });
      if (!ok) {
        return;
      }
    }
    save.mutate();
  };

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Card>
        <CardHeader icon={Wrench} title={t.maintenanceTitle} description={t.maintenanceHint} />
        <div role="radiogroup" aria-label={t.maintenanceTitle} className="grid gap-2 sm:grid-cols-3">
          {MODES.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={mode === option}
              onClick={() => {
                setMode(option);
              }}
              className={cn(
                "flex flex-col gap-1 rounded-xl border p-3.5 text-left transition",
                mode === option
                  ? option === "off"
                    ? "border-success/40 bg-success-soft"
                    : "border-warning/50 bg-warning-soft"
                  : "border-border hover:border-border-strong hover:bg-surface-2",
              )}
            >
              <span className="text-sm font-semibold text-fg">{t.modes[option].title}</span>
              <span className="text-xs leading-relaxed text-fg-muted">{t.modes[option].body}</span>
            </button>
          ))}
        </div>
        {mode !== "off" && (
          <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_16rem]">
            <Field label={t.message} hint={t.messageHint} optional>
              <Textarea
                value={message}
                maxLength={500}
                rows={3}
                placeholder={t.messagePlaceholder}
                onChange={(event) => {
                  setMessage(event.target.value);
                }}
              />
            </Field>
            <Field label={t.endsAt} hint={t.endsAtHint} optional>
              <Input
                type="datetime-local"
                value={endsAt}
                onChange={(event) => {
                  setEndsAt(event.target.value);
                }}
              />
            </Field>
          </div>
        )}
        {settings.maintenance.mode !== "off" && settings.maintenance.startedAt !== null && (
          <p className="mt-4 text-xs text-fg-muted">{t.since(dateTime(settings.maintenance.startedAt))}</p>
        )}
      </Card>

      <Card>
        <CardHeader icon={UserPlus} title={t.signUpsTitle} description={t.signUpsHint} />
        <Switch checked={open} onChange={setOpen} label={t.signUps} description={open ? t.signUpsOn : t.signUpsOff} />
      </Card>

      <Card>
        <CardHeader icon={Ban} title={t.domainsTitle} description={t.domainsHint} />
        <Field label={t.domains} hint={t.domainsCount(domainsOf(domains).length)}>
          <Textarea
            value={domains}
            rows={6}
            spellCheck={false}
            autoCapitalize="none"
            placeholder={"mailinator.com\ntempmail.io"}
            className="font-mono text-sm"
            onChange={(event) => {
              setDomains(event.target.value);
            }}
          />
        </Field>
      </Card>

      <ErrorMessage error={save.error} />
      <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-20 flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface/95 p-3 pl-4 shadow-md backdrop-blur sm:bottom-4">
        <span className="text-xs text-fg-muted">
          {dirty ? t.unsaved : settings.updatedBy !== null ? t.updatedBy(settings.updatedBy, dateTime(settings.updatedAt)) : t.noChanges}
        </span>
        <Button type="submit" icon={<Save />} loading={save.isPending} disabled={!dirty}>
          {texts.common.save}
        </Button>
      </div>
    </form>
  );
}

/** Platform switches (ADR 0037). */
export function AdminSettings() {
  const settings = useQuery({ queryKey: ["admin", "settings"], queryFn: () => api<PlatformSettingsDto>("/api/admin/settings") });
  return (
    <div className="flex flex-col gap-4">
      <Lead>{t.intro}</Lead>
      {settings.isPending ? (
        <LoadingBlock rows={3} />
      ) : settings.isError ? (
        <ErrorMessage error={settings.error} />
      ) : (
        <>
          {settings.data.maintenance.mode !== "off" && <Alert tone="warning">{t.activeNow}</Alert>}
          <Editor key={settings.data.updatedAt} settings={settings.data} />
        </>
      )}
    </div>
  );
}
