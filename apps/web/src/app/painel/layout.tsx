"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui";
import { useRequiredUser, useSession } from "@/lib/session";
import { texts } from "@/texts/pt-BR";

export default function PanelLayout({ children }: { children: ReactNode }) {
  const user = useRequiredUser();
  const { signOut } = useSession();
  if (user === null) {
    return <p className="p-6 text-sm opacity-70">{texts.common.loading}</p>;
  }
  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <header className="mb-6 flex items-center justify-between gap-4">
        <Link href="/painel" className="font-bold">
          {texts.meta.title}
        </Link>
        <div className="flex items-center gap-3 text-sm">
          <span className="opacity-70">{user.email}</span>
          <Button variant="secondary" onClick={() => void signOut()}>
            {texts.panel.signOut}
          </Button>
        </div>
      </header>
      {children}
    </div>
  );
}
