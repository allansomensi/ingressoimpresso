import type { Metadata } from "next";
import type { ReactNode } from "react";

import { PanelShell } from "@/components/panel/shell";
import { panel as panelTexts } from "@/texts/pt-BR";

export const metadata: Metadata = {
  title: panelTexts.title,
  robots: { index: false, follow: false },
};

export default function PanelLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <PanelShell>{children}</PanelShell>;
}
