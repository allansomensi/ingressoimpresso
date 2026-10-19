"use client";

import type {
  ArtDto,
  BandEdge,
  CategoryDto,
  DesignBody,
  DesignResponse,
  EventDto,
  SponsorStrip,
  StubSide,
  TableDto,
  TextBlock,
  TicketDesign,
} from "@ingressoimpresso/api-types";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  Eye,
  Handshake,
  Hash,
  ImagePlus,
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
  SquareMousePointer,
  Scissors,
  Tags,
  Trash2,
  Type,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { ReadOnlyNotice, useEventKind, useEventTexts } from "@/components/event/access";
import { ArtPicker } from "@/components/event/art-picker";
import { NumberInspector, QrInspector, TextInspector } from "@/components/event/design-inspectors";
import { AlignBar, SelectionInspector, ShortcutsHelp, useMarquee } from "@/components/event/design-tools";
import { TabHeader } from "@/components/event/tab-header";
import { TemplateGallery } from "@/components/event/template-gallery";
import { TicketView, type ElementChange } from "@/components/ticket/ticket-view";
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
  LoadingBlock,
  NumberInput,
  Select,
  Spinner,
  Switch,
  Textarea,
  errorMessage,
  useConfirm,
} from "@/components/ui";
import { api, fetchBlobUrl, upload } from "@/lib/api";
import { cn } from "@/lib/cn";
import { bandText, seatLabel } from "@/lib/categories";
import {
  AUTO_BAND_MM,
  MAX_SPONSORS,
  MAX_TEXT_BLOCKS,
  SEAT_BAND_COLOR,
  defaultSponsorStrip,
  designIssues,
  effectiveBand,
  type IssueTarget,
} from "@/lib/design-rules";
import {
  NUDGE_MM,
  alignBoxes,
  boundsOf,
  clampDelta,
  designElements,
  distributeBoxes,
  elementBox,
  elementKey,
  existingSelection,
  moveBoxes,
  sameElement,
  toggleElement,
  withBox,
  type AlignEdge,
  type Axis,
  type Box,
  type TicketElement,
} from "@/lib/design-selection";
import { rasterizeBackground } from "@/lib/rasterize";
import type { Palette, TicketTemplate } from "@/lib/templates/catalog";
import { canDo } from "@/lib/team";
import { blockValue } from "@/lib/ticket-fields";
import { useUnsavedChanges } from "@/lib/unsaved";
import { common as commonTexts } from "@/texts/pt-BR/common";
import { ticketCanvas as ticketCanvasTexts } from "@/texts/pt-BR/ticket-canvas";
import { event as eventTexts } from "@/texts/pt-BR/event";
import { templates as templatesTexts } from "@/texts/pt-BR/templates";


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
  if (!canDo(event.data, "art")) {
    return <DesignReadOnly eventId={eventId} event={event.data} current={current.data} />;
  }
  // Remount the editor when another version is loaded, so its state starts from the server data.
  return <DesignEditor key={current.data.version} eventId={eventId} event={event.data} initial={current.data} />;
}

/** A band to preview: the event's first category and table (ADR 0056, 0057), if it has any. */
function useSampleTag(eventId: string): { text: string; color: string; category: string | null; priceCents: number | null } | null {
  const categories = useQuery({ queryKey: ["categories", eventId], queryFn: () => api<CategoryDto[]>(`/api/events/${eventId}/categories`) });
  const tables = useQuery({ queryKey: ["tables", eventId], queryFn: () => api<TableDto[]>(`/api/events/${eventId}/tables`) });
  const category = categories.data?.[0] ?? null;
  const table = tables.data?.[0] ?? null;
  const text = bandText(category?.name ?? null, table === null ? null : seatLabel(table.name, 1));
  return text === null
    ? null
    : { text, color: category?.color ?? SEAT_BAND_COLOR, category: category?.name ?? null, priceCents: category?.priceCents ?? null };
}

