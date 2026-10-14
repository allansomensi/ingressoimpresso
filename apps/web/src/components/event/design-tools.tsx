"use client";

import type { TicketDesign } from "@ingressoimpresso/api-types";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceAround,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceAround,
  Boxes,
  Copy,
  Keyboard,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent, type ReactNode, type RefObject } from "react";

import { Button, CardHeader, Popover } from "@/components/ui";
import {
  DRAG_THRESHOLD_PX,
  designElements,
  elementBox,
  hitTest,
  rectBetween,
  sameElement,
  type AlignEdge,
  type Axis,
  type TicketElement,
} from "@/lib/design-selection";
import { event as eventTexts } from "@/texts/pt-BR";

const t = eventTexts.design;

const noSubscription = () => () => undefined;

/** Whether the keyboard has ⌘ and ⌥ instead of Ctrl and Alt (false while rendering on the server). */
function useIsMac(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => /Mac|iPhone|iPad/.test(navigator.userAgent),
    () => false,
  );
}

/** The "Atalhos" button: a panel listing the editor's keyboard shortcuts (hidden on touch screens). */
export function ShortcutsHelp() {
  const mac = useIsMac();
  const items = t.shortcuts.items(mac ? "⌘" : "Ctrl", mac ? "⌥" : "Alt", mac ? "⌫" : "Delete");
  return (
    <div className="hidden pointer-fine:block">
      <Popover
        label={t.shortcuts.open}
        title={t.shortcuts.title}
        trigger={<Keyboard className="size-4" aria-hidden />}
        triggerClassName="flex size-8 items-center justify-center rounded-lg text-fg-muted transition hover:bg-surface-2 hover:text-fg active:bg-surface-3"
        panelClassName="w-[22rem] p-3"
      >
        <p className="px-1 pb-2 text-xs font-semibold tracking-wide text-fg-subtle uppercase">{t.shortcuts.title}</p>
        <dl className="flex flex-col">
          {items.map(({ keys, label }) => (
            <div key={label} className="flex items-center justify-between gap-4 rounded-lg px-1 py-1.5 text-sm">
              <dt className="text-fg-muted">{label}</dt>
              <dd className="flex shrink-0 items-center gap-1">
                {keys.map((key) => (
                  <kbd
                    key={key}
                    className="min-w-6 rounded-md border border-border-strong bg-surface-2 px-1.5 py-0.5 text-center font-sans text-[11px] leading-4 font-semibold text-fg border-b-2"
                  >
                    {key}
                  </kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </Popover>
    </div>
  );
}

const ALIGN_X: readonly { edge: AlignEdge; icon: LucideIcon }[] = [
  { edge: "left", icon: AlignStartVertical },
  { edge: "center", icon: AlignCenterVertical },
  { edge: "right", icon: AlignEndVertical },
];
const ALIGN_Y: readonly { edge: AlignEdge; icon: LucideIcon }[] = [
  { edge: "top", icon: AlignStartHorizontal },
  { edge: "middle", icon: AlignCenterHorizontal },
  { edge: "bottom", icon: AlignEndHorizontal },
];

function ToolGroup({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex items-center gap-0.5 rounded-xl border border-border bg-surface-2 p-0.5">
      {children}
    </div>
  );
}

function Tool({ icon: Icon, label, disabled = false, onClick }: { icon: LucideIcon; label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="hover:bg-surface active:bg-surface"
    >
      <Icon />
    </Button>
  );
}

/**
 * Align buttons: with one element, to the ticket; with several, to each other. Distribute appears
 * with `onDistribute` and works from three elements.
 */
export function AlignBar({
  label,
  onAlign,
  onDistribute,
  canDistribute = false,
}: {
  label: string;
  onAlign: (edge: AlignEdge) => void;
  onDistribute?: (axis: Axis) => void;
  canDistribute?: boolean;
}) {
  const s = t.selection;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold tracking-wide text-fg-subtle uppercase">{label}</p>
      <div className="flex flex-wrap items-center gap-2">
        {[ALIGN_X, ALIGN_Y].map((group, index) => (
          <ToolGroup key={index} label={label}>
            {group.map(({ edge, icon }) => (
              <Tool
                key={edge}
                icon={icon}
                label={s.edges[edge]}
                onClick={() => {
                  onAlign(edge);
                }}
              />
            ))}
          </ToolGroup>
        ))}
        {onDistribute !== undefined && (
          <ToolGroup label={s.distribute}>
            <Tool
              icon={AlignHorizontalSpaceAround}
              label={s.distributeX}
              disabled={!canDistribute}
              onClick={() => {
                onDistribute("x");
              }}
            />
            <Tool
              icon={AlignVerticalSpaceAround}
              label={s.distributeY}
              disabled={!canDistribute}
              onClick={() => {
                onDistribute("y");
              }}
            />
          </ToolGroup>
        )}
      </div>
      {onDistribute !== undefined && !canDistribute && <p className="text-xs text-fg-muted">{s.distributeHint}</p>}
    </div>
  );
}

/** The inspector of a selection of two or more elements: group actions only. */
export function SelectionInspector({
  labels,
  textCount,
  onAlign,
  onDistribute,
  onDuplicate,
  onRemove,
  onClear,
}: {
  /** Names of the selected elements, in the selection's order. */
  labels: readonly string[];
  /** How many of them are texts (the only ones that can be duplicated or removed). */
  textCount: number;
  onAlign: (edge: AlignEdge) => void;
  onDistribute: (axis: Axis) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onClear: () => void;
}) {
  const s = t.selection;
  const mac = useIsMac();
  const mod = mac ? "⌘" : "Ctrl";
  return (
    <>
      <CardHeader
        icon={Boxes}
        title={s.title(labels.length)}
        description={s.hint}
        actions={
          <Button variant="ghost" size="icon" aria-label={s.clear} title={`${s.clear} (Esc)`} onClick={onClear}>
            <X />
          </Button>
        }
      />
      <div className="flex flex-col gap-5">
        <ul className="flex flex-wrap gap-1.5" aria-label={s.title(labels.length)}>
          {labels.map((label, index) => (
            <li
              key={`${label}-${String(index)}`}
              className="max-w-full truncate rounded-full border border-brand/30 bg-brand-soft px-2.5 py-0.5 text-xs font-medium text-brand-soft-fg"
            >
              {label}
            </li>
          ))}
        </ul>
        <AlignBar label={s.align} onAlign={onAlign} onDistribute={onDistribute} canDistribute={labels.length >= 3} />
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" icon={<Copy />} disabled={textCount === 0} onClick={onDuplicate} title={`${s.duplicate} (${mod}+D)`}>
              {s.duplicate}
            </Button>
            <Button variant="danger-ghost" size="sm" icon={<Trash2 />} disabled={textCount === 0} onClick={onRemove} title={`${s.remove} (Delete)`}>
              {s.remove}
            </Button>
          </div>
          {textCount < labels.length && <p className="text-xs leading-relaxed text-fg-muted">{s.fixedHint}</p>}
        </div>
      </div>
    </>
  );
}

interface MarqueeDrag {
  pointerId: number;
  /** Where the press started, in millimetres from the body's top-left corner. */
  x: number;
  y: number;
  clientX: number;
  clientY: number;
  /** The selection kept under the marquee (Shift, Ctrl or ⌘ add to it). */
  base: TicketElement[];
  shown: boolean;
}

/**
 * Rubber-band selection on the area around the ticket (mouse only): dragging on empty space draws
 * a rectangle and selects every element it touches. A plain click there clears the selection; on
 * touch screens, a tap on the ticket's background does the same unless "select several" is on.
 */
export function useMarquee({
  ref,
  design,
  selection,
  additive,
  onSelect,
}: {
  /** The area around the ticket, where a marquee can start. */
  ref: RefObject<HTMLDivElement | null>;
  design: TicketDesign;
  selection: readonly TicketElement[];
  additive: boolean;
  onSelect: (elements: TicketElement[]) => void;
}) {
  const drag = useRef<MarqueeDrag | null>(null);
  const [rect, setRect] = useState<CSSProperties | null>(null);

  /** The body's rectangle on screen and its scale. */
  const body = () => {
    const element = ref.current?.querySelector<HTMLElement>("[data-ticket-body]");
    const box = element?.getBoundingClientRect();
    return box === undefined || box.width === 0 ? null : { box, mmPerPx: design.widthMm / box.width };
  };

  const onPointerDown = (pointer: PointerEvent<HTMLDivElement>) => {
    if (pointer.button !== 0) {
      return;
    }
    const modifier = pointer.shiftKey || pointer.ctrlKey || pointer.metaKey;
    if (pointer.pointerType !== "mouse") {
      // Only a tap on the ticket itself: the margin around it is where a finger scrolls the page.
      const onTicket = pointer.target instanceof Element && pointer.target.closest("[data-ticket-body]") !== null;
      if (onTicket && !additive) {
        onSelect([]);
      }
      return;
    }
    const measured = body();
    if (measured === null) {
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
      x: (pointer.clientX - measured.box.left) * measured.mmPerPx,
      y: (pointer.clientY - measured.box.top) * measured.mmPerPx,
      clientX: pointer.clientX,
      clientY: pointer.clientY,
      base: modifier ? [...selection] : [],
      shown: false,
    };
  };

  const onPointerMove = (pointer: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    const measured = body();
    const area = ref.current?.getBoundingClientRect();
    if (current?.pointerId !== pointer.pointerId || measured === null || area === undefined) {
      return;
    }
    if (!current.shown && Math.hypot(pointer.clientX - current.clientX, pointer.clientY - current.clientY) < DRAG_THRESHOLD_PX) {
      return;
    }
    current.shown = true;
    // Millimetres, measured again each time: the page may scroll during the drag.
    const x = (pointer.clientX - measured.box.left) * measured.mmPerPx;
    const y = (pointer.clientY - measured.box.top) * measured.mmPerPx;
    const marquee = rectBetween(current.x, current.y, x, y);
    const items = designElements(design).flatMap((element) => {
      const box = elementBox(design, element);
      return box === null ? [] : [{ item: element, box }];
    });
    const hits = hitTest(marquee, items);
    onSelect([...current.base, ...hits.filter((hit) => !current.base.some((item) => sameElement(item, hit)))]);
    const px = (mm: number) => mm / measured.mmPerPx;
    setRect({
      left: measured.box.left - area.left + px(marquee.x),
      top: measured.box.top - area.top + px(marquee.y),
      width: px(marquee.width),
      height: px(marquee.height),
    });
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

  const overlay =
    rect === null ? null : (
      <div aria-hidden className="pointer-events-none absolute z-40 rounded-[3px] border border-brand bg-brand/10" style={rect} />
    );

  return { overlay, handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp } };
}
