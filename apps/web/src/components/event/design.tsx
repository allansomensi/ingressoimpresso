"use client";

import type { ArtDto, DesignBody, DesignResponse, EventDto, StubSide, TextBlock, TicketDesign } from "@ingressoimpresso/api-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Eye,
  Hash,
  ImageUp,
  LayoutTemplate,
  Layers,
  MousePointerClick,
  Plus,
  QrCode,
  Redo2,
  RefreshCw,
  Ruler,
  Save,
  Scissors,
  Type,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { ArtPicker } from "@/components/event/art-picker";
import { NumberInspector, QrInspector, TextInspector } from "@/components/event/design-inspectors";
import { TemplateGallery } from "@/components/event/template-gallery";
import { TicketView, elementBox, sameElement, type Box, type TicketElement } from "@/components/ticket/ticket-view";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Dialog,
  ErrorMessage,
  Field,
  Input,
  Lead,
  LoadingBlock,
  NumberInput,
  Select,
  Spinner,
  Switch,
  Textarea,
  useConfirm,
} from "@/components/ui";
import { api, fetchBlobUrl, upload } from "@/lib/api";
import { cn } from "@/lib/cn";
import { MAX_TEXT_BLOCKS, designIssues, type IssueTarget } from "@/lib/design-rules";
import { rasterizeBackground } from "@/lib/rasterize";
import type { Palette, TicketTemplate } from "@/lib/templates/catalog";
import { blockValue } from "@/lib/ticket-fields";
import { useUnsavedChanges } from "@/lib/unsaved";
import { texts } from "@/texts/pt-BR";

const t = texts.event.design;

export function DesignTab({ eventId }: { eventId: string }) {
  const current = useQuery({
    queryKey: ["design", eventId],
    queryFn: () => api<DesignResponse>(`/api/events/${eventId}/design`),
  });
  const event = useQuery({
    queryKey: ["event", eventId],
    queryFn: () => api<EventDto>(`/api/events/${eventId}`),
  });
  if (current.isPending || event.isPending) {
    return <LoadingBlock rows={4} />;
  }
  if (current.isError || event.isError) {
    return <ErrorMessage error={current.error ?? event.error} />;
  }
  // Remount the editor when another version is loaded, so its state starts from the server data.
  return <DesignEditor key={current.data.version} eventId={eventId} event={event.data} initial={current.data} />;
}

function Section({
  icon,
  title,
  description,
  actions,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader icon={icon} title={title} {...(description === undefined ? {} : { description })} {...(actions === undefined ? {} : { actions })} />
      {children}
    </Card>
  );
}

/** What the editor changes: the design and its art. Undo and redo move between drafts. */
interface Draft {
  design: TicketDesign;
  art: ArtDto | null;
}

interface History {
  past: Draft[];
  present: Draft;
  future: Draft[];
  /** Changes with the same key in quick succession (typing, dragging) are one undo step. */
  key: string | null;
  at: number;
}

const HISTORY_LIMIT = 60;
const MERGE_MS = 1500;

function useDraftHistory(initial: Draft) {
  const [history, setHistory] = useState<History>({ past: [], present: initial, future: [], key: null, at: 0 });
  const change = useCallback((next: (draft: Draft) => Draft, key: string | null = null) => {
    setHistory((state) => {
      const now = Date.now();
      const merge = key !== null && key === state.key && now - state.at < MERGE_MS;
      return {
        past: merge ? state.past : [...state.past.slice(-HISTORY_LIMIT), state.present],
        present: next(state.present),
        future: [],
        key,
        at: now,
      };
    });
  }, []);
  const undo = useCallback(() => {
    setHistory((state) => {
      const previous = state.past.at(-1);
      return previous === undefined
        ? state
        : { past: state.past.slice(0, -1), present: previous, future: [state.present, ...state.future], key: null, at: 0 };
    });
  }, []);
  const redo = useCallback(() => {
    setHistory((state) => {
      const [next, ...rest] = state.future;
      return next === undefined ? state : { past: [...state.past, state.present], present: next, future: rest, key: null, at: 0 };
    });
  }, []);
  return { draft: history.present, change, undo, redo, canUndo: history.past.length > 0, canRedo: history.future.length > 0 };
}

