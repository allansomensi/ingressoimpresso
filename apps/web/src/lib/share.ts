/** Sharing links: WhatsApp, clipboard and CSV downloads. */

/**
 * A `wa.me` link: to `phone` when given (Brazilian numbers without the country code get 55), or
 * to the contact picker otherwise.
 */
export function whatsappUrl(text: string, phone?: string): string {
  let digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) {
    digits = `55${digits}`;
  }
  const target = digits.length >= 12 && digits.length <= 15 ? digits : "";
  return `https://wa.me/${target}?text=${encodeURIComponent(text)}`;
}

/** Copies text; `false` when the browser refuses. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * One CSV cell, quoted when needed (comma, quote or line break), as spreadsheets expect. Text
 * that starts like a formula (=, +, -, @) gets a leading ' so Excel and Sheets keep it as text
 * (negative amounts such as `-12,50` stay numbers).
 */
export function csvCell(value: string | number): string {
  const formula = typeof value === "string" && /^[=+\-@\t\r]/.test(value) && !/^-\d+(?:[.,]\d+)?$/.test(value);
  const text = formula ? `'${value}` : String(value);
  return /[",;\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Downloads rows as a CSV (UTF-8 with BOM, so Excel shows accents). */
export function downloadCsv(fileName: string, rows: readonly (readonly (string | number)[])[]): void {
  const body = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([`﻿${body}`], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 10_000);
}
