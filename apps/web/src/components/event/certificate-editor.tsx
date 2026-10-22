"use client";

import type {
  ArtDto,
  CertificateDesign,
  CertificateElement,
  CertificatePage,
  CertificateSettingsBody,
  CertificateSettingsDto,
  CertificatesDto,
  EventDto,
  FontChoice,
} from "@ingressoimpresso/api-types";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import {
  Award,
  Check,
  Circle,
  Eye,
  Image as ImageIcon,
  ImagePlus,
  Images,
  LayoutTemplate,
  Layers,
  Minus,
  MousePointerClick,
  Pencil,
  PenLine,
  Plus,
  QrCode,
  Redo2,
  Save,
  Settings2,
  Square,
  SquareMousePointer,
  Trash2,
  Type,
  Undo2,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type RefObject } from "react";
import { toast } from "sonner";

import { CertificateView, type PlacedElement } from "@/components/certificate/certificate-view";
import { useEventTexts } from "@/components/event/access";
import { CertificateGallery } from "@/components/event/certificate-gallery";
import { ElementInspector, ImagesPanel, PageInspector } from "@/components/event/certificate-inspectors";
import { SelectionInspector, ShortcutsHelp } from "@/components/event/design-tools";
import { useLogo } from "@/components/organization/organization";
import { Alert, Badge, Button, Card, CardHeader, ErrorMessage, Menu, MenuItem, errorMessage, useConfirm } from "@/components/ui";
import { api, fetchBlobUrl, upload } from "@/lib/api";
import {
  MAX_CERTIFICATE_IMAGES,
  MAX_PAGE_ELEMENTS,
  certificateIssues,
  elementBox,
  newElement,
  pageOf,
  pageSize,
  reorient,
  usedImages,
  withBox,
  withPage,
  withoutImage,
  type CertificateSide,
} from "@/lib/certificate-design";
import { keptSigners, type BackTemplate, type CertificatePalette, type FrontTemplate } from "@/lib/certificate-templates";
import { fillCertificateText, type CertificateFields } from "@/lib/certificates";
import { cn } from "@/lib/cn";
import {
  DRAG_THRESHOLD_PX,
  NUDGE_MM,
  alignBoxes,
  boundsOf,
  clampDelta,
  distributeBoxes,
  hitTest,
  moveBoxes,
  rectBetween,
  type AlignEdge,
  type Axis,
  type Box,
} from "@/lib/design-selection";
import { useUnsavedChanges } from "@/lib/unsaved";
import { useHistory } from "@/lib/use-history";
import { certificateEditor as texts } from "@/texts/pt-BR/certificate-editor";
import { common as commonTexts } from "@/texts/pt-BR/common";

interface Draft {
  design: CertificateDesign;
  workload: string | null;
  images: ArtDto[];
}

const KIND_ICONS: Record<CertificateElement["kind"], LucideIcon> = {
  text: Type,
  image: ImageIcon,
  signature: PenLine,
  qr: QrCode,
  line: Minus,
  shape: Square,
  seal: Award,
};

