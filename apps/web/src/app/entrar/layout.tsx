import type { Metadata } from "next";
import type { ReactNode } from "react";

import { pageMetadata } from "@/lib/seo";
import { login as loginTexts } from "@/texts/pt-BR/login";

export const metadata: Metadata = pageMetadata({ title: loginTexts.metaTitle, description: loginTexts.metaDescription, path: "/entrar" });

export default function SignInLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