function withBox(design: TicketDesign, element: TicketElement, box: Box): TicketDesign {
  if (element.kind === "number") {
    return { ...design, number: { ...design.number, xMm: box.x, yMm: box.y, widthMm: box.width, heightMm: box.height } };
  }
  if (element.kind === "qr") {
    return { ...design, qr: { xMm: box.x, yMm: box.y, sizeMm: box.width } };
  }
  return {
    ...design,
    texts: design.texts.map((block, index) =>
      index === element.index ? { ...block, xMm: box.x, yMm: box.y, widthMm: box.width, heightMm: box.height } : block,
    ),
  };
}

function elementKey(element: TicketElement): string {
  return element.kind === "text" ? `text-${String(element.index)}` : element.kind;
}

function issueElement(target: IssueTarget): TicketElement | null {
  return target.kind === "number" || target.kind === "qr" || target.kind === "text" ? target : null;
}

/** Whether a keyboard shortcut should leave the event to a form field (its own undo, typing). */
function typingIn(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

function DesignEditor({ eventId, event, initial }: { eventId: string; event: EventDto; initial: DesignResponse }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const initialDraft = useMemo<Draft>(() => ({ design: initial.design, art: initial.art }), [initial]);
  const { draft, change, undo, redo, canUndo, canRedo } = useDraftHistory(initialDraft);
  const { design, art } = draft;
  const [saved, setSaved] = useState<{ version: number; draft: Draft }>({ version: initial.version, draft: initialDraft });
  const [selected, setSelected] = useState<TicketElement | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  // The stub fields as typed (spaces, an empty line being typed); the design keeps the clean list.
  const [stubText, setStubText] = useState(initial.design.stub?.fields.join("\n") ?? "");
  const dirty = draft !== saved.draft && JSON.stringify(draft) !== JSON.stringify(saved.draft);
  useUnsavedChanges(dirty);

  const issues = useMemo(() => designIssues(design), [design]);
  const problems = useMemo(
    () => issues.map((issue) => issueElement(issue.target)).filter((element): element is TicketElement => element !== null),
    [issues],
  );
  const issueMessages = [...new Set(issues.map((issue) => issue.message))];

  const artId = art?.id ?? null;
  const artUrl = useQuery({
    queryKey: ["art", eventId, artId],
    queryFn: () => (artId === null ? Promise.resolve(null) : fetchBlobUrl(`/api/events/${eventId}/art/${artId}`)),
    enabled: artId !== null,
    staleTime: Number.POSITIVE_INFINITY,
  });

  useEffect(
    () => () => {
      if (preview !== null) {
        URL.revokeObjectURL(preview);
      }
    },
    [preview],
  );

  const body = (): DesignBody => ({ design, artId });
  const update = (next: (design: TicketDesign) => TicketDesign, key: string | null = null) => {
    change((current) => ({ ...current, design: next(current.design) }), key);
  };

  /** Shows a local file at once, without downloading it back. */
  const rememberArt = (uploaded: ArtDto, file: Blob) => {
    queryClient.setQueryData(["art", eventId, uploaded.id], URL.createObjectURL(file));
  };

  const uploadArt = useMutation({
    mutationFn: async (file: File) => ({ file, uploaded: await upload<ArtDto>(`/api/events/${eventId}/art`, file) }),
    onSuccess: ({ file, uploaded }) => {
      rememberArt(uploaded, file);
      change((current) => ({ ...current, art: uploaded }));
    },
  });
  const applyTemplate = useMutation({
    mutationFn: async ({ template, palette }: { template: TicketTemplate; palette: Palette }) => {
      const built = template.build(palette);
      const file = await rasterizeBackground(built.background, built.design.widthMm, built.design.heightMm);
      const uploaded = await upload<ArtDto>(`/api/events/${eventId}/art`, file);
      return { template, design: built.design, file, uploaded };
    },
    onSuccess: ({ template, design: next, file, uploaded }) => {
      rememberArt(uploaded, file);
      change(() => ({ design: next, art: uploaded }));
      setStubText(next.stub?.fields.join("\n") ?? "");
      setSelected(null);
      setGalleryOpen(false);
      toast.success(texts.templates.applied(texts.templates.items[template.id].name));
    },
  });
  const save = useMutation({
    mutationFn: (payload: { body: DesignBody; draft: Draft }) =>
      api<DesignResponse>(`/api/events/${eventId}/design`, { method: "PUT", body: payload.body }),
    onSuccess: (response, payload) => {
      // Keep editing in place; the cache is refreshed for the next visit.
      setSaved({ version: response.version, draft: payload.draft });
      toast.success(t.savedToast(response.version));
      void queryClient.invalidateQueries({ queryKey: ["design", eventId], refetchType: "none" });
    },
  });
  const renderPreview = useMutation({
    mutationFn: (payload: DesignBody) => fetchBlobUrl(`/api/events/${eventId}/design/preview`, payload),
    onSuccess: (url) => {
      setPreview(url);
    },
  });

  const canSave = issues.length === 0 && !save.isPending;
  const doSave = () => {
    if (canSave) {
      save.mutate({ body: body(), draft });
    }
  };

  // Ctrl+Z / Ctrl+Shift+Z (Ctrl+Y) undo and redo; Ctrl+S saves. Fields keep their own undo.
  useEffect(() => {
    const keyDown = (key: KeyboardEvent) => {
      if (!(key.ctrlKey || key.metaKey)) {
        return;
      }
      const letter = key.key.toLowerCase();
      if (letter === "s") {
        key.preventDefault();
        doSave();
      } else if (!typingIn(key.target) && (letter === "z" || letter === "y")) {
        key.preventDefault();
        if (letter === "y" || key.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
    };
    window.addEventListener("keydown", keyDown);
    return () => {
      window.removeEventListener("keydown", keyDown);
    };
  });

  const addText = () => {
    const width = Math.min(80, design.widthMm - 8);
    const height = Math.min(10, design.heightMm - 4);
    const block: TextBlock = {
      text: design.texts.length === 0 ? "{evento}" : t.newText,
      xMm: Math.max(0, Math.round((design.widthMm - width) / 2)),
      yMm: Math.max(0, Math.round((design.heightMm - height) / 2)),
      widthMm: width,
      heightMm: height,
      font: "sans",
      sizePt: 16,
      color: design.number.color,
      align: "left",
      lines: 1,
      bold: true,
      uppercase: false,
      letterSpacing: 0,
    };
    update((d) => ({ ...d, texts: [...d.texts, block] }));
    setSelected({ kind: "text", index: design.texts.length });
  };

  const removeText = (index: number) => {
    update((d) => ({ ...d, texts: d.texts.filter((_, i) => i !== index) }));
    setSelected(null);
    toast(t.removedText, { action: { label: t.toolbar.undo, onClick: undo } });
  };

  const duplicateText = (index: number) => {
    const block = design.texts[index];
    if (block === undefined || design.texts.length >= MAX_TEXT_BLOCKS) {
      return;
    }
    const copy = {
      ...block,
      xMm: Math.min(block.xMm + 2, Math.max(0, design.widthMm - block.widthMm)),
      yMm: Math.min(block.yMm + 2, Math.max(0, design.heightMm - block.heightMm)),
    };
    update((d) => ({ ...d, texts: [...d.texts.slice(0, index + 1), copy, ...d.texts.slice(index + 1)] }));
    setSelected({ kind: "text", index: index + 1 });
  };

  const reorderText = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= design.texts.length) {
      return;
    }
    update((d) => {
      const next = [...d.texts];
      const a = next[index];
      const b = next[target];
      if (a === undefined || b === undefined) {
        return d;
      }
      next[index] = b;
      next[target] = a;
      return { ...d, texts: next };
    });
    setSelected({ kind: "text", index: target });
  };

  const openGallery = () => {
    applyTemplate.reset();
    setGalleryOpen(true);
  };

  const chooseTemplate = async (template: TicketTemplate, palette: Palette) => {
    const customized = saved.version > 0 || dirty;
    if (
      customized &&
      !(await confirm({ title: texts.templates.replaceTitle, description: texts.templates.replaceBody, confirmLabel: texts.templates.replaceConfirm, danger: false }))
    ) {
      return;
    }
    applyTemplate.mutate({ template, palette });
  };

  const status = dirty ? (
    <Badge tone="warning" dot>
      {t.dirty}
    </Badge>
  ) : saved.version === 0 ? (
    <Badge tone="neutral" dot>
      {t.unsaved}
    </Badge>
  ) : (
    <Badge tone="success" dot>
      {t.saved(saved.version)}
    </Badge>
  );

  const total = design.widthMm + (design.stub?.widthMm ?? 0);
  const ratio = total / Math.max(design.heightMm, 1);
  const selectedText = selected?.kind === "text" ? design.texts[selected.index] : undefined;

  const elementRows: { element: TicketElement; icon: LucideIcon; label: string; muted?: boolean }[] = [
    ...design.texts.map((block, index) => {
      const value = blockValue(block, event);
      return {
        element: { kind: "text", index } as TicketElement,
        icon: Type,
        label: value ?? block.text,
        muted: value === null,
      };
    }),
    { element: { kind: "number" }, icon: Hash, label: t.number },
    { element: { kind: "qr" }, icon: QrCode, label: t.qr },
  ];

  return (
    <div className="flex flex-col gap-6">
      <Lead>{t.intro}</Lead>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-36">
          <Card padded={false} className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2.5 sm:px-4">
              <div className="flex flex-wrap items-center gap-1.5">
                <Button variant="secondary" size="sm" icon={<LayoutTemplate />} onClick={openGallery}>
                  {t.toolbar.templates}
                </Button>
                <Button variant="secondary" size="sm" icon={<Plus />} onClick={addText} disabled={design.texts.length >= MAX_TEXT_BLOCKS}>
                  {t.toolbar.addText}
                </Button>
                <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden />
                <Button variant="ghost" size="icon" aria-label={t.toolbar.undo} title={`${t.toolbar.undo} (Ctrl+Z)`} disabled={!canUndo} onClick={undo}>
                  <Undo2 />
                </Button>
                <Button variant="ghost" size="icon" aria-label={t.toolbar.redo} title={`${t.toolbar.redo} (Ctrl+Shift+Z)`} disabled={!canRedo} onClick={redo}>
                  <Redo2 />
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {status}
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Eye />}
                  disabled={issues.length > 0}
                  onClick={() => {
                    setPreviewOpen(true);
                    renderPreview.mutate(body());
                  }}
                >
                  <span className="hidden sm:inline">{t.toolbar.printPreview}</span>
                  <span className="sm:hidden">{t.preview}</span>
                </Button>
                <Button size="sm" icon={<Save />} loading={save.isPending} disabled={!canSave} onClick={doSave}>
                  {save.isPending ? texts.common.saving : texts.common.save}
                </Button>
              </div>
            </div>
            <div className="flex items-center justify-center bg-surface-2 bg-dots px-4 py-8 sm:px-8 sm:py-12">
              <div
                aria-label={t.canvas.label}
                role="group"
                className="shadow-xl ring-1 ring-black/10"
                style={{ width: `min(100%, calc(60vh * ${String(ratio)}))` }}
              >
                <TicketView
                  design={design}
                  event={event}
                  artUrl={artUrl.data ?? null}
                  selected={selected}
                  problems={problems}
                  onSelect={setSelected}
                  onChange={(element, box) => {
                    update((d) => withBox(d, element, box), `move-${elementKey(element)}`);
                  }}
                  onRemove={(element) => {
                    if (element.kind === "text") {
                      removeText(element.index);
                    }
                  }}
                />
              </div>
            </div>
            <p className="flex items-center gap-2 border-t border-border px-4 py-2.5 text-xs text-fg-muted">
              <MousePointerClick className="size-3.5 shrink-0" aria-hidden />
              {t.canvas.hint}
            </p>
          </Card>
          {saved.version === 0 && art === null && design.texts.length === 0 && (
            <Alert
              tone="brand"
              title={t.startTitle}
              action={
                <Button size="sm" icon={<LayoutTemplate />} onClick={openGallery}>
                  {t.startAction}
                </Button>
              }
            >
              {t.startBody}
            </Alert>
          )}
          {issueMessages.length > 0 && (
            <Alert tone="warning" title={t.issuesTitle}>
              <ul className="list-disc space-y-0.5 pl-4">
                {issueMessages.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </Alert>
          )}
          <ErrorMessage error={save.error ?? applyTemplate.error ?? uploadArt.error} />
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Section
            icon={Layers}
            title={t.elements}
            description={t.elementsHint}
            actions={
              <Button variant="secondary" size="sm" icon={<Plus />} onClick={addText} disabled={design.texts.length >= MAX_TEXT_BLOCKS}>
                {t.toolbar.addText}
              </Button>
            }
          >
            {design.texts.length === 0 && <p className="mb-3 text-sm text-fg-muted">{t.noTexts}</p>}
            <ul className="flex flex-col gap-1">
              {elementRows.map(({ element, icon: Icon, label, muted }) => {
                const isSelected = sameElement(selected, element);
                const invalid = problems.some((problem) => sameElement(problem, element));
                return (
                  <li key={elementKey(element)}>
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => {
                        setSelected(isSelected ? null : element);
                      }}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition",
                        isSelected ? "bg-brand-soft text-brand-soft-fg ring-1 ring-brand/30" : "text-fg hover:bg-surface-2",
                      )}
                    >
                      <Icon className="size-4 shrink-0 opacity-70" aria-hidden />
                      <span className={cn("min-w-0 flex-1 truncate", muted === true && "text-fg-subtle italic")}>{label}</span>
                      {invalid && <span className="size-2 shrink-0 rounded-full bg-danger-solid" aria-hidden />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </Section>

          {selected !== null && elementBox(design, selected) !== null && (
            <Card className="animate-fade-in ring-1 ring-brand/30">
              <CardHeader
                icon={selected.kind === "text" ? Type : selected.kind === "number" ? Hash : QrCode}
                title={selected.kind === "text" ? t.text : selected.kind === "number" ? t.number : t.qr}
                actions={
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t.deselect}
                    title={t.deselect}
                    onClick={() => {
                      setSelected(null);
                    }}
                  >
                    <X />
                  </Button>
                }
              />
              {selected.kind === "text" && selectedText !== undefined && (
                <TextInspector
                  key={selected.index}
                  block={selectedText}
                  index={selected.index}
                  count={design.texts.length}
                  onChange={(changes, key) => {
                    update(
                      (d) => ({ ...d, texts: d.texts.map((block, index) => (index === selected.index ? { ...block, ...changes } : block)) }),
                      key,
                    );
                  }}
                  onDuplicate={() => {
                    duplicateText(selected.index);
                  }}
                  onRemove={() => {
                    removeText(selected.index);
                  }}
                  onReorder={(direction) => {
                    reorderText(selected.index, direction);
                  }}
                />
              )}
              {selected.kind === "number" && (
                <NumberInspector
                  number={design.number}
                  onChange={(changes, key) => {
                    update((d) => ({ ...d, number: { ...d.number, ...changes } }), key);
                  }}
                />
              )}
              {selected.kind === "qr" && (
                <QrInspector
                  qr={design.qr}
                  onChange={(changes, key) => {
                    update((d) => ({ ...d, qr: { ...d.qr, ...changes } }), key);
                  }}
                />
              )}
            </Card>
          )}

          <Section icon={ImageUp} title={t.art}>
            <ArtPicker
              art={art}
              design={design}
              uploading={uploadArt.isPending}
              onFile={(file) => {
                uploadArt.mutate(file);
              }}
              onRemove={() => {
                change((current) => ({ ...current, art: null }));
              }}
            />
          </Section>

          <Section icon={Ruler} title={t.size} description={t.sizeHint}>
            <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-2">
              <Field label={t.width}>
                <NumberInput value={design.widthMm} onChange={(widthMm) => { update((d) => ({ ...d, widthMm }), "width"); }} suffix={texts.common.mm} />
              </Field>
              <Field label={t.height}>
                <NumberInput value={design.heightMm} onChange={(heightMm) => { update((d) => ({ ...d, heightMm }), "height"); }} suffix={texts.common.mm} />
              </Field>
              <Field label={t.background} className="xl:col-span-2">
                <Input type="color" value={design.backgroundColor} onChange={(e) => { update((d) => ({ ...d, backgroundColor: e.target.value }), "background"); }} />
              </Field>
            </div>
          </Section>

          <Section icon={Scissors} title={t.stub} description={t.stubHint}>
            <div className="flex flex-col gap-4">
              <Switch
                label={t.hasStub}
                checked={design.stub !== null}
                onChange={(checked) => {
                  const fields = [...t.defaultStubFields];
                  setStubText(fields.join("\n"));
                  update((d) => ({ ...d, stub: checked ? { side: "left", widthMm: 40, fields } : null }));
                }}
              />
              {design.stub !== null && (
                <div className="grid gap-4 sm:grid-cols-2 animate-fade-in">
                  <Field label={t.stubSide}>
                    <Select
                      value={design.stub.side}
                      onChange={(e) => {
                        update((d) => (d.stub === null ? d : { ...d, stub: { ...d.stub, side: e.target.value as StubSide } }));
                      }}
                    >
                      {(Object.keys(t.sides) as StubSide[]).map((side) => (
                        <option key={side} value={side}>
                          {t.sides[side]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={t.stubWidth}>
                    <NumberInput
                      value={design.stub.widthMm}
                      onChange={(widthMm) => {
                        update((d) => (d.stub === null ? d : { ...d, stub: { ...d.stub, widthMm } }), "stub-width");
                      }}
                      suffix={texts.common.mm}
                    />
                  </Field>
                  <Field label={t.stubFields} hint={t.stubFieldsHint} className="sm:col-span-2">
                    <Textarea
                      rows={3}
                      value={stubText}
                      onChange={(e) => {
                        setStubText(e.target.value);
                        const fields = e.target.value
                          .split("\n")
                          .map((line) => line.trim())
                          .filter((line) => line !== "");
                        update((d) => (d.stub === null ? d : { ...d, stub: { ...d.stub, fields } }), "stub-fields");
                      }}
                    />
                  </Field>
                </div>
              )}
            </div>
          </Section>
        </div>
      </div>

      <TemplateGallery
        open={galleryOpen}
        onClose={() => {
          setGalleryOpen(false);
        }}
        event={event}
        applying={applyTemplate.isPending ? (applyTemplate.variables?.template.id ?? null) : null}
        onApply={(template, palette) => {
          void chooseTemplate(template, palette);
        }}
      />

      <Dialog
        open={previewOpen}
        onClose={() => {
          setPreviewOpen(false);
        }}
        title={t.previewTitle}
        description={t.previewDescription}
        size="lg"
        footer={
          <Button
            variant="secondary"
            icon={<RefreshCw />}
            loading={renderPreview.isPending}
            onClick={() => {
              renderPreview.mutate(body());
            }}
          >
            {t.preview}
          </Button>
        }
      >
        <div className="relative mx-auto flex aspect-[210/297] max-h-[70vh] items-center justify-center overflow-hidden rounded-xl border border-border bg-surface-2">
          {preview !== null && (
            // eslint-disable-next-line @next/next/no-img-element -- blob URL of a server-rendered preview
            <img src={preview} alt={t.previewAlt} className="size-full bg-white object-contain" />
          )}
          {renderPreview.isPending && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface/80 text-sm font-medium text-fg-muted backdrop-blur-sm">
              <Spinner className="size-6 text-brand" />
              {t.previewing}
            </div>
          )}
        </div>
        <ErrorMessage error={renderPreview.error} className="mt-4" />
      </Dialog>
    </div>
  );
}
