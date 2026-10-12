"use client";

import type { OrganizationProfileDto, PublicOrganizationDto } from "@ingressoimpresso/api-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Contact, ImageUp, MapPin, Palette, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";

import { OrganizationContact, OrganizationLogo } from "@/components/organization/organization";
import { Alert, Button, Card, CardHeader, ErrorMessage, Field, Input, LoadingBlock, PageHeader, errorMessage, useConfirm } from "@/components/ui";
import { api, upload } from "@/lib/api";
import { cn } from "@/lib/cn";
import { parseMoney } from "@/lib/format";
import { profileBody, profileForm, type ProfileForm } from "@/lib/organization";
import { textOn } from "@/lib/ticket-pass";
import { useUnsavedChanges } from "@/lib/unsaved";
import { texts } from "@/texts/pt-BR";

const t = texts.profile;
const KEY = ["organization-profile"];
const DEFAULT_COLOR = "#5b3df5";
/** The API's limit (`MAX_LOGO_BYTES`): checked here first so nobody waits for a refused upload. */
const MAX_LOGO_BYTES = 8 * 1024 * 1024;

export default function OrganizationProfilePage() {
  const profile = useQuery({ queryKey: KEY, queryFn: () => api<OrganizationProfileDto>("/api/account/profile") });
  return (
    <main className="flex flex-col gap-6 animate-fade-in">
      <Link
        href="/painel/conta"
        className="-ml-1.5 inline-flex min-h-9 w-fit items-center gap-1 rounded-lg px-1.5 text-sm font-medium text-fg-muted transition hover:text-fg active:bg-surface-2 pointer-coarse:min-h-10"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {texts.panel.accountPage}
      </Link>
      <PageHeader title={t.title} description={t.description} />
      {profile.isPending ? (
        <LoadingBlock rows={5} />
      ) : profile.isError ? (
        <ErrorMessage error={profile.error} />
      ) : (
        <ProfileEditor key={profile.dataUpdatedAt} profile={profile.data} />
      )}
    </main>
  );
}

