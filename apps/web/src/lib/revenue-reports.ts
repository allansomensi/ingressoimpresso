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
];

/** `YYYY-MM` of a moment in Brasília time (UTC−3, no daylight saving since 2019). */
export function brasiliaMonth(at: Date): string {
  const local = new Date(at.getTime() - 3 * 3_600_000);
  return `${String(local.getUTCFullYear())}-${String(local.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** This month and the `count - 1` before it, newest first (`YYYY-MM`). */
export function recentMonths(now: Date, count: number): string[] {
  const [year = 0, month = 1] = brasiliaMonth(now).split("-").map(Number);
  return Array.from({ length: count }, (_, index) => {
    const total = year * 12 + (month - 1) - index;
    return `${String(Math.floor(total / 12))}-${String((total % 12) + 1).padStart(2, "0")}`;
  });
}

/** `outubro de 2026`. */
export function monthName(month: string): string {
  const [year = "", number = "1"] = month.split("-");
  return `${MONTHS[Number(number) - 1] ?? ""} de ${year}`;
}

/** `out/26`. */
export function shortMonth(month: string): string {
  const [year = "", number = "1"] = month.split("-");
  return `${(MONTHS[Number(number) - 1] ?? "").slice(0, 3)}/${year.slice(2)}`;
}

/** How strong a cell of the cohort table is, 0 (nothing) to 4 (the largest value). */
export function heatLevel(cents: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (cents <= 0 || max <= 0) {
    return 0;
  }
  return Math.min(4, Math.max(1, Math.ceil((cents / max) * 4))) as
    | 1
    | 2
    | 3
    | 4;
}
