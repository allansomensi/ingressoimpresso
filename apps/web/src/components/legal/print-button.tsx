"use client";

import { Printer } from "lucide-react";

/** Prints the page (or saves it as PDF from the print dialog). */
export function PrintButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        window.print();
      }}
      className="inline-flex items-center gap-1.5 font-medium text-fg-muted transition hover:text-fg print:hidden"
    >
      <Printer className="size-4" aria-hidden />
      {label}
    </button>
  );
}
