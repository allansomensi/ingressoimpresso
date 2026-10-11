/**
 * An event's team (ADR 0055): who may change which part of an event. The API decides; these
 * rules only hide what a person cannot do, so the panel never offers a button that would fail.
 */

import type { EventDto, TeamArea, TeamMemberDto } from "@ingressoimpresso/api-types";

import { initials } from "@/lib/format";
import { texts } from "@/texts/pt-BR";

/** The parts of an event, in the order the panel shows them (coordination first). */
export const TEAM_AREAS = ["manage", "money", "delivery", "art", "door"] as const satisfies readonly TeamArea[];

/** The parts someone takes care of besides coordination. */
export const PART_AREAS = ["money", "delivery", "art", "door"] as const satisfies readonly TeamArea[];

type Access = Pick<EventDto, "team">;

/** Whether the user is one of the organization's own people (they may do everything). */
export function isOwner(event: Access): boolean {
  return event.team === null;
}

/** Whether the user may change `area` of the event. */
export function canDo(event: Access, area: TeamArea): boolean {
  return event.team === null || event.team.areas.includes("manage") || event.team.areas.includes(area);
}

/** The areas chosen in the form, as the API keeps them: coordination alone covers everything. */
export function normalizeAreas(areas: readonly TeamArea[]): TeamArea[] {
  if (areas.includes("manage")) {
    return ["manage"];
  }
  return TEAM_AREAS.filter((area) => areas.includes(area));
}

/** Who takes care of `area`: the members with it, then the coordinators. */
export function responsibleFor(members: readonly TeamMemberDto[], area: TeamArea): TeamMemberDto[] {
  return members.filter((member) => member.areas.includes(area));
}

/** How a person is shown: the name, or the part of the e-mail before the @. */
export function displayName(person: { name: string | null; email: string }): string {
  return person.name ?? person.email.split("@")[0] ?? person.email;
}

/** Up to two initials for an avatar: "Ana Souza" → "AS", "bia.lima@x.com" → "BL". */
export function personInitials(person: { name: string | null; email: string }): string {
  return initials(displayName(person).replace(/[._-]+/g, " "));
}

/** "Ana, Bia e Caio". */
export function listNames(names: readonly string[]): string {
  const rest = [...names];
  const last = rest.pop();
  if (last === undefined) {
    return "";
  }
  return rest.length === 0 ? last : `${rest.join(", ")} e ${last}`;
}

/** "Recebimentos, Arte do ingresso e Portaria". */
export function areaList(areas: readonly TeamArea[]): string {
  return listNames(TEAM_AREAS.filter((area) => areas.includes(area)).map((area) => texts.event.team.areas[area]));
}

/** Areas read from a notification (unknown values are skipped). */
export function parseAreas(value: unknown): TeamArea[] {
  return Array.isArray(value) ? TEAM_AREAS.filter((area) => value.includes(area)) : [];
}
