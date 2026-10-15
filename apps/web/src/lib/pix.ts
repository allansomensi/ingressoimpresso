/**
 * Pix "copia e cola" (BR Code, ADR 0085): the EMV QR Code of the Banco Central do Brasil for a
 * static Pix with amount and identifier. Built on the device (the seller's page and the digital
 * ticket open offline); the platform never receives the money nor the payment.
 *
 * Layout (Manual de Padrões para Iniciação do Pix, BR Code): ID + two-digit length + value.
 */

import { categoryOf, type CategoryLike } from "@/lib/categories";

/** Where the money goes: the organization's (or the seller's) key, as the bank shows it. */
export interface PixTarget {
  /** The key, normalized by the API (CPF/CNPJ without punctuation, `+55…` phone, e-mail, EVP). */
  key: string;
  /** Who receives, as the payer's bank shows it (up to 25 characters). */
  name: string;
  /** City of who receives (up to 15 characters). */
  city: string;
}

/** A payment: the target, the amount and the identifier the bank statement shows. */
export interface PixCharge extends PixTarget {
  /** Amount in cents; 0 or `null` lets the payer type it. */
  amountCents: number | null;
  /** Identifier (`txid`): letters and digits, up to 25. */
  reference: string;
  /** Short text some banks show to the payer ("Ingresso 0042"). */
  description?: string;
}

const GUI = "br.gov.bcb.pix";
/** Field 26 (merchant account information) holds at most 99 characters. */
const MAX_ACCOUNT = 99;

/** One EMV field: id, two-digit length and value. */
function field(id: string, value: string): string {
  if (value.length > 99) {
    throw new RangeError(`Pix field ${id} is too long`);
  }
  return `${id}${String(value.length).padStart(2, "0")}${value}`;
}

/**
 * Text for the name, city and description fields: ASCII only (accents dropped, other symbols
 * removed), single spaces, cut to `max`. Banks render these fields in plain ASCII.
 */
export function pixText(text: string, max: number): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/[^A-Za-z0-9 .,\-/]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
}

/** CRC16-CCITT (polynomial 0x1021, initial 0xFFFF) as four uppercase hex digits. */
export function crc16(payload: string): string {
  let crc = 0xffff;
  for (let index = 0; index < payload.length; index += 1) {
    crc ^= payload.charCodeAt(index) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** The identifier as the BR Code takes it: letters and digits only, at most 25; `***` when empty. */
export function pixTxid(reference: string): string {
  const clean = reference.replace(/[^A-Za-z0-9]/g, "").slice(0, 25);
  return clean === "" ? "***" : clean;
}

/** The "copia e cola" text of a charge (also what its QR code encodes). */
export function brCode(charge: PixCharge): string {
  const name = pixText(charge.name, 25) || "RECEBEDOR";
  const city = pixText(charge.city, 15) || "BRASIL";
  const base = field("00", GUI) + field("01", charge.key);
  // The description only goes in when it fits the 99 characters of field 26.
  const room = MAX_ACCOUNT - base.length - 4;
  const description = charge.description === undefined ? "" : pixText(charge.description, Math.max(0, room));
  const account = description.length >= 4 ? base + field("02", description) : base;
  const amount = charge.amountCents !== null && charge.amountCents > 0 ? field("54", (charge.amountCents / 100).toFixed(2)) : "";
  const payload =
    field("00", "01") +
    field("26", account) +
    field("52", "0000") +
    field("53", "986") +
    amount +
    field("58", "BR") +
    field("59", name) +
    field("60", city) +
    field("62", field("05", pixTxid(charge.reference))) +
    "6304";
  return payload + crc16(payload);
}

/**
 * The identifier of a number's payment (ADR 0085): `ING` + the number + `E` + four characters of
 * the event, e.g. `ING0042EA3F9`. The organizer finds it in the bank statement; the panel shows
 * the same one beside each number.
 */
export function pixReference(eventId: string, number: number, digits = 4): string {
  const code = eventId.replace(/[^0-9a-fA-F]/g, "").slice(0, 4).toUpperCase();
  return `ING${String(number).padStart(Math.min(Math.max(digits, 1), 10), "0")}E${code}`;
}

/**
 * What a number costs: its category's price (which already falls back to the event's), else the
 * event's; `null` when there is none (the payer types the amount).
 */
export function numberPrice(
  categories: readonly (CategoryLike & { priceCents: number | null })[],
  eventPriceCents: number | null,
  number: number,
): number | null {
  const category = categoryOf(categories, number);
  return category === null ? eventPriceCents : category.priceCents;
}

/** Whether a text is a well-formed BR Code (length fields and CRC), to test what we generate. */
export function isValidBrCode(text: string): boolean {
  if (text.length < 8 || !text.startsWith("000201")) {
    return false;
  }
  const body = text.slice(0, -4);
  if (!body.endsWith("6304") || crc16(body) !== text.slice(-4)) {
    return false;
  }
  let index = 0;
  while (index < body.length - 4) {
    const length = Number(body.slice(index + 2, index + 4));
    if (!Number.isInteger(length)) {
      return false;
    }
    index += 4 + length;
  }
  return index === body.length - 4;
}
