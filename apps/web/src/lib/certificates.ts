/**
 * Certificates of participation (ADRs 0113, 0114): the fields of the texts, as the server fills
 * them (`crates/render/src/certificate.rs`, `fill_certificate`), for the panel's live preview. Both
 * are tested with the same examples.
 */

import { dayList } from "@/lib/ticket-fields";

/** Fields of a certificate's texts, without braces. */
export const CERTIFICATE_FIELDS = ["nome", "evento", "data", "dias", "local", "organizacao", "carga", "codigo"] as const;

export interface CertificateFields {
  name: string;
  event: string;
  /** Start of each day, in the event's wall-clock time (`YYYY-MM-DDTHH:mm`); one for one day. */
  days: readonly string[];
  venue: string | null;
  organization: string | null;
  workload: string | null;
  /** "CERT-0007". */
  code: string | null;
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

function fieldValue(name: string, fields: CertificateFields): string {
  switch (name) {
    case "nome":
      return fields.name.trim();
    case "evento":
      return fields.event.trim();
    case "data":
      return fields.days[0] === undefined ? "" : longDate(fields.days[0]);
    case "dias":
      return dayList(fields.days).trim();
    case "local":
      return (fields.venue ?? "").trim();
    case "organizacao":
      return (fields.organization ?? "").trim();
    case "carga":
      return (fields.workload ?? "").trim();
    case "codigo":
      return (fields.code ?? "").trim();
    default:
      return "";
  }
}

/**
 * The text with its fields filled; `{nome}` comes as its own bold segment. A text whose fields
 * are all empty ("Carga horária: {carga}" without a workload) gives no segments: it is not printed.
 */
export function fillCertificate(text: string, fields: CertificateFields): CertificateSegment[] {
  const segments: CertificateSegment[] = [];
  let plain = "";
  let rest = text;
  let found = 0;
  let filled = 0;
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
    const value = fieldValue(name, fields);
    found += 1;
    if (value !== "") {
      filled += 1;
    }
    if (name === "nome") {
      if (plain !== "") {
        segments.push({ text: plain, strong: false });
        plain = "";
      }
      segments.push({ text: value, strong: true });
      continue;
    }
    plain += value;
  }
  plain += rest;
  if (found > 0 && filled === 0) {
    return [];
  }
  if (plain !== "") {
    segments.push({ text: plain, strong: false });
  }
  return segments;
}

/** The filled text as one string (seals, labels). */
export function fillCertificateText(text: string, fields: CertificateFields): string {
  return fillCertificate(text, fields)
    .map((segment) => segment.text)
    .join("");
}
