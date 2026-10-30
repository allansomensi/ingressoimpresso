"use client";

import type {
  ArtDto,
  FontChoice,
  PageBackground,
  PageHero,
  PageSection,
  PublicEventDto,
  PublicPageDesign,
  PublicPageDesignBody,
  PublicPageSettingsDto,
} from "@ingressoimpresso/api-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Eye, EyeOff, ImagePlus, Monitor, Palette, Plus, Redo2, RotateCcw, Smartphone, Trash2, Undo2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { useEventTexts } from "@/components/event/access";
import { EventPage, pageSurface } from "@/components/public-event/event-page";
import { Button, Dialog, ErrorMessage, Field, Input, Spinner, Switch, Textarea, errorMessage, segmentTabIndex, segmentedKeys, useConfirm } from "@/components/ui";
import { api, fetchBlobUrl, upload } from "@/lib/api";
import { cn } from "@/lib/cn";
import { FONT_FAMILIES } from "@/lib/design-rules";
import {
  MAX_ANSWER,
  MAX_FAQ,
  MAX_LINKS,
  MAX_LINK_LABEL,
  MAX_QUESTION,
  MAX_SCHEDULE,
  MAX_SCHEDULE_DETAIL,
  MAX_SCHEDULE_TIME,
  MAX_SCHEDULE_TITLE,
  PAGE_ACCENTS,
  defaultPageDesign,
  designBody,
  everySection,
  hasIssues,
  isHexColor,
  moveSection,
  pageAccent,
  pageDesignIssues,
} from "@/lib/page-design";
import { useUnsavedChanges } from "@/lib/unsaved";
import { useHistory } from "@/lib/use-history";
import { SITE_URL } from "@/lib/site";
import { common as commonTexts } from "@/texts/pt-BR/common";

const BACKGROUNDS: readonly PageBackground[] = ["plain", "tinted", "dark"];
const HEROES: readonly PageHero[] = ["color", "gradient", "cover"];
const FONTS: readonly FontChoice[] = ["sans", "display", "condensed", "serif", "slab", "classic", "roman", "script", "casual", "mono"];

type Device = "phone" | "desktop";
type Pane = "edit" | "preview";

interface Draft {
  design: PublicPageDesign;
  cover: { id: string; moderation: string } | null;
}

/** A row of buttons that picks one value (`role="radiogroup"`, one tab stop, arrows move). */
function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  names,
  icons,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  names: Record<T, string>;
  icons?: Partial<Record<T, ReactNode>>;
}) {
  return (
    <div role="radiogroup" aria-label={label} onKeyDown={segmentedKeys(options, value, onChange)} className="flex gap-1 rounded-xl bg-surface-2 p-1">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          tabIndex={segmentTabIndex(options, value, option)}
          onClick={() => {
            onChange(option);
          }}
          className={cn(
            "flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 text-sm font-medium transition pointer-coarse:min-h-11 [&_svg]:size-4",
            value === option ? "bg-surface text-fg shadow-sm ring-1 ring-border" : "text-fg-muted hover:text-fg active:text-fg",
          )}
        >
          {icons?.[option]}
          {names[option]}
        </button>
      ))}
    </div>
  );
}

/** One group of controls, with a title and an optional count. */
function Group({ title, aside, hint, children }: { title: string; aside?: ReactNode; hint?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-border pt-5 first:border-t-0 first:pt-0">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold tracking-tight text-fg">{title}</h3>
        {aside !== undefined && <span className="text-xs text-fg-subtle tabular">{aside}</span>}
      </div>
      {hint !== undefined && <p className="-mt-1.5 text-xs leading-relaxed text-fg-muted">{hint}</p>}
      {children}
    </section>
  );
}