/** Whether a keyboard shortcut should leave the event to a form field (its own undo, typing). */
function typingIn(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

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

/**
 * Rubber-band selection on the area around the page (mouse only): dragging on empty space selects
 * every element the rectangle touches; a plain click there clears the selection. On touch screens
 * a tap on the page's background clears it, unless "select several" is on.
 */
function usePageMarquee({
  ref,
  pageWidth,
  boxes,
  selection,
  additive,
  onSelect,
}: {
  ref: RefObject<HTMLDivElement | null>;
  pageWidth: number;
  boxes: readonly Box[];
  selection: readonly number[];
  additive: boolean;
  onSelect: (indices: number[]) => void;
}) {
  const drag = useRef<{ pointerId: number; x: number; y: number; clientX: number; clientY: number; base: number[]; shown: boolean } | null>(null);
  const [rect, setRect] = useState<CSSProperties | null>(null);
  const measured = () => {
    const element = ref.current?.querySelector<HTMLElement>("[data-certificate-page]");
    const box = element?.getBoundingClientRect();
    return box === undefined || box.width === 0 ? null : { box, mmPerPx: pageWidth / box.width };
  };
  const onPointerDown = (pointer: PointerEvent<HTMLDivElement>) => {
    if (pointer.button !== 0) {
      return;
    }
    const modifier = pointer.shiftKey || pointer.ctrlKey || pointer.metaKey;
    if (pointer.pointerType !== "mouse") {
      const onPage = pointer.target instanceof Element && pointer.target.closest("[data-certificate-page]") !== null;
      if (onPage && !additive) {
        onSelect([]);
      }
      return;
    }
    const page = measured();
    if (page === null) {
      return;
    }
    pointer.preventDefault();
    const active = document.activeElement;
    if (active instanceof HTMLElement) {
      active.blur();
    }
    pointer.currentTarget.setPointerCapture(pointer.pointerId);
    drag.current = {
      pointerId: pointer.pointerId,
      x: (pointer.clientX - page.box.left) * page.mmPerPx,
      y: (pointer.clientY - page.box.top) * page.mmPerPx,
      clientX: pointer.clientX,
      clientY: pointer.clientY,
      base: modifier ? [...selection] : [],
      shown: false,
    };
  };
  const onPointerMove = (pointer: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    const page = measured();
    const area = ref.current?.getBoundingClientRect();
    if (current?.pointerId !== pointer.pointerId || page === null || area === undefined) {
      return;
    }
    if (!current.shown && Math.hypot(pointer.clientX - current.clientX, pointer.clientY - current.clientY) < DRAG_THRESHOLD_PX) {
      return;
    }
    current.shown = true;
    const x = (pointer.clientX - page.box.left) * page.mmPerPx;
    const y = (pointer.clientY - page.box.top) * page.mmPerPx;
    const marquee = rectBetween(current.x, current.y, x, y);
    const hits = hitTest(
      marquee,
      boxes.map((box, index) => ({ item: index, box })),
    );
    onSelect([...current.base, ...hits.filter((hit) => !current.base.includes(hit))]);
    const px = (mm: number) => mm / page.mmPerPx;
    setRect({ left: page.box.left - area.left + px(marquee.x), top: page.box.top - area.top + px(marquee.y), width: px(marquee.width), height: px(marquee.height) });
  };
  const onPointerUp = (pointer: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (current?.pointerId !== pointer.pointerId) {
      return;
    }
    drag.current = null;
    setRect(null);
    if (!current.shown) {
      onSelect(current.base);
    }
  };
  const overlay = rect === null ? null : <div aria-hidden className="pointer-events-none absolute z-40 rounded-[3px] border border-brand bg-brand/10" style={rect} />;
  return { overlay, handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp } };
}

/**
 * The certificate editor (ADR 0114): front and back drawn like the PDF, elements dragged into
 * place with guides, an inspector for each kind, templates in the organization's colours and the
 * certificate's own images (logos, scanned signatures, backgrounds).
 */
