import type { Metadata } from "next";
import type { ReactNode } from "react";

import { PanelShell } from "@/components/panel/shell";
import { texts } from "@/texts/pt-BR";

export const metadata: Metadata = {
  title: texts.panel.title,
  robots: { index: false, follow: false },
};

export default function PanelLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <PanelShell>{children}</PanelShell>;
}
