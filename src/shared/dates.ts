const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidTimeZone(timeZone: string): boolean {
  if (timeZone.length === 0 || timeZone.length > 100) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

// en-CA produces YYYY-MM-DD directly, so the formatter output is the local date key.
export function localDateOf(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

export function isValidLocalDate(value: string): boolean {
  if (!LOCAL_DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
}

export function addDays(localDate: string, days: number): string {
  const [year, month, day] = localDate.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  const paddedMonth = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const paddedDay = String(shifted.getUTCDate()).padStart(2, "0");
  return `${shifted.getUTCFullYear()}-${paddedMonth}-${paddedDay}`;
}

export function enumerateDays(fromLocalDate: string, toLocalDateInclusive: string): string[] {
  const days: string[] = [];
  let cursor = fromLocalDate;
  while (cursor <= toLocalDateInclusive) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
}
