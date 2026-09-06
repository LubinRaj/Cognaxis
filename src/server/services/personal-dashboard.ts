import { addDays, enumerateDays, localDateOf } from "../../shared/dates.js";
import { isoWeekOf, isoWeekStart } from "../../shared/periods.js";
import type {
  DashboardRangeDays,
  EmotionLabel,
  PersonalDashboard,
  PersonalSignal,
  ReflectionStreak,
  ReflectionStreakPeriod,
  ReflectionStreakUnit,
  ScoreDistribution,
  TrendPoint,
} from "../../shared/schemas.js";

export type { DashboardRangeDays, PersonalDashboard, ScoreDistribution, TrendPoint };

export type DashboardInput = {
  rangeDays: DashboardRangeDays;
  timezone: string;
  today: string;
  signals: PersonalSignal[];
  previousSignals: PersonalSignal[];
  sessionCreationTimes: string[];
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return round1(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function emptyDistribution(): ScoreDistribution {
  return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
}

function delta(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  return round1(current - previous);
}

function addMonths(monthStart: string, months: number): string {
  const [year, month] = monthStart.slice(0, 7).split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + months, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function monthStartOf(localDate: string): string {
  return `${localDate.slice(0, 7)}-01`;
}

function streakUnitFor(rangeDays: DashboardRangeDays): ReflectionStreakUnit {
  if (rangeDays === 7) return "day";
  if (rangeDays === 30) return "week";
  return "month";
}

function periodStartFor(unit: ReflectionStreakUnit, localDate: string): string {
  if (unit === "day") return localDate;
  if (unit === "month") return monthStartOf(localDate);
  const { isoYear, isoWeek } = isoWeekOf(localDate);
  return isoWeekStart(isoYear, isoWeek);
}

function periodEndFor(unit: ReflectionStreakUnit, start: string): string {
  if (unit === "day") return start;
  if (unit === "week") return addDays(start, 6);
  return addDays(addMonths(start, 1), -1);
}

function nextPeriodStart(unit: ReflectionStreakUnit, start: string): string {
  if (unit === "day") return addDays(start, 1);
  if (unit === "week") return addDays(start, 7);
  return addMonths(start, 1);
}

function computeReflectionStreak(
  sessionCreationTimes: string[],
  timezone: string,
  from: string,
  to: string,
  rangeDays: DashboardRangeDays,
): ReflectionStreak {
  const unit = streakUnitFor(rangeDays);
  const counts = new Map<string, number>();
  for (const createdAt of sessionCreationTimes) {
    const localDate = localDateOf(new Date(createdAt), timezone);
    if (localDate < from || localDate > to) continue;
    const periodStart = periodStartFor(unit, localDate);
    counts.set(periodStart, (counts.get(periodStart) ?? 0) + 1);
  }

  const currentStart = periodStartFor(unit, to);
  const periods: ReflectionStreakPeriod[] = [];
  for (let start = periodStartFor(unit, from); start <= currentStart; start = nextPeriodStart(unit, start)) {
    periods.push({
      start,
      end: periodEndFor(unit, start),
      reflectionCount: counts.get(start) ?? 0,
      isCurrent: start === currentStart,
    });
  }

  let current = 0;
  for (const period of [...periods].reverse()) {
    if (period.reflectionCount === 0) break;
    current += 1;
  }

  let longest = 0;
  let run = 0;
  for (const period of periods) {
    run = period.reflectionCount > 0 ? run + 1 : 0;
    longest = Math.max(longest, run);
  }

  return {
    unit,
    current,
    longest,
    activePeriods: periods.filter((period) => period.reflectionCount > 0).length,
    periods,
  };
}

// Every number here is a deterministic server-side calculation over the user's own explicit
// self-reports. Nothing is inferred, no gaps are filled, and no model is involved.
export function computeDashboard(input: DashboardInput): PersonalDashboard {
  const from = addDays(input.today, -(input.rangeDays - 1));
  const to = input.today;

  const moodScores = input.signals
    .map((signal) => signal.moodScore)
    .filter((score): score is 1 | 2 | 3 | 4 | 5 => score !== null);
  const energyScores = input.signals
    .map((signal) => signal.energyScore)
    .filter((score): score is 1 | 2 | 3 | 4 | 5 => score !== null);

  const moodDistribution = emptyDistribution();
  for (const score of moodScores) moodDistribution[score] += 1;
  const energyDistribution = emptyDistribution();
  for (const score of energyScores) energyDistribution[score] += 1;

  const emotionCounts = new Map<EmotionLabel, number>();
  for (const signal of input.signals) {
    for (const emotion of signal.emotions) {
      emotionCounts.set(emotion, (emotionCounts.get(emotion) ?? 0) + 1);
    }
  }
  const topEmotions = [...emotionCounts.entries()]
    .map(([emotion, count]) => ({ emotion, count }))
    .sort((a, b) => b.count - a.count || a.emotion.localeCompare(b.emotion))
    .slice(0, 5);

  const byDay = new Map<string, PersonalSignal[]>();
  for (const signal of input.signals) {
    const day = byDay.get(signal.localDate) ?? [];
    day.push(signal);
    byDay.set(signal.localDate, day);
  }
  const trend: TrendPoint[] = enumerateDays(from, to).map((date) => {
    const daySignals = byDay.get(date) ?? [];
    return {
      date,
      mood: average(
        daySignals
          .map((signal) => signal.moodScore)
          .filter((score): score is 1 | 2 | 3 | 4 | 5 => score !== null),
      ),
      energy: average(
        daySignals
          .map((signal) => signal.energyScore)
          .filter((score): score is 1 | 2 | 3 | 4 | 5 => score !== null),
      ),
    };
  });

  const reflectionCount = input.sessionCreationTimes.filter((createdAt) => {
    const localDate = localDateOf(new Date(createdAt), input.timezone);
    return localDate >= from && localDate <= to;
  }).length;
  const reflectionStreak = computeReflectionStreak(
    input.sessionCreationTimes,
    input.timezone,
    from,
    to,
    input.rangeDays,
  );

  const checkinCount = input.signals.length;
  const moodAverage = average(moodScores);
  const energyAverage = average(energyScores);
  const previousMood = average(
    input.previousSignals
      .map((signal) => signal.moodScore)
      .filter((score): score is 1 | 2 | 3 | 4 | 5 => score !== null),
  );
  const previousEnergy = average(
    input.previousSignals
      .map((signal) => signal.energyScore)
      .filter((score): score is 1 | 2 | 3 | 4 | 5 => score !== null),
  );

  return {
    rangeDays: input.rangeDays,
    from,
    to,
    timezone: input.timezone,
    reflectionCount,
    checkinCount,
    locatedCount: input.signals.filter((signal) => signal.location !== null).length,
    coverage:
      reflectionCount === 0 ? null : Math.round((checkinCount / reflectionCount) * 100) / 100,
    moodAverage,
    energyAverage,
    moodDeltaFromPrevious: delta(moodAverage, previousMood),
    energyDeltaFromPrevious: delta(energyAverage, previousEnergy),
    moodDistribution,
    energyDistribution,
    topEmotions,
    trend,
    hasEnoughForTrend: checkinCount >= 3,
    reflectionStreak,
  };
}
