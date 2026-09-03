import { addDays, isValidLocalDate } from "./dates.js";

export type PeriodType = "day" | "week";

export type ParsedPeriodKey =
  | { type: "day"; localDate: string }
  | { type: "week"; isoYear: number; isoWeek: number };

export type PeriodBoundaries = {
  type: PeriodType;
  fromLocalDate: string;
  toLocalDate: string;
};

const WEEK_KEY_PATTERN = /^week_(\d{4})-W(\d{2})$/;
const DAY_KEY_PREFIX = "day_";
const MS_PER_DAY = 24 * 60 * 60 * 1_000;

function toUtcMs(localDate: string): number {
  const [year, month, day] = localDate.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

/** ISO day of week: 1 = Monday … 7 = Sunday. */
function isoDayOfWeek(localDate: string): number {
  const day = new Date(toUtcMs(localDate)).getUTCDay();
  return day === 0 ? 7 : day;
}

function daysBetween(fromLocalDate: string, toLocalDate: string): number {
  return Math.round((toUtcMs(toLocalDate) - toUtcMs(fromLocalDate)) / MS_PER_DAY);
}

function week1Monday(isoYear: number): string {
  // January 4 is always inside ISO week 1.
  const jan4 = `${String(isoYear).padStart(4, "0")}-01-04`;
  return addDays(jan4, 1 - isoDayOfWeek(jan4));
}

export function isoWeekOf(localDate: string): { isoYear: number; isoWeek: number } {
  // The Thursday of a date's week determines which ISO year the week belongs to.
  const thursday = addDays(localDate, 4 - isoDayOfWeek(localDate));
  const isoYear = Number(thursday.slice(0, 4));
  const isoWeek = Math.floor(daysBetween(week1Monday(isoYear), thursday) / 7) + 1;
  return { isoYear, isoWeek };
}

export function isoWeeksInYear(isoYear: number): number {
  // December 28 is always inside the last ISO week of its year.
  return isoWeekOf(`${String(isoYear).padStart(4, "0")}-12-28`).isoWeek;
}

export function isoWeekStart(isoYear: number, isoWeek: number): string {
  return addDays(week1Monday(isoYear), (isoWeek - 1) * 7);
}

export function periodKeyFor(type: PeriodType, localDate: string): string {
  if (type === "day") return `${DAY_KEY_PREFIX}${localDate}`;
  const { isoYear, isoWeek } = isoWeekOf(localDate);
  return `week_${isoYear}-W${String(isoWeek).padStart(2, "0")}`;
}

export function parsePeriodKey(key: string): ParsedPeriodKey | null {
  if (key.startsWith(DAY_KEY_PREFIX)) {
    const localDate = key.slice(DAY_KEY_PREFIX.length);
    return isValidLocalDate(localDate) ? { type: "day", localDate } : null;
  }

  const weekMatch = WEEK_KEY_PATTERN.exec(key);
  if (weekMatch) {
    const isoYear = Number(weekMatch[1]);
    const isoWeek = Number(weekMatch[2]);
    if (isoWeek < 1 || isoWeek > isoWeeksInYear(isoYear)) return null;
    return { type: "week", isoYear, isoWeek };
  }

  return null;
}

export function periodBoundaries(key: string): PeriodBoundaries | null {
  const parsed = parsePeriodKey(key);
  if (!parsed) return null;
  if (parsed.type === "day") {
    return { type: "day", fromLocalDate: parsed.localDate, toLocalDate: parsed.localDate };
  }
  const fromLocalDate = isoWeekStart(parsed.isoYear, parsed.isoWeek);
  return { type: "week", fromLocalDate, toLocalDate: addDays(fromLocalDate, 6) };
}
