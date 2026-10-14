import { ListTodo } from "lucide-react";

import { Badge, type Tone } from "@/components/ui";
import type { EventPhase } from "@/lib/event-list";
import { checklist as checklistTexts } from "@/texts/pt-BR/checklist";
import { event as eventTexts } from "@/texts/pt-BR/event";
import { eventChange as eventChangeTexts } from "@/texts/pt-BR/event-change";
import { panel as panelTexts } from "@/texts/pt-BR/panel";

/** How each phase of an event shows in the lists (ADR 0060). */
export const PHASE: Record<EventPhase, { label: string; tone: Tone }> = {
  happening: { label: panelTexts.happening, tone: "success" },
  today: { label: panelTexts.today, tone: "warning" },
  upcoming: { label: panelTexts.upcoming, tone: "brand" },
  past: { label: panelTexts.past, tone: "neutral" },
  canceled: { label: eventChangeTexts.canceledBadge, tone: "danger" },
  archived: { label: eventTexts.actions.archivedBadge, tone: "neutral" },
};

export function PhaseBadge({ phase, dot = true }: { phase: EventPhase; dot?: boolean }) {
  const status = PHASE[phase];
  return (
    <Badge tone={status.tone} dot={dot} pulse={dot && status.tone === "success"}>
      {status.label}
    </Badge>
  );
}

/** "Faltam 3": required items of the checklist still missing (ADR 0078); nothing once all are done. */
export function MissingBadge({ count }: { count: number | null }) {
  if (count === null || count === 0) {
    return null;
  }
  return (
    <Badge tone="warning" className="gap-1">
      <ListTodo className="size-3" aria-hidden />
      {checklistTexts.missing(count)}
    </Badge>
  );
}