/** Up, down and remove for an item of a list the organizer writes. */
function ItemActions({ index, count, onMove, onRemove, label }: { index: number; count: number; onMove: (delta: number) => void; onRemove: () => void; label: string }) {
  const t = useEventTexts().publicPage.designer;
  return (
    <div className="flex items-center gap-0.5">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t.moveUp(label)}
        disabled={index === 0}
        onClick={() => {
          onMove(-1);
        }}
      >
        <ArrowUp />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t.moveDown(label)}
        disabled={index === count - 1}
        onClick={() => {
          onMove(1);
        }}
      >
        <ArrowDown />
      </Button>
      <Button variant="ghost" size="icon-sm" aria-label={`${t.remove} ${label}`} onClick={onRemove}>
        <Trash2 />
      </Button>
    </div>
  );
}

function move<T>(items: readonly T[], index: number, delta: number): T[] {
  const target = index + delta;
  const item = items[index];
  if (item === undefined || target < 0 || target >= items.length) {
    return [...items];
  }
  const next = items.filter((_, position) => position !== index);
  next.splice(target, 0, item);
  return next;
}

/** Whether a part has something to show on this event, for the hint beside its name. */
function sectionEmpty(kind: PageSection, event: PublicEventDto, design: PublicPageDesign): boolean {
  const contact = event.organization.whatsapp !== null || event.organization.email !== null || event.organization.instagram !== null || event.organization.website !== null;
  switch (kind) {
    case "prices":
      return false;
    case "waitlist":
      return !event.waitlist;
    case "buy":
      return event.sellers.length === 0 && !contact;
    case "schedule":
      return design.schedule.length === 0;
    case "days":
      return event.days.length < 2;
    case "where":
      return event.venue === null && event.address === null;
    case "about":
      return event.description === null;
    case "faq":
      return design.faq.length === 0;
    case "links":
      return design.links.length === 0;
    case "verify":
      return !event.publicVerify;
  }
}

/**
 * The page's look (ADR 0125): colours, the top with a cover photo, the title's font, a main
 * button, the parts in order, and the organizer's program, questions and links, beside a live
 * preview drawn by the same component as `/e/<slug>`. On a phone, "Editar" and "Prévia" swap.
 */
