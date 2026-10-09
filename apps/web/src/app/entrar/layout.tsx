import type { Metadata } from "next";
import type { ReactNode } from "react";

import { texts } from "@/texts/pt-BR";

export const metadata: Metadata = { title: texts.login.title };

export default function SignInLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
