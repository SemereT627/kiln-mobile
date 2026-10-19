/**
 * Ethiopian (Ethiopic) calendar utilities.
 *
 * Uses the `ethiopian-date` package for accurate GC <-> EC conversion.
 * Mirrors kiln-web's lib/ethiopian-calendar.ts.
 *
 *   ethiopianDate.toEthiopian(YYYY, MM, DD) -> [ethYear, ethMonth, ethDay]
 *   ethiopianDate.toGregorian(YYYY, MM, DD) -> [gcYear, gcMonth, gcDay]
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ethiopianDate = require("ethiopian-date");

export const ETH_MONTHS = [
  "Meskerem",
  "Tikimt",
  "Hidar",
  "Tahsas",
  "Tir",
  "Yekatit",
  "Megabit",
  "Miyazia",
  "Ginbot",
  "Sene",
  "Hamle",
  "Nehase",
  "Pagume",
] as const;

export type EthiopianDate = { year: number; month: number; day: number };

export function toEthiopian(date: Date): EthiopianDate {
  const [year, month, day]: [number, number, number] = ethiopianDate.toEthiopian(
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
  );
  return { year, month, day };
}

/** Local-midnight Gregorian Date for an Ethiopian calendar day. */
export function toGregorian({ year, month, day }: EthiopianDate): Date {
  const [gcYear, gcMonth, gcDay]: [number, number, number] = ethiopianDate.toGregorian(
    year,
    month,
    day,
  );
  return new Date(gcYear, gcMonth - 1, gcDay);
}

/** Number of days in a given Ethiopian month (Pagume is 5, or 6 in a leap year). */
export function daysInEthiopianMonth(ethYear: number, ethMonth: number): number {
  if (ethMonth !== 13) return 30;
  // Pagume has 6 days when the following Ethiopian year is a leap year,
  // i.e. when (ethYear + 1) % 4 === 0 (mirrors ethiopian-date's own leap rule).
  return (ethYear + 1) % 4 === 0 ? 6 : 5;
}

export function formatEthiopian(date: Date): string {
  const { year, month, day } = toEthiopian(date);
  const monthName = ETH_MONTHS[month - 1] ?? `Month ${month}`;
  return `${monthName} ${day}, ${year} E.C.`;
}