export function PageDesigner({ eventId, settings, open, onClose }: { eventId: string; settings: PublicPageSettingsDto; open: boolean; onClose: () => void }) {
  const t = useEventTexts().publicPage.designer;
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [initial] = useState<Draft>(() => ({ design: { ...settings.design, sections: everySection(settings.design.sections) }, cover: settings.cover }));
  const { draft, change, undo, redo, canUndo, canRedo } = useHistory<Draft>(initial);
  const design = draft.design;
  const [pane, setPane] = useState<Pane>("edit");
  const [device, setDevice] = useState<Device>("phone");
  const [localCovers, setLocalCovers] = useState<Record<string, string>>({});
  const [showIssues, setShowIssues] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  useUnsavedChanges(open && dirty);

  const preview = useQuery({ queryKey: ["public-page-preview", eventId], queryFn: () => api<PublicEventDto>(`/api/events/${eventId}/public-page/preview`), enabled: open });
  const coverId = draft.cover?.id ?? null;
  const savedCover = useQuery({
    queryKey: ["art", eventId, coverId],
    queryFn: () => fetchBlobUrl(`/api/events/${eventId}/art/${coverId ?? ""}`),
    enabled: open && coverId !== null && localCovers[coverId] === undefined,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const coverUrl = coverId === null ? null : (localCovers[coverId] ?? savedCover.data ?? null);
  // A cover under review or refused is not on the page: the preview shows what the public sees.
  const coverShown = draft.cover !== null && draft.cover.moderation !== "flagged" && draft.cover.moderation !== "rejected" ? coverUrl : null;

  useEffect(
    () => () => {
      for (const url of Object.values(localCovers)) {
        URL.revokeObjectURL(url);
      }
    },
    [localCovers],
  );

  const set = (patch: Partial<PublicPageDesign>, key: string | null = null) => {
    change((current) => ({ ...current, design: { ...current.design, ...patch } }), key);
  };

  const uploadCover = useMutation({
    mutationFn: async (file: File) => ({ file, art: await upload<ArtDto>(`/api/events/${eventId}/art`, file) }),
    onSuccess: ({ file, art }) => {
      setLocalCovers((current) => ({ ...current, [art.id]: URL.createObjectURL(file) }));
      change((current) => ({ design: { ...current.design, hero: "cover" }, cover: { id: art.id, moderation: art.moderation } }));
    },
    onError: (error) => {
      toast.error(error instanceof Error && error.message !== "" ? errorMessage(error) : t.coverFailed);
    },
  });

  const issues = pageDesignIssues(design);
  const save = useMutation({
    mutationFn: () => {
      const body: PublicPageDesignBody = { design: designBody(design), coverId };
      return api<PublicPageSettingsDto>(`/api/events/${eventId}/public-page/design`, { method: "PUT", body });
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(["public-page", eventId], saved);
      toast.success(t.saved);
      onClose();
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });

  const close = () => {
    if (!dirty || save.isPending) {
      onClose();
      return;
    }
    void confirm({ title: t.discardTitle, description: t.discardBody, confirmLabel: t.discard }).then((ok) => {
      if (ok) {
        onClose();
      }
    });
  };

  const submit = () => {
    if (hasIssues(issues)) {
      setShowIssues(true);
      setPane("edit");
      toast.error(t.issues);
      return;
    }
    save.mutate();
  };

  const event = preview.data;
  const effectiveAccent = event === undefined ? design.accent : pageAccent(design, event.organization);
  const customAccent = design.accent !== null && !PAGE_ACCENTS.includes(design.accent);

  const editor = (
    <div className="flex flex-col gap-5">
      <Group title={t.groups.look}>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-fg">{t.accent}</span>
          <div role="radiogroup" aria-label={t.accent} className="flex flex-wrap gap-2">
            <button
              type="button"
              role="radio"
              aria-checked={design.accent === null}
              onClick={() => {
                set({ accent: null });
              }}
              title={t.accentAutoHint}
              className={cn(
                "relative flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition touch-target",
                design.accent === null ? "border-brand bg-brand-soft text-brand-soft-fg ring-2 ring-brand/25" : "border-border-strong text-fg-muted hover:bg-surface-2 active:bg-surface-2",
              )}
            >
              <Palette className="size-3.5" aria-hidden />
              {t.accentAuto}
            </button>
            {PAGE_ACCENTS.map((color) => (
              <button
                key={color}
                type="button"
                role="radio"
                aria-checked={design.accent === color}
                aria-label={t.accentSwatch(color)}
                onClick={() => {
                  set({ accent: color });
                }}
                className={cn(
                  "relative size-9 rounded-full ring-offset-2 ring-offset-surface transition touch-target hover:scale-105 active:scale-95",
                  design.accent === color ? "ring-2 ring-fg" : "ring-1 ring-black/10",
                )}
                style={{ backgroundColor: color }}
              />
            ))}
            <label
              className={cn(
                "relative flex size-9 cursor-pointer items-center justify-center overflow-hidden rounded-full ring-offset-2 ring-offset-surface touch-target",
                customAccent ? "ring-2 ring-fg" : "ring-1 ring-border-strong",
              )}
              style={{ background: customAccent ? (design.accent ?? undefined) : "conic-gradient(#ef4444, #f59e0b, #22c55e, #0ea5e9, #8b5cf6, #ef4444)" }}
              title={t.accentCustom}
            >
              <span className="sr-only">{t.accentCustom}</span>
              <input
                type="color"
                className="absolute inset-0 cursor-pointer opacity-0"
                value={design.accent ?? effectiveAccent ?? "#5b3df5"}
                onChange={(event) => {
                  if (isHexColor(event.target.value)) {
                    set({ accent: event.target.value.toLowerCase() }, "accent");
                  }
                }}
              />
            </label>
          </div>
          <p className="text-xs leading-relaxed text-fg-muted">{design.accent === null ? t.accentAutoHint : t.accentHint}</p>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-fg">{t.background}</span>
          <Segmented
            label={t.background}
            options={BACKGROUNDS}
            value={design.background}
            names={t.backgrounds}
            onChange={(background) => {
              set({ background });
            }}
          />
          <p className="text-xs leading-relaxed text-fg-muted">{t.backgroundHint}</p>
        </div>
      </Group>

      <Group title={t.groups.top}>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-fg">{t.hero}</span>
          <Segmented
            label={t.hero}
            options={HEROES}
            value={design.hero}
            names={t.heroes}
            onChange={(hero) => {
              set({ hero });
              if (hero === "cover" && draft.cover === null) {
                fileInput.current?.click();
              }
            }}
          />
        </div>
        {(design.hero === "cover" || draft.cover !== null) && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-fg">{t.cover}</span>
            {draft.cover === null ? (
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={uploadCover.isPending}
                className="flex aspect-[16/7] w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-strong bg-surface-2/50 text-sm font-medium text-fg-muted transition hover:border-brand hover:text-fg active:border-brand"
              >
                {uploadCover.isPending ? <Spinner /> : <ImagePlus className="size-6" aria-hidden />}
                {t.coverUpload}
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <span className="relative aspect-[16/9] w-36 shrink-0 overflow-hidden rounded-lg bg-surface-2 ring-1 ring-border">
                  {coverUrl !== null && (
                    // A local blob: URL, not something next/image can optimize.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={coverUrl} alt={t.coverAlt} className="size-full object-cover" />
                  )}
                  {uploadCover.isPending && (
                    <span className="absolute inset-0 flex items-center justify-center bg-surface/70">
                      <Spinner />
                    </span>
                  )}
                </span>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" icon={<ImagePlus />} onClick={() => fileInput.current?.click()} disabled={uploadCover.isPending}>
                    {t.coverChange}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Trash2 />}
                    onClick={() => {
                      change((current) => ({ design: { ...current.design, hero: current.design.hero === "cover" ? "gradient" : current.design.hero }, cover: null }));
                    }}
                  >
                    {t.coverRemove}
                  </Button>
                </div>
              </div>
            )}
            <p className={cn("text-xs leading-relaxed", draft.cover?.moderation === "rejected" || draft.cover?.moderation === "flagged" ? "text-danger-fg" : "text-fg-muted")}>
              {draft.cover?.moderation === "rejected"
                ? t.coverRejected
                : draft.cover?.moderation === "flagged"
                  ? t.coverReview
                  : design.hero === "cover" && draft.cover === null
                    ? t.coverNeeded
                    : t.coverHint}
            </p>
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file !== undefined) {
                  uploadCover.mutate(file);
                }
              }}
            />
          </div>
        )}
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-fg">{t.titleFont}</span>
          <div role="radiogroup" aria-label={t.titleFont} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[null, ...FONTS].map((font) => (
              <button
                key={font ?? "default"}
                type="button"
                role="radio"
                aria-checked={design.titleFont === font}
                onClick={() => {
                  set({ titleFont: font });
                }}
                className={cn(
                  "flex min-h-12 items-center justify-center truncate rounded-xl border px-2 text-lg leading-none transition",
                  design.titleFont === font ? "border-brand bg-brand-soft text-brand-soft-fg ring-2 ring-brand/20" : "border-border-strong bg-surface text-fg hover:bg-surface-2 active:bg-surface-2",
                )}
                style={font === null ? undefined : { fontFamily: `${FONT_FAMILIES[font]}, sans-serif` }}
              >
                {font === null ? <span className="text-sm font-semibold">{t.titleFontDefault}</span> : "Aa Festa"}
              </button>
            ))}
          </div>
        </div>
      </Group>

      <Group title={t.groups.cta}>
        <Switch
          checked={design.cta !== null}
          onChange={(on) => {
            set({ cta: on ? { label: "", url: "" } : null });
          }}
          label={t.ctaToggle}
          description={t.ctaHint}
        />
        {design.cta !== null && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t.ctaLabel} hint={showIssues && issues.cta && design.cta.label.trim() === "" ? t.linkInvalid : undefined}>
              <Input
                value={design.cta.label}
                maxLength={MAX_LINK_LABEL}
                placeholder={t.ctaLabelPlaceholder}
                aria-invalid={(showIssues && issues.cta) || undefined}
                onChange={(event) => {
                  set({ cta: { label: event.target.value, url: design.cta?.url ?? "" } }, "cta-label");
                }}
              />
            </Field>
            <Field label={t.ctaUrl} hint={showIssues && issues.cta && design.cta.label.trim() !== "" ? t.linkInvalid : undefined}>
              <Input
                value={design.cta.url}
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder={t.ctaUrlPlaceholder}
                aria-invalid={(showIssues && issues.cta) || undefined}
                onChange={(event) => {
                  set({ cta: { label: design.cta?.label ?? "", url: event.target.value } }, "cta-url");
                }}
              />
            </Field>
          </div>
        )}
      </Group>

      <Group title={t.groups.sections} hint={t.sectionsHint}>
        <ol className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border">
          {design.sections.map((section, index) => {
            const name = t.sections[section.kind];
            const empty = event !== undefined && sectionEmpty(section.kind, event, design);
            return (
              <li key={section.kind} className={cn("flex items-center gap-2 py-1.5 pr-1.5 pl-3", !section.visible && "bg-surface-2/50")}>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={cn("truncate text-sm font-medium", section.visible ? "text-fg" : "text-fg-subtle line-through")}>{name}</span>
                  {section.visible && empty && <span className="truncate text-xs text-fg-subtle">{t.sectionEmpty[section.kind as Exclude<PageSection, "prices">]}</span>}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={section.visible ? t.hide(name) : t.show(name)}
                  aria-pressed={!section.visible}
                  onClick={() => {
                    set({ sections: design.sections.map((item, position) => (position === index ? { ...item, visible: !item.visible } : item)) });
                  }}
                >
                  {section.visible ? <Eye /> : <EyeOff />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t.moveUp(name)}
                  disabled={index === 0}
                  onClick={() => {
                    set({ sections: moveSection(design.sections, index, -1) });
                  }}
                >
                  <ArrowUp />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t.moveDown(name)}
                  disabled={index === design.sections.length - 1}
                  onClick={() => {
                    set({ sections: moveSection(design.sections, index, 1) });
                  }}
                >
                  <ArrowDown />
                </Button>
              </li>
            );
          })}
        </ol>
      </Group>

      <Group title={t.groups.schedule} hint={t.scheduleHint} aside={design.schedule.length > 0 ? t.count(design.schedule.length, MAX_SCHEDULE) : undefined}>
        {design.schedule.map((item, index) => {
          const invalid = showIssues && issues.schedule.has(index);
          return (
            <div key={index} className={cn("flex flex-col gap-2 rounded-xl border p-3", invalid ? "border-danger" : "border-border")}>
              <div className="flex items-start gap-2">
                <Input
                  className="w-24 shrink-0"
                  value={item.time}
                  maxLength={MAX_SCHEDULE_TIME}
                  placeholder={t.scheduleTimePlaceholder}
                  aria-label={`${t.scheduleTime} · ${t.itemLabel(index)}`}
                  onChange={(event) => {
                    set({ schedule: design.schedule.map((line, position) => (position === index ? { ...line, time: event.target.value } : line)) }, `schedule-time-${String(index)}`);
                  }}
                />
                <Input
                  value={item.title}
                  maxLength={MAX_SCHEDULE_TITLE}
                  placeholder={t.scheduleTitlePlaceholder}
                  aria-label={`${t.scheduleTitle} · ${t.itemLabel(index)}`}
                  aria-invalid={invalid || undefined}
                  onChange={(event) => {
                    set({ schedule: design.schedule.map((line, position) => (position === index ? { ...line, title: event.target.value } : line)) }, `schedule-title-${String(index)}`);
                  }}
                />
              </div>
              <div className="flex items-center gap-2">
                <Input
                  value={item.detail ?? ""}
                  maxLength={MAX_SCHEDULE_DETAIL}
                  placeholder={t.scheduleDetailPlaceholder}
                  aria-label={`${t.scheduleDetail} · ${t.itemLabel(index)}`}
                  onChange={(event) => {
                    set({ schedule: design.schedule.map((line, position) => (position === index ? { ...line, detail: event.target.value } : line)) }, `schedule-detail-${String(index)}`);
                  }}
                />
                <ItemActions
                  index={index}
                  count={design.schedule.length}
                  label={t.itemLabel(index)}
                  onMove={(delta) => {
                    set({ schedule: move(design.schedule, index, delta) });
                  }}
                  onRemove={() => {
                    set({ schedule: design.schedule.filter((_, position) => position !== index) });
                  }}
                />
              </div>
              {invalid && <p className="text-xs text-danger-fg">{t.scheduleInvalid}</p>}
            </div>
          );
        })}
        {design.schedule.length < MAX_SCHEDULE && (
          <Button
            variant="secondary"
            size="sm"
            icon={<Plus />}
            className="w-fit"
            onClick={() => {
              set({ schedule: [...design.schedule, { time: "", title: "", detail: null }] });
            }}
          >
            {t.scheduleAdd}
          </Button>
        )}
      </Group>

      <Group title={t.groups.faq} hint={t.faqHint} aside={design.faq.length > 0 ? t.count(design.faq.length, MAX_FAQ) : undefined}>
        {design.faq.map((item, index) => {
          const invalid = showIssues && issues.faq.has(index);
          return (
            <div key={index} className={cn("flex flex-col gap-2 rounded-xl border p-3", invalid ? "border-danger" : "border-border")}>
              <div className="flex items-start gap-2">
                <Input
                  value={item.question}
                  maxLength={MAX_QUESTION}
                  placeholder={t.faqQuestionPlaceholder}
                  aria-label={`${t.faqQuestion} · ${t.itemLabel(index)}`}
                  aria-invalid={(invalid && item.question.trim() === "") || undefined}
                  onChange={(event) => {
                    set({ faq: design.faq.map((line, position) => (position === index ? { ...line, question: event.target.value } : line)) }, `faq-question-${String(index)}`);
                  }}
                />
                <ItemActions
                  index={index}
                  count={design.faq.length}
                  label={t.itemLabel(index)}
                  onMove={(delta) => {
                    set({ faq: move(design.faq, index, delta) });
                  }}
                  onRemove={() => {
                    set({ faq: design.faq.filter((_, position) => position !== index) });
                  }}
                />
              </div>
              <Textarea
                rows={2}
                value={item.answer}
                maxLength={MAX_ANSWER}
                placeholder={t.faqAnswerPlaceholder}
                aria-label={`${t.faqAnswer} · ${t.itemLabel(index)}`}
                aria-invalid={(invalid && item.answer.trim() === "") || undefined}
                onChange={(event) => {
                  set({ faq: design.faq.map((line, position) => (position === index ? { ...line, answer: event.target.value } : line)) }, `faq-answer-${String(index)}`);
                }}
              />
              {invalid && <p className="text-xs text-danger-fg">{t.faqInvalid}</p>}
            </div>
          );
        })}
        {design.faq.length < MAX_FAQ && (
          <Button
            variant="secondary"
            size="sm"
            icon={<Plus />}
            className="w-fit"
            onClick={() => {
              set({ faq: [...design.faq, { question: "", answer: "" }] });
            }}
          >
            {t.faqAdd}
          </Button>
        )}
      </Group>

      <Group title={t.groups.links} hint={t.linksHint} aside={design.links.length > 0 ? t.count(design.links.length, MAX_LINKS) : undefined}>
        {design.links.map((link, index) => {
          const invalid = showIssues && issues.links.has(index);
          return (
            <div key={index} className={cn("flex flex-col gap-2 rounded-xl border p-3", invalid ? "border-danger" : "border-border")}>
              <div className="flex items-start gap-2">
                <Input
                  value={link.label}
                  maxLength={MAX_LINK_LABEL}
                  placeholder={t.linkLabelPlaceholder}
                  aria-label={`${t.linkLabel} · ${t.itemLabel(index)}`}
                  onChange={(event) => {
                    set({ links: design.links.map((line, position) => (position === index ? { ...line, label: event.target.value } : line)) }, `link-label-${String(index)}`);
                  }}
                />
                <ItemActions
                  index={index}
                  count={design.links.length}
                  label={t.itemLabel(index)}
                  onMove={(delta) => {
                    set({ links: move(design.links, index, delta) });
                  }}
                  onRemove={() => {
                    set({ links: design.links.filter((_, position) => position !== index) });
                  }}
                />
              </div>
              <Input
                value={link.url}
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder={t.linkUrlPlaceholder}
                aria-label={`${t.linkUrl} · ${t.itemLabel(index)}`}
                aria-invalid={invalid || undefined}
                onChange={(event) => {
                  set({ links: design.links.map((line, position) => (position === index ? { ...line, url: event.target.value } : line)) }, `link-url-${String(index)}`);
                }}
              />
              {invalid && <p className="text-xs text-danger-fg">{t.linkInvalid}</p>}
            </div>
          );
        })}
        {design.links.length < MAX_LINKS && (
          <Button
            variant="secondary"
            size="sm"
            icon={<Plus />}
            className="w-fit"
            onClick={() => {
              set({ links: [...design.links, { label: "", url: "" }] });
            }}
          >
            {t.linksAdd}
          </Button>
        )}
      </Group>
    </div>
  );

  const previewPane = (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 max-lg:hidden">
        <span className="text-xs text-fg-muted">{t.previewNote}</span>
        <div className="w-56 shrink-0">
          <Segmented label={t.views} options={["phone", "desktop"] as const} value={device} onChange={setDevice} names={{ phone: t.phone, desktop: t.desktop }} icons={{ phone: <Smartphone />, desktop: <Monitor /> }} />
        </div>
      </div>
      {event === undefined ? (
        preview.isError ? (
          <ErrorMessage error={preview.error} onRetry={() => void preview.refetch()} />
        ) : (
          <div role="status" className="flex h-96 items-center justify-center gap-2 rounded-2xl border border-border text-sm text-fg-muted">
            <Spinner />
            {commonTexts.loading}
          </div>
        )
      ) : (
        <div className={cn("mx-auto w-full overflow-hidden rounded-[1.75rem] border border-border shadow-lg", device === "phone" && "lg:max-w-[400px] lg:border-[6px] lg:border-fg/85")}>
          <div {...pageSurface({ design, organization: event.organization })} className={cn("bg-bg px-3 py-4 lg:h-[min(72vh,760px)] lg:overflow-y-auto", device === "desktop" && "lg:px-8 lg:py-8")}>
            <div className="mx-auto max-w-2xl">
              <EventPage event={{ ...event, design }} url={`${SITE_URL}/e/${event.slug}`} coverUrl={coverShown} preview />
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <Dialog
      open={open}
      onClose={close}
      title={t.title}
      description={t.description}
      size="xl"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" aria-label={t.undo} title={t.undo} disabled={!canUndo} onClick={undo}>
              <Undo2 />
            </Button>
            <Button variant="ghost" size="icon" aria-label={t.redo} title={t.redo} disabled={!canRedo} onClick={redo}>
              <Redo2 />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={<RotateCcw />}
              className="max-sm:hidden"
              onClick={() => {
                void confirm({ title: t.resetTitle, description: t.resetBody, confirmLabel: t.reset, danger: false }).then((ok) => {
                  if (ok) {
                    const base = defaultPageDesign();
                    change((current) => ({ cover: null, design: { ...base, schedule: current.design.schedule, faq: current.design.faq, links: current.design.links } }));
                  }
                });
              }}
            >
              {t.reset}
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={close}>
              {commonTexts.cancel}
            </Button>
            <Button onClick={submit} loading={save.isPending} disabled={!dirty}>
              {t.save}
            </Button>
          </div>
        </div>
      }
    >
      <div className="mb-4 lg:hidden">
        <Segmented label={t.title} options={["edit", "preview"] as const} value={pane} onChange={setPane} names={{ edit: t.editTab, preview: t.previewTab }} />
      </div>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,25rem)_minmax(0,1fr)]">
        <div className={cn(pane === "preview" && "max-lg:hidden")}>{editor}</div>
        <div className={cn("lg:sticky lg:top-0 lg:self-start", pane === "edit" && "max-lg:hidden")}>{previewPane}</div>
      </div>
    </Dialog>
  );
}
