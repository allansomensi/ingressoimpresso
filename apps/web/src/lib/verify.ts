/** The public check of a ticket (ADR 0075): what the page does with what it reads. */

import type { VerifyVerdict } from "@ingressoimpresso/api-types";

/** What the paste box holds: a QR text to check, the link of a digital ticket, or another link. */
export type PastedKind = "empty" | "qr" | "ticket-link" | "link";

/** Longest text sent to the API (a v1 QR has about 111 characters; the API ignores longer ones). */
export const MAX_QR_TEXT = 512;

/** Tells a QR text from a link pasted by mistake. */
export function classifyPasted(raw: string): PastedKind {
  const text = raw.trim();
  if (text === "") {
    return "empty";
  }
  if (/^(?:https?:\/\/|www\.)/i.test(text)) {
    return /\/ingresso\/?#/i.test(text) ? "ticket-link" : "link";
  }
  return "qr";
}

/**
 * The first text the camera read that is worth checking (it may see several codes at once), as
 * read: a space is a base45 character, so nothing is trimmed.
 */
export function pickScanned(texts: readonly string[]): string | null {
  return texts.find((text) => text.trim() !== "" && text.length <= MAX_QR_TEXT) ?? null;
}

/** A pasted text, ready to send: line breaks out (the server also tries it trimmed). */
export function pastedQr(raw: string): string {
  return raw.replace(/[\r\n\t]+/g, "");
}

/** How a verdict looks: good, attention, bad, or nothing to say. */
export type VerdictTone = "success" | "warning" | "danger" | "neutral";

export function verdictTone(verdict: VerifyVerdict): VerdictTone {
  switch (verdict) {
    case "valid":
      return "success";
    case "event_postponed":
      return "warning";
    case "private":
      return "neutral";
    case "credential":
      return "warning";
    case "event_over":
    case "event_canceled":
    case "ticket_canceled":
    case "not_ours":
      return "danger";
  }
}

/** Whether the QR was one of ours (signature verified), whatever the event's state. */
export function isAuthentic(verdict: VerifyVerdict): boolean {
  return verdict !== "not_ours" && verdict !== "private" && verdict !== "credential";
}
