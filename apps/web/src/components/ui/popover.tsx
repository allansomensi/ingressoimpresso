"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";

import { cn } from "@/lib/cn";

/**
 * Open/close state of a floating panel: closes on a click outside, on Escape (focus goes back to
 * the trigger) and when focus leaves both the trigger and the panel.
 */
function useDismissable(): {
  open: boolean;
  setOpen: (open: boolean) => void;
  close: (refocus?: boolean) => void;
  rootRef: RefObject<HTMLDivElement | null>;
  triggerRef: RefObject<HTMLButtonElement | null>;
} {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = useCallback((refocus = false) => {
    setOpen(false);
    if (refocus) {
      triggerRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    const root = rootRef.current;
    const outside = (event: Event) => {
      if (root !== null && event.target instanceof Node && !root.contains(event.target)) {
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

  return { open, setOpen, close, rootRef, triggerRef };
}

const panelClass =
  "absolute z-50 mt-2 origin-top-right rounded-2xl border border-border bg-surface p-1.5 shadow-lg animate-pop";

/** A button that toggles a panel of free content (account details, settings). */
export function Popover({
  label,
  trigger,
  triggerClassName,
  panelClassName,
  children,
}: {
  label: string;
  trigger: ReactNode;
  triggerClassName?: string | undefined;
  panelClassName?: string | undefined;
  children: ReactNode;
}) {
  const { open, setOpen, rootRef, triggerRef } = useDismissable();
  const id = useId();
  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          setOpen(!open);
        }}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open && (
        <div id={id} className={cn(panelClass, "right-0", panelClassName)}>
          {children}
        </div>
      )}
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
  const { open, setOpen, close, rootRef, triggerRef } = useDismissable();
  const menuRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const items = () => [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];

  // Focus the first action when the menu opens.
  useEffect(() => {
    if (open) {
      items()[0]?.focus();
    }
  }, [open]);

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
      close();
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
      {open && (
        <div ref={menuRef} id={id} role="menu" aria-label={label} onKeyDown={keyDown} className={cn(panelClass, "right-0 w-56")}>
          <MenuContext.Provider value={close}>{children}</MenuContext.Provider>
        </div>
      )}
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
        "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium transition outline-none [&_svg]:size-4",
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
