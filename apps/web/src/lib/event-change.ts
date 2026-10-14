/**
 * A postponed or canceled event (ADR 0065): what the pages say about it and the ready-made
 * message the organizer sends to the sellers, who pass it on to whoever bought.
 */

import type { EventChangeDto, PublicOrganizationDto } from "@ingressoimpresso/api-types";

import { placeLine } from "@/lib/calendar";
import { wallClock } from "@/lib/event-time";
import { eventChange as eventChangeTexts } from "@/texts/pt-BR";

export type ChangeKind = "canceled" | "postponed" | "moved" | null;

/** Passes saved on a phone before ADR 0065 have no `change`: nothing changed for them. */
export const NO_CHANGE: EventChangeDto = {
  postponedFromStartsAt: null,
  postponedAt: null,
  postponeReason: null,
  canceledAt: null,
  cancelReason: null,
};

/** Canceled wins; a postponement to an earlier date is "moved", not "postponed". */
export function changeKind(change: EventChangeDto | null | undefined, startsAt: string): ChangeKind {
  if (change === null || change === undefined) {
    return null;
  }
  if (change.canceledAt !== null) {
    return "canceled";
  }
  if (change.postponedFromStartsAt === null) {
    return null;
  }
  return Date.parse(change.postponedFromStartsAt) > Date.parse(startsAt) ? "moved" : "postponed";
}

const WEEKDAYS = ["segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado", "domingo"] as const;
const MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
] as const;

/** `sábado, 20 de novembro, às 21h` (`às 21h30`), in the event's own wall-clock time. */
export function spokenDate(iso: string): string {
  const d = wallClock(iso);
  const hour = d.minute === 0 ? `${String(d.hour)}h` : `${String(d.hour)}h${String(d.minute).padStart(2, "0")}`;
  return `${WEEKDAYS[d.weekday] ?? ""}, ${String(d.day)} de ${MONTHS[d.month - 1] ?? ""}, às ${hour}`;
}

/** `(11) 99999-8888` from `5511999998888` (other countries as `+351 912345678`). */
export function displayPhone(digits: string): string {
  const match = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(digits);
  if (match === null) {
    return `+${digits}`;
  }
  return `(${match[1] ?? ""}) ${match[2] ?? ""}-${match[3] ?? ""}`;
}

/** The message for the sellers: what changed, where, why, and who to ask. */
export function sellerMessage({
  eventName,
  startsAt,
  venue,
  address,
  change,
  organization,
}: {
  eventName: string;
  startsAt: string;
  venue: string | null;
  address: string | null;
  change: EventChangeDto;
  organization: Pick<PublicOrganizationDto, "name" | "whatsapp"> | null;
}): string {
  const t = eventChangeTexts.text;
  const kind = changeKind(change, startsAt);
  const lines: string[] = [];
  if (kind === "canceled") {
    lines.push(t.canceled(eventName, spokenDate(startsAt)));
    if (change.cancelReason !== null) {
      lines.push(t.reason(change.cancelReason));
    }
    lines.push(t.keepTicket);
  } else {
    lines.push(kind === "moved" ? t.moved(eventName, spokenDate(startsAt)) : t.postponed(eventName, spokenDate(startsAt)));
    const place = placeLine(venue, address);
    if (place !== null) {
      lines.push(t.place(place));
    }
    if (change.postponeReason !== null) {
      lines.push(t.reason(change.postponeReason));
    }
    lines.push(t.stillValid);
  }
  if (organization?.whatsapp != null) {
    lines.push("", t.contact(organization.name, displayPhone(organization.whatsapp)));
  }
  return lines.join("\n");
}
