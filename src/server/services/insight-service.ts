import { createHash, randomUUID } from "node:crypto";
import { addDays, localDateOf } from "../../shared/dates.js";
import { parsePeriodKey, periodBoundaries, periodKeyFor, type PeriodType } from "../../shared/periods.js";
import {
  emotionLabels,
  insightNarrativeSchema,
  type EmotionLabel,
  type JournalSession,
  type PersonalInsight,
  type PersonalSignal,
} from "../../shared/schemas.js";
import type { InsightRepository, InsightWrite } from "../data/insight-repository.js";
import type { JournalRepository } from "../data/journal-repository.js";
import type { PreferencesRepository } from "../data/preferences-repository.js";
import type { SignalRepository } from "../data/signal-repository.js";
import { AppError, notFound } from "../errors.js";
import type { InsightEvidence, InsightModel } from "./insight-model.js";
import type { UsageRecorder } from "./usage-recorder.js";

export const INSIGHT_PROMPT_VERSION = "insight-v1";
export const INSIGHT_DISCLAIMER =
  "These are patterns from your own reflections, not medical advice or a diagnosis.";

const MAX_SOURCE_SESSIONS = 50;
const MAX_EVIDENCE_CHARS = 700;
const SOURCE_QUERY_LIMIT = 200;
// Comfortably above the model's 20 second request timeout, and short enough that a lease left
// behind by a crashed instance frees itself quickly.
const GENERATION_LEASE_TTL_SECONDS = 60;

// A narrative that slips into diagnostic, clinical, or causal framing is rejected outright rather
// than edited, so nothing unsupported is ever stored.
const FORBIDDEN_NARRATIVE_TERMS = [
  /diagnos/i,
  /disorder\b/i,
  /clinical/i,
  /risk\s+score/i,
  /mental\s+illness/i,
  /\bdepression\b/i,
  /\banxiety disorder\b/i,
  // Causal claims: self-reported patterns can suggest, never prove, a mechanism.
  /\bcaus(?:e|es|ed|ing)\b/i,
  /\bproduc(?:es|ed)\s+(?:your|the|this|that|these|those|a|an)\b/i,
  /\bguarantee(?:s|d)?\b/i,
  /\bexplain(?:s|ed)\s+(?:why|your|the|this|that)\b/i,
  /\bbecause\s+of\s+(?:your|the|this|that)\b/i,
  /\bleads?\s+to\b/i,
];

type PeriodMetrics = PersonalInsight["metrics"];

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return round1(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function scoreValues(signals: PersonalSignal[], field: "moodScore" | "energyScore"): number[] {
  return signals
    .map((signal) => signal[field])
    .filter((score): score is 1 | 2 | 3 | 4 | 5 => score !== null);
}

export function computePeriodMetrics(
  sessionCount: number,
  signals: PersonalSignal[],
  previousSignals: PersonalSignal[],
): PeriodMetrics {
  const moodAverage = average(scoreValues(signals, "moodScore"));
  const energyAverage = average(scoreValues(signals, "energyScore"));
  const previousMood = average(scoreValues(previousSignals, "moodScore"));
  const previousEnergy = average(scoreValues(previousSignals, "energyScore"));

  const emotionCounts = Object.fromEntries(
    emotionLabels.map((label) => [label, 0]),
  ) as Record<EmotionLabel, number>;
  for (const signal of signals) {
    for (const emotion of signal.emotions) emotionCounts[emotion] += 1;
  }

  return {
    reflectionCount: sessionCount,
    checkinCount: signals.length,
    moodAverage,
    energyAverage,
    moodDeltaFromPrevious:
      moodAverage !== null && previousMood !== null ? round1(moodAverage - previousMood) : null,
    energyDeltaFromPrevious:
      energyAverage !== null && previousEnergy !== null
        ? round1(energyAverage - previousEnergy)
        : null,
    emotionCounts,
  };
}

// The fingerprint is a pure function of the source identities and their update stamps, so an
// unchanged period always produces the same value and a changed source always invalidates it.
export function computeSourceFingerprint(
  sessions: JournalSession[],
  signals: PersonalSignal[],
): string {
  const sessionFacts = sessions
    .map((session) => `${session.id}:${session.updatedAt}:${session.summarizedMessageCount}`)
    .sort();
  const signalFacts = signals
    .map((signal) => `${signal.sourceSessionId}:${signal.updatedAt}`)
    .sort();
  return createHash("sha256")
    .update(JSON.stringify({ sessionFacts, signalFacts }))
    .digest("hex");
}

function previousBoundaries(bounds: { type: PeriodType; fromLocalDate: string; toLocalDate: string }) {
  const spanDays = bounds.type === "day" ? 1 : 7;
  return {
    fromLocalDate: addDays(bounds.fromLocalDate, -spanDays),
    toLocalDate: addDays(bounds.fromLocalDate, -1),
  };
}

function topEmotions(metrics: PeriodMetrics): EmotionLabel[] {
  return (Object.entries(metrics.emotionCounts) as Array<[EmotionLabel, number]>)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([emotion]) => emotion);
}