/** The ticket as saved, for team members who do not take care of the art (ADR 0055). */
function DesignReadOnly({ eventId, event, current }: { eventId: string; event: EventDto; current: DesignResponse }) {
  const t = useEventTexts().design;
  const { design, art } = current;
  const artId = art?.id ?? null;
  const artUrl = useQuery({
    queryKey: ["art", eventId, artId],
    queryFn: () => (artId === null ? Promise.resolve(null) : fetchBlobUrl(`/api/events/${eventId}/art/${artId}`)),
    enabled: artId !== null,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const ratio = (design.widthMm + (design.stub?.widthMm ?? 0)) / Math.max(design.heightMm, 1);
  const tag = useSampleTag(eventId);
  const sponsorUrls = useQueries({
    queries: current.sponsors.map((logo) => ({
      queryKey: ["art", eventId, logo.id],
      queryFn: () => fetchBlobUrl(`/api/events/${eventId}/art/${logo.id}`),
      staleTime: Number.POSITIVE_INFINITY,
    })),
  })
    .map((query) => query.data)
    .filter((url): url is string => url !== undefined);
  return (
    <div className="flex flex-col gap-6">
      <ReadOnlyNotice eventId={eventId} area="art" />
      <Card padded={false} className="overflow-hidden">
        <div className="flex items-center justify-center bg-surface-2 bg-dots px-4 py-8 sm:px-8 sm:py-12">
          <div
            aria-label={t.canvas.label}
            role="img"
            className="shadow-xl ring-1 ring-black/10"
            style={{ width: `min(100%, calc(60vh * ${String(ratio)}))` }}
          >
            <TicketView design={design} event={event} artUrl={artUrl.data ?? null} tag={tag} sponsorUrls={sponsorUrls} />
          </div>
        </div>
      </Card>
    </div>
  );
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
  /** Sponsors' logos, in order (ADR 0059). */
  sponsors: ArtDto[];
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
      // A drag (`drag-…`, one key per gesture) is one step however long it takes.
      const merge = key !== null && key === state.key && (key.startsWith("drag-") || now - state.at < MERGE_MS);
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

function issueElement(target: IssueTarget): TicketElement | null {
  return target.kind === "number" || target.kind === "qr" || target.kind === "sponsors" || target.kind === "text" ? target : null;
}

/** Whether a keyboard shortcut should leave the event to a form field (its own undo, typing). */
function typingIn(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

/** Wide screens (xl) show the inspector beside the ticket; narrower ones stack them. */
const SIDE_BY_SIDE = "(min-width: 1280px)";

/**
 * When the columns are stacked (phones, tablets), brings the inspector of the element just picked
 * into view. A press on the ticket waits for the finger to lift, and a drag (the design changed
 * meanwhile) is left alone: the person is moving the element, not about to edit it.
 */
function useRevealInspector(selectedKey: string | null, design: TicketDesign) {
  const inspectorRef = useRef<HTMLDivElement>(null);
  const latest = useRef(design);
  const pressing = useRef(false);
  useEffect(() => {
    latest.current = design;
  });
  useEffect(() => {
    const down = () => {
      pressing.current = true;
    };
    const up = () => {
      pressing.current = false;
    };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
    };
  }, []);
  useEffect(() => {
    if (selectedKey === null || window.matchMedia(SIDE_BY_SIDE).matches) {
      return;
    }
    const before = latest.current;
    const reveal = () => {
      if (latest.current === before) {
        inspectorRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    };
    if (!pressing.current) {
      reveal();
      return;
    }
    window.addEventListener("pointerup", reveal, { once: true });
    return () => {
      window.removeEventListener("pointerup", reveal);
    };
  }, [selectedKey]);
  return inspectorRef;
}

function DesignEditor({ eventId, event, initial }: { eventId: string; event: EventDto; initial: DesignResponse }) {
  const t = useEventTexts().design;
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const initialDraft = useMemo<Draft>(() => ({ design: initial.design, art: initial.art, sponsors: initial.sponsors }), [initial]);
  const { draft, change, undo, redo, canUndo, canRedo } = useDraftHistory(initialDraft);
  const { design, art, sponsors } = draft;
  const sponsorUrls = useQueries({
    queries: sponsors.map((logo) => ({
      queryKey: ["art", eventId, logo.id],
      queryFn: () => fetchBlobUrl(`/api/events/${eventId}/art/${logo.id}`),
      staleTime: Number.POSITIVE_INFINITY,
    })),
  })
    .map((query) => query.data)
    .filter((url): url is string => url !== undefined);
  const [saved, setSaved] = useState<{ version: number; draft: Draft }>({ version: initial.version, draft: initialDraft });
  const [chosen, setSelected] = useState<TicketElement[]>([]);
  // What is selected and still exists (an undo can take a text away).
  const selection = useMemo(() => existingSelection(design, chosen), [design, chosen]);
  const selected = selection.length === 1 ? (selection[0] ?? null) : null;
  // Touch screens: taps add to the selection instead of replacing it ("Selecionar vários").
  const [additive, setAdditive] = useState(false);
  const inspectorRef = useRevealInspector(selection.length === 0 ? null : selected === null ? "group" : elementKey(selected), design);
  const editorRef = useRef<HTMLDivElement>(null);
  const pasteboardRef = useRef<HTMLDivElement>(null);
  const marquee = useMarquee({ ref: pasteboardRef, design, selection, additive, onSelect: setSelected });
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  // The stub fields as typed (spaces, an empty line being typed); the design keeps the clean list.
  const [stubText, setStubText] = useState(initial.design.stub?.fields.join("\n") ?? "");
  const dirty = draft !== saved.draft && JSON.stringify(draft) !== JSON.stringify(saved.draft);
  useUnsavedChanges(dirty);

  const tag = useSampleTag(eventId);
  const kind = useEventKind();
  const issues = useMemo(() => designIssues(design, kind), [design, kind]);
  const problems = useMemo(
    () => issues.map((issue) => issueElement(issue.target)).filter((element): element is TicketElement => element !== null),
    [issues],
  );
  const issueMessages = [...new Set(issues.map((issue) => issue.message))];
  // An event of several days (ADR 0091) whose ticket prints only the first date.
  const firstDateOnly =
    event.days.length > 1 &&
    design.texts.some((block) => /\{data(_extenso)?\}/.test(block.text)) &&
    !design.texts.some((block) => block.text.includes("{dias}"));

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

  const body = (): DesignBody => ({ design, artId, sponsorIds: sponsors.map((logo) => logo.id) });
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
  const uploadSponsors = useMutation({
    mutationFn: async (files: File[]) => {
      const uploaded: { file: File; logo: ArtDto }[] = [];
      for (const file of files) {
        uploaded.push({ file, logo: await upload<ArtDto>(`/api/events/${eventId}/art`, file) });
      }
      return uploaded;
    },
    onSuccess: (uploaded) => {
      for (const { file, logo } of uploaded) {
        rememberArt(logo, file);
      }
      change((current) => ({
        ...current,
        sponsors: [...current.sponsors, ...uploaded.map(({ logo }) => logo)].slice(0, MAX_SPONSORS),
        design: current.design.sponsors ?? null ? current.design : { ...current.design, sponsors: defaultSponsorStrip(current.design, t.sponsors.defaultLabel) },
      }));
    },
    onError: (error) => toast.error(errorMessage(error)),
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
      // Sponsors stay: their strip moves to a free spot of the new layout.
      change((current) => ({
        design: current.design.sponsors == null ? next : { ...next, sponsors: defaultSponsorStrip(next, current.design.sponsors.label) },
        art: uploaded,
        sponsors: current.sponsors,
      }));
      setStubText(next.stub?.fields.join("\n") ?? "");
      setSelected([]);
      setGalleryOpen(false);
      toast.success(templatesTexts.applied(templatesTexts.items[template.id].name));
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
    setSelected([{ kind: "text", index: design.texts.length }]);
  };

  /** Places several elements at once: one undo step under `key`. */
  const placeAll = (changes: readonly ElementChange[], key: string | null = null) => {
    if (changes.length > 0) {
      update((d) => changes.reduce((next, { element, box }) => withBox(next, element, box), d), key);
    }
  };

  const selectedTexts = selection.flatMap((element) => (element.kind === "text" ? [element.index] : []));

  /** Removes the selected texts (number, QR and sponsors stay: they are not removed this way). */
  const removeSelection = () => {
    if (selectedTexts.length === 0) {
      toast(t.selection.cannotRemove);
      return;
    }
    const gone = new Set(selectedTexts);
    update((d) => ({ ...d, texts: d.texts.filter((_, index) => !gone.has(index)) }));
    setSelected([]);
    toast(t.selection.removed(gone.size), { action: { label: t.toolbar.undo, onClick: undo } });
  };

  /** Copies the selected texts 2 mm down and right, and selects the copies. */
  const duplicateSelection = () => {
    const blocks = selectedTexts.flatMap((index) => design.texts[index] ?? []);
    if (blocks.length === 0) {
      toast(t.selection.cannotDuplicate);
      return;
    }
    if (design.texts.length + blocks.length > MAX_TEXT_BLOCKS) {
      toast.error(t.selection.duplicateLimit(MAX_TEXT_BLOCKS));
      return;
    }
    const copies = blocks.map((block) => ({
      ...block,
      xMm: Math.min(block.xMm + 2, Math.max(0, design.widthMm - block.widthMm)),
      yMm: Math.min(block.yMm + 2, Math.max(0, design.heightMm - block.heightMm)),
    }));
    update((d) => ({ ...d, texts: [...d.texts, ...copies] }));
    setSelected(copies.map((_, offset): TicketElement => ({ kind: "text", index: design.texts.length + offset })));
  };

  const selectionItems = () =>
    selection.flatMap((element) => {
      const box = elementBox(design, element);
      return box === null ? [] : [{ element, box }];
    });

  /** Aligns a group to its own bounds, or a single element to the ticket. */
  const alignSelection = (edge: AlignEdge) => {
    const items = selectionItems();
    const boxes = items.map((item) => item.box);
    const frame: Box | null = items.length > 1 ? boundsOf(boxes) : { x: 0, y: 0, width: design.widthMm, height: design.heightMm };
    if (frame === null) {
      return;
    }
    const placed = alignBoxes(boxes, edge, frame);
    placeAll(items.map((item, index) => ({ element: item.element, box: placed[index] ?? item.box })));
  };

  const distributeSelection = (axis: Axis) => {
    const items = selectionItems();
    const placed = distributeBoxes(
      items.map((item) => item.box),
      axis,
    );
    placeAll(items.map((item, index) => ({ element: item.element, box: placed[index] ?? item.box })));
  };

  /** Moves the selection by `(dx, dy)` mm as a group, kept inside the body. */
  const nudge = (dx: number, dy: number) => {
    const items = selection.flatMap((element) => {
      const box = elementBox(design, element);
      return box === null ? [] : [{ element, box }];
    });
    const delta = clampDelta(
      items.map((item) => item.box),
      dx,
      dy,
      { width: design.widthMm, height: design.heightMm },
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
      items.map((item, index) => ({ element: item.element, box: moved[index] ?? item.box })),
      `nudge-${selection.map(elementKey).join(",")}`,
    );
  };

  // Ctrl+Z / Ctrl+Shift+Z (Ctrl+Y) undo and redo; Ctrl+S saves. Fields keep their own undo and
  // keys. Selection shortcuts (Ctrl+A, Ctrl+D, Delete, arrows, Esc) act when the focus is on the
  // editor or on nothing, so they never fight a dialog or another part of the page.
  useEffect(() => {
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
        key.preventDefault();
        setSelected(designElements(design));
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

  const removeText = (index: number) => {
    update((d) => ({ ...d, texts: d.texts.filter((_, i) => i !== index) }));
    setSelected([]);
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
    setSelected([{ kind: "text", index: index + 1 }]);
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
    setSelected([{ kind: "text", index: target }]);
  };

  const openGallery = () => {
    applyTemplate.reset();
    setGalleryOpen(true);
  };

  const chooseTemplate = async (template: TicketTemplate, palette: Palette) => {
    const customized = saved.version > 0 || dirty;
    if (
      customized &&
      !(await confirm({ title: templatesTexts.replaceTitle, description: templatesTexts.replaceBody, confirmLabel: templatesTexts.replaceConfirm, danger: false }))
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

  const elementLabel = (element: TicketElement): string => {
    if (element.kind === "text") {
      const block = design.texts[element.index];
      return block === undefined ? t.text : (blockValue(block, event) ?? block.text);
    }
    return element.kind === "number" ? t.number : element.kind === "qr" ? t.qr : t.sponsors.title;
  };

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
    ...(design.sponsors == null ? [] : [{ element: { kind: "sponsors" } as TicketElement, icon: Handshake, label: t.sponsors.title }]),
  ];

  return (
    <div className="flex flex-col gap-6">
      <TabHeader tab="design" help={t.intro} />
      <div ref={editorRef} className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-24">
          <Card padded={false} className="overflow-hidden">
            {/* Phones: tools on the first row (undo and redo on the right), state and saving on
                the second. Larger screens: one row that wraps only if it must. */}
            <div className="flex flex-col gap-2 border-b border-border px-3 py-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-4">
              <div className="flex items-center gap-1.5">
                <Button variant="secondary" size="sm" icon={<LayoutTemplate />} onClick={openGallery}>
                  {t.toolbar.templates}
                </Button>
                <Button variant="secondary" size="sm" icon={<Plus />} onClick={addText} disabled={design.texts.length >= MAX_TEXT_BLOCKS}>
                  {t.toolbar.addText}
                </Button>
                <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="max-sm:ml-auto"
                  aria-label={t.toolbar.undo}
                  title={`${t.toolbar.undo} (Ctrl+Z)`}
                  disabled={!canUndo}
                  onClick={undo}
                >
                  <Undo2 />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label={t.toolbar.redo} title={`${t.toolbar.redo} (Ctrl+Shift+Z)`} disabled={!canRedo} onClick={redo}>
                  <Redo2 />
                </Button>
                <span className="hidden pointer-coarse:contents">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t.selection.multiTouch}
                    title={t.selection.multiTouchHint}
                    aria-pressed={additive}
                    className={cn(additive && "bg-brand-soft text-brand-soft-fg ring-1 ring-brand/30 hover:bg-brand-soft active:bg-brand-soft")}
                    onClick={() => {
                      setAdditive(!additive);
                    }}
                  >
                    <SquareMousePointer />
                  </Button>
                </span>
                <ShortcutsHelp />
              </div>
              <div className="flex flex-wrap items-center gap-2 max-sm:justify-between">
                {status}
                <div className="flex items-center gap-2 max-sm:ml-auto">
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
                    <span className="sm:hidden">{t.toolbar.previewShort}</span>
                  </Button>
                  <Button size="sm" icon={<Save />} loading={save.isPending} disabled={!canSave} onClick={doSave}>
                    {save.isPending ? commonTexts.saving : commonTexts.save}
                  </Button>
                </div>
              </div>
            </div>
            <div ref={pasteboardRef} {...marquee.handlers} className="relative flex items-center justify-center bg-surface-2 bg-dots px-4 py-8 sm:px-8 sm:py-12">
              {marquee.overlay}
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
                  tag={tag}
                  sponsorUrls={sponsorUrls}
                  selected={selection}
                  additive={additive}
                  problems={problems}
                  onSelect={setSelected}
                  onChange={placeAll}
                />
              </div>
            </div>
            <p className="flex items-center gap-2 border-t border-border px-4 py-2.5 text-xs text-fg-muted">
              <MousePointerClick className="size-3.5 shrink-0" aria-hidden />
              <span className="pointer-coarse:hidden">{t.canvas.hint}</span>
              <span className="hidden pointer-coarse:inline">{additive ? t.selection.multiTouchHint : t.canvas.hintTouch}</span>
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
          {firstDateOnly && (
            <Alert
              tone="brand"
              title={t.daysTitle}
              action={
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    update((current) => ({
                      ...current,
                      texts: current.texts.map((block) => ({ ...block, text: block.text.replace(/\{data(_extenso)?\}/g, "{dias}") })),
                    }));
                  }}
                >
                  {t.daysAction}
                </Button>
              }
            >
              {t.daysBody}
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
                const isSelected = selection.some((item) => sameElement(item, element));
                const invalid = problems.some((problem) => sameElement(problem, element));
                return (
                  <li key={elementKey(element)}>
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      onClick={(click) => {
                        if (additive || click.shiftKey || click.ctrlKey || click.metaKey) {
                          setSelected(toggleElement(selection, element));
                        } else {
                          setSelected(isSelected && selection.length === 1 ? [] : [element]);
                        }
                      }}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition pointer-coarse:py-3",
                        isSelected ? "bg-brand-soft text-brand-soft-fg ring-1 ring-brand/30" : "text-fg hover:bg-surface-2 active:bg-surface-2",
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

          {selection.length > 1 && (
            <div ref={inspectorRef} className="scroll-mt-36 scroll-mb-28 max-xl:order-first">
              <Card className="animate-fade-in ring-1 ring-brand/30">
                <SelectionInspector
                  labels={selection.map((element) => elementLabel(element))}
                  textCount={selectedTexts.length}
                  onAlign={alignSelection}
                  onDistribute={distributeSelection}
                  onDuplicate={duplicateSelection}
                  onRemove={removeSelection}
                  onClear={() => {
                    setSelected([]);
                  }}
                />
              </Card>
            </div>
          )}

          {selected !== null && (
            // Below xl the columns stack: the inspector comes right after the ticket, so what was
            // just tapped is edited without hunting for it further down.
            <div ref={inspectorRef} className="scroll-mt-36 scroll-mb-28 max-xl:order-first">
            <Card className="animate-fade-in ring-1 ring-brand/30">
              <CardHeader
                icon={selected.kind === "text" ? Type : selected.kind === "number" ? Hash : selected.kind === "sponsors" ? Handshake : QrCode}
                title={selected.kind === "text" ? t.text : selected.kind === "number" ? t.number : selected.kind === "sponsors" ? t.sponsors.title : t.qr}
                actions={
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t.deselect}
                    title={t.deselect}
                    onClick={() => {
                      setSelected([]);
                    }}
                  >
                    <X />
                  </Button>
                }
              />
              <div className="mb-5 border-b border-border pb-4">
                <AlignBar label={t.selection.alignToTicket} onAlign={alignSelection} />
              </div>
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
              {selected.kind === "sponsors" && design.sponsors != null && (
                <SponsorStyle
                  strip={design.sponsors}
                  onChange={(changes, key) => {
                    update((d) => (d.sponsors == null ? d : { ...d, sponsors: { ...d.sponsors, ...changes } }), key);
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
            </div>
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
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-2">
              <Field label={t.width}>
                <NumberInput value={design.widthMm} onChange={(widthMm) => { update((d) => ({ ...d, widthMm }), "width"); }} suffix={commonTexts.mm} />
              </Field>
              <Field label={t.height}>
                <NumberInput value={design.heightMm} onChange={(heightMm) => { update((d) => ({ ...d, heightMm }), "height"); }} suffix={commonTexts.mm} />
              </Field>
              <Field label={t.background} className="max-sm:col-span-2 xl:col-span-2">
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
                  const fields = [...ticketCanvasTexts.defaultStubFields];
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
                      suffix={commonTexts.mm}
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

          <Section icon={Handshake} title={t.sponsors.title} description={t.sponsors.hint}>
            <div className="flex flex-col gap-4">
              <Switch
                label={t.sponsors.show}
                checked={design.sponsors != null}
                onChange={(checked) => {
                  update((d) => ({ ...d, sponsors: checked ? defaultSponsorStrip(d, t.sponsors.defaultLabel) : null }));
                  if (checked) {
                    setSelected([{ kind: "sponsors" }]);
                  }
                }}
              />
              {design.sponsors != null && (
                <div className="flex flex-col gap-4 animate-fade-in">
                  <ul className="grid grid-cols-3 gap-2">
                    {sponsors.map((logo, index) => (
                      <li key={logo.id} className="group relative flex aspect-[3/2] items-center justify-center rounded-xl border border-border bg-white p-2">
                        {sponsorUrls[index] !== undefined && (
                          // eslint-disable-next-line @next/next/no-img-element -- object URL of an uploaded logo
                          <img src={sponsorUrls[index]} alt={t.sponsors.logo(index + 1)} className="max-h-full max-w-full object-contain" />
                        )}
                        <div className="absolute inset-x-1 bottom-1 flex justify-between opacity-100 sm:opacity-0 sm:transition sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                          <Button
                            variant="secondary"
                            size="icon-sm"
                            aria-label={t.sponsors.moveLeft}
                            disabled={index === 0}
                            onClick={() => {
                              change((current) => ({ ...current, sponsors: swap(current.sponsors, index, index - 1) }));
                            }}
                          >
                            <ChevronLeft />
                          </Button>
                          <Button
                            variant="secondary"
                            size="icon-sm"
                            className="text-danger-fg"
                            aria-label={t.sponsors.remove(index + 1)}
                            onClick={() => {
                              change((current) => ({ ...current, sponsors: current.sponsors.filter((_, item) => item !== index) }));
                            }}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                        {logo.moderation === "flagged" && (
                          <span className="absolute top-1 left-1 rounded-full bg-warning-soft px-1.5 text-[10px] font-medium text-warning-fg">{t.sponsors.review}</span>
                        )}
                      </li>
                    ))}
                    {sponsors.length < MAX_SPONSORS && (
                      <li>
                        <label className="flex aspect-[3/2] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border-strong text-xs font-medium text-fg-muted transition hover:border-brand hover:text-brand has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand">
                          {uploadSponsors.isPending ? <Spinner /> : <ImagePlus className="size-5" aria-hidden />}
                          {t.sponsors.add}
                          <input
                            type="file"
                            accept="image/png,image/jpeg"
                            multiple
                            className="sr-only"
                            disabled={uploadSponsors.isPending}
                            onChange={(e) => {
                              const files = [...(e.target.files ?? [])].slice(0, MAX_SPONSORS - sponsors.length);
                              e.target.value = "";
                              if (files.length > 0) {
                                uploadSponsors.mutate(files);
                              }
                            }}
                          />
                        </label>
                      </li>
                    )}
                  </ul>
                  <p className="text-xs leading-relaxed text-fg-muted">{t.sponsors.logosHint(MAX_SPONSORS)}</p>
                  <SponsorStyle
                    strip={design.sponsors}
                    onChange={(changes, key) => {
                      update((d) => (d.sponsors == null ? d : { ...d, sponsors: { ...d.sponsors, ...changes } }), key);
                    }}
                  />
                </div>
              )}
            </div>
          </Section>

          <Section icon={Tags} title={t.band.title} description={t.band.hint}>
            <div className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t.band.edge}>
                  <Select
                    value={design.band?.edge ?? "auto"}
                    onChange={(e) => {
                      const value = e.target.value;
                      update((d) => ({
                        ...d,
                        band: value === "auto" ? null : { edge: value as BandEdge, sizeMm: d.band?.sizeMm ?? AUTO_BAND_MM },
                      }));
                    }}
                  >
                    <option value="auto">{t.band.auto(t.band.edges[effectiveBand({ ...design, band: null })?.edge ?? "bottom"])}</option>
                    {(Object.keys(t.band.edges) as BandEdge[]).map((edge) => (
                      <option key={edge} value={edge}>
                        {t.band.edges[edge]}
                      </option>
                    ))}
                  </Select>
                </Field>
                {design.band !== null && (
                  <Field label={t.band.size}>
                    <NumberInput
                      value={design.band.sizeMm}
                      step={0.5}
                      onChange={(sizeMm) => {
                        update((d) => (d.band === null ? d : { ...d, band: { ...d.band, sizeMm } }), "band-size");
                      }}
                      suffix={commonTexts.mm}
                    />
                  </Field>
                )}
              </div>
              <p className="text-xs leading-relaxed text-fg-muted">{tag === null ? t.band.noTags : t.band.preview}</p>
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
        kind={event.kind}
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

/** `items` with positions `a` and `b` swapped (a new array). */
function swap<T>(items: readonly T[], a: number, b: number): T[] {
  const next = [...items];
  const first = next[a];
  const second = next[b];
  if (first === undefined || second === undefined) {
    return next;
  }
  next[a] = second;
  next[b] = first;
  return next;
}

/** Label, its colour and the white panel of the sponsor strip. */
function SponsorStyle({ strip, onChange }: { strip: SponsorStrip; onChange: (changes: Partial<SponsorStrip>, key: string | null) => void }) {
  const s = eventTexts.design.sponsors;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={s.label} optional>
        <Input
          value={strip.label}
          maxLength={24}
          placeholder={s.defaultLabel}
          onChange={(e) => {
            onChange({ label: e.target.value }, "sponsors-label");
          }}
        />
      </Field>
      <Field label={s.labelColor}>
        <Input
          type="color"
          value={strip.labelColor}
          onChange={(e) => {
            onChange({ labelColor: e.target.value }, "sponsors-color");
          }}
        />
      </Field>
      <div className="rounded-xl border border-border px-4 py-3 sm:col-span-2">
        <Switch
          label={s.panel}
          description={s.panelHint}
          checked={strip.panel}
          onChange={(panel) => {
            onChange({ panel }, null);
          }}
        />
      </div>
    </div>
  );
}
