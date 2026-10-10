"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/cn";
import { texts } from "@/texts/pt-BR";

/** Phones get bottom sheets instead of floating panels (Tailwind's `sm` breakpoint). */
const PHONE_QUERY = "(max-width: 639.98px)";

function subscribePhone(onChange: () => void): () => void {
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener("change", onChange);
  return () => {
    query.removeEventListener("change", onChange);
  };
}

/** Whether the screen is phone-sized (false while rendering on the server). */
export function useIsPhone(): boolean {
  return useSyncExternalStore(
    subscribePhone,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false,
  );
}

/**
 * Open/close state of a floating panel: closes on a click outside, on Escape (focus goes back to
 * the trigger), when focus leaves both the trigger and the panel, and when the page changes.
 */
function useDismissable(): {
  open: boolean;
  setOpen: (open: boolean) => void;
  close: (refocus?: boolean) => void;
  rootRef: RefObject<HTMLDivElement | null>;
  panelRef: RefObject<HTMLDivElement | null>;
  triggerRef: RefObject<HTMLButtonElement | null>;
} {
  // The page the panel was opened on: when a link takes the user elsewhere, it is no longer open.
  const pathname = usePathname();
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = useCallback(
    (value: boolean) => {
      setOpenOn(value ? pathname : null);
    },
    [pathname],
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = useCallback((refocus = false) => {
    setOpenOn(null);
    if (refocus) {
      triggerRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    const outside = (event: Event) => {
      if (!(event.target instanceof Node)) {
        return;
      }
      const inRoot = rootRef.current?.contains(event.target) ?? false;
      const inPanel = panelRef.current?.contains(event.target) ?? false;
      if (!inRoot && !inPanel) {
        close();
      }
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close(true);
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open, close]);

  return { open, setOpen, close, rootRef, panelRef, triggerRef };
}

const GAP = 8;
const EDGE = 8;

/**
 * Places a floating panel under its trigger (or above, if it does not fit), inside the viewport.
 * Writes the position straight to the element, so scrolling does not re-render React.
 */
function useAnchoredPosition(
  open: boolean,
  phone: boolean,
  triggerRef: RefObject<HTMLButtonElement | null>,
  panelRef: RefObject<HTMLDivElement | null>,
  align: "start" | "end",
) {
  useLayoutEffect(() => {
    if (!open || phone) {
      return;
    }
    const place = () => {
      const trigger = triggerRef.current;
      const panel = panelRef.current;
      if (trigger === null || panel === null) {
        return;
      }
      const anchor = trigger.getBoundingClientRect();
      const width = panel.offsetWidth;
      const height = panel.scrollHeight;
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight;
      const preferredLeft = align === "end" ? anchor.right - width : anchor.left;
      const left = Math.max(EDGE, Math.min(preferredLeft, viewportWidth - width - EDGE));
      const below = anchor.bottom + GAP;
      const above = anchor.top - GAP - height;
      const downward = below + height <= viewportHeight - EDGE || above < EDGE;
      const top = Math.max(EDGE, downward ? below : above);
      panel.style.top = `${String(top)}px`;
      panel.style.left = `${String(left)}px`;
      panel.style.maxHeight = `${String(viewportHeight - top - EDGE)}px`;
      panel.style.transformOrigin = `${align === "end" ? "right" : "left"} ${downward ? "top" : "bottom"}`;
      panel.style.visibility = "visible";
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, phone, triggerRef, panelRef, align]);
}

/** While a bottom sheet is open, the page under it does not scroll. */
function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) {
      return;
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [active]);
}

/**
 * The panel itself, rendered in `<body>` so no `overflow: hidden` card or blurred header can clip
 * it: anchored to the trigger on larger screens, a bottom sheet with a backdrop on phones.
 */
function FloatingPanel({
  open,
  phone,
  title,
  triggerRef,
  panelRef,
  align,
  className,
  onClose,
  children,
  ...props
}: {
  open: boolean;
  phone: boolean;
  title: string;
  triggerRef: RefObject<HTMLButtonElement | null>;
  panelRef: RefObject<HTMLDivElement | null>;
  align: "start" | "end";
  className?: string | undefined;
  onClose: () => void;
  children: ReactNode;
  id: string;
  role?: string;
  "aria-label"?: string;
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
}) {
  useAnchoredPosition(open, phone, triggerRef, panelRef, align);
  useScrollLock(open && phone);
  if (!open) {
    return null;
  }
  // Links close the panel even when they lead to the page already open, and so does any control
  // marked `data-dismiss` (one that changes the page in place, like a section picker).
  const closeOnLink = (event: { target: EventTarget }) => {
    if (event.target instanceof Element && event.target.closest("a[href], [data-dismiss]") !== null) {
      onClose();
    }
  };
  const panel = phone ? (
    <>
      <div aria-hidden className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-[2px] animate-fade-in" />
      <div
        ref={panelRef}
        {...props}
        onClick={closeOnLink}
        className={cn(
          "fixed inset-x-0 bottom-0 z-[61] flex max-h-[85dvh] flex-col overflow-y-auto overscroll-contain rounded-t-3xl border-t border-border bg-surface px-2 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-lg animate-sheet",
        )}
      >
        <div className="flex items-center justify-between px-3 pt-1 pb-2">
          <span aria-hidden className="absolute top-2 left-1/2 h-1 w-10 -translate-x-1/2 rounded-full bg-border-strong" />
          <span className="pt-3 text-sm font-semibold text-fg">{title}</span>
          <button
            type="button"
            onClick={onClose}
            className="mt-2 rounded-full px-3 py-1.5 text-sm font-medium text-fg-muted transition hover:bg-surface-2 hover:text-fg"
          >
            {texts.common.close}
          </button>
        </div>
        {children}
      </div>
    </>
  ) : (
    <div
      ref={panelRef}
      {...props}
      onClick={closeOnLink}
      className={cn(
        "invisible fixed z-[60] overflow-y-auto overscroll-contain rounded-2xl border border-border bg-surface p-1.5 shadow-lg animate-pop",
        className,
      )}
    >
      {children}
    </div>
  );
  return createPortal(panel, document.body);
}

/** A button that toggles a panel of free content (account details, notifications). */
export function Popover({
  label,
  title,
  trigger,
  triggerClassName,
  panelClassName,
  align = "end",
  children,
}: {
  label: string;
  /** Heading of the bottom sheet on phones (defaults to `label`). */
  title?: string | undefined;
  trigger: ReactNode;
  triggerClassName?: string | undefined;
  panelClassName?: string | undefined;
  align?: "start" | "end";
  children: ReactNode;
}) {
  const { open, setOpen, close, rootRef, panelRef, triggerRef } = useDismissable();
  const phone = useIsPhone();
  const id = useId();
  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => {
          setOpen(!open);
        }}
        className={triggerClassName}
      >
        {trigger}
      </button>
      <FloatingPanel
        open={open}
        phone={phone}
        title={title ?? label}
        triggerRef={triggerRef}
        panelRef={panelRef}
        align={align}
        className={panelClassName}
        onClose={close}
        id={id}
      >
        {children}
      </FloatingPanel>
    </div>
  );
}

