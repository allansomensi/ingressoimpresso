"use client";

import type { PublicPageBody, PublicPageSettingsDto } from "@ingressoimpresso/api-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, Globe, MessageCircle, Pencil } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useEventAccess, useEventTexts } from "@/components/event/access";
import { Badge, Button, Card, CardHeader, Dialog, ErrorMessage, Field, Switch, Textarea, buttonClass, errorMessage } from "@/components/ui";
import { api } from "@/lib/api";
import { copyText, whatsappUrl } from "@/lib/share";
import { SITE_URL } from "@/lib/site";
import { common as commonTexts } from "@/texts/pt-BR/common";

const MAX_DESCRIPTION = 600;

/** Turns typed text into an address: lowercase, accents folded, spaces as hyphens. */
export function toSlug(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 60);
}

/**
 * The event's public page (ADR 0095): one link to share with the date, the place, the prices and
 * where to buy. Shown on the event's overview; the coordination turns it on and edits it.
 */
export function PublicPageCard({ eventId, eventName }: { eventId: string; eventName: string }) {
  const t = useEventTexts().publicPage;
  const { can } = useEventAccess();
  const editable = can("manage");
  const queryClient = useQueryClient();
  const key = ["public-page", eventId];
  const settings = useQuery({ queryKey: key, queryFn: () => api<PublicPageSettingsDto>(`/api/events/${eventId}/public-page`) });
  const [editing, setEditing] = useState(false);
  const save = useMutation({
    mutationFn: (body: PublicPageBody) => api<PublicPageSettingsDto>(`/api/events/${eventId}/public-page`, { method: "PUT", body }),
    onSuccess: (saved) => {
      queryClient.setQueryData(key, saved);
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
  if (settings.data === undefined) {
    return settings.isError ? <ErrorMessage error={settings.error} /> : null;
  }
  const data = settings.data;
  const body = (patch: Partial<PublicPageBody>): PublicPageBody => ({
    enabled: data.enabled,
    slug: data.slug ?? data.suggestedSlug,
    soldOut: data.soldOut,
    ...(data.description === null ? {} : { description: data.description }),
    sellerIds: data.sellers.filter((seller) => seller.shown).map((seller) => seller.id),
    ...patch,
  });
  const url = data.url;

  return (
    <Card>
      <CardHeader
        title={t.title}
        description={url === null ? t.descriptionOff : t.descriptionOn}
        icon={Globe}
        actions={
          url !== null && (
            <span className="flex flex-wrap items-center gap-2">
              {(data.soldOut || data.soldOutAuto) && <Badge tone="danger">{t.soldOutBadge}</Badge>}
              <Badge tone="success" dot>
                {t.live}
              </Badge>
            </span>
          )
        }
      />
      {url === null ? (
        editable && (
          <Button
            icon={<Globe />}
            onClick={() => {
              setEditing(true);
            }}
          >
            {t.create}
          </Button>
        )
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex min-w-0 items-center gap-2 rounded-xl border border-border bg-surface-2 py-1 pr-1 pl-3.5">
            <span className="min-w-0 flex-1 truncate font-mono text-sm text-fg">{url.replace(/^https?:\/\//, "")}</span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t.copy}
              onClick={() => {
                void copyText(url).then((ok) => {
                  if (ok) {
                    toast.success(t.copied);
                  }
                });
              }}
            >
              <Copy />
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={whatsappUrl(t.shareMessage(eventName, url))} target="_blank" rel="noopener noreferrer" className={buttonClass({ size: "sm" })}>
              <MessageCircle />
              {t.shareWhatsapp}
            </a>
            <a href={url} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: "secondary", size: "sm" })}>
              <ExternalLink />
              {t.open}
            </a>
            {editable && (
              <Button
                variant="secondary"
                size="sm"
                icon={<Pencil />}
                onClick={() => {
                  setEditing(true);
                }}
              >
                {t.edit}
              </Button>
            )}
          </div>
          {editable && (
            <div className="border-t border-border pt-4">
              <Switch
                checked={save.isPending ? (save.variables.soldOut) : data.soldOut}
                onChange={(soldOut) => {
                  if (!save.isPending) {
                    save.mutate(body({ soldOut }), {
                      onSuccess: () => {
                        toast.success(soldOut ? t.soldOutOn : t.soldOutOff);
                      },
                    });
                  }
                }}
                label={t.soldOut}
                description={data.soldOutAuto ? t.soldOutAuto : t.soldOutHint}
              />
            </div>
          )}
        </div>
      )}
      <Dialog
        open={editing}
        onClose={() => {
          setEditing(false);
        }}
        title={url === null ? t.create : t.edit}
        description={t.dialogHint}
        size="lg"
      >
        {editing && (
          <PublicPageForm
            settings={data}
            onClose={() => {
              setEditing(false);
            }}
            onSave={(next) => {
              save.mutate(next, {
                onSuccess: (saved) => {
                  toast.success(saved.enabled ? t.saved : t.turnedOff);
                  setEditing(false);
                },
              });
            }}
            saving={save.isPending}
          />
        )}
      </Dialog>
    </Card>
  );
}

function PublicPageForm({
  settings,
  onClose,
  onSave,
  saving,
}: {
  settings: PublicPageSettingsDto;
  onClose: () => void;
  onSave: (body: PublicPageBody) => void;
  saving: boolean;
}) {
  const t = useEventTexts().publicPage;
  const [enabled, setEnabled] = useState(settings.url === null ? true : settings.enabled);
  const [slug, setSlug] = useState(settings.slug ?? settings.suggestedSlug);
  const [description, setDescription] = useState(settings.description ?? "");
  const [shown, setShown] = useState(() => new Set(settings.sellers.filter((seller) => seller.shown).map((seller) => seller.id)));
  const clean = slug.replace(/-+$/, "");
  const validSlug = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(clean) && clean.length >= 3;
  const host = SITE_URL.replace(/^https?:\/\//, "");
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (validSlug) {
          onSave({
            enabled,
            slug: clean,
            soldOut: settings.soldOut,
            ...(description.trim() === "" ? {} : { description }),
            sellerIds: [...shown],
          });
        }
      }}
    >
      <Switch checked={enabled} onChange={setEnabled} label={t.enabled} description={enabled ? t.enabledOn : t.enabledOff} />
      <Field label={t.address} hint={validSlug || slug === "" ? t.addressHint : t.addressInvalid}>
        <span className="flex min-w-0 items-stretch overflow-hidden rounded-xl border border-border-strong bg-surface shadow-xs focus-within:border-brand focus-within:ring-4 focus-within:ring-ring">
          <span className="flex shrink-0 items-center border-r border-border bg-surface-2 px-3 text-sm text-fg-muted max-sm:hidden">{host}/e/</span>
          <input
            value={slug}
            maxLength={60}
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-label={t.address}
            className="h-11 min-w-0 flex-1 bg-transparent px-3 font-mono text-base text-fg outline-none sm:text-sm"
            onChange={(event) => {
              setSlug(toSlug(event.target.value));
            }}
          />
        </span>
      </Field>
      <Field label={t.about} hint={t.aboutHint} optional>
        <Textarea
          value={description}
          rows={3}
          maxLength={MAX_DESCRIPTION}
          placeholder={t.aboutPlaceholder}
          onChange={(event) => {
            setDescription(event.target.value);
          }}
        />
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-medium text-fg">{t.sellers}</legend>
        {settings.sellers.length === 0 ? (
          <p className="text-sm text-fg-muted">{t.noSellers}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
            {settings.sellers.map((seller) => (
              <li key={seller.id}>
                <label className="flex min-h-12 cursor-pointer items-center gap-3 px-3.5 py-2 has-disabled:cursor-not-allowed has-disabled:opacity-60">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--brand)]"
                    checked={shown.has(seller.id)}
                    disabled={!seller.hasWhatsapp}
                    onChange={(event) => {
                      const next = new Set(shown);
                      if (event.target.checked) {
                        next.add(seller.id);
                      } else {
                        next.delete(seller.id);
                      }
                      setShown(next);
                    }}
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium text-fg">{seller.name}</span>
                    {!seller.hasWhatsapp && <span className="text-xs text-fg-muted">{t.noWhatsapp}</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs leading-relaxed text-fg-muted">{t.sellersHint}</p>
      </fieldset>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onClose}>
          {commonTexts.cancel}
        </Button>
        <Button type="submit" loading={saving} disabled={!validSlug}>
          {enabled ? t.publish : commonTexts.save}
        </Button>
      </div>
    </form>
  );
}
