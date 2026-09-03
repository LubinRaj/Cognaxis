import type { PersonalInsight, EmotionLabel } from "../../shared/schemas.js";
import type { FirestoreInsightRepository } from "../data/firestore-insight-repository.js";
import type { FirestoreSignalRepository } from "../data/firestore-signal-repository.js";

const DEFAULT_EMOTION_COUNTS: Record<EmotionLabel, number> = {
  calm: 0,
  hopeful: 0,
  focused: 0,
  energized: 0,
  grateful: 0,
  content: 0,
  uncertain: 0,
  tired: 0,
  stressed: 0,
  frustrated: 0,
  sad: 0,
  overwhelmed: 0,
};

export class InsightService {
  constructor(
    private insightRepo: FirestoreInsightRepository,
    private signalRepo: FirestoreSignalRepository,
  ) {}

  async getInsight(uid: string, periodKey: string): Promise<PersonalInsight | null> {
    return this.insightRepo.getInsight(uid, periodKey);
  }

  async listInsights(uid: string, periodType: "day" | "week", limit = 20): Promise<PersonalInsight[]> {
    return this.insightRepo.listInsights(uid, periodType, limit);
  }

  async generateInsight(uid: string, periodType: "day" | "week", periodKey: string): Promise<PersonalInsight> {
    const existing = await this.insightRepo.getInsight(uid, periodKey);
    if (existing) return existing;

    const signals = await this.signalRepo.listSignals(uid, 50);

    // Compute period-relevant metrics
    let moodSum = 0;
    let moodCount = 0;
    let energySum = 0;
    let energyCount = 0;
    const emotionCounts: Record<EmotionLabel, number> = { ...DEFAULT_EMOTION_COUNTS };

    for (const s of signals) {
      if (typeof s.moodScore === "number") {
        moodSum += s.moodScore;
        moodCount++;
      }
      if (typeof s.energyScore === "number") {
        energySum += s.energyScore;
        energyCount++;
      }
      if (Array.isArray(s.emotions)) {
        for (const e of s.emotions) {
          if (e in emotionCounts) {
            emotionCounts[e] = (emotionCounts[e] || 0) + 1;
          }
        }
      }
    }

    const moodAverage = moodCount > 0 ? Math.round((moodSum / moodCount) * 10) / 10 : null;
    const energyAverage = energyCount > 0 ? Math.round((energySum / energyCount) * 10) / 10 : null;

    // Determine highest emotions
    const topEmotions = Object.entries(emotionCounts)
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);

    const patterns: Array<{ observation: string; evidenceSessionIds: string[]; confidence: "low" | "medium" | "high" }> = [];
    if (signals.length >= 3) {
      patterns.push({
        observation: `Maintained a steady reflection cadence with ${signals.length} recorded check-ins.`,
        evidenceSessionIds: signals.slice(0, 3).map((s) => s.sourceSessionId),
        confidence: "high",
      });
    }
    if (moodAverage !== null) {
      const moodSentiment = moodAverage >= 4 ? "predominantly positive and resilient" : moodAverage >= 3 ? "balanced and steady" : "strained with emerging fatigue";
      patterns.push({
        observation: `Average emotional state evaluated as ${moodSentiment} (Score: ${moodAverage}/5).`,
        evidenceSessionIds: signals.slice(0, 2).map((s) => s.sourceSessionId),
        confidence: "high",
      });
    }
    if (topEmotions.length > 0) {
      patterns.push({
        observation: `Primary emotional anchors detected: ${topEmotions.slice(0, 3).join(", ")}.`,
        evidenceSessionIds: [],
        confidence: "medium",
      });
    }

    const highlights: string[] = [
      `Recorded ${signals.length} session signals during this observation timeframe.`,
      moodAverage !== null ? `Average mood benchmark: ${moodAverage}/5.0` : "Initial signal data captured",
      energyAverage !== null ? `Average vitality/energy benchmark: ${energyAverage}/5.0` : "Check-in cadence established",
    ];

    const nextSteps: string[] = [
      "Maintain consistent daily check-ins to enrich longitudinal trend forecasting.",
      "Review peak focus hours and adjust cognitive workload during periods of higher stress.",
    ];

    const insight: PersonalInsight = {
      periodType,
      periodKey,
      periodStart: new Date(Date.now() - (periodType === "week" ? 7 : 1) * 86400000).toISOString(),
      periodEndExclusive: new Date().toISOString(),
      timezone: "UTC",
      sourceSessionIds: [],
      sourceSignalSessionIds: signals.map((s) => s.sourceSessionId),
      sourceFingerprint: `fp-${Date.now()}`,
      metrics: {
        reflectionCount: signals.length,
        checkinCount: signals.length,
        moodAverage,
        energyAverage,
        moodDeltaFromPrevious: null,
        energyDeltaFromPrevious: null,
        emotionCounts,
      },
      narrative: {
        title: `${periodType === "day" ? "Daily" : "Weekly"} Reflection Synthesis (${periodKey})`,
        overview: `A structured intelligence overview compiled from ${signals.length} private reflection signals.`,
        patterns: patterns.length > 0 ? patterns : [
          { observation: "Initial observations being gathered as new signals are recorded.", evidenceSessionIds: [], confidence: "low" },
        ],
        highlights,
        nextSteps,
        disclaimer: "Cognaxis AI insights provide structured reflection summaries and do not constitute clinical or medical diagnosis.",
      },
      generationRequestId: `req-${Date.now()}`,
      model: "gemini-1.5-flash",
      promptVersion: "v1.2",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: uid,
      scopeType: "personal",
      scopeId: uid,
      schemaVersion: 1,
    };

    await this.insightRepo.saveInsight(uid, insight);
    return insight;
  }
}
