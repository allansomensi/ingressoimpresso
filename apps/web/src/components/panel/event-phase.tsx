import { ListTodo } from "lucide-react";

import { Badge, type Tone } from "@/components/ui";
import type { EventPhase } from "@/lib/event-list";
import { texts } from "@/texts/pt-BR";

/** How each phase of an event shows in the lists (ADR 0060). */
export const PHASE: Record<EventPhase, { label: string; tone: Tone }> = {
  happening: { label: texts.panel.happening, tone: "success" },
  today: { label: texts.panel.today, tone: "warning" },
  upcoming: { label: texts.panel.upcoming, tone: "brand" },
  past: { label: texts.panel.past, tone: "neutral" },
  canceled: { label: texts.eventChange.canceledBadge, tone: "danger" },
  archived: { label: texts.event.actions.archivedBadge, tone: "neutral" },
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
      {texts.checklist.missing(count)}
    </Badge>
  );
}