function narrativeText(narrative: PersonalInsight["narrative"]): string {
  return [
    narrative.title,
    narrative.overview,
    ...narrative.patterns.map((pattern) => pattern.observation),
    ...narrative.highlights,
    ...narrative.nextSteps,
  ].join("\n");
}

export type InsightGenerationOutcome = {
  insight: PersonalInsight;
  outcome: "generated" | "reused" | "deterministic";
};

export class InsightService {
  constructor(
    private readonly insights: InsightRepository,
    private readonly signals: SignalRepository,
    private readonly journal: JournalRepository,
    private readonly preferences: PreferencesRepository,
    private readonly model: InsightModel,
    private readonly now: () => Date = () => new Date(),
    private readonly usage?: UsageRecorder,
    /** The configured model identifier stored with each generated insight. */
    private readonly modelName: string = "gemini",
  ) {}

  async list(uid: string, periodType: PeriodType, limit: number): Promise<PersonalInsight[]> {
    return this.insights.list(uid, periodType, limit);
  }

  async recent(uid: string): Promise<PersonalInsight[]> {
    const [days, weeks] = await Promise.all([
      this.insights.list(uid, "day", 1),
      this.insights.list(uid, "week", 1),
    ]);
    return [...days, ...weeks];
  }

  async delete(uid: string, periodKey: string): Promise<void> {
    if (!parsePeriodKey(periodKey)) {
      throw new AppError(400, "INVALID_REQUEST", "The request is invalid.");
    }
    const deleted = await this.insights.delete(uid, periodKey);
    if (!deleted) throw notFound();
  }

  async generate(
    uid: string,
    periodType: PeriodType,
    periodKey: string,
    requestId: string,
    regenerate: boolean,
  ): Promise<InsightGenerationOutcome> {
    const parsed = parsePeriodKey(periodKey);
    const bounds = periodBoundaries(periodKey);
    if (!parsed || !bounds || parsed.type !== periodType) {
      throw new AppError(400, "INVALID_REQUEST", "The request is invalid.");
    }

    const timezone = (await this.preferences.get(uid))?.timezone ?? "UTC";
    const today = localDateOf(this.now(), timezone);
    if (bounds.fromLocalDate > today) {
      throw new AppError(400, "INVALID_REQUEST", "The request is invalid.");
    }

    // A replay of an already completed request returns the stored result without touching the
    // lease, so idempotent retries never collide with an in-flight generation.
    const completed = await this.insights.get(uid, periodKey);
    if (completed && completed.generationRequestId === requestId) {
      return { insight: completed, outcome: "reused" };
    }

    // The lease lives in the shared repository, so it holds across server instances — an
    // in-process set would only guard one instance. It is scoped to user and period, acquired in
    // one short transaction, and never spans the model call itself.
    const holder = randomUUID();
    const nowMs = this.now().getTime();
    const acquired = await this.insights.acquireGenerationLease(uid, periodKey, {
      holder,
      nowIso: new Date(nowMs).toISOString(),
      expiresAtIso: new Date(nowMs + GENERATION_LEASE_TTL_SECONDS * 1_000).toISOString(),
    });
    if (!acquired) {
      throw new AppError(
        429,
        "GENERATION_IN_PROGRESS",
        "Another insight is still being created. Please wait for it to finish.",
      );
    }
    try {
      return await this.generateLocked(uid, periodKey, bounds, timezone, requestId, regenerate);
    } finally {
      try {
        await this.insights.releaseGenerationLease(uid, periodKey, holder);
      } catch {
        // The ttl reclaims an unreleased lease; a failed release must not mask the real outcome.
      }
    }
  }

