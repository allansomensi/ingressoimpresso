/**
 * Certificates of participation (ADR 0113): the fields of the text, as the server fills them
 * (`crates/render/src/certificate.rs`, `fill_certificate`), for the panel's live preview. Both are
 * tested with the same examples.
 */

import { dayList } from "@/lib/ticket-fields";

/** Fields of a certificate's text, without braces. */
export const CERTIFICATE_FIELDS = ["nome", "evento", "data", "dias", "local", "organizacao", "carga"] as const;

export interface CertificateFields {
  name: string;
  event: string;
  /** Start of each day, in the event's wall-clock time (`YYYY-MM-DDTHH:mm`); one for one day. */
  days: readonly string[];
  venue: string | null;
  organization: string | null;
  workload: string | null;
}

export interface CertificateSegment {
  text: string;
  strong: boolean;
}

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** "21 de novembro de 2026" from a wall-clock `YYYY-MM-DD…`. */
function longDate(local: string): string {
  const [year, month, day] = local.slice(0, 10).split("-").map(Number);
  return `${String(day ?? "")} de ${MONTHS[(month ?? 1) - 1] ?? ""} de ${String(year ?? "")}`;
}

/** The text with its fields filled; `{nome}` comes as its own bold segment. */
export function fillCertificate(text: string, fields: CertificateFields): CertificateSegment[] {
  const segments: CertificateSegment[] = [];
  let plain = "";
  let rest = text;
  for (let open = rest.indexOf("{"); open !== -1; open = rest.indexOf("{")) {
    plain += rest.slice(0, open);
    const close = rest.indexOf("}", open);
    const name = close === -1 ? "" : rest.slice(open + 1, close);
    if (!(CERTIFICATE_FIELDS as readonly string[]).includes(name)) {
      plain += "{";
      rest = rest.slice(open + 1);
      continue;
    }
    rest = rest.slice(close + 1);
    if (name === "nome") {
      if (plain !== "") {
        segments.push({ text: plain, strong: false });
        plain = "";
      }
      segments.push({ text: fields.name.trim(), strong: true });
      continue;
    }
    const value =
      name === "evento"
        ? fields.event
        : name === "data"
          ? fields.days[0] === undefined
            ? ""
            : longDate(fields.days[0])
          : name === "dias"
            ? dayList(fields.days)
            : name === "local"
              ? (fields.venue ?? "")
              : name === "organizacao"
                ? (fields.organization ?? "")
                : (fields.workload ?? "");
    plain += value.trim();
  }
  plain += rest;
  if (plain !== "") {
    segments.push({ text: plain, strong: false });
  }
  return segments;
}
