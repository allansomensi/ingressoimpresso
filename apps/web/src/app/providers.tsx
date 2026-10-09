"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Toaster } from "sonner";

import { AppWorker } from "@/components/app-worker";
import { ConfirmProvider } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { useTheme } from "@/lib/theme";

export function Providers({ children }: { children: ReactNode }) {
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
      <Toaster
        theme={theme}
        position="top-center"
        richColors
        closeButton
        toastOptions={{ className: "font-sans", style: { borderRadius: "14px" } }}
      />
    </QueryClientProvider>
  );
}
