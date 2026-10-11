"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Toaster, toast } from "sonner";

import { AppWorker } from "@/components/app-worker";
import { ConfirmProvider } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { useTheme } from "@/lib/theme";

/** Toasts in the site's own colors (surface, border, text), so both themes match the panel. */
const TOASTER_STYLE = {
  "--normal-bg": "var(--surface)",
  "--normal-border": "var(--border)",
  "--normal-text": "var(--fg)",
} as CSSProperties;

const TOAST_CLASSES = {
  toast: "cursor-pointer select-none gap-3 rounded-2xl! border px-4! py-3.5! font-sans shadow-lg! transition-transform active:scale-[0.98]",
  title: "text-sm font-medium leading-snug",
  description: "text-[13px] text-fg-muted!",
  icon: "size-5!",
  success: "[&_[data-icon]]:text-success",
  error: "[&_[data-icon]]:text-danger",
  warning: "[&_[data-icon]]:text-warning",
  info: "[&_[data-icon]]:text-brand",
};

/** A tap anywhere on a toast closes it (there is no close button). */
function useTapToDismiss() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const element = target?.closest("[data-sonner-toast]");
      // Buttons inside a toast (an action) keep their own behavior.
      if (element === null || element === undefined || target?.closest("button, a") !== null) {
        return;
      }
      const title = element.querySelector("[data-title]")?.textContent ?? "";
      const active = toast.getToasts().find((item) => "title" in item && typeof item.title === "string" && item.title === title);
      if (active !== undefined) {
        toast.dismiss(active.id);
      }
    };
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("click", onClick);
    };
  }, []);
}

export function Providers({ children }: { children: ReactNode }) {
  useTapToDismiss();
  const { theme } = useTheme();
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: (failures, error) => !(error instanceof ApiError && error.status < 500 && error.status !== 0) && failures < 2,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <ConfirmProvider>{children}</ConfirmProvider>
      <AppWorker />
      <Toaster theme={theme} position="top-center" style={TOASTER_STYLE} toastOptions={{ classNames: TOAST_CLASSES }} />
    </QueryClientProvider>
  );
}
