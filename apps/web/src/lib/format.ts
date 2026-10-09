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

/** Parses a typed amount ("30", "30,50", "1.234,50") into centavos; `null` when blank or invalid. */
export function parseMoney(text: string): number | null {
  const clean = text.trim().replace(/[R$\s]/g, "");
  if (clean === "") {
    return null;
  }
  const normalized = clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean;
  const value = Number(normalized);
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : null;
}
