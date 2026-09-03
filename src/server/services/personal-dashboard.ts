import { addDays, enumerateDays, localDateOf } from "../../shared/dates.js";
import type {
  DashboardRangeDays,
  EmotionLabel,
  PersonalDashboard,
  PersonalSignal,
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
  };
}