function ProfileEditor({ profile }: { profile: OrganizationProfileDto }) {
  const queryClient = useQueryClient();
  const saved = profileForm(profile);
  const [form, setForm] = useState<ProfileForm>(saved);
  const price = parseMoney(form.defaultPrice);
  const dirty = (Object.keys(saved) as (keyof ProfileForm)[]).some((key) => saved[key].trim() !== form[key].trim());
  useUnsavedChanges(dirty);
  const set = (key: keyof ProfileForm) => (value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };
  const save = useMutation({
    mutationFn: () =>
      api<OrganizationProfileDto>("/api/account/profile", { method: "PUT", body: profileBody(form, price.ok ? price.cents : null) }),
    onSuccess: (fresh) => {
      queryClient.setQueryData(KEY, fresh);
      toast.success(t.saved);
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };
  // The preview shows what is typed (the server normalizes the rest when saving).
  const preview: PublicOrganizationDto = {
    name: profile.organizationName,
    logoPath: profile.logo?.path ?? null,
    brandColor: /^#[0-9a-f]{6}$/i.test(form.brandColor) ? form.brandColor : null,
    whatsapp: form.whatsapp.replace(/\D/g, "") === "" ? null : form.whatsapp.replace(/\D/g, ""),
    email: form.contactEmail.trim() === "" ? null : form.contactEmail.trim(),
    website: form.website.trim() === "" ? null : form.website.trim(),
    instagram: form.instagram.trim() === "" ? null : form.instagram.trim().replace(/^@/, ""),
  };

  return (
    <form onSubmit={submit} className="grid items-start gap-6 pb-24 lg:grid-cols-[minmax(0,1fr)_340px] lg:pb-0">
      <div className="flex min-w-0 flex-col gap-6">
        <Card>
          <CardHeader icon={Palette} title={t.brandTitle} />
          <div className="flex flex-col gap-6">
            <LogoField profile={profile} />
            <Field label={t.color} hint={t.colorHint}>
              <div className="flex flex-wrap items-center gap-3">
                <Input
                  type="color"
                  value={/^#[0-9a-f]{6}$/i.test(form.brandColor) ? form.brandColor.toLowerCase() : DEFAULT_COLOR}
                  onChange={(event) => {
                    set("brandColor")(event.target.value);
                  }}
                />
                {form.brandColor !== "" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      set("brandColor")("");
                    }}
                  >
                    {t.colorClear}
                  </Button>
                )}
              </div>
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader icon={Contact} title={t.contactTitle} description={t.contactHint} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.whatsapp} optional hint={t.whatsappHint} className="sm:col-span-2">
              <Input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={form.whatsapp}
                maxLength={30}
                placeholder={t.whatsappPlaceholder}
                onChange={(event) => {
                  set("whatsapp")(event.target.value);
                }}
              />
            </Field>
            <Field label={t.email} optional>
              <Input
                type="email"
                autoComplete="email"
                value={form.contactEmail}
                maxLength={254}
                placeholder={t.emailPlaceholder}
                onChange={(event) => {
                  set("contactEmail")(event.target.value);
                }}
              />
            </Field>
            <Field label={t.website} optional>
              <Input
                inputMode="url"
                autoComplete="url"
                autoCapitalize="none"
                value={form.website}
                maxLength={200}
                placeholder={t.websitePlaceholder}
                onChange={(event) => {
                  set("website")(event.target.value);
                }}
              />
            </Field>
            <Field label={t.instagram} optional>
              <Input
                autoCapitalize="none"
                autoCorrect="off"
                value={form.instagram}
                maxLength={80}
                placeholder={t.instagramPlaceholder}
                onChange={(event) => {
                  set("instagram")(event.target.value);
                }}
              />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader icon={MapPin} title={t.defaultsTitle} description={t.defaultsHint} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.defaultVenue} optional>
              <Input
                value={form.defaultVenue}
                maxLength={120}
                placeholder={texts.panel.venuePlaceholder}
                onChange={(event) => {
                  set("defaultVenue")(event.target.value);
                }}
              />
            </Field>
            <Field label={t.defaultPrice} optional hint={price.ok ? undefined : <span className="text-danger-fg">{texts.panel.priceInvalid}</span>}>
              <span className="relative flex">
                <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-sm text-fg-muted">{texts.common.currency}</span>
                <Input
                  inputMode="decimal"
                  value={form.defaultPrice}
                  placeholder={texts.panel.pricePlaceholder}
                  aria-invalid={!price.ok || undefined}
                  className="pl-10"
                  onChange={(event) => {
                    set("defaultPrice")(event.target.value);
                  }}
                />
              </span>
            </Field>
            <Field label={t.defaultAddress} optional className="sm:col-span-2">
              <Input
                value={form.defaultAddress}
                maxLength={200}
                autoComplete="street-address"
                placeholder={texts.panel.addressPlaceholder}
                onChange={(event) => {
                  set("defaultAddress")(event.target.value);
                }}
              />
            </Field>
          </div>
        </Card>
        <ErrorMessage error={save.error} />
      </div>

      <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-24">
        <Preview organization={preview} />
        {/* Phones: the save button stays within reach at the bottom (above the tab bar). */}
        <div className="max-lg:fixed max-lg:inset-x-0 max-lg:bottom-[calc(4rem+env(safe-area-inset-bottom))] max-lg:z-30 max-lg:border-t max-lg:border-border max-lg:bg-bg max-lg:px-4 max-lg:py-3 max-sm:bottom-[calc(4rem+env(safe-area-inset-bottom))] sm:max-lg:bottom-0 sm:max-lg:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button type="submit" icon={<Save />} loading={save.isPending} disabled={!dirty || !price.ok} className="w-full">
            {texts.common.save}
          </Button>
        </div>
      </div>
    </form>
  );
}