  private async generateLocked(
    uid: string,
    periodKey: string,
    bounds: { type: PeriodType; fromLocalDate: string; toLocalDate: string },
    timezone: string,
    requestId: string,
    regenerate: boolean,
  ): Promise<InsightGenerationOutcome> {
    const sinceIso = new Date(
      Date.parse(`${bounds.fromLocalDate}T00:00:00.000Z`) - 36 * 60 * 60 * 1_000,
    ).toISOString();
    const candidateSessions = await this.journal.listSessionsCreatedSince(
      uid,
      sinceIso,
      SOURCE_QUERY_LIMIT,
    );
    const sessions = candidateSessions
      .filter((session) => {
        const local = localDateOf(new Date(session.createdAt), timezone);
        return local >= bounds.fromLocalDate && local <= bounds.toLocalDate;
      })
      .slice(0, MAX_SOURCE_SESSIONS);

    const previous = previousBoundaries(bounds);
    const [signals, previousSignals] = await Promise.all([
      this.signals.listRange(uid, bounds.fromLocalDate, bounds.toLocalDate, SOURCE_QUERY_LIMIT),
      this.signals.listRange(uid, previous.fromLocalDate, previous.toLocalDate, SOURCE_QUERY_LIMIT),
    ]);

    const metrics = computePeriodMetrics(sessions.length, signals, previousSignals);
    const fingerprint = computeSourceFingerprint(sessions, signals);

    const existing = await this.insights.get(uid, periodKey);
    if (existing) {
      // A repeated request id always returns the already stored result without a second model
      // call, and an unchanged source set is reused unless regeneration was explicitly requested.
      if (existing.generationRequestId === requestId) {
        return { insight: existing, outcome: "reused" };
      }
      if (
        !regenerate &&
        !existing.stale &&
        existing.sourceFingerprint === fingerprint &&
        existing.promptVersion === INSIGHT_PROMPT_VERSION
      ) {
        return { insight: existing, outcome: "reused" };
      }
    }

    const base: Omit<InsightWrite, "narrative" | "model"> = {
      periodType: bounds.type,
      periodKey,
      periodStart: bounds.fromLocalDate,
      periodEndExclusive: addDays(bounds.toLocalDate, 1),
      timezone,
      sourceSessionIds: sessions.map((session) => session.id),
      sourceSignalSessionIds: signals.map((signal) => signal.sourceSessionId),
      sourceFingerprint: fingerprint,
      metrics,
      generationRequestId: requestId,
      promptVersion: INSIGHT_PROMPT_VERSION,
      stale: false,
      createdBy: uid,
      scopeType: "personal",
      scopeId: uid,
      schemaVersion: 1,
    };

    if (sessions.length === 0 && signals.length === 0) {
      const insight = await this.insights.save(uid, {
        ...base,
        model: "deterministic",
        narrative: {
          title: bounds.type === "day" ? "A quiet day" : "A quiet week",
          overview:
            "No reflections or check-ins were recorded in this period, so there is nothing to summarize yet.",
          patterns: [],
          highlights: [],
          nextSteps: [],
          disclaimer: INSIGHT_DISCLAIMER,
        },
      });
      return { insight, outcome: "deterministic" };
    }

    const evidence = await this.loadEvidence(uid, sessions, timezone);
    const placeLabels = [
      ...new Set(
        signals
          .map((signal) => signal.location?.label)
          .filter((label): label is string => typeof label === "string"),
      ),
    ].slice(0, 10);

    let raw: unknown;
    try {
      raw = await this.model.generateNarrative({
        periodType: bounds.type,
        periodLabel: bounds.fromLocalDate,
        metrics,
        topEmotions: topEmotions(metrics),
        placeLabels,
        evidence,
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(502, "MODEL_UNAVAILABLE", "AI could not create this insight right now.");
    }

    const parsedNarrative = insightNarrativeSchema.safeParse(raw);
    if (!parsedNarrative.success) {
      throw new AppError(502, "INVALID_MODEL_RESPONSE", "AI returned an invalid response.");
    }

    // Every cited record must belong to the authorized source set for this exact period.
    const allowedIds = new Set([
      ...sessions.map((session) => session.id),
      ...signals.map((signal) => signal.sourceSessionId),
    ]);
    for (const pattern of parsedNarrative.data.patterns) {
      for (const citedId of pattern.evidenceSessionIds) {
        if (!allowedIds.has(citedId)) {
          throw new AppError(502, "INVALID_MODEL_RESPONSE", "AI returned an invalid response.");
        }
      }
    }

    const narrative: PersonalInsight["narrative"] = {
      ...parsedNarrative.data,
      disclaimer: INSIGHT_DISCLAIMER,
    };
    if (FORBIDDEN_NARRATIVE_TERMS.some((term) => term.test(narrativeText(narrative)))) {
      throw new AppError(502, "INVALID_MODEL_RESPONSE", "AI returned an invalid response.");
    }

    const insight = await this.insights.save(uid, {
      ...base,
      model: this.modelName,
      narrative,
    });
    await this.usage?.record("personalInsightsGenerated");
    return { insight, outcome: "generated" };
  }

  private async loadEvidence(
    uid: string,
    sessions: JournalSession[],
    timezone: string,
  ): Promise<InsightEvidence[]> {
    const evidence: InsightEvidence[] = [];
    for (const session of sessions) {
      const summary = await this.journal.getSummary(uid, session.id);
      let content: string;
      if (summary) {
        content = summary.summary;
      } else {
        const messages = await this.journal.listMessages(uid, session.id, 4);
        const firstUserMessage = messages.find((message) => message.role === "user");
        content = firstUserMessage ? firstUserMessage.content : "No written content.";
      }
      evidence.push({
        sessionId: session.id,
        localDate: localDateOf(new Date(session.createdAt), timezone),
        title: session.title,
        content: content.slice(0, MAX_EVIDENCE_CHARS),
      });
    }
    return evidence;
  }
}

export class InsightInvalidationService {
  constructor(
    private readonly insights: InsightRepository,
    private readonly preferences: PreferencesRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private keysFor(localDate: string): string[] {
    return [periodKeyFor("day", localDate), periodKeyFor("week", localDate)];
  }

  async onLocalDatesTouched(uid: string, localDates: string[]): Promise<void> {
    const keys = [...new Set(localDates.flatMap((localDate) => this.keysFor(localDate)))];
    if (keys.length > 0) await this.insights.markStale(uid, keys);
  }

  // The affected period is derived from the session's own creation instant, so editing an older
  // reflection invalidates the period that contains it rather than the current wall-clock period.
  async onContentChanged(uid: string, sessionCreatedAt: string): Promise<void> {
    const timezone = (await this.preferences.get(uid))?.timezone ?? "UTC";
    await this.onLocalDatesTouched(uid, [localDateOf(new Date(sessionCreatedAt), timezone)]);
  }

  async onSessionDeleted(uid: string, sessionId: string): Promise<void> {
    const citing = await this.insights.listCitingSession(uid, sessionId);
    if (citing.length > 0) {
      await this.insights.markStale(
        uid,
        citing.map((insight) => insight.periodKey),
      );
    }
  }
}
