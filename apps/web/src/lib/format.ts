/** Display formats shared by the panel (pt-BR). */

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** `R$ 1.234,50` from centavos. */
export function money(cents: number): string {
  return currency.format(cents / 100);
}

/** `20 de nov. de 2026, 22:00`. */
export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short" });
}

/** `20/11/26 22:00`. */
export function shortDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/** Day of the month, short month and weekday of an event date. */
export function dateParts(iso: string): { day: string; month: string; weekday: string; time: string } {
  const date = new Date(iso);
  return {
    day: date.toLocaleDateString("pt-BR", { day: "2-digit" }),
    month: date.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
    weekday: date.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", ""),
    time: date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
  };
}

/** A ticket number padded like the printed ones. */
export function ticketNumber(number: number, digits = 4): string {
  return String(number).padStart(digits, "0");
}

/** Initials for an avatar: "João Silva" → "JS". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter((part) => part !== "");
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

/** A typed amount: `cents` is `null` when left blank; `ok: false` when it cannot be read. */
export type MoneyInput = { ok: true; cents: number | null } | { ok: false };

/**
 * Reads an amount typed in Brazilian or plain form: "30", "30,5", "1.234,56", "1.500" (a dot
 * before exactly three digits groups thousands) or "12.50" (a dot before one or two digits is the
 * decimal separator).
 */
export function parseMoney(text: string): MoneyInput {
  const clean = text.trim().replace(/^R\$/i, "").replace(/\s/g, "");
  if (clean === "") {
    return { ok: true, cents: null };
  }
  let normalized: string;
  if (/^\d{1,3}(\.\d{3})*(,\d{1,2})?$/.test(clean) || /^\d+(,\d{1,2})?$/.test(clean)) {
    normalized = clean.replace(/\./g, "").replace(",", ".");
  } else if (/^\d+(\.\d{1,2})?$/.test(clean)) {
    normalized = clean;
  } else {
    return { ok: false };
  }
  const cents = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(cents) && cents <= 2_147_483_647 ? { ok: true, cents } : { ok: false };
}