/** The logo: upload (moderated, ADR 0042), state of the review, remove. */
function LogoField({ profile }: { profile: OrganizationProfileDto }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const input = useRef<HTMLInputElement>(null);
  const logo = profile.logo;
  const send = useMutation({
    mutationFn: (file: File) => upload<OrganizationProfileDto>("/api/account/profile/logo", file),
    onSuccess: (fresh) => {
      queryClient.setQueryData(KEY, fresh);
      toast.success(t.logoSaved);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const remove = useMutation({
    mutationFn: () => api<OrganizationProfileDto>("/api/account/profile/logo", { method: "DELETE" }),
    onSuccess: (fresh) => {
      queryClient.setQueryData(KEY, fresh);
      toast.success(t.logoRemoved);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const state = logo === null ? "" : t.logoStates[logo.moderation as keyof typeof t.logoStates];
  const refused = logo?.moderation === "rejected";
  return (
    <div className="flex flex-col gap-3">
      <span className="text-sm font-medium text-fg">{t.logo}</span>
      <div className="flex items-center gap-4">
        <span className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-border-strong bg-surface-2">
          {logo?.path != null ? (
            <OrganizationLogo organization={{ name: profile.organizationName, logoPath: logo.path }} className="size-full rounded-2xl p-2 shadow-none ring-0" />
          ) : (
            <ImageUp aria-hidden className={cn("size-7", refused ? "text-danger-fg" : "text-fg-subtle")} />
          )}
        </span>
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={<ImageUp />}
              loading={send.isPending}
              onClick={() => {
                input.current?.click();
              }}
            >
              {logo === null ? t.logoUpload : t.logoReplace}
            </Button>
            {logo !== null && (
              <Button
                variant="danger-ghost"
                size="sm"
                icon={<Trash2 />}
                loading={remove.isPending}
                onClick={() => {
                  void confirm({ title: t.logoRemoveTitle, description: t.logoRemoveBody, confirmLabel: t.logoRemove }).then((ok) => {
                    if (ok) {
                      remove.mutate();
                    }
                  });
                }}
              >
                {t.logoRemove}
              </Button>
            )}
          </div>
          <span className="text-xs leading-relaxed text-fg-muted">{t.logoHint}</span>
        </div>
      </div>
      {state !== "" && <Alert tone={refused ? "danger" : "warning"}>{state}</Alert>}
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file === undefined) {
            return;
          }
          if (file.size > MAX_LOGO_BYTES) {
            toast.error(texts.errors.payload_too_large);
            return;
          }
          send.mutate(file);
        }}
      />
    </div>
  );
}

/** How the public pages show the organization: the header of the digital ticket, the contact. */
function Preview({ organization }: { organization: PublicOrganizationDto }) {
  const band = organization.brandColor ?? DEFAULT_COLOR;
  const ink = textOn(band);
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-xs">
      <div className="flex flex-col gap-0.5 px-5 pt-4 pb-3">
        <span className="text-sm font-semibold text-fg">{t.previewTitle}</span>
        <span className="text-xs text-fg-muted">{t.previewHint}</span>
      </div>
      <div className="mx-4 mb-4 overflow-hidden rounded-2xl border border-border shadow-sm">
        <div className="flex flex-col gap-2 px-5 pt-5 pb-6" style={{ backgroundColor: band, color: ink }}>
          <span className="flex items-center gap-3">
            <OrganizationLogo organization={organization} className="size-10" />
            <span className="text-xs font-semibold tracking-[0.16em] uppercase opacity-90">{texts.ticket.by(organization.name)}</span>
          </span>
          <span className="text-xl leading-tight font-bold">{texts.landing.templateSamples.show.name}</span>
        </div>
        <PreviewContact organization={organization} />
      </div>
    </section>
  );
}

function PreviewContact({ organization }: { organization: PublicOrganizationDto }): ReactNode {
  const contact = <OrganizationContact organization={organization} message="" />;
  return <div className="bg-surface p-4">{contact}</div>;
}
