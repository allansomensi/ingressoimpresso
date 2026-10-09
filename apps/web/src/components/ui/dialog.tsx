"use client";

import { AlertTriangle, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/cn";
import { texts } from "@/texts/pt-BR";

import { Button } from "./button";

/** A modal on the native `<dialog>`: focus trap, Escape and the top layer come from the browser. */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string | undefined;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const pressedBackdrop = useRef(false);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onMouseDown={(event) => {
        pressedBackdrop.current = event.target === ref.current;
      }}
      onClick={(event) => {
        // A click on the dialog element itself is a click on the backdrop. A text selection
        // dragged out of a field also ends there: only a press that started outside closes.
        if (event.target === ref.current && pressedBackdrop.current) {
          onClose();
        }
        pressedBackdrop.current = false;
      }}
      className={cn(
        "m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-visible rounded-2xl border border-border bg-surface p-0 text-fg shadow-lg",
        "open:animate-pop",
        className,
      )}
    >
      {open && (
        <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
          <header className="flex items-start justify-between gap-4 px-6 pt-6 pb-2">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
              {description !== undefined && <p className="text-sm leading-relaxed text-fg-muted">{description}</p>}
            </div>
            <Button variant="ghost" size="icon" aria-label={texts.common.close} onClick={onClose} className="-mt-1 -mr-2">
              <X />
            </Button>
          </header>
          {children !== undefined && <div className="overflow-y-auto px-6 py-4">{children}</div>}
          {footer !== undefined && (
            <footer className="flex flex-col-reverse gap-2 border-t border-border px-6 py-4 sm:flex-row sm:justify-end">{footer}</footer>
          )}
        </div>
      )}
    </dialog>
  );
}

type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  /** Red confirm button for destructive actions (default). */
  danger?: boolean;
};

const ConfirmContext = createContext<(options: ConfirmOptions) => Promise<boolean>>(() => Promise.resolve(false));

/** `const confirm = useConfirm(); if (await confirm({ title })) ...` */
export function useConfirm() {
  return useContext(ConfirmContext);
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setPending({ ...options, resolve });
      }),
    [],
  );
  const finish = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };
  const danger = pending?.danger ?? true;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog
        open={pending !== null}
        onClose={() => {
          finish(false);
        }}
        title={
          <span className="flex items-center gap-3">
            {danger && (
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-danger-soft text-danger-fg">
                <AlertTriangle aria-hidden className="size-[18px]" />
              </span>
            )}
            {pending?.title}
          </span>
        }
        description={pending?.description}
        className="max-w-md"
        footer={
          <>
            <Button
              variant="secondary"
              // Destructive confirmations start on "Cancelar": Enter must not destroy anything.
              autoFocus={danger}
              onClick={() => {
                finish(false);
              }}
            >
              {texts.common.cancel}
            </Button>
            <Button
              variant={danger ? "danger" : "primary"}
              autoFocus={!danger}
              onClick={() => {
                finish(true);
              }}
            >
              {pending?.confirmLabel ?? texts.common.confirm}
            </Button>
          </>
        }
      />
    </ConfirmContext.Provider>
  );
}
