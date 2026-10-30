"use client";

import type { EventDto, EventKind, EventTeamDto, TeamArea } from "@ingressoimpresso/api-types";
import { useQuery } from "@tanstack/react-query";
import { Eye } from "lucide-react";
import { createContext, useContext, type ReactNode } from "react";

import { api } from "@/lib/api";
import { forKind } from "@/lib/event-kind";
import { canDo, displayName, isOwner, responsibleFor } from "@/lib/team";
import { event as eventTexts } from "@/texts/pt-BR/event";

type Access = Pick<EventDto, "team"> & { kind?: EventKind | undefined; digitalOnly?: boolean | undefined };

const AccessContext = createContext<Access>({ team: null });

/** Shares the current user's place on the event (ADR 0055) and its kind (ADR 0084) with every tab. */
export function EventAccessProvider({ event, children }: { event: Access; children: ReactNode }) {
  return <AccessContext.Provider value={{ team: event.team, kind: event.kind, digitalOnly: event.digitalOnly }}>{children}</AccessContext.Provider>;
}

/** The event's tickets only go to phones (ADR 0123). */
export function useDigitalOnly(): boolean {
  return useContext(AccessContext).digitalOnly ?? false;
}

/** Tickets or consumption tokens, for the event shown. */
export function useEventKind(): EventKind | undefined {
  return useContext(AccessContext).kind;
}

/** The texts of the event page, in the words of either kind. */
export type EventTexts = typeof eventTexts;

/** The texts of the event page in the words of its kind: "ficha" for consumption tokens (ADR 0086). */
export function useEventTexts(): EventTexts {
  return forKind(eventTexts, eventTexts.tokens, useEventKind());
}

/** What the current user may do on the event shown. */
export function useEventAccess(): { owner: boolean; can: (area: TeamArea) => boolean } {
  const access = useContext(AccessContext);
  return { owner: isOwner(access), can: (area) => canDo(access, area) };
}

/** The event's team (shared by the team tab and the read-only notices). */
export function useTeam(eventId: string, enabled = true) {
  return useQuery({
    queryKey: ["team", eventId],
    queryFn: () => api<EventTeamDto>(`/api/events/${eventId}/team`),
    enabled,
  });
}

/** Tells a team member this part is someone else's, and whose. */
export function ReadOnlyNotice({ eventId, area }: { eventId: string; area: TeamArea }) {
  const t = useEventTexts().team;
  const { can } = useEventAccess();
  const team = useTeam(eventId, !can(area));
  if (can(area)) {
    return null;
  }
  const people = responsibleFor(team.data?.members ?? [], area).map(displayName);
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-fg-muted animate-fade-in"
    >
      <Eye className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden />
      <p className="leading-relaxed">
        {people.length === 0 ? t.readOnly(t.areas[area]) : t.readOnlyWho(t.areas[area], people.join(", "))}
      </p>
    </div>
  );
}

/**
 * A tab that belongs to one part of the event: whoever does not take care of it sees the same
 * screen with every control disabled, under a notice saying whose part it is.
 */
export function AreaGate({ eventId, area, children }: { eventId: string; area: TeamArea; children: ReactNode }) {
  const { can } = useEventAccess();
  if (can(area)) {
    return children;
  }
  return (
    <div className="flex flex-col gap-6">
      <ReadOnlyNotice eventId={eventId} area={area} />
      <fieldset disabled className="min-w-0">
        {children}
      </fieldset>
    </div>
  );
}
