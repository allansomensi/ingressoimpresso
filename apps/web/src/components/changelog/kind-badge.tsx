import type { ChangelogKind } from "@ingressoimpresso/api-types";
import { Bug, Rocket, ShieldCheck, Sparkles, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/cn";
import { texts } from "@/texts/pt-BR";

const KINDS: Record<ChangelogKind, { icon: LucideIcon; className: string }> = {
  new: { icon: Rocket, className: "bg-brand-soft text-brand-soft-fg ring-brand/20" },
  improvement: { icon: Sparkles, className: "bg-success-soft text-success-fg ring-success/20" },
  fix: { icon: Bug, className: "bg-warning-soft text-warning-fg ring-warning/25" },
  security: { icon: ShieldCheck, className: "bg-danger-soft text-danger-fg ring-danger/20" },
};

/** "Novo", "Melhoria", "Correção" or "Segurança", with its icon and colour. */
export function KindBadge({ kind, className }: { kind: ChangelogKind; className?: string | undefined }) {
  const { icon: Icon, className: tone } = KINDS[kind];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ring-1 ring-inset",
        tone,
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {texts.changelog.kinds[kind]}
    </span>
  );
}