const MenuContext = createContext<(refocus?: boolean) => void>(() => undefined);

/** A button that opens a list of actions, with arrow-key navigation (WAI-ARIA menu button). */
export function Menu({
  label,
  trigger,
  triggerClassName,
  children,
  disabled = false,
}: {
  label: string;
  trigger: ReactNode;
  triggerClassName?: string | undefined;
  children: ReactNode;
  disabled?: boolean;
}) {
  const { open, setOpen, close, rootRef, panelRef, triggerRef } = useDismissable();
  const phone = useIsPhone();
  const id = useId();

  const items = useCallback(() => [...(panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])], [panelRef]);

  // Focus the first action when the menu opens (not on phones: no keyboard, no focus ring).
  useEffect(() => {
    if (open && !phone) {
      items()[0]?.focus({ preventScroll: true });
    }
  }, [open, phone, items]);

  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const list = items();
    const index = list.indexOf(document.activeElement as HTMLElement);
    const move: Partial<Record<string, number>> = {
      ArrowDown: (index + 1) % list.length,
      ArrowUp: (index - 1 + list.length) % list.length,
      Home: 0,
      End: list.length - 1,
    };
    const next = move[event.key];
    if (next !== undefined) {
      event.preventDefault();
      list[next]?.focus();
    } else if (event.key === "Tab") {
      close(true);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        disabled={disabled}
        onClick={() => {
          setOpen(!open);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={triggerClassName}
      >
        {trigger}
      </button>
      <FloatingPanel
        open={open}
        phone={phone}
        title={label}
        triggerRef={triggerRef}
        panelRef={panelRef}
        align="end"
        className="w-56"
        onClose={close}
        id={id}
        role="menu"
        aria-label={label}
        onKeyDown={keyDown}
      >
        <MenuContext.Provider value={close}>{children}</MenuContext.Provider>
      </FloatingPanel>
    </div>
  );
}

export function MenuItem({
  children,
  onSelect,
  tone = "default",
  icon,
}: {
  children: ReactNode;
  onSelect: () => void;
  tone?: "default" | "danger";
  icon?: ReactNode;
}) {
  const close = useContext(MenuContext);
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      onClick={() => {
        close(true);
        onSelect();
      }}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium transition outline-none max-sm:py-3 max-sm:text-[15px] [&_svg]:size-4",
        tone === "danger"
          ? "text-danger-fg hover:bg-danger-soft focus-visible:bg-danger-soft"
          : "text-fg hover:bg-surface-2 focus-visible:bg-surface-2",
      )}
    >
      {icon}
      {children}
    </button>
  );
}
