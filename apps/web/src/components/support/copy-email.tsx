"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui";
import { texts } from "@/texts/pt-BR";

const t = texts.helpCenter;

/** Copies the support address: many people write from a webmail that `mailto:` does not open. */
export function CopyEmail({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      icon={copied ? <Check /> : <Copy />}
      onClick={() => {
        navigator.clipboard.writeText(email).then(
          () => {
            setCopied(true);
            toast.success(t.emailCopied);
          },
          () => {
            toast.error(t.copyFailed);
          },
        );
      }}
    >
      {t.copyEmail}
    </Button>
  );
}
