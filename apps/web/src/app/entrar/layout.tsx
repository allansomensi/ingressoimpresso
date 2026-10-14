import type { Metadata } from "next";
import type { ReactNode } from "react";

import { login as loginTexts } from "@/texts/pt-BR/login";

export const metadata: Metadata = {
  title: loginTexts.title,
  description: loginTexts.metaDescription,
  alternates: { canonical: "/entrar" },
};

export default function SignInLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
