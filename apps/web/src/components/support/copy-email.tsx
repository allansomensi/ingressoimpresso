"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui";
import { copyText } from "@/lib/share";
import { helpCenter as helpCenterTexts } from "@/texts/pt-BR/help-center";

const t = helpCenterTexts;

/** Copies the support address: many people write from a webmail that `mailto:` does not open. */
export function CopyEmail({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      icon={copied ? <Check /> : <Copy />}
      onClick={() => {
        // `copyText` also covers a browser without the clipboard API (an in-app browser, plain HTTP).
        void copyText(email).then((ok) => {
          setCopied(ok);
          toast[ok ? "success" : "error"](ok ? t.emailCopied : t.copyFailed);
        });
      }}
    >
      {t.copyEmail}
    </Button>
  );
}