export function CertificateEditor({
  eventId,
  event,
  settings,
  wasSaved,
  editable,
  onSaved,
}: {
  eventId: string;
  event: EventDto;
  settings: CertificateSettingsDto;
  wasSaved: boolean;
  editable: boolean;
  onSaved: (data: CertificatesDto) => void;
}) {
  const sampleName = useEventTexts().certificates.sampleName;
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const initial = useMemo<Draft>(() => ({ design: settings.design, workload: settings.workload, images: settings.images }), [settings]);
  const { draft, change, undo, redo, canUndo, canRedo } = useHistory(initial);
  const { design, workload, images } = draft;
  const [savedDraft, setSavedDraft] = useState<{ draft: Draft; ever: boolean }>({ draft: initial, ever: wasSaved });
  const dirty = draft !== savedDraft.draft && JSON.stringify(draft) !== JSON.stringify(savedDraft.draft);
  useUnsavedChanges(dirty);
  const [side, setSide] = useState<CertificateSide>("front");
  const [chosen, setChosen] = useState<number[]>([]);
  const [editing, setEditing] = useState(false);
  const [additive, setAdditive] = useState(false);
  const [gallery, setGallery] = useState<CertificateSide | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const pasteboardRef = useRef<HTMLDivElement>(null);
  const setSelected = useCallback((indices: number[]) => {
    if (indices.length > 0) {
      setEditing(true);
    }
    setChosen(indices);
  }, []);
  const stopEditing = () => {
    setEditing(false);
    setChosen([]);
  };

  const page = pageOf(design, side);
  const size = pageSize(design.orientation);
  const elements = page?.elements ?? [];
  const boxes = elements.map(elementBox);
  const selection = chosen.filter((index, at) => index < elements.length && chosen.indexOf(index) === at);
  const selected = selection.length === 1 ? (selection[0] ?? null) : null;
  const selectedElement = selected === null ? undefined : elements[selected];
  const marquee = usePageMarquee({ ref: pasteboardRef, pageWidth: size.width, boxes, selection, additive, onSelect: setSelected });

  const logoUrl = useLogo(settings.organization.logoPath);
  const imageUrls = useQueries({
    queries: images.map((image) => ({
      queryKey: ["art", eventId, image.id],
      queryFn: () => fetchBlobUrl(`/api/events/${eventId}/art/${image.id}`),
      staleTime: Number.POSITIVE_INFINITY,
    })),
  }).map((query) => query.data ?? null);
  const days = event.days.length > 0 ? event.days.map((day) => day.startsAt) : [event.startsAt];
  const fields: CertificateFields = {
    name: sampleName,
    event: event.name,
    days,
    venue: event.venue,
    organization: settings.organization.name,
    workload,
    code: "CERT-0001",
  };
  const issues = useMemo(() => certificateIssues(design, images.length), [design, images.length]);
  const problems = issues.flatMap((issue) => (issue.side === side && issue.index !== null ? [issue.index] : []));
  const issueMessages = [...new Set(issues.map((issue) => issue.message))];
  const used = usedImages(design);

  const updateDesign = (next: (current: CertificateDesign) => CertificateDesign, key: string | null = null) => {
    change((current) => ({ ...current, design: next(current.design) }), key);
  };
  const updatePage = (next: (current: CertificatePage) => CertificatePage, key: string | null = null) => {
    updateDesign((current) => {
      const target = pageOf(current, side);
      return target === null ? current : withPage(current, side, next(target));
    }, key);
  };
  const placeAll = (changes: readonly PlacedElement[], key: string | null = null) => {
    if (changes.length === 0) {
      return;
    }
    updatePage(
      (current) => ({
        ...current,
        elements: current.elements.map((element, index) => {
          const placed = changes.find((item) => item.index === index);
          return placed === undefined ? element : withBox(element, placed.box);
        }),
      }),
      key,
    );
  };
  const patchElement = (index: number, patch: Partial<Record<string, unknown>>, key: string) => {
    updatePage(
      (current) => ({ ...current, elements: current.elements.map((element, at) => (at === index ? ({ ...element, ...patch } as CertificateElement) : element)) }),
      key,
    );
  };

  const accent = page?.frame?.color ?? "#1f3a5f";
  const firstText = elements.find((element): element is Extract<CertificateElement, { kind: "text" }> => element.kind === "text");
  const bodyFont: FontChoice = firstText?.font ?? "classic";

  const addElement = (kind: CertificateElement["kind"], options: { image?: number; text?: string } = {}) => {
    if (page === null || elements.length >= MAX_PAGE_ELEMENTS) {
      return;
    }
    const base = newElement(kind, size, { color: accent, font: bodyFont, ...(options.image === undefined ? {} : { image: options.image }) });
    const element: CertificateElement = base.kind === "text" && options.text !== undefined ? { ...base, text: options.text } : base;
    updatePage((current) => ({ ...current, elements: [...current.elements, element] }));
    setSelected([elements.length]);
  };

  /** Shows a local file at once, without downloading it back. */
  const rememberImage = (uploaded: ArtDto, file: Blob) => {
    queryClient.setQueryData(["art", eventId, uploaded.id], URL.createObjectURL(file));
  };
  const uploadImage = useMutation({
    mutationFn: async ({ file }: { file: File; then?: (index: number) => void }) => ({ file, uploaded: await upload<ArtDto>(`/api/events/${eventId}/art`, file) }),
    onSuccess: ({ file, uploaded }, { then }) => {
      rememberImage(uploaded, file);
      const index = images.length;
      change((current) => ({ ...current, images: [...current.images, uploaded] }));
      then?.(index);
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
  const onUpload = (file: File, then?: (index: number) => void) => {
    if (images.length >= MAX_CERTIFICATE_IMAGES) {
      toast.error(texts.images.full);
      return;
    }
    uploadImage.mutate(then === undefined ? { file } : { file, then });
  };
  const removeImage = async (index: number) => {
    if (!(await confirm({ title: texts.images.removeTitle, description: texts.images.removeBody, confirmLabel: texts.images.remove }))) {
      return;
    }
    change((current) => ({ ...current, images: current.images.filter((_, at) => at !== index), design: withoutImage(current.design, index) }));
    setSelected([]);
  };

  const body = (): CertificateSettingsBody => ({ design, workload, imageIds: images.map((image) => image.id) });
  const saveMutation = useMutation({
    mutationFn: (payload: { body: CertificateSettingsBody; draft: Draft }) =>
      api<CertificatesDto>(`/api/events/${eventId}/certificates/settings`, { method: "PUT", body: payload.body }),
    onSuccess: (data, payload) => {
      setSavedDraft({ draft: payload.draft, ever: true });
      toast.success(texts.saved);
      onSaved(data);
    },
  });
  const sample = useMutation({
    mutationFn: () => fetchBlobUrl(`/api/events/${eventId}/certificates/sample`, body()),
    onSuccess: (url) => {
      save(url, texts.sampleFile);
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
  const canSave = editable && issues.length === 0 && !saveMutation.isPending;
  const doSave = () => {
    if (canSave) {
      saveMutation.mutate({ body: body(), draft });
    }
  };

  const removeSelection = () => {
    if (selection.length === 0) {
      return;
    }
    const gone = new Set(selection);
    updatePage((current) => ({ ...current, elements: current.elements.filter((_, index) => !gone.has(index)) }));
    setSelected([]);
    toast(texts.selection.removed(gone.size), { action: { label: texts.toolbar.undo, onClick: undo } });
  };
  const duplicateSelection = () => {
    const copies = selection.flatMap((index) => elements[index] ?? []);
    if (copies.length === 0 || elements.length + copies.length > MAX_PAGE_ELEMENTS) {
      return;
    }
    const moved = copies.map((element) => {
      const box = elementBox(element);
      return withBox(element, { ...box, x: Math.min(box.x + 3, Math.max(0, size.width - box.width)), y: Math.min(box.y + 3, Math.max(0, size.height - box.height)) });
    });
    updatePage((current) => ({ ...current, elements: [...current.elements, ...moved] }));
    setSelected(moved.map((_, offset) => elements.length + offset));
  };
  const reorder = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= elements.length) {
      return;
    }
    updatePage((current) => {
      const next = [...current.elements];
      const a = next[index];
      const b = next[target];
      if (a === undefined || b === undefined) {
        return current;
      }
      next[index] = b;
      next[target] = a;
      return { ...current, elements: next };
    });
    setSelected([target]);
  };
  const alignSelection = (edge: AlignEdge) => {
    const items = selection.flatMap((index) => (boxes[index] === undefined ? [] : [{ index, box: boxes[index] }]));
    const frame: Box | null = items.length > 1 ? boundsOf(items.map((item) => item.box)) : { x: 0, y: 0, width: size.width, height: size.height };
    if (frame === null) {
      return;
    }
    const placed = alignBoxes(
      items.map((item) => item.box),
      edge,
      frame,
    );
    placeAll(items.map((item, at) => ({ index: item.index, box: placed[at] ?? item.box })));
  };
  const distributeSelection = (axis: Axis) => {
    const items = selection.flatMap((index) => (boxes[index] === undefined ? [] : [{ index, box: boxes[index] }]));
    const placed = distributeBoxes(
      items.map((item) => item.box),
      axis,
    );
    placeAll(items.map((item, at) => ({ index: item.index, box: placed[at] ?? item.box })));
  };
  const nudge = (dx: number, dy: number) => {
    const items = selection.flatMap((index) => (boxes[index] === undefined ? [] : [{ index, box: boxes[index] }]));
    const delta = clampDelta(
      items.map((item) => item.box),
      dx,
      dy,
      size,
    );
    if (delta.dx === 0 && delta.dy === 0) {
      return;
    }
    const moved = moveBoxes(
      items.map((item) => item.box),
      delta.dx,
      delta.dy,
    );
    placeAll(
      items.map((item, at) => ({ index: item.index, box: moved[at] ?? item.box })),
      `nudge-${side}-${selection.join(",")}`,
    );
  };

  // The same shortcuts as the ticket editor (ADR 0094), on the side being edited.
  useEffect(() => {
    if (!editable) {
      return;
    }
    const keyDown = (key: KeyboardEvent) => {
      const mod = key.ctrlKey || key.metaKey;
      const letter = key.key.toLowerCase();
      if (mod && letter === "s") {
        key.preventDefault();
        doSave();
        return;
      }
      if (key.defaultPrevented || typingIn(key.target)) {
        return;
      }
      if (mod && (letter === "z" || letter === "y")) {
        key.preventDefault();
        if (letter === "y" || key.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }
      const target = key.target;
      const inEditor = target === document.body || (target instanceof Node && editorRef.current?.contains(target) === true);
      if (!inEditor) {
        return;
      }
      if (mod && letter === "a") {
        if (editing) {
          key.preventDefault();
          setSelected(elements.map((_, index) => index));
        }
        return;
      }
      if (selection.length === 0) {
        return;
      }
      const arrows: Partial<Record<string, [number, number]>> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      const arrow = arrows[key.key];
      if (arrow !== undefined && !mod) {
        key.preventDefault();
        const step = key.shiftKey ? NUDGE_MM.large : key.altKey ? NUDGE_MM.fine : NUDGE_MM.normal;
        nudge(arrow[0] * step, arrow[1] * step);
      } else if (mod && letter === "d") {
        key.preventDefault();
        duplicateSelection();
      } else if (!mod && (key.key === "Delete" || key.key === "Backspace")) {
        key.preventDefault();
        removeSelection();
      } else if (key.key === "Escape") {
        key.preventDefault();
        setSelected([]);
      }
    };
    window.addEventListener("keydown", keyDown);
    return () => {
      window.removeEventListener("keydown", keyDown);
    };
  });

  const switchSide = (next: CertificateSide) => {
    setSide(next);
    setChosen([]);
  };
  const addBack = () => {
    updateDesign((current) => ({
      ...current,
      back: { backgroundColor: current.front.backgroundColor, backgroundImage: null, frame: current.front.frame ?? null, elements: [] },
    }));
    switchSide("back");
    toast(texts.backAdded);
  };
  const removeBack = async () => {
    if (!(await confirm({ title: texts.removeBackTitle, description: texts.removeBackBody, confirmLabel: texts.removeBack }))) {
      return;
    }
    updateDesign((current) => ({ ...current, back: null }));
    switchSide("front");
  };
  const replacing = async () =>
    !(savedDraft.ever || dirty) ||
    (await confirm({ title: texts.templates.replaceTitle, description: texts.templates.replaceBody, confirmLabel: texts.templates.replaceConfirm, danger: false }));
  const applyFront = async (template: FrontTemplate, palette: CertificatePalette) => {
    if (!(await replacing())) {
      return;
    }
    updateDesign((current) => {
      const turned = reorient(current, template.orientation);
      return { ...turned, front: template.build({ title: current.title, palette, signers: keptSigners(current.front.elements) }) };
    });
    switchSide("front");
    setGallery(null);
    toast.success(texts.templates.applied(template.name));
  };
  const applyBack = async (template: BackTemplate, palette: CertificatePalette) => {
    if (design.back != null && !(await replacing())) {
      return;
    }
    updateDesign((current) => ({ ...current, back: template.build({ title: current.title, palette, signers: keptSigners(current.front.elements) }, current.orientation) }));
    switchSide("back");
    setGallery(null);
    toast.success(texts.templates.applied(template.name));
  };

  const elementLabel = (element: CertificateElement): string => {
    switch (element.kind) {
      case "text":
        return fillCertificateText(element.text, fields) || element.text || texts.kinds.text;
      case "image":
        return element.source.from === "organization" ? texts.logoElement : texts.imageElement(element.source.index);
      case "signature":
        return texts.signatureElement(element.name);
      default:
        return texts.kinds[element.kind];
    }
  };

  const status = dirty ? (
    <Badge tone="warning" dot>
      {texts.status.dirty}
    </Badge>
  ) : savedDraft.ever ? (
    <Badge tone="success" dot>
      {texts.status.saved}
    </Badge>
  ) : (
    <Badge tone="neutral" dot>
      {texts.status.unsaved}
    </Badge>
  );
  const ratio = size.width / size.height;
  const addMenu = (
    <Menu
      label={texts.toolbar.add}
      disabled={page === null || elements.length >= MAX_PAGE_ELEMENTS}
      trigger={
        <span className="flex items-center gap-1.5">
          <Plus className="size-4" aria-hidden />
          <span className="max-sm:sr-only">{texts.toolbar.add}</span>
        </span>
      }
      triggerClassName="inline-flex h-9 items-center rounded-xl border border-border-strong bg-surface px-3 text-sm font-medium text-fg transition hover:bg-surface-2 active:bg-surface-3 disabled:opacity-50 pointer-coarse:h-11"
    >
      <MenuItem icon={<Type />} onSelect={() => { addElement("text"); }}>
        {texts.add.text}
      </MenuItem>
      <MenuItem icon={<UserRound />} onSelect={() => { addElement("text", { text: "{nome}" }); }}>
        {texts.add.name}
      </MenuItem>
      <MenuItem icon={<ImageIcon />} onSelect={() => { addElement("image"); }}>
        {texts.add.logo}
      </MenuItem>
      <MenuItem
        icon={<ImagePlus />}
        onSelect={() => {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = "image/png,image/jpeg";
          input.onchange = () => {
            const file = input.files?.[0];
            if (file !== undefined) {
              onUpload(file, (index) => {
                addElement("image", { image: index });
              });
            }
          };
          input.click();
        }}
      >
        {texts.add.image}
      </MenuItem>
      <MenuItem icon={<PenLine />} onSelect={() => { addElement("signature"); }}>
        {texts.add.signature}
      </MenuItem>
      <MenuItem icon={<QrCode />} onSelect={() => { addElement("qr"); }}>
        {texts.add.qr}
      </MenuItem>
      <MenuItem icon={<Minus />} onSelect={() => { addElement("line"); }}>
        {texts.add.line}
      </MenuItem>
      <MenuItem icon={<Square />} onSelect={() => { addElement("shape"); }}>
        {texts.add.shape}
      </MenuItem>
      <MenuItem icon={<Award />} onSelect={() => { addElement("seal"); }}>
        {texts.add.seal}
      </MenuItem>
    </Menu>
  );

  return (
    // An A4 page needs room: the inspector goes beside it only on very wide screens.
    <div ref={editorRef} className="grid items-start gap-6 2xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-4 2xl:sticky 2xl:top-24">
        <Card padded={false} className="overflow-hidden">
          <div className="flex flex-col gap-2 border-b border-border px-3 py-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-4">
            <div className="flex flex-wrap items-center gap-1.5">
              {editable &&
                (editing ? (
                  <Button variant="secondary" size="sm" icon={<Check />} onClick={stopEditing}>
                    {texts.toolbar.done}
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<Pencil />}
                    className="border-brand/40 bg-brand-soft text-brand-soft-fg hover:bg-brand-soft/80 active:bg-brand-soft/70"
                    onClick={() => {
                      setEditing(true);
                    }}
                  >
                    {texts.toolbar.edit}
                  </Button>
                ))}
              {editable && (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<LayoutTemplate />}
                  aria-label={texts.toolbar.templates}
                  onClick={() => {
                    setGallery(side);
                  }}
                >
                  <span className="max-sm:sr-only">{texts.toolbar.templates}</span>
                </Button>
              )}
              {editable && addMenu}
              {editable && (
                <>
                  <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden />
                  <Button variant="ghost" size="icon-sm" aria-label={texts.toolbar.undo} title={`${texts.toolbar.undo} (Ctrl+Z)`} disabled={!canUndo} onClick={undo}>
                    <Undo2 />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={texts.toolbar.redo} title={`${texts.toolbar.redo} (Ctrl+Shift+Z)`} disabled={!canRedo} onClick={redo}>
                    <Redo2 />
                  </Button>
                  <span className={cn("hidden", editing && "pointer-coarse:contents")}>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={texts.toolbar.multiTouch}
                      title={texts.toolbar.multiTouchHint}
                      aria-pressed={additive}
                      className={cn(additive && "bg-brand-soft text-brand-soft-fg ring-1 ring-brand/30 hover:bg-brand-soft active:bg-brand-soft")}
                      onClick={() => {
                        setAdditive(!additive);
                      }}
                    >
                      <SquareMousePointer />
                    </Button>
                  </span>
                  <ShortcutsHelp shortcuts={texts.shortcuts} />
                </>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 max-sm:justify-between">
              {editable && status}
              <div className="flex items-center gap-2 max-sm:ml-auto">
                <Button variant="secondary" size="sm" icon={<Eye />} loading={sample.isPending} disabled={issues.length > 0} onClick={() => sample.mutate()}>
                  <span className="hidden sm:inline">{texts.toolbar.sample}</span>
                  <span className="sm:hidden">{texts.toolbar.sampleShort}</span>
                </Button>
                {editable && (
                  <Button size="sm" icon={<Save />} loading={saveMutation.isPending} disabled={!canSave || !dirty} onClick={doSave}>
                    {saveMutation.isPending ? commonTexts.saving : commonTexts.save}
                  </Button>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 sm:px-4">
            <div role="tablist" aria-label={texts.model} className="flex items-center gap-0.5 rounded-xl border border-border bg-surface-2 p-0.5">
              {(["front", "back"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  role="tab"
                  aria-selected={side === option}
                  onClick={() => {
                    switchSide(option);
                  }}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-sm font-medium transition pointer-coarse:py-2.5",
                    side === option ? "bg-surface text-fg shadow-sm ring-1 ring-border" : "text-fg-muted hover:text-fg active:text-fg",
                    option === "back" && design.back == null && "text-fg-subtle",
                  )}
                >
                  {texts.sides[option]}
                </button>
              ))}
            </div>
            {editable && side === "back" && design.back != null && (
              <Button variant="danger-ghost" size="sm" icon={<Trash2 />} onClick={() => void removeBack()}>
                <span className="max-sm:sr-only">{texts.removeBack}</span>
              </Button>
            )}
          </div>
          <div
            ref={pasteboardRef}
            {...(editing && page !== null ? marquee.handlers : {})}
            className={cn("relative flex items-center justify-center bg-surface-2 bg-dots px-4 py-8 sm:px-8 sm:py-10", editing && "ring-2 ring-brand/40 ring-inset")}
          >
            {editing && marquee.overlay}
            {page === null ? (
              <div className="flex max-w-md flex-col items-center gap-3 py-10 text-center">
                <p className="text-sm text-fg-muted">{texts.noBack}</p>
                {editable && (
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button size="sm" icon={<Plus />} onClick={addBack}>
                      {texts.addBack}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<LayoutTemplate />}
                      onClick={() => {
                        setGallery("back");
                      }}
                    >
                      {texts.toolbar.templates}
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div aria-label={texts.canvas.label} role="group" className="shadow-xl ring-1 ring-black/10" style={{ width: `min(100%, calc(62vh * ${String(ratio)}))` }}>
                <CertificateView
                  page={page}
                  orientation={design.orientation}
                  fields={fields}
                  imageUrls={imageUrls}
                  logoUrl={logoUrl}
                  brand={side === "front" && design.brand ? design.brandStyle : null}
                  selected={editing ? selection : []}
                  problems={problems}
                  additive={additive}
                  {...(editable && editing ? { onSelect: setSelected, onChange: placeAll } : {})}
                />
              </div>
            )}
          </div>
          {editable && page !== null && (
            <p className="flex items-center gap-2 border-t border-border px-4 py-2.5 text-xs text-fg-muted">
              {editing ? (
                <>
                  <MousePointerClick className="size-3.5 shrink-0" aria-hidden />
                  <span className="pointer-coarse:hidden">{texts.canvas.hint}</span>
                  <span className="hidden pointer-coarse:inline">{additive ? texts.toolbar.multiTouchHint : texts.canvas.hintTouch}</span>
                </>
              ) : (
                <>
                  <Pencil className="size-3.5 shrink-0" aria-hidden />
                  <span>{texts.canvas.locked}</span>
                </>
              )}
            </p>
          )}
        </Card>
        {editable && issueMessages.length > 0 && (
          <Alert tone="warning" title={texts.issuesTitle}>
            <ul className="list-disc space-y-0.5 pl-4">
              {issueMessages.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </Alert>
        )}
        <ErrorMessage error={saveMutation.error} />
      </div>

      {editable && (
        <div className="grid min-w-0 items-start gap-4 lg:grid-cols-2 2xl:grid-cols-1">
          {selection.length > 1 && (
            <Card className="animate-fade-in ring-1 ring-brand/30 lg:col-span-2 2xl:col-span-1">
              <SelectionInspector
                labels={selection.map((index) => (elements[index] === undefined ? "" : elementLabel(elements[index])))}
                textCount={selection.length}
                onAlign={alignSelection}
                onDistribute={distributeSelection}
                onDuplicate={duplicateSelection}
                onRemove={removeSelection}
                onClear={() => {
                  setSelected([]);
                }}
              />
            </Card>
          )}
          {selected !== null && selectedElement !== undefined && (
            <Card className="animate-fade-in ring-1 ring-brand/30 lg:col-span-2 2xl:col-span-1">
              <CardHeader
                icon={KIND_ICONS[selectedElement.kind]}
                title={texts.kinds[selectedElement.kind]}
                actions={
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={texts.inspector.deselect}
                    title={texts.inspector.deselect}
                    onClick={() => {
                      setSelected([]);
                    }}
                  >
                    <X />
                  </Button>
                }
              />
              <ElementInspector
                key={`${side}-${String(selected)}`}
                element={selectedElement}
                index={selected}
                count={elements.length}
                images={images}
                hasLogo={settings.organization.logoPath !== null}
                uploading={uploadImage.isPending}
                onChange={(patch, key) => {
                  patchElement(selected, patch, `${side}-${String(selected)}-${key}`);
                }}
                onUpload={onUpload}
                onDuplicate={duplicateSelection}
                onRemove={removeSelection}
                onReorder={(direction) => {
                  reorder(selected, direction);
                }}
              />
            </Card>
          )}
          {page !== null && (
            <Card>
              <CardHeader icon={Settings2} title={texts.page.title} description={texts.page.hint} />
              <PageInspector
                design={design}
                page={page}
                side={side}
                workload={workload}
                images={images}
                uploading={uploadImage.isPending}
                onDesign={(patch, key) => {
                  updateDesign((current) => ({ ...current, ...patch }), key);
                }}
                onPage={(patch, key) => {
                  updatePage((current) => ({ ...current, ...patch }), key);
                }}
                onWorkload={(value) => {
                  change((current) => ({ ...current, workload: value }), "workload");
                }}
                onOrientation={(orientation) => {
                  if (orientation !== design.orientation) {
                    updateDesign((current) => reorient(current, orientation));
                    toast(texts.page.orientationChanged);
                  }
                }}
                onUpload={onUpload}
              />
            </Card>
          )}
          {page !== null && (
            <Card>
              <CardHeader icon={Layers} title={texts.layers.title} description={texts.layers.hint} />
              {elements.length === 0 ? (
                <p className="text-sm text-fg-muted">{texts.layers.empty}</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {elements
                    .map((element, index) => ({ element, index }))
                    .reverse()
                    .map(({ element, index }) => {
                      const Icon = element.kind === "seal" ? Circle : KIND_ICONS[element.kind];
                      const isSelected = selection.includes(index);
                      const invalid = problems.includes(index);
                      return (
                        <li key={index}>
                          <button
                            type="button"
                            aria-pressed={isSelected}
                            onClick={(click) => {
                              if (additive || click.shiftKey || click.ctrlKey || click.metaKey) {
                                setSelected(isSelected ? selection.filter((item) => item !== index) : [...selection, index]);
                              } else {
                                setSelected(isSelected && selection.length === 1 ? [] : [index]);
                              }
                            }}
                            className={cn(
                              "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition pointer-coarse:py-3",
                              isSelected ? "bg-brand-soft text-brand-soft-fg ring-1 ring-brand/30" : "text-fg hover:bg-surface-2 active:bg-surface-2",
                            )}
                          >
                            <Icon className="size-4 shrink-0 opacity-70" aria-hidden />
                            <span className="min-w-0 flex-1 truncate">{elementLabel(element)}</span>
                            {invalid && <span className="size-2 shrink-0 rounded-full bg-danger-solid" aria-hidden />}
                          </button>
                        </li>
                      );
                    })}
                </ul>
              )}
            </Card>
          )}
          <Card>
            <CardHeader icon={Images} title={texts.images.title} description={texts.images.hint} />
            <ImagesPanel
              images={images}
              imageUrls={imageUrls}
              used={used}
              uploading={uploadImage.isPending}
              onUpload={(file) => {
                onUpload(file);
              }}
              onRemove={(index) => void removeImage(index)}
            />
          </Card>
        </div>
      )}
      {gallery !== null && (
        <CertificateGallery
          open
          side={gallery}
          orientation={design.orientation}
          input={{ title: design.title, signers: keptSigners(design.front.elements) }}
          fields={fields}
          imageUrls={imageUrls}
          logoUrl={logoUrl}
          onClose={() => {
            setGallery(null);
          }}
          onFront={(template, palette) => void applyFront(template, palette)}
          onBack={(template, palette) => void applyBack(template, palette)}
        />
      )}
    </div>
  );
}
